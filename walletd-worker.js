// Runs walletd.wasm (bytecoin walletd built with Emscripten) inside a Web Worker.
// The page sends JSON-RPC bodies with postMessage; walletd reaches the node with fetch().
// The node comes from ?node= in this script's URL: "self" (default) is this page's own origin, where a proxy
// forwards /json_rpc, /binary_rpc and /sync_blocks/ to bytecoind; otherwise a node address the page has
// already checked and normalised ("https://host:port", or "host:port" for plain http).
'use strict';
var https = self.location.protocol === 'https:';
var port = self.location.port || (https ? '443' : '80');
var nodeParam = new URL(self.location.href).searchParams.get('node') || 'self';
var nodeAddress = nodeParam !== 'self' ? nodeParam : (https ? 'https://' : '') + self.location.hostname + ':' + port;

var Module = {
  // --secrets-via-api: get_wallet_info can return the mnemonic, the page shows it on the Backup screen after PIN
  arguments: ['--bytecoind-remote-address=' + nodeAddress, '--secrets-via-api'],
  print: function (t) { postMessage({ log: t }); },
  printErr: function (t) { postMessage({ log: t }); },
  postRun: [function () { postMessage({ ready: true, node: nodeAddress }); }],
};

onmessage = function (e) {
  var m = e.data;
  if (m.op === 'pool_result') {  // a page wallet worker finished a block or transaction
    var p = Module._malloc(m.data.length);
    Module.HEAPU8.set(m.data, p);
    try { Module._walletd_pool_result(m.id, m.tx, p, m.data.length); } finally { Module._free(p); }
    return;
  }
  try {
    if (m.op === 'create_mnemonic') return postMessage({ id: m.id, result: Module.create_mnemonic() });
    if (m.op === 'check_mnemonic') return postMessage({ id: m.id, result: Module.check_mnemonic(m.mnemonic) });
    Module.worker_http_request(function (handle, status, body) {
      postMessage({ id: handle, status: status, body: body });
    }, m.id, 'POST', '/json_rpc', m.body);
  } catch (err) {
    postMessage({ id: m.id, status: 0, body: '', error: String(err) });
  }
};

importScripts('walletd.js');
