// POC2 — servidor da Fase 2. Zero dependências (http + SSE nativos).
//   /            → ouvinte (legendas no idioma escolhido)
//   /broadcast   → operador (senha, microfone, mute)
//   POST /api/audio      → chunks PCM s16le 16k mono do operador
//   GET  /api/captions   → SSE de legendas (?lang=pt-BR | es | src)
//   POST /api/control    → start | stop | set-mute (senha)
//   GET  /api/status     → { live, muted, listeners }
// Custo: NUNCA na tela — apenas logs/custo.log.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Cascata } from './lib/cascata.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------- .env ----------
const env = {};
for (const line of fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const PORT = Number(env.PORT || 4100);
const SENHA = env.BROADCAST_PASSWORD || 'poc2';
const LANGS = (env.TARGET_LANGS || 'pt-BR,es').split(',').map(s => s.trim());

const glossario = JSON.parse(fs.readFileSync(path.join(__dirname, 'glossario.json'), 'utf8'));

// ---------- log de custo ----------
fs.mkdirSync(path.join(__dirname, 'logs'), { recursive: true });
const custoLog = fs.createWriteStream(path.join(__dirname, 'logs', 'custo.log'), { flags: 'a' });
const logCusto = obj => custoLog.write(JSON.stringify({ ts: new Date().toISOString(), ...obj }) + '\n');

// ---------- estado ----------
let cascata = null;
let muted = false;
const sse = new Set(); // { res, lang }

// contadores da transmissão atual (visíveis em /api/health e no pm2 logs)
let stats = null;
function zerarStats() {
  stats = { inicio: new Date().toISOString(), segmentos: 0, legendas: 0, voz_ok: 0, voz_429: 0, voz_falha: 0, reconexoes_asr: 0 };
}
const hora = () => new Date().toISOString().slice(11, 19);

function enviarSse(evt, filtroLang = null) {
  const linha = `data: ${JSON.stringify(evt)}\n\n`;
  for (const c of sse) {
    if (filtroLang && c.lang !== filtroLang) continue;
    c.res.write(linha);
  }
}

function novaCascata() {
  return new Cascata({
    sonioxKey: env.SONIOX_API_KEY,
    geminiKey: env.GEMINI_API_KEY,
    sonioxModel: env.SONIOX_MODEL || 'stt-rt-v5',
    geminiModel: env.GEMINI_MODEL || 'gemini-3.6-flash',
    langs: LANGS,
    glossario,
    ttsProvider: env.TTS_PROVIDER || (env.ELEVENLABS_API_KEY ? 'elevenlabs' : 'gemini'),
    ttsModel: env.TTS_MODEL || 'gemini-3.1-flash-tts-preview',
    voiceName: env.VOICE_NAME || 'Fenrir',
    elevenKey: env.ELEVENLABS_API_KEY || '',
    elevenVoiceId: env.ELEVENLABS_VOICE_ID || 'pNInz6obpgDQGcFmaJgB', // Adam (masculina) — trocável
    elevenModel: env.ELEVENLABS_MODEL || 'eleven_flash_v2_5',
    onCaption: evt => {
      stats.legendas++;
      console.log(`${hora()} [#${evt.seg} ${evt.lang}] legenda: ${evt.text.slice(0, 60)}`);
      enviarSse({ type: 'caption', ...evt }, evt.lang);
    },
    onAudio: evt => {
      console.log(`${hora()} [#${evt.seg} ${evt.lang}] 🔊 voz entregue`);
      enviarSse({ type: 'audio', seg: evt.seg, lang: evt.lang, data: evt.data }, evt.lang);
    },
    onSource: evt => {
      stats.segmentos++;
      console.log(`${hora()} [#${evt.seg} EN${evt.speaker != null ? ` f${evt.speaker}` : ''}] ${evt.text.slice(0, 70)}`);
      enviarSse({ type: 'caption', lang: 'src', ...evt }, 'src');
    },
    onLog: obj => {
      logCusto(obj);
      if (obj.tipo === 'tts') stats.voz_ok++;
      if (obj.tipo === 'tts-429') { stats.voz_429++; console.log(`${hora()} [#${obj.seg} ${obj.lang}] ⚠ voz 429 (tentativa ${obj.tentativa})`); }
      if (obj.tipo === 'tts-erro') { stats.voz_falha++; console.log(`${hora()} [#${obj.seg} ${obj.lang}] ✖ voz FALHOU — só legenda`); }
      if (obj.tipo === 'gemini-erro') console.log(`${hora()} [#${obj.seg} ${obj.lang}] ✖ tradução falhou: ${obj.msg}`);
      if (obj.tipo === 'soniox-erro') console.log(`${hora()} ✖ soniox: ${obj.code} ${obj.msg}`);
    },
    onState: s => {
      if (s === 'reconectando') stats.reconexoes_asr++;
      console.log(`${hora()} pipeline: ${s}`);
      enviarSse({ type: 'pipeline', state: s });
    },
  });
}

// ---------- helpers ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.png': 'image/png', '.js': 'text/javascript', '.css': 'text/css' };
function servirArquivo(res, rel) {
  const abs = path.join(__dirname, 'public', rel);
  if (!abs.startsWith(path.join(__dirname, 'public')) || !fs.existsSync(abs)) {
    res.writeHead(404); res.end('not found'); return;
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(abs)] || 'application/octet-stream' });
  fs.createReadStream(abs).pipe(res);
}
function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}
function lerCorpo(req) {
  return new Promise(resolve => {
    const parts = [];
    req.on('data', d => parts.push(d));
    req.on('end', () => resolve(Buffer.concat(parts)));
  });
}
function ouvintesPorLang() {
  const c = {};
  for (const s of sse) if (s.lang !== 'src') c[s.lang] = (c[s.lang] || 0) + 1;
  return c;
}

