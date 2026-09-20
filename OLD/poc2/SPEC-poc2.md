# SPEC — POC2: Tradução em cascata com "entendimento" teológico

> Projeto SEPARADO do v1 (`live-translate/`, em produção — NÃO tocar).
> Base: pesquisa de 10/08/2026 (`_bugs/compass_artifact_*.md`).

## 1. Problema que o POC2 resolve

O v1 usa Gemini 3.5 Live Translate (S2S puro), que **não aceita prompt nem
glossário por design**. Consequências sentidas em produção:

- Nomes bíblicos errados ("James" fica "James" em vez de "Tiago")
- Terminologia teológica inconsistente (grace/justification/atonement)
- Citações de versículos saem retraduzidas, não no texto da NVI/Reina-Valera
- Diálogo no púlpito (pastor + convidado) vira monólogo sem identificação

## 2. Arquitetura

```
Mesa de som / broadcast (1 canal)
  → ASR streaming com diarização (Soniox) — roda 1×
  → LLM de texto (Gemini Flash) com system prompt teológico + glossário
      — fan-out: 1 chamada por idioma-alvo (pt-BR, es)
  → Legendas via WebSocket / LiveKit data channel no navegador do ouvinte
  → (Fase 4, opcional) TTS
```

Por que cascata (resumo da pesquisa):
- Único caminho com controle total de terminologia (prompt + glossário + RAG + pós-processamento determinístico)
- Custo ~20× menor que S2S: áudio pago 1×, texto N× (~US$0,20–0,50/h pelos 5 idiomas)
- Escalar de 5 → 10 idiomas quase não muda o custo
- Latência 2–4s — aceitável para sermão (unidirecional, tolera 2–5s)

## 3. Decisões fechadas

| # | Decisão | Valor |
|---|---------|-------|
| D1 | ASR | **Soniox** (streaming, ~US$0,12/h, diarização nativa, custom terms) |
| D2 | LLM de tradução | **Gemini Flash** (texto) — chave Gemini existente (Johnny decidiu manter a mesma, 11/08) |
| D3 | Saída do POC | **Legendas-only** (TTS adiado p/ Fase 4, só se ouvintes preferirem áudio) |
| D4 | Diálogo | Legenda com **identificação de falante** ("Falante 1/2"; operador pode nomear) |
| D5 | Idiomas do POC | pt-BR e es (mesmo escopo do v1) |

Chaves em `poc2/.env` (nunca no chat, nunca commitadas).

## 4. Fases

### Fase 1 — Gate do "entendimento" (CLI) — ✅ APROVADO em 11/08/2026

Resultados (`fase1-cli.js`, áudios `test-audio/sermao-teologico-en.wav` e
`dialogo-en.wav`, gerados por `scripts/gen-gate-audio.ps1`):

- **G1 ✅** Terminologia: expiação, justificação, justiça, nascido de novo,
  Tiago/Santiago, João/Juan, graça/gracia, remidos pelo sangue do Cordeiro,
  santificação, aleluia, amém — tudo correto nos 2 idiomas.
  *Ressalva:* 1 desvio probabilístico ("born again" → "renasci" em vez de
  "nasci de novo" num segmento) → confirma necessidade do pós-processamento
  determinístico da Fase 3.
- **G2 ✅** Citações: "John 3:16" → "João 3:16"; João 3:16 e Isaías 41:10
  saíram no TEXTO CONSAGRADO (Almeida e Reina-Valera 1960) sem RAG — o LLM
  já conhece os textos. RAG da Fase 3 vira garantia, não necessidade.
  *Ajuste feito:* prompt proíbe estender citação além do que foi falado
  (modelo completou o versículo de Nicodemos além da fala).
- **G3 ✅** Latência fim-de-fala → tradução: mediana 1,6–1,9s, típico <3s
  (meta ≤4s). Outlier de ~6s no 1º segmento do stream (aquecimento).
  Chaves: endpoint detection do Soniox (level 2, max_delay 1500ms) +
  Gemini `thinkingLevel: LOW` + pacing por relógio (setInterval puro atrasa).
- **G4 ✅** Diálogo: 2 falantes detectados e rotulados corretamente em todos
  os turnos; tradução até acertou concordância de gênero ("Obrigada, Pastor"
  para a convidada).
- **G5 ✅** Custo real registrado em `logs/custo.log`: ~3,4 min de áudio de
  teste ≈ 84 chamadas Gemini (83k tokens in / 1,8k out) + 204s Soniox →
  ordem de **US$0,03–0,04 no total** (~US$0,6/h com 2 idiomas, sem
  otimização; prompt do glossário reenviado a cada chamada — context
  caching na Fase 2 reduz bem).

Aprendizados técnicos p/ Fase 2:
- Gemini 3.6: `thinkingConfig.thinkingLevel` ("LOW"), NÃO `thinkingBudget`
- Soniox: token especial `<end>` (endpoint) deve ser filtrado do texto
- Pacing de áudio: sempre pelo relógio, nunca por setInterval fixo
- Traduções de segmentos consecutivos podem chegar fora de ordem →
  Fase 2 precisa ordenar por nº de segmento antes de exibir

