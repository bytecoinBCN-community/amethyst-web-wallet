// One of the page's wallet workers: finds the wallet's outputs in blocks (walletworker.wasm).
// Receives {tx, data} from the page, answers {result} (posted from C++, see MulticoreWallet.cpp).
// Everything is inside a closure: walletworker.js declares globals of its own (run, ready, …).
'use strict';
// legacy=1: the build without WebAssembly exception handling, in legacy/ (see walletd-worker.js)
var engineDir = new URL(self.location.href).searchParams.get('legacy') === '1' ? 'legacy/' : '';
var Module = (function () {
  var queue = [];
  var initialized = false;

  function prepare(m) {
    var p = Module._malloc(m.data.length);
    Module.HEAPU8.set(m.data, p);
    try {
      (m.tx ? Module._worker_transaction_prepare : Module._worker_block_prepare)(p, m.data.length);
    } catch (err) {
      postMessage({ log: 'walletworker failed: ' + err });
      throw err;
    } finally {
      Module._free(p);
    }
  }

  self.onmessage = function (e) {
    if (initialized) prepare(e.data);
    else queue.push(e.data);
  };

  return {
    print: function (t) { postMessage({ log: 'walletworker: ' + t }); },
    printErr: function (t) { postMessage({ log: 'walletworker: ' + t }); },
    onAbort: function (what) { postMessage({ log: 'walletworker aborted: ' + what }); },
    locateFile: function (path) { return engineDir + path; },
    onRuntimeInitialized: function () {
      initialized = true;
      var pending = queue;
      queue = [];
      setTimeout(function () { pending.forEach(prepare); }, 0);
    },
  };
})();

importScripts(engineDir + 'walletworker.js');