// ---------- servidor ----------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'GET' && url.pathname === '/') return servirArquivo(res, 'index.html');
  if (req.method === 'GET' && url.pathname === '/broadcast') return servirArquivo(res, 'broadcast.html');
  if (req.method === 'GET' && url.pathname.startsWith('/static/')) return servirArquivo(res, url.pathname.slice(8));

  if (req.method === 'GET' && url.pathname === '/api/status') {
    return json(res, 200, { live: !!cascata, muted, listeners: ouvintesPorLang(), langs: LANGS });
  }

  // saúde da transmissão atual (contadores; sem valores de custo)
  if (req.method === 'GET' && url.pathname === '/api/health') {
    return json(res, 200, { live: !!cascata, muted, listeners: ouvintesPorLang(), ...(stats ?? {}) });
  }

  if (req.method === 'GET' && url.pathname === '/api/captions') {
    const lang = url.searchParams.get('lang');
    if (lang !== 'src' && !LANGS.includes(lang)) return json(res, 400, { error: 'idioma inválido' });
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.write(`data: ${JSON.stringify({ type: 'hello', live: !!cascata, muted })}\n\n`);
    const cliente = { res, lang };
    sse.add(cliente);
    const ping = setInterval(() => res.write(': ping\n\n'), 15000);
    req.on('close', () => { clearInterval(ping); sse.delete(cliente); });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/control') {
    let body;
    try { body = JSON.parse((await lerCorpo(req)).toString('utf8')); } catch { return json(res, 400, { error: 'json inválido' }); }
    if (body.password !== SENHA) return json(res, 401, { error: 'senha errada' });

    if (body.action === 'login') return json(res, 200, { ok: true });
    if (body.action === 'start') {
      if (!cascata) { zerarStats(); console.log(`${hora()} ▶▶ TRANSMISSÃO INICIADA`); cascata = novaCascata(); cascata.start(); logCusto({ tipo: 'transmissao', evento: 'start' }); }
      muted = false;
      enviarSse({ type: 'live', live: true });
      return json(res, 200, { ok: true });
    }
    if (body.action === 'stop') {
      if (cascata) console.log(`${hora()} ■■ TRANSMISSÃO ENCERRADA — ${JSON.stringify(stats)}`);
      cascata?.stop(); cascata = null; muted = false;
      logCusto({ tipo: 'transmissao', evento: 'stop' });
      enviarSse({ type: 'live', live: false });
      return json(res, 200, { ok: true });
    }
    if (body.action === 'set-mute') {
      muted = !!body.muted;
      enviarSse({ type: 'mute', muted });
      return json(res, 200, { ok: true });
    }
    return json(res, 400, { error: 'ação desconhecida' });
  }

  if (req.method === 'POST' && url.pathname === '/api/audio') {
    if (req.headers['x-pw'] !== SENHA) return json(res, 401, { error: 'senha errada' });
    const buf = await lerCorpo(req);
    if (cascata && !muted && buf.length) cascata.write(buf);
    return json(res, 200, { ok: true });
  }

  res.writeHead(404); res.end('not found');
});

server.listen(PORT, () => {
  console.log(`POC2 no ar: http://localhost:${PORT}  (ouvinte)`);
  console.log(`            http://localhost:${PORT}/broadcast  (operador)`);
});
