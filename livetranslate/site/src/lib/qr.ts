/**
 * Gerador de QR Code — modo byte, correção de erro M, versões 1–10 (até 213 bytes).
 * Escrito à mão para NÃO adicionar dependência (protocolo de segurança do CLAUDE.md).
 * Validado com OpenCV (cv2.QRCodeDetector) contra os links reais de igreja.
 */

// ── GF(256) para Reed-Solomon (polinômio 0x11D) ──
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();
const mul = (a: number, b: number) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

function generatorPoly(degree: number): number[] {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= mul(poly[j], EXP[i]);
    }
    poly = next;
  }
  return poly;
}

function eccOf(data: number[], ecLen: number): number[] {
  const gen = generatorPoly(ecLen);
  const res = new Array(data.length + ecLen).fill(0);
  for (let i = 0; i < data.length; i++) res[i] = data[i];
  for (let i = 0; i < data.length; i++) {
    const factor = res[i];
    if (factor === 0) continue;
    for (let j = 0; j < gen.length; j++) res[i + j] ^= mul(gen[j], factor);
  }
  return res.slice(data.length);
}

// ── Tabelas por versão (nível M): [ecCodewordsPerBlock, g1Blocks, g1Data, g2Blocks, g2Data] ──
const SPECS: Record<number, [number, number, number, number, number]> = {
  1: [10, 1, 16, 0, 0],
  2: [16, 1, 28, 0, 0],
  3: [26, 1, 44, 0, 0],
  4: [18, 2, 32, 0, 0],
  5: [24, 2, 43, 0, 0],
  6: [16, 4, 27, 0, 0],
  7: [18, 4, 31, 0, 0],
  8: [22, 2, 38, 2, 39],
  9: [22, 3, 36, 2, 37],
  10: [26, 4, 43, 1, 44],
};
const ALIGN: Record<number, number[]> = {
  1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30],
  6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50],
};
const VERSION_INFO: Record<number, number> = { 7: 0x07c94, 8: 0x085bc, 9: 0x09a99, 10: 0x0a4d3 };

const totalDataCodewords = (v: number) => {
  const [, b1, d1, b2, d2] = SPECS[v];
  return b1 * d1 + b2 * d2;
};
/** Capacidade em bytes: total − cabeçalho (4 bits modo + 8/16 bits tamanho). */
const capacity = (v: number) => totalDataCodewords(v) - (v < 10 ? 2 : 3);

function pickVersion(byteLen: number): number {
  for (let v = 1; v <= 10; v++) if (byteLen <= capacity(v)) return v;
  throw new Error('QR: texto longo demais (máx. ' + capacity(10) + ' bytes)');
}

// ── Bits ──
class Bits {
  bits: number[] = [];
  push(value: number, len: number) {
    for (let i = len - 1; i >= 0; i--) this.bits.push((value >> i) & 1);
  }
}

function encodeData(text: string, version: number): number[] {
  const bytes = Array.from(new TextEncoder().encode(text));
  const bb = new Bits();
  bb.push(0b0100, 4);                       // modo byte
  bb.push(bytes.length, version < 10 ? 8 : 16);
  for (const b of bytes) bb.push(b, 8);

  const totalBits = totalDataCodewords(version) * 8;
  const terminator = Math.min(4, totalBits - bb.bits.length);
  bb.push(0, terminator);
  while (bb.bits.length % 8 !== 0) bb.bits.push(0);

  const codewords: number[] = [];
  for (let i = 0; i < bb.bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | bb.bits[i + j];
    codewords.push(byte);
  }
  const pads = [0xec, 0x11];
  for (let i = 0; codewords.length < totalDataCodewords(version); i++) codewords.push(pads[i % 2]);
  return codewords;
}

/** Divide em blocos, calcula ECC e intercala (data primeiro, depois ECC). */
function interleave(codewords: number[], version: number): number[] {
  const [ecLen, b1, d1, b2, d2] = SPECS[version];
  const dataBlocks: number[][] = [];
  const ecBlocks: number[][] = [];
  let at = 0;
  for (let i = 0; i < b1; i++) { const blk = codewords.slice(at, at + d1); at += d1; dataBlocks.push(blk); ecBlocks.push(eccOf(blk, ecLen)); }
  for (let i = 0; i < b2; i++) { const blk = codewords.slice(at, at + d2); at += d2; dataBlocks.push(blk); ecBlocks.push(eccOf(blk, ecLen)); }

  const out: number[] = [];
  const maxData = Math.max(d1, d2);
  for (let i = 0; i < maxData; i++) for (const blk of dataBlocks) if (i < blk.length) out.push(blk[i]);
  for (let i = 0; i < ecLen; i++) for (const blk of ecBlocks) out.push(blk[i]);
  return out;
}

