// Amethyst Web Wallet: page logic. walletd runs in walletd-worker.js, wallet workers in walletworker-main.js.
'use strict';
const $ = (id) => document.getElementById(id);
const STORE_KEY = 'bcn-light-wallet-file';
const MNEMONIC_PASSWORD_KEY = 'aww-has-mnemonic-password';  // only a flag, never the passphrase
const ATOMIC = 1e8;
let worker, nextId = 1, pending = new Map(), pollTimer = null, startHeight = null;
let nodeHeight = 0;  // the chosen node's height when the page started (see refresh)
let activeNode = null;  // the node walletd syncs from

function log(text) {
  const el = $('log');
  el.textContent += String(text).replace(/\x1b\[[0-9;]*m/g, '') + '\n';  // walletd colours its log with ANSI codes
  if (el.textContent.length > 40000) el.textContent = el.textContent.slice(-30000);
}
function show(id) { for (const s of ['setup', 'newwords', 'setpin', 'unlock', 'wallet']) $(s).classList.toggle('hidden', s !== id); }
function fmt(atomic) {
  const v = Number(atomic || 0) / ATOMIC;
  return v.toLocaleString(LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 8 });
}
function post(msg) {
  return new Promise((resolve, reject) => {
    if (!worker) return reject(new Error('the wallet engine is not running in this browser'));
    const id = nextId++;
    pending.set(id, { resolve, reject });
    worker.postMessage(Object.assign({ id }, msg));
  });
}
// exact: keep integers of 16+ digits (amounts can exceed 2^53) as marker strings, see parseExact.
async function rpc(method, params, exact) {
  const r = await post({ body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params: params || {} }) });
  if (r.error) throw new Error(r.error);
  if (r.status !== 200) throw new Error('HTTP ' + r.status + ' ' + (r.body || ''));
  const j = exact ? parseExact(r.body) : JSON.parse(r.body);
  if (j.error) {
    const err = new Error(j.error.message || JSON.stringify(j.error));
    err.code = j.error.code;
    throw err;
  }
  return j.result;
}

// Pool of wallet workers (walletworker-main.js), one per CPU core, run by the page on walletd's behalf:
// walletd posts pool_start / pool_call / pool_stop, results go back as pool_result.
let pool = { id: 0, workers: [] };
function poolMessage(m) {
  if (m.op === 'pool_start') {
    pool.workers.forEach((w) => w.terminate());
    pool = { id: m.id, workers: [] };
    for (let i = 0; i < m.count; i++) {
      const w = new Worker('walletworker-main.js' + (LEGACY ? '?legacy=1' : ''));
      const id = m.id;
      w.onmessage = (e) => {
        if (e.data.log !== undefined) return log(e.data.log);
        const r = e.data.result;
        worker.postMessage({ op: 'pool_result', id, tx: w.pendingTx.shift(), data: r }, [r.buffer]);
      };
      w.onerror = (e) => log('walletworker error: ' + e.message);
      w.pendingTx = [];
      pool.workers.push(w);
    }
  } else if (m.op === 'pool_call' && m.id === pool.id) {
    const w = pool.workers[m.worker];
    w.pendingTx.push(m.tx);
    w.postMessage({ tx: m.tx, data: m.data }, [m.data.buffer]);
  } else if (m.op === 'pool_stop' && m.id === pool.id) {
    pool.workers.forEach((w) => w.terminate());
    pool = { id: 0, workers: [] };
  }
}

// ---- Node: this site's proxy or a public node with CORS, checked before walletd starts ----
const NODE_KEY = 'bcn-light-wallet-node';  // "auto", "self" or a node address
// The community node first; the original developers' nodes stay as fallbacks.
const PUBLIC_NODES = ['https://node.bytecoin.community:443', 'https://node01.bytecoin.org:8091', 'https://node02.bytecoin.org:8091'];

// User input → address walletd accepts: "https://host:port" (port is required), "host:port" for plain http
// (local nodes only). Returns null for anything else.
function normalizeNode(text) {
  let u;
  try { u = new URL(text.trim()); } catch (err) { return null; }
  if (u.username || u.password || (u.pathname !== '/' && u.pathname !== '') || u.search || u.hash) return null;
  const local = /^(localhost|127(\.\d+){3}|\[::1\])$/.test(u.hostname);
  if (u.protocol === 'https:') return 'https://' + u.hostname + ':' + (u.port || '443');
  if (u.protocol === 'http:' && local) return u.hostname + ':' + (u.port || '80');
  return null;
}
function nodeBase(node) { return node === 'self' ? location.origin : node.startsWith('https://') ? node : 'http://' + node; }
function nodeLabel(node) { return node === 'self' ? location.host + ' ' + t('node.proxy') : node; }

// Height the node reports, or 0 if it does not answer get_status within the timeout (or blocks CORS).
async function probeNode(node, timeoutMs) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs || 10000);  // TLS + CORS preflight on a phone can be slow
  try {
    const r = await fetch(nodeBase(node) + '/json_rpc', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctl.signal, cache: 'no-store',
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'get_status', params: {} }),
    });
    if (!r.ok) return 0;
    const j = await r.json();
    return (j.result && j.result.top_known_block_height) || 0;
  } catch (err) {
    return 0;
  } finally {
    clearTimeout(timer);
  }
}

// "auto": first node in order this site → node.bytecoin.community → node01 → node02 (all checked at once) that answers and is not
// behind the others by more than a few blocks, so a stalled node is skipped.
async function chooseNode() {
  const pref = localStorage.getItem(NODE_KEY) || 'auto';
  if (pref !== 'auto') {
    const h = await probeNode(pref);
    await I18N_READY;  // messages below are translated
    if (!h) $('node-msg').textContent = t('node.selected_down');
    return { node: pref, note: 'node.note_manual', height: h };
  }
  const candidates = ['self'].concat(PUBLIC_NODES);
  const heights = await Promise.all(candidates.map((n) => probeNode(n)));
  candidates.forEach((n, k) => log('node ' + nodeLabel(n) + ': ' + (heights[k] ? 'height ' + heights[k] : 'no answer')));
  await I18N_READY;
  const best = Math.max.apply(null, heights);
  const i = best > 0 ? heights.findIndex((h) => h > 0 && h >= best - 10) : -1;
  if (i < 0) {
    $('node-msg').textContent = t('node.none');
    return { node: 'self', note: 'node.note_auto_none' };
  }
  return { node: candidates[i], note: 'node.note_auto', height: heights[i] };
}

