// TranslationBridge — bot server-side que faz LiveKit ↔ Gemini para UM idioma.
// Entra na sala, assina o áudio do organizador, envia à sessão Gemini e publica
// o áudio traduzido como participante `translator-{lang}`.
// Legendas vão por data channel confiável (topic 'legenda'), desacopladas do áudio.

import {
  Room, RoomEvent, AudioStream, AudioSource, AudioFrame,
  LocalAudioTrack, TrackPublishOptions, TrackSource, TrackKind,
} from '@livekit/rtc-node';
import { GoogleGenAI } from '@google/genai';
import { AccessToken } from 'livekit-server-sdk';
import { appendFileSync } from 'node:fs';

// Forense persistente em logs/sessao.log — o console do PM2 é apagado todo dia às
// 04:00 por um cron de limpeza de disco (pm2 flush); no culto de 16/08 isso deixou
// trocas de voz e um pulo de conteúdo sem diagnóstico possível. Aqui fica em disco.
/** Transcrição do que o ORADOR falou, no idioma dele — base do PDF do sermão.
 *  Uma linha por trecho: "HH:MM:SS texto". Só a ponte escriba da igreja escreve. */
export function logSermao(tag, texto) {
  try { appendFileSync(`logs/sermao-${tag}-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.log`,
    `${new Date().toISOString().slice(11, 19)} ${texto}
`); } catch {}
}

/** Tradução publicada para os ouvintes de um idioma — vira o PDF naquele idioma. */
export function logTraducao(tag, lang, texto) {
  try { appendFileSync(`logs/traducao-${tag}-${lang}-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.log`,
    `${new Date().toISOString().slice(11, 19)} ${texto}
`); } catch {}
}

export function logSessao(tag, line) {
  try { appendFileSync('logs/sessao.log', `${new Date().toISOString()} [${tag}] ${line}\n`); } catch {}
}

const MODEL = 'gemini-3.5-live-translate-preview';
const IN_RATE = 16000;
const OUT_RATE = 24000;
const CHUNK_MS = 100;              // frames de áudio do LiveKit
// MULTI-TENANT: a sala e a identidade do orador vêm da igreja (antes eram
// process.env.ROOM_NAME e a constante 'organizador', únicas no processo).
export class TranslationBridge {
  constructor(lang, { room, speakerIdentity, tag } = {}) {
    this.lang = lang;
    this.roomName = room;
    this.speakerIdentity = speakerIdentity;
    this.tag = tag || room;
    this.room = null;
    this.session = null;
    this.source = null;
    this.resumeHandle = null;
    this.running = false;
    this.reconnecting = false;
    this.sendChain = Promise.resolve();   // fila serial de frames → Gemini (evita pile-up no FFI)
    this.playChain = Promise.resolve();   // fila serial de frames → LiveKit
    this.queuedMs = 0;                    // atraso acumulado na fila de reprodução
    this.pendingB64 = [];                 // áudio captado durante a troca de sessão (reenviado depois)
    this.swapPending = false;             // goAway recebido → trocar na próxima pausa de fala
    this.swapTimer = null;
    this.sessaoNova = null;               // make-before-break: sessão pré-aberta no goAway
    this.preparandoNova = false;
    this.drenando = null;                 // sessão antiga terminando de falar após o chaveio
    this.recentesB64 = [];                // últimos ~2s da fala do orador (aquecimento da sessão nova)
    this.novaAquecidaEm = 0;              // quando o priming terminou — chaveio só depois do guard
    this.stats = { startedAt: null, lastAudioOutAt: null, geminiReconnects: 0, firstLatencyMs: null, droppedSilenceMs: 0 };
    this._lastInputAt = null;
    // MODO LOUVOR: durante a música o áudio SEGUE indo ao Gemini (para transcrever o
    // que está sendo cantado), mas a voz traduzida NÃO é publicada — o ouvinte recebe
    // a letra em texto, no idioma dele. Fora do louvor nada muda.
    this.worship = false;
    // escriba: a ponte que grava a fala do orador (uma por igreja — o texto de entrada
    // é o mesmo para todos os idiomas, gravar em todas duplicaria o sermão)
    this.escriba = false;
  }

