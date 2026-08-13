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

const MODEL = 'gemini-3.5-live-translate-preview';
const IN_RATE = 16000;
const OUT_RATE = 24000;
const CHUNK_MS = 100;              // frames de áudio do LiveKit
const ORGANIZADOR = 'organizador';

export class TranslationBridge {
  constructor(lang) {
    this.lang = lang;
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
    this.stats = { startedAt: null, lastAudioOutAt: null, geminiReconnects: 0, firstLatencyMs: null, droppedSilenceMs: 0 };
    this._lastInputAt = null;
  }

  log(...a) { console.log(`[bridge:${this.lang}]`, ...a); }

  async start() {
    this.running = true;
    this.stats.startedAt = Date.now();

    // 1. Sessão Gemini
    await this.connectGemini();

    // 2. Sala LiveKit
    const at = new AccessToken(process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET, {
      identity: `translator-${this.lang}`, ttl: '6h',
    });
    at.addGrant({ room: process.env.ROOM_NAME || 'culto', roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: true });

    this.room = new Room();
    this.room.on(RoomEvent.TrackSubscribed, (track, pub, participant) => {
      if (participant.identity === ORGANIZADOR && track.kind === TrackKind.KIND_AUDIO) {
        this.log('áudio do organizador assinado');
        this.pipeSpeakerAudio(track);
      }
    });
    // assina só o organizador (ouvintes e outros bridges são ignorados)
    this.room.on(RoomEvent.TrackPublished, (pub, participant) => {
      if (participant.identity === ORGANIZADOR) pub.setSubscribed(true);
    });

    await this.room.connect(process.env.LIVEKIT_URL, await at.toJwt(), { autoSubscribe: false, dynacast: false });
    this.log('conectado à sala', process.env.ROOM_NAME || 'culto');

    for (const p of this.room.remoteParticipants.values()) {
      if (p.identity === ORGANIZADOR) {
        for (const pub of p.trackPublications.values()) pub.setSubscribed(true);
      }
    }

    // 3. Track de saída (24 kHz mono)
    this.source = new AudioSource(OUT_RATE, 1);
    const track = LocalAudioTrack.createAudioTrack(`translator-${this.lang}`, this.source);
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

  async connectGemini() {
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

    this.session = await ai.live.connect({
      model: MODEL,
      config,
      callbacks: {
        onmessage: (msg) => this.onGeminiMessage(msg),
        onerror: (e) => this.log('erro gemini:', e?.message ?? e),
        onclose: () => { if (this.running) this.reconnectGemini('conexão fechada'); },
      },
    });
    // o log reflete o modo REALMENTE usado (antes dizia "com handle" só porque o
    // handle existia — mesmo com NO_RESUME=1 enviando sessão limpa)
    this.log('sessão Gemini aberta', this.usarHandle() ? '(retomada com handle)' : '(nova/limpa)');
  }

  usarHandle() { return process.env.NO_RESUME !== '1' && !!this.resumeHandle; }

  onGeminiMessage(msg) {
    if (msg.sessionResumptionUpdate?.newHandle) this.resumeHandle = msg.sessionResumptionUpdate.newHandle;
    if (msg.goAway) {
      // temos ~50s de aviso: troca na próxima PAUSA DE FALA (não corta palavra no meio);
      // se o orador não pausar em 25s, troca à força mesmo assim
      this.log(`goAway recebido (timeLeft=${msg.goAway.timeLeft}) → troca agendada para a próxima pausa de fala`);
      if (!this.swapPending && !this.reconnecting) {
        this.swapPending = true;
        this.swapTimer = setTimeout(() => {
          if (this.swapPending) { this.swapPending = false; this.reconnectGemini('goAway — sem pausa de fala em 25s'); }
        }, 25000);
      }
      return;
    }
    const sc = msg.serverContent;
    if (sc?.outputTranscription?.text) this.sendLegenda(sc.outputTranscription.text);
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
  }

  // áudio do orador → Gemini (fila serial; frames de 100 ms já saem do AudioStream)
  pipeSpeakerAudio(track) {
    const stream = new AudioStream(track, { sampleRate: IN_RATE, numChannels: 1 });
    (async () => {
      for await (const frame of stream) {
        if (!this.running) break;
        const b64 = Buffer.from(frame.data.buffer, frame.data.byteOffset, frame.data.byteLength).toString('base64');
        this._lastInputAt ??= Date.now();

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
            this.swapPending = false;
            clearTimeout(this.swapTimer);
            this.pendingB64.push(b64);
            this.reconnectGemini('goAway — trocado em pausa de fala');
            continue;
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
    try { await this.room?.disconnect(); } catch {}
    this.log('encerrado');
  }
}