function showNodeSettings() {
  const pref = localStorage.getItem(NODE_KEY) || 'auto';
  const known = Array.from($('node-sel').options).some((o) => o.value === pref);
  $('node-sel').value = known ? pref : 'custom';
  $('node-custom').value = known ? '' : pref;
  $('node-custom').classList.toggle('hidden', $('node-sel').value !== 'custom');
}
$('node-sel').onchange = () => $('node-custom').classList.toggle('hidden', $('node-sel').value !== 'custom');
$('btn-node').onclick = async () => {
  let pref = $('node-sel').value;
  if (pref === 'custom') {
    pref = normalizeNode($('node-custom').value);
    if (!pref) return ($('node-msg').textContent = t('node.bad_address'));
  }
  if (pref !== 'auto' && pref !== 'self') {
    $('node-msg').textContent = t('node.checking');
    if (!(await probeNode(pref))) return ($('node-msg').textContent = t('node.no_answer'));
  }
  if (!$('wallet').classList.contains('hidden') && !confirm(t('node.confirm_lock'))) return;
  localStorage.setItem(NODE_KEY, pref);
  location.reload();
};

// walletd.wasm is built with -fwasm-exceptions, which older browsers (SeaMonkey, Firefox < 100, Chrome < 95,
// Safari < 15.2) cannot compile. They get the legacy/ build instead: same code, C++ exceptions done in JS, slower.
// This tiny module (one type, one tag) is valid only where WebAssembly exception handling exists.
const HAS_WASM = typeof WebAssembly === 'object';
const WASM_EH = (function () {
  try {
    return HAS_WASM && WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 4, 1, 96, 0, 0, 13, 3, 1, 0, 0]));
  } catch (e) { return false; }
})();
// ?engine=legacy forces the legacy build in any browser; ?engine=normal forces the normal one (for testing)
const ENGINE = (/[?&]engine=(legacy|normal)(&|$)/.exec(location.search) || [])[1];
const LEGACY = HAS_WASM && (ENGINE ? ENGINE === 'legacy' : !WASM_EH) ? '&legacy=1' : '';

// The engine pill and the node line are re-rendered when the language changes.
let engineKey = 'loading', nodeChoice = null;
function setEngine(key) {
  engineKey = key;
  $('engine').textContent = key === 'ok' ? 'walletd.wasm' : t('engine.' + key);
  $('engine').classList.toggle('ok', key === 'ok');
}
function renderNodeCur() {
  $('node-cur').textContent = nodeChoice ? nodeLabel(nodeChoice.node) + ' · ' + t(nodeChoice.note) : t('node.searching');
}
function startWorker(choice) {
  nodeChoice = choice;
  renderNodeCur();
  if (!HAS_WASM) {
    setEngine('unsupported');
    $('old-browser').classList.remove('hidden');
    log('This browser has no WebAssembly; the wallet engine cannot start.');
    return;
  }
  if (LEGACY) log(ENGINE === 'legacy' ? 'Legacy engine forced by ?engine=legacy.'
    : 'This browser has no WebAssembly exception handling: using the slower legacy engine.');
  nodeHeight = choice.height || 0;
  activeNode = choice.node;
  worker = new Worker('walletd-worker.js?node=' + encodeURIComponent(choice.node) + LEGACY);
  worker.onmessage = (e) => {
    const m = e.data;
    if (m.op && m.op.startsWith('pool_')) return poolMessage(m);
    if (m.log !== undefined) return log(m.log);
    if (m.ready) { setEngine('ok'); log('node: ' + m.node); return onReady(); }
    const p = pending.get(m.id);
    if (p) { pending.delete(m.id); p.resolve(m); }
  };
  worker.onerror = (e) => { setEngine('error'); log('worker error: ' + e.message); };
}

const ADDR_KEY = 'bcn-light-wallet-address';  // public address only, shown on the lock screen
const MIN_PIN = 6;
const WRONG_PIN = 207;  // api::WALLET_FILE_DECRYPT_ERROR

// The PIN itself is never stored. While the wallet is open the page keeps a salted SHA-256 of it in memory,
// only to re-ask the PIN before showing the mnemonic.
let pinCheck = null;
async function pinDigest(pin, salt) {
  const data = new TextEncoder().encode(salt + '\u0000' + pin);
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', data))).join(',');
}
async function rememberPin(pin) {
  const salt = crypto.getRandomValues(new Uint32Array(4)).join('-');
  pinCheck = { salt, digest: await pinDigest(pin, salt) };
}
async function pinMatches(pin) { return pinCheck !== null && (await pinDigest(pin, pinCheck.salt)) === pinCheck.digest; }

// Ask the browser to keep this site's storage (the wallet) when the device runs short of space.
// Chrome and Safari decide silently (Chrome grants it later, e.g. once the app is installed, so ask on every open);
// Firefox asks the user and remembers the answer.
let storageAsked = false;
async function keepStorage() {
  try {
    if (storageAsked || !navigator.storage || !navigator.storage.persist || await navigator.storage.persisted()) return;
    storageAsked = true;
    log('persistent storage: ' + (await navigator.storage.persist() ? 'granted' : 'not granted'));
  } catch (e) { /* private mode or no StorageManager */ }
}

function onReady() {
  if (!localStorage.getItem(STORE_KEY)) return show('setup');
  showUnlock();
}
function showUnlock() {
  $('unlock-addr').textContent = localStorage.getItem(ADDR_KEY) || '';
  $('pin-unlock').value = '';
  $('unlock-msg').textContent = '';
  show('unlock');
  $('pin-unlock').focus();
}
$('btn-unlock').onclick = async () => {
  const pin = $('pin-unlock').value;
  if (!pin) return;
  $('btn-unlock').disabled = true;
  $('unlock-msg').textContent = '';
  try {
    await rpc('ext_open_wallet', { wallet_file: localStorage.getItem(STORE_KEY), wallet_password: pin });
    await rememberPin(pin);
    openWallet();
    keepStorage();
  } catch (err) {
    $('unlock-msg').textContent = err.code === WRONG_PIN ? t('pin.wrong') : t('unlock.failed', { error: err.message });
  } finally {
    $('btn-unlock').disabled = false;
    $('pin-unlock').value = '';
  }
};
$('pin-unlock').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btn-unlock').click(); });

