/**
 * Motor do OUVINTE — portado do v1 (live-translate/src/app/page.js), agora por igreja.
 * Conecta na sala da igreja, assina a track do tradutor do idioma escolhido, toca o áudio
 * e recebe as legendas por data channel.
 *
 * Ganhos do v1 que NÃO podem se perder (cada um veio de um culto real):
 *  - sinal de vida a cada 4s: é o que mantém a contagem de ouvintes e a ponte viva;
 *  - vigia de áudio: o Chrome do iPhone pausa o <audio> no louvor longo e não volta
 *    sozinho — o ouvinte ficava só com legenda (15/08);
 *  - `release` ao sair, para a ponte cair quando ninguém mais escuta;
 *  - wake lock enquanto ouve.
 */
type LK = any;
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

export type Estado = 'inicio' | 'conectando' | 'ouvindo' | 'reconectando';

export type ListenEvents = {
  onEstado?: (e: Estado) => void;
  onLegenda?: (texto: string) => void;
  onLetra?: (parte: { original?: string; traduzido?: string }) => void;
  onMutado?: (m: boolean) => void;
  onPrecisaToque?: (v: boolean) => void;
  onErro?: (msg: string) => void;
};

/** id estável deste ouvinte (sobrevive a recarregar a página) */
function ouvinteId() {
  let id = sessionStorage.getItem('lt-ouvinte-id');
  if (!id) { id = Math.random().toString(36).slice(2) + Date.now().toString(36); sessionStorage.setItem('lt-ouvinte-id', id); }
  return id;
}

export class ListenEngine {
  private room: any = null;
  private lang: string | null = null;
  private id = ouvinteId();
  private timers: number[] = [];
  private wake: any = null;
  private pausadoManual = false;

  constructor(private slug: string, private audio: HTMLAudioElement, private ev: ListenEvents = {}) {}

  /** Sinal de vida + estado de mute, a cada 4s (também roda antes de escolher idioma). */
  iniciarPulso() {
    const tick = async () => {
      try {
        const r = this.lang
          ? await fetch('/api/translate', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ slug: this.slug, action: 'heartbeat', lang: this.lang, id: this.id }),
            })
          : await fetch(`/api/translate?slug=${encodeURIComponent(this.slug)}`);
        if (!r.ok) return;
        const d = await r.json();
        this.ev.onMutado?.(!!d.muted);
      } catch { /* sinal de vida é best-effort */ }
    };
    tick();
    this.timers.push(window.setInterval(tick, 4000));
  }

  async ouvir(lang: string) {
    this.lang = lang;
    this.ev.onEstado?.('conectando');

    const pedido = await fetch('/api/translate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: this.slug, action: 'request', lang, id: this.id }),
    });
    if (!pedido.ok) throw new Error((await pedido.json().catch(() => ({}))).error || 'could not start translation');

    const rt = await fetch('/api/token', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: this.slug, role: 'ouvinte' }),
    });
    if (!rt.ok) throw new Error('token refused');
    const { token, url } = await rt.json();

    const LK = await loadLiveKit();
    const room = new LK.Room();
    this.room = room;
    const alvo = `translator-${this.slug}-${lang}`;   // identidade da ponte DESTA igreja

    const ligar = (track: any) => {
      track.attach(this.audio);
      this.audio.play().catch(() => this.ev.onPrecisaToque?.(true));
      this.ev.onEstado?.('ouvindo');
    };

    room.on(LK.RoomEvent.TrackSubscribed, (track: any, _pub: any, participant: any) => {
      if (participant.identity === alvo && track.kind === LK.Track.Kind.Audio) ligar(track);
    });
    room.on(LK.RoomEvent.DataReceived, (payload: Uint8Array, _p: any, _k: any, topic: string) => {
      if (topic !== 'legenda' && topic !== 'louvor') return;
      try {
        const msg = JSON.parse(new TextDecoder().decode(payload));
        if (msg.lang !== this.lang) return;
        if (topic === 'louvor') this.ev.onLetra?.({ original: msg.original, traduzido: msg.traduzido });
        else if (msg.text) this.ev.onLegenda?.(msg.text);
      } catch { /* mensagem malformada é ignorada */ }
    });
    room.on(LK.RoomEvent.Reconnecting, () => this.ev.onEstado?.('reconectando'));
    room.on(LK.RoomEvent.Reconnected, () => this.ev.onEstado?.('ouvindo'));

    await room.connect(url, token, { autoSubscribe: true });

    // a track pode já existir antes do listener entrar
    for (const p of room.remoteParticipants.values()) {
      if (p.identity !== alvo) continue;
      for (const pub of p.trackPublications.values()) {
        if (pub.track && pub.kind === LK.Track.Kind.Audio) ligar(pub.track);
      }
    }

    this.vigiarAudio();
    this.pedirWakeLock();
  }

  /** Chrome do iPhone pausa o <audio> no louvor longo e não retoma sozinho (15/08). */
  private vigiarAudio() {
    const garantir = async () => {
      if (this.pausadoManual) return;
      if (!this.audio.paused) { this.ev.onPrecisaToque?.(false); return; }
      try { await this.audio.play(); this.ev.onPrecisaToque?.(false); }
      catch { this.ev.onPrecisaToque?.(true); }   // política do navegador: só volta com toque
    };
    this.audio.addEventListener('pause', garantir);
    document.addEventListener('visibilitychange', garantir);
    this.timers.push(window.setInterval(garantir, 3000));
    this.garantirAgora = garantir;
  }
  garantirAgora: () => void = () => {};

  private async pedirWakeLock() {
    try { this.wake = await (navigator as any).wakeLock?.request('screen'); } catch { /* opcional */ }
  }

  pausar(v: boolean) {
    this.pausadoManual = v;
    if (v) this.audio.pause();
    else this.audio.play().catch(() => this.ev.onPrecisaToque?.(true));
  }

  async sair() {
    if (this.lang) {
      fetch('/api/translate', {
        method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: this.slug, action: 'release', lang: this.lang, id: this.id }),
      }).catch(() => {});
    }
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
    try { await this.room?.disconnect(); } catch { /* segue */ }
    try { this.wake?.release(); } catch { /* segue */ }
    this.room = null; this.lang = null;
    this.ev.onEstado?.('inicio');
  }
}

