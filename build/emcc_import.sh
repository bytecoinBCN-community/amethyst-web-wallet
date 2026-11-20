#!/bin/bash
# Runs inside emscripten/emsdk. Builds desktop-import.wasm (import of desktop walletd amethyst .wallet files)
# from build/desktop_import.c, the CryptoNight/keccak/chacha C sources of /w/bytecoin and SQLite
# (Emscripten's sqlite3 port, fetched and checksum-verified by emsdk). Plain WebAssembly 1.0 without exceptions,
# so one build runs in every browser the page supports, legacy ones included.
set -e
S=/w/bytecoin
OUT=/w/out-import
mkdir -p $OUT
cd $S
SRC="$(ls src/crypto/*.c src/crypto/blake/*.c src/crypto/groestl/*.c src/crypto/jh/*.c src/crypto/keccak/*.c \
  src/crypto/oaes/*.c src/crypto/skein/*.c) src/crypto/bernstein/chacha8.c"
emcc -O2 -fno-exceptions -fno-strict-aliasing -DNDEBUG=1 -w -I$S/src -sUSE_SQLITE3=1 \
  /w/desktop_import.c $SRC -o $OUT/desktop-import.js \
  -sMODULARIZE=1 -sEXPORT_NAME=DesktopImport -sENVIRONMENT=worker \
  -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=16MB -sSTACK_SIZE=256KB \
  -sEXPORTED_FUNCTIONS=_desktop_import,_malloc,_free \
  -sEXPORTED_RUNTIME_METHODS=HEAPU8,UTF8ToString,stringToUTF8,lengthBytesUTF8 \
  -sMIN_FIREFOX_VERSION=60 -sMIN_CHROME_VERSION=60 -sMIN_SAFARI_VERSION=110000 -sWASM_BIGINT=0 \
  -sERROR_ON_UNDEFINED_SYMBOLS=1
ls -la $OUT
