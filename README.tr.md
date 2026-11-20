# Amethyst Web Wallet

[English](README.md) · [Українська](README.uk.md) · [Español](README.es.md) · [Português](README.pt.md) · **Türkçe** · [Bahasa Indonesia](README.id.md) · [Tiếng Việt](README.vi.md) · [中文](README.zh.md)

Tamamen tarayıcıda, telefonda veya bilgisayarda çalışan hafif bir Bytecoin (BCN) cüzdanı. Blok zincirini indirmez ve anahtarlarınızı hiçbir sunucuya vermez: WebAssembly'ye derlenmiş resmi Bytecoin `walletd` 3.5.1 sayfanın içinde çalışır ve bir düğümden yalnızca cüzdanın ihtiyaç duyduğu verileri ister.

> **Durum: prototip.** Yalnızca deneme cüzdanlarıyla test edildi. Burada yalnızca küçük tutarlar tutun ve kurtarma ifadesini çevrimdışı saklayın.

## Nasıl çalışır

- `walletd.wasm`, Bytecoin `walletd` v3.5.1'in açık kaynak kodundan ve bir yamadan ([build/patches](build/patches)) Emscripten ile derlenmiş halidir. *amethyst* (BIP39, 24 kelime) cüzdanlarını oluşturur ve geri yükler, blokları görüntüleme anahtarınızla tarar, işlemleri cihazda oluşturup imzalar.
- `walletworker.wasm` cüzdanın çıktılarını bloklarda arar. Sayfa her işlemci çekirdeği için bir kopya çalıştırır (2–8).
- **Eski tarayıcılar.** Normal derleme WebAssembly istisna işlemeyi kullanır (Firefox 100+, Chrome/Edge 95+, Safari 15.2+). Bu desteğin olmadığı yerlerde (SeaMonkey, eski Firefox ESR, Pale Moon ve benzerleri) sayfa aynı kodu `legacy/` klasöründen yükler: C++ istisnaları JavaScript'te yapılır, WebAssembly 1.0 ve ES2017 bağlama kodu kullanılır. Yaklaşık %25 daha büyüktür. Adresteki `?engine=legacy` onu her tarayıcıda zorlar, `?engine=normal` ise normal derlemeyi.
- Düğüm yalnızca blokları (`sync_blocks`) ve tuzak çıktıları sunar ve hazır işlemleri kabul eder. Anahtarları veya ifadeyi asla görmez. Çıktılar yerel olarak kontrol edilir, bu yüzden bakiye konusunda düğüme güvenmek gerekmez.
- Varsayılan olarak sayfa, sitenin kendi `/json_rpc` proxy'sini (varsa), topluluk düğümü `node.bytecoin.community`, `node01.bytecoin.org` ve `node02.bytecoin.org` düğümlerini paralel kontrol eder ve yanıt veren, geride olmayan ilk düğümü kullanır. Herkese açık düğümler başka kökenlerden gelen isteklere izin verir, bu yüzden **site basit bir statik barındırma olabilir**. *Düğüm* kartında bir düğüm seçebilir veya kendinizinkini (`https://host:port`) girebilirsiniz.
- Herkese açık düğümler onaylanmamış işlem havuzlarını paylaşmaz, bu yüzden gelen bir ödeme ilk onayıyla (≈2 dk) görünür, daha önce değil.
- **QR kodları.** Alma adresinin altındaki *QR kodunu göster*, `bytecoin:<adres>` kodunu (Windows için BCN Wallet ile aynı) bağımlılıksız küçük bir kodlayıcı olan `qr.js` ile çizer. Alıcı alanının yanındaki *Tara*, kamerayla QR kodu okur: Android'deki Chrome yerleşik `BarcodeDetector`'ı kullanır; diğer tarayıcılar `vendor/jsQR.js` dosyasını ([jsQR](https://github.com/cozmo/jsQR) 1.4.0, Apache-2.0, sıkıştırılmış ≈57 KB) yalnızca *Tara*'ya dokunduğunuzda yükler. Koddan yalnızca adres alınır, tutar asla alınmaz. Kamera yalnızca tarayıcı açıkken çalışır ve `Permissions-Policy` ona yalnızca bu site için izin verir.

## Diller

Arayüz İngilizce, Ukraynaca, İspanyolca, Portekizce, Türkçe, Endonezyaca, Vietnamca ve Çince'dir. Sayfa tarayıcının dilini seçer (yoksa İngilizce); başlıktaki menü cüzdanı kapatmadan dili istediğiniz zaman değiştirir ve seçim cihazda hatırlanır. Kurtarma ifadesi, arayüz dili ne olursa olsun her zaman İngilizce BIP39 kelimelerinden oluşur; walletd günlüğü de İngilizce kalır.

Metinler [`lang/`](lang) klasöründedir, her metin için bir `anahtar = metin` satırı, Windows için BCN Wallet ile aynı biçimde. Dil eklemek için: `lang/en.txt` dosyasını kopyalayın, sağ tarafları çevirin (`{yer tutucuları}` koruyarak), dil kodunu [`i18n.js`](i18n.js) içindeki `LANGS` listesine ve `sw.js` içindeki `SHELL` listesine ekleyin ve tüm dosyaların aynı anahtar ve yer tutuculara sahip olduğunu kontrol eden `python3 tools/check-lang.py` komutunu çalıştırın. İngilizce metin `index.html` içinde de kalır, bu yüzden bir dil dosyası yüklenemese bile sayfa okunur.

## Telefona yükleme

Site yüklenebilir bir uygulamadır (PWA): kendi simgesinden tam ekran açılır ve arayüz çevrimdışı çalışır.

- **iPhone / iPad:** siteyi Safari'de açın → *Paylaş* → *Ana Ekrana Ekle*.
- **Android:** Chrome: ⋮ menüsü → *Uygulamayı yükle* (veya *Ana ekrana ekle*); Samsung Internet: ☰ menüsü → *Sayfayı şuraya ekle* → *Ana ekran*; Firefox: ⋮ menüsü → *Yükle*. Android'de sayfa bu adımları gösterir ve tarayıcı teklif ettiğinde bir *Yükle* düğmesine geçer. Android'de uygulama ve tarayıcı depolamayı paylaşır, bu yüzden cüzdanı yeniden geri yüklemek gerekmez.

Telefonlar arka plandaki web uygulamalarını duraklatır: tarama yalnızca uygulama açık ve ekran açıkken ilerler, geri döndüğünüzde kaldığı yerden devam eder. Telefonlarda *Eşitleme* kartında **Tarama sırasında ekranı açık tut** seçeneği vardır (Screen Wake Lock API: Safari 16.4+, Chrome 84+). Ekranı yalnızca cüzdan açıkken ve tarama sürerken açık tutar, eşitleme bitince ekranın kapanmasına izin verir. Bir sayfa parlaklığı değiştiremez, bu yüzden sayfa sizden parlaklığı kendiniz azaltmanızı ister. Telefonu kilitlemek veya başka bir uygulamaya geçmek taramayı yine de duraklatır.

**Veriler nerede durur:** şifreli cüzdan dosyası (≈0,4 KB) ve cüzdan önbelleği (bakiye ve geçmiş, onlarca KB, işlemlerinizle büyür) sitenin IndexedDB'sinde, uygulama arayüzü (≈3 MB) service worker önbelleğindedir. Bloklar bellekte kontrol edilir ve saklanmaz. Sayfa tarayıcıdan bu depolamayı korumasını ister (`navigator.storage.persist()`). iPhone'da Ana Ekrana eklenen uygulamanın Safari'den ayrı kendi depolaması vardır: cüzdanı orada yeniden geri yükleyin ve simgeyi silmenin oradaki cüzdanı da sildiğini unutmayın. Safari, 7 gündür açılmayan bir sitenin depolamasını silebilir; Ana Ekran uygulaması bundan etkilenmez.

**Veri kullanımı:** cüzdan düğümden blok başına 0,8–1,9 KB indirir (`node.bytecoin.community` üzerinde ölçüldü). Normal kullanım ve yedek dosyasından geri yükleme birkaç MB tutar; tüm zinciri taramak (tarih olmadan ifadeden geri yükleme) yaklaşık 2–3 GB indirir, bu yüzden Wi-Fi kullanın.

**Geri yükleme:** yedek dosyasından saniyeler sürer (dosya oluşturma tarihini bilir). Bir masaüstü cüzdanının (walletd 3.x, Bytecoin masaüstü cüzdanı, BCN Wallet GUI) `.wallet` dosyası da o cüzdanın parolasıyla çalışır, eğer amethyst türündeyse (adresi `bcnZ` ile başlar): ifade, oluşturma tarihi ve adres sayısı ondan alınır. Kendisi ifadeden geri yüklenmiş bir masaüstü cüzdanının oluşturma tarihi yoktur (walletd bunu amethyst cüzdanları için kaydetmez); bu durumda sayfa yaklaşık tarihi sorar. Bu bir SQLite dosyasıdır ve ayrı bir modül olan `desktop-import.wasm` tarafından okunur (SQLite ve walletd'nin CryptoNight/ChaCha kodu, sıkıştırılmış ≈0,55 MB); sayfa onu yalnızca böyle bir dosya seçildiğinde yükler. Yalnızca görüntüleme cüzdanları, Ledger/Trezor cüzdanları ve eski masaüstü cüzdanları (adresi `2` ile başlar) kurtarma ifadesine sahip değildir ve içe aktarılamaz. Masaüstü cüzdanının parolasını bu sayfaya yazarsınız: önce site adresini kontrol edin ve bunu yalnızca güvendiğiniz bir sitede yapın. Kurtarma ifadesinden, yaklaşık oluşturma tarihini girmezseniz amethyst güncellemesinden bu yana tüm zincir taranır (≈1,9 milyon blok, bir saat veya daha uzun); çok geç bir tarih önceki ödemeleri kaçırır.

## Güvenlik

- **IndexedDB'deki cüzdan dosyası** (ifadeyi içerir) PIN'inizle şifrelenir (en az 6 karakter): ChaCha20 + HMAC-SHA256, anahtarlar 250.000 yinelemeli PBKDF2-HMAC-SHA512 ile türetilir; MAC depolama anahtarını da kapsar. PIN hiçbir yerde saklanmaz.
- 6 haneli bir PIN, kopyalanmış bir tarayıcı profiline karşı çevrimdışı saldırıya dayanmaz. Kilidi açık bir cihaza gelişigüzel erişime karşı korur, kötü amaçlı yazılımlara karşı değil. Daha büyük tutarlar için daha uzun bir PIN kullanın.
- **Yedek dosyası** (`.amwbackup`, [biçim](docs/amwbackup-format.md)): ifade, oluşturma tarihi, adres sayısı ve cüzdan eşitlenmişse zirvenin 10 blok altındaki bir bloktaki durumu (bakiye, harcanmamış çıktılar, geçmiş, ilk ödemenin tarihi). Ayrı bir parolayla (en az 10 karakter) şifrelenir: AES-256-GCM, anahtar 600.000 yinelemeli PBKDF2-HMAC-SHA256 ile türetilir. Ondan geri yükleme yalnızca ilk ödemeden itibaren tarar (ödeme yoksa yedek tarihinden): ifadeden saatler yerine saniyeler. Bir ifade parolasıyla (BIP39 passphrase) içe aktarılan cüzdanlar bu şekilde kaydedilemez, çünkü walletd bu parolayı geri vermez.
- Cüzdan önbelleği (bakiye ve geçmiş, harcama anahtarları yok) şifrelenmez.
- Content-Security-Policy: yalnızca bu sitenin betikleri, satır içi betik yok; `unsafe-eval` Emscripten/embind bağlama kodu için gereklidir.
- Kullandığınız düğüm IP adresinizi ve hangi blokları istediğinizi görür. Bu önemliyse kendi düğümünüzü kullanın.
- Denetlenmedi. Kodu okuyun, az: [`app.js`](app.js) (~900 satır), [`i18n.js`](i18n.js) ve yama.

## İkili dosyaları doğrulama

Bu depodaki `.wasm` ve `.js` dosyaları yeniden üretilebilir şekilde derlenir:

```bash
build/build.sh
sha256sum build/out/*
```

ve [`SHA256SUMS`](SHA256SUMS) ile karşılaştırın (normal derleme, `legacy/` ve masaüstü içe aktarma modülü). Betik [bytecoinBCN-community/bytecoin](https://github.com/bytecoinBCN-community/bytecoin) deposunu `v3.5.1` etiketinde klonlar, `build/patches/*.patch` yamalarını uygular ve Docker'da derler (`emscripten/emsdk:3.1.64`, `ubuntu:24.04` içinden Boost 1.83 başlıkları; içe aktarma modülü ayrıca emsdk'nin sqlite.org'dan indirip hash ile doğruladığı SQLite 3.39.0'ı kullanır). git, Docker ve internet erişimi gerekir.

## Barındırma

HTTPS'li her statik barındırma çalışır: depo kökündeki dosyalar sitenin tamamıdır. Derleme adımı ve sunucu kodu yoktur.

- **GitHub Pages:** Settings → Pages → *Deploy from a branch*, dal `main`, klasör `/ (root)`. `.nojekyll` dahildir.
- **Cloudflare Pages / Netlify:** depo kökünü yükleyin (sürükle-bırak çalışır, fonksiyon yoktur). `_headers` orada güvenlik başlıklarını ekler.
- **Apache / paylaşımlı barındırma:** `.htaccess`, `.wasm` dosyalarını `application/wasm` olarak ve sayfayı, betikleri ve `.wasm` dosyalarını `Cache-Control: no-cache` ile sunar (walletd.js ve walletd.wasm yalnızca birlikte çalışır, bu yüzden asla eski kalmamalıdır). Statik dosyaları nginx'in kendisi sunuyorsa `curl -sI https://<site>/walletd.wasm` ile kontrol edin ve aynısını barındırma panelinde ayarlayın. Service worker da her dosyayı sunucuyla yeniden doğrular, bu yüzden barındırmanın uzun bir `max-age` değeri bile yüklü uygulamanın güncellemelerini geciktirmez.
- `legacy/`, SeaMonkey ve WebAssembly istisna işlemesi olmayan diğer tarayıcılar için gereklidir: sitede tutun.
- Telefonlarda HTTPS gerekir (Web Crypto, service worker). `tools/serve.py`, `/json_rpc`, `/binary_rpc` ve `/sync_blocks/` isteklerini kendi `bytecoind`'inize de aktarabilen yerel bir test sunucusudur.

## Dosyalar

| Dosya | Nedir |
| --- | --- |
| `index.html`, `app.js` | Sayfa: oluşturma veya geri yükleme, PIN, kilit, bakiye, eşitleme, adres, onaylı gönderim, geçmiş, yedek, düğüm seçimi |
| `i18n.js`, `lang/*.txt` | Arayüz dilleri (8); `tools/check-lang.py` dosyaları kontrol eder |
| `qr.js`, `vendor/jsQR.js` | Adresin QR kodu; `BarcodeDetector` olmayan tarayıcılar için QR okuyucu (npm'den jsQR 1.4.0, sha512 doğrulandı; lisans `vendor/jsQR-LICENSE.txt` içinde) |
| `walletd-worker.js`, `walletd.js`, `walletd.wasm` | Web Worker içinde walletd |
| `walletworker-main.js`, `walletworker.js`, `walletworker.wasm` | Çıktıları arayan worker'lar |
| `legacy/` | WebAssembly istisna işlemesi olmayan tarayıcılar için derlenmiş aynı `walletd` ve `walletworker` |
| `desktop-import-worker.js`, `desktop-import.js`, `desktop-import.wasm` | Masaüstü walletd'nin amethyst `.wallet` dosyalarını okur; yalnızca bu içe aktarma için yüklenir ([build/desktop_import.c](build/desktop_import.c)) |
| `sw.js`, `manifest.webmanifest`, `icon*`, `favicon*`, `apple-touch-icon.png` | Yüklenebilir uygulama (PWA); arayüz çevrimdışı çalışır, düğüm istekleri asla önbelleğe alınmaz |
| `_headers`, `.htaccess`, `.nojekyll` | Barındırma ayarları (Cloudflare Pages / Netlify, Apache, GitHub Pages) |
| `build/` | Yeniden üretilebilir derleme: `build.sh`, `emcc_build.sh`, `patches/` |
| `tools/serve.py` | İsteğe bağlı düğüm proxy'si olan yerel sunucu |
| `tools/check-lang.py` | Tüm dil dosyalarının aynı anahtar ve yer tutuculara sahip olduğunu kontrol eder |
| `docs/amwbackup-format.md` | Yedek dosyası biçimi |

## Sınırlamalar

- Tarayıcı başına bir amethyst cüzdanı. Eski (2019 öncesi) cüzdanlar desteklenmez.
- Düğümün henüz kabul etmediği bir işlem yalnızca bellekte tutulur: sekme bundan önce kapanırsa işlemi yeniden gönderin.
- Chromium'da (iki derleme) ve Playwright üzerinden WebKit 18.2'de test edildi: oluşturma, eşitleme, kilitleme ve kilit açma, yanlış PIN, yeniden yükleme, ifadeyi gösterme, yedek dosyası, PIN değiştirme, unutma, yedekten ve tarihli ifadeden geri yükleme. Gerçek bir iPhone'da (iOS 27, Safari) normal derleme hatasız oluşturur ve eşitler; Playwright'ın Linux WebKit'i tarayıcıda bazen «Out of bounds memory access» hatasıyla durur, iPhone'da bu görülmedi. Masaüstünden içe aktarma, walletd 3.5.1 ile oluşturulan dosyalarla Chromium ve WebKit'te test edildi (parolalı ve parolasız, ifade parolalı; yalnızca görüntüleme, legacy ve yanlış parolalı dosyalar reddedilir). Gerçek fon gönderimi henüz doğrulanmadı.

## Lisans

Bytecoin'in kendisi gibi LGPL-3.0. Bkz. [LICENSE](LICENSE).
