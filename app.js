// Amethyst Web Wallet: page logic. walletd runs in walletd-worker.js, wallet workers in walletworker-main.js.
'use strict';
const $ = (id) => document.getElementById(id);
const STORE_KEY = 'bcn-light-wallet-file';
const ATOMIC = 1e8;
let worker, nextId = 1, pending = new Map(), pollTimer = null, startHeight = null;

function log(t) {
  const el = $('log');
  el.textContent += t + '\n';
  if (el.textContent.length > 40000) el.textContent = el.textContent.slice(-30000);
}
function show(id) { for (const s of ['setup', 'newwords', 'setpin', 'unlock', 'wallet']) $(s).classList.toggle('hidden', s !== id); }
function fmt(atomic) {
  const v = Number(atomic || 0) / ATOMIC;
  return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 8 });
}
function post(msg) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    worker.postMessage(Object.assign({ id }, msg));
  });
}
async function rpc(method, params) {
  const r = await post({ body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params: params || {} }) });
  if (r.error) throw new Error(r.error);
  if (r.status !== 200) throw new Error('HTTP ' + r.status + ' ' + (r.body || ''));
  const j = JSON.parse(r.body);
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
      const w = new Worker('walletworker-main.js');
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
function nodeLabel(node) { return node === 'self' ? location.host + ' (this site\'s proxy)' : node; }

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
    if (!h) $('node-msg').textContent = 'The selected node does not answer. You can choose another one below.';
    return { node: pref, note: 'chosen manually' };
  }
  const candidates = ['self'].concat(PUBLIC_NODES);
  const heights = await Promise.all(candidates.map((n) => probeNode(n)));
  candidates.forEach((n, k) => log('node ' + nodeLabel(n) + ': ' + (heights[k] ? 'height ' + heights[k] : 'no answer')));
  const best = Math.max.apply(null, heights);
  const i = best > 0 ? heights.findIndex((h) => h > 0 && h >= best - 10) : -1;
  if (i < 0) {
    $('node-msg').textContent = 'No node answered. Check your internet connection or enter your own node.';
    return { node: 'self', note: 'auto, no node answered' };
  }
  return { node: candidates[i], note: 'auto' };
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
    if (!pref) return ($('node-msg').textContent = 'The address must be https://host:port (http only for localhost).');
  }
  if (pref !== 'auto' && pref !== 'self') {
    $('node-msg').textContent = 'Checking the node…';
    if (!(await probeNode(pref))) return ($('node-msg').textContent = 'The node does not answer or does not allow browser requests (CORS).');
  }
  if (!$('wallet').classList.contains('hidden') && !confirm('The wallet will be locked; you will need to enter the PIN again. Continue?')) return;
  localStorage.setItem(NODE_KEY, pref);
  location.reload();
};

