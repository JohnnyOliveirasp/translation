// Gera o PDF do sermão a partir das transcrições gravadas durante o culto.
// Escrito à mão (sem biblioteca de PDF, como o gerador de QR do site): página A4,
// texto de verdade em Helvetica, multipágina, quebra de linha medida pela largura
// real dos glifos. Porta do protótipo `livetranslate/tools/sermao-pdf.py`.
//
// 31/08: documento "de entregar ao membro" — logo da igreja no cabeçalho (PNG/JPEG
// embutidos à mão; logo claro ganha cartão escuro como no site), texto JUSTIFICADO,
// e versículo citado vira parágrafo próprio (itálico, recuado, com filete) — pedido
// do Johnny: destacar a Palavra do resto da pregação.
//
// Entrada: logs/sermao-{slug}-AAAAMMDD.log        (fala do orador, idioma original)
//          logs/traducao-{slug}-{lang}-AAAAMMDD.log (uma por idioma traduzido)
// Saída:   sermons/{slug}/{AAAAMMDD}-{lang}.pdf

import { readFileSync, existsSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { inflateSync, deflateSync } from 'node:zlib';

const LARGURA = 595.28, ALTURA = 841.89;
const MARGEM_X = 56, MARGEM_TOPO = 72, MARGEM_BASE = 56;
const CORPO_TAM = 11, CORPO_ALT = 16, TITULO_TAM = 20;
const RECUO_VERSO = 24;                 // recuo (dos dois lados) do parágrafo de versículo
const COR_CARTAO = [0.059, 0.090, 0.165]; // slate-900, o mesmo cartão escuro do site

const IDIOMA_NOME = {
  'en': 'English', 'es': 'Español', 'pt-BR': 'Português', 'fr': 'Français', 'de': 'Deutsch',
  'it': 'Italiano', 'zh-Hans': '中文', 'ko': '한국어', 'ja': '日本語', 'ht': 'Kreyòl ayisyen',
  'ru': 'Русский', 'uk': 'Українська', 'ar': 'العربية', 'hi': 'हिन्दी', 'vi': 'Tiếng Việt', 'tl': 'Filipino',
};
const CABECALHO = { 'pt-BR': 'Culto de', 'es': 'Culto del', 'en': 'Service of' };
const RODAPE = {
  'pt-BR': 'Transcrição automática da tradução ao vivo — pode conter imprecisões.',
  'es': 'Transcripción automática de la traducción en vivo — puede contener imprecisiones.',
  'en': 'Automatic transcript of the live service — may contain inaccuracies.',
};

// Larguras da Helvetica (1/1000 em) — sem isso a quebra de linha erra feio.
// (Helvetica-Oblique tem as MESMAS métricas, então a tabela serve para o itálico.)
const W = { ' ': 278, '!': 278, '"': 355, '#': 556, '$': 556, '%': 889, '&': 667, "'": 191, '(': 333, ')': 333, '*': 389, '+': 584, ',': 278, '-': 333, '.': 278, '/': 278, '0': 556, '1': 556, '2': 556, '3': 556, '4': 556, '5': 556, '6': 556, '7': 556, '8': 556, '9': 556, ':': 278, ';': 278, '<': 584, '=': 584, '>': 584, '?': 556, '@': 1015, A: 667, B: 667, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 500, K: 667, L: 556, M: 833, N: 722, O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611, U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611, '[': 278, '\\': 278, ']': 278, '^': 469, '_': 556, '`': 333, a: 556, b: 556, c: 500, d: 556, e: 556, f: 278, g: 556, h: 556, i: 222, j: 222, k: 500, l: 222, m: 833, n: 556, o: 556, p: 556, q: 556, r: 333, s: 500, t: 278, u: 556, v: 500, w: 722, x: 500, y: 500, z: 500, '{': 334, '|': 260, '}': 334, '~': 584 };

const larguraTexto = (t, tam) => {
  let total = 0;
  for (const ch of t) {
    let w = W[ch];
    if (w === undefined) w = W[ch.normalize('NFD')[0]] ?? 556;   // acentuado usa a base
    total += w;
  }
  return (total * tam) / 1000;
};

// ── Referência bíblica: "Efésios 2:8", "Salmo 23", "1 Corinthians 13", "Juan 3:16" ──
// Livros em pt/es/en (os idiomas em uso). Exige MAIÚSCULA inicial + número de capítulo,
// senão "job 9" ou "Romanos" solto no meio da fala viravam falso destaque.
const LIVROS = [
  // pt-BR
  'Gênesis', 'Êxodo', 'Levítico', 'Números', 'Deuteronômio', 'Josué', 'Juízes', 'Rute', 'Samuel', 'Reis',
  'Crônicas', 'Esdras', 'Neemias', 'Ester', 'Jó', 'Salmos?', 'Provérbios', 'Eclesiastes', 'Cantares', 'Cânticos',
  'Isaías', 'Jeremias', 'Lamentações', 'Ezequiel', 'Daniel', 'Oséias', 'Oseias', 'Joel', 'Amós', 'Obadias',
  'Jonas', 'Miquéias', 'Miqueias', 'Naum', 'Habacuque', 'Sofonias', 'Ageu', 'Zacarias', 'Malaquias',
  'Mateus', 'Marcos', 'Lucas', 'João', 'Atos', 'Romanos', 'Coríntios', 'Gálatas', 'Efésios', 'Filipenses',
  'Colossenses', 'Tessalonicenses', 'Timóteo', 'Tito', 'Filemom', 'Hebreus', 'Tiago', 'Pedro', 'Judas', 'Apocalipse',
  // es (só o que difere)
  'Génesis', 'Éxodo', 'Deuteronomio', 'Jueces', 'Rut', 'Reyes', 'Crónicas', 'Nehemías', 'Job',
  'Proverbios', 'Eclesiastés', 'Isaías', 'Jeremías', 'Lamentaciones', 'Oseas', 'Abdías', 'Jonás',
  'Miqueas', 'Nahúm', 'Habacuc', 'Sofonías', 'Hageo', 'Zacarías', 'Malaquías',
  'Mateo', 'Juan', 'Hechos', 'Corintios', 'Efesios', 'Colosenses', 'Tesalonicenses', 'Timoteo',
  'Filemón', 'Hebreos', 'Santiago', 'Apocalipsis',
  // en (só o que difere)
  'Genesis', 'Exodus', 'Leviticus', 'Numbers', 'Deuteronomy', 'Joshua', 'Judges', 'Ruth', 'Kings',
  'Chronicles', 'Ezra', 'Nehemiah', 'Esther', 'Psalms?', 'Proverbs', 'Ecclesiastes', 'Isaiah', 'Jeremiah',
  'Lamentations', 'Ezekiel', 'Hosea', 'Amos', 'Obadiah', 'Jonah', 'Micah', 'Nahum', 'Habakkuk',
  'Zephaniah', 'Haggai', 'Zechariah', 'Malachi', 'Matthew', 'Mark', 'Luke', 'John', 'Acts', 'Romans',
  'Corinthians', 'Galatians', 'Ephesians', 'Philippians', 'Colossians', 'Thessalonians', 'Timothy',
  'Titus', 'Philemon', 'Hebrews', 'James', 'Peter', 'Jude', 'Revelation',
];
const REF_VERSICULO = new RegExp(
  `(?:^|[^\\p{L}])(?:[123][ªº]?\\s+)?(?:${LIVROS.join('|')})\\s+(?:cap[íi]tulo\\s+)?\\d{1,3}(?:\\s*[:.,]\\s*\\d{1,3})?`, 'u');

/** Fragmentos → parágrafos. Frase com referência bíblica vira parágrafo PRÓPRIO
 *  (com até 2 frases seguintes — o pastor costuma ler o versículo logo após citá-lo). */
function paragrafos(linhas) {
  const texto = linhas.join('').replace(/\s+/g, ' ').trim();
  const frases = texto.match(/[^.!?…]+[.!?…]*/g) ?? [];
  const out = [];
  let atual = '';
  const solta = () => { if (atual.trim()) out.push({ texto: atual.trim(), verso: false }); atual = ''; };
  for (let i = 0; i < frases.length; i++) {
    const f = frases[i];
    if (REF_VERSICULO.test(f)) {
      solta();
      let bloco = f;
      let extras = 0;
      // se a frase da referência é curta ("Efésios 2:8 e 9."), o versículo vem nas
      // frases seguintes — puxa até 2; se já veio inteiro nela, não arrasta a pregação
      while (i + 1 < frases.length && extras < 2 && bloco.length < 120 && !REF_VERSICULO.test(frases[i + 1])) {
        bloco += frases[++i];
        extras++;
      }
      out.push({ texto: bloco.trim(), verso: true });
      continue;
    }
    atual += f;
    if (atual.length > 420 && /[.!?…]\s*$/.test(atual)) solta();
  }
  solta();
  return out;
}

function lerLog(caminho) {
  if (!existsSync(caminho)) return [];
  return readFileSync(caminho, 'utf8').split('\n')
    .map(l => l.replace(/^\d{2}:\d{2}:\d{2}\s?/, ''))
    .filter(l => l.trim() && !l.startsWith('---'))
    .map(l => (l.startsWith(' ') ? l : ' ' + l));
}

function quebrar(texto, tam, largura) {
  const linhas = [];
  let atual = '';
  for (const palavra of texto.split(' ')) {
    const teste = atual ? atual + ' ' + palavra : palavra;
    if (larguraTexto(teste, tam) > largura && atual) { linhas.push(atual); atual = palavra; }
    else atual = teste;
  }
  if (atual) linhas.push(atual);
  return linhas;
}

/** WinAnsi (cp1252) + escapes do PDF. Fora da tabela vira '?' — as fontes base não têm. */
function esc(texto) {
  const mapa = { '—': 0x97, '–': 0x96, '“': 0x93, '”': 0x94, '‘': 0x91, '’': 0x92, '…': 0x85, '·': 0xb7, '€': 0x80 };
  const bytes = [];
  for (const ch of texto) {
    if (ch === '\\') { bytes.push(0x5c, 0x5c); continue; }
    if (ch === '(') { bytes.push(0x5c, 0x28); continue; }
    if (ch === ')') { bytes.push(0x5c, 0x29); continue; }
    const cp = ch.codePointAt(0);
    if (mapa[ch]) bytes.push(mapa[ch]);
    else if (cp <= 0xff) bytes.push(cp);
    else {
      const base = ch.normalize('NFD')[0].codePointAt(0);   // ex.: chinês vira '?'
      bytes.push(base <= 0xff ? base : 0x3f);
    }
  }
  return Buffer.from(bytes);
}

/** Data por extenso no idioma do PDF ("30 de agosto de 2026"). */
function dataBonita(dia, lang) {
  try {
    return new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
      .format(new Date(`${dia}T12:00:00Z`));
  } catch { return dia; }
}

// ── Logo: decodifica PNG (inflate + desfiltro) ou mede JPEG, para embutir à mão ─────
function decodificarPng(buf) {
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) return null;
  let pos = 8, w = 0, h = 0, bitDepth = 0, colorType = 0, interlace = 0;
  const idat = [];
  while (pos + 12 <= buf.length) {
    const len = buf.readUInt32BE(pos);
    const tipo = buf.toString('latin1', pos + 4, pos + 8);
    const dados = buf.subarray(pos + 8, pos + 8 + len);
    if (tipo === 'IHDR') { w = dados.readUInt32BE(0); h = dados.readUInt32BE(4); bitDepth = dados[8]; colorType = dados[9]; interlace = dados[12]; }
    else if (tipo === 'IDAT') idat.push(dados);
    else if (tipo === 'IEND') break;
    pos += 12 + len;
  }
  // só o caso comum de logo (8 bits, RGB/RGBA, sem entrelace) — o resto sai sem logo
  if (!w || !h || bitDepth !== 8 || (colorType !== 6 && colorType !== 2) || interlace !== 0) return null;
  const bpp = colorType === 6 ? 4 : 3;
  let raw;
  try { raw = inflateSync(Buffer.concat(idat)); } catch { return null; }
  const stride = w * bpp;
  if (raw.length < h * (stride + 1)) return null;
  const px = Buffer.alloc(h * stride);
  for (let yl = 0; yl < h; yl++) {
    const filtro = raw[yl * (stride + 1)];
    const src = yl * (stride + 1) + 1, dst = yl * stride;
    for (let i = 0; i < stride; i++) {
      const x = raw[src + i];
      const a = i >= bpp ? px[dst + i - bpp] : 0;
      const b = yl > 0 ? px[dst - stride + i] : 0;
      const c = yl > 0 && i >= bpp ? px[dst - stride + i - bpp] : 0;
      let v;
      switch (filtro) {
        case 0: v = x; break;
        case 1: v = x + a; break;
        case 2: v = x + b; break;
        case 3: v = x + ((a + b) >> 1); break;
        case 4: {
          const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c); break;
        }
        default: return null;
      }
      px[dst + i] = v & 0xff;
    }
  }
  const rgb = Buffer.alloc(w * h * 3);
  let alfa = null;
  if (colorType === 6) {
    alfa = Buffer.alloc(w * h);
    for (let i = 0, j = 0; i < w * h; i++) { rgb[i * 3] = px[j++]; rgb[i * 3 + 1] = px[j++]; rgb[i * 3 + 2] = px[j++]; alfa[i] = px[j++]; }
  } else rgb.set(px);
  return { w, h, rgb, alfa };
}

