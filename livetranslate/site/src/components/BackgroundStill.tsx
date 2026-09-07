import { useEffect, useState } from 'react';

/**
 * Fundo ESTÁTICO das áreas logadas (admin/broadcast). Substituiu o vídeo em 07/09:
 * o loop com fade do BackgroundVideo pulsava ("ficava piscando" — feedback do
 * operador no culto de 06/09) e numa tela de trabalho isso distrai. Imagem única,
 * sem movimento; no celular em pé usa a versão reenquadrada em retrato.
 */
export default function BackgroundStill({
  src, srcPortrait, dim = 0,
}: { src: string; srcPortrait?: string; dim?: number }) {
  const [retrato, setRetrato] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 820px) and (orientation: portrait)');
    const on = () => setRetrato(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  const fonte = retrato && srcPortrait ? srcPortrait : src;

  return (
    <div className="fixed inset-0 z-0 pointer-events-none" aria-hidden="true">
      <img src={fonte} alt="" className="absolute inset-0 h-full w-full object-cover" />
      {/* mesmas camadas do fundo em vídeo: gradiente + véu para área de trabalho */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-transparent to-background" />
      {dim > 0 && <div className="absolute inset-0 bg-[#f6f5f2]" style={{ opacity: dim }} />}
    </div>
  );
}