  log(...a) { console.log(`[bridge:${this.tag}:${this.lang}]`, ...a); }

  async start() {
    this.running = true;
    this.stats.startedAt = Date.now();

    // 1. Sessão Gemini
    await this.connectGemini();

    // 2. Sala LiveKit
    const at = new AccessToken(process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET, {
      identity: `translator-${this.tag}-${this.lang}`, ttl: '6h',
    });
    at.addGrant({ room: this.roomName, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: true });

    this.room = new Room();
    this.room.on(RoomEvent.TrackSubscribed, (track, pub, participant) => {
      if (participant.identity === this.speakerIdentity && track.kind === TrackKind.KIND_AUDIO) {
        this.log('áudio do organizador assinado');
        this.pipeSpeakerAudio(track);
      }
    });
    // assina só o organizador (ouvintes e outros bridges são ignorados)
    this.room.on(RoomEvent.TrackPublished, (pub, participant) => {
      if (participant.identity === this.speakerIdentity) pub.setSubscribed(true);
    });

    await this.room.connect(process.env.LIVEKIT_URL, await at.toJwt(), { autoSubscribe: false, dynacast: false });
    this.log('conectado à sala', this.roomName);

    for (const p of this.room.remoteParticipants.values()) {
      if (p.identity === this.speakerIdentity) {
        for (const pub of p.trackPublications.values()) pub.setSubscribed(true);
      }
    }

    // 3. Track de saída (24 kHz mono)
    this.source = new AudioSource(OUT_RATE, 1);
    const track = LocalAudioTrack.createAudioTrack(`translator-${this.tag}-${this.lang}`, this.source);
    const opts = new TrackPublishOptions({ source: TrackSource.SOURCE_MICROPHONE });
    await this.room.localParticipant.publishTrack(track, opts);
    this.log('track de tradução publicada');
    this.manterVivo();
  }

  // A5 — SILÊNCIO ATIVO: mantém fluxo de áudio contínuo mesmo sem tradução (mute do
  // louvor). Sem isso, o celular do ouvinte trata a aba como inativa e derruba a
  // conexão — no culto 09/08 TODOS caíram durante 24 min de louvor. Com áudio
  // fluindo, o navegador trata a página como app de música e não dorme.
  // Custo zero: este silêncio passa só pelo LiveKit, nunca pelo Gemini.
  manterVivo() {
    const QUADRO_MS = 200;
    const amostras = new Int16Array((OUT_RATE * QUADRO_MS) / 1000); // zeros = silêncio
    this.keepAlive = setInterval(() => {
      if (!this.running || !this.source) return;
      if (this.queuedMs > 150) return; // tradução real tem prioridade
      // CRÍTICO: entra na MESMA fila serial do áudio real. captureFrame não
      // aceita chamadas concorrentes — silêncio em paralelo com fala derrubou
      // o áudio no ensaio de 11/08 (InvalidState em loop; ouvinte só com legenda).
      this.playChain = this.playChain
        .then(() => this.source?.captureFrame(new AudioFrame(amostras, OUT_RATE, 1, amostras.length)))
        .catch(e => {
          if (!this._kaErrAt || Date.now() - this._kaErrAt > 5000) {
            this._kaErrAt = Date.now();
            this.log('DIAG keepalive falhou:', e?.message ?? e);
          }
        });
    }, QUADRO_MS);
  }

