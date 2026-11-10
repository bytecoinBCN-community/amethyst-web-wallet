#!/usr/bin/env python3
"""Prototype host for the browser wallet: serves the static files and forwards node RPC to bytecoind.

usage: serve.py <www-folder> [listen-port] [node-url]
Listens on 127.0.0.1 only. Same origin for page and node means no CORS and no mixed content.
"""
import http.server
import os
import sys
import urllib.error
import urllib.request

ROOT = sys.argv[1]
PORT = int(sys.argv[2]) if len(sys.argv) > 2 else 8090
NODE = sys.argv[3] if len(sys.argv) > 3 else 'http://127.0.0.1:18081'
NODE_PATHS = ('/json_rpc', '/binary_rpc', '/sync_blocks/')
LOG_NODE = bool(os.environ.get('LOG_NODE'))  # LOG_NODE=1 also logs requests forwarded to the node


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      '.wasm': 'application/wasm', '.js': 'text/javascript',
                      '.webmanifest': 'application/manifest+json'}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def proxy(self, body=None):
        if not self.path.startswith(NODE_PATHS):
            self.send_error(404)
            return
        req = urllib.request.Request(NODE + self.path, data=body, method=self.command,
                                     headers={'Content-Type': self.headers.get('Content-Type', 'application/json')})
        try:
            with urllib.request.urlopen(req, timeout=600) as r:
                code, data, ctype = r.status, r.read(), r.headers.get('Content-Type', '')
        except urllib.error.HTTPError as e:
            code, data, ctype = e.code, e.read(), e.headers.get('Content-Type', '')
        except OSError as e:
            code, data, ctype = 502, str(e).encode(), 'text/plain'
        self.send_response(code)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self):
        self.proxy(self.rfile.read(int(self.headers.get('Content-Length', 0))))

    def do_GET(self):
        if self.path.startswith(NODE_PATHS):
            return self.proxy()
        return super().do_GET()

    def log_message(self, fmt, *args):
        if LOG_NODE or not self.path.startswith(NODE_PATHS):
            super().log_message(fmt, *args)


http.server.ThreadingHTTPServer(('127.0.0.1', PORT), Handler).serve_forever()
