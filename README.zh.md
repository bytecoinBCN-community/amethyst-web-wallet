# Amethyst Web Wallet

[English](README.md) · [Українська](README.uk.md) · [Español](README.es.md) · [Português](README.pt.md) · [Türkçe](README.tr.md) · [Bahasa Indonesia](README.id.md) · [Tiếng Việt](README.vi.md) · **中文**

一个完全在浏览器中运行的 Bytecoin（BCN）轻钱包，手机和电脑均可使用。它不下载区块链，也不会把您的密钥交给任何服务器：编译为 WebAssembly 的官方 Bytecoin `walletd` 3.5.1 在页面内运行，只向节点请求钱包所需的数据。

> **状态：原型。** 仅用一次性测试钱包测试过。请只在此存放小额资金，并离线保管助记词。

## 工作原理

- `walletd.wasm` 是用 Emscripten 从公开源码加一个补丁（[build/patches](build/patches)）编译的 Bytecoin `walletd` v3.5.1。它创建和恢复 *amethyst*（BIP39，24 个单词）钱包，用您的查看密钥扫描区块，并在设备上构建和签名交易。
- `walletworker.wasm` 在区块中查找钱包的输出。页面为每个 CPU 核心运行一个副本（2–8 个）。
- **旧浏览器。** 常规版本使用 WebAssembly 异常处理（Firefox 100+、Chrome/Edge 95+、Safari 15.2+）。若浏览器不支持（SeaMonkey、旧版 Firefox ESR、Pale Moon 等），页面会从 `legacy/` 加载相同的代码：C++ 异常由 JavaScript 实现，使用 WebAssembly 1.0 和 ES2017 胶水代码，体积约大 25%。在地址中加 `?engine=legacy` 可在任何浏览器中强制使用它，`?engine=normal` 则强制使用常规版本。
- 节点只提供区块（`sync_blocks`）和混淆用的输出，并接收已完成的交易。它永远看不到密钥或助记词。输出在本地校验，因此余额无需信任节点。
- 默认情况下，页面会并行检查本站自己的 `/json_rpc` 代理（如有）、社区节点 `node.bytecoin.community`、`node01.bytecoin.org` 和 `node02.bytecoin.org`，并使用第一个有响应且不落后的节点。公共节点允许跨域请求，因此**网站本身只需普通的静态托管**。您可以在“节点”卡片中选择节点或填写自己的节点（`https://host:port`）。
- 公共节点不共享未确认交易池，因此收到的付款会在第一次确认时（约 2 分钟）显示，不会更早。

## 语言

界面提供英语、乌克兰语、西班牙语、葡萄牙语、土耳其语、印尼语、越南语和中文。页面会采用浏览器的语言（否则为英语）；页眉中的菜单可随时切换语言而不关闭钱包，选择会保存在设备上。无论界面语言如何，助记词始终是英文 BIP39 单词，walletd 日志也保持英文。

文本位于 [`lang/`](lang)，每条字符串一行 `键 = 文本`，与 Windows 版 BCN Wallet 格式相同。添加语言的方法：复制 `lang/en.txt`，翻译右侧内容（保留 `{占位符}`），把语言代码加入 [`i18n.js`](i18n.js) 中的 `LANGS` 和 `sw.js` 中的 `SHELL`，然后运行 `python3 tools/check-lang.py`，它会检查所有文件的键和占位符是否一致。英文文本也保留在 `index.html` 中，因此即使语言文件加载失败，页面仍可阅读。

## 安装到手机

本站是可安装的应用（PWA）：从自己的图标全屏打开，界面可离线使用。

- **iPhone / iPad：** 在 Safari 中打开本站 → *分享* → *添加到主屏幕*。
- **Android：** Chrome：菜单 ⋮ → *安装应用*（或 *添加到主屏幕*）；三星浏览器：菜单 ☰ → *添加页面至* → *主屏幕*；Firefox：菜单 ⋮ → *安装*。在 Android 上页面会显示这些步骤，浏览器提供安装时会换成*安装*按钮。在 Android 上应用和浏览器共用存储，因此无需再次恢复钱包。

手机会在后台暂停网页应用：只有应用打开且屏幕亮着时才会扫描，返回后从中断处继续。手机上的“同步”卡片有**扫描时保持屏幕常亮**选项（Screen Wake Lock API：Safari 16.4+、Chrome 84+）。它只在钱包打开且仍在扫描时保持屏幕常亮，同步完成后允许屏幕照常熄灭。网页无法调节亮度，因此页面会提醒您自己调低亮度。锁定手机或切换应用仍会暂停扫描。

