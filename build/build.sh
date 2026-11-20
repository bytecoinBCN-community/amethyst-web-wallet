#!/bin/bash
# Builds walletd.wasm, walletworker.wasm and desktop-import.wasm from public sources, so anyone can check the binaries this site serves:
#   Bytecoin v3.5.1 (github.com/bytecoinBCN-community/bytecoin, tag v3.5.1) + patches/*.patch,
#   Emscripten 3.1.64 and Boost 1.83 headers from Ubuntu 24.04, both in Docker.
# Usage: build/build.sh [output dir, default ./build/out]. Needs git and Docker. Takes about half an hour on 4 cores.
# Then compare the printed hashes with SHA256SUMS in the repository root (legacy/ is the build for older browsers).
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
OUT=$(mkdir -p "${1:-$HERE/out}" && cd "${1:-$HERE/out}" && pwd)
UPSTREAM=https://github.com/bytecoinBCN-community/bytecoin.git
COMMIT=c3d9b94e0d34ee486ff35e7c781f673c1097b955  # tag v3.5.1
EMSDK=emscripten/emsdk:3.1.64
W=$(mktemp -d)
trap 'rm -rf "$W"' EXIT

git clone -q "$UPSTREAM" "$W/bytecoin"
git -C "$W/bytecoin" checkout -q "$COMMIT"
for p in "$HERE"/patches/*.patch; do
  git -C "$W/bytecoin" apply "$p"
  echo "applied $(basename "$p")"
done

# Boost headers only (walletd uses header-only parts): the same 1.83 as Ubuntu 24.04
mkdir -p "$W/inc"
docker run --rm -v "$W/inc:/out" ubuntu:24.04 sh -c \
  'apt-get update -qq >/dev/null && apt-get install -y -qq --no-install-recommends libboost1.83-dev >/dev/null && cp -r /usr/include/boost /out/ && chown -R '"$(id -u):$(id -g)"' /out'

cp "$HERE/emcc_build.sh" "$HERE/emcc_import.sh" "$HERE/desktop_import.c" "$W/"
FILES="walletd.js walletd.wasm walletworker.js walletworker.wasm"
# the normal build, then the legacy one for browsers without WebAssembly exception handling (legacy/)
docker run --rm -u "$(id -u):$(id -g)" -e HOME=/tmp -v "$W:/w" -w /w "$EMSDK" bash /w/emcc_build.sh
docker run --rm -u "$(id -u):$(id -g)" -e HOME=/tmp -e LEGACY=1 -v "$W:/w" -w /w "$EMSDK" bash /w/emcc_build.sh
# import of desktop walletd .wallet files: one build for all browsers (emsdk downloads its SQLite port here)
docker run --rm -u "$(id -u):$(id -g)" -e HOME=/tmp -v "$W:/w" -w /w "$EMSDK" bash /w/emcc_import.sh
mkdir -p "$OUT/legacy"
for f in $FILES; do cp "$W/out/$f" "$OUT/"; cp "$W/out-legacy/$f" "$OUT/legacy/"; done
cp "$W/out-import/desktop-import.js" "$W/out-import/desktop-import.wasm" "$OUT/"
cd "$OUT" && sha256sum $FILES $(for f in $FILES; do echo legacy/$f; done) desktop-import.js desktop-import.wasm
