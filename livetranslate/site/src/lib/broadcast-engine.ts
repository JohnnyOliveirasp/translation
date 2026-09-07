/**
 * Motor da transmissão no navegador do operador — portado da POC3 (poc3/public/broadcast.html),
 * agora POR IGREJA e sem senha (quem chega aqui já entrou no painel).
 *
 * Duas capturas do mesmo microfone, de propósito (era assim na POC3):
 *   - CRUA (sem AGC/NS/EC) → YAMNet, para "ouvir a música de verdade";
 *   - PROCESSADA → LiveKit, que é o áudio que vai ao Gemini.
 * O detector controla track.mute()/unmute() e avisa o servidor (set-mute), que é o que
 * faz o ouvinte ver o aviso de louvor e impede a ponte de cair por ociosidade.
 */
import { supabase } from './supabase';
import { WorshipSense, CFG_PADRAO, type Cfg, type Janela } from './worship-sense';

type LK = any; // livekit-client UMD (vendor/, mesma versão do v1)

const VENDOR = '/vendor';
let lkPromise: Promise<LK> | null = null;

function loadLiveKit(): Promise<LK> {
  if ((window as any).LivekitClient) return Promise.resolve((window as any).LivekitClient);
  lkPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = `${VENDOR}/livekit-client.umd.min.js`;
    s.onload = () => resolve((window as any).LivekitClient);
    s.onerror = () => reject(new Error('failed to load livekit-client'));
    document.head.appendChild(s);
  });
  return lkPromise;
}

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export type EngineEvents = {
  onJanela?: (j: Janela, nivel: number) => void;
  onMute?: (muted: boolean, motivo: string) => void;
  onErro?: (msg: string) => void;
  onStatus?: (s: { listeners: Record<string, number>; muted: boolean }) => void;
};

export type Modo = 'AUTO' | 'FORCE_ON' | 'FORCE_OFF';

export class BroadcastEngine {
  private lk: LK = null;
  private room: any = null;
  private track: any = null;
  private classifier: any = null;
  private audioCtx: AudioContext | null = null;
  private streamCru: MediaStream | null = null;
  private analyser: AnalyserNode | null = null;
  private sense = new WorshipSense();
  private timers: number[] = [];
  private logBuf: string[] = [];
  private raf = 0;

  modo: Modo = 'AUTO';
  muted: boolean | null = null;   // null = ainda não aplicado
  rodando = false;

  constructor(private slug: string, private ev: EngineEvents = {}) {}

  setModo(m: Modo) { this.modo = m; this.decidir(); }
  setCfg(c: Cfg) { this.sense.setCfg(c); }

