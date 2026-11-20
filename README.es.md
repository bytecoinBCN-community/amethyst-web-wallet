# Amethyst Web Wallet

[English](README.md) · [Українська](README.uk.md) · **Español** · [Português](README.pt.md) · [Türkçe](README.tr.md) · [Bahasa Indonesia](README.id.md) · [Tiếng Việt](README.vi.md) · [中文](README.zh.md)

Un monedero ligero de Bytecoin (BCN) que funciona por completo en el navegador, en un teléfono o en un ordenador. No descarga la cadena de bloques ni entrega sus claves a ningún servidor: el `walletd` 3.5.1 oficial de Bytecoin, compilado a WebAssembly, se ejecuta dentro de la página y pide a un nodo solo los datos que el monedero necesita.

> **Estado: prototipo.** Probado solo con monederos de prueba. Guarde aquí solo cantidades pequeñas y conserve la frase de recuperación fuera de línea.

## Cómo funciona

- `walletd.wasm` es el `walletd` v3.5.1 de Bytecoin compilado con Emscripten a partir del código público más un parche ([build/patches](build/patches)). Crea y restaura monederos *amethyst* (BIP39, 24 palabras), escanea los bloques con su clave de visualización y crea y firma las transacciones en el dispositivo.
- `walletworker.wasm` busca las salidas del monedero en los bloques. La página ejecuta una copia por núcleo del procesador (2–8).
- **Navegadores antiguos.** La compilación normal usa el manejo de excepciones de WebAssembly (Firefox 100+, Chrome/Edge 95+, Safari 15.2+). Si no lo hay (SeaMonkey, Firefox ESR antiguos, Pale Moon y similares), la página carga el mismo código desde `legacy/`: excepciones de C++ hechas en JavaScript, WebAssembly 1.0 y código de enlace ES2017. Es un 25 % más grande. `?engine=legacy` en la dirección la fuerza en cualquier navegador, `?engine=normal` fuerza la normal.
- El nodo solo entrega bloques (`sync_blocks`) y salidas señuelo, y acepta transacciones ya terminadas. Nunca ve las claves ni la frase. Las salidas se comprueban localmente, así que el saldo no depende de la confianza en el nodo.
- Por defecto la página comprueba en paralelo el proxy `/json_rpc` del propio sitio (si existe), el nodo de la comunidad `node.bytecoin.community`, `node01.bytecoin.org` y `node02.bytecoin.org`, y usa el primero que responde y no va retrasado. Los nodos públicos permiten peticiones desde otros orígenes, así que **el sitio puede ser un simple alojamiento estático**. En la tarjeta *Nodo* puede elegir un nodo o escribir el suyo (`https://host:puerto`).
- Los nodos públicos no comparten su conjunto de transacciones sin confirmar, así que un pago entrante aparece con su primera confirmación (≈2 min), no antes.

## Idiomas

La interfaz está en inglés, ucraniano, español, portugués, turco, indonesio, vietnamita y chino. La página usa el idioma del navegador (si no, inglés); el menú de la cabecera lo cambia en cualquier momento sin cerrar el monedero, y la elección se recuerda en el dispositivo. La frase de recuperación son siempre palabras BIP39 en inglés, sea cual sea el idioma de la interfaz, y el registro de walletd sigue en inglés.

Los textos están en [`lang/`](lang), una línea `clave = texto` por cadena, el mismo formato que BCN Wallet para Windows. Para añadir un idioma: copie `lang/en.txt`, traduzca la parte derecha (conservando los `{marcadores}`), añada el código a `LANGS` en [`i18n.js`](i18n.js) y a `SHELL` en `sw.js`, y ejecute `python3 tools/check-lang.py`, que comprueba que todos los archivos tienen las mismas claves y marcadores. El texto en inglés también sigue en `index.html`, así que la página se lee bien aunque no se pueda cargar un archivo de idioma.

## Instalar en el teléfono

El sitio es una aplicación instalable (PWA): se abre a pantalla completa desde su propio icono y la interfaz funciona sin conexión.

- **iPhone / iPad:** abra el sitio en Safari → *Compartir* → *Añadir a pantalla de inicio*.
- **Android:** Chrome: menú ⋮ → *Instalar aplicación* (o *Añadir a pantalla de inicio*); Samsung Internet: menú ☰ → *Añadir página a* → *Pantalla de inicio*; Firefox: menú ⋮ → *Instalar*. En Android la página muestra estos pasos y, cuando el navegador lo ofrece, un botón *Instalar*. En Android la aplicación y el navegador comparten el almacenamiento, así que no hace falta restaurar el monedero otra vez.

