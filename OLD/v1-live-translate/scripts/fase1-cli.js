// Fase 1 — CLI: arquivo .wav → Gemini Live Translate → .wav traduzido
//
// Uso:
//   node --env-file=../.env.local scripts/fase1-cli.js <entrada.wav> [opções]
//
// Opções:
//   --target <código>   idioma de destino BCP-47 (padrão: pt-BR)
//   --out <arquivo>     wav de saída (padrão: <entrada>.<target>.wav)
//   --no-flags          conecta SEM contextWindowCompression/sessionResumption
//   --fast <n>          envia áudio n× mais rápido que tempo real (padrão: 1)
//
// Objetivo do gate (§4.3 da spec): descobrir se o modelo de tradução aceita
// contextWindowCompression + sessionResumption. O resultado sai no log final.

import { GoogleGenAI } from '@google/genai';
import { readFileSync, writeFileSync } from 'node:fs';

const MODEL = 'gemini-3.5-live-translate-preview';
const IN_RATE = 16000;   // entrada exigida pela API
const OUT_RATE = 24000;  // saída da API
const CHUNK_MS = 100;

// ---------- argumentos ----------
const args = process.argv.slice(2);
if (args.length === 0 || args[0].startsWith('--')) {
  console.error('Uso: node scripts/fase1-cli.js <entrada.wav> [--target pt-BR] [--out saida.wav] [--no-flags] [--fast 4]');
  process.exit(1);
}
const inputPath = args[0];
const getOpt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : def;
};
const target = getOpt('--target', 'pt-BR');
const outPath = getOpt('--out', inputPath.replace(/\.wav$/i, '') + `.${target}.wav`);
const useFlags = !args.includes('--no-flags');
const speed = Number(getOpt('--fast', '1'));

if (!process.env.GEMINI_API_KEY) {
  console.error('ERRO: GEMINI_API_KEY não definida. Rode com: node --env-file=../.env.local ...');
  process.exit(1);
}

// ---------- leitura do WAV ----------
function parseWav(buf) {
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('Arquivo não é WAV (RIFF/WAVE)');
  }
  let pos = 12, fmt = null, data = null;
  while (pos + 8 <= buf.length) {
    const id = buf.toString('ascii', pos, pos + 4);
    const size = buf.readUInt32LE(pos + 4);
    if (id === 'fmt ') {
      fmt = {
        audioFormat: buf.readUInt16LE(pos + 8),
        channels: buf.readUInt16LE(pos + 10),
        sampleRate: buf.readUInt32LE(pos + 12),
        bitsPerSample: buf.readUInt16LE(pos + 22),
      };
    } else if (id === 'data') {
      data = buf.subarray(pos + 8, pos + 8 + size);
    }
    pos += 8 + size + (size % 2);
  }
  if (!fmt || !data) throw new Error('WAV sem chunk fmt/data');
  if (fmt.audioFormat !== 1 || fmt.bitsPerSample !== 16) {
    throw new Error(`WAV precisa ser PCM 16-bit (formato=${fmt.audioFormat}, bits=${fmt.bitsPerSample}). Converta: ffmpeg -i entrada -ar 16000 -ac 1 -sample_fmt s16 saida.wav`);
  }
  return { ...fmt, data };
}

// mixdown para mono + reamostragem linear para 16 kHz
function to16kMono(wav) {
  const n = wav.data.length / 2 / wav.channels;
  let mono = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let acc = 0;
    for (let c = 0; c < wav.channels; c++) acc += wav.data.readInt16LE((i * wav.channels + c) * 2);
    mono[i] = acc / wav.channels;
  }
  if (wav.sampleRate !== IN_RATE) {
    const outN = Math.floor(n * IN_RATE / wav.sampleRate);
    const res = new Float32Array(outN);
    for (let i = 0; i < outN; i++) {
      const t = i * wav.sampleRate / IN_RATE;
      const j = Math.floor(t), f = t - j;
      res[i] = mono[j] * (1 - f) + (mono[Math.min(j + 1, n - 1)] || 0) * f;
    }
    mono = res;
  }
  const out = Buffer.alloc(mono.length * 2);
  for (let i = 0; i < mono.length; i++) {
    out.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(mono[i]))), i * 2);
  }
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

