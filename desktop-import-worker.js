// Reads a desktop walletd amethyst .wallet file (SQLite) in a Web Worker: desktop-import.wasm derives the wallet key
// with CryptoNight (as walletd does) and decrypts the phrase, creation date and address count.
// Loaded only when such a file is picked. Message in: {file: ArrayBuffer, password}; out: {result} or {error}.
'use strict';
importScripts('desktop-import.js');
const ready = DesktopImport();

onmessage = async (e) => {
  const M = await ready;
  const bytes = new Uint8Array(e.data.file);
  const pass = String(e.data.password || '');
  const fp = M._malloc(bytes.length);
  const plen = M.lengthBytesUTF8(pass) + 1;
  const pp = M._malloc(plen);
  let rp = 0;
  try {
    M.HEAPU8.set(bytes, fp);
    M.stringToUTF8(pass, pp, plen);
    rp = M._desktop_import(fp, bytes.length, pp);
    const text = M.UTF8ToString(rp);
    postMessage({ result: JSON.parse(text) });
  } catch (err) {
    postMessage({ error: String(err && err.message || err) });
  } finally {
    // the file holds encrypted keys, the result the phrase: wipe both copies
    M.HEAPU8.fill(0, fp, fp + bytes.length);
    M.HEAPU8.fill(0, pp, pp + plen);
    M._free(fp);
    M._free(pp);
    if (rp) {
      let end = rp;
      while (M.HEAPU8[end]) end++;
      M.HEAPU8.fill(0, rp, end);
      M._free(rp);
    }
  }
};
