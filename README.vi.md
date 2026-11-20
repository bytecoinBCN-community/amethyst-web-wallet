# Amethyst Web Wallet

[English](README.md) · [Українська](README.uk.md) · [Español](README.es.md) · [Português](README.pt.md) · [Türkçe](README.tr.md) · [Bahasa Indonesia](README.id.md) · **Tiếng Việt** · [中文](README.zh.md)

Ví Bytecoin (BCN) nhẹ chạy hoàn toàn trong trình duyệt, trên điện thoại hoặc máy tính. Ví không tải chuỗi khối về và không giao khóa của bạn cho máy chủ nào: `walletd` 3.5.1 chính thức của Bytecoin, được biên dịch sang WebAssembly, chạy ngay trong trang và chỉ xin nút những dữ liệu ví cần.

> **Trạng thái: bản thử nghiệm.** Chỉ mới thử với các ví dùng thử. Chỉ giữ số tiền nhỏ ở đây và cất cụm từ khôi phục ngoại tuyến.

## Cách hoạt động

- `walletd.wasm` là `walletd` v3.5.1 của Bytecoin, được Emscripten biên dịch từ mã nguồn mở cùng một bản vá ([build/patches](build/patches)). Nó tạo và khôi phục ví *amethyst* (BIP39, 24 từ), quét các khối bằng khóa xem (view key) của bạn, và lập rồi ký giao dịch ngay trên thiết bị.
- `walletworker.wasm` tìm các đầu ra của ví trong khối. Trang chạy một bản cho mỗi lõi CPU (2–8).
- **Trình duyệt cũ.** Bản dựng thường dùng cơ chế xử lý ngoại lệ của WebAssembly (Firefox 100+, Chrome/Edge 95+, Safari 15.2+). Nếu không có hỗ trợ đó (SeaMonkey, Firefox ESR cũ, Pale Moon và tương tự), trang tải cùng mã ấy từ `legacy/`: ngoại lệ C++ được làm bằng JavaScript, WebAssembly 1.0 và mã kết nối ES2017. Bản này lớn hơn khoảng 25%. Thêm `?engine=legacy` vào địa chỉ để buộc dùng bản này trên mọi trình duyệt, `?engine=normal` để buộc dùng bản thường.
- Nút chỉ cung cấp khối (`sync_blocks`), các đầu ra mồi và nhận giao dịch đã hoàn tất. Nút không bao giờ thấy khóa hay cụm từ. Các đầu ra được kiểm tra ngay tại máy, nên số dư không phụ thuộc vào việc tin nút.
- Mặc định trang kiểm tra song song proxy `/json_rpc` của chính trang (nếu có), nút cộng đồng `node.bytecoin.community`, `node01.bytecoin.org` và `node02.bytecoin.org`, rồi dùng nút đầu tiên trả lời và không bị chậm. Các nút công khai cho phép yêu cầu từ nguồn khác, nên **trang web chỉ cần là hosting tĩnh đơn giản**. Trong thẻ *Nút* bạn có thể chọn nút hoặc nhập nút của riêng mình (`https://host:port`).
- Các nút công khai không chia sẻ nhóm giao dịch chưa xác nhận, nên khoản thanh toán đến chỉ hiện khi có xác nhận đầu tiên (≈2 phút), không sớm hơn.

## Ngôn ngữ

Giao diện có tiếng Anh, Ukraina, Tây Ban Nha, Bồ Đào Nha, Thổ Nhĩ Kỳ, Indonesia, Việt và Trung. Trang chọn theo ngôn ngữ của trình duyệt (nếu không có thì tiếng Anh); menu ở đầu trang đổi ngôn ngữ bất cứ lúc nào mà không đóng ví, và lựa chọn được ghi nhớ trên thiết bị. Cụm từ khôi phục luôn là các từ BIP39 tiếng Anh, bất kể ngôn ngữ giao diện, và nhật ký walletd vẫn bằng tiếng Anh.

Văn bản nằm trong [`lang/`](lang), mỗi chuỗi một dòng `khóa = văn bản`, cùng định dạng với BCN Wallet cho Windows. Để thêm ngôn ngữ: sao chép `lang/en.txt`, dịch phần bên phải (giữ nguyên `{chỗ giữ}`), thêm mã ngôn ngữ vào `LANGS` trong [`i18n.js`](i18n.js) và vào `SHELL` trong `sw.js`, rồi chạy `python3 tools/check-lang.py` để kiểm tra mọi tệp có cùng khóa và chỗ giữ. Văn bản tiếng Anh vẫn nằm trong `index.html`, nên trang vẫn đọc được nếu tệp ngôn ngữ không tải được.