/** Aviso de louvor no idioma do ouvinte (culto 09/08: silêncio parecia defeito). */
export const AVISO_LOUVOR: Record<string, { titulo: string; texto: string }> = {
  'en': { titulo: '🎵 Worship time', texto: 'Translation resumes automatically when the sermon begins. You can keep your headphones on.' },
  'es': { titulo: '🎵 Momento de alabanza', texto: 'La traducción volverá automáticamente cuando comience la prédica. Puedes dejar los auriculares puestos.' },
  'pt-BR': { titulo: '🎵 Momento de louvor', texto: 'A tradução volta automaticamente quando a pregação começar. Pode deixar o fone no ouvido.' },
  'fr': { titulo: '🎵 Temps de louange', texto: 'La traduction reprendra automatiquement au début de la prédication. Gardez vos écouteurs.' },
  'de': { titulo: '🎵 Lobpreiszeit', texto: 'Die Übersetzung wird automatisch fortgesetzt, wenn die Predigt beginnt.' },
  'it': { titulo: '🎵 Momento di lode', texto: 'La traduzione riprenderà automaticamente quando inizia la predicazione.' },
  'zh-Hans': { titulo: '🎵 敬拜时间', texto: '讲道开始时，翻译将自动恢复。您可以继续戴着耳机。' },
  'ko': { titulo: '🎵 찬양 시간', texto: '설교가 시작되면 통역이 자동으로 다시 시작됩니다. 이어폰을 계속 착용하셔도 됩니다.' },
  'ja': { titulo: '🎵 賛美の時間', texto: '説教が始まると翻訳は自動的に再開します。イヤホンはそのままで大丈夫です。' },
  'ht': { titulo: '🎵 Moman louwanj', texto: 'Tradiksyon an ap tounen otomatikman lè predikasyon an kòmanse.' },
  'ru': { titulo: '🎵 Время прославления', texto: 'Перевод возобновится автоматически, когда начнётся проповедь.' },
  'uk': { titulo: '🎵 Час прославлення', texto: 'Переклад відновиться автоматично, коли почнеться проповідь.' },
  'ar': { titulo: '🎵 وقت التسبيح', texto: 'ستُستأنف الترجمة تلقائيًا عند بدء العظة. يمكنك إبقاء سماعاتك.' },
  'hi': { titulo: '🎵 आराधना का समय', texto: 'प्रवचन शुरू होते ही अनुवाद अपने आप फिर से शुरू हो जाएगा।' },
  'vi': { titulo: '🎵 Giờ thờ phượng', texto: 'Bản dịch sẽ tự động tiếp tục khi bài giảng bắt đầu.' },
  'tl': { titulo: '🎵 Oras ng pagsamba', texto: 'Awtomatikong babalik ang pagsasalin kapag nagsimula ang pangaral.' },
};
