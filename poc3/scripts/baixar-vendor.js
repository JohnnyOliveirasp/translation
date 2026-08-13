// Baixa os arquivos do MediaPipe Tasks Audio (VERSÃO PINADA) + modelo YAMNet
// para poc3/vendor/ — auto-hospedado, nada de CDN em runtime.
// Protocolo de segurança: versão 1.0.1 publicada em 2026-07-31 (>7 dias),
// osv.dev sem vulnerabilidades conhecidas (verificado em 2026-08-13).
'use strict';

const fs = require('fs');
const path = require('path');

const VERSAO = '1.0.1'; // NÃO subir de versão sem repetir cooldown 7 dias + osv/socket
const BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-audio@${VERSAO}`;
const MODELO = 'https://storage.googleapis.com/mediapipe-models/audio_classifier/yamnet/float32/1/yamnet.tflite';

const ARQUIVOS = [
  [`${BASE}/audio_bundle.mjs`, 'audio_bundle.js'],
  [`${BASE}/wasm/audio_wasm_internal.js`, 'wasm/audio_wasm_internal.js'],
  [`${BASE}/wasm/audio_wasm_internal.wasm`, 'wasm/audio_wasm_internal.wasm'],
  [`${BASE}/wasm/audio_wasm_nosimd_internal.js`, 'wasm/audio_wasm_nosimd_internal.js'],
  [`${BASE}/wasm/audio_wasm_nosimd_internal.wasm`, 'wasm/audio_wasm_nosimd_internal.wasm'],
  [MODELO, 'yamnet.tflite'],
];

(async () => {
  const raiz = path.join(__dirname, '..', 'vendor');
  fs.mkdirSync(path.join(raiz, 'wasm'), { recursive: true });
  for (const [url, destino] of ARQUIVOS) {
    const alvo = path.join(raiz, destino);
    process.stdout.write(`baixando ${destino} ... `);
    const r = await fetch(url);
    if (!r.ok) { console.error(`FALHOU (HTTP ${r.status})`); process.exit(1); }
    const buf = Buffer.from(await r.arrayBuffer());
    fs.writeFileSync(alvo, buf);
    console.log(`${(buf.length / 1024 / 1024).toFixed(2)} MB`);
  }
  console.log('\nvendor/ pronto. Rode: npm start (ou node server.js) e abra http://localhost:4200');
})();