// New or restored wallet: words first, then a PIN, then ext_create_wallet encrypts and saves it.
let pendingCreate = null;
let newMnemonic = null;
$('btn-new').onclick = async () => {
  newMnemonic = (await post({ op: 'create_mnemonic' })).result;
  $('words').textContent = newMnemonic;
  show('newwords');
};
$('btn-words-ok').onclick = () => {
  pendingCreate = { mnemonic: newMnemonic, creation_timestamp: Math.floor(Date.now() / 1000) };
  newMnemonic = null;
  $('words').textContent = '';
  askPin();
};
$('btn-restore-show').onclick = () => $('restore').classList.toggle('hidden');
// restore.full_scan: measured on node.bytecoin.community, 0.8–1.9 KB per block, ≈1.94 million blocks since the
// amethyst upgrade, so about 2–3 GB.
// Optional creation date: scan from one day before it (time zones, clock skew); 0 = whole chain, -1 = bad date.
function dateField(id) {
  const day = $(id).value;
  if (!day) return 0;
  const since = Math.floor(Date.parse(day + 'T00:00:00Z') / 1000) - 86400;
  return since > 0 && since * 1000 <= Date.now() ? since : -1;
}
$('btn-restore').onclick = async () => {
  const since = dateField('restore-date');
  if (since < 0) return alert(t('restore.bad_date'));
  const words = (await post({ op: 'check_mnemonic', mnemonic: $('restore-words').value.trim() })).result;
  if (!words) return alert(t('restore.bad_phrase'));
  if (!since && !confirm(t('restore.no_date') + ' ' + t('restore.full_scan') + '\n\n' + t('restore.confirm_full'))) return;
  $('restore-words').value = $('restore-date').value = '';
  pendingCreate = { mnemonic: words, creation_timestamp: since };
  askPin();
};
function askPin() {
  $('pin1').value = $('pin2').value = '';
  $('setpin-msg').textContent = '';
  show('setpin');
  $('pin1').focus();
}
function checkNewPin(a, b) {
  if (a.length < MIN_PIN) return t('pin.short', { n: MIN_PIN });
  if (a !== b) return t('pin.mismatch');
  return '';
}
$('btn-pin-set').onclick = async () => {
  const pin = $('pin1').value, problem = checkNewPin(pin, $('pin2').value);
  if (problem) return ($('setpin-msg').textContent = problem);
  $('btn-pin-set').disabled = true;
  try {
    const r = await rpc('ext_create_wallet', Object.assign({ mnemonic_password: '', address_count: 1, wallet_password: pin }, pendingCreate));
    localStorage.setItem(STORE_KEY, r.wallet_file);
    // walletd does not report the BIP39 passphrase back, so a backup could not include it (see btn-export)
    if (pendingCreate.mnemonic_password) localStorage.setItem(MNEMONIC_PASSWORD_KEY, '1');
    else localStorage.removeItem(MNEMONIC_PASSWORD_KEY);
    pendingCreate = null;
    await rememberPin(pin);
    openWallet();
    keepStorage();
  } catch (err) {
    $('setpin-msg').textContent = t('pin.create_failed', { error: err.message });
  } finally {
    $('btn-pin-set').disabled = false;
    $('pin1').value = $('pin2').value = '';
  }
};

$('btn-copy').onclick = () => navigator.clipboard && navigator.clipboard.writeText($('addr').textContent);

// ---- QR code of the receiving address: "bytecoin:<address>", the same as BCN Wallet for Windows shows ----
function setQrButton(shown) {
  const b = $('btn-qr');
  b.setAttribute('data-i18n', shown ? 'qr.hide' : 'qr.show');
  b.textContent = t(shown ? 'qr.hide' : 'qr.show');
}
$('btn-qr').onclick = () => {
  const box = $('qr-box'), addr = $('addr').textContent;
  if (!box.classList.contains('hidden') || !ADDRESS_RE.test(addr)) { box.classList.add('hidden'); return setQrButton(false); }
  $('qr-img').textContent = '';
  $('qr-img').append(QR.svg('bytecoin:' + addr));
  box.classList.remove('hidden');
  setQrButton(true);
};
function hideQr() { $('qr-box').classList.add('hidden'); $('qr-img').textContent = ''; setQrButton(false); }

async function closeWallet() {
  clearInterval(pollTimer);
  pinCheck = null;
  startHeight = null;
  $('backup-words').textContent = '';
  $('backup').classList.add('hidden');
  $('pinchange').classList.add('hidden');
  $('export').classList.add('hidden');
  $('sec-msg').textContent = '';
  hideQr();
  stopScan();
  try { await rpc('ext_close_wallet'); } catch (err) { log(err.message); }
  scanning = false;
  updateWakeLock();
}
$('btn-lock').onclick = async () => { await closeWallet(); showUnlock(); };

// Removes the encrypted wallet file and its cache from IndexedDB (emscripten fetch stores them there).
function deleteStoredFiles(walletFile) {
  return new Promise((resolve) => {
    const req = indexedDB.open('emscripten_filesystem');
    req.onerror = () => resolve(false);
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('FILES')) { db.close(); return resolve(false); }
      const tx = db.transaction('FILES', 'readwrite');
      tx.objectStore('FILES').delete(walletFile);
      tx.objectStore('FILES').delete(walletFile.replace(/\.wallet\.memory$/, '.memory'));
      tx.oncomplete = () => { db.close(); resolve(true); };
      tx.onerror = () => { db.close(); resolve(false); };
    };
  });
}
async function forget() {
  if (!confirm(t('wallet.confirm_forget'))) return;
  const file = localStorage.getItem(STORE_KEY);
  await closeWallet();
  if (file) await deleteStoredFiles(file);
  localStorage.removeItem(STORE_KEY);
  localStorage.removeItem(ADDR_KEY);
  localStorage.removeItem(MNEMONIC_PASSWORD_KEY);
  show('setup');
}
$('btn-forget').onclick = forget;
$('btn-unlock-forget').onclick = forget;