  // abre UMA sessão Gemini (usada pela ativa, pela pré-aberta do goAway e pelo fallback)
  async abrirSessao() {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const config = {
      responseModalities: ['AUDIO'],
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      translationConfig: { targetLanguageCode: this.lang, echoTargetLanguage: false },
      contextWindowCompression: { slidingWindow: { targetTokens: 4000 }, triggerTokens: 100000 },
      // NO_RESUME=1: renovação abre sessão LIMPA (sem handle). O modelo preview às vezes
      // ignora a voz fixa (A1) nos primeiros segundos de sessão RETOMADA (blip de voz
      // feminina após o goAway). Palavras não se perdem: o buffer pendingB64 reenvia o
      // áudio da troca de qualquer forma.
      sessionResumption: this.usarHandle() ? { handle: this.resumeHandle } : {},
    };

    // A1 — VOZ FIXA: sem isto o modelo sorteia voz nova a cada renovação de sessão
    // (no culto 09/08 a voz virou de mulher para homem no meio da pregação).
    if (process.env.VOICE_NAME) {
      config.speechConfig = { voiceConfig: { prebuiltVoiceConfig: { voiceName: process.env.VOICE_NAME } } };
    }

    let sess = null;
    sess = await ai.live.connect({
      model: MODEL,
      config,
      callbacks: {
        onmessage: (msg) => this.onGeminiMessage(msg, sess),
        onerror: (e) => this.log('erro gemini:', e?.message ?? e),
        // só a sessão ATIVA dispara reconexão; drenando/pré-aberta fecham em silêncio
        onclose: () => { if (this.running && sess === this.session && !this.reconnecting) this.reconnectGemini('conexão fechada'); },
      },
    });
    return sess;
  }

  async connectGemini() {
    this.session = await this.abrirSessao();
    // o log reflete o modo REALMENTE usado (antes dizia "com handle" só porque o
    // handle existia — mesmo com NO_RESUME=1 enviando sessão limpa)
    const modo = this.usarHandle() ? '(retomada com handle)' : '(nova/limpa)';
    this.log('sessão Gemini aberta', modo);
    logSessao(`${this.tag}:${this.lang}`, `sessão aberta ${modo}`);
  }

  usarHandle() { return process.env.NO_RESUME !== '1' && !!this.resumeHandle; }

  // MAKE-BEFORE-BREAK: usa os ~50s de aviso do goAway para abrir a sessão nova EM
  // PARALELO, com a antiga ainda falando. No chaveio não há estado "reconectando",
  // não há buffer nem reenvio — o corte seco de ~3-5s vira latência normal.
  // MAKE_BEFORE_BREAK=0 no .env desativa e volta à troca clássica.
  async prepararSessaoNova() {
    if (process.env.MAKE_BEFORE_BREAK === '0') return;
    if (this.sessaoNova || this.preparandoNova || !this.running) return;
    this.preparandoNova = true;
    try {
      this.sessaoNova = await this.abrirSessao();
      this.log('sessão nova pré-aberta (make-before-break) — aguardando pausa de fala para chavear');
      logSessao(`${this.tag}:${this.lang}`, 'sessão nova pré-aberta (make-before-break)');
      this.aquecerSessaoNova();
    } catch (e) {
      this.log('pré-abertura falhou (cai na troca clássica):', e?.message ?? e);
      logSessao(`${this.tag}:${this.lang}`, `pré-abertura FALHOU: ${e?.message ?? e}`);
    } finally {
      this.preparandoNova = false;
    }
  }

  // AQUECIMENTO (blip de voz do culto 30/08): o modelo preview às vezes ignora a voz
  // fixa (A1) nos primeiros segundos de sessão NOVA — a cada chaveio a voz mudava por
  // instantes e voltava. Aqui a sessão pré-aberta recebe os últimos ~2s da fala (que a
  // ativa JÁ traduziu) e gera a primeira resposta ainda como coadjuvante: a saída é
  // barrada pelo filtro de sessão em onGeminiMessage, ninguém ouve. Quando o chaveio
  // acontece, o "primeiro turno" — onde a voz errada aparece — já passou.
  async aquecerSessaoNova() {
    const nova = this.sessaoNova;
    const frames = this.recentesB64.slice();
    this.novaAquecidaEm = 0;
    if (!nova || !frames.length) { this.novaAquecidaEm = Date.now(); return; }
    for (const b64 of frames) {
      if (this.sessaoNova !== nova || !this.running) return;   // chaveou/parou no meio: desiste
      try {
        await nova.sendRealtimeInput({ audio: { data: b64, mimeType: `audio/pcm;rate=${IN_RATE}` } });
      } catch { break; }
      await new Promise(r => setTimeout(r, CHUNK_MS / 2));     // 2× tempo real, como no reenvio
    }
    this.novaAquecidaEm = Date.now();
    this.log(`sessão nova aquecida (${(frames.length / 10).toFixed(1)}s de priming — resposta descartada)`);
    logSessao(`${this.tag}:${this.lang}`, `sessão nova aquecida (${(frames.length / 10).toFixed(1)}s de priming)`);
  }

