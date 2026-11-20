# Amethyst Web Wallet

[English](README.md) · [Українська](README.uk.md) · [Español](README.es.md) · **Português** · [Türkçe](README.tr.md) · [Bahasa Indonesia](README.id.md) · [Tiếng Việt](README.vi.md) · [中文](README.zh.md)

Uma carteira leve de Bytecoin (BCN) que funciona inteiramente no navegador, no celular ou no computador. Ela não baixa a blockchain e não entrega suas chaves a nenhum servidor: o `walletd` 3.5.1 oficial do Bytecoin, compilado para WebAssembly, roda dentro da página e pede a um nó apenas os dados de que a carteira precisa.

> **Situação: protótipo.** Testada apenas com carteiras descartáveis. Guarde aqui só valores pequenos e mantenha a frase de recuperação offline.

## Como funciona

- `walletd.wasm` é o `walletd` v3.5.1 do Bytecoin compilado com Emscripten a partir do código público mais um patch ([build/patches](build/patches)). Ele cria e restaura carteiras *amethyst* (BIP39, 24 palavras), escaneia os blocos com a sua chave de visualização e monta e assina as transações no dispositivo.
- `walletworker.wasm` procura as saídas da carteira nos blocos. A página roda uma cópia por núcleo do processador (2–8).
- **Navegadores antigos.** A versão normal usa o tratamento de exceções do WebAssembly (Firefox 100+, Chrome/Edge 95+, Safari 15.2+). Onde ele não existe (SeaMonkey, Firefox ESR antigos, Pale Moon e semelhantes), a página carrega o mesmo código de `legacy/`: exceções C++ feitas em JavaScript, WebAssembly 1.0 e código de ligação ES2017. É cerca de 25% maior. `?engine=legacy` no endereço força essa versão em qualquer navegador, `?engine=normal` força a normal.
- O nó só fornece blocos (`sync_blocks`) e saídas de despiste, e aceita transações prontas. Ele nunca vê as chaves nem a frase. As saídas são verificadas localmente, então o saldo não depende de confiar no nó.
- Por padrão a página verifica em paralelo o proxy `/json_rpc` do próprio site (se houver), o nó da comunidade `node.bytecoin.community`, `node01.bytecoin.org` e `node02.bytecoin.org`, e usa o primeiro que responde e não está atrasado. Os nós públicos permitem requisições de outras origens, então **o site pode ser uma hospedagem estática simples**. No cartão *Nó* você pode escolher um nó ou informar o seu (`https://host:porta`).
- Os nós públicos não compartilham o seu pool de transações não confirmadas, então um pagamento recebido aparece com a primeira confirmação (≈2 min), não antes.
- **Códigos QR.** *Mostrar código QR* abaixo do endereço de recebimento desenha `bytecoin:<endereço>` (igual ao BCN Wallet para Windows) com `qr.js`, um pequeno codificador sem dependências. *Escanear* ao lado do campo do destinatário lê um código QR com a câmera: o Chrome no Android usa o seu `BarcodeDetector` embutido; os outros navegadores carregam `vendor/jsQR.js` ([jsQR](https://github.com/cozmo/jsQR) 1.4.0, Apache-2.0, ≈57 KB compactado) só quando você toca em *Escanear*. Do código só se aproveita o endereço, nunca um valor. A câmera funciona só enquanto o leitor está aberto, e o `Permissions-Policy` a permite apenas para este site.

## Idiomas

A interface está em inglês, ucraniano, espanhol, português, turco, indonésio, vietnamita e chinês. A página usa o idioma do navegador (senão, inglês); o menu no cabeçalho muda o idioma a qualquer momento sem fechar a carteira, e a escolha fica guardada no dispositivo. A frase de recuperação é sempre de palavras BIP39 em inglês, qualquer que seja o idioma da interface, e o registro do walletd continua em inglês.

Os textos ficam em [`lang/`](lang), uma linha `chave = texto` por string, no mesmo formato do BCN Wallet para Windows. Para adicionar um idioma: copie `lang/en.txt`, traduza o lado direito (mantendo os `{marcadores}`), adicione o código em `LANGS` no [`i18n.js`](i18n.js) e em `SHELL` no `sw.js`, e rode `python3 tools/check-lang.py`, que verifica se todos os arquivos têm as mesmas chaves e marcadores. O texto em inglês também continua no `index.html`, então a página é legível mesmo se um arquivo de idioma não carregar.

## Instalar no celular

O site é um aplicativo instalável (PWA): ele abre em tela cheia pelo próprio ícone, e a interface funciona offline.

- **iPhone / iPad:** abra o site no Safari → *Compartilhar* → *Adicionar à Tela de Início*.
- **Android:** Chrome: menu ⋮ → *Instalar app* (ou *Adicionar à tela inicial*); Samsung Internet: menu ☰ → *Adicionar página a* → *Tela inicial*; Firefox: menu ⋮ → *Instalar*. No Android a página mostra esses passos e, quando o navegador oferece, um botão *Instalar*. No Android o aplicativo e o navegador compartilham o armazenamento, então não é preciso restaurar a carteira de novo.

Os celulares pausam os aplicativos web em segundo plano: a varredura só avança enquanto o aplicativo está aberto e a tela ligada, e continua de onde parou quando você volta. Nos celulares o cartão *Sincronização* tem **Manter a tela ligada durante a varredura** (Screen Wake Lock API: Safari 16.4+, Chrome 84+). Ele mantém a tela ligada só enquanto a carteira está aberta e ainda escaneando, e deixa a tela apagar quando sincroniza. Uma página não pode mudar o brilho, então ela pede que você o diminua. Bloquear o celular ou mudar de aplicativo continua pausando a varredura.

**Onde ficam os dados:** o arquivo criptografado da carteira (≈0,4 KB) e o cache da carteira (saldo e histórico, dezenas de KB, cresce com as suas transações) ficam no IndexedDB do site; a interface do aplicativo (≈3 MB), no cache do service worker. Os blocos são verificados na memória e não são guardados. A página pede ao navegador para manter esse armazenamento (`navigator.storage.persist()`). No iPhone o aplicativo adicionado à Tela de Início tem armazenamento próprio, separado do Safari: restaure a carteira nele de novo, e lembre que remover o ícone apaga a carteira guardada ali. O próprio Safari pode apagar o armazenamento de um site não aberto há 7 dias; o aplicativo da Tela de Início não está sujeito a isso.

**Uso de dados:** a carteira baixa do nó 0,8–1,9 KB por bloco (medido em `node.bytecoin.community`). O uso normal e a restauração por arquivo de backup gastam poucos MB; escanear a cadeia inteira (restaurar pela frase sem data) baixa cerca de 2–3 GB, então use Wi-Fi.

**Restauração:** pelo arquivo de backup leva segundos (o arquivo sabe a data de criação). O arquivo `.wallet` de uma carteira de desktop (walletd 3.x, carteira de desktop do Bytecoin, BCN Wallet GUI) também funciona, com a senha dessa carteira, se ela for do tipo amethyst (endereço começando com `bcnZ`): dele são tirados a frase, a data de criação e o número de endereços. Uma carteira de desktop que foi restaurada pela própria frase não tem data de criação (o walletd não a registra para carteiras amethyst); então a página pede a data aproximada. É um arquivo SQLite, lido por um módulo separado, `desktop-import.wasm` (SQLite e o código CryptoNight/ChaCha do walletd, ≈0,55 MB compactado), que a página só carrega quando um arquivo assim é escolhido. Carteiras somente leitura, carteiras Ledger/Trezor e carteiras de desktop antigas (endereço começando com `2`) não têm frase de recuperação e não podem ser importadas. Você digita a senha da carteira de desktop nesta página: confira antes o endereço do site e faça isso só num site em que confia. Pela frase de recuperação, a cadeia inteira desde a atualização amethyst é escaneada (≈1,9 milhão de blocos, uma hora ou mais), a menos que você informe a data aproximada de criação; uma data tarde demais deixa de fora pagamentos anteriores.

## Segurança

- **O arquivo da carteira no IndexedDB** (contém a frase) é criptografado com o seu PIN (pelo menos 6 caracteres): ChaCha20 + HMAC-SHA256, chaves derivadas com PBKDF2-HMAC-SHA512 e 250.000 iterações; o MAC cobre também a chave de armazenamento. O PIN nunca é guardado.
- Um PIN de 6 dígitos não resiste a um ataque offline contra um perfil de navegador copiado. Ele protege contra acesso casual a um aparelho desbloqueado, não contra malware. Para valores maiores, use um PIN mais longo.
- **Arquivo de backup** (`.amwbackup`, [formato](docs/amwbackup-format.md)): frase, data de criação, número de endereços e, se a carteira estiver sincronizada, o estado dela num bloco 10 abaixo do topo (saldo, saídas não gastas, histórico, data do primeiro pagamento). É criptografado com uma senha separada (pelo menos 10 caracteres): AES-256-GCM, chave derivada com PBKDF2-HMAC-SHA256 e 600.000 iterações. Restaurar por ele escaneia só a partir do primeiro pagamento (ou da data do backup, se não houve pagamentos): segundos em vez de horas pela frase. Carteiras importadas com uma senha da frase (BIP39 passphrase) não podem ser salvas assim, porque o walletd não devolve essa senha.
- O cache da carteira (saldo e histórico, sem chaves de gasto) não é criptografado.
- Content-Security-Policy: scripts só deste site, sem scripts inline; `unsafe-eval` é exigido pelo código de ligação Emscripten/embind.
- O nó que você usa vê o seu endereço IP e quais blocos você pede. Se isso importa, use o seu próprio nó.
- Sem auditoria. Leia o código, é pouco: [`app.js`](app.js) (~900 linhas), [`i18n.js`](i18n.js) e o patch.

## Verificar os binários

Os arquivos `.wasm` e `.js` deste repositório são compilados de forma reproduzível:

```bash
build/build.sh
sha256sum build/out/*
```

e compare com [`SHA256SUMS`](SHA256SUMS) (a versão normal, `legacy/` e o módulo de importação de desktop). O script clona [bytecoinBCN-community/bytecoin](https://github.com/bytecoinBCN-community/bytecoin) na tag `v3.5.1`, aplica `build/patches/*.patch` e compila no Docker (`emscripten/emsdk:3.1.64`, cabeçalhos do Boost 1.83 do `ubuntu:24.04`; o módulo de importação também usa o SQLite 3.39.0, que o emsdk baixa de sqlite.org e confere pelo hash). Precisa de git, Docker e acesso à internet.

## Hospedagem

Qualquer hospedagem estática com HTTPS serve: os arquivos na raiz do repositório são o site inteiro. Sem etapa de compilação e sem código de servidor.

- **GitHub Pages:** Settings → Pages → *Deploy from a branch*, branch `main`, pasta `/ (root)`. O `.nojekyll` já está incluído.
- **Cloudflare Pages / Netlify:** envie a raiz do repositório (arrastar e soltar funciona, não há funções). O `_headers` adiciona ali os cabeçalhos de segurança.
- **Apache / hospedagem compartilhada:** o `.htaccess` serve `.wasm` como `application/wasm` e a página, os scripts e o `.wasm` com `Cache-Control: no-cache` (walletd.js e walletd.wasm só funcionam juntos, então nunca podem ficar desatualizados). Se o próprio nginx serve os arquivos estáticos, verifique `curl -sI https://<site>/walletd.wasm` e configure o mesmo no painel da hospedagem. O service worker também revalida cada arquivo com o servidor, então nem um `max-age` longo da hospedagem atrasa as atualizações do aplicativo instalado.
- `legacy/` é necessária para o SeaMonkey e outros navegadores sem tratamento de exceções do WebAssembly: mantenha-a no site.
- No celular é preciso HTTPS (Web Crypto, service worker). `tools/serve.py` é um servidor local de teste que também pode repassar `/json_rpc`, `/binary_rpc` e `/sync_blocks/` ao seu próprio `bytecoind`.

## Arquivos

| Arquivo | O que é |
| --- | --- |
| `index.html`, `app.js` | A página: criar ou restaurar, PIN, bloqueio, saldo, sincronização, endereço, envio com confirmação, histórico, backup, escolha do nó |
| `i18n.js`, `lang/*.txt` | Idiomas da interface (8); `tools/check-lang.py` verifica os arquivos |
| `qr.js`, `vendor/jsQR.js` | Código QR do endereço; leitor de QR para navegadores sem `BarcodeDetector` (jsQR 1.4.0 do npm, sha512 conferido; licença em `vendor/jsQR-LICENSE.txt`) |
| `walletd-worker.js`, `walletd.js`, `walletd.wasm` | walletd num Web Worker |
| `walletworker-main.js`, `walletworker.js`, `walletworker.wasm` | Workers que procuram as saídas |
| `legacy/` | Os mesmos `walletd` e `walletworker` compilados para navegadores sem tratamento de exceções do WebAssembly |
| `desktop-import-worker.js`, `desktop-import.js`, `desktop-import.wasm` | Lê arquivos `.wallet` amethyst do walletd de desktop; só é carregado para essa importação ([build/desktop_import.c](build/desktop_import.c)) |
| `sw.js`, `manifest.webmanifest`, `icon*`, `favicon*`, `apple-touch-icon.png` | Aplicativo instalável (PWA); a interface funciona offline, as requisições ao nó nunca são guardadas em cache |
| `_headers`, `.htaccess`, `.nojekyll` | Configurações de hospedagem (Cloudflare Pages / Netlify, Apache, GitHub Pages) |
| `build/` | Compilação reproduzível: `build.sh`, `emcc_build.sh`, `patches/` |
| `tools/serve.py` | Servidor local com proxy opcional para o nó |
| `tools/check-lang.py` | Verifica se todos os arquivos de idioma têm as mesmas chaves e marcadores |
| `docs/amwbackup-format.md` | O formato do arquivo de backup |

## Limitações

- Uma carteira amethyst por navegador. Carteiras antigas (anteriores a 2019) não são suportadas.
- Uma transação ainda não aceita pelo nó fica só na memória: se a aba for fechada antes disso, envie de novo.
- Testada no Chromium (as duas versões) e no WebKit 18.2 via Playwright: criar, sincronizar, bloquear e desbloquear, PIN errado, recarregar, mostrar a frase, arquivo de backup, troca de PIN, esquecer, restaurar por backup e pela frase com data. Num iPhone real (iOS 27, Safari) a versão normal cria e sincroniza sem erros; o WebKit de Linux do Playwright às vezes para com «Out of bounds memory access» no scanner, o que o iPhone não mostrou. A importação de desktop foi testada no Chromium e no WebKit com arquivos criados pelo walletd 3.5.1 (com e sem senha, com senha da frase; arquivos somente leitura, legacy e com senha errada são recusados). O envio real de fundos ainda não foi verificado.

## Licença

LGPL-3.0, como o próprio Bytecoin. Veja [LICENSE](LICENSE).