$('btn-backup-show').onclick = () => { $('backup').classList.toggle('hidden'); $('backup-words').textContent = ''; $('pin-backup').value = ''; };
$('btn-backup').onclick = async () => {
  if (!(await pinMatches($('pin-backup').value))) { $('pin-backup').value = ''; return ($('sec-msg').textContent = t('pin.wrong')); }
  $('pin-backup').value = '';
  $('sec-msg').textContent = '';
  try {
    $('backup-words').textContent = (await rpc('get_wallet_info', { need_secrets: true })).mnemonic;
    setTimeout(() => { $('backup-words').textContent = ''; }, 60000);  // hide again after a minute
  } catch (err) {
    $('sec-msg').textContent = err.message;
  }
};
$('btn-pin-change-show').onclick = () => $('pinchange').classList.toggle('hidden');
$('btn-pin-change').onclick = async () => {
  const oldPin = $('pin-old').value, pin = $('pin-new1').value, problem = checkNewPin(pin, $('pin-new2').value);
  $('pin-old').value = $('pin-new1').value = $('pin-new2').value = '';
  if (!(await pinMatches(oldPin))) return ($('sec-msg').textContent = t('sec.pin_old_wrong'));
  if (problem) return ($('sec-msg').textContent = problem);
  try {
    await rpc('ext_set_password', { wallet_password: pin });
    await rememberPin(pin);
    $('pinchange').classList.add('hidden');
    $('sec-msg').textContent = t('sec.pin_changed');
  } catch (err) {
    $('sec-msg').textContent = err.message;
  }
};

// ---- Backup file (.amwbackup): mnemonic, creation date and address count, encrypted with its own password ----
// "AMWBACKUP1" | salt[16] | iv[12] | AES-256-GCM(JSON), key = PBKDF2-HMAC-SHA256(password, salt, 600000),
// the header is authenticated as additional data. Independent of the PIN, which can change later.
const BACKUP_MAGIC = 'AMWBACKUP1';
const BACKUP_ITERATIONS = 600000;
const MIN_BACKUP_PASSWORD = 10;
async function backupKey(password, salt) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: BACKUP_ITERATIONS, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
function encryptBackupText(json, password) { return encryptBackup(null, password, json); }
async function encryptBackup(payload, password, json) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const header = new Uint8Array(10 + 16 + 12);
  header.set(new TextEncoder().encode(BACKUP_MAGIC), 0);
  header.set(salt, 10);
  header.set(iv, 26);
  const body = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: header },
    await backupKey(password, salt), new TextEncoder().encode(json || JSON.stringify(payload)));
  const out = new Uint8Array(header.length + body.byteLength);
  out.set(header, 0);
  out.set(new Uint8Array(body), header.length);
  return out;
}
async function decryptBackup(bytes, password) {
  if (bytes.length < 38 + 16 || new TextDecoder().decode(bytes.subarray(0, 10)) !== BACKUP_MAGIC)
    throw new Error(t('import.unknown_file'));
  const header = bytes.subarray(0, 38);
  let plain;
  try {
    plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.subarray(26, 38), additionalData: header },
      await backupKey(password, bytes.subarray(10, 26)), bytes.subarray(38));
  } catch (err) {
    throw new Error(t('import.wrong_password'));
  }
  const p = JSON.parse(new TextDecoder().decode(plain));
  if (p.format !== 'amethyst-web-wallet-backup') throw new Error(t('import.unknown_format'));
  if (p.version === 1 && p.mnemonic) return p;
  if (p.version !== 2 || !p.wallet || !p.wallet.mnemonic) throw new Error(t('import.newer_format'));
  if (p.net && p.net !== 'main') throw new Error(t('import.other_net', { net: p.net }));
  if (p.wallet.type !== 'amethyst') throw new Error(t('import.not_amethyst'));
  // Version 2 (docs/amwbackup-format.md): scan from the first payment, or from the snapshot block if the wallet
  // had none; the snapshot outputs themselves are not loaded yet. One day earlier for time zones and clock skew.
  const w = p.wallet, s = p.snapshot;
  let from = Number(w.creation_timestamp) || 0, reason = 'creation date';
  if (s && Number(s.first_activity_timestamp) > 0) { from = Number(s.first_activity_timestamp); reason = 'first payment'; }
  else if (s && Number(s.block_timestamp) > 0) { from = Number(s.block_timestamp); reason = 'backup date, no payments before it'; }
  return { mnemonic: w.mnemonic, mnemonic_password: w.mnemonic_password || '', address_count: w.address_count,
    first_address: w.first_address, creation_timestamp: from > 86400 ? from - 86400 : 0,
    scan_reason: reason + (s ? ', state at block ' + s.height : '') };
}

