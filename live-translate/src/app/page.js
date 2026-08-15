'use client';
// Tela do OUVINTE — 1 toque no idioma e está ouvindo.
// O toque no idioma é o gesto que o navegador exige para liberar áudio.

import { useEffect, useRef, useState } from 'react';
import { Room, RoomEvent, Track } from 'livekit-client';

// A4 — aviso de louvor no idioma do próprio ouvinte (culto 09/08: quem testou durante
// a música ouviu silêncio, achou que estava quebrado e desistiu).
const AVISO_LOUVOR = {
  'pt-BR': { titulo: '🎵 Momento de louvor', texto: 'A tradução volta automaticamente quando a pregação começar. Pode deixar o fone no ouvido.' },
  es:      { titulo: '🎵 Momento de alabanza', texto: 'La traducción volverá automáticamente cuando comience la prédica. Puedes dejar los auriculares puestos.' },
  en:      { titulo: '🎵 Worship time', texto: 'Translation will resume automatically when the sermon begins. You can keep your headphones on.' },
  fr:      { titulo: '🎵 Temps de louange', texto: 'La traduction reprendra automatiquement au début de la prédication. Gardez vos écouteurs.' },
  'zh-Hans': { titulo: '🎵 敬拜时间', texto: '讲道开始时，翻译将自动恢复。您可以继续戴着耳机。' },
  hi:      { titulo: '🎵 आराधना का समय', texto: 'प्रवचन शुरू होते ही अनुवाद अपने आप फिर से शुरू हो जाएगा। आप ईयरफ़ोन लगाए रख सकते हैं।' },
  ar:      { titulo: '🎵 وقت التسبيح', texto: 'ستُستأنف الترجمة تلقائيًا عند بدء العظة. يمكنك إبقاء سماعاتك.' },
};