#### Especificação original do gate:
CLI em Node (sem framework; ideal zero-deps: WebSocket nativo do Node ≥22 +
`fetch` para Gemini REST) que:

1. Lê `../live-translate/test-audio/orador-en.wav` (e um novo WAV de diálogo
   com 2 vozes, a gerar) e envia em chunks em ritmo real ao Soniox
2. Recebe transcrição parcial/final com timestamps + speaker labels
3. Segmenta e envia ao Gemini Flash com system prompt teológico + glossário
   (~100 termos iniciais) — 1 chamada por idioma (pt-BR, es)
4. Imprime na tela: transcrição EN | tradução | latência por segmento
5. Loga custo estimado (tokens/duração) em arquivo — nunca na tela

**Critérios do gate (todos obrigatórios para avançar):**
- G1 Terminologia: James→Tiago, John→João, grace→graça, atonement→expiação,
  righteousness→justiça, born again→nascido de novo (amostra de ≥20 termos)
- G2 Citação: versículo citado pelo orador é reconhecido como citação
  (Fase 1: referência correta, ex. "João 3:16"; texto oficial NVI é Fase 3)
- G3 Latência: fim-de-fala → tradução pronta ≤ 4s (mediana)
- G4 Diálogo: turnos de 2 falantes corretamente rotulados e traduzidos
- G5 Custo: medição real registrada em log (meta: ordem de US$0,10–0,50/h
  com 2 idiomas)

### Fase 2 — Pipeline servidor + legendas ao vivo — ✅ CONSTRUÍDA em 11/08/2026 (teste E2E ok; falta teste no navegador/celular)

Implementação (zero dependências — http + SSE nativos, sem LiveKit no POC):
- `server.js` (porta 4100): `/` ouvinte, `/broadcast` operador,
  `POST /api/audio` (chunks PCM s16le 16k mono do navegador),
  `GET /api/captions?lang=pt-BR|es|src` (SSE), `POST /api/control`
  (start/stop/set-mute, senha `BROADCAST_PASSWORD`), `GET /api/status`.
- `lib/cascata.js`: pipeline da Fase 1 como classe reutilizável +
  reconexão automática do Soniox (fila de áudio durante reconexão) +
  ordenação de legendas por segmento POR IDIOMA (destrava após 6s se
  um segmento falhar no LLM) + retry 1× no Gemini.
- `public/broadcast.html`: senha → escolhe microfone (prefere mesa de som)
  → AudioWorklet 48k→16k s16le → POST sequencial (~256ms/chunk) → mute
  sincronizado (A4) → wake lock (A3) → medidor de nível → painel com a
  transcrição EN ao vivo ("what the system is hearing") + contagem de ouvintes.
- `public/index.html`: 1 toque no idioma → legendas grandes via SSE,
  parágrafo novo a cada troca de falante ("Falante/Hablante N"),
  aviso de louvor no idioma do ouvinte durante mute, wake lock.
- Teste E2E sem navegador: `scripts/test-fase2.js` (simula operador + 3
  ouvintes SSE com o WAV de diálogo) — turnos, ordem e idiomas corretos.
- Correção pós-teste: o LLM às vezes devolve a marcação de falante
  traduzida ("[Hablante 2]") → strip por regex unicode no servidor.

#### Especificação original:
- Encaixar a cascata na infra existente: página broadcast captura áudio,
  servidor roda ASR 1× e fan-out de tradução, ouvinte recebe legenda pelo
  data channel LiveKit (mesmo transporte do v1)
- Reaproveitar: token API, wake lock, mute sincronizado, aviso de louvor
- Legenda com identificação de falante quando diarização detectar >1 voz

### Fase 3 — Citações NVI / Reina-Valera (RAG)
- Índice de versículos paralelos EN↔PT↔ES (eBible Corpus / Parallel Bible
  Corpus) — quando o pastor cita, a legenda traz o texto consagrado
- Pós-processamento determinístico (find-and-replace) para termos críticos
  (LLM cumpre glossário de forma probabilística)

### Fase 4 — TTS (opcional, decisão adiada)
- Só se os ouvintes preferirem áudio a legenda
- Candidatos: Piper (MIT, CPU) para custo zero; ElevenLabs para voz premium
- Possibilidade futura: voz diferente por falante (impossível no S2S)

## 5. Riscos e ressalvas
- Fala sobreposta (2 falando juntos) degrada em qualquer arquitetura;
  diarização marca segmentos mas transcrição do trecho sobreposto piora
- Diarização é probabilística — rótulos "Falante 1/2", nunca nomes
  automáticos
- Preços da pesquisa são de tabela/agregadores — medir consumo real no gate
- Qualidade de captura de áudio segue sendo o fator nº 1 (mesa de som ok)

## 6. Protocolo de dependências
Segue o CLAUDE.md integralmente: cooldown 7 dias, osv.dev/socket.dev,
dry-run, OK explícito do Johnny antes de cada install, versões pinadas.
Meta da Fase 1: **zero dependências novas** (WebSocket e fetch nativos).