// ---- Version 2 snapshot (docs/amwbackup-format.md): the wallet state at a block 10 below the top ----
// Amounts are exact integers that can exceed 2^53: integers of 16+ digits travel as "~N~digits" strings
// between parseExact and stringifyExact. No BigInt: older browsers (legacy engine) lack it.
const BIG_INT = /([:\[,]\s*)(-?\d{16,})(?=\s*[,\]}])/g;
function parseExact(text) {
  try { return JSON.parse(text.replace(BIG_INT, '$1"~N~$2"')); } catch (err) { return JSON.parse(text); }
}
function stringifyExact(obj) { return JSON.stringify(obj).replace(/"~N~(-?\d+)"/g, '$1'); }
function decimal(v) { return typeof v === 'string' ? v.replace('~N~', '') : String(v); }
function addDecimal(a, b) {  // non-negative decimal strings
  let r = '', c = 0;
  for (let i = a.length - 1, j = b.length - 1; i >= 0 || j >= 0 || c; i--, j--) {
    const d = (i >= 0 ? +a[i] : 0) + (j >= 0 ? +b[j] : 0) + c;
    r = (d % 10) + r;
    c = d > 9 ? 1 : 0;
  }
  return r.replace(/^0+(?=\d)/, '');
}
const SNAPSHOT_DEPTH = 10;
const MAX_PAYLOAD = 16 * 1024 * 1024;
// Returns { snapshot } or { reason } (already translated) when no snapshot can be written.
async function makeSnapshot() {
  const st = await rpc('get_status', {});
  if (!(st.top_known_block_height > 0 && st.top_block_height >= st.top_known_block_height))
    return { reason: t('snap.not_synced') };
  const height = st.top_block_height - SNAPSHOT_DEPTH;
  const r = await fetch(nodeBase(activeNode) + '/json_rpc', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, cache: 'no-store',
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'get_block_header', params: { height_or_depth: height } }),
  });
  const hdr = r.ok && (await r.json()).result;
  if (!hdr || !hdr.block_header || hdr.block_header.height !== height) return { reason: t('snap.no_block', { height }) };
  const balance = await rpc('get_balance', { height_or_depth: height }, true);
  const u = await rpc('get_unspents', { height_or_depth: height }, true);
  const unspents = (u.spendable || []).concat(u.locked_or_unconfirmed || []);
  let sum = '0';
  for (const o of unspents) {
    if (!o.key_image || /^0*$/.test(o.key_image)) return { reason: t('snap.no_key_image') };
    sum = addDecimal(sum, decimal(o.amount));
  }
  const total = [balance.spendable, balance.spendable_dust, balance.locked_or_unconfirmed].map(decimal).reduce(addDecimal, '0');
  const count = Number(balance.spendable_outputs) + Number(balance.spendable_dust_outputs) + Number(balance.locked_or_unconfirmed_outputs);
  if (sum !== total || unspents.length !== count) return { reason: t('snap.mismatch') };
  const first = await rpc('get_transfers', { from_height: 0, to_height: height, forward: true, desired_transaction_count: 1 });
  const fb = first.blocks && first.blocks[0];
  let blocks = [];
  for (let from = 0; from < height;) {
    const page = await rpc('get_transfers', { from_height: from, to_height: height, forward: true,
      desired_transaction_count: 1000, need_outputs: true }, true);
    if (!page.blocks || !page.blocks.length) break;
    blocks = blocks.concat(page.blocks);
    if (!(page.next_from_height > from)) break;
    from = page.next_from_height;
  }
  const snapshot = {
    height, block_hash: hdr.block_header.hash, block_timestamp: hdr.block_header.timestamp,
    first_activity_height: fb ? fb.header.height : 0, first_activity_timestamp: fb ? fb.header.timestamp : 0,
    balance, unspents, history_from_height: 0, blocks,
  };
  // Too long a history: drop the oldest tenth until it fits (balance and spending use unspents).
  while (blocks.length && stringifyExact(snapshot).length > MAX_PAYLOAD) {
    blocks = blocks.slice(Math.ceil(blocks.length / 10));
    snapshot.blocks = blocks;
    snapshot.history_from_height = blocks.length ? blocks[0].header.height - 1 : height;
  }
  return { snapshot };
}

// ---- .wallet file of desktop walletd 3.x / Bytecoin desktop wallets (amethyst type, SQLite) ----
// Read by desktop-import.wasm in its own worker, loaded only now (≈0.6 MB), see build/desktop_import.c.
const SQLITE_MAGIC = 'SQLite format 3\0';
function isDesktopWallet(bytes) {
  return bytes.length > 512 && new TextDecoder().decode(bytes.subarray(0, 16)) === SQLITE_MAGIC;
}
// error codes of desktop_import.c → desktop.<code> texts
const DESKTOP_ERRORS = ['wrong_password', 'view_only', 'hardware', 'other_coin', 'unknown_version', 'not_wallet', 'not_sqlite'];
function decryptDesktopWallet(bytes, password) {
  return new Promise((resolve, reject) => {
    const w = new Worker('desktop-import-worker.js');
    const timer = setTimeout(() => { w.terminate(); reject(new Error(t('desktop.timeout'))); }, 120000);
    w.onmessage = (e) => {
      clearTimeout(timer);
      w.terminate();
      const r = e.data.result;
      if (e.data.error || !r) return reject(new Error(t('desktop.read_failed', { error: e.data.error || 'no result' })));
      if (r.error) return reject(new Error(DESKTOP_ERRORS.indexOf(r.error) >= 0 ? t('desktop.' + r.error) : t('desktop.damaged', { error: r.error })));
      resolve(Object.assign(r, { first_address: '(desktop wallet)' }));
    };
    w.onerror = (e) => { clearTimeout(timer); w.terminate(); reject(new Error(t('desktop.module_failed', { error: e.message }))); };
    const copy = bytes.slice().buffer;
    w.postMessage({ file: copy, password }, [copy]);
  });
}

$('btn-export-show').onclick = () => $('export').classList.toggle('hidden');
$('btn-export').onclick = async () => {
  const pin = $('pin-export').value, pass = $('export-pass1').value, pass2 = $('export-pass2').value;
  $('pin-export').value = $('export-pass1').value = $('export-pass2').value = '';
  if (!(await pinMatches(pin))) return ($('sec-msg').textContent = t('pin.wrong'));
  if (pass.length < MIN_BACKUP_PASSWORD) return ($('sec-msg').textContent = t('sec.export_short', { n: MIN_BACKUP_PASSWORD }));
  if (pass !== pass2) return ($('sec-msg').textContent = t('sec.export_mismatch'));
  if (pass === pin) return ($('sec-msg').textContent = t('sec.export_same_as_pin'));
  if (localStorage.getItem(MNEMONIC_PASSWORD_KEY)) return ($('sec-msg').textContent = t('sec.export_passphrase'));
  $('btn-export').disabled = true;
  $('sec-msg').textContent = t('sec.export_saving');
  try {
    const info = await rpc('get_wallet_info', { need_secrets: true });
    let snap;
    try { snap = await makeSnapshot(); } catch (err) { snap = { reason: err.message }; }
    if (snap.reason) log('backup without wallet state: ' + snap.reason);
    const payload = {
      format: 'amethyst-web-wallet-backup', version: 2, created_by: 'Amethyst Web Wallet',
      saved_at: Math.floor(Date.now() / 1000), net: info.net || 'main',
      wallet: { type: info.wallet_type || 'amethyst', mnemonic: info.mnemonic, mnemonic_password: '',
        address_count: info.total_address_count || 1, first_address: info.first_address,
        creation_timestamp: info.wallet_creation_timestamp || 0 },
    };
    if (snap.snapshot) payload.snapshot = snap.snapshot;
    $('sec-msg').textContent = t('sec.export_encrypting');
    const bytes = await encryptBackupText(stringifyExact(payload), pass);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
    a.download = 'bcn-' + info.first_address.slice(3, 11) + '-' + new Date().toISOString().slice(0, 10) + '.amwbackup';
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    $('export').classList.add('hidden');
    $('sec-msg').textContent = snap.snapshot ? t('sec.export_saved_state', { height: snap.snapshot.height })
      : t('sec.export_saved_no_state', { reason: snap.reason });
  } catch (err) {
    $('sec-msg').textContent = t('sec.export_failed', { error: err.message });
  } finally {
    $('btn-export').disabled = false;
  }
};