function dimensoesJpeg(buf) {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let pos = 2;
  while (pos + 9 < buf.length) {
    if (buf[pos] !== 0xff) { pos++; continue; }
    const marca = buf[pos + 1];
    if (marca >= 0xc0 && marca <= 0xcf && marca !== 0xc4 && marca !== 0xc8 && marca !== 0xcc) {
      return { h: buf.readUInt16BE(pos + 5), w: buf.readUInt16BE(pos + 7) };
    }
    pos += 2 + buf.readUInt16BE(pos + 2);
  }
  return null;
}

/** `logo` = { buf, isLight } → dados prontos para virar XObject, ou null (segue sem logo). */
function prepararLogo(logo) {
  if (!logo?.buf?.length) return null;
  const png = decodificarPng(logo.buf);
  if (png) return { tipo: 'png', ...png, isLight: !!logo.isLight };
  const jpg = dimensoesJpeg(logo.buf);
  if (jpg) return { tipo: 'jpeg', ...jpg, dados: logo.buf, isLight: !!logo.isLight };
  return null;   // webp etc.: sem logo é melhor que PDF quebrado
}

/** Retângulo de cantos redondos (caminho PDF) — o cartão escuro do logo claro. */
function cartao(x, y, w, h, r, [cr, cg, cb]) {
  const k = r * 0.5523;
  const f = n => n.toFixed(2);
  return `${f(cr)} ${f(cg)} ${f(cb)} rg\n` +
    `${f(x + r)} ${f(y)} m ${f(x + w - r)} ${f(y)} l ` +
    `${f(x + w - r + k)} ${f(y)} ${f(x + w)} ${f(y + r - k)} ${f(x + w)} ${f(y + r)} c ` +
    `${f(x + w)} ${f(y + h - r)} l ` +
    `${f(x + w)} ${f(y + h - r + k)} ${f(x + w - r + k)} ${f(y + h)} ${f(x + w - r)} ${f(y + h)} c ` +
    `${f(x + r)} ${f(y + h)} l ` +
    `${f(x + r - k)} ${f(y + h)} ${f(x)} ${f(y + h - r + k)} ${f(x)} ${f(y + h - r)} c ` +
    `${f(x)} ${f(y + r)} l ` +
    `${f(x)} ${f(y + r - k)} ${f(x + r - k)} ${f(y)} ${f(x + r)} ${f(y)} c f\n`;
}

