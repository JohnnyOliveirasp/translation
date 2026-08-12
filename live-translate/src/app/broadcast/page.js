'use client';
// Tela do OPERADOR — senha → escolher lapela → transmitir.
// Painel SEM valores de custo (decisão de 04/08): só status, ouvintes e MUTE.

import { useEffect, useRef, useState } from 'react';
import { Room, createLocalAudioTrack } from 'livekit-client';
import QRCode from 'qrcode';

export default function Broadcast() {
  const [senha, setSenha] = useState('');
  const [estado, setEstado] = useState('login'); // login | pronto | transmitindo
  const [erro, setErro] = useState('');
  const [devices, setDevices] = useState([]);
  const [deviceId, setDeviceId] = useState('');
  const [nivel, setNivel] = useState(0);
  const [mutado, setMutado] = useState(false);
  const [ativos, setAtivos] = useState([]);
  const [langs, setLangs] = useState([]);
  const [catalogo, setCatalogo] = useState([]);
  const [fonte, setFonte] = useState('en'); // idioma FALADO pelo orador
  const FONTES = ['en', 'pt-BR', 'es'];     // opções de idioma do orador
  const [relogio, setRelogio] = useState(0);
  const [qr, setQr] = useState(null);
  const roomRef = useRef(null);
  const trackRef = useRef(null);
  const nivelRaf = useRef(null);

  async function entrar() {
    setErro('');
    const r = await fetch('/api/token', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'operador', password: senha }),
    });
    if (!r.ok) { setErro('Wrong password'); return; }
    // lista microfones (pede permissão primeiro para liberar os labels)
    await navigator.mediaDevices.getUserMedia({ audio: true }).then(s => s.getTracks().forEach(t => t.stop()));
    const list = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'audioinput');
    setDevices(list);
    // prefere a interface da mesa de som quando ela estiver conectada
    const mesa = list.find(d => /scarlett|focusrite|qu-6|allen|usb audio/i.test(d.label || ''));
    setDeviceId((mesa || list[0])?.deviceId || '');
    // lista viva: plugar/desplugar atualiza as opções (e dispara o failover abaixo)
    navigator.mediaDevices.ondevicechange = async () => {
      const nova = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'audioinput');
      setDevices(nova);
    };
    const d = await (await fetch('/api/translate')).json();
    setCatalogo(d.catalogo || []);
    setFonte(d.sourceLang || 'en');
    setEstado('pronto');
  }

  async function iniciar() {
    setErro('');
    try {
      // informa qual idioma o orador vai falar (some da lista dos ouvintes)
      const rl = await fetch('/api/translate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set-source', lang: fonte, password: senha }),
      });
      if (!rl.ok) throw new Error((await rl.json()).error || 'failed to set speaker language');
      const { token, url } = await (await fetch('/api/token', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'operador', password: senha }),
      })).json();

      const track = await createLocalAudioTrack({
        deviceId: deviceId || undefined,
        echoCancellation: false,     // lapela dedicada: sem eco de alto-falante local
        noiseSuppression: true,
        autoGainControl: true,
      });
      trackRef.current = track;

      const room = new Room();
      roomRef.current = room;
      await room.connect(url, token);
      await room.localParticipant.publishTrack(track, { name: 'mic-orador' });

      medirNivel(track.mediaStreamTrack);
      setEstado('transmitindo');
    } catch (e) {
      setErro('Failed to start: ' + e.message);
    }
  }

  function medirNivel(mediaTrack) {
    const ctx = new AudioContext();
    const src = ctx.createMediaStreamSource(new MediaStream([mediaTrack]));
    const an = ctx.createAnalyser();
    an.fftSize = 256;
    src.connect(an);
    const buf = new Uint8Array(an.frequencyBinCount);
    const loop = () => {
      an.getByteFrequencyData(buf);
      setNivel(Math.min(100, Math.round((buf.reduce((a, b) => a + b, 0) / buf.length) / 1.2)));
      nivelRaf.current = requestAnimationFrame(loop);
    };
    loop();
  }

  // Troca a fonte de áudio AO VIVO (mesa de som ↔ lapela) sem derrubar a transmissão.
  // Cenário real: a mesa falha no meio do culto → volta para a lapela em 1 toque.
  async function trocarMicrofone(novoId) {
    setDeviceId(novoId);
    if (estado !== 'transmitindo' || !roomRef.current) return;
    try {
      const nova = await createLocalAudioTrack({
        deviceId: novoId,
        echoCancellation: false,
        noiseSuppression: true,
        autoGainControl: true,
      });
      const antiga = trackRef.current;
      await roomRef.current.localParticipant.unpublishTrack(antiga, true);
      await roomRef.current.localParticipant.publishTrack(nova, { name: 'mic-orador' });
      trackRef.current = nova;
      if (mutado) await nova.mute();
      cancelAnimationFrame(nivelRaf.current);
      medirNivel(nova.mediaStreamTrack);
      setErro('');
    } catch (e) {
      setErro('Could not switch microphone: ' + e.message);
    }
  }

  async function alternarMute() {
    if (!trackRef.current) return;
    const novo = !mutado;
    if (mutado) await trackRef.current.unmute(); else await trackRef.current.mute();
    setMutado(novo);
    // A4: avisa o servidor → todos os ouvintes pausam/retomam juntos, com aviso na tela
    fetch('/api/translate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'set-mute', muted: novo, password: senha }),
    }).catch(() => {});
  }

  async function encerrar() {
    if (!confirm('End the broadcast for everyone?')) return;
    await fetch('/api/translate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'stop-all', password: senha }),
    });
    cancelAnimationFrame(nivelRaf.current);
    await roomRef.current?.disconnect();
    setEstado('pronto');
    setRelogio(0);
  }

  async function mostrarQr() {
    // PUBLIC_URL do servidor (endereço que o celular alcança); origin é o fallback
    let base = window.location.origin;
    try {
      const d = await (await fetch('/api/translate')).json();
      if (d.publicUrl) base = d.publicUrl;
    } catch {}
    setQr(await QRCode.toDataURL(base, { width: 640, margin: 2 }));
  }

  // FAILOVER: se a fonte ativa sumir no meio da transmissão (cabo da mesa caiu,
  // interface desligou), assume sozinho o próximo microfone disponível — na prática,
  // a lapela de emergência. Sem isso o culto ficaria mudo até alguém perceber.
  useEffect(() => {
    if (estado !== 'transmitindo' || !deviceId || devices.length === 0) return;
    const aindaExiste = devices.some(d => d.deviceId === deviceId);
    if (aindaExiste) return;
    const reserva = devices[0];
    if (!reserva) { setErro('⚠️ No microphone available!'); return; }
    setErro(`⚠️ Audio source lost — switched to ${reserva.label || 'backup microphone'}`);
    trocarMicrofone(reserva.deviceId);
  }, [devices, deviceId, estado]);

  // A3 — mantém a tela do operador acesa durante toda a transmissão.
  // No culto 09/08 o iPad apagava a tela e derrubava o microfone da sala.
  useEffect(() => {
    if (estado !== 'transmitindo') return;
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

  // relógio + status (ouvintes por idioma) — sem custo na tela
  useEffect(() => {
    if (estado !== 'transmitindo') return;
    const t = setInterval(() => setRelogio(s => s + 1), 1000);
    const poll = setInterval(async () => {
      try {
        const d = await (await fetch('/api/translate')).json();
        setAtivos(d.active || []); setLangs(d.languages || []);
      } catch {}
    }, 5000);
    return () => { clearInterval(t); clearInterval(poll); };
  }, [estado]);

  const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  const labelDe = (code) => { const l = langs.find(x => x.code === code); return l ? `${l.flag} ${l.label}` : code; };

  return (
    <main>
      {estado === 'login' && (
        <>
          <img src="/redeem-logo.png" alt="Redeem Community Church"
            style={{ maxWidth: '78%', height: 'auto', margin: '4px auto 6px' }} />
          <h1>Broadcast</h1>
          <input type="password" placeholder="Operator password" value={senha}
            onChange={e => setSenha(e.target.value)} onKeyDown={e => e.key === 'Enter' && entrar()} />
          <button onClick={entrar}>Sign in</button>
          {erro && <p className="aviso">{erro}</p>}
        </>
      )}

      {estado === 'pronto' && (
        <>
          <h1>Microphone</h1>
          <select value={deviceId} onChange={e => setDeviceId(e.target.value)}>
            {devices.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || 'Microphone'}</option>)}
          </select>
          <h1 style={{ fontSize: '1.1rem', textAlign: 'left' }}>Speaker&apos;s language:</h1>
          {catalogo.filter(l => FONTES.includes(l.code)).map(l => (
            <label key={l.code} className="linha" style={{ cursor: 'pointer' }}>
              <span>{l.flag} {l.label}</span>
              <input type="radio" name="fonte" style={{ width: 24, height: 24 }}
                checked={fonte === l.code} onChange={() => setFonte(l.code)} />
            </label>
          ))}
          <button className="botao-gigante" onClick={iniciar}>▶ Start broadcast</button>
          {erro && <p className="aviso">{erro}</p>}
        </>
      )}

      {estado === 'transmitindo' && (
        <>
          <div className="linha">
            <span className="status-vivo">● ON AIR</span>
            <span>{fmt(relogio)}</span>
          </div>
          <div className="medidor"><div style={{ width: `${nivel}%` }} /></div>
          <select value={deviceId} onChange={e => trocarMicrofone(e.target.value)}
            style={{ fontSize: '0.95rem', padding: '10px' }}>
            {devices.map(d => <option key={d.deviceId} value={d.deviceId}>🎙 {d.label || 'Microphone'}</option>)}
          </select>
          <button className={`botao-mute ${mutado ? 'ativo' : ''}`} onClick={alternarMute}>
            {mutado ? '🔇 MUTED — tap to resume' : '🎤 MUTE (use during music)'}
          </button>
          <h1 style={{ fontSize: '1.1rem', textAlign: 'left' }}>Translations:</h1>
          {ativos.map(a => (
            <div className="linha" key={a.lang}>
              <span>{labelDe(a.lang)} {a.traduzindo ? '🟢' : '⚪'}</span>
              <span>{a.listeners} listener{a.listeners === 1 ? '' : 's'}</span>
            </div>
          ))}
          <button className="secundario" onClick={mostrarQr}>Show QR code</button>
          <button className="perigo" onClick={encerrar}>End broadcast</button>
        </>
      )}

      {qr && (
        <div className="qr-cheio" onClick={() => setQr(null)}>
          <img src={qr} alt="QR code" />
          <p>Scan to listen in your language</p>
        </div>
      )}
    </main>
  );
}
