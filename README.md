# Amethyst Web Wallet

**English** · [Українська](README.uk.md) · [Español](README.es.md) · [Português](README.pt.md) · [Türkçe](README.tr.md) · [Bahasa Indonesia](README.id.md) · [Tiếng Việt](README.vi.md) · [中文](README.zh.md)

A light Bytecoin (BCN) wallet that runs entirely in the browser, on a phone or a desktop. It does not download the blockchain and does not hand your keys to a server: the official Bytecoin `walletd` 3.5.1, compiled to WebAssembly, runs inside the page and asks a node only for the data the wallet needs.

> **Status: prototype.** Tested with throwaway wallets only. Keep only small amounts here, and keep the recovery phrase offline.

## How it works

- `walletd.wasm` is Bytecoin `walletd` v3.5.1 built with Emscripten from public sources plus one patch ([build/patches](build/patches)). It creates and restores *amethyst* (BIP39, 24 words) wallets, scans blocks with your view key, and builds and signs transactions on the device.
- `walletworker.wasm` finds the wallet's outputs in blocks. The page runs one copy per CPU core (2–8).
- **Older browsers.** The normal build uses WebAssembly exception handling (Firefox 100+, Chrome/Edge 95+, Safari 15.2+). Where the page finds no such support (SeaMonkey, older Firefox ESR, Pale Moon and similar), it loads the same code from `legacy/`: built with C++ exceptions done in JavaScript, plain WebAssembly 1.0 and ES2017 glue. It is about 25% larger. `?engine=legacy` in the address forces it in any browser, `?engine=normal` forces the normal build.
- The node only serves blocks (`sync_blocks`), decoy outputs and accepts finished transactions. It never sees keys or the mnemonic. Outputs are checked locally, so the node is not trusted with balances.
- By default the page checks this site's own `/json_rpc` proxy (if any), the community node `node.bytecoin.community`, `node01.bytecoin.org` and `node02.bytecoin.org` in parallel, and uses the first one that answers and is not behind. The public nodes allow cross-origin requests, so **the site itself can be plain static hosting**. You can pick a node or enter your own (`https://host:port`) in the *Node* card.
- The public nodes do not share their memory pool, so an incoming payment appears with its first confirmation (≈2 min), not earlier.
- **QR codes.** *Show QR code* under the receiving address draws `bytecoin:<address>` (the same as BCN Wallet for Windows) with `qr.js`, a small encoder without dependencies. *Scan* next to the recipient field reads a QR code with the camera: Chrome on Android uses its built-in `BarcodeDetector`; other browsers load `vendor/jsQR.js` ([jsQR](https://github.com/cozmo/jsQR) 1.4.0, Apache-2.0, ≈57 KB compressed) only when you tap *Scan*. Only the address is taken from the code, never an amount. The camera runs only while the scanner is open, and `Permissions-Policy` allows it for this site only.

## Languages

The interface is in English, Українська, Español, Português, Türkçe, Bahasa Indonesia, Tiếng Việt and 中文. The page picks the browser's language (English otherwise); the menu in the header changes it at any time without closing the wallet, and the choice is remembered on the device. The recovery phrase is always English BIP39 words, whatever the interface language, and the walletd log stays in English.

Texts are in [`lang/`](lang), one `key = text` line per string, the same format as BCN Wallet for Windows. To add a language: copy `lang/en.txt`, translate the right-hand sides (keep `{placeholders}`), add the code to `LANGS` in [`i18n.js`](i18n.js) and to `SHELL` in `sw.js`, and run `python3 tools/check-lang.py`, which checks that every file has the same keys and placeholders. The English text also stays in `index.html`, so the page reads fine if a language file cannot be loaded.

## Install on a phone

The site is an installable app (PWA): it opens full screen from its own icon, and the app shell works offline.

- **iPhone / iPad:** open the site in Safari → *Share* → *Add to Home Screen*.
- **Android:** Chrome: menu ⋮ → *Install app* (or *Add to Home screen*); Samsung Internet: menu ☰ → *Add page to* → *Home screen*; Firefox: menu ⋮ → *Install*. The page shows these steps on Android and switches to an *Install* button when the browser offers one. On Android the app and the browser share storage, so the wallet does not need to be restored again.

Phones pause web apps in the background: scanning runs only while the app is open and the screen is on, and continues where it stopped when you return. On phones the *Sync* card has **Keep the screen on while scanning** (Screen Wake Lock API: Safari 16.4+, Chrome 84+). It holds the screen on only while the wallet is open and still scanning, and lets it turn off once synced. A page cannot change the brightness, so the page asks you to turn it down yourself. Locking the phone or switching apps still pauses scanning.

**Where the data lives:** the encrypted wallet file (≈0.4 KB) and the wallet cache (balance and history, tens of KB, grows with your transactions) are in the site's IndexedDB, the app shell (≈3 MB) in the service worker cache. Blocks are checked in memory and not stored. The page asks the browser to keep this storage (`navigator.storage.persist()`). On iPhone the app added to the Home Screen has its own storage, separate from Safari: restore the wallet in it again, and note that removing the icon deletes the wallet stored there. Safari itself may clear the storage of a site not opened for 7 days; the Home Screen app is not subject to that.

**Data use:** a wallet downloads 0.8–1.9 KB per block from the node (measured on `node.bytecoin.community`). Normal use and restoring from a backup file take a few MB; a scan of the whole chain (restoring from the phrase without a date) downloads about 2–3 GB, so use Wi-Fi.

**Restoring:** from the backup file it takes seconds (the file knows the creation date). The `.wallet` file of a desktop wallet (walletd 3.x, Bytecoin desktop wallet, BCN Wallet GUI) works too, with that wallet's password, if it is the amethyst type (address starting with `bcnZ`): the phrase, creation date and address count are taken from it. A desktop wallet that was itself restored from its phrase has no creation date (walletd does not record one for amethyst wallets); the page then asks for the approximate date. It is an SQLite file, read by a separate module, `desktop-import.wasm` (SQLite and walletd's CryptoNight/ChaCha code, ≈0.55 MB compressed), which the page loads only when such a file is picked. View-only wallets, Ledger/Trezor wallets and old desktop wallets (address starting with `2`) have no recovery phrase and cannot be imported. You type the desktop wallet's password into this page: check the site address first, and use this only on a site you trust. From the recovery phrase the whole chain since the amethyst upgrade is scanned (≈1.9 million blocks, an hour or more) unless you enter the approximate creation date; a date that is too late misses earlier payments.

## Security

- **Wallet file in IndexedDB** (holds the mnemonic) is encrypted with your PIN (at least 6 characters): ChaCha20 + HMAC-SHA256, keys from PBKDF2-HMAC-SHA512 with 250,000 iterations; the MAC also covers the storage key. The PIN is never stored.
- A 6-digit PIN does not resist an offline attack on a copied browser profile. It protects against casual access to an unlocked device, not against malware. Use a longer PIN for larger amounts.
- **Backup file** (`.amwbackup`, [format](docs/amwbackup-format.md)): mnemonic, creation date, address count and, when the wallet is synced, its state at a block 10 below the top (balance, unspent outputs, history, the date of the first payment). It is encrypted with a separate password (at least 10 characters): AES-256-GCM, key from PBKDF2-HMAC-SHA256 with 600,000 iterations. Restoring from it scans only from the first payment (or from the backup date if there were none), seconds instead of hours from the mnemonic. Wallets imported with a BIP39 passphrase cannot be saved this way, because walletd does not return the passphrase.
- The wallet cache (balance and history, no spend keys) is not encrypted.
- Content-Security-Policy: scripts only from this site, no inline scripts; `unsafe-eval` is required by the Emscripten/embind glue.
- The node you use sees your IP address and which blocks you ask for. Use your own node if that matters.
- Not audited. Read the code; it is small: [`app.js`](app.js) (~900 lines), [`i18n.js`](i18n.js) and the patch.

## Verify the binaries

The `.wasm` and `.js` files in this repository are built reproducibly:

```bash
build/build.sh
sha256sum build/out/*
```

compare with [`SHA256SUMS`](SHA256SUMS) (the normal build, `legacy/` and the desktop import module). The script clones [bytecoinBCN-community/bytecoin](https://github.com/bytecoinBCN-community/bytecoin) at tag `v3.5.1`, applies `build/patches/*.patch`, and compiles in Docker (`emscripten/emsdk:3.1.64`, Boost 1.83 headers from `ubuntu:24.04`; the import module also uses SQLite 3.39.0, which emsdk downloads from sqlite.org and checks by hash). Needs git, Docker and internet access.

## Hosting

Any static HTTPS hosting works: the files in the repository root are the whole site. No build step and no server code.

- **GitHub Pages:** Settings → Pages → *Deploy from a branch*, branch `main`, folder `/ (root)`. `.nojekyll` is included.
- **Cloudflare Pages / Netlify:** upload the repository root (drag and drop works, there are no functions). `_headers` adds security headers there.
- **Apache / shared hosting:** `.htaccess` serves `.wasm` as `application/wasm` and the page, scripts and `.wasm` with `Cache-Control: no-cache` (walletd.js and walletd.wasm only work together, so they must never be stale). Where nginx serves static files itself, check `curl -sI https://<site>/walletd.wasm` and set the same in the hosting panel. The service worker also revalidates every file with the server, so even a long `max-age` from the hosting does not delay updates for the installed app.
- `legacy/` is needed for SeaMonkey and other browsers without WebAssembly exception handling: keep it on the site.
- HTTPS is required on phones (Web Crypto, service worker). `tools/serve.py` is a local test server that can also proxy `/json_rpc`, `/binary_rpc` and `/sync_blocks/` to your own `bytecoind`.

## Files

| File | What it is |
| --- | --- |
| `index.html`, `app.js` | The page: create or restore, PIN, lock, balance, sync, address, send with confirmation, history, backup, node choice |
| `i18n.js`, `lang/*.txt` | Interface languages (8); `tools/check-lang.py` checks the files |
| `qr.js`, `vendor/jsQR.js` | QR code of the address; QR reader for browsers without `BarcodeDetector` (jsQR 1.4.0 from npm, sha512 checked; license in `vendor/jsQR-LICENSE.txt`) |
| `walletd-worker.js`, `walletd.js`, `walletd.wasm` | walletd in a Web Worker |
| `walletworker-main.js`, `walletworker.js`, `walletworker.wasm` | Output scanning workers |
| `legacy/` | The same `walletd` and `walletworker` built for browsers without WebAssembly exception handling |
| `desktop-import-worker.js`, `desktop-import.js`, `desktop-import.wasm` | Reads desktop walletd amethyst `.wallet` files; loaded only for that import ([build/desktop_import.c](build/desktop_import.c)) |
| `sw.js`, `manifest.webmanifest`, `icon*`, `favicon*`, `apple-touch-icon.png` | Installable app (PWA); the app shell works offline, node requests are never cached |
| `_headers`, `.htaccess`, `.nojekyll` | Hosting settings (Cloudflare Pages / Netlify, Apache, GitHub Pages) |
| `build/` | Reproducible build: `build.sh`, `emcc_build.sh`, `patches/` |
| `tools/serve.py` | Local server with an optional node proxy |
| `tools/check-lang.py` | Checks that all language files have the same keys and placeholders |
| `docs/amwbackup-format.md` | The backup file format |

## Limitations

- One amethyst wallet per browser. Legacy (pre-2019) wallets are not supported.
- A transaction not yet accepted by the node is kept in memory only: if the tab is closed before that, send it again.
- Tested in Chromium (both builds) and in WebKit 18.2 through Playwright: create, sync, lock/unlock, wrong PIN, reload, show phrase, backup file, PIN change, forget, restore from backup and from the phrase with a date. On a real iPhone (iOS 27, Safari) the normal build creates and syncs without errors; Playwright's Linux WebKit sometimes stops with "Out of bounds memory access" in the scanner, which the iPhone did not show. Desktop import was tested in Chromium and WebKit with files made by walletd 3.5.1 (with and without a password, with a mnemonic password; view-only, legacy and wrong-password files are refused). Real sending with funds is not verified yet.

## License

LGPL-3.0, like Bytecoin itself. See [LICENSE](LICENSE).