  // o priming leva ~1s para enviar e o modelo responde ~1-3s depois; só chaveia quando
  // essa resposta (possivelmente na voz errada) já foi emitida e descartada
  novaProntaParaChavear() { return this.novaAquecidaEm > 0 && Date.now() - this.novaAquecidaEm >= 3000; }

  chavear(motivo) {
    const velha = this.session;
    this.session = this.sessaoNova;
    this.sessaoNova = null;
    this.stats.geminiReconnects++;
    this.log(`chaveado sem corte (${motivo}) — sessão antiga drena por 4s`);
    logSessao(`${this.tag}:${this.lang}`, `CHAVEADA sem corte (${motivo}) — antiga drena 4s`);
    // a antiga ainda entrega a tradução do que ouviu antes do chaveio
    this.drenando = velha;
    setTimeout(() => {
      if (this.drenando === velha) this.drenando = null;
      try { velha?.close?.(); } catch {}
    }, 4000);
  }

  onGeminiMessage(msg, sess) {
    if (msg.sessionResumptionUpdate?.newHandle) this.resumeHandle = msg.sessionResumptionUpdate.newHandle;
    if (msg.goAway) {
      if (sess && sess !== this.session) return; // goAway de sessão antiga/nova: ignora
      // temos ~50s de aviso: pré-abre a sessão nova JÁ e troca na próxima PAUSA DE
      // FALA (não corta palavra no meio); sem pausa em 25s, chaveia à força
      this.log(`goAway recebido (timeLeft=${msg.goAway.timeLeft}) → pré-abrindo sessão nova; troca na próxima pausa de fala`);
      logSessao(`${this.tag}:${this.lang}`, `goAway recebido (timeLeft=${msg.goAway.timeLeft})`);
      if (!this.swapPending && !this.reconnecting) {
        this.swapPending = true;
        this.prepararSessaoNova();
        this.swapTimer = setTimeout(() => {
          if (!this.swapPending) return;
          this.swapPending = false;
          if (this.sessaoNova) this.chavear('forçado — sem pausa de fala em 25s');
          else this.reconnectGemini('goAway — sem pausa de fala em 25s');
        }, 25000);
      }
      return;
    }
    // conteúdo vale da sessão ativa E da drenando (que termina de falar após o chaveio)
    if (sess && sess !== this.session && sess !== this.drenando) return;
    const sc = msg.serverContent;
    if (this.escriba && sc?.inputTranscription?.text && !this.worship) {
      logSermao(this.tag, sc.inputTranscription.text);
    }
    if (this.worship) {
      // letra: o que foi CANTADO (transcrição de entrada) + a versão no idioma do ouvinte
      const original = sc?.inputTranscription?.text;
      const traduzido = sc?.outputTranscription?.text;
      if (original || traduzido) this.sendLetra(original, traduzido);
      return;   // nenhuma voz traduzida sai durante a música
    }
    if (sc?.outputTranscription?.text) {
      this.sendLegenda(sc.outputTranscription.text);
      logTraducao(this.tag, this.lang, sc.outputTranscription.text);
    }
    for (const part of sc?.modelTurn?.parts ?? []) {
      if (part.inlineData?.data) this.enqueuePlayback(Buffer.from(part.inlineData.data, 'base64'));
    }
  }

