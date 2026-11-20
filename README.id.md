# Amethyst Web Wallet

[English](README.md) · [Українська](README.uk.md) · [Español](README.es.md) · [Português](README.pt.md) · [Türkçe](README.tr.md) · **Bahasa Indonesia** · [Tiếng Việt](README.vi.md) · [中文](README.zh.md)

Dompet Bytecoin (BCN) ringan yang sepenuhnya berjalan di peramban, di ponsel maupun komputer. Dompet ini tidak mengunduh blockchain dan tidak menyerahkan kunci Anda ke server: `walletd` 3.5.1 resmi dari Bytecoin, dikompilasi ke WebAssembly, berjalan di dalam halaman dan hanya meminta data yang dibutuhkan dompet dari sebuah node.

> **Status: prototipe.** Hanya diuji dengan dompet uji coba. Simpan hanya jumlah kecil di sini, dan simpan frasa pemulihan secara offline.

## Cara kerja

- `walletd.wasm` adalah `walletd` v3.5.1 dari Bytecoin yang dikompilasi dengan Emscripten dari kode sumber terbuka ditambah satu patch ([build/patches](build/patches)). Ia membuat dan memulihkan dompet *amethyst* (BIP39, 24 kata), memindai blok dengan kunci tampilan (view key) Anda, serta menyusun dan menandatangani transaksi di perangkat.
- `walletworker.wasm` mencari output dompet di dalam blok. Halaman menjalankan satu salinan per inti prosesor (2–8).
- **Peramban lama.** Build normal memakai penanganan eksepsi WebAssembly (Firefox 100+, Chrome/Edge 95+, Safari 15.2+). Jika tidak ada dukungan itu (SeaMonkey, Firefox ESR lama, Pale Moon dan sejenisnya), halaman memuat kode yang sama dari `legacy/`: eksepsi C++ dikerjakan di JavaScript, WebAssembly 1.0 dan kode penghubung ES2017. Ukurannya sekitar 25% lebih besar. `?engine=legacy` di alamat memaksa build ini di peramban apa pun, `?engine=normal` memaksa build normal.
- Node hanya menyajikan blok (`sync_blocks`) dan output pengecoh, serta menerima transaksi yang sudah jadi. Node tidak pernah melihat kunci atau frasa. Output diperiksa secara lokal, jadi saldo tidak bergantung pada kepercayaan pada node.
- Secara bawaan halaman memeriksa secara paralel proxy `/json_rpc` milik situs ini (jika ada), node komunitas `node.bytecoin.community`, `node01.bytecoin.org` dan `node02.bytecoin.org`, lalu memakai yang pertama menjawab dan tidak tertinggal. Node publik mengizinkan permintaan lintas asal, jadi **situs ini cukup berupa hosting statis biasa**. Di kartu *Node* Anda bisa memilih node atau mengisi node sendiri (`https://host:port`).
- Node publik tidak membagikan kumpulan transaksi yang belum dikonfirmasi, jadi pembayaran masuk muncul dengan konfirmasi pertamanya (≈2 menit), tidak lebih awal.

## Bahasa

Antarmuka tersedia dalam bahasa Inggris, Ukraina, Spanyol, Portugis, Turki, Indonesia, Vietnam, dan Tionghoa. Halaman memakai bahasa peramban (jika tidak ada, bahasa Inggris); menu di bagian atas mengubahnya kapan saja tanpa menutup dompet, dan pilihannya diingat di perangkat. Frasa pemulihan selalu berupa kata-kata BIP39 bahasa Inggris, apa pun bahasa antarmukanya, dan log walletd tetap berbahasa Inggris.

Teks ada di [`lang/`](lang), satu baris `kunci = teks` per string, format yang sama dengan BCN Wallet untuk Windows. Untuk menambah bahasa: salin `lang/en.txt`, terjemahkan sisi kanannya (pertahankan `{penanda}`), tambahkan kode bahasa ke `LANGS` di [`i18n.js`](i18n.js) dan ke `SHELL` di `sw.js`, lalu jalankan `python3 tools/check-lang.py` yang memeriksa bahwa semua berkas punya kunci dan penanda yang sama. Teks bahasa Inggris juga tetap ada di `index.html`, jadi halaman tetap terbaca meski berkas bahasa gagal dimuat.