type Matrix = { size: number; modules: Int8Array }; // -1 = livre, 0 = claro, 1 = escuro
const idx = (m: Matrix, r: number, c: number) => r * m.size + c;
const get = (m: Matrix, r: number, c: number) => m.modules[idx(m, r, c)];
const set = (m: Matrix, r: number, c: number, v: number) => { m.modules[idx(m, r, c)] = v; };

function placeFunctionPatterns(m: Matrix, version: number) {
  const size = m.size;
  const finder = (r0: number, c0: number) => {
    for (let r = -1; r <= 7; r++) for (let c = -1; c <= 7; c++) {
      const rr = r0 + r, cc = c0 + c;
      if (rr < 0 || cc < 0 || rr >= size || cc >= size) continue;
      const inRing = (r >= 0 && r <= 6 && (c === 0 || c === 6)) || (c >= 0 && c <= 6 && (r === 0 || r === 6));
      const inCore = r >= 2 && r <= 4 && c >= 2 && c <= 4;
      set(m, rr, cc, inRing || inCore ? 1 : 0);
    }
  };
  finder(0, 0); finder(0, size - 7); finder(size - 7, 0);

  for (let i = 8; i < size - 8; i++) { // timing
    const dark = i % 2 === 0 ? 1 : 0;
    set(m, 6, i, dark); set(m, i, 6, dark);
  }

  for (const r0 of ALIGN[version]) for (const c0 of ALIGN[version]) { // alignment
    const nearFinder = (r0 <= 8 && c0 <= 8) || (r0 <= 8 && c0 >= size - 9) || (r0 >= size - 9 && c0 <= 8);
    if (nearFinder) continue;
    for (let r = -2; r <= 2; r++) for (let c = -2; c <= 2; c++) {
      const ring = Math.max(Math.abs(r), Math.abs(c));
      set(m, r0 + r, c0 + c, ring === 1 ? 0 : 1);
    }
  }

  set(m, size - 8, 8, 1); // módulo escuro fixo

  for (let i = 0; i < 9; i++) { // reserva do formato
    if (get(m, 8, i) === -1) set(m, 8, i, 0);
    if (get(m, i, 8) === -1) set(m, i, 8, 0);
  }
  for (let i = 0; i < 8; i++) {
    if (get(m, 8, size - 1 - i) === -1) set(m, 8, size - 1 - i, 0);
    if (get(m, size - 1 - i, 8) === -1) set(m, size - 1 - i, 8, 0);
  }
  if (version >= 7) { // reserva da versão
    for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) {
      set(m, i, size - 11 + j, 0);
      set(m, size - 11 + j, i, 0);
    }
  }
}

function placeData(m: Matrix, data: number[]) {
  const size = m.size;
  let bitIndex = 0;
  const nextBit = () => {
    const byte = data[bitIndex >> 3];
    const bit = byte === undefined ? 0 : (byte >> (7 - (bitIndex & 7))) & 1;
    bitIndex++;
    return bit;
  };
  let upward = true;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5; // pula a coluna do timing
    for (let step = 0; step < size; step++) {
      const r = upward ? size - 1 - step : step;
      for (const c of [right, right - 1]) {
        if (get(m, r, c) !== -1) continue;
        set(m, r, c, nextBit());
      }
    }
    upward = !upward;
  }
}

