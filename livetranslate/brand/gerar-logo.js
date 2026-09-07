// Gera o logo LiveTranslate (conceito 01 "onda + cruz") em SVG vetorial + wrappers HTML
// para exportação PNG transparente via Chromium headless. Rode: node gerar-logo.js
// Saída: svg/ (fonte da verdade) e render/ (HTML temporário para o screenshot).
const fs = require('fs');
const path = require('path');
const dir = __dirname;
for (const d of ['svg', 'png', 'render']) fs.mkdirSync(path.join(dir, d), { recursive: true });

// ── geometria do símbolo (viewBox 400×400, centro 200,170) ─────────────────
const W = 28, R = 14, CY = 170;
const barras = [ // [offset x do centro, altura]
  [-176, 80], [-132, 150], [-88, 200], [-44, 100],
  [44, 100], [88, 200], [132, 150], [176, 80],
];
const bar = ([dx, h], fill) =>
  `<rect x="${200 + dx - W / 2}" y="${CY - h / 2}" width="${W}" height="${h}" rx="${R}" fill="${fill}"/>`;
const cruz = fill => `
  <rect x="${200 - W / 2}" y="40" width="${W}" height="260" rx="${R}" fill="${fill}"/>
  <rect x="150" y="90" width="100" height="${W}" rx="${R}" fill="${fill}"/>`;

const DEFS = `
  <defs>
    <!-- userSpaceOnUse: o gradiente atravessa o símbolo INTEIRO (barras externas navy → internas royal),
         não cada barra separadamente (que dava efeito de cilindro) -->
    <linearGradient id="azul" gradientUnits="userSpaceOnUse" x1="10" y1="0" x2="390" y2="0">
      <stop offset="0" stop-color="#1E3A8A"/><stop offset="0.5" stop-color="#2563EB"/><stop offset="1" stop-color="#1E3A8A"/>
    </linearGradient>
    <linearGradient id="ouro" gradientUnits="userSpaceOnUse" x1="0" y1="40" x2="0" y2="300">
      <stop offset="0" stop-color="#FBBF24"/><stop offset="0.55" stop-color="#F59E0B"/><stop offset="1" stop-color="#D97706"/>
    </linearGradient>
  </defs>`;

const marca = (barFill, cruzFill, defs = '') =>
  `${defs}<g>${barras.map(b => bar(b, barFill)).join('')}${cruz(cruzFill)}</g>`;

const variantes = {
  color: { bar: 'url(#azul)', cruz: 'url(#ouro)', texto: '#1E3A8A', defs: DEFS },
  black: { bar: '#000000', cruz: '#000000', texto: '#000000', defs: '' },
  white: { bar: '#FFFFFF', cruz: '#FFFFFF', texto: '#FFFFFF', defs: '' },
};

const FONTE = `<style>@import url('https://fonts.googleapis.com/css2?family=Instrument+Serif&amp;display=swap');
  .wm{font-family:'Instrument Serif',Georgia,'Times New Roman',serif;font-size:118px;letter-spacing:-2px}</style>`;

for (const [nome, v] of Object.entries(variantes)) {
  // símbolo sozinho (quadrado)
  const mark = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400">
  ${marca(v.bar, v.cruz, v.defs)}
</svg>`;
  // lockup vertical: símbolo + wordmark
  const lockup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 500" width="900" height="500">
  ${FONTE}${v.defs}
  <g transform="translate(250 0) scale(1)">${marca(v.bar, v.cruz)}</g>
  <text class="wm" x="450" y="425" text-anchor="middle" fill="${v.texto}">LiveTranslate</text>
</svg>`;
  // lockup horizontal: símbolo à esquerda + wordmark à direita
  const horiz = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1300 250" width="1300" height="250">
  ${FONTE}${v.defs}
  <g transform="translate(0 -30) scale(0.85)">${marca(v.bar, v.cruz)}</g>
  <text class="wm" x="360" y="200" fill="${v.texto}" style="font-size:150px">LiveTranslate</text>
</svg>`;
  fs.writeFileSync(path.join(dir, 'svg', `mark-${nome}.svg`), mark);
  fs.writeFileSync(path.join(dir, 'svg', `lockup-${nome}.svg`), lockup);
  fs.writeFileSync(path.join(dir, 'svg', `lockup-horizontal-${nome}.svg`), horiz);

  // wrappers HTML p/ screenshot (fundo transparente; 'preview' usa fundo escuro só p/ conferir a branca)
  const html = (svg, bg = 'transparent') => `<!doctype html><html><head><meta charset="utf-8">
<style>@font-face{font-family:'Instrument Serif';src:url('../fonts/InstrumentSerif-Regular.ttf') format('truetype')}
html,body{margin:0;padding:0;background:${bg};overflow:hidden}svg{display:block;width:100vw;height:100vh}</style>
</head><body>${svg}</body></html>`;
  fs.writeFileSync(path.join(dir, 'render', `mark-${nome}.html`), html(mark));
  fs.writeFileSync(path.join(dir, 'render', `lockup-${nome}.html`), html(lockup));
  fs.writeFileSync(path.join(dir, 'render', `lockup-horizontal-${nome}.html`), html(horiz));
  if (nome === 'white') {
    fs.writeFileSync(path.join(dir, 'render', `preview-dark-lockup.html`), html(lockup, '#10141c'));
    fs.writeFileSync(path.join(dir, 'render', `preview-dark-mark.html`), html(mark, '#10141c'));
  }
}
console.log('SVGs e wrappers gerados em', dir);