## Memasang di ponsel

Situs ini adalah aplikasi yang bisa dipasang (PWA): terbuka layar penuh dari ikonnya sendiri, dan antarmukanya berjalan tanpa internet.

- **iPhone / iPad:** buka situs di Safari → *Bagikan* → *Tambahkan ke Layar Utama*.
- **Android:** Chrome: menu ⋮ → *Instal aplikasi* (atau *Tambahkan ke layar utama*); Samsung Internet: menu ☰ → *Tambah halaman ke* → *Layar Depan*; Firefox: menu ⋮ → *Instal*. Di Android halaman menampilkan langkah-langkah ini, dan beralih ke tombol *Pasang* saat peramban menawarkannya. Di Android aplikasi dan peramban berbagi penyimpanan, jadi dompet tidak perlu dipulihkan lagi.

Ponsel menjeda aplikasi web di latar belakang: pemindaian hanya berjalan selama aplikasi terbuka dan layar menyala, lalu berlanjut dari titik terakhir saat Anda kembali. Di ponsel, kartu *Sinkronisasi* punya **Biarkan layar menyala selama pemindaian** (Screen Wake Lock API: Safari 16.4+, Chrome 84+). Layar dibiarkan menyala hanya selama dompet terbuka dan masih memindai, lalu boleh mati lagi setelah tersinkron. Halaman tidak bisa mengubah kecerahan, jadi halaman meminta Anda menurunkannya sendiri. Mengunci ponsel atau berpindah aplikasi tetap menjeda pemindaian.

**Di mana data disimpan:** berkas dompet terenkripsi (≈0,4 KB) dan cache dompet (saldo dan riwayat, puluhan KB, bertambah seiring transaksi Anda) ada di IndexedDB situs, antarmuka aplikasi (≈3 MB) di cache service worker. Blok diperiksa di memori dan tidak disimpan. Halaman meminta peramban mempertahankan penyimpanan ini (`navigator.storage.persist()`). Di iPhone, aplikasi yang ditambahkan ke Layar Utama punya penyimpanan sendiri, terpisah dari Safari: pulihkan dompet di dalamnya sekali lagi, dan ingat bahwa menghapus ikon juga menghapus dompet yang tersimpan di sana. Safari sendiri dapat menghapus penyimpanan situs yang tidak dibuka selama 7 hari; aplikasi Layar Utama tidak terkena aturan itu.

**Pemakaian data:** dompet mengunduh 0,8–1,9 KB per blok dari node (diukur di `node.bytecoin.community`). Pemakaian normal dan pemulihan dari berkas cadangan hanya beberapa MB; memindai seluruh rantai (memulihkan dari frasa tanpa tanggal) mengunduh sekitar 2–3 GB, jadi gunakan Wi-Fi.

**Pemulihan:** dari berkas cadangan hanya butuh beberapa detik (berkas mengetahui tanggal pembuatan). Berkas `.wallet` dari dompet desktop (walletd 3.x, dompet desktop Bytecoin, BCN Wallet GUI) juga bisa dipakai, dengan kata sandi dompet itu, jika bertipe amethyst (alamat diawali `bcnZ`): frasa, tanggal pembuatan, dan jumlah alamat diambil darinya. Dompet desktop yang dirinya sendiri dipulihkan dari frasa tidak punya tanggal pembuatan (walletd tidak mencatatnya untuk dompet amethyst); halaman lalu meminta perkiraan tanggalnya. Berkas ini adalah berkas SQLite yang dibaca oleh modul terpisah, `desktop-import.wasm` (SQLite dan kode CryptoNight/ChaCha dari walletd, ≈0,55 MB terkompresi), yang dimuat halaman hanya saat berkas seperti itu dipilih. Dompet hanya-lihat, dompet Ledger/Trezor, dan dompet desktop lama (alamat diawali `2`) tidak punya frasa pemulihan sehingga tidak bisa diimpor. Kata sandi dompet desktop Anda ketik di halaman ini: periksa dulu alamat situsnya, dan lakukan ini hanya di situs yang Anda percayai. Dari frasa pemulihan, seluruh rantai sejak pembaruan amethyst dipindai (≈1,9 juta blok, satu jam atau lebih) kecuali Anda mengisi perkiraan tanggal pembuatan; tanggal yang terlalu lambat akan melewatkan pembayaran sebelumnya.

