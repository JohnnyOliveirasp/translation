// Teste E2E da Fase 2 sem navegador:
// simula o operador (POST /api/audio com o WAV em ritmo real, sem header)
// e 2 ouvintes (SSE pt-BR e es). Uso: node scripts/test-fase2.js [wav]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = 'http://localhost:' + (fs.readFileSync(new URL('../.env', import.meta.url), 'utf8').match(/^PORT=([0-9]+)/m)?.[1] || '4100');
const SENHA = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8')
  .match(/^BROADCAST_PASSWORD=(.*)$/m)?.[1]?.trim() || 'poc2';
const wavPath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(__dirname, '..', 'test-audio', 'dialogo-en.wav');

const wav = fs.readFileSync(wavPath);
const dataIdx = wav.indexOf('data') + 8; // pula header até o chunk de dados
const pcm = wav.subarray(dataIdx);

async function ouvinte(lang) {
  const res = await fetch(`${BASE}/api/captions?lang=${lang}`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  (async () => {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const bloco = buf.slice(0, i); buf = buf.slice(i + 2);
        const linha = bloco.split('\n').find(l => l.startsWith('data: '));
        if (!linha) continue;
        const m = JSON.parse(linha.slice(6));
        if (m.type === 'caption') {
          console.log(`[${lang}] #${m.seg}${m.speaker != null ? ` (falante ${m.speaker})` : ''}: ${m.text}`);
        } else if (m.type === 'audio') {
          console.log(`[${lang}] #${m.seg} 🔊 voz: ${((m.data?.length || 0) * 0.75 / 2 / 24000).toFixed(1)}s de áudio`);
        } else {
          console.log(`[${lang}] evento: ${m.type} ${JSON.stringify({ ...m, type: undefined })}`);
        }
      }
    }
  })();
}

async function main() {
  await ouvinte('src');
  await ouvinte('pt-BR');
  await ouvinte('es');

  let r = await fetch(`${BASE}/api/control`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'start', password: SENHA }),
  });
  if (!r.ok) { console.error('start falhou', await r.text()); process.exit(1); }
  console.log(`▶ transmitindo ${path.basename(wavPath)} (${(pcm.length / 32000).toFixed(1)}s)…`);

  // envia como o navegador: blocos de 8192 bytes (256ms), sequencial, ritmo real
  const CHUNK = 8192;
  const t0 = Date.now();
  let off = 0;
  while (off < pcm.length) {
    const alvo = Math.min(pcm.length, Math.ceil(((Date.now() - t0) / 256)) * CHUNK);
    while (off < alvo) {
      const fim = Math.min(off + CHUNK, pcm.length);
      await fetch(`${BASE}/api/audio`, { method: 'POST', headers: { 'x-pw': SENHA }, body: pcm.subarray(off, fim) });
      off = fim;
    }
    await new Promise(res => setTimeout(res, 50));
  }
  console.log('▶ áudio enviado; aguardando legendas finais…');
  await new Promise(res => setTimeout(res, 12000));

  await fetch(`${BASE}/api/control`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'stop', password: SENHA }),
  });
  console.log('▶ fim.');
  process.exit(0);
}
main();
