#!/bin/bash
# Builds walletd.wasm and walletworker.wasm from public sources, so anyone can check the binaries this site serves:
#   Bytecoin v3.5.1 (github.com/bytecoinBCN-community/bytecoin, tag v3.5.1) + patches/*.patch,
#   Emscripten 3.1.64 and Boost 1.83 headers from Ubuntu 24.04, both in Docker.
# Usage: build/build.sh [output dir, default ./build/out]. Needs git and Docker. Takes a few minutes.
# Then compare: sha256sum build/out/* with SHA256SUMS in the repository root.
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

cp "$HERE/emcc_build.sh" "$W/emcc_build.sh"
docker run --rm -u "$(id -u):$(id -g)" -e HOME=/tmp -v "$W:/w" -w /w "$EMSDK" bash /w/emcc_build.sh
cp "$W"/out/walletd.js "$W"/out/walletd.wasm "$W"/out/walletworker.js "$W"/out/walletworker.wasm "$OUT/"
cd "$OUT" && sha256sum walletd.js walletd.wasm walletworker.js walletworker.wasm