$('btn-import-show').onclick = () => $('import').classList.toggle('hidden');
// Desktop walletd never stores a creation date for an amethyst wallet restored from its phrase: such a file
// has 0, which means scanning the whole chain. The first Restore then asks for a date; a second one goes on without.
let importNoDateOk = false;
$('import-file').onchange = () => { importNoDateOk = false; $('import-msg').textContent = ''; };
$('btn-import').onclick = async () => {
  const file = $('import-file').files[0], pass = $('import-pass').value;
  if (!file) return ($('import-msg').textContent = t('import.choose'));
  if (file.size > 32 * 1024 * 1024) return ($('import-msg').textContent = t('import.not_backup'));
  const since = dateField('import-date');
  if (since < 0) return ($('import-msg').textContent = t('restore.bad_date'));
  $('btn-import').disabled = true;
  $('import-msg').textContent = t('import.decrypting');
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const p = isDesktopWallet(bytes) ? await decryptDesktopWallet(bytes, pass) : await decryptBackup(bytes, pass);
    const words = (await post({ op: 'check_mnemonic', mnemonic: p.mnemonic })).result;
    if (!words) throw new Error(t('import.bad_phrase'));
    const stored = Number(p.creation_timestamp) || 0;
    // both known: the earlier one, so no payment is missed
    const created = stored && since ? Math.min(stored, since) : stored || since;
    if (!created && !importNoDateOk) {
      importNoDateOk = true;
      $('import-msg').textContent = t('import.no_date') + ' ' + t('restore.full_scan') + ' ' + t('import.no_date_next');
      return;
    }
    pendingCreate = { mnemonic: words, creation_timestamp: created,
      address_count: Math.max(1, Math.min(1000, Number(p.address_count) || 1)) };
    if (p.mnemonic_password) pendingCreate.mnemonic_password = p.mnemonic_password;
    $('import-file').value = $('import-pass').value = $('import-date').value = '';
    $('import-msg').textContent = '';
    importNoDateOk = false;
    log('backup: ' + p.first_address + (p.scan_reason ? ', ' + p.scan_reason
      : ', created ' + (stored ? new Date(stored * 1000).toISOString() : 'unknown')) +
      (created ? ', scanning from ' + new Date(created * 1000).toISOString().slice(0, 10) : ', scanning the whole chain'));
    askPin();
  } catch (err) {
    $('import-msg').textContent = err.message;
  } finally {
    $('btn-import').disabled = false;
  }
};

async function openWallet() {
  show('wallet');
  try {
    $('addr').textContent = (await rpc('get_addresses', {})).addresses[0];
    localStorage.setItem(ADDR_KEY, $('addr').textContent);
  } catch (err) { log('get_addresses: ' + err.message); }
  clearInterval(pollTimer);
  pollTimer = setInterval(refresh, 3000);
  refresh();
}

let refreshing = false;
async function refresh() {
  if (refreshing) return;
  refreshing = true;
  try {
    const st = await rpc('get_status', {});
    // Right after the wallet is opened walletd reports the height saved in its cache as both top and top known,
    // so it would look synced; the node's height seen when the page started keeps "Synced" honest until walletd
    // has heard from the node.
    const top = st.top_block_height, reported = st.top_known_block_height || top;
    if (!reported) { $('sync').textContent = t('sync.connecting'); return; }
    const known = Math.max(reported, nodeHeight);
    if (startHeight === null || top < startHeight) startHeight = top;
    // a block or two behind is normal between polls, not a fresh scan
    const pct = known - top <= 2 ? 1 : known > startHeight ? (top - startHeight) / (known - startHeight) : 1;
    $('prog').style.width = Math.max(2, Math.min(100, pct * 100)).toFixed(1) + '%';
    scanning = top < known;
    updateWakeLock();
    $('sync').textContent = t(top >= known ? 'sync.synced' : 'sync.scanning') + ' · ' +
      top.toLocaleString(LOCALE) + ' / ' + known.toLocaleString(LOCALE) +
      (st.lower_level_error ? ' · ' + st.lower_level_error : '');
    const b = await rpc('get_balance', {});
    spendable = Number(b.spendable || 0);
    $('bal').textContent = fmt(b.spendable);
    $('bal-locked').textContent = fmt(b.locked_or_unconfirmed);
    renderTransfers(await rpc('get_transfers', { desired_transaction_count: 20 }));
  } catch (err) {
    $('sync').textContent = t('sync.no_walletd', { error: err.message });
  } finally {
    refreshing = false;
  }
}

// ---- Keep the screen on while scanning (Screen Wake Lock API; phones pause the page when the screen goes off) ----
// Only while the wallet is open, visible and still scanning; released once synced. The browser drops the lock
// whenever the page is hidden, so it is taken again when the page comes back.
const AWAKE_KEY = 'aww-keep-awake';
const HAS_WAKE_LOCK = 'wakeLock' in navigator;
const TOUCH = navigator.maxTouchPoints > 0 || (window.matchMedia && matchMedia('(pointer: coarse)').matches);
let wakeLock = null, wakeBusy = false, scanning = false, wantAwake = false;
try { wantAwake = localStorage.getItem(AWAKE_KEY) === '1'; } catch (e) { /* private mode */ }
async function updateWakeLock() {
  const need = wantAwake && scanning && document.visibilityState === 'visible' && !$('wallet').classList.contains('hidden');
  if (wakeBusy || !HAS_WAKE_LOCK || need === !!wakeLock) return;
  wakeBusy = true;
  try {
    if (need) {
      const lock = await navigator.wakeLock.request('screen');
      wakeLock = lock;
      lock.addEventListener('release', () => { if (wakeLock === lock) { wakeLock = null; log('screen: may turn off again'); } });
      $('awake-msg').textContent = '';
      log('screen: kept on while scanning');
    } else {
      const lock = wakeLock;
      wakeLock = null;
      await lock.release();
    }
  } catch (err) {
    $('awake-msg').textContent = t('awake.failed', { error: err.message });
  } finally {
    wakeBusy = false;
  }
}
if (HAS_WAKE_LOCK && TOUCH) {
  $('awake-box').classList.remove('hidden');
  $('awake').checked = wantAwake;
  $('awake-hint').classList.toggle('hidden', !wantAwake);
  $('awake').onchange = () => {
    wantAwake = $('awake').checked;
    try { localStorage.setItem(AWAKE_KEY, wantAwake ? '1' : '0'); } catch (e) { /* private mode */ }
    $('awake-hint').classList.toggle('hidden', !wantAwake);
    $('awake-msg').textContent = '';
    updateWakeLock();
  };
  document.addEventListener('visibilitychange', updateWakeLock);
}

