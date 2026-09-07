# LiveTranslate — identidade visual

Conceito escolhido (25/08/2026): **"onda + cruz"** — equalizador de som cuja barra central é uma cruz.

## Fonte da verdade: `svg/`
Vetor (resolução infinita, fundo transparente). Editar `gerar-logo.js` e rodar `node gerar-logo.js` para regenerar.

| Arquivo | Uso |
|---|---|
| `mark-{color,black,white}.svg` | Símbolo sozinho — favicon, ícone de app, QR, avatar |
| `lockup-{color,black,white}.svg` | Símbolo + nome empilhados — hero, materiais impressos |
| `lockup-horizontal-{color,black,white}.svg` | Símbolo + nome lado a lado — barra de navegação, rodapé, e-mail |

- **color**: azul navy `#1E3A8A` → royal `#2563EB` nas barras; cruz dourada `#FBBF24 → #D97706`. Para fundo branco/claro.
- **black**: monocromático preto — site editorial (nav/rodapé), impressão P&B.
- **white**: monocromático branco — fundos escuros, vídeo do hero, dark mode.

## Exportações: `png/` (4096 px, RGBA transparente)
`bash render-png.sh` re-exporta tudo (usa o Chromium do Playwright em headless).
`PREVIEW-*` têm fundo escuro só para conferir a versão branca — não usar como asset.

## Tipografia
Wordmark em **Instrument Serif** (OFL) — `fonts/InstrumentSerif-{Regular,Italic}.ttf`. Corpo do site: Inter.
Nos SVGs o texto está como `<text>` (precisa da fonte instalada/carregada); para impressão profissional converter para curvas.

## Rascunhos descartados
`docs/logos/` — os 5 conceitos gerados por IA (P&B e cor) que orientaram a escolha.