**数据存放位置：** 加密的钱包文件（约 0.4 KB）和钱包缓存（余额和历史，几十 KB，随交易增多）保存在本站的 IndexedDB 中，应用界面（约 3 MB）保存在 service worker 缓存中。区块只在内存中校验，不会保存。页面会请求浏览器保留这些存储（`navigator.storage.persist()`）。在 iPhone 上，添加到主屏幕的应用拥有独立于 Safari 的存储：请在其中重新恢复钱包，并注意删除图标也会删除其中的钱包。Safari 本身可能会清除 7 天未打开的网站的存储；主屏幕应用不受此影响。

**流量：** 钱包每个区块从节点下载 0.8–1.9 KB（在 `node.bytecoin.community` 上测得）。日常使用和从备份文件恢复只需几 MB；扫描整条链（不填日期用助记词恢复）约下载 2–3 GB，请使用 Wi-Fi。

**恢复：** 从备份文件恢复只需几秒（文件记得创建日期）。桌面钱包（walletd 3.x、Bytecoin 桌面钱包、BCN Wallet GUI）的 `.wallet` 文件也可以使用，需要该钱包的密码，且必须是 amethyst 类型（地址以 `bcnZ` 开头）：助记词、创建日期和地址数量都从中读取。本身是用助记词恢复的桌面钱包没有创建日期（walletd 不为 amethyst 钱包记录这一日期）；此时页面会询问大致日期。该文件是 SQLite 文件，由单独的模块 `desktop-import.wasm` 读取（包含 SQLite 和 walletd 的 CryptoNight/ChaCha 代码，压缩后约 0.55 MB），页面只在选择此类文件时才加载它。只读钱包、Ledger/Trezor 钱包和旧桌面钱包（地址以 `2` 开头）没有助记词，无法导入。桌面钱包的密码需要在本页输入：请先核对网站地址，只在信任的网站上这样做。用助记词恢复时，若不填写大致创建日期，将扫描自 amethyst 升级以来的整条链（约 190 万个区块，需要一小时或更久）；日期填得太晚会漏掉之前的付款。

## 安全

- **IndexedDB 中的钱包文件**（包含助记词）用您的 PIN（至少 6 个字符）加密：ChaCha20 + HMAC-SHA256，密钥由 PBKDF2-HMAC-SHA512 经 250,000 次迭代派生；MAC 同时覆盖存储键。PIN 从不保存。
- 6 位数字 PIN 无法抵御针对被复制的浏览器配置文件的离线攻击。它防的是他人随手使用已解锁的设备，而不是恶意软件。金额较大时请使用更长的 PIN。
- **备份文件**（`.amwbackup`，[格式](docs/amwbackup-format.md)）：助记词、创建日期、地址数量，以及钱包已同步时它在距最高区块 10 个区块处的状态（余额、未花费输出、历史、第一笔付款的日期）。文件用单独的密码（至少 10 个字符）加密：AES-256-GCM，密钥由 PBKDF2-HMAC-SHA256 经 600,000 次迭代派生。用它恢复时只从第一笔付款开始扫描（若没有付款则从备份日期开始）：几秒钟，而用助记词需要几个小时。用助记词密码（BIP39 passphrase）导入的钱包无法这样保存，因为 walletd 不会返回该密码。
- 钱包缓存（余额和历史，不含花费密钥）未加密。
- Content-Security-Policy：只允许本站脚本，不允许内联脚本；Emscripten/embind 胶水代码需要 `unsafe-eval`。
- 您使用的节点能看到您的 IP 地址以及您请求了哪些区块。如果这很重要，请使用自己的节点。
- 未经审计。请阅读代码，代码量不大：[`app.js`](app.js)（约 900 行）、[`i18n.js`](i18n.js) 和补丁。

## 验证二进制文件

本仓库中的 `.wasm` 和 `.js` 文件可复现构建：

```bash
build/build.sh
sha256sum build/out/*
```