  // reconexão com handle: sessão sobrevive à troca de WebSocket (validado na fase 1)
  async reconnectGemini(reason) {
    if (this.reconnecting || !this.running) return;
    this.reconnecting = true;
    this.stats.geminiReconnects++;
    this.log(`reconectando Gemini (${reason})...`);
    logSessao(`${this.tag}:${this.lang}`, `RECONEXÃO clássica iniciada (${reason})`);
    try { this.session?.close?.(); } catch {}
    for (let tent = 1; tent <= 5 && this.running; tent++) {
      try {
        await this.connectGemini();
        this.reconnecting = false;
        // Reenvia o áudio captado durante a troca — nenhuma palavra se perde.
        // EM RITMO CONTROLADO (2× tempo real): despejar tudo de uma vez fazia o
        // modelo processar apressado e a voz sair metálica por ~1 min (culto 09/08).
        const pend = this.pendingB64;
        this.pendingB64 = [];
        if (pend.length) {
          this.log(`retomado — reenviando ${(pend.length / 10).toFixed(1)}s de áudio da troca (ritmo 2×)`);
          logSessao(`${this.tag}:${this.lang}`, `reconectada — reenviando ${(pend.length / 10).toFixed(1)}s de áudio bufferizado`);
          (async () => {
            for (const b64 of pend) {
              if (!this.running || this.reconnecting) break;
              this.sendChain = this.sendChain.then(() =>
                this.session?.sendRealtimeInput({ audio: { data: b64, mimeType: `audio/pcm;rate=${IN_RATE}` } })
              ).catch(() => {});
              await new Promise(r => setTimeout(r, CHUNK_MS / 2)); // 100ms de áudio a cada 50ms
            }
          })();
        }
        return;
      } catch (e) {
        this.log(`tentativa ${tent} falhou:`, e?.message ?? e);
        await new Promise(r => setTimeout(r, 1000 * tent));
      }
    }
    this.reconnecting = false;
    // desiste: marca a ponte como morta para o manager recriá-la no próximo pedido
    this.running = false;
    this.log('ERRO: não conseguiu reconectar ao Gemini — ponte marcada como morta');
    logSessao(`${this.tag}:${this.lang}`, 'ERRO FATAL: reconexão esgotou as tentativas — ponte morta');
  }

  // áudio do orador → Gemini (fila serial; frames de 100 ms já saem do AudioStream)
  pipeSpeakerAudio(track) {
    const stream = new AudioStream(track, { sampleRate: IN_RATE, numChannels: 1 });
    (async () => {
      for await (const frame of stream) {
        if (!this.running) break;
        const b64 = Buffer.from(frame.data.buffer, frame.data.byteOffset, frame.data.byteLength).toString('base64');
        this._lastInputAt ??= Date.now();

        // rolagem dos últimos ~2s (20 frames de 100ms) para o aquecimento da sessão nova
        this.recentesB64.push(b64);
        if (this.recentesB64.length > 20) this.recentesB64.shift();

        // durante a troca de sessão: guarda em vez de descartar (cap de 20s)
        if (this.reconnecting) {
          if (this.pendingB64.length < 200) this.pendingB64.push(b64);
          continue;
        }

        // goAway pendente: espera um frame de silêncio (pausa de fala) para trocar
        if (this.swapPending) {
          let pico = 0;
          const d = frame.data;
          for (let i = 0; i < d.length; i += 8) { const v = Math.abs(d[i]); if (v > pico) pico = v; }
          if (pico < 300) {
            if (this.sessaoNova) {
              if (this.novaProntaParaChavear()) {
                // make-before-break: chaveia na hora; o frame segue para a sessão nova
                // pelo fluxo normal abaixo — sem gap, sem buffer, sem reenvio
                this.swapPending = false;
                clearTimeout(this.swapTimer);
                this.chavear('pausa de fala');
              }
              // senão: aquecimento ainda assentando — espera a próxima pausa
              // (o timer de 25s chaveia à força se demorar demais)
            } else if (!this.preparandoNova) {
              // pré-abertura falhou → troca clássica (com o pequeno corte de antes)
              this.swapPending = false;
              clearTimeout(this.swapTimer);
              this.pendingB64.push(b64);
              this.reconnectGemini('goAway — trocado em pausa de fala (sem sessão pré-aberta)');
              continue;
            }
            // ainda pré-abrindo: segue transmitindo e espera a próxima pausa
          }
        }

        this.sendChain = this.sendChain.then(() =>
          this.session?.sendRealtimeInput({ audio: { data: b64, mimeType: `audio/pcm;rate=${IN_RATE}` } })
        ).catch(e => this.log('erro no envio:', e?.message ?? e));
      }
      this.log('stream do organizador terminou');
    })();
  }