## Cài lên điện thoại

Trang là một ứng dụng cài được (PWA): mở toàn màn hình từ biểu tượng riêng, và giao diện chạy được khi không có mạng.

- **iPhone / iPad:** mở trang trong Safari → *Chia sẻ* → *Thêm vào MH chính*.
- **Android:** Chrome: menu ⋮ → *Cài đặt ứng dụng* (hoặc *Thêm vào màn hình chính*); Samsung Internet: menu ☰ → *Thêm trang vào* → *Màn hình chờ*; Firefox: menu ⋮ → *Cài đặt*. Trên Android trang hiện các bước này, và chuyển sang nút *Cài đặt* khi trình duyệt đề nghị. Trên Android ứng dụng và trình duyệt dùng chung bộ nhớ, nên không cần khôi phục ví lần nữa.

Điện thoại tạm dừng ứng dụng web khi chạy nền: việc quét chỉ chạy khi ứng dụng đang mở và màn hình sáng, rồi tiếp tục từ chỗ dừng khi bạn quay lại. Trên điện thoại, thẻ *Đồng bộ* có **Giữ màn hình sáng khi đang quét** (Screen Wake Lock API: Safari 16.4+, Chrome 84+). Màn hình chỉ được giữ sáng khi ví đang mở và còn đang quét, và được phép tắt khi đã đồng bộ. Trang không thể đổi độ sáng, nên trang nhắc bạn tự giảm độ sáng. Khóa điện thoại hoặc chuyển ứng dụng vẫn tạm dừng việc quét.

**Dữ liệu lưu ở đâu:** tệp ví đã mã hóa (≈0,4 KB) và bộ nhớ đệm của ví (số dư và lịch sử, vài chục KB, tăng theo số giao dịch) nằm trong IndexedDB của trang, giao diện ứng dụng (≈3 MB) nằm trong bộ nhớ đệm của service worker. Các khối được kiểm tra trong bộ nhớ và không được lưu. Trang xin trình duyệt giữ lại bộ nhớ này (`navigator.storage.persist()`). Trên iPhone, ứng dụng được thêm vào màn hình chính có bộ nhớ riêng, tách biệt với Safari: hãy khôi phục ví trong đó một lần nữa, và lưu ý rằng xóa biểu tượng sẽ xóa luôn ví lưu ở đó. Bản thân Safari có thể xóa bộ nhớ của trang không được mở trong 7 ngày; ứng dụng trên màn hình chính không bị ảnh hưởng.

**Dung lượng dữ liệu:** ví tải từ nút 0,8–1,9 KB mỗi khối (đo trên `node.bytecoin.community`). Dùng bình thường và khôi phục từ tệp sao lưu chỉ tốn vài MB; quét toàn bộ chuỗi (khôi phục từ cụm từ không có ngày) tải khoảng 2–3 GB, vì vậy hãy dùng Wi-Fi.

**Khôi phục:** từ tệp sao lưu chỉ mất vài giây (tệp biết ngày tạo). Tệp `.wallet` của ví máy tính (walletd 3.x, ví máy tính của Bytecoin, BCN Wallet GUI) cũng dùng được, với mật khẩu của ví đó, nếu ví thuộc loại amethyst (địa chỉ bắt đầu bằng `bcnZ`): cụm từ, ngày tạo và số địa chỉ được lấy từ tệp. Ví máy tính mà chính nó được khôi phục từ cụm từ thì không có ngày tạo (walletd không ghi ngày này cho ví amethyst); khi đó trang hỏi ngày gần đúng. Đây là tệp SQLite, được đọc bởi một mô-đun riêng, `desktop-import.wasm` (SQLite và mã CryptoNight/ChaCha của walletd, ≈0,55 MB sau nén), trang chỉ tải mô-đun này khi chọn tệp như vậy. Ví chỉ xem, ví Ledger/Trezor và ví máy tính cũ (địa chỉ bắt đầu bằng `2`) không có cụm từ khôi phục nên không nhập được. Bạn nhập mật khẩu của ví máy tính vào trang này: hãy kiểm tra địa chỉ trang trước, và chỉ làm vậy trên trang bạn tin cậy. Từ cụm từ khôi phục, toàn bộ chuỗi kể từ bản nâng cấp amethyst sẽ được quét (≈1,9 triệu khối, một giờ hoặc hơn) trừ khi bạn nhập ngày tạo gần đúng; ngày quá muộn sẽ bỏ sót các khoản thanh toán trước đó.