export default function Ouvinte() {
  const [languages, setLanguages] = useState([]);
  const [lang, setLang] = useState(null);        // idioma escolhido
  const [estado, setEstado] = useState('inicio'); // inicio | conectando | ouvindo | reconectando
  const [pausado, setPausado] = useState(false);
  const [mutado, setMutado] = useState(false);   // operador está em MUTE (louvor)
  const [precisaToque, setPrecisaToque] = useState(false); // navegador bloqueou o áudio
  const [paragrafos, setParagrafos] = useState([]); // legenda como texto corrido
  const legendaRef = useRef(null);
  const roomRef = useRef(null);
  const audioRef = useRef(null);
  const langRef = useRef(null);
  const pausadoRef = useRef(false); // espelho de `pausado` para uso dentro do vigia

  // id estável deste ouvinte (sobrevive a recarregar a página)
  const idRef = useRef(null);
  if (idRef.current === null && typeof window !== 'undefined') {
    let id = sessionStorage.getItem('ouvinteId');
    if (!id) { id = Math.random().toString(36).slice(2) + Date.now().toString(36); sessionStorage.setItem('ouvinteId', id); }
    idRef.current = id;
  }

  useEffect(() => {
    // A cada 4s: manda sinal de vida (se ouvindo) e recebe idiomas + estado de MUTE.
    // O sinal de vida é o que mantém a contagem de ouvintes correta no painel.
    const tick = async () => {
      try {
        const r = langRef.current
          ? await fetch('/api/translate', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'heartbeat', lang: langRef.current, id: idRef.current }),
            })
          : await fetch('/api/translate');
        const d = await r.json();
        setLanguages(d.languages || []);
        setMutado(!!d.muted);
      } catch {}
    };
    tick();
    const t = setInterval(tick, 4000);
    return () => clearInterval(t);
  }, []);

  // A3 — mantém a tela acesa enquanto o ouvinte está conectado
  useEffect(() => {
    if (estado === 'inicio') return;
    let lock = null;
    const pedir = async () => {
      try { lock = await navigator.wakeLock?.request('screen'); } catch {}
    };
    pedir();
    const revisitar = () => { if (document.visibilityState === 'visible') pedir(); };
    document.addEventListener('visibilitychange', revisitar);
    return () => {
      document.removeEventListener('visibilitychange', revisitar);
      try { lock?.release(); } catch {}
    };
  }, [estado]);

  // VIGIA DE ÁUDIO — Chrome no iPhone (e Android) pausa o elemento <audio> durante o
  // louvor longo (áudio só silêncio, aba em segundo plano, interrupção do sistema) e
  // NÃO retoma sozinho quando a voz volta: o ouvinte fica só com a legenda, porque
  // as legendas chegam por data channel, independente do áudio. Achado em 15/08 no
  // Chrome iOS — o Safari retomava sozinho, por isso funcionou ao trocar de navegador.
  async function garantirAudio() {
    const a = audioRef.current;
    if (!a || pausadoRef.current) return;   // respeita a pausa manual do ouvinte
    if (!a.paused) { setPrecisaToque(false); return; }
    try { await a.play(); setPrecisaToque(false); }
    catch { setPrecisaToque(true); }        // política do navegador: só volta com toque
  }

  useEffect(() => { pausadoRef.current = pausado; }, [pausado]);

  useEffect(() => {
    if (estado !== 'ouvindo') return;
    const a = audioRef.current;
    if (!a) return;
    const aoPausar = () => { if (!pausadoRef.current) garantirAudio(); };
    const aoVoltar = () => { if (document.visibilityState === 'visible') garantirAudio(); };
    a.addEventListener('pause', aoPausar);
    document.addEventListener('visibilitychange', aoVoltar);
    const t = setInterval(garantirAudio, 3000); // rede de segurança
    return () => {
      a.removeEventListener('pause', aoPausar);
      document.removeEventListener('visibilitychange', aoVoltar);
      clearInterval(t);
    };
  }, [estado]);

  // fim do louvor: momento exato em que a voz volta — tenta destravar na hora
  useEffect(() => {
    if (!mutado && estado === 'ouvindo') garantirAudio();
  }, [mutado, estado]);

  // avisa o servidor quando a aba fecha (decrementa ouvintes → derruba sessão ociosa)
  useEffect(() => {
    const sair = () => {
      if (langRef.current) {
        navigator.sendBeacon('/api/translate',
          new Blob([JSON.stringify({ lang: langRef.current, action: 'release', id: idRef.current })], { type: 'application/json' }));
      }
    };
    window.addEventListener('beforeunload', sair);
    return () => window.removeEventListener('beforeunload', sair);
  }, []);

  async function escolher(codigo) {
    setEstado('conectando');
    setLang(codigo);
    langRef.current = codigo;
    // se em 25s o áudio não chegou, desiste com mensagem em vez de girar para sempre
    const guarda = { ok: false };
    setTimeout(() => {
      if (!guarda.ok && langRef.current === codigo) {
        alert('Could not connect. Please try again.');
        voltar();
      }
    }, 25000);
    try {
      // sobe (ou reaproveita) a sessão de tradução deste idioma
      const r = await fetch('/api/translate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lang: codigo, action: 'request', id: idRef.current }),
      });
      if (!r.ok) throw new Error((await r.json()).error || 'falha ao iniciar tradução');

      const { token, url } = await (await fetch('/api/token', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'ouvinte' }),
      })).json();

      const room = new Room();
      roomRef.current = room;

      room.on(RoomEvent.TrackSubscribed, (track, pub, participant) => {
        if (participant.identity === `translator-${codigo}` && track.kind === Track.Kind.Audio) {
          track.attach(audioRef.current);
          audioRef.current.play().catch(() => {});
          guarda.ok = true;
          setEstado('ouvindo');
        }
      });
      room.on(RoomEvent.DataReceived, (payload, participant, kind, topic) => {
        if (topic !== 'legenda') return;
        try {
          const msg = JSON.parse(new TextDecoder().decode(payload));
          if (msg.lang !== langRef.current) return;
          // texto corrido: acumula no parágrafo atual; frase terminada + parágrafo
          // longo → abre parágrafo novo; guarda só os últimos 5
          setParagrafos(prev => {
            const arr = prev.length ? [...prev] : [''];
            arr[arr.length - 1] += msg.text;
            if (/[.!?…]\s*$/.test(arr[arr.length - 1]) && arr[arr.length - 1].length > 160) arr.push('');
            return arr.slice(-5);
          });
        } catch {}
      });
      room.on(RoomEvent.Reconnecting, () => setEstado('reconectando'));
      room.on(RoomEvent.Reconnected, () => setEstado('ouvindo'));

      await room.connect(url, token, { autoSubscribe: true });
      // se a track já existia antes do listener:
      for (const p of room.remoteParticipants.values()) {
        if (p.identity === `translator-${codigo}`) {
          for (const pub of p.trackPublications.values()) {
            if (pub.track && pub.kind === Track.Kind.Audio) {
              pub.track.attach(audioRef.current);
              audioRef.current.play().catch(() => {});
              guarda.ok = true;
              setEstado('ouvindo');
            }
          }
        }
      }
    } catch (e) {
      alert('Could not connect: ' + e.message);
      voltar();
    }
  }

  function pausar() {
    if (!audioRef.current) return;
    const novo = !pausado;
    pausadoRef.current = novo; // antes do play/pause: o vigia não pode brigar com o ouvinte
    if (novo) audioRef.current.pause(); else audioRef.current.play().catch(() => setPrecisaToque(true));
    setPausado(novo);
  }

  async function voltar() {
    if (langRef.current) {
      fetch('/api/translate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lang: langRef.current, action: 'release', id: idRef.current }),
      }).catch(() => {});
    }
    await roomRef.current?.disconnect();
    roomRef.current = null;
    langRef.current = null;
    setLang(null); setEstado('inicio'); setPausado(false); setParagrafos([]);
  }

  // rola a legenda para o fim quando chega texto novo
  useEffect(() => {
    if (legendaRef.current) legendaRef.current.scrollTop = legendaRef.current.scrollHeight;
  }, [paragrafos]);

  const info = languages.find(l => l.code === lang);

  return (
    <main>
      <audio ref={audioRef} autoPlay playsInline />
      {estado === 'inicio' && (
        <>
          <img src="/redeem-logo.png" alt="Redeem Community Church"
            style={{ maxWidth: '78%', height: 'auto', margin: '4px auto 6px' }} />
          <h1>Live Translation</h1>
          <p className="aviso">🎧 Please use headphones</p>
          <p>Tap your language:</p>
          {languages.map(l => (
            <button key={l.code} className="botao-gigante" onClick={() => escolher(l.code)}>
              {l.flag} {l.label}
            </button>
          ))}
          {languages.length === 0 && <p>Loading languages...</p>}
        </>
      )}
      {estado !== 'inicio' && (
        <>
          <div className="linha">
            <span>{info?.flag} {info?.label}</span>
            {estado === 'ouvindo' && !pausado && !mutado && <span className="status-vivo">● LIVE</span>}
          </div>
          {estado === 'conectando' && <p>Connecting...</p>}
          {estado === 'reconectando' && <p className="banner-reconectando">Reconnecting... please wait</p>}
          {mutado && estado === 'ouvindo' && (
            <div className="aviso-louvor">
              <strong>{(AVISO_LOUVOR[lang] || AVISO_LOUVOR.en).titulo}</strong>
              <p>{(AVISO_LOUVOR[lang] || AVISO_LOUVOR.en).texto}</p>
            </div>
          )}
          {/* último recurso: o navegador exige um toque para religar o som */}
          {precisaToque && estado === 'ouvindo' && !pausado && (
            <button className="botao-gigante" onClick={garantirAudio}
              style={{ background: '#b45309' }}>
              🔊 TAP TO TURN THE SOUND BACK ON
            </button>
          )}
          <button className="botao-gigante" onClick={pausar} disabled={mutado}>
            {mutado ? '🎵 —' : pausado ? '▶ RESUME' : '⏸ PAUSE'}
          </button>
          <div className="legenda" ref={legendaRef}>
            {paragrafos.length === 0
              ? 'Captions will appear here...'
              : paragrafos.filter(Boolean).map((p, i) => <p key={i}>{p}</p>)}
          </div>
          <button className="secundario" onClick={voltar}>Change language</button>
        </>
      )}
    </main>
  );
}
