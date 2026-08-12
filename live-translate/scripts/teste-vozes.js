// A1 — Teste de VOZ FIXA no modelo de tradução.
//
// Pergunta que este script responde:
//   O gemini-3.5-live-translate-preview aceita `speechConfig` com voz nomeada?
//   Se aceitar, a voz para de variar entre renovações de sessão (bug do culto 09/08).
//
// Uso: node --env-file=.env.local scripts/teste-vozes.js [arquivo.wav] [--target pt-BR]
// Saída: um .wav por voz aceita, em test-audio/vozes/ — para escolher de ouvido.

import { GoogleGenAI } from '@google/genai';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const MODEL = 'gemini-3.5-live-translate-preview';
const IN_RATE = 16000, OUT_RATE = 24000, CHUNK_MS = 100;

// Catálogo de vozes do Live API. Priorizadas as masculinas graves/cheias
// (pedido do avaliador do culto: "uma voz mais grave e cheia seria ideal").
const VOZES = [
  { nome: 'Charon',  perfil: 'masculina grave, informativa' },
  { nome: 'Fenrir',  perfil: 'masculina firme, energética' },
  { nome: 'Orus',    perfil: 'masculina cheia, corporativa' },
  { nome: 'Puck',    perfil: 'masculina clara, animada' },
  { nome: 'Kore',    perfil: 'feminina firme (referência)' },
];

const args = process.argv.slice(2);
const inputPath = args.find(a => !a.startsWith('--')) || 'test-audio/orador-en.wav';
const target = args.includes('--target') ? args[args.indexOf('--target') + 1] : 'pt-BR';

if (!process.env.GEMINI_API_KEY) { console.error('ERRO: GEMINI_API_KEY ausente'); process.exit(1); }

// ---------- WAV ----------
function parseWav(buf) {
  let pos = 12, fmt = null, data = null;
  while (pos + 8 <= buf.length) {
    const id = buf.toString('ascii', pos, pos + 4), size = buf.readUInt32LE(pos + 4);
    if (id === 'fmt ') fmt = { channels: buf.readUInt16LE(pos + 10), sampleRate: buf.readUInt32LE(pos + 12), bits: buf.readUInt16LE(pos + 22) };
    else if (id === 'data') data = buf.subarray(pos + 8, pos + 8 + size);
    pos += 8 + size + (size % 2);
  }
  return { ...fmt, data };
}
function to16kMono(wav) {
  const n = wav.data.length / 2 / wav.channels;
  let mono = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let acc = 0;
    for (let c = 0; c < wav.channels; c++) acc += wav.data.readInt16LE((i * wav.channels + c) * 2);
    mono[i] = acc / wav.channels;
  }
  if (wav.sampleRate !== IN_RATE) {
    const outN = Math.floor(n * IN_RATE / wav.sampleRate), res = new Float32Array(outN);
    for (let i = 0; i < outN; i++) {
      const t = i * wav.sampleRate / IN_RATE, j = Math.floor(t), f = t - j;
      res[i] = mono[j] * (1 - f) + (mono[Math.min(j + 1, n - 1)] || 0) * f;
    }
    mono = res;
  }
  const out = Buffer.alloc(mono.length * 2);
  for (let i = 0; i < mono.length; i++) out.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(mono[i]))), i * 2);
  return out;
}
function writeWav(path, pcm, rate) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  writeFileSync(path, Buffer.concat([h, pcm]));
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------- teste de uma voz ----------
async function testarVoz(ai, pcm, voz) {
  const config = {
    responseModalities: ['AUDIO'],
    outputAudioTranscription: {},
    translationConfig: { targetLanguageCode: target, echoTargetLanguage: false },
  };
  if (voz) config.speechConfig = { voiceConfig: { prebuiltVoiceConfig: { voiceName: voz.nome } } };

  const audio = [];
  let setupOk, setupErr, fechado = false;
  const setup = new Promise((res, rej) => { setupOk = res; setupErr = rej; });

  let session;
  try {
    session = await ai.live.connect({
      model: MODEL, config,
      callbacks: {
        onmessage: (m) => {
          if (m.setupComplete) setupOk();
          for (const p of m.serverContent?.modelTurn?.parts ?? []) {
            if (p.inlineData?.data) audio.push(Buffer.from(p.inlineData.data, 'base64'));
          }
        },
        onerror: (e) => setupErr(new Error(e?.message ?? String(e))),
        onclose: (e) => { fechado = true; setupErr(new Error(e?.reason || 'conexão fechada')); },
      },
    });
  } catch (e) {
    return { ok: false, motivo: e?.message ?? String(e) };
  }

  try {
    await Promise.race([setup, sleep(12000).then(() => { throw new Error('timeout no setup'); })]);
  } catch (e) {
    try { session.close(); } catch {}
    return { ok: false, motivo: e.message };
  }

  // envia ~18s de áudio (amostra suficiente para julgar a voz)
  const chunk = IN_RATE * 2 * CHUNK_MS / 1000;
  const limite = Math.min(pcm.length, IN_RATE * 2 * 18);
  for (let off = 0; off < limite && !fechado; off += chunk) {
    session.sendRealtimeInput({ audio: { data: pcm.subarray(off, off + chunk).toString('base64'), mimeType: `audio/pcm;rate=${IN_RATE}` } });
    await sleep(CHUNK_MS / 4); // 4× tempo real, só para a amostra sair rápido
  }
  session.sendRealtimeInput({ audioStreamEnd: true });

  const fim = Date.now();
  let ultimo = 0, mudou = Date.now();
  while (Date.now() - fim < 25000 && !fechado) {
    await sleep(500);
    const bytes = audio.reduce((a, b) => a + b.length, 0);
    if (bytes !== ultimo) { ultimo = bytes; mudou = Date.now(); }
    else if (Date.now() - mudou > 3000 && bytes > 0) break;
  }
  try { session.close(); } catch {}

  const pcmOut = Buffer.concat(audio);
  return { ok: true, segundos: (pcmOut.length / 2 / OUT_RATE).toFixed(1), pcm: pcmOut };
}

