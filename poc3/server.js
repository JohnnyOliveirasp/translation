// POC3 — servidor estático zero-deps (localhost apenas).
// getUserMedia funciona em http://localhost sem HTTPS.
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORTA = 4200;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.wasm': 'application/wasm',
  '.tflite': 'application/octet-stream',
  '.css': 'text/css',
  '.map': 'application/json',
};

http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  const rel = url === '/' ? '/detector.html' : url;
  // /vendor/* vem da pasta vendor; o resto vem de public
  const base = rel.startsWith('/vendor/') ? __dirname : path.join(__dirname, 'public');
  const alvo = path.normalize(path.join(base, rel));
  if (!alvo.startsWith(path.normalize(base === __dirname ? path.join(__dirname, 'vendor') : base))) {
    res.writeHead(403); return res.end();
  }
  fs.readFile(alvo, (err, dados) => {
    if (err) { res.writeHead(404); return res.end('não encontrado: ' + rel); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(alvo)] || 'application/octet-stream' });
    res.end(dados);
  });
}).listen(PORTA, '127.0.0.1', () => {
  console.log(`POC3 detector: http://localhost:${PORTA}`);
  console.log('Se vendor/ estiver vazio, rode antes: node scripts/baixar-vendor.js');
});