const MASKS: ((r: number, c: number) => boolean)[] = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (_r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

function formatBits(mask: number): number {
  const data = (0b00 << 3) | mask; // nível M = 00
  let rem = data << 10;
  for (let i = 4; i >= 0; i--) if ((rem >> (10 + i)) & 1) rem ^= 0x537 << i;
  return ((data << 10) | rem) ^ 0x5412;
}

function applyFormatAndVersion(m: Matrix, mask: number, version: number) {
  const size = m.size;
  const fmt = formatBits(mask);
  // Bits do MSB (14) para o LSB (0), nas posições exatas das duas cópias (ISO/IEC 18004).
  const msb: number[] = [];
  for (let i = 14; i >= 0; i--) msb.push((fmt >> i) & 1);
  const copy1: [number, number][] = [
    [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8],
    [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8],
  ];
  const copy2: [number, number][] = [
    [size - 1, 8], [size - 2, 8], [size - 3, 8], [size - 4, 8], [size - 5, 8], [size - 6, 8], [size - 7, 8],
    [8, size - 8], [8, size - 7], [8, size - 6], [8, size - 5], [8, size - 4], [8, size - 3], [8, size - 2], [8, size - 1],
  ];
  copy1.forEach(([r, c], k) => set(m, r, c, msb[k]));
  copy2.forEach(([r, c], k) => set(m, r, c, msb[k]));

  if (version >= 7) {
    const vi = VERSION_INFO[version];
    for (let i = 0; i < 18; i++) {
      const b = (vi >> i) & 1;
      const r = Math.floor(i / 3), c = size - 11 + (i % 3);
      set(m, r, c, b);
      set(m, c, r, b);
    }
  }
}

function penalty(m: Matrix): number {
  const size = m.size, dark = (r: number, c: number) => get(m, r, c) === 1;
  let score = 0;

  const runScore = (line: boolean[]) => {
    let s = 0, run = 1;
    for (let i = 1; i < line.length; i++) {
      if (line[i] === line[i - 1]) { run++; } else { if (run >= 5) s += 3 + (run - 5); run = 1; }
    }
    if (run >= 5) s += 3 + (run - 5);
    return s;
  };
  for (let r = 0; r < size; r++) {
    const row: boolean[] = [], col: boolean[] = [];
    for (let c = 0; c < size; c++) { row.push(dark(r, c)); col.push(dark(c, r)); }
    score += runScore(row) + runScore(col);
  }

  for (let r = 0; r < size - 1; r++) for (let c = 0; c < size - 1; c++) {
    const v = dark(r, c);
    if (v === dark(r, c + 1) && v === dark(r + 1, c) && v === dark(r + 1, c + 1)) score += 3;
  }

  const pat1 = [true, false, true, true, true, false, true, false, false, false, false];
  const pat2 = [false, false, false, false, true, false, true, true, true, false, true];
  const matches = (line: boolean[], at: number, pat: boolean[]) => pat.every((p, k) => line[at + k] === p);
  for (let r = 0; r < size; r++) {
    const row: boolean[] = [], col: boolean[] = [];
    for (let c = 0; c < size; c++) { row.push(dark(r, c)); col.push(dark(c, r)); }
    for (let i = 0; i + 11 <= size; i++) {
      if (matches(row, i, pat1) || matches(row, i, pat2)) score += 40;
      if (matches(col, i, pat1) || matches(col, i, pat2)) score += 40;
    }
  }

  let darkCount = 0;
  for (let i = 0; i < m.modules.length; i++) if (m.modules[i] === 1) darkCount++;
  const percent = (darkCount * 100) / (size * size);
  score += Math.floor(Math.abs(percent - 50) / 5) * 10;
  return score;
}

/** Matriz do QR: `true` = módulo escuro. Sem quiet zone (o renderizador adiciona). */
export function qrMatrix(text: string): boolean[][] {
  const version = pickVersion(new TextEncoder().encode(text).length);
  const size = 17 + 4 * version;
  const data = interleave(encodeData(text, version), version);

  let best: { m: Matrix; score: number } | null = null;
  for (let mask = 0; mask < 8; mask++) {
    const m: Matrix = { size, modules: new Int8Array(size * size).fill(-1) };
    placeFunctionPatterns(m, version);
    const reserved = Int8Array.from(m.modules); // -1 onde é área de dados
    placeData(m, data);
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
      if (reserved[idx(m, r, c)] === -1 && MASKS[mask](r, c)) set(m, r, c, get(m, r, c) ^ 1);
    }
    applyFormatAndVersion(m, mask, version);
    const score = penalty(m);
    if (!best || score < best.score) best = { m, score };
  }

  const m = best!.m;
  const out: boolean[][] = [];
  for (let r = 0; r < size; r++) {
    const row: boolean[] = [];
    for (let c = 0; c < size; c++) row.push(get(m, r, c) === 1);
    out.push(row);
  }
  return out;
}

/** SVG do QR (string). `quiet` em módulos (padrão 4, exigido pela norma). */
export function qrSvg(text: string, opts: { quiet?: number; dark?: string; light?: string } = {}): string {
  const { quiet = 4, dark = '#111111', light = '#ffffff' } = opts;
  const m = qrMatrix(text);
  const size = m.length + quiet * 2;
  let path = '';
  for (let r = 0; r < m.length; r++) for (let c = 0; c < m.length; c++) {
    if (m[r][c]) path += `M${c + quiet} ${r + quiet}h1v1h-1z`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges">` +
    `<rect width="${size}" height="${size}" fill="${light}"/><path d="${path}" fill="${dark}"/></svg>`;
}

/** PNG (data URL) do QR, para download. `px` = lado final em pixels. */
export function qrPngDataUrl(text: string, px = 1024, quiet = 4): string {
  const m = qrMatrix(text);
  const total = m.length + quiet * 2;
  const scale = Math.max(1, Math.floor(px / total));
  const side = total * scale;
  const canvas = document.createElement('canvas');
  canvas.width = side; canvas.height = side;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, side, side);
  ctx.fillStyle = '#111111';
  for (let r = 0; r < m.length; r++) for (let c = 0; c < m.length; c++) {
    if (m[r][c]) ctx.fillRect((c + quiet) * scale, (r + quiet) * scale, scale, scale);
  }
  return canvas.toDataURL('image/png');
}
