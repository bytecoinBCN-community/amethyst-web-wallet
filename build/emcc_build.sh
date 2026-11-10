#!/bin/bash
# Runs inside emscripten/emsdk. Compiles walletd for the browser from /w/bytecoin into /w/out.
# Every source is compiled into an archive; the linker then pulls in only what main_wasm.cpp needs.
S=/w/bytecoin
O=/w/obj
mkdir -p $O /w/out
# bytecoin_WASM_WORKERS: wallet outputs are prepared in walletworker.js Web Workers, one per CPU core.
# Remove it for the single-threaded variant (no walletworker.js needed, but a full restore takes hours).
export CFLAGS_COMMON="-O2 -fno-strict-aliasing -fwasm-exceptions -DNDEBUG=1 -DCRYPTONOTE_NAME=\"bytecoin\" -Dplatform_USE_SSL=1 \
 -Dbytecoin_WASM_WORKERS=1 \
 -DBOOST_BIND_NO_PLACEHOLDERS=1 -DBOOST_CONFIG_SUPPRESS_OUTDATED_MESSAGE=1 -DBOOST_ERROR_CODE_HEADER_ONLY=1 \
 -DBOOST_SYSTEM_NO_DEPRECATED=1 -DBOOST_DATE_TIME_NO_LIB=1 -DBOOST_SYSTEM_NO_LIB=1 -DBOOST_REGEX_NO_LIB=1 \
 -I$S/src -I$S/vendor -isystem /w/inc"
export O S

# Rebuild everything when compiler flags change
if [ "$(cat $O/flags 2>/dev/null)" != "$CFLAGS_COMMON" ]; then rm -f $O/*.o; echo "$CFLAGS_COMMON" > $O/flags; fi

cd $S
{
  ls src/crypto/*.c src/crypto/*.cpp
  echo src/crypto/bernstein/chacha8.c src/crypto/bernstein/crypto-ops.c
  echo src/crypto/bernstein/crypto-ops-data_25_5.c src/crypto/bernstein/fe_25_5.c
  ls src/crypto/blake/*.c src/crypto/groestl/*.c src/crypto/jh/*.c src/crypto/keccak/*.c src/crypto/oaes/*.c src/crypto/skein/*.c
  ls src/common/*.cpp src/seria/*.cpp src/logging/*.cpp src/http/*.cpp
  ls src/Core/*.cpp src/Core/hardware/*.cpp
  echo src/CryptoNote.cpp src/rpc_api.cpp
  ls vendor/hmac/*.c
  echo src/platform/Files.cpp src/platform/Time.cpp src/platform/Network.cpp src/platform/PathTools.cpp
  echo src/platform/PreventSleep.cpp src/platform/DBmemory.cpp src/platform/IndexDB.cpp
} | tr ' ' '\n' | grep -v '^$' |
  # node and hardware-wallet code: not used by walletd in the browser and does not compile for WebAssembly
  grep -vE '^src/(http/Client|Core/(Archive|BlockChain|Multicore|NodeLegacyAPI|Node_P2PProtocolBytecoin|Node|hardware/Ledger|hardware/Trezor))\.cpp$' \
  > /w/sources.txt

compile() {
  f=$1
  o=$O/$(echo $f | tr '/' '_').o
  [ -f "$o" ] && [ "$o" -nt "$f" ] && exit 0
  case $f in
    *.c)   emcc $CFLAGS_COMMON -w -c $f -o $o 2> $o.err ;;
    *.cpp) em++ $CFLAGS_COMMON -std=c++17 -Wno-deprecated-declarations -c $f -o $o 2> $o.err ;;
  esac
  if [ $? -ne 0 ]; then echo "FAIL $f"; rm -f $o; else rm -f $o.err; fi
}
export -f compile
xargs -P 4 -I{} bash -c 'compile {}' < /w/sources.txt
echo "objects: $(ls $O/*.o | wc -l) of $(wc -l < /w/sources.txt)"

rm -f $O/libbcn.a
emar rcs $O/libbcn.a $O/*.o
em++ $CFLAGS_COMMON -std=c++17 -c src/main_wasm.cpp -o $O/main_wasm.o 2> $O/main_wasm.err || { echo "FAIL main_wasm"; head -40 $O/main_wasm.err; exit 1; }
em++ -O2 -fwasm-exceptions $O/main_wasm.o $O/libbcn.a -o /w/out/walletd.js \
  -lembind -sFETCH=1 -sENVIRONMENT=worker -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=64MB -sSTACK_SIZE=1MB \
  -sEXPORTED_FUNCTIONS=_main,_malloc,_free,_walletd_pool_result -sEXPORTED_RUNTIME_METHODS=HEAPU8 \
  -sEXIT_RUNTIME=0 -sERROR_ON_UNDEFINED_SYMBOLS=1 2> /w/link.err
rc=$?
grep -v '^$' /w/link.err | head -60
[ $rc -ne 0 ] && exit $rc
case "$CFLAGS_COMMON" in *bytecoin_WASM_WORKERS*)
  # Worker module: the page runs several of these (walletworker-main.js) and relays work from walletd
  em++ $CFLAGS_COMMON -std=c++17 -Dbytecoin_WASM_WORKER_MODULE=1 -c src/Core/MulticoreWallet.cpp -o $O/worker_module.o
  em++ -O2 -fwasm-exceptions $O/worker_module.o $O/libbcn.a -o /w/out/walletworker.js -lembind \
    -sEXPORTED_FUNCTIONS=_worker_block_prepare,_worker_transaction_prepare,_malloc,_free \
    -sEXPORTED_RUNTIME_METHODS=HEAPU8 \
    -sENVIRONMENT=worker -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=32MB -sERROR_ON_UNDEFINED_SYMBOLS=1 2> /w/link2.err
  rc=$?
  grep -v '^$' /w/link2.err | head -40 ;;
esac
[ $rc -eq 0 ] && ls -la /w/out
exit $rc