Los teléfonos pausan las aplicaciones web en segundo plano: el escaneo solo avanza mientras la aplicación está abierta y la pantalla encendida, y continúa donde se quedó al volver. En los teléfonos la tarjeta *Sincronización* tiene **Mantener la pantalla encendida durante el escaneo** (Screen Wake Lock API: Safari 16.4+, Chrome 84+). Mantiene la pantalla encendida solo mientras el monedero está abierto y escaneando, y la deja apagarse una vez sincronizado. Una página no puede cambiar el brillo, así que le pide que lo baje usted. Bloquear el teléfono o cambiar de aplicación sigue pausando el escaneo.

**Dónde se guardan los datos:** el archivo cifrado del monedero (≈0,4 KB) y la caché del monedero (saldo e historial, decenas de KB, crece con sus transacciones) están en el IndexedDB del sitio; la interfaz de la aplicación (≈3 MB), en la caché del service worker. Los bloques se comprueban en memoria y no se guardan. La página pide al navegador que conserve este almacenamiento (`navigator.storage.persist()`). En iPhone la aplicación añadida a la pantalla de inicio tiene su propio almacenamiento, separado de Safari: restaure el monedero en ella otra vez, y tenga en cuenta que al eliminar el icono se borra el monedero guardado allí. Safari puede borrar el almacenamiento de un sitio que no se ha abierto en 7 días; a la aplicación de la pantalla de inicio no le afecta.

**Consumo de datos:** el monedero descarga del nodo 0,8–1,9 KB por bloque (medido en `node.bytecoin.community`). El uso normal y la restauración desde un archivo de copia gastan unos pocos MB; escanear toda la cadena (restaurar con la frase sin fecha) descarga unos 2–3 GB, así que use Wi-Fi.

**Restauración:** desde el archivo de copia tarda segundos (el archivo conoce la fecha de creación). También sirve el archivo `.wallet` de un monedero de escritorio (walletd 3.x, monedero de escritorio de Bytecoin, BCN Wallet GUI), con la contraseña de ese monedero, si es de tipo amethyst (dirección que empieza por `bcnZ`): de él se toman la frase, la fecha de creación y el número de direcciones. Un monedero de escritorio que a su vez se restauró con su frase no tiene fecha de creación (walletd no la guarda para monederos amethyst); entonces la página pide la fecha aproximada. Es un archivo SQLite que lee un módulo aparte, `desktop-import.wasm` (SQLite y el código CryptoNight/ChaCha de walletd, ≈0,55 MB comprimido), que la página carga solo cuando se elige un archivo así. Los monederos de solo lectura, los de Ledger/Trezor y los monederos de escritorio antiguos (dirección que empieza por `2`) no tienen frase de recuperación y no se pueden importar. La contraseña del monedero de escritorio se escribe en esta página: compruebe antes la dirección del sitio y hágalo solo en un sitio de confianza. Desde la frase de recuperación se escanea toda la cadena desde la actualización amethyst (≈1,9 millones de bloques, una hora o más) salvo que indique la fecha aproximada de creación; una fecha demasiado tardía omite los pagos anteriores.

## Seguridad

- **El archivo del monedero en IndexedDB** (contiene la frase) está cifrado con su PIN (al menos 6 caracteres): ChaCha20 + HMAC-SHA256, claves derivadas con PBKDF2-HMAC-SHA512 y 250 000 iteraciones; el MAC cubre también la clave de almacenamiento. El PIN nunca se guarda.
- Un PIN de 6 cifras no resiste un ataque sin conexión contra un perfil de navegador copiado. Protege frente al acceso casual a un dispositivo desbloqueado, no frente a software malicioso. Para cantidades mayores use un PIN más largo.
- **Archivo de copia** (`.amwbackup`, [formato](docs/amwbackup-format.md)): frase, fecha de creación, número de direcciones y, si el monedero está sincronizado, su estado en un bloque 10 por debajo de la cima (saldo, salidas sin gastar, historial, fecha del primer pago). Está cifrado con una contraseña aparte (al menos 10 caracteres): AES-256-GCM, clave derivada con PBKDF2-HMAC-SHA256 y 600 000 iteraciones. Restaurar desde él escanea solo desde el primer pago (o desde la fecha de la copia si no hubo pagos): segundos en lugar de horas con la frase. Los monederos importados con una contraseña de la frase (BIP39 passphrase) no se pueden guardar así, porque walletd no devuelve esa contraseña.
- La caché del monedero (saldo e historial, sin claves de gasto) no está cifrada.
- Content-Security-Policy: scripts solo de este sitio, sin scripts en línea; `unsafe-eval` lo necesita el código de enlace de Emscripten/embind.
- El nodo que use ve su dirección IP y qué bloques pide. Si eso importa, use su propio nodo.
- Sin auditar. Lea el código, es poco: [`app.js`](app.js) (~900 líneas), [`i18n.js`](i18n.js) y el parche.

## Verificar los binarios

Los archivos `.wasm` y `.js` de este repositorio se compilan de forma reproducible:

```bash
build/build.sh
sha256sum build/out/*
```