function startWorker(choice) {
  worker = new Worker('walletd-worker.js?node=' + encodeURIComponent(choice.node));
  $('node-cur').textContent = nodeLabel(choice.node) + ' · ' + choice.note;
  worker.onmessage = (e) => {
    const m = e.data;
    if (m.op && m.op.startsWith('pool_')) return poolMessage(m);
    if (m.log !== undefined) return log(m.log);
    if (m.ready) { $('engine').textContent = 'walletd.wasm'; $('engine').classList.add('ok'); log('node: ' + m.node); return onReady(); }
    const p = pending.get(m.id);
    if (p) { pending.delete(m.id); p.resolve(m); }
  };
  worker.onerror = (e) => { $('engine').textContent = 'error'; log('worker error: ' + e.message); };
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
  } catch (err) {
    $('unlock-msg').textContent = err.code === WRONG_PIN ? 'Wrong PIN.' : 'Could not open the wallet: ' + err.message;
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
$('btn-restore').onclick = async () => {
  const words = (await post({ op: 'check_mnemonic', mnemonic: $('restore-words').value.trim() })).result;
  if (!words) return alert('Invalid recovery phrase (check the words and the checksum).');
  $('restore-words').value = '';
  pendingCreate = { mnemonic: words, creation_timestamp: 0 };
  askPin();
};
function askPin() {
  $('pin1').value = $('pin2').value = '';
  $('setpin-msg').textContent = '';
  show('setpin');
  $('pin1').focus();
}
function checkNewPin(a, b) {
  if (a.length < MIN_PIN) return 'The PIN must be at least ' + MIN_PIN + ' characters.';
  if (a !== b) return 'The PINs do not match.';
  return '';
}
$('btn-pin-set').onclick = async () => {
  const pin = $('pin1').value, problem = checkNewPin(pin, $('pin2').value);
  if (problem) return ($('setpin-msg').textContent = problem);
  $('btn-pin-set').disabled = true;
  try {
    const r = await rpc('ext_create_wallet', Object.assign({ mnemonic_password: '', address_count: 1, wallet_password: pin }, pendingCreate));
    localStorage.setItem(STORE_KEY, r.wallet_file);
    pendingCreate = null;
    await rememberPin(pin);
    openWallet();
  } catch (err) {
    $('setpin-msg').textContent = 'Could not create the wallet: ' + err.message;
  } finally {
    $('btn-pin-set').disabled = false;
    $('pin1').value = $('pin2').value = '';
  }
};

$('btn-copy').onclick = () => navigator.clipboard && navigator.clipboard.writeText($('addr').textContent);

async function closeWallet() {
  clearInterval(pollTimer);
  pinCheck = null;
  startHeight = null;
  $('backup-words').textContent = '';
  $('backup').classList.add('hidden');
  $('pinchange').classList.add('hidden');
  $('export').classList.add('hidden');
  $('sec-msg').textContent = '';
  try { await rpc('ext_close_wallet'); } catch (err) { log(err.message); }
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
  if (!confirm('Remove the wallet from this browser? It can then be restored only from the recovery phrase.')) return;
  const file = localStorage.getItem(STORE_KEY);
  await closeWallet();
  if (file) await deleteStoredFiles(file);
  localStorage.removeItem(STORE_KEY);
  localStorage.removeItem(ADDR_KEY);
  show('setup');
}
$('btn-forget').onclick = forget;
$('btn-unlock-forget').onclick = forget;

$('btn-backup-show').onclick = () => { $('backup').classList.toggle('hidden'); $('backup-words').textContent = ''; $('pin-backup').value = ''; };
$('btn-backup').onclick = async () => {
  if (!(await pinMatches($('pin-backup').value))) { $('pin-backup').value = ''; return ($('sec-msg').textContent = 'Wrong PIN.'); }
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
  if (!(await pinMatches(oldPin))) return ($('sec-msg').textContent = 'The current PIN is wrong.');
  if (problem) return ($('sec-msg').textContent = problem);
  try {
    await rpc('ext_set_password', { wallet_password: pin });
    await rememberPin(pin);
    $('pinchange').classList.add('hidden');
    $('sec-msg').textContent = 'PIN changed.';
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
async function encryptBackup(payload, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const header = new Uint8Array(10 + 16 + 12);
  header.set(new TextEncoder().encode(BACKUP_MAGIC), 0);
  header.set(salt, 10);
  header.set(iv, 26);
  const body = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: header },
    await backupKey(password, salt), new TextEncoder().encode(JSON.stringify(payload)));
  const out = new Uint8Array(header.length + body.byteLength);
  out.set(header, 0);
  out.set(new Uint8Array(body), header.length);
  return out;
}
async function decryptBackup(bytes, password) {
  if (bytes.length < 38 + 16 || new TextDecoder().decode(bytes.subarray(0, 10)) !== BACKUP_MAGIC)
    throw new Error('This is not a backup file of this wallet.');
  const header = bytes.subarray(0, 38);
  let plain;
  try {
    plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.subarray(26, 38), additionalData: header },
      await backupKey(password, bytes.subarray(10, 26)), bytes.subarray(38));
  } catch (err) {
    throw new Error('Wrong password or damaged file.');
  }
  const p = JSON.parse(new TextDecoder().decode(plain));
  if (p.format !== 'amethyst-web-wallet-backup' || p.version !== 1 || !p.mnemonic) throw new Error('Unknown backup format.');
  return p;
}