// ---------- sessão ----------
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function run() {
  const pcm = to16kMono(parseWav(readFileSync(inputPath)));
  const durS = pcm.length / 2 / IN_RATE;
  console.log(`Entrada: ${inputPath} → ${durS.toFixed(1)}s de áudio @16kHz mono`);
  console.log(`Destino: ${target} | flags de sessão longa: ${useFlags ? 'ATIVADAS' : 'desativadas'} | velocidade: ${speed}x`);

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  const config = {
    responseModalities: ['AUDIO'],
    inputAudioTranscription: {},
    outputAudioTranscription: {},
    translationConfig: {
      targetLanguageCode: target,
      echoTargetLanguage: false,
    },
  };
  if (useFlags) {
    config.contextWindowCompression = { slidingWindow: { targetTokens: 4000 }, triggerTokens: 100000 };
    config.sessionResumption = {};
  }

  const audioOut = [];
  let transcriptIn = '', transcriptOut = '';
  let resumptionHandles = 0, goAways = 0;
  let tFirstAudio = null, tSendStart = null;
  let setupOk, setupFail;
  const setupDone = new Promise((res, rej) => { setupOk = res; setupFail = rej; });
  let closed = false;

  const session = await ai.live.connect({
    model: MODEL,
    config,
    callbacks: {
      onopen: () => console.log('[conexão] WebSocket aberto'),
      onmessage: (msg) => {
        if (msg.setupComplete) { console.log('[conexão] setup aceito pelo servidor ✔'); setupOk(); }
        if (msg.sessionResumptionUpdate?.newHandle) {
          resumptionHandles++;
          if (resumptionHandles === 1) console.log('[gate] sessionResumptionUpdate recebido → RESUMPTION FUNCIONA ✔');
        }
        if (msg.goAway) { goAways++; console.log(`[aviso] goAway recebido, timeLeft=${msg.goAway.timeLeft}`); }
        const sc = msg.serverContent;
        if (sc?.inputTranscription?.text) transcriptIn += sc.inputTranscription.text;
        if (sc?.outputTranscription?.text) transcriptOut += sc.outputTranscription.text;
        for (const part of sc?.modelTurn?.parts ?? []) {
          if (part.inlineData?.data) {
            if (tFirstAudio === null) {
              tFirstAudio = Date.now();
              console.log(`[latência] primeiro áudio traduzido: ${((tFirstAudio - tSendStart) / 1000).toFixed(2)}s após início do envio`);
            }
            audioOut.push(Buffer.from(part.inlineData.data, 'base64'));
          }
        }
      },
      onerror: (e) => { console.error('[erro]', e?.message ?? e); setupFail(new Error(e?.message ?? String(e))); },
      onclose: (e) => {
        closed = true;
        const reason = e?.reason || '(sem motivo)';
        console.log(`[conexão] fechada: ${reason}`);
        setupFail(new Error('Conexão fechada antes do setup: ' + reason));
      },
    },
  });

  try {
    await Promise.race([setupDone, sleep(15000).then(() => { throw new Error('timeout de 15s no setup'); })]);
  } catch (err) {
    console.error(`\n>>> GATE: servidor REJEITOU a configuração${useFlags ? ' com as flags' : ''}: ${err.message}`);
    if (useFlags) console.error('>>> Rode novamente com --no-flags para confirmar que o problema são as flags → plano B (§4.4).');
    process.exit(2);
  }

  // envio em chunks de 100 ms
  const chunkBytes = IN_RATE * 2 * CHUNK_MS / 1000;
  tSendStart = Date.now();
  for (let off = 0; off < pcm.length && !closed; off += chunkBytes) {
    session.sendRealtimeInput({
      audio: { data: pcm.subarray(off, off + chunkBytes).toString('base64'), mimeType: `audio/pcm;rate=${IN_RATE}` },
    });
    await sleep(CHUNK_MS / speed);
  }
  console.log(`[envio] ${durS.toFixed(1)}s de áudio enviados em ${((Date.now() - tSendStart) / 1000).toFixed(1)}s`);
  session.sendRealtimeInput({ audioStreamEnd: true });

  // Espera a cauda da tradução. O modelo pode transmitir áudio continuamente
  // (inclusive silêncio), então além do critério "3s sem bytes novos" há um
  // teto duro de 25s após o fim do envio.
  const tEnd = Date.now();
  let lastBytes = 0, lastChange = Date.now(), tick = 0;
  while (Date.now() - tEnd < 25000 && !closed) {
    await sleep(500);
    const bytes = audioOut.reduce((a, b) => a + b.length, 0);
    if (bytes !== lastBytes) { lastBytes = bytes; lastChange = Date.now(); }
    else if (Date.now() - lastChange > 3000) break;
    if (++tick % 4 === 0) console.log(`[recebendo] ${(bytes / 2 / OUT_RATE).toFixed(1)}s de áudio acumulado`);
  }
  try { session.close(); } catch {}

  // ---------- resultado ----------
  const outPcm = Buffer.concat(audioOut);
  const outDur = outPcm.length / 2 / OUT_RATE;
  if (outPcm.length) writeWav(outPath, outPcm, OUT_RATE);

  console.log('\n========== RESULTADO ==========');
  console.log(`Áudio traduzido:  ${outDur.toFixed(1)}s → ${outPcm.length ? outPath : 'NENHUM ÁUDIO RECEBIDO ✖'}`);
  console.log(`Transcrição entrada: ${transcriptIn.trim() || '(vazia)'}`);
  console.log(`Transcrição saída:   ${transcriptOut.trim() || '(vazia)'}`);
  if (tFirstAudio) console.log(`Latência 1º áudio:   ${((tFirstAudio - tSendStart) / 1000).toFixed(2)}s`);
  console.log('---------- GATE §4.3 ----------');
  console.log(`Flags enviadas no setup:      ${useFlags ? 'sim' : 'não'}`);
  console.log(`Setup aceito:                 sim`);
  console.log(`sessionResumptionUpdate:      ${resumptionHandles} handle(s) ${resumptionHandles > 0 ? '→ RESUMPTION OK ✔' : '→ nenhum handle (inconclusivo em sessão curta)'}`);
  console.log(`goAway:                       ${goAways}`);
  process.exit(0);
}

run().catch((e) => { console.error('ERRO FATAL:', e); process.exit(1); });