  // áudio traduzido → sala (fila serial no AudioSource)
  enqueuePlayback(buf) {
    if (this.stats.firstLatencyMs === null && this._lastInputAt) {
      this.stats.firstLatencyMs = Date.now() - this._lastInputAt;
      this.log(`primeira saída traduzida ${this.stats.firstLatencyMs} ms após o primeiro áudio de entrada`);
    }
    this.stats.lastAudioOutAt = Date.now();
    const samples = new Int16Array(buf.buffer, buf.byteOffset, buf.byteLength / 2);
    const durMs = (samples.length / OUT_RATE) * 1000;

    // O Gemini transmite áudio contínuo INCLUINDO silêncio (fase 1: 22s de fala
    // viraram 46s de stream). Se enfileirar tudo, qualquer pausa vira atraso
    // permanente entre voz e legenda. Quando a fila passa de ~1,2s, descarta os
    // trechos silenciosos — a fala nunca é cortada, e a voz realinha sozinha.
    if (this.queuedMs > 1200) {
      let pico = 0;
      for (let i = 0; i < samples.length; i += 8) {
        const v = Math.abs(samples[i]);
        if (v > pico) pico = v;
      }
      if (pico < 300) { this.stats.droppedSilenceMs += durMs; return; }
    }

    const frame = new AudioFrame(samples, OUT_RATE, 1, samples.length);
    this.queuedMs += durMs;
    this.playChain = this.playChain.then(() => this.source?.captureFrame(frame))
      .catch(e => {
        // rate-limit 1/s + contexto completo p/ diagnóstico
        if (!this._pbErrAt || Date.now() - this._pbErrAt > 1000) {
          this._pbErrAt = Date.now();
          this.log('erro no playback:', e?.message ?? e,
            `| closed=${this.source?.closed} srcRate=${this.source?.sampleRate} frame=${samples.length}@${OUT_RATE}Hz`,
            `off=${buf.byteOffset} fila=${Math.round(this.queuedMs)}ms qSrc=${Math.round(this.source?.queuedDuration ?? -1)}ms`);
        }
      })
      .finally(() => { this.queuedMs -= durMs; });
  }

  /** Letra do louvor ao vivo — canal separado da legenda da pregação. */
  sendLetra(original, traduzido) {
    try {
      const payload = new TextEncoder().encode(JSON.stringify({ lang: this.lang, original, traduzido }));
      this.room?.localParticipant?.publishData(payload, { reliable: true, topic: 'louvor' });
    } catch {}
  }

  sendLegenda(text) {
    try {
      const payload = new TextEncoder().encode(JSON.stringify({ lang: this.lang, text }));
      this.room?.localParticipant?.publishData(payload, { reliable: true, topic: 'legenda' });
    } catch {}
  }

  async stop() {
    this.running = false;
    clearInterval(this.keepAlive);
    clearTimeout(this.swapTimer);
    try { this.session?.close?.(); } catch {}
    try { this.sessaoNova?.close?.(); } catch {}
    try { this.drenando?.close?.(); } catch {}
    try { await this.room?.disconnect(); } catch {}
    this.log('encerrado');
  }
}