// ---- Sending: create_transaction (walletd builds and signs it locally), confirm, then send_transaction ----
let spendable = 0, prepared = null;
const ADDRESS_RE = /^bcn[1-9A-HJ-NP-Za-km-z]{90,110}$/;
// Codes from rpc_api.hpp: CreateTransaction (-301…-305, -4) and SendTransaction (-101…-103); texts rpc.<code>.
const RPC_ERRORS = ['-301', '-302', '-303', '-304', '-4', '-101', '-102', '-103', '-1003'];
function sendMsg(text, isError) { $('send-msg').textContent = text; $('send-msg').className = isError ? 'warn' : 'sub'; }
function parseAmount(text) {
  // Exact decimal → atomic units, no floating point. Accepts "1 234,5" and "1234.5".
  const s = text.replace(/[\s ]/g, '').replace(',', '.');
  const m = /^(\d+)(?:\.(\d{0,8}))?$/.exec(s);
  if (!m) return null;
  // digits of the atomic amount as a string (no BigInt: older engines such as SeaMonkey's lack it)
  const digits = (m[1] + (m[2] || '').padEnd(8, '0')).replace(/^0+/, '');
  const max = String(Number.MAX_SAFE_INTEGER);
  if (!digits || digits.length > max.length || (digits.length === max.length && digits > max)) return null;
  return Number(digits);
}
function rpcErrorText(err) {
  const known = err.code !== undefined && RPC_ERRORS.indexOf(String(err.code)) >= 0 && t('rpc.' + err.code);
  if (known) log('rpc error ' + err.code + ': ' + err.message);
  return known || err.message;
}
function resetSend(clear) {
  prepared = null;
  $('send-form').classList.remove('hidden');
  $('send-confirm').classList.add('hidden');
  $('btn-prepare').disabled = false;
  if (clear) { $('send-to').value = ''; $('send-amount').value = ''; $('send-subtract').checked = false; }
}
// A validation warning describes the input as it was; drop it once the user edits the form.
['send-to', 'send-amount'].forEach((id) => $(id).addEventListener('input', () => {
  if ($('send-msg').className === 'warn') sendMsg('');
}));
// ---- Scan the recipient's QR code with the camera ----
// The browser's own BarcodeDetector where it reads QR (Chrome on Android): nothing to load. Elsewhere (Safari,
// Firefox, SeaMonkey) vendor/jsQR.js (jsQR 1.4.0, Apache-2.0, ≈57 KB compressed), loaded only now.
// Accepts a plain address or "bytecoin:<address>[?…]"; the amount is never taken from a QR code.
let scanStream = null, scanTimer = null, scanDetector = null, scanCanvas = null, scanBad = '';
if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) $('btn-scan').classList.remove('hidden');
function loadJsQR() {
  if (window.jsQR) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'vendor/jsQR.js';
    s.onload = () => (window.jsQR ? resolve() : reject(new Error('jsQR missing')));
    s.onerror = () => reject(new Error('vendor/jsQR.js'));
    document.head.append(s);
  });
}
function scannedAddress(text) {
  const m = /^bytecoin:([^?#]*)/i.exec(text.trim());
  return (m ? m[1] : text).trim();
}
function stopScan() {
  clearTimeout(scanTimer);
  scanTimer = null;
  if (scanStream) scanStream.getTracks().forEach((tr) => tr.stop());
  scanStream = null;
  $('scan-video').srcObject = null;
  $('scan-box').classList.add('hidden');
}
async function scanFrame() {
  if (!scanStream) return;
  const v = $('scan-video');
  let text = null;
  try {
    if (v.readyState >= 2 && v.videoWidth) {
      if (scanDetector) {
        const codes = await scanDetector.detect(v);
        if (codes.length) text = codes[0].rawValue;
      } else {
        const k = Math.min(1, 640 / Math.max(v.videoWidth, v.videoHeight));
        const w = Math.round(v.videoWidth * k), h = Math.round(v.videoHeight * k);
        if (!scanCanvas) scanCanvas = document.createElement('canvas');
        scanCanvas.width = w; scanCanvas.height = h;
        const ctx = scanCanvas.getContext('2d');
        ctx.drawImage(v, 0, 0, w, h);
        const r = window.jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'attemptBoth' });
        if (r) text = r.data;
      }
    }
  } catch (err) { log('scan: ' + err.message); }
  if (text !== null) {
    const addr = scannedAddress(text);
    if (ADDRESS_RE.test(addr)) {
      stopScan();
      $('send-to').value = addr;
      log('scan: address read from a QR code');
      return sendMsg(t('scan.ok'));
    }
    if (text !== scanBad) { scanBad = text; sendMsg(t('scan.not_address'), true); }
  }
  if (scanStream) scanTimer = setTimeout(scanFrame, 150);
}
$('btn-scan').onclick = async () => {
  if (scanStream) return stopScan();
  sendMsg('');
  scanBad = '';
  try {
    scanStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
  } catch (err) {
    scanStream = null;
    return sendMsg(err.name === 'NotAllowedError' || err.name === 'SecurityError' ? t('scan.denied') : t('scan.no_camera', { error: err.message }), true);
  }
  const v = $('scan-video');
  v.srcObject = scanStream;
  $('scan-box').classList.remove('hidden');
  v.play().catch(() => {});
  scanDetector = null;
  try {
    if ('BarcodeDetector' in window && (await BarcodeDetector.getSupportedFormats()).indexOf('qr_code') >= 0)
      scanDetector = new BarcodeDetector({ formats: ['qr_code'] });
  } catch (err) { scanDetector = null; }
  if (!scanDetector) {
    try { await loadJsQR(); } catch (err) { stopScan(); return sendMsg(t('scan.lib_failed', { error: err.message }), true); }
  }
  log('scan: camera on, decoder ' + (scanDetector ? 'BarcodeDetector' : 'jsQR'));
  scanFrame();
};
$('btn-scan-cancel').onclick = stopScan;
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') stopScan(); });