## Bảo mật

- **Tệp ví trong IndexedDB** (chứa cụm từ) được mã hóa bằng PIN của bạn (ít nhất 6 ký tự): ChaCha20 + HMAC-SHA256, khóa được dẫn xuất bằng PBKDF2-HMAC-SHA512 với 250.000 vòng lặp; MAC cũng bao gồm khóa lưu trữ. PIN không bao giờ được lưu.
- PIN 6 chữ số không chống được tấn công ngoại tuyến vào một hồ sơ trình duyệt bị sao chép. Nó bảo vệ trước việc ai đó tình cờ dùng thiết bị đang mở khóa, không bảo vệ trước phần mềm độc hại. Với số tiền lớn hơn, hãy dùng PIN dài hơn.
- **Tệp sao lưu** (`.amwbackup`, [định dạng](docs/amwbackup-format.md)): cụm từ, ngày tạo, số địa chỉ và, nếu ví đã đồng bộ, trạng thái của ví tại khối thấp hơn đỉnh 10 khối (số dư, đầu ra chưa tiêu, lịch sử, ngày thanh toán đầu tiên). Tệp được mã hóa bằng một mật khẩu riêng (ít nhất 10 ký tự): AES-256-GCM, khóa được dẫn xuất bằng PBKDF2-HMAC-SHA256 với 600.000 vòng lặp. Khôi phục từ tệp chỉ quét từ khoản thanh toán đầu tiên (hoặc từ ngày sao lưu nếu chưa có thanh toán): vài giây thay vì hàng giờ từ cụm từ. Ví được nhập với mật khẩu cụm từ (BIP39 passphrase) không thể lưu theo cách này, vì walletd không trả lại mật khẩu đó.
- Bộ nhớ đệm của ví (số dư và lịch sử, không có khóa chi tiêu) không được mã hóa.
- Content-Security-Policy: chỉ chạy script từ trang này, không có script nội tuyến; `unsafe-eval` là bắt buộc với mã kết nối Emscripten/embind.
- Nút bạn dùng thấy địa chỉ IP của bạn và các khối bạn yêu cầu. Nếu điều này quan trọng, hãy dùng nút riêng.
- Chưa được kiểm toán. Hãy đọc mã, không nhiều: [`app.js`](app.js) (~900 dòng), [`i18n.js`](i18n.js) và bản vá.

## Kiểm tra các tệp nhị phân

Các tệp `.wasm` và `.js` trong kho này được biên dịch có thể tái lập:

```bash
build/build.sh
sha256sum build/out/*
```