$('btn-export-show').onclick = () => $('export').classList.toggle('hidden');
$('btn-export').onclick = async () => {
  const pin = $('pin-export').value, pass = $('export-pass1').value, pass2 = $('export-pass2').value;
  $('pin-export').value = $('export-pass1').value = $('export-pass2').value = '';
  if (!(await pinMatches(pin))) return ($('sec-msg').textContent = 'Wrong PIN.');
  if (pass.length < MIN_BACKUP_PASSWORD) return ($('sec-msg').textContent = 'The backup password must be at least ' + MIN_BACKUP_PASSWORD + ' characters.');
  if (pass !== pass2) return ($('sec-msg').textContent = 'The backup passwords do not match.');
  if (pass === pin) return ($('sec-msg').textContent = 'The backup password must differ from the PIN.');
  $('btn-export').disabled = true;
  $('sec-msg').textContent = 'Encrypting…';
  try {
    const info = await rpc('get_wallet_info', { need_secrets: true });
    const bytes = await encryptBackup({
      format: 'amethyst-web-wallet-backup', version: 1, mnemonic: info.mnemonic,
      creation_timestamp: info.wallet_creation_timestamp || 0, address_count: info.total_address_count || 1,
      first_address: info.first_address, saved_at: Math.floor(Date.now() / 1000),
    }, pass);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
    a.download = 'bcn-' + info.first_address.slice(3, 11) + '-' + new Date().toISOString().slice(0, 10) + '.amwbackup';
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    $('export').classList.add('hidden');
    $('sec-msg').textContent = 'File saved. Check that it is in your Downloads, and keep the password separately.';
  } catch (err) {
    $('sec-msg').textContent = 'Could not save the backup: ' + err.message;
  } finally {
    $('btn-export').disabled = false;
  }
};

$('btn-import-show').onclick = () => $('import').classList.toggle('hidden');
$('btn-import').onclick = async () => {
  const file = $('import-file').files[0], pass = $('import-pass').value;
  $('import-pass').value = '';
  if (!file) return ($('import-msg').textContent = 'Choose a file.');
  if (file.size > 65536) return ($('import-msg').textContent = 'This is not a backup file of this wallet.');
  $('btn-import').disabled = true;
  $('import-msg').textContent = 'Decrypting…';
  try {
    const p = await decryptBackup(new Uint8Array(await file.arrayBuffer()), pass);
    const words = (await post({ op: 'check_mnemonic', mnemonic: p.mnemonic })).result;
    if (!words) throw new Error('The recovery phrase in the backup is invalid.');
    pendingCreate = { mnemonic: words, creation_timestamp: Number(p.creation_timestamp) || 0,
      address_count: Math.max(1, Math.min(1000, Number(p.address_count) || 1)) };
    $('import-file').value = '';
    $('import-msg').textContent = '';
    log('backup: ' + p.first_address + ', created ' + (p.creation_timestamp ? new Date(p.creation_timestamp * 1000).toISOString() : 'unknown'));
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
    const top = st.top_block_height, known = st.top_known_block_height || top;
    if (!known) { $('sync').textContent = 'Connecting to the node…'; return; }
    if (startHeight === null || top < startHeight) startHeight = top;
    // a block or two behind is normal between polls, not a fresh scan
    const pct = known - top <= 2 ? 1 : known > startHeight ? (top - startHeight) / (known - startHeight) : 1;
    $('prog').style.width = Math.max(2, Math.min(100, pct * 100)).toFixed(1) + '%';
    $('sync').textContent = (top >= known ? 'Synced · ' : 'Scanning · ') +
      top.toLocaleString('en-US') + ' / ' + known.toLocaleString('en-US') +
      (st.lower_level_error ? ' · ' + st.lower_level_error : '');
    const b = await rpc('get_balance', {});
    spendable = Number(b.spendable || 0);
    $('bal').textContent = fmt(b.spendable);
    $('bal-locked').textContent = fmt(b.locked_or_unconfirmed);
    const t = await rpc('get_transfers', { desired_transaction_count: 20 });
    renderTransfers(t);
  } catch (err) {
    $('sync').textContent = 'No connection to walletd: ' + err.message;
  } finally {
    refreshing = false;
  }
}

