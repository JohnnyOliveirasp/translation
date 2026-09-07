import { useEffect, useRef, useState } from 'react';

/**
 * Vídeo de fundo da PÁGINA INTEIRA (decisão do Johnny: não só o hero).
 * Loop manual com fade (prompt Aethera): rAF monitora currentTime/duration,
 * fade-in 0,5s no início, fade-out 0,5s antes do fim; no `ended` zera a
 * opacidade, espera 100ms, volta ao início e toca de novo.
 */
const FADE = 0.5;

export default function BackgroundVideo({
  src = '/assets/hero.mp4', poster = '/assets/hero.png', dim = 0,
  srcPortrait, posterPortrait,
}: { src?: string; poster?: string; dim?: number; srcPortrait?: string; posterPortrait?: string } = {}) {
  const ref = useRef<HTMLVideoElement>(null);
  // No celular em pé, o vídeo 16:9 cortaria quase tudo — usamos a versão reenquadrada
  // em retrato quando existe. Em conexão econômica ("Economia de dados"), só o pôster.
  const [retrato, setRetrato] = useState(false);
  const [semVideo, setSemVideo] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 820px) and (orientation: portrait)');
    const on = () => setRetrato(mq.matches);
    on();
    mq.addEventListener('change', on);
    const conn = (navigator as unknown as { connection?: { saveData?: boolean } }).connection;
    if (conn?.saveData) setSemVideo(true);
    return () => mq.removeEventListener('change', on);
  }, []);
  const fonte = retrato && srcPortrait ? srcPortrait : src;
  const capa = retrato && posterPortrait ? posterPortrait : poster;

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    let raf = 0;
    const tick = () => {
      // Vídeo parado (autoplay barrado) fica VISÍVEL mostrando o pôster: o cálculo de
      // fade abaixo daria opacidade 0 em currentTime=0 e a tela ficaria branca.
      if (v.paused) {
        v.style.opacity = '1';
        raf = requestAnimationFrame(tick);
        return;
      }
      if (v.duration && !Number.isNaN(v.duration)) {
        const t = v.currentTime, d = v.duration;
        let o = 1;
        if (t < FADE) o = t / FADE;
        else if (d - t < FADE) o = Math.max(0, (d - t) / FADE);
        v.style.opacity = o.toFixed(3);
      }
      raf = requestAnimationFrame(tick);
    };
    const onEnded = () => {
      v.style.opacity = '0';
      setTimeout(() => { v.currentTime = 0; v.play().catch(() => {}); }, 100);
    };
    v.addEventListener('ended', onEnded);
    // Autoplay barrado (iOS em economia de bateria, aba em segundo plano, política do
    // navegador): sem isto a tela ficava BRANCA, porque o vídeo começa com opacidade 0
    // e só o loop de fade a levanta. Mostrando o pôster, o fundo continua existindo.
    v.play().catch(() => { v.style.opacity = '1'; });
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); v.removeEventListener('ended', onEnded); };
  }, [fonte]);

  return (
    <div className="fixed inset-0 z-0 pointer-events-none" aria-hidden="true">
      <video
        ref={ref}
        key={fonte}
        src={semVideo ? undefined : fonte}
        poster={capa}
        muted
        playsInline
        autoPlay
        preload="auto"
        className="absolute inset-0 h-full w-full object-cover opacity-0"
      />
      {/* gradiente do prompt: from-background via-transparent to-background */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-transparent to-background" />
      {/* véu extra para áreas de trabalho: o vídeo vira sombra em movimento */}
      {dim > 0 && <div className="absolute inset-0 bg-[#f6f5f2]" style={{ opacity: dim }} />}
    </div>
  );
}