## Keamanan

- **Berkas dompet di IndexedDB** (berisi frasa) dienkripsi dengan PIN Anda (minimal 6 karakter): ChaCha20 + HMAC-SHA256, kunci diturunkan dengan PBKDF2-HMAC-SHA512 dan 250.000 iterasi; MAC juga mencakup kunci penyimpanan. PIN tidak pernah disimpan.
- PIN 6 digit tidak tahan terhadap serangan offline atas profil peramban yang disalin. PIN melindungi dari akses sembarangan ke perangkat yang tidak terkunci, bukan dari malware. Untuk jumlah yang lebih besar, gunakan PIN yang lebih panjang.
- **Berkas cadangan** (`.amwbackup`, [format](docs/amwbackup-format.md)): frasa, tanggal pembuatan, jumlah alamat dan, jika dompet sudah tersinkron, statusnya di blok 10 di bawah puncak (saldo, output yang belum terpakai, riwayat, tanggal pembayaran pertama). Berkas dienkripsi dengan kata sandi terpisah (minimal 10 karakter): AES-256-GCM, kunci diturunkan dengan PBKDF2-HMAC-SHA256 dan 600.000 iterasi. Pemulihan darinya hanya memindai sejak pembayaran pertama (atau sejak tanggal cadangan jika belum ada pembayaran): beberapa detik, bukan berjam-jam dari frasa. Dompet yang diimpor dengan kata sandi frasa (BIP39 passphrase) tidak bisa disimpan dengan cara ini, karena walletd tidak mengembalikan kata sandi itu.
- Cache dompet (saldo dan riwayat, tanpa kunci pembelanjaan) tidak dienkripsi.
- Content-Security-Policy: skrip hanya dari situs ini, tanpa skrip inline; `unsafe-eval` diperlukan oleh kode penghubung Emscripten/embind.
- Node yang Anda pakai melihat alamat IP Anda dan blok mana yang Anda minta. Jika itu penting, gunakan node sendiri.
- Belum diaudit. Baca kodenya, tidak banyak: [`app.js`](app.js) (~900 baris), [`i18n.js`](i18n.js) dan patch-nya.

## Memverifikasi berkas biner

Berkas `.wasm` dan `.js` di repositori ini dibangun secara reproducible:

```bash
build/build.sh
sha256sum build/out/*
```