// ---- Sending: create_transaction (walletd builds and signs it locally), confirm, then send_transaction ----
let spendable = 0, prepared = null;
const ADDRESS_RE = /^bcn[1-9A-HJ-NP-Za-km-z]{90,110}$/;
// Codes from rpc_api.hpp: CreateTransaction (-301…-305, -4) and SendTransaction (-101…-103).
const RPC_ERRORS = {
  '-301': 'Not enough confirmed funds (including the fee).',
  '-302': 'The transaction does not fit in a block: too many small outputs. Send a smaller amount or split it into several payments.',
  '-303': 'The node did not provide enough outputs for mixing (anonymity). Try later or use another node.',
  '-304': 'This is a view-only wallet: it cannot send.',
  '-4': 'The recipient address could not be parsed.',
  '-101': 'The node did not accept the transaction format.',
  '-102': 'Outputs changed (chain reorganization). Prepare the transaction again.',
  '-103': 'Some outputs are already spent. Prepare the transaction again.',
  '-1003': 'The node returned an error. See the walletd log for details.',
};
function sendMsg(text, isError) { $('send-msg').textContent = text; $('send-msg').className = isError ? 'warn' : 'sub'; }
function parseAmount(text) {
  // Exact decimal → atomic units, no floating point. Accepts "1 234,5" and "1234.5".
  const s = text.replace(/[\s ]/g, '').replace(',', '.');
  const m = /^(\d+)(?:\.(\d{0,8}))?$/.exec(s);
  if (!m) return null;
  const atomic = BigInt(m[1]) * 100000000n + BigInt((m[2] || '').padEnd(8, '0'));
  return atomic > 0n && atomic <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(atomic) : null;
}
function rpcErrorText(err) {
  const known = err.code !== undefined && RPC_ERRORS[String(err.code)];
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
$('btn-max').onclick = () => {
  $('send-amount').value = (spendable / ATOMIC).toFixed(8).replace(/\.?0+$/, '');
  $('send-subtract').checked = true;
};
$('btn-prepare').onclick = async () => {
  const to = $('send-to').value.trim();
  const amount = parseAmount($('send-amount').value);
  if (!ADDRESS_RE.test(to)) return sendMsg('The address looks wrong: it must start with "bcn".', true);
  if (to === $('addr').textContent) return sendMsg('This is your own address.', true);
  if (amount === null) return sendMsg('Invalid amount: a number above zero, up to 8 decimal places.', true);
  if (amount > spendable) return sendMsg('The amount exceeds the available balance of ' + fmt(spendable) + ' BCN.', true);
  $('btn-prepare').disabled = true;
  sendMsg('Building and signing the transaction on this device…');
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
    sendMsg('Check the details. A sent transaction cannot be cancelled.');
  } catch (err) {
    $('btn-prepare').disabled = false;
    sendMsg(rpcErrorText(err), true);
  }
};
$('btn-cancel').onclick = () => { resetSend(false); sendMsg(''); };
$('btn-send').onclick = async () => {
  if (!prepared) return;
  $('btn-send').disabled = $('btn-cancel').disabled = true;
  sendMsg('Sending to the network…');
  try {
    await rpc('send_transaction', { binary_transaction: prepared.binary });
    const hash = prepared.hash;
    resetSend(true);
    sendMsg('Sent. Transaction hash: ' + hash);
    refresh();
  } catch (err) {
    sendMsg(rpcErrorText(err), true);
    resetSend(false);
  } finally {
    $('btn-send').disabled = $('btn-cancel').disabled = false;
  }
};

function renderTransfers(t) {
  const items = [];
  for (const blk of (t.blocks || [])) for (const tx of (blk.transactions || []))
    items.push({ height: blk.height, ts: tx.timestamp || blk.timestamp, amount: tx.amount, hash: tx.hash });
  items.sort((a, b) => b.height - a.height);
  const ul = $('txs');
  ul.textContent = '';
  if (!items.length) { const li = document.createElement('li'); li.className = 'sub'; li.textContent = 'none yet'; ul.append(li); return; }
  for (const it of items.slice(0, 20)) {
    const li = document.createElement('li');
    const left = document.createElement('span');
    left.textContent = it.ts ? new Date(it.ts * 1000).toLocaleDateString('en-US') : '#' + it.height;
    left.title = it.hash || '';
    const right = document.createElement('span');
    right.className = Number(it.amount) >= 0 ? 'in' : 'out';
    right.textContent = (Number(it.amount) >= 0 ? '+' : '') + fmt(it.amount);
    li.append(left, right);
    ul.append(li);
  }
}

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch((err) => log('service worker: ' + err.message));
showNodeSettings();
$('engine').textContent = 'finding a node…';
chooseNode().then(startWorker);