// ---------- execução ----------
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const pcm = to16kMono(parseWav(readFileSync(inputPath)));
mkdirSync('test-audio/vozes', { recursive: true });

console.log(`Entrada: ${inputPath} | destino: ${target}\n`);
console.log('=== 1. Referência: SEM speechConfig (comportamento de hoje) ===');
const base = await testarVoz(ai, pcm, null);
if (base.ok) {
  writeWav('test-audio/vozes/0-sem-voz-fixa.wav', base.pcm, OUT_RATE);
  console.log(`   OK — ${base.segundos}s → test-audio/vozes/0-sem-voz-fixa.wav\n`);
} else {
  console.log(`   FALHOU: ${base.motivo}\n`);
}

console.log('=== 2. Com voz fixa (speechConfig) ===');
const aceitas = [];
for (const voz of VOZES) {
  process.stdout.write(`   ${voz.nome.padEnd(8)} (${voz.perfil})... `);
  const r = await testarVoz(ai, pcm, voz);
  if (r.ok && r.pcm.length > 0) {
    const arq = `test-audio/vozes/${voz.nome}.wav`;
    writeWav(arq, r.pcm, OUT_RATE);
    aceitas.push(voz.nome);
    console.log(`ACEITA ✔ (${r.segundos}s) → ${arq}`);
  } else {
    console.log(`RECUSADA ✖ — ${r.motivo || 'sem áudio'}`);
  }
  await sleep(1500); // respiro entre sessões
}

console.log('\n========== VEREDITO A1 ==========');
if (aceitas.length) {
  console.log(`O modelo ACEITA voz fixa. Vozes disponíveis: ${aceitas.join(', ')}`);
  console.log('→ Ouça os arquivos em test-audio/vozes/ e escolha. A voz escolhida elimina');
  console.log('  a troca de voz entre renovações de sessão (bug do culto 09/08).');
} else {
  console.log('O modelo NÃO aceita voz fixa — limitação do preview.');
  console.log('→ A troca de voz entre sessões não tem correção nesta arquitetura (vai para o Grupo B).');
}
process.exit(0);