然后与 [`SHA256SUMS`](SHA256SUMS) 比对（常规版本、`legacy/` 和桌面导入模块）。脚本会克隆 [bytecoinBCN-community/bytecoin](https://github.com/bytecoinBCN-community/bytecoin) 的 `v3.5.1` 标签，应用 `build/patches/*.patch`，并在 Docker 中编译（`emscripten/emsdk:3.1.64`，Boost 1.83 头文件来自 `ubuntu:24.04`；导入模块还使用 SQLite 3.39.0，由 emsdk 从 sqlite.org 下载并按哈希校验）。需要 git、Docker 和网络连接。

## 托管

任何支持 HTTPS 的静态托管都可以：仓库根目录中的文件就是整个网站。无需构建步骤，也没有服务器代码。

- **GitHub Pages：** Settings → Pages → *Deploy from a branch*，分支 `main`，文件夹 `/ (root)`。已包含 `.nojekyll`。
- **Cloudflare Pages / Netlify：** 上传仓库根目录（可直接拖放，没有 functions）。`_headers` 会在那里添加安全响应头。
- **Apache / 共享主机：** `.htaccess` 将 `.wasm` 以 `application/wasm` 类型提供，并为页面、脚本和 `.wasm` 设置 `Cache-Control: no-cache`（walletd.js 和 walletd.wasm 只能配套使用，因此绝不能使用旧版本）。如果静态文件由 nginx 直接提供，请用 `curl -sI https://<网站>/walletd.wasm` 检查，并在主机面板中做相同设置。service worker 也会向服务器重新校验每个文件，因此即使主机设置了较长的 `max-age`，也不会延迟已安装应用的更新。
- `legacy/` 是 SeaMonkey 和其他不支持 WebAssembly 异常处理的浏览器所必需的：请保留在网站上。
- 手机上必须使用 HTTPS（Web Crypto、service worker）。`tools/serve.py` 是本地测试服务器，也可以把 `/json_rpc`、`/binary_rpc` 和 `/sync_blocks/` 转发到您自己的 `bytecoind`。

## 文件

| 文件 | 说明 |
| --- | --- |
| `index.html`、`app.js` | 页面：创建或恢复、PIN、锁定、余额、同步、地址、带确认的发送、历史、备份、节点选择 |
| `i18n.js`、`lang/*.txt` | 界面语言（8 种）；`tools/check-lang.py` 检查这些文件 |
| `walletd-worker.js`、`walletd.js`、`walletd.wasm` | 在 Web Worker 中运行的 walletd |
| `walletworker-main.js`、`walletworker.js`、`walletworker.wasm` | 查找输出的 worker |
| `legacy/` | 为不支持 WebAssembly 异常处理的浏览器构建的相同 `walletd` 和 `walletworker` |
| `desktop-import-worker.js`、`desktop-import.js`、`desktop-import.wasm` | 读取桌面 walletd 的 amethyst `.wallet` 文件；仅在此类导入时加载（[build/desktop_import.c](build/desktop_import.c)） |
| `sw.js`、`manifest.webmanifest`、`icon*`、`favicon*`、`apple-touch-icon.png` | 可安装应用（PWA）；界面可离线使用，节点请求从不缓存 |
| `_headers`、`.htaccess`、`.nojekyll` | 托管设置（Cloudflare Pages / Netlify、Apache、GitHub Pages） |
| `build/` | 可复现构建：`build.sh`、`emcc_build.sh`、`patches/` |
| `tools/serve.py` | 带可选节点代理的本地服务器 |
| `tools/check-lang.py` | 检查所有语言文件的键和占位符是否一致 |
| `docs/amwbackup-format.md` | 备份文件格式 |

## 限制

- 每个浏览器只能有一个 amethyst 钱包。不支持旧钱包（2019 年以前）。
- 节点尚未接收的交易只保存在内存中：如果在此之前关闭了标签页，请重新发送。
- 已在 Chromium（两种版本）和通过 Playwright 在 WebKit 18.2 中测试：创建、同步、锁定与解锁、错误 PIN、重新加载、显示助记词、备份文件、修改 PIN、忘记钱包、从备份恢复以及带日期从助记词恢复。在真实 iPhone（iOS 27，Safari）上，常规版本可无错误地创建和同步；Playwright 的 Linux 版 WebKit 偶尔会在扫描器中因“Out of bounds memory access”而停止，iPhone 上未出现此问题。桌面导入已在 Chromium 和 WebKit 中用 walletd 3.5.1 生成的文件测试（有密码和无密码、带助记词密码；只读、legacy 和密码错误的文件会被拒绝）。真实资金发送尚未验证。

## 许可证

LGPL-3.0，与 Bytecoin 本身相同。见 [LICENSE](LICENSE)。