$('btn-max').onclick = () => {
  $('send-amount').value = (spendable / ATOMIC).toFixed(8).replace(/\.?0+$/, '');
  $('send-subtract').checked = true;
};
$('btn-prepare').onclick = async () => {
  const to = $('send-to').value.trim();
  const amount = parseAmount($('send-amount').value);
  if (!to) return sendMsg(t('send.no_address'), true);
  if (!ADDRESS_RE.test(to)) return sendMsg(t('send.bad_address'), true);
  if (to === $('addr').textContent) return sendMsg(t('send.own_address'), true);
  if (amount === null) return sendMsg(t('send.bad_amount'), true);
  if (amount > spendable) return sendMsg(t('send.too_much', { balance: fmt(spendable) }), true);
  $('btn-prepare').disabled = true;
  sendMsg(t('send.building'));
  try {
    const subtract = $('send-subtract').checked;
    const r = await rpc('create_transaction', {
      transaction: { anonymity: 6, transfers: [{ address: to, amount }] },
      any_spend_address: true,
      change_address: $('addr').textContent,
      subtract_fee_from_amount: subtract,
    });
    const fee = Number(r.transaction.fee || 0);
    const sent = subtract ? amount - fee : amount;
    prepared = { binary: r.binary_transaction, hash: r.transaction.hash };
    $('c-to').textContent = to;
    $('c-amount').textContent = fmt(sent);
    $('c-fee').textContent = fmt(fee);
    $('c-total').textContent = fmt(sent + fee);
    $('send-form').classList.add('hidden');
    $('send-confirm').classList.remove('hidden');
    sendMsg(t('send.check'));
  } catch (err) {
    $('btn-prepare').disabled = false;
    sendMsg(rpcErrorText(err), true);
  }
};
$('btn-cancel').onclick = () => { resetSend(false); sendMsg(''); };
$('btn-send').onclick = async () => {
  if (!prepared) return;
  $('btn-send').disabled = $('btn-cancel').disabled = true;
  sendMsg(t('send.sending'));
  try {
    await rpc('send_transaction', { binary_transaction: prepared.binary });
    const hash = prepared.hash;
    resetSend(true);
    sendMsg(t('send.sent', { hash }));
    refresh();
  } catch (err) {
    sendMsg(rpcErrorText(err), true);
    resetSend(false);
  } finally {
    $('btn-send').disabled = $('btn-cancel').disabled = false;
  }
};

function renderTransfers(data) {
  const items = [];
  for (const blk of (data.blocks || [])) for (const tx of (blk.transactions || []))
    items.push({ height: blk.height, ts: tx.timestamp || blk.timestamp, amount: tx.amount, hash: tx.hash });
  items.sort((a, b) => b.height - a.height);
  const ul = $('txs');
  ul.textContent = '';
  if (!items.length) { const li = document.createElement('li'); li.className = 'sub'; li.textContent = t('tx.none'); ul.append(li); return; }
  for (const it of items.slice(0, 20)) {
    const li = document.createElement('li');
    const left = document.createElement('span');
    left.textContent = it.ts ? new Date(it.ts * 1000).toLocaleDateString(LOCALE) : '#' + it.height;
    left.title = it.hash || '';
    const right = document.createElement('span');
    right.className = Number(it.amount) >= 0 ? 'in' : 'out';
    right.textContent = (Number(it.amount) >= 0 ? '+' : '') + fmt(it.amount);
    li.append(left, right);
    ul.append(li);
  }
}

// Install hint: iOS has no install prompt (Share → Add to Home Screen); Chrome/Edge fire beforeinstallprompt.
// Hidden when already running as an installed app, or after "Not now" (remembered in this browser).
let installKey = null;
function renderInstall() { if (installKey) $('install-text').textContent = t(installKey); }
(function () {
  const installed = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone;
  let dismissed = false;
  try { dismissed = localStorage.getItem('aww-install-hidden') === '1'; } catch (e) { /* private mode */ }
  if (installed || dismissed) return;
  const IOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  // Android: written steps for every browser; Chrome's own prompt (below) replaces them with an Install button.
  const ANDROID = /Android/i.test(navigator.userAgent);
  if (IOS || ANDROID) {
    installKey = IOS ? 'install.ios' : 'install.android';
    renderInstall();
    $('install').classList.remove('hidden');
  }
  let prompt = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    prompt = e;
    installKey = 'install.prompt';
    renderInstall();
    $('btn-install').classList.remove('hidden');
    $('install').classList.remove('hidden');
  });
  $('btn-install').onclick = async () => {
    if (!prompt) return;
    prompt.prompt();
    await prompt.userChoice.catch(() => null);
    prompt = null;
    $('install').classList.add('hidden');
  };
  window.addEventListener('appinstalled', () => $('install').classList.add('hidden'));
  $('btn-install-hide').onclick = () => {
    $('install').classList.add('hidden');
    try { localStorage.setItem('aww-install-hidden', '1'); } catch (e) { /* private mode */ }
  };
})();

// updateViaCache 'none': the browser checks sw.js (and its imports) bypassing the HTTP cache.
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch((err) => log('service worker: ' + err.message));
showNodeSettings();

// Language menu; switching re-renders the texts, nothing is reloaded (an open wallet stays open).
function initLangMenu() {
  const sel = $('lang-sel');
  Object.keys(LANGS).forEach((code) => {
    const o = document.createElement('option');
    o.value = code;
    o.textContent = LANGS[code];
    sel.append(o);
  });
  sel.value = LANG;
  sel.onchange = () => {
    try { localStorage.setItem(LANG_KEY, sel.value); } catch (e) { /* private mode */ }
    setLang(sel.value).then(() => {
      setEngine(engineKey);
      renderNodeCur();
      renderInstall();
      if (!$('wallet').classList.contains('hidden')) refresh();
    });
  };
}
// The texts and the node check load in parallel; walletd starts once both are done.
engineKey = 'finding';
I18N_READY.then(() => { setEngine(engineKey); renderNodeCur(); renderInstall(); });
Promise.all([I18N_READY, chooseNode()]).then((r) => {
  initLangMenu();
  setEngine(engineKey);
  startWorker(r[1]);
});
