#!/usr/bin/env node
/**
 * POC2 — Fase 1: Gate do "entendimento"
 * Cascata: WAV → Soniox (ASR streaming + diarização) → Gemini Flash
 * (tradução com prompt teológico + glossário) → console.
 *
 * Zero dependências: usa WebSocket e fetch nativos do Node (>=22).
 *
 * Uso:
 *   node fase1-cli.js [caminho-do-wav]
 *   (default: ../live-translate/test-audio/orador-en.wav)
 *
 * Custo: NUNCA na tela — apenas em logs/custo.log (decisão do projeto).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------- .env ----------
function loadEnv(file) {
  const env = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}
const env = loadEnv(path.join(__dirname, '.env'));
const SONIOX_API_KEY = env.SONIOX_API_KEY;
const GEMINI_API_KEY = env.GEMINI_API_KEY;
const SONIOX_MODEL = env.SONIOX_MODEL || 'stt-rt-v5';
const GEMINI_MODEL = env.GEMINI_MODEL || 'gemini-3.6-flash';
const TARGET_LANGS = (env.TARGET_LANGS || 'pt-BR,es').split(',').map(s => s.trim());
if (!SONIOX_API_KEY || !GEMINI_API_KEY) {
  console.error('Faltam SONIOX_API_KEY / GEMINI_API_KEY no .env');
  process.exit(1);
}

// ---------- glossário ----------
const glossario = JSON.parse(fs.readFileSync(path.join(__dirname, 'glossario.json'), 'utf8'));

const LANG_INFO = {
  'pt-BR': {
    nome: 'português brasileiro',
    biblia: 'Almeida Revista e Atualizada / NVI',
    rotulo: 'PT',
  },
  es: {
    nome: 'espanhol (América Latina)',
    biblia: 'Reina-Valera 1960',
    rotulo: 'ES',
  },
};

function systemPrompt(lang) {
  const info = LANG_INFO[lang];
  const gloss = glossario[lang] || {};
  const linhas = Object.entries(gloss).map(([en, tr]) => `${en} -> ${tr}`).join('\n');
  return [
    `Você é um intérprete simultâneo de um culto cristão evangélico.`,
    `Traduza do inglês para ${info.nome}.`,
    `Use a terminologia bíblica consagrada da ${info.biblia}.`,
    `Reconheça livros e personagens bíblicos e use as grafias oficiais.`,
    `Ao ouvir uma citação ou referência de versículo, use a forma consagrada da referência (ex.: "John 3:16" -> "João 3:16") e o texto da tradução consagrada para AS PALAVRAS QUE O ORADOR DISSE.`,
    `NUNCA complete ou estenda uma citação além do que foi dito; traduza apenas o trecho falado.`,
    `O texto vem de reconhecimento de fala e pode ter pequenos erros; corrija pelo contexto sem comentar.`,
    `Se houver marcação de falante no início (ex.: "[Falante 2]"), preserve-a exatamente e traduza só a fala.`,
    `Traduza SOMENTE; nunca responda, comente, explique ou adicione nada.`,
    `Mantenha o registro reverente e oral da pregação.`,
    ``,
    `GLOSSÁRIO OBRIGATÓRIO (inglês -> tradução):`,
    linhas,
  ].join('\n');
}

// ---------- custo (apenas log, NUNCA na tela) ----------
const logsDir = path.join(__dirname, 'logs');
fs.mkdirSync(logsDir, { recursive: true });
const custoLog = fs.createWriteStream(path.join(logsDir, 'custo.log'), { flags: 'a' });
function logCusto(obj) {
  custoLog.write(JSON.stringify({ ts: new Date().toISOString(), ...obj }) + '\n');
}

// ---------- Gemini ----------
async function traduzir(lang, texto, contexto) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  const userText = contexto.length
    ? `Contexto anterior (já traduzido, NÃO retraduzir):\n${contexto.join('\n')}\n\nTraduza APENAS a fala a seguir:\n${texto}`
    : `Traduza APENAS a fala a seguir:\n${texto}`;
  const body = {
    systemInstruction: { parts: [{ text: systemPrompt(lang) }] },
    contents: [{ role: 'user', parts: [{ text: userText }] }],
    generationConfig: { temperature: 0.2, thinkingConfig: { thinkingLevel: 'LOW' } },
  };
  const t0 = Date.now();
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const ms = Date.now() - t0;
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini ${res.status}: ${errText.slice(0, 300)}`);
  }
  const data = await res.json();
  const out = data.candidates?.[0]?.content?.parts?.map(p => p.text).join('') ?? '';
  logCusto({ tipo: 'gemini', lang, ms, usage: data.usageMetadata ?? null });
  return { texto: out.trim(), ms };
}

// ---------- áudio ----------
const audioPath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(__dirname, '..', 'live-translate', 'test-audio', 'orador-en.wav');
if (!fs.existsSync(audioPath)) {
  console.error(`Áudio não encontrado: ${audioPath}`);
  process.exit(1);
}
const wav = fs.readFileSync(audioPath);
// 16 kHz * 2 bytes * mono → 3200 bytes = 100 ms
const CHUNK = 3200;
const CHUNK_MS = 100;

// ---------- estado ----------
let wallStart = 0;              // quando o streaming de áudio começou
let bufferTokens = [];          // tokens finais ainda não despachados
let contexto = [];              // últimas frases EN já traduzidas (p/ pronomes)
let segN = 0;
const metricas = [];            // p/ resumo do gate
let pendentes = [];             // promises de tradução em andamento
let speakersVistos = new Set();

function fmt(ms) { return (ms / 1000).toFixed(2) + 's'; }

async function flushSegmento(motivo) {
  if (!bufferTokens.length) return;
  const tokens = bufferTokens;
  bufferTokens = [];
  const texto = tokens.map(t => t.text).join('').trim();
  if (!texto || !/[a-zA-Z0-9]/.test(texto)) return; // ignora sobras de pontuação
  const seg = ++segN;
  const speaker = tokens.find(t => t.speaker != null)?.speaker;
  if (speaker != null) speakersVistos.add(speaker);
  const rotuloFalante = speaker != null && speakersVistos.size > 1 ? `[Falante ${speaker}] ` : (speaker != null ? `[Falante ${speaker}] ` : '');
  const endMs = tokens[tokens.length - 1].end_ms ?? 0;
  const tFlush = Date.now();
  const asrLag = tFlush - wallStart - endMs; // atraso do ASR vs áudio real

  console.log(`\n#${seg} ${rotuloFalante}EN: ${texto}`);

  const textoParaLLM = rotuloFalante ? `${rotuloFalante}${texto}` : texto;
  const ctx = contexto.slice(-3);
  contexto.push(texto);

  const p = Promise.all(
    TARGET_LANGS.map(lang =>
      traduzir(lang, textoParaLLM, ctx)
        .then(r => ({ lang, ...r }))
        .catch(e => ({ lang, texto: `(erro: ${e.message})`, ms: -1 }))
    )
  ).then(results => {
    const tDone = Date.now();
    const fimFalaAteTraducao = tDone - wallStart - endMs;
    for (const r of results) {
      const rot = LANG_INFO[r.lang]?.rotulo ?? r.lang;
      console.log(`#${seg}    ${rot}: ${r.texto}   [llm ${r.ms >= 0 ? r.ms + 'ms' : 'erro'}]`);
    }
    console.log(`#${seg}    ⏱ fim-de-fala → tradução: ${fmt(fimFalaAteTraducao)} (asr-lag ${fmt(asrLag)}, motivo: ${motivo})`);
    metricas.push({ seg, fimFalaAteTraducao, asrLag });
  });
  pendentes.push(p);
}

// ---------- Soniox ----------
const ws = new WebSocket('wss://stt-rt.soniox.com/transcribe-websocket');
ws.binaryType = 'arraybuffer';

ws.addEventListener('open', () => {
  const termos = [...new Set([...Object.keys(glossario['pt-BR'] ?? {})])].filter(t => /^[A-Z]/.test(t));
  ws.send(JSON.stringify({
    api_key: SONIOX_API_KEY,
    model: SONIOX_MODEL,
    audio_format: 'auto',
    language_hints: ['en'],
    enable_speaker_diarization: true,
    enable_endpoint_detection: true,
    endpoint_latency_adjustment_level: 2,
    endpoint_sensitivity: 0.3,
    max_endpoint_delay_ms: 1500,
    context: { terms: termos },
  }));

  console.log(`▶ Streaming ${path.basename(audioPath)} em ritmo real (${(wav.length / 32000).toFixed(1)}s de áudio)…`);
  wallStart = Date.now();
  let off = 0;
  // Ritmado pelo relógio (setInterval sozinho atrasa e acumula lag):
  // a cada tick, envia quantos chunks forem necessários p/ alcançar o tempo real.
  const timer = setInterval(() => {
    const alvo = Math.min(wav.length, Math.ceil(((Date.now() - wallStart) / CHUNK_MS)) * CHUNK);
    while (off < alvo) {
      ws.send(wav.subarray(off, Math.min(off + CHUNK, alvo)));
      off += CHUNK;
    }
    if (off >= wav.length) {
      clearInterval(timer);
      ws.send(''); // frame vazio encerra o stream
    }
  }, 20);
});

ws.addEventListener('message', async ev => {
  const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : Buffer.from(ev.data).toString('utf8'));
  if (msg.error_code) {
    console.error(`Soniox erro ${msg.error_code}: ${msg.error_message}`);
    process.exitCode = 1;
    ws.close();
    return;
  }
  for (const t of msg.tokens ?? []) {
    if (!t.is_final) continue;
    // tokens especiais do endpoint detection (ex.: "<end>") fecham o segmento
    if (t.text.startsWith('<')) {
      if (t.text === '<end>') await flushSegmento('endpoint');
      continue;
    }
    // troca de falante fecha o segmento anterior
    const prev = bufferTokens[bufferTokens.length - 1];
    if (prev && t.speaker != null && prev.speaker != null && t.speaker !== prev.speaker) {
      await flushSegmento('troca-de-falante');
    }
    bufferTokens.push(t);
    if (/[.!?]$/.test(t.text.trim())) await flushSegmento('pontuação');
  }
  if (msg.finished) {
    await flushSegmento('fim-do-áudio');
    logCusto({ tipo: 'soniox', audio_ms: msg.total_audio_proc_ms ?? null, modelo: SONIOX_MODEL });
    await Promise.all(pendentes);
    resumo();
    ws.close();
  }
});

ws.addEventListener('error', e => {
  console.error('WebSocket erro:', e.message ?? e);
  process.exitCode = 1;
});

function resumo() {
  if (!metricas.length) { console.log('\nNenhum segmento processado.'); return; }
  const lat = metricas.map(m => m.fimFalaAteTraducao).sort((a, b) => a - b);
  const mediana = lat[Math.floor(lat.length / 2)];
  console.log('\n──────── RESUMO DO GATE ────────');
  console.log(`Segmentos: ${metricas.length} | Falantes detectados: ${speakersVistos.size || 'n/d'}`);
  console.log(`G3 Latência fim-de-fala → tradução: mediana ${fmt(mediana)}, máx ${fmt(lat[lat.length - 1])} (meta ≤ 4s)`);
  console.log(`G1/G2/G4: conferir terminologia, citações e falantes na saída acima.`);
  console.log(`G5: custo registrado em logs/custo.log (nunca na tela).`);
}
