import { useMemo } from 'react';
import { qrSvg, qrPngDataUrl } from '../lib/qr';

/** QR code em SVG (gerado no navegador, sem dependência externa). */
export default function QrCode({ text, className = '', quiet = 2 }: { text: string; className?: string; quiet?: number }) {
  const svg = useMemo(() => qrSvg(text, { quiet }), [text, quiet]);
  return <div className={className} role="img" aria-label={text} dangerouslySetInnerHTML={{ __html: svg }} />;
}

/** Baixa o QR como PNG (nome do arquivo a partir do slug). */
export function downloadQrPng(text: string, fileName: string, px = 1200) {
  const a = document.createElement('a');
  a.href = qrPngDataUrl(text, px);
  a.download = fileName.endsWith('.png') ? fileName : fileName + '.png';
  document.body.appendChild(a);
  a.click();
  a.remove();
}
