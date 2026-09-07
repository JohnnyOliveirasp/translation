/**
 * Cartaz da igreja em PDF (A4): logo no topo, QR grande no meio, idiomas habilitados embaixo.
 * Sem dependência externa (protocolo do CLAUDE.md): o cartaz é desenhado num <canvas> em 300 dpi,
 * exportado como JPEG e embrulhado num PDF de uma página escrito à mão (imagem /DCTDecode).
 * Desenhar no canvas resolve acentos, chinês, coreano e árabe — que as fontes base do PDF não têm.
 */
import { qrMatrix } from './qr';

const MM = 300 / 25.4;                 // px por mm a 300 dpi
const W = Math.round(210 * MM);        // A4 retrato
const H = Math.round(297 * MM);

export type PosterInput = {
  churchName: string;
  logoUrl: string | null;
  logoIsLight: boolean;
  url: string;                 // livetranslate.church/{slug}
  headline: string;            // frase no idioma do orador, no topo
  scanLine: string;            // "Point your phone camera at the code"
  /** Uma linha por idioma habilitado: a MESMA frase na língua do ouvinte
   *  (quem não lê inglês precisa entender o que é aquele QR). */
  translations: { label: string; text: string }[];
  footer: string;              // "Powered by LiveTranslate"
};

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = 'anonymous';       // bucket público do Supabase serve CORS
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

async function drawPoster(input: PosterInput): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';

  await document.fonts?.ready;
  const serif = "'Instrument Serif', Georgia, serif";
  const sans = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

  let y = Math.round(H * 0.075);

  // ── Topo: logo da igreja (ou o nome dela) ──
  const logo = input.logoUrl ? await loadImage(input.logoUrl) : null;
  if (logo) {
    const maxH = Math.round(H * 0.10), maxW = Math.round(W * 0.62);
    const scale = Math.min(maxW / logo.width, maxH / logo.height);
    const lw = logo.width * scale, lh = logo.height * scale;
    if (input.logoIsLight) {                     // logo de texto branco: cartão escuro atrás
      const padX = 40, padY = 28, r = 28;
      const bx = (W - lw) / 2 - padX, by = y - padY, bw = lw + padX * 2, bh = lh + padY * 2;
      ctx.fillStyle = '#111111';
      ctx.beginPath();
      ctx.moveTo(bx + r, by);
      ctx.arcTo(bx + bw, by, bx + bw, by + bh, r);
      ctx.arcTo(bx + bw, by + bh, bx, by + bh, r);
      ctx.arcTo(bx, by + bh, bx, by, r);
      ctx.arcTo(bx, by, bx + bw, by, r);
      ctx.closePath(); ctx.fill();
    }
    ctx.drawImage(logo, (W - lw) / 2, y, lw, lh);
    y += lh + Math.round(H * 0.075);
  } else {
    ctx.fillStyle = '#111111';
    ctx.font = `${Math.round(W * 0.075)}px ${serif}`;
    ctx.fillText(input.churchName, W / 2, y + Math.round(W * 0.06), W * 0.86);
    y += Math.round(H * 0.085);
  }

  // ── Chamada ──
  ctx.fillStyle = '#111111';
  ctx.font = `${Math.round(W * 0.062)}px ${serif}`;
  wrap(ctx, input.headline, W / 2, y, W * 0.84, Math.round(W * 0.072));
  y += Math.round(H * 0.055) * Math.max(1, countLines(ctx, input.headline, W * 0.84));

  // ── QR ──
  const m = qrMatrix(input.url);
  const quiet = 3;
  const total = m.length + quiet * 2;
  const qrSide = Math.round(W * 0.47);
  const cell = Math.floor(qrSide / total);
  const side = cell * total;
  const qx = Math.round((W - side) / 2), qy = y;
  ctx.fillStyle = '#ffffff'; ctx.fillRect(qx, qy, side, side);
  ctx.fillStyle = '#111111';
  for (let r = 0; r < m.length; r++) for (let c = 0; c < m.length; c++) {
    if (m[r][c]) ctx.fillRect(qx + (c + quiet) * cell, qy + (r + quiet) * cell, cell, cell);
  }
  y = qy + side + Math.round(H * 0.030);

  // ── "aponte a câmera" + endereço ──
  ctx.fillStyle = '#6F6F6F';
  ctx.font = `${Math.round(W * 0.026)}px ${sans}`;
  ctx.fillText(input.scanLine, W / 2, y, W * 0.86);
  y += Math.round(H * 0.028);
  ctx.fillStyle = '#111111';
  ctx.font = `${Math.round(W * 0.030)}px ${sans}`;
  ctx.fillText(input.url, W / 2, y, W * 0.86);
  y += Math.round(H * 0.055);

  // ── A mesma frase, na língua de cada ouvinte ──
  const n = Math.max(1, input.translations.length);
  const lineSize = n <= 2 ? 0.040 : n <= 4 ? 0.034 : 0.028;
  const labelSize = n <= 4 ? 0.020 : 0.017;
  const blockGap = Math.round(H * (n <= 2 ? 0.030 : n <= 4 ? 0.022 : 0.016));

  for (const tr of input.translations) {
    ctx.fillStyle = '#9A9A9A';
    ctx.font = `${Math.round(W * labelSize)}px ${sans}`;
    ctx.fillText(tr.label.toUpperCase(), W / 2, y, W * 0.86);
    y += Math.round(W * lineSize * 1.25);
    ctx.fillStyle = '#111111';
    ctx.font = `${Math.round(W * lineSize)}px ${sans}`;
    ctx.fillText(tr.text, W / 2, y, W * 0.88);
    y += blockGap;
  }

  // ── Rodapé ──
  ctx.fillStyle = '#9A9A9A';
  ctx.font = `${Math.round(W * 0.022)}px ${sans}`;
  ctx.fillText(input.footer, W / 2, H - Math.round(H * 0.045));

  return canvas;
}

function countLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  let lines = 1, line = '';
  for (const word of text.split(' ')) {
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > maxWidth && line) { lines++; line = word; } else line = test;
  }
  return lines;
}

function wrap(ctx: CanvasRenderingContext2D, text: string, cx: number, top: number, maxWidth: number, lineHeight: number) {
  let line = '', y = top;
  for (const word of text.split(' ')) {
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > maxWidth && line) { ctx.fillText(line, cx, y); line = word; y += lineHeight; }
    else line = test;
  }
  if (line) ctx.fillText(line, cx, y);
}

/** PDF de uma página A4 com a imagem JPEG do cartaz (escrito à mão, sem biblioteca). */
function pdfFromJpeg(jpeg: Uint8Array, pxW: number, pxH: number): Blob {
  const PW = 595.28, PH = 841.89;                 // A4 em pontos
  const enc = (s: string) => Uint8Array.from(s, c => c.charCodeAt(0) & 0xff);
  const content = `q ${PW.toFixed(2)} 0 0 ${PH.toFixed(2)} 0 0 cm /Im0 Do Q\n`;

  const objs: Uint8Array[] = [
    enc('<< /Type /Catalog /Pages 2 0 R >>'),
    enc('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
    enc(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PW.toFixed(2)} ${PH.toFixed(2)}] ` +
        `/Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`),
    // 4: imagem (stream binário)
    (() => {
      const head = enc(`<< /Type /XObject /Subtype /Image /Width ${pxW} /Height ${pxH} /ColorSpace /DeviceRGB ` +
        `/BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`);
      const tail = enc('\nendstream');
      const out = new Uint8Array(head.length + jpeg.length + tail.length);
      out.set(head, 0); out.set(jpeg, head.length); out.set(tail, head.length + jpeg.length);
      return out;
    })(),
    enc(`<< /Length ${content.length} >>\nstream\n${content}endstream`),
  ];

  const parts: Uint8Array[] = [];
  let offset = 0;
  const push = (u: Uint8Array) => { parts.push(u); offset += u.length; };
  push(enc('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'));

  const xref: number[] = [];
  objs.forEach((body, i) => {
    xref.push(offset);
    push(enc(`${i + 1} 0 obj\n`));
    push(body);
    push(enc('\nendobj\n'));
  });

  const xrefPos = offset;
  let table = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const pos of xref) table += String(pos).padStart(10, '0') + ' 00000 n \n';
  table += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`;
  push(enc(table));

  const total = parts.reduce((s, p) => s + p.length, 0);
  const bytes = new Uint8Array(total);
  let at = 0;
  for (const p of parts) { bytes.set(p, at); at += p.length; }
  return new Blob([bytes], { type: 'application/pdf' });
}

/** Gera o cartaz e devolve o PDF pronto para download. */
export async function posterPdf(input: PosterInput): Promise<Blob> {
  const canvas = await drawPoster(input);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
  const b64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const bin = atob(b64);
  const jpeg = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) jpeg[i] = bin.charCodeAt(i);
  return pdfFromJpeg(jpeg, canvas.width, canvas.height);
}

export async function downloadPosterPdf(input: PosterInput, fileName: string) {
  const blob = await posterPdf(input);
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = fileName.endsWith('.pdf') ? fileName : fileName + '.pdf';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 4000);
}
