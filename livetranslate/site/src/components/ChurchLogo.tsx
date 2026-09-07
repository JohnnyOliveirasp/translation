import { logoUrl } from '../lib/supabase';

/**
 * Logo da igreja com contraste garantido.
 * Muitos logos de igreja vêm em PNG transparente com o texto BRANCO (feitos para site escuro);
 * em fundo claro eles somem. Quando `light` é true, desenhamos sobre um cartão escuro.
 * A flag vem de `churches.logo_is_light` (detectada no upload, ajustável em Configurações).
 */
export default function ChurchLogo({
  path, light, name, className = '', imgClassName = '', fallbackClassName = '',
}: {
  path: string | null;
  light?: boolean;
  name: string;
  className?: string;      // caixa externa
  imgClassName?: string;   // tamanho da imagem
  fallbackClassName?: string; // caixa da inicial quando não há logo
}) {
  const url = logoUrl(path);
  if (!url) {
    return (
      <span className={`flex items-center justify-center bg-black/[0.06] font-serif ${fallbackClassName || className}`}>
        {name.charAt(0)}
      </span>
    );
  }
  return (
    <span className={`inline-flex items-center justify-center ${light ? 'bg-ink px-3 py-2' : ''} ${className}`}>
      <img src={url} alt={name} className={`object-contain ${imgClassName}`} />
    </span>
  );
}

/** Luminância média dos pixels não transparentes (0–255). > ~170 = logo claro. */
export async function detectLightLogo(file: File): Promise<boolean> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return false;
  const w = Math.min(160, bitmap.width), h = Math.max(1, Math.round((bitmap.height / bitmap.width) * w));
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return false;
  ctx.drawImage(bitmap, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  let sum = 0, count = 0, transparent = 0;
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a < 40) { transparent++; continue; }
    sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    count++;
  }
  bitmap.close?.();
  if (!count) return false;
  const hasTransparency = transparent > (w * h) * 0.1; // logo recortado, não foto quadrada
  return hasTransparency && sum / count > 170;
}