rồi so với [`SHA256SUMS`](SHA256SUMS) (bản dựng thường, `legacy/` và mô-đun nhập ví máy tính). Script sao chép [bytecoinBCN-community/bytecoin](https://github.com/bytecoinBCN-community/bytecoin) tại thẻ `v3.5.1`, áp dụng `build/patches/*.patch` và biên dịch trong Docker (`emscripten/emsdk:3.1.64`, header Boost 1.83 từ `ubuntu:24.04`; mô-đun nhập còn dùng SQLite 3.39.0 do emsdk tải từ sqlite.org và kiểm tra bằng hash). Cần git, Docker và truy cập internet.

## Hosting

Mọi hosting tĩnh có HTTPS đều dùng được: các tệp ở thư mục gốc của kho là toàn bộ trang web. Không cần bước biên dịch, không có mã máy chủ.

- **GitHub Pages:** Settings → Pages → *Deploy from a branch*, nhánh `main`, thư mục `/ (root)`. Đã có sẵn `.nojekyll`.
- **Cloudflare Pages / Netlify:** tải lên thư mục gốc của kho (kéo thả được, không có functions). `_headers` thêm các header bảo mật ở đó.
- **Apache / hosting chia sẻ:** `.htaccess` phục vụ `.wasm` dưới dạng `application/wasm` và trang, script cùng `.wasm` với `Cache-Control: no-cache` (walletd.js và walletd.wasm chỉ chạy cùng nhau, nên không bao giờ được cũ). Nếu nginx tự phục vụ tệp tĩnh, hãy kiểm tra `curl -sI https://<trang>/walletd.wasm` và cấu hình tương tự trong bảng điều khiển hosting. Service worker cũng kiểm tra lại từng tệp với máy chủ, nên kể cả `max-age` dài từ hosting cũng không làm chậm cập nhật của ứng dụng đã cài.
- `legacy/` cần cho SeaMonkey và các trình duyệt khác không có xử lý ngoại lệ WebAssembly: hãy giữ nó trên trang.
- Trên điện thoại bắt buộc có HTTPS (Web Crypto, service worker). `tools/serve.py` là máy chủ thử nghiệm cục bộ, cũng có thể chuyển tiếp `/json_rpc`, `/binary_rpc` và `/sync_blocks/` tới `bytecoind` của riêng bạn.

## Tệp

| Tệp | Là gì |
| --- | --- |
| `index.html`, `app.js` | Trang: tạo hoặc khôi phục, PIN, khóa, số dư, đồng bộ, địa chỉ, gửi có xác nhận, lịch sử, sao lưu, chọn nút |
| `i18n.js`, `lang/*.txt` | Ngôn ngữ giao diện (8); `tools/check-lang.py` kiểm tra các tệp |
| `walletd-worker.js`, `walletd.js`, `walletd.wasm` | walletd trong Web Worker |
| `walletworker-main.js`, `walletworker.js`, `walletworker.wasm` | Các worker tìm đầu ra |
| `legacy/` | Cùng `walletd` và `walletworker`, biên dịch cho trình duyệt không có xử lý ngoại lệ WebAssembly |
| `desktop-import-worker.js`, `desktop-import.js`, `desktop-import.wasm` | Đọc tệp `.wallet` amethyst của walletd trên máy tính; chỉ tải khi nhập loại tệp đó ([build/desktop_import.c](build/desktop_import.c)) |
| `sw.js`, `manifest.webmanifest`, `icon*`, `favicon*`, `apple-touch-icon.png` | Ứng dụng cài được (PWA); giao diện chạy không cần mạng, yêu cầu tới nút không bao giờ được lưu đệm |
| `_headers`, `.htaccess`, `.nojekyll` | Thiết lập hosting (Cloudflare Pages / Netlify, Apache, GitHub Pages) |
| `build/` | Biên dịch có thể tái lập: `build.sh`, `emcc_build.sh`, `patches/` |
| `tools/serve.py` | Máy chủ cục bộ với proxy tới nút (tùy chọn) |
| `tools/check-lang.py` | Kiểm tra mọi tệp ngôn ngữ có cùng khóa và chỗ giữ |
| `docs/amwbackup-format.md` | Định dạng tệp sao lưu |

## Hạn chế

- Mỗi trình duyệt một ví amethyst. Không hỗ trợ ví cũ (trước 2019).
- Giao dịch mà nút chưa nhận chỉ được giữ trong bộ nhớ: nếu đóng thẻ trước lúc đó, hãy gửi lại.
- Đã thử trên Chromium (cả hai bản dựng) và trên WebKit 18.2 qua Playwright: tạo, đồng bộ, khóa và mở khóa, sai PIN, tải lại, hiện cụm từ, tệp sao lưu, đổi PIN, quên ví, khôi phục từ bản sao lưu và từ cụm từ có ngày. Trên iPhone thật (iOS 27, Safari) bản dựng thường tạo ví và đồng bộ không lỗi; WebKit trên Linux của Playwright đôi khi dừng với «Out of bounds memory access» trong bộ quét, điều không xảy ra trên iPhone. Việc nhập từ ví máy tính đã thử trên Chromium và WebKit với các tệp do walletd 3.5.1 tạo (có và không có mật khẩu, có mật khẩu cụm từ; tệp chỉ xem, legacy và sai mật khẩu đều bị từ chối). Việc gửi tiền thật chưa được kiểm chứng.

## Giấy phép

LGPL-3.0, giống như chính Bytecoin. Xem [LICENSE](LICENSE).