export function gerarPdf({ igreja, data, lang, paragrafos: pars, destino, logo = null }) {
  const larguraUtil = LARGURA - 2 * MARGEM_X;
  const subtitulo = `${CABECALHO[lang] ?? 'Service of'} ${dataBonita(data, lang)} · ${IDIOMA_NOME[lang] ?? lang}`;
  const rodape = RODAPE[lang] ?? RODAPE['en'];
  const img = prepararLogo(logo);

  // ── Diagramação: páginas de { textos, filetes, cabecalho } ──────────────────────
  const paginas = [];
  let textos = [], filetes = [];   // filete = a barrinha à esquerda do versículo
  let y = ALTURA - MARGEM_TOPO;
  const novaPagina = () => { paginas.push({ textos, filetes }); textos = []; filetes = []; y = ALTURA - MARGEM_TOPO; };

  // Cabeçalho centrado: logo (ou nome da igreja) + subtítulo + régua
  let capa = null;   // desenho do topo da página 1 (cartão + imagem)
  if (img) {
    let lw = (img.w / img.h) * 40, lh = 40;
    if (lw > 230) { lh = (230 / lw) * lh; lw = 230; }
    const lx = (LARGURA - lw) / 2;
    const ly = y - lh;
    capa = { lx, ly, lw, lh, isLight: img.isLight };
    y = ly - 22;
  } else {
    textos.push({ x: (LARGURA - larguraTexto(igreja, TITULO_TAM)) / 2, y: y - TITULO_TAM, texto: igreja, tam: TITULO_TAM, fonte: '/F2', tw: 0, cinza: 0 });
    y -= TITULO_TAM + 12;
  }
  textos.push({ x: (LARGURA - larguraTexto(subtitulo, 10.5)) / 2, y, texto: subtitulo, tam: 10.5, fonte: '/F1', tw: 0, cinza: 0.42 });
  y -= 14;
  const regua = { y };            // linha fina sob o cabeçalho (página 1)
  y -= 26;

  for (const par of pars) {
    const recuo = par.verso ? RECUO_VERSO : 0;
    const larg = larguraUtil - 2 * recuo;
    const fonte = par.verso ? '/F3' : '/F1';
    const linhas = quebrar(par.texto, CORPO_TAM, larg);
    let barra = null;
    linhas.forEach((linha, idx) => {
      if (y < MARGEM_BASE + CORPO_ALT) { novaPagina(); barra = null; }
      const ultima = idx === linhas.length - 1;
      // JUSTIFICADO: espaço extra distribuído entre as palavras (menos na última linha)
      let tw = 0;
      if (!ultima) {
        const esp = linha.split(' ').length - 1;
        if (esp > 0) tw = Math.min(Math.max((larg - larguraTexto(linha, CORPO_TAM)) / esp, 0), 18);
      }
      textos.push({ x: MARGEM_X + recuo, y, texto: linha, tam: CORPO_TAM, fonte, tw, cinza: 0 });
      if (par.verso) {
        if (barra && filetes[filetes.length - 1] === barra) barra.yBase = y - 3;
        else { barra = { x: MARGEM_X + 9, yTopo: y + CORPO_TAM - 1, yBase: y - 3 }; filetes.push(barra); }
      }
      y -= CORPO_ALT;
    });
    y -= CORPO_ALT * (par.verso ? 0.75 : 0.55);   // versículo respira um pouco mais
  }
  paginas.push({ textos, filetes });

  // ── Montagem dos objetos PDF ───────────────────────────────────────────────────
  const objs = [];
  const add = corpo => { objs.push(corpo); return objs.length; };
  const fNormal = add(Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'));
  const fBold = add(Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'));
  const fItalico = add(Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>'));

  let imgId = null;
  if (img) {
    if (img.tipo === 'png') {
      let smask = '';
      if (img.alfa) {
        const a = deflateSync(img.alfa);
        const sid = add(Buffer.concat([Buffer.from(
          `<< /Type /XObject /Subtype /Image /Width ${img.w} /Height ${img.h} /ColorSpace /DeviceGray ` +
          `/BitsPerComponent 8 /Filter /FlateDecode /Length ${a.length} >>\nstream\n`), a, Buffer.from('\nendstream')]));
        smask = ` /SMask ${sid} 0 R`;
      }
      const rgb = deflateSync(img.rgb);
      imgId = add(Buffer.concat([Buffer.from(
        `<< /Type /XObject /Subtype /Image /Width ${img.w} /Height ${img.h} /ColorSpace /DeviceRGB ` +
        `/BitsPerComponent 8 /Filter /FlateDecode${smask} /Length ${rgb.length} >>\nstream\n`), rgb, Buffer.from('\nendstream')]));
    } else {
      imgId = add(Buffer.concat([Buffer.from(
        `<< /Type /XObject /Subtype /Image /Width ${img.w} /Height ${img.h} /ColorSpace /DeviceRGB ` +
        `/BitsPerComponent 8 /Filter /DCTDecode /Length ${img.dados.length} >>\nstream\n`), img.dados, Buffer.from('\nendstream')]));
    }
  }

  const conteudos = [];
  paginas.forEach((p, i) => {
    const partes = [];
    if (i === 0) {
      if (capa) {
        if (capa.isLight) {
          // logo claro (texto branco): cartão escuro atrás, como no painel e na página do ouvinte
          partes.push(Buffer.from('q\n' + cartao(capa.lx - 16, capa.ly - 12, capa.lw + 32, capa.lh + 24, 10, COR_CARTAO) + 'Q\n'));
        }
        partes.push(Buffer.from(`q\n${capa.lw.toFixed(2)} 0 0 ${capa.lh.toFixed(2)} ${capa.lx.toFixed(2)} ${capa.ly.toFixed(2)} cm\n/Im1 Do\nQ\n`));
      }
      partes.push(Buffer.from(`q\n0.78 0.78 0.78 rg\n${MARGEM_X} ${regua.y.toFixed(1)} ${larguraUtil.toFixed(1)} 0.6 re f\nQ\n`));
    }
    for (const fil of p.filetes) {
      partes.push(Buffer.from(`q\n0.72 0.72 0.72 rg\n${fil.x} ${fil.yBase.toFixed(1)} 2 ${(fil.yTopo - fil.yBase).toFixed(1)} re f\nQ\n`));
    }
    partes.push(Buffer.from('BT\n'));
    let corAtual = -1, twAtual = -1;
    for (const t of p.textos) {
      if (t.cinza !== corAtual) { partes.push(Buffer.from(`${t.cinza.toFixed(2)} ${t.cinza.toFixed(2)} ${t.cinza.toFixed(2)} rg\n`)); corAtual = t.cinza; }
      if (t.tw !== twAtual) { partes.push(Buffer.from(`${t.tw.toFixed(3)} Tw\n`)); twAtual = t.tw; }
      partes.push(Buffer.from(`${t.fonte} ${t.tam} Tf\n1 0 0 1 ${t.x.toFixed(1)} ${t.y.toFixed(1)} Tm\n(`));
      partes.push(esc(t.texto));
      partes.push(Buffer.from(') Tj\n'));
    }
    // rodapé centrado, cinza
    const rodapeTxt = `${rodape}   ·   ${i + 1}/${paginas.length}`;
    partes.push(Buffer.from(`0.45 0.45 0.45 rg\n0 Tw\n/F1 8.5 Tf\n1 0 0 1 ${((LARGURA - larguraTexto(rodapeTxt, 8.5)) / 2).toFixed(1)} ${MARGEM_BASE - 22} Tm\n(`));
    partes.push(esc(rodapeTxt));
    partes.push(Buffer.from(') Tj\nET'));
    const fluxo = Buffer.concat(partes);
    conteudos.push(add(Buffer.concat([Buffer.from(`<< /Length ${fluxo.length} >>\nstream\n`), fluxo, Buffer.from('\nendstream')])));
  });

  const pagesId = objs.length + paginas.length + 1;
  const xobj = imgId ? ` /XObject << /Im1 ${imgId} 0 R >>` : '';
  const kids = conteudos.map(cid => add(Buffer.from(
    `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${LARGURA.toFixed(2)} ${ALTURA.toFixed(2)}] ` +
    `/Resources << /Font << /F1 ${fNormal} 0 R /F2 ${fBold} 0 R /F3 ${fItalico} 0 R >>${xobj} >> /Contents ${cid} 0 R >>`)));
  const pages = add(Buffer.from(`<< /Type /Pages /Kids [${kids.map(k => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`));
  const catalogo = add(Buffer.from(`<< /Type /Catalog /Pages ${pages} 0 R >>`));
  const info = add(Buffer.concat([Buffer.from('<< /Title ('), esc(`${igreja} — ${subtitulo}`), Buffer.from(') /Producer (LiveTranslate) >>')]));

  const partes = [Buffer.from('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n', 'latin1')];
  let offset = partes[0].length;
  const offsets = [];
  objs.forEach((corpo, i) => {
    offsets.push(offset);
    const bloco = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`), corpo, Buffer.from('\nendobj\n')]);
    partes.push(bloco); offset += bloco.length;
  });
  let tabela = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) tabela += String(off).padStart(10, '0') + ' 00000 n \n';
  tabela += `trailer\n<< /Size ${objs.length + 1} /Root ${catalogo} 0 R /Info ${info} 0 R >>\nstartxref\n${offset}\n%%EOF\n`;
  partes.push(Buffer.from(tabela));

  mkdirSync(destino.slice(0, destino.lastIndexOf('/')), { recursive: true });
  writeFileSync(destino, Buffer.concat(partes));
  return {
    paginas: paginas.length,
    palavras: pars.reduce((s, p) => s + p.texto.split(' ').length, 0),
    versiculos: pars.filter(p => p.verso).length,
  };
}

/** Gera todos os PDFs do culto de hoje desta igreja (original + cada idioma).
 *  `logo` (opcional) = { buf, isLight } — vem do bucket público via tenant.churchLogo. */
export function gerarSermao(slug, igrejaNome, dia = new Date().toISOString().slice(0, 10), logo = null) {
  const chave = dia.replace(/-/g, '');
  const feitos = [];

  const original = `logs/sermao-${slug}-${chave}.log`;
  const pares = [['__orig__', original]];
  try {
    for (const f of readdirSync('logs')) {
      const m = f.match(new RegExp(`^traducao-${slug}-(.+)-${chave}\\.log$`));
      if (m) pares.push([m[1], `logs/${f}`]);
    }
  } catch { /* sem pasta de logs ainda */ }

  for (const [lang, caminho] of pares) {
    const linhas = lerLog(caminho);
    if (linhas.length < 20) continue;                 // trecho curto demais: não vira sermão
    const pars = paragrafos(linhas);
    if (!pars.length) continue;
    const etiqueta = lang === '__orig__' ? 'original' : lang;
    const destino = `sermons/${slug}/${chave}-${etiqueta}.pdf`;
    const info = gerarPdf({ igreja: igrejaNome || slug, data: dia, lang: lang === '__orig__' ? 'en' : lang, paragrafos: pars, destino, logo });
    feitos.push({ lang: etiqueta, arquivo: destino, ...info });
  }
  return feitos;
}