y compare con [`SHA256SUMS`](SHA256SUMS) (la compilación normal, `legacy/` y el módulo de importación de escritorio). El script clona [bytecoinBCN-community/bytecoin](https://github.com/bytecoinBCN-community/bytecoin) en la etiqueta `v3.5.1`, aplica `build/patches/*.patch` y compila en Docker (`emscripten/emsdk:3.1.64`, cabeceras de Boost 1.83 de `ubuntu:24.04`; el módulo de importación usa además SQLite 3.39.0, que emsdk descarga de sqlite.org y comprueba por hash). Requiere git, Docker y acceso a internet.

## Alojamiento

Sirve cualquier alojamiento estático con HTTPS: los archivos de la raíz del repositorio son todo el sitio. Sin compilación y sin código de servidor.

- **GitHub Pages:** Settings → Pages → *Deploy from a branch*, rama `main`, carpeta `/ (root)`. `.nojekyll` ya está incluido.
- **Cloudflare Pages / Netlify:** suba la raíz del repositorio (se puede arrastrar y soltar, no hay funciones). `_headers` añade allí las cabeceras de seguridad.
- **Apache / alojamiento compartido:** `.htaccess` sirve `.wasm` como `application/wasm` y la página, los scripts y `.wasm` con `Cache-Control: no-cache` (walletd.js y walletd.wasm solo funcionan juntos, así que nunca deben estar desactualizados). Si nginx sirve los archivos estáticos por su cuenta, compruebe `curl -sI https://<sitio>/walletd.wasm` y configure lo mismo en el panel del alojamiento. El service worker también revalida cada archivo con el servidor, así que ni un `max-age` largo del alojamiento retrasa las actualizaciones de la aplicación instalada.
- `legacy/` hace falta para SeaMonkey y otros navegadores sin manejo de excepciones de WebAssembly: manténgala en el sitio.
- En los teléfonos se necesita HTTPS (Web Crypto, service worker). `tools/serve.py` es un servidor local de pruebas que también puede reenviar `/json_rpc`, `/binary_rpc` y `/sync_blocks/` a su propio `bytecoind`.

## Archivos

| Archivo | Qué es |
| --- | --- |
| `index.html`, `app.js` | La página: crear o restaurar, PIN, bloqueo, saldo, sincronización, dirección, envío con confirmación, historial, copia, elección de nodo |
| `i18n.js`, `lang/*.txt` | Idiomas de la interfaz (8); `tools/check-lang.py` comprueba los archivos |
| `walletd-worker.js`, `walletd.js`, `walletd.wasm` | walletd en un Web Worker |
| `walletworker-main.js`, `walletworker.js`, `walletworker.wasm` | Workers que buscan las salidas |
| `legacy/` | Los mismos `walletd` y `walletworker` compilados para navegadores sin manejo de excepciones de WebAssembly |
| `desktop-import-worker.js`, `desktop-import.js`, `desktop-import.wasm` | Lee los archivos `.wallet` amethyst del walletd de escritorio; solo se carga para esa importación ([build/desktop_import.c](build/desktop_import.c)) |
| `sw.js`, `manifest.webmanifest`, `icon*`, `favicon*`, `apple-touch-icon.png` | Aplicación instalable (PWA); la interfaz funciona sin conexión, las peticiones al nodo nunca se guardan en caché |
| `_headers`, `.htaccess`, `.nojekyll` | Ajustes de alojamiento (Cloudflare Pages / Netlify, Apache, GitHub Pages) |
| `build/` | Compilación reproducible: `build.sh`, `emcc_build.sh`, `patches/` |
| `tools/serve.py` | Servidor local con proxy opcional al nodo |
| `tools/check-lang.py` | Comprueba que todos los archivos de idioma tienen las mismas claves y marcadores |
| `docs/amwbackup-format.md` | El formato del archivo de copia |

## Limitaciones

- Un monedero amethyst por navegador. No se admiten los monederos antiguos (anteriores a 2019).
- Una transacción que el nodo aún no ha aceptado se guarda solo en memoria: si se cierra la pestaña antes, envíela de nuevo.
- Probado en Chromium (ambas compilaciones) y en WebKit 18.2 mediante Playwright: crear, sincronizar, bloquear y desbloquear, PIN incorrecto, recargar, mostrar la frase, archivo de copia, cambio de PIN, olvidar, restaurar desde copia y desde la frase con fecha. En un iPhone real (iOS 27, Safari) la compilación normal crea y sincroniza sin errores; el WebKit de Linux de Playwright a veces se detiene con «Out of bounds memory access» en el escáner, cosa que el iPhone no mostró. La importación de escritorio se probó en Chromium y WebKit con archivos creados por walletd 3.5.1 (con y sin contraseña, con contraseña de la frase; los archivos de solo lectura, legacy y con contraseña incorrecta se rechazan). El envío real de fondos aún no está verificado.

## Licencia

LGPL-3.0, como el propio Bytecoin. Vea [LICENSE](LICENSE).
