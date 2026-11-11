# Amethyst Web Wallet

A light Bytecoin (BCN) wallet that runs entirely in the browser, on a phone or a desktop. It does not download the blockchain and does not hand your keys to a server: the official Bytecoin `walletd` 3.5.1, compiled to WebAssembly, runs inside the page and asks a node only for the data the wallet needs.

> **Status: prototype.** Tested with throwaway wallets only. Keep only small amounts here, and keep the recovery phrase offline.

## How it works

- `walletd.wasm` is Bytecoin `walletd` v3.5.1 built with Emscripten from public sources plus one patch ([build/patches](build/patches)). It creates and restores *amethyst* (BIP39, 24 words) wallets, scans blocks with your view key, and builds and signs transactions on the device.
- `walletworker.wasm` finds the wallet's outputs in blocks. The page runs one copy per CPU core (2–8).
- The node only serves blocks (`sync_blocks`), decoy outputs and accepts finished transactions. It never sees keys or the mnemonic. Outputs are checked locally, so the node is not trusted with balances.
- By default the page checks this site's own `/json_rpc` proxy (if any), `node01.bytecoin.org` and `node02.bytecoin.org` in parallel, and uses the first one that answers and is not behind. The public nodes allow cross-origin requests, so **the site itself can be plain static hosting**. You can pick a node or enter your own (`https://host:port`) in the *Node* card.
- The public nodes do not share their memory pool, so an incoming payment appears with its first confirmation (≈2 min), not earlier.

## Security

- **Wallet file in IndexedDB** (holds the mnemonic) is encrypted with your PIN (at least 6 characters): ChaCha20 + HMAC-SHA256, keys from PBKDF2-HMAC-SHA512 with 250,000 iterations; the MAC also covers the storage key. The PIN is never stored.
- A 6-digit PIN does not resist an offline attack on a copied browser profile. It protects against casual access to an unlocked device, not against malware. Use a longer PIN for larger amounts.
- **Backup file** (`.amwbackup`): mnemonic, creation date and address count, encrypted with a separate password (at least 10 characters): AES-256-GCM, key from PBKDF2-HMAC-SHA256 with 600,000 iterations. Restoring from it scans only blocks after the creation date (seconds instead of about two hours from the mnemonic).
- The wallet cache (balance and history, no spend keys) is not encrypted.
- Content-Security-Policy: scripts only from this site, no inline scripts; `unsafe-eval` is required by the Emscripten/embind glue.
- The node you use sees your IP address and which blocks you ask for. Use your own node if that matters.
- Not audited. Read the code; it is small: [`app.js`](app.js) (~580 lines) and the patch.

## Verify the binaries

The `.wasm` and `.js` files in this repository are built reproducibly:

```bash
build/build.sh
sha256sum build/out/*
```

compare with [`SHA256SUMS`](SHA256SUMS). The script clones [bytecoinBCN-community/bytecoin](https://github.com/bytecoinBCN-community/bytecoin) at tag `v3.5.1`, applies `build/patches/*.patch`, and compiles in Docker (`emscripten/emsdk:3.1.64`, Boost 1.83 headers from `ubuntu:24.04`). Needs git and Docker.

## Hosting

Any static HTTPS hosting works: the files in the repository root are the whole site. No build step and no server code.

- **GitHub Pages:** Settings → Pages → *Deploy from a branch*, branch `main`, folder `/ (root)`. `.nojekyll` is included.
- **Cloudflare Pages / Netlify:** upload the repository root (drag and drop works, there are no functions). `_headers` adds security headers there.
- HTTPS is required on phones (Web Crypto, service worker). `tools/serve.py` is a local test server that can also proxy `/json_rpc`, `/binary_rpc` and `/sync_blocks/` to your own `bytecoind`.

## Files

| File | What it is |
| --- | --- |
| `index.html`, `app.js` | The page: create or restore, PIN, lock, balance, sync, address, send with confirmation, history, backup, node choice |
| `walletd-worker.js`, `walletd.js`, `walletd.wasm` | walletd in a Web Worker |
| `walletworker-main.js`, `walletworker.js`, `walletworker.wasm` | Output scanning workers |
| `sw.js`, `manifest.webmanifest`, `icon*`, `favicon*`, `apple-touch-icon.png` | Installable app (PWA); the app shell works offline, node requests are never cached |
| `_headers`, `.nojekyll` | Hosting settings |
| `build/` | Reproducible build: `build.sh`, `emcc_build.sh`, `patches/` |
| `tools/serve.py` | Local server with an optional node proxy |

## Limitations

- One amethyst wallet per browser. Legacy (pre-2019) wallets are not supported.
- A transaction not yet accepted by the node is kept in memory only: if the tab is closed before that, send it again.
- Tested in Chromium. Safari/iOS and real sending with funds are not verified yet.

## License

LGPL-3.0, like Bytecoin itself. See [LICENSE](LICENSE).