lalu bandingkan dengan [`SHA256SUMS`](SHA256SUMS) (build normal, `legacy/` dan modul impor desktop). Skripnya mengkloning [bytecoinBCN-community/bytecoin](https://github.com/bytecoinBCN-community/bytecoin) pada tag `v3.5.1`, menerapkan `build/patches/*.patch`, dan mengompilasi di Docker (`emscripten/emsdk:3.1.64`, header Boost 1.83 dari `ubuntu:24.04`; modul impor juga memakai SQLite 3.39.0 yang diunduh emsdk dari sqlite.org dan diperiksa dengan hash). Membutuhkan git, Docker, dan akses internet.

## Hosting

Hosting statis apa pun dengan HTTPS bisa dipakai: berkas di root repositori adalah seluruh situs. Tanpa langkah build dan tanpa kode server.

- **GitHub Pages:** Settings → Pages → *Deploy from a branch*, branch `main`, folder `/ (root)`. `.nojekyll` sudah disertakan.
- **Cloudflare Pages / Netlify:** unggah root repositori (bisa seret dan lepas, tidak ada functions). `_headers` menambahkan header keamanan di sana.
- **Apache / shared hosting:** `.htaccess` menyajikan `.wasm` sebagai `application/wasm` dan halaman, skrip, serta `.wasm` dengan `Cache-Control: no-cache` (walletd.js dan walletd.wasm hanya bekerja berpasangan, jadi tidak boleh basi). Jika nginx sendiri yang menyajikan berkas statis, periksa `curl -sI https://<situs>/walletd.wasm` dan atur hal yang sama di panel hosting. Service worker juga memvalidasi ulang setiap berkas ke server, jadi `max-age` panjang dari hosting pun tidak menunda pembaruan aplikasi yang terpasang.
- `legacy/` diperlukan untuk SeaMonkey dan peramban lain tanpa penanganan eksepsi WebAssembly: biarkan tetap ada di situs.
- Di ponsel HTTPS wajib (Web Crypto, service worker). `tools/serve.py` adalah server uji lokal yang juga bisa meneruskan `/json_rpc`, `/binary_rpc`, dan `/sync_blocks/` ke `bytecoind` milik Anda.

## Berkas

| Berkas | Isinya |
| --- | --- |
| `index.html`, `app.js` | Halaman: buat atau pulihkan, PIN, kunci, saldo, sinkronisasi, alamat, kirim dengan konfirmasi, riwayat, cadangan, pilihan node |
| `i18n.js`, `lang/*.txt` | Bahasa antarmuka (8); `tools/check-lang.py` memeriksa berkasnya |
| `walletd-worker.js`, `walletd.js`, `walletd.wasm` | walletd di dalam Web Worker |
| `walletworker-main.js`, `walletworker.js`, `walletworker.wasm` | Worker pencari output |
| `legacy/` | `walletd` dan `walletworker` yang sama, dibangun untuk peramban tanpa penanganan eksepsi WebAssembly |
| `desktop-import-worker.js`, `desktop-import.js`, `desktop-import.wasm` | Membaca berkas `.wallet` amethyst dari walletd desktop; dimuat hanya untuk impor itu ([build/desktop_import.c](build/desktop_import.c)) |
| `sw.js`, `manifest.webmanifest`, `icon*`, `favicon*`, `apple-touch-icon.png` | Aplikasi yang bisa dipasang (PWA); antarmuka berjalan tanpa internet, permintaan ke node tidak pernah di-cache |
| `_headers`, `.htaccess`, `.nojekyll` | Pengaturan hosting (Cloudflare Pages / Netlify, Apache, GitHub Pages) |
| `build/` | Build reproducible: `build.sh`, `emcc_build.sh`, `patches/` |
| `tools/serve.py` | Server lokal dengan proxy node opsional |
| `tools/check-lang.py` | Memeriksa bahwa semua berkas bahasa punya kunci dan penanda yang sama |
| `docs/amwbackup-format.md` | Format berkas cadangan |

## Keterbatasan

- Satu dompet amethyst per peramban. Dompet lama (sebelum 2019) tidak didukung.
- Transaksi yang belum diterima node hanya disimpan di memori: jika tab ditutup sebelum itu, kirim lagi.
- Diuji di Chromium (kedua build) dan di WebKit 18.2 melalui Playwright: membuat, sinkronisasi, mengunci dan membuka kunci, PIN salah, memuat ulang, menampilkan frasa, berkas cadangan, mengganti PIN, melupakan, memulihkan dari cadangan dan dari frasa dengan tanggal. Di iPhone sungguhan (iOS 27, Safari) build normal membuat dompet dan tersinkron tanpa galat; WebKit Linux di Playwright kadang berhenti dengan «Out of bounds memory access» di pemindai, yang tidak terjadi di iPhone. Impor desktop diuji di Chromium dan WebKit dengan berkas buatan walletd 3.5.1 (dengan dan tanpa kata sandi, dengan kata sandi frasa; berkas hanya-lihat, legacy, dan dengan kata sandi salah ditolak). Pengiriman dana sungguhan belum diverifikasi.

## Lisensi

LGPL-3.0, sama seperti Bytecoin. Lihat [LICENSE](LICENSE).