  /** Lista de microfones (pede permissão antes para os rótulos aparecerem). */
  static async microfones() {
    await navigator.mediaDevices.getUserMedia({ audio: true }).then(s => s.getTracks().forEach(t => t.stop()));
    const list = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'audioinput');
    const mesa = list.find(d => /scarlett|focusrite|qu-6|allen|usb audio/i.test(d.label || ''));
    return { list, preferido: mesa?.deviceId ?? list[0]?.deviceId ?? '' };
  }

  private async api(action: string, extra: Record<string, unknown> = {}) {
    const r = await fetch('/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ slug: this.slug, action, ...extra }),
    });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
    return r.json();
  }

  async iniciar(deviceId: string, sourceLang: string) {
    // 1) idioma do orador ANTES de conectar (o servidor derruba a ponte desse idioma)
    await this.api('set-source', { lang: sourceLang });

    // 2) token da sala DESTA igreja
    const r = await fetch('/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ slug: this.slug, role: 'operador' }),
    });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'token refused');
    const { token, url } = await r.json();

    // 3) detector (áudio CRU)
    const { AudioClassifier, FilesetResolver } = await import(/* @vite-ignore */ `${VENDOR}/audio_bundle.js`);
    const fileset = await FilesetResolver.forAudioTasks(`${VENDOR}/wasm`);
    this.classifier = await AudioClassifier.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: `${VENDOR}/yamnet.tflite` },
      maxResults: 6,
    });
    this.streamCru = await navigator.mediaDevices.getUserMedia({
      audio: { deviceId: deviceId ? { exact: deviceId } : undefined, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    this.audioCtx = new AudioContext({ sampleRate: 16000 });
    const src = this.audioCtx.createMediaStreamSource(this.streamCru);
    const proc = this.audioCtx.createScriptProcessor(16384, 1, 1);  // ~1 janela/s
    const mudo = this.audioCtx.createGain(); mudo.gain.value = 0;   // não vaza áudio
    proc.onaudioprocess = e => this.classificar(e.inputBuffer.getChannelData(0));
    src.connect(proc); proc.connect(mudo); mudo.connect(this.audioCtx.destination);
    this.analyser = this.audioCtx.createAnalyser(); this.analyser.fftSize = 512; src.connect(this.analyser);
    this.medirNivel();

    // 4) LiveKit (áudio PROCESSADO)
    this.lk = await loadLiveKit();
    this.track = await this.lk.createLocalAudioTrack({
      deviceId: deviceId || undefined, echoCancellation: false, noiseSuppression: true, autoGainControl: true,
    });
    this.room = new this.lk.Room();
    await this.room.connect(url, token);
    await this.room.localParticipant.publishTrack(this.track, { name: 'mic-orador' });

    this.rodando = true;
    await this.aplicarMute(true, 'session start');   // começa mutado, como na POC3

    // 5) timers: status dos ouvintes e envio do log do detector
    this.timers.push(window.setInterval(() => this.puxarStatus(), 5000));
    this.timers.push(window.setInterval(() => this.enviarLog(), 20000));
    window.addEventListener('pagehide', this.despejar);
    document.addEventListener('visibilitychange', this.aoEsconder);
    this.wakeLock();
  }

  private aoEsconder = () => { if (document.visibilityState === 'hidden') this.despejar(); };

  /** Página fechando/escondendo: descarrega o log sem esperar resposta.
   *  sendBeacon não aceita cabeçalho, e o endpoint exige o login — então é fetch com
   *  keepalive, que o navegador conclui mesmo depois da página sair. */
  private despejar = () => {
    if (!this.logBuf.length) return;
    const rows = this.logBuf; this.logBuf = [];
    authHeader().then(h => {
      fetch('/api/detector-log', {
        method: 'POST', keepalive: true,
        headers: { 'Content-Type': 'application/json', ...h },
        body: JSON.stringify({ slug: this.slug, rows }),
      }).catch(() => { this.logBuf = rows.concat(this.logBuf); });
    });
  };

  private async wakeLock() {
    try { await (navigator as any).wakeLock?.request('screen'); } catch { /* sem wake lock, tudo bem */ }
  }

  private medirNivel() {
    const buf = new Uint8Array(this.analyser!.frequencyBinCount);
    const tick = () => {
      if (!this.analyser) return;
      this.analyser.getByteTimeDomainData(buf);
      let pico = 0;
      for (const v of buf) pico = Math.max(pico, Math.abs(v - 128));
      this.nivel = Math.min(1, pico / 90);
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }
  nivel = 0;

  private classificar(pcm: Float32Array) {
    if (!this.classifier) return;
    let cats: { categoryName: string; score: number }[] = [];
    try {
      const res = this.classifier.classify(pcm, 16000);
      cats = res?.[0]?.classifications?.[0]?.categories ?? [];
    } catch { return; }
    const j = this.sense.push(cats);
    this.ev.onJanela?.(j, this.nivel);
    const hora = new Date().toTimeString().slice(0, 8);
    this.logBuf.push(`${hora};${j.fala.toFixed(3)};${j.musica.toFixed(3)};${j.top1};${j.estado};${this.modo};${this.muted}`);
    if (this.logBuf.length > 1800) this.logBuf.splice(0, this.logBuf.length - 1800);
    this.decidir();
  }

  private decidir() {
    if (!this.rodando) return;
    const alvo = this.modo === 'FORCE_OFF' ? true : this.modo === 'FORCE_ON' ? false : this.sense.estado !== 'SPEECH';
    if (alvo !== this.muted) this.aplicarMute(alvo, this.modo === 'AUTO' ? 'detector' : 'operador');
  }

  /**
   * "Mutar" aqui tem dois sentidos, e a diferença importa:
   *  - LOUVOR (automático): o áudio SEGUE subindo, porque é dele que sai a letra cantada.
   *    O servidor entra em modo louvor: não publica voz traduzida, manda a letra em texto.
   *  - SEMPRE MUTADO (o operador pediu silêncio): aí sim corta o áudio na origem.
   */
  private async aplicarMute(alvo: boolean, motivo: string) {
    this.muted = alvo;
    const cortarNaOrigem = alvo && this.modo === 'FORCE_OFF';
    try { cortarNaOrigem ? await this.track?.mute() : await this.track?.unmute(); } catch { /* segue */ }
    this.ev.onMute?.(alvo, motivo);
    this.api('set-mute', { muted: alvo, by: motivo }).catch(() => {}); // fire-and-forget, como na POC3
  }

  private async puxarStatus() {
    try {
      const r = await fetch(`/api/translate?slug=${encodeURIComponent(this.slug)}`);
      if (!r.ok) return;
      const s = await r.json();
      const listeners: Record<string, number> = {};
      for (const a of s.active || []) listeners[a.lang] = a.listeners;
      this.ev.onStatus?.({ listeners, muted: s.muted });
    } catch { /* status é informativo */ }
  }

  private async enviarLog() {
    if (!this.logBuf.length) return;
    const rows = this.logBuf; this.logBuf = [];
    try {
      const r = await fetch('/api/detector-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify({ slug: this.slug, rows }),
      });
      if (!r.ok) throw new Error(String(r.status));
    } catch { this.logBuf = rows.concat(this.logBuf); }  // devolve ao buffer e tenta no próximo lote
  }

  async encerrar() {
    this.rodando = false;
    await this.enviarLog();
    this.despejar();
    try { await this.api('stop-all'); } catch { /* segue */ }
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
    cancelAnimationFrame(this.raf);
    window.removeEventListener('pagehide', this.despejar);
    document.removeEventListener('visibilitychange', this.aoEsconder);
    try { await this.room?.disconnect(); } catch { /* segue */ }
    this.streamCru?.getTracks().forEach(t => t.stop());
    try { await this.audioCtx?.close(); } catch { /* segue */ }
    this.classifier?.close?.();
    this.room = null; this.track = null; this.classifier = null; this.audioCtx = null; this.analyser = null;
  }
}

export { CFG_PADRAO };
export type { Cfg, Janela };
