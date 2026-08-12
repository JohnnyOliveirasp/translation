# Tradução Simultânea EN→PT-BR e EN→ES para Pregações ao Vivo: Guia Técnico de Modelos, APIs e Arquitetura (2026)

## TL;DR
- **Para o "entendimento" teológico, a arquitetura em cascata (ASR → LLM de tradução com prompt/glossário → legendas/TTS) é superior aos modelos speech-to-speech "puros".** Os modelos S2S dedicados de tradução ao vivo (Gemini 3.5 Live Translate, gpt-realtime-translate, SeamlessStreaming) **NÃO aceitam prompt de sistema nem glossário** — exatamente a limitação que o Johnny sente hoje. O diferencial de "entendimento" só existe quando um LLM de texto faz o estágio de tradução com contexto injetado.
- **Recomendação central: não migrar para outro S2S "caixa-preta"; migrar para uma cascata híbrida** — Whisper/Voxtral/Soniox (ASR) → um LLM forte (Gemini 3 Flash, GPT ou um LLM open source como Qwen/Gemma/Sabiá) com prompt teológico + glossário Almeida/NVI/Reina-Valera → legendas no navegador (+ TTS opcional). Isso dá controle total sobre a terminologia cristã e custa frações de centavo por minuto por idioma.
- **Custo:** uma cascata com Gemini/GPT no estágio de texto custa da ordem de US$5–30/mês para os 5 idiomas juntos no uso semanal do Johnny; self-hosting numa GPU de 24 GB (RTX 3090/4090) roda o pipeline inteiro por ~US$250/mês (RunPod 24/7) ou por centavos por culto sob demanda. O servidor Hetzner atual do Johnny é CPU-only e não serve para os modelos pesados — seria preciso a linha GEX (a partir de ~€184/mês).

## Key Findings

**1. Os modelos S2S de tradução ao vivo são deliberadamente "burros" (translation-only).** Tanto o `gpt-realtime-translate` (OpenAI, lançado em 7 de maio de 2026) quanto o Gemini 3.5 Live Translate (Google, 9 de junho de 2026) foram treinados para NÃO seguir instruções — justamente para não "responderem" em vez de traduzir. O OpenAI Cookbook ("Build Live Translation Apps with gpt-realtime-translate", developers.openai.com) afirma textualmente: *"The model does not currently support custom prompts, glossaries, or pronunciation guides"* e adverte que *"the model can sometimes substitute incorrect names or entities while translating."* O Gemini 3.5 Live Translate, na modalidade de tradução, também não suporta system prompts, tools nem function calling. **Nenhum dos dois resolve o problema do Johnny de tradução teológica consistente** — eles podem trocar nomes/entidades e não têm como ser "ensinados" sobre Almeida/NVI/Reina-Valera.

**2. O "entendimento" vem do estágio de LLM de texto com contexto injetável.** Só uma arquitetura em cascata permite: (a) system prompt teológico, (b) glossário customizado (grace→graça, justification→justificação, atonement→expiação, born again→nascido de novo), (c) RAG com corpora bíblicos paralelos, (d) fine-tuning. Google Cloud/DeepL/Azure/Amazon Translate oferecem glossários customizados nativos; LLMs (Gemini, GPT, Qwen, Gemma, Sabiá) aceitam prompt+glossário via contexto. **Exceção notável entre os S2S: o Amazon Nova Sonic aceita RAG e prompt (ver abaixo).**

**3. Qualidade EN→PT/ES:** PT e ES são idiomas de altíssimo recurso — praticamente todos os modelos de topo (GPT, Gemini, DeepL, Qwen, Gemma) atingem COMET >0,87 em FLORES-200. Modelos open source como GemmaX2-9B (≈34/37 BLEU, COMET ~0,89 em FLORES-200) e a família Tower/TowerInstruct são referências em tradução multilíngue. Para PT-BR especificamente, a família Sabiá (Maritaca AI) é especializada, mas é comercial e focada em texto (não em fala).

**4. Latência aceitável para sermão:** a tradução simultânea de sermão tolera 2–5 segundos de atraso (não é conversa bidirecional). Isso favorece a cascata (2–4s) e permite priorizar qualidade contextual sobre latência mínima.

## Details

### A) APIs comerciais de fala em tempo real

**Google Gemini Live API / Gemini 3.5 Live Translate.** O modelo `gemini-3.5-live-translate-preview` faz S2S em 70+ idiomas via WebSocket. O blog oficial do Google (blog.google, 9 de junho de 2026, PMs Anuda Weerasinghe e Tony Lu) descreve: *"Gemini 3.5 Live Translate is our latest audio model, delivering near real-time speech-to-speech translation in over 70 languages"*, com integrações Agora, Fishjam, LiveKit e Pipecat. Custo do modelo Live: cerca de US$0,0368/min de áudio (25 tokens/s; input US$3/1M, output US$12/1M de tokens de áudio no tier Flash Native Audio) — a análise da Vectrel (jun 2026) resume: *"At roughly two cents per minute via the Live API, live translation has shifted from a specialty cost to a programmable feature."* **Limitação crítica: o modo de tradução não aceita instruções/tools/glossário.** O Gemini Live API "de agente" (native audio) SIM aceita system prompt — mas aí é um agente conversacional, não um tradutor otimizado. Áudio: PCM 16-bit 16kHz in, 24kHz out, chunks de 100ms.

**OpenAI Realtime API.** Três modelos relevantes (lançados 7 de maio de 2026): `gpt-realtime-2` (agente de voz, aceita instruções, reasoning "GPT-5-class", 128K de contexto), `gpt-realtime-translate` (tradução S2S — a doc da OpenAI confirma *"the model currently supports over 70 input languages and 13 output languages"* e usa **dynamic voice adaptation**, sem seleção de voz; treinado em áudio de intérpretes profissionais; ~US$0,034/min; SEM prompt/glossário) e `gpt-realtime-whisper` (STT streaming). O `gpt-realtime` geral custa US$32/1M input e US$64/1M output de tokens de áudio (~US$0,05/min conversacional). Também disponível via Azure OpenAI (`gpt-realtime-translate`, versão 2026-05-07, precificado por hora de áudio).

**Amazon Nova Sonic / Nova 2 Sonic.** Nova 2 Sonic (GA em 2 de dezembro de 2025) é S2S com **sete idiomas incluindo português e espanhol** — a doc AWS lista vozes expressivas em inglês (US/UK/Índia/Austrália), francês, italiano, alemão, espanhol, português e hindi, com *"Polyglot voices that can speak any of the supported languages"* — vozes poliglotas e contexto de 1M tokens. Preço (Ry Walker Research): *"Nova 2 Sonic costs $3 per million speech input tokens and $12 per million speech output tokens... roughly $0.015/min estimated — approximately 80% cheaper than OpenAI's GPT-4o Realtime."* **Diferencial decisivo:** o AWS News Blog confirma que o Nova Sonic *"supports function calling, agentic workflows, and knowledge grounding with enterprise data"* (via Amazon Bedrock Knowledge Bases) — ou seja, é o **único S2S da lista que aceita RAG e contexto**, o que o torna o candidato S2S mais interessante para tradução teológica com áudio. Suporta LiveKit/Pipecat.

**Microsoft Azure Speech Translation.** Cascata gerenciada (STT→MT→TTS) com **phrase lists e Custom Translator (dicionários e treino customizado, incluindo phrase-fix/sent-fix determinístico)** — forte para terminologia. Também hospeda `gpt-realtime-translate` via Foundry. Suporta pt-BR e es. Bom para injeção de terminologia determinística.

**DeepL Voice API** (GA fevereiro de 2026, WebSocket): transcrição+tradução em tempo real, **suporta glossários e "spoken terms"**, com o limite documentado de **máximo 5 alvos de tradução por sessão** (para mais alvos, abrir sessões concorrentes sobre o mesmo áudio) e conexão máxima de 1 hora. Qualidade europeia excelente, mas cara (um desenvolvedor citado pela eesel AI mediu ~US$4,05/hora, vs "under $0.01/hour for Gemini Flash") e é enterprise/contato comercial. Suporta pt-BR e es.

**ElevenLabs.** Scribe v2 Realtime (STT, ~150ms, 90+ idiomas incl. pt e es), dubbing/STS, TTS Flash v2.5 (~75ms, 32 idiomas). É um bloco de ASR+TTS de alta qualidade para cascata, não um tradutor contextual por si só. Suporta pronunciation dictionaries.

**Soniox.** Um API que faz STT + tradução any-to-any + diarização em 60+ idiomas em streaming, ~US$0,12/hora (streaming) / US$0,10/hora (async), com "domain hints/custom terms". Reporta WER de 6,5% em inglês (vs 11–12% Speechmatics, 13–14% Azure). Muito barato e permite viés de contexto — candidato forte para o estágio de ASR+tradução da cascata.

**Deepgram, Speechmatics, Gladia, AssemblyAI.** ASR streaming de baixa latência. Deepgram Flux: <300ms end-of-turn, ~US$0,0092/min, vocabulários customizados, bom em pt/es. AssemblyAI Universal-3 Pro: P50 ~150ms, P90 ~240ms. Speechmatics: só transcrição (tradução requer serviço à parte). Todos servem como camada de ASR de uma cascata.

**Mistral Voxtral.** Open-weights (Apache 2.0). Voxtral Small (24,3B) e Mini (4,7B) para transcrição+tradução; **Voxtral Realtime** (4B, streaming, latência tão baixa quanto 200ms, 13 idiomas incl. pt e es, US$0,006/min via API ou self-hosted). Em tradução, a Mistral reporta que o Voxtral Small supera Gemini 2.5 Flash e GPT-4o-mini Audio em vários pares incl. Es↔En e De↔En. Excelente candidato open source.

**Alibaba Qwen3-Omni.** End-to-end omni-modal open source, fala em tempo real, **customizável via system prompts** (ao contrário dos S2S dedicados), reportado como SOTA em 22/36 benchmarks de áudio e open-source SOTA em 32/36. Roda self-hosted (via vLLM). Forte em multilíngue.

### B) Modelos open source / self-hosted

**Whisper e variantes.** Whisper large-v3 (~3–3,1 GB VRAM FP16, 99 idiomas, Apache 2.0) é o ASR de referência. **faster-whisper** (CTranslate2) é 3–4x mais rápido e roda em ~6 GB (ou ~2–3 GB em INT8). **large-v3-turbo** é ~8x mais rápido com perda mínima — bom para streaming de baixa latência. Whisper não é streaming nativo (janela de 30s) — usar whisper-streaming/WhisperX com chunks sobrepostos para latência de 1–5s. RTX 3060 12GB é o mínimo para 1 stream em tempo real; RTX 4090 faz 10+ streams.

**Meta SeamlessM4T v2 / SeamlessStreaming.** SeamlessStreaming é o primeiro modelo massivamente multilíngue de tradução simultânea real (S2S/S2T), ~2s de latência via política EMMA, 101 idiomas de entrada / 36 de saída de fala. Em avaliação independente (Audio-NTREX-L), Pt→En pontuou 3,57s de latência / 76,1 xCOMET, e Es→En 5,59s / 88,6 xCOMET. **Licença não-comercial (research-only)** — atenção para uso ministerial. **Não aceita glossário/prompt** (modelo dedicado).

**Kyutai Hibiki.** S2S simultâneo de alta fidelidade, on-device, CC-BY-4.0, mas **só faz FR→EN** hoje — inútil para o caso do Johnny.

**NVIDIA Canary/Parakeet (NeMo).** Canary-1B (4 idiomas, CC-BY-NC), Parakeet (inglês, CC-BY-4.0) — rápidos em hardware NVIDIA mas cobertura de idiomas limitada.

**LLMs de texto para o estágio de tradução:** Qwen (multilíngue forte), Gemma/GemmaX2 (SOTA open em tradução FLORES), Llama, Mistral, Command R, e **Sabiá/Maritaca** (especialista pt-BR — Sabiá-4/Sabiazinho-4 com continued pretraining em corpora brasileiros e contexto de 128K —, mas comercial). Um LLM 7–14B quantizado (Q4) roda em ~6–10 GB de VRAM.

### C) Arquiteturas

**(a) S2S end-to-end (Gemini Live Translate, gpt-realtime-translate, Nova Sonic, SeamlessStreaming):** menor latência, voz natural preservada, MAS (exceto Nova Sonic) sem injeção de contexto → **não resolve o "entendimento" teológico**. Output é áudio efêmero, não editável.

**(b) Cascata ASR → LLM (tradução com contexto) → TTS:** melhor "entendimento" (prompt+glossário+RAG), latência 2–4s, mais peças para gerenciar. **É a recomendada para o caso teológico.**

**(c) ASR → LLM → legendas na tela (sem TTS):** menor custo e complexidade, latência baixa, ouvintes leem no celular. Para sermão com ouvintes conectados pelo navegador, legendas multilíngues são frequentemente MAIS úteis que áudio (não competem com a voz do pregador). **Recomendo começar por aqui.**

### D) Latência
- S2S dedicados: Gemini 3.5 Live Translate e gpt-realtime-translate "poucos segundos"/sub-segundo; SeamlessStreaming ~2s; Hibiki-Zero ~3,3s (Fr/Pt→En).
- Cascata: ASR streaming (150–300ms) + LLM (300ms–1s) + TTS (75–500ms) = ~2–4s típico. (A Forasoft mediu, por ex., a "Live Interpreter" bundle de um fornecedor em 0,78s end-to-end.)
- Para sermão (unidirecional), 2–5s é perfeitamente aceitável; priorize qualidade contextual.

### E) Injeção de contexto / "entendimento" (o ponto central)
| Capacidade | Suporta contexto/glossário? |
|---|---|
| gpt-realtime-translate | **NÃO** (sem prompt/glossário — doc oficial) |
| Gemini 3.5 Live Translate | **NÃO** em modo tradução |
| Gemini Live "agente" (native audio) | SIM (system prompt) |
| Amazon Nova 2 Sonic | **SIM** (RAG/knowledge grounding + function calling + prompt) |
| Azure Speech/Custom Translator | SIM (phrase list, dicionário, treino) |
| DeepL Voice | SIM (glossário, spoken terms) |
| Google/Amazon Translate | SIM (custom glossary) |
| Qwen3-Omni | SIM (system prompt) |
| Cascata com LLM de texto | **SIM** (prompt + glossário + RAG + fine-tune) |

**Recursos bíblicos para RAG/fine-tune:** o eBible Corpus (BibleNLP, 1009 traduções, 833 idiomas — arXiv 2304.09919) e o JHU/Parallel Bible Corpus fornecem versículos paralelos EN-PT-ES prontos. A Partnership for Applied Biblical NLP (pabnlp.org) mantém recursos e listas curadas. Com isso, dá para construir um glossário/memória de tradução com a terminologia consagrada de Almeida, NVI e Reina-Valera e, se necessário, um índice RAG que devolve o texto oficial de cada versículo citado.

### F) Tabela comparativa dos principais candidatos
| Modelo/API | Tipo | Arquitetura | pt-BR / es | Latência típica | Contexto/glossário | Custo | Self-hosted |
|---|---|---|---|---|---|---|---|
| Gemini 3.5 Live Translate | Comercial | S2S | Sim/Sim | poucos seg. | **Não** (modo tradução) | ~US$0,037/min | Não |
| gpt-realtime-translate | Comercial | S2S | Sim/Sim | sub-seg. | **Não** | ~US$0,034/min | Não |
| Amazon Nova 2 Sonic | Comercial | S2S | Sim/Sim | baixa | **Sim** (RAG+prompt) | ~US$0,015/min | Não |
| Azure Speech Translation | Comercial | Cascata | Sim/Sim | 1–3s | Sim (phrase-fix) | por min/hora | Container possível |
| DeepL Voice API | Comercial | Cascata (STT+MT) | Sim/Sim | baixa | Sim (glossário) | ~US$4/h | Não |
| Soniox | Comercial | STT+tradução | Sim/Sim | ~150–300ms | Sim (hints) | ~US$0,12/h | Não |
| Mistral Voxtral Realtime | Open (Apache 2.0) | STT/tradução | Sim/Sim | ~200ms | via pipeline | US$0,006/min ou grátis | **Sim** |
| Qwen3-Omni | Open (Apache 2.0) | S2S omni | Sim/Sim | baixa | **Sim** (system prompt) | grátis (self-host) | **Sim** |
| SeamlessStreaming | Open (não-comercial) | S2S simultâneo | Sim/Sim | ~2s | **Não** | grátis | **Sim** |
| faster-whisper large-v3 (ASR) | Open (MIT/Apache) | ASR | Sim/Sim | 1–5s (chunk) | context prompt | grátis | **Sim** |
| Cascata Whisper→LLM→legenda | Open+comercial | Cascata | Sim/Sim | 2–4s | **Sim** (total) | US$5–30/mês | **Sim** |

### G) Custo mensal estimado (2 h/semana ≈ 8–10 h/mês, 5 idiomas)
- **S2S comercial por idioma (uma sessão por idioma):** gpt-realtime-translate ~US$0,034/min → 5 idiomas × 600 min = ~US$102/mês. Gemini Live ~US$0,037/min → similar. Nova 2 Sonic ~US$0,015/min → ~US$45/mês.
- **Cascata com LLM de texto (recomendada):** ASR (Soniox ~US$0,12/h ou Whisper self-hosted grátis) + tradução via Gemini 3 Flash (centavos por hora, pois texto é ordens de magnitude mais barato que áudio) + legendas = **US$5–30/mês para os 5 idiomas juntos**.
- **Self-hosting completo:** RunPod RTX 4090 24/7 ~US$248/mês; sob demanda apenas durante os cultos (~US$0,34/h Community) ~US$3–5/mês; Vast.ai marketplace ainda mais barato (RTX 4090 a partir de ~US$0,13–0,29/h). Hetzner GEX44 (RTX 4000 Ada, 20 GB) ~€184/mês (frequentemente esgotado), GEX130 (RTX 6000 Ada, 48 GB) ~€838/mês, GEX131 (RTX PRO 6000 Blackwell, 96 GB) ~€889/US$989/mês.

**Requisito de hardware do pipeline completo (1 stream → 5 idiomas):** faster-whisper large-v3 (~3–4 GB) roda **uma vez**; o LLM de tradução (7–14B Q4, ~6–10 GB) e o TTS fazem fan-out para os 5 idiomas. TTS Piper roda em CPU (~0 GB GPU); XTTS ~3–4 GB por worker. **Total realista: ~16–24 GB — uma única RTX 3090/4090 (24 GB) resolve.** O servidor Hetzner atual do Johnny (padrão CPU-only, sem GPU) **não roda** os modelos pesados em tempo real — Whisper large-v3 em CPU roda a ~2,5x mais lento que o tempo real, acumulando atraso.

### H) Multi-idioma simultâneo
- DeepL Voice: até 5 alvos por sessão nativamente.
- Gemini Live / gpt-realtime-translate: **uma sessão por idioma-alvo** (a POC atual do Johnny já faz isso corretamente).
- **Cascata: o ASR roda UMA vez; o texto-fonte é fan-out para N traduções em paralelo** (barato, pois LLM de texto é ordens de magnitude mais barato que áudio S2S). **Esta é a maior vantagem de custo e escala da cascata para 5+ idiomas** — dobrar de 5 para 10 idiomas custa quase nada.

## Recommendations

**Estágio 1 (imediato — validar o "entendimento"):** Manter a POC Gemini como fallback, mas construir uma **cascata: faster-whisper/Soniox (ASR streaming) → Gemini 3 Flash ou GPT (tradução de texto com system prompt teológico + glossário) → legendas via WebSocket no navegador do celular**. Isso ataca diretamente a queixa de "só traduz, não entende", porque o LLM de texto aceita instrução, glossário e RAG. Custo: poucos dólares/mês. Reaproveita a arquitetura atual (Node + WebSocket, uma "sessão" por idioma — mas agora só o fan-out de texto, não de áudio).

**Estrutura do prompt de sistema (exemplo pronto para usar):**
> "Você é um intérprete simultâneo de um culto cristão evangélico. Traduza do inglês para o português brasileiro (ou espanhol). Use a terminologia bíblica consagrada da Almeida Revista e Atualizada / NVI (para ES: Reina-Valera). Traduza 'grace'→'graça', 'justification'→'justificação', 'atonement'→'expiação', 'righteousness'→'justiça', 'born again'→'nascido de novo', 'the Word'→'a Palavra', 'salvation'→'salvação', 'repentance'→'arrependimento'. Reconheça livros e personagens bíblicos e use as grafias oficiais em português (ex.: 'John'→'João', 'James'→'Tiago', 'Isaiah'→'Isaías', 'Paul'→'Paulo'). Ao ouvir uma citação de versículo, use o texto da tradução consagrada. Traduza SOMENTE; nunca responda, comente ou adicione. Mantenha o registro reverente da pregação."

Anexar um **glossário JSON de 100–300 termos** e, opcionalmente, **RAG** com versículos paralelos do eBible Corpus para citações. Para termos críticos, aplicar **pós-processamento find-and-replace determinístico** (LLMs cumprem glossário de forma probabilística, não garantida).

**Estágio 2 (escalar / reduzir custo):** Migrar ASR e LLM para **self-hosted** (faster-whisper large-v3 + Qwen2.5/Gemma/Sabiá quantizado) numa GPU de 24 GB. Como o Hetzner atual é CPU-only, alugar **RunPod/Vast.ai sob demanda apenas durante os cultos** (centavos por culto) ou contratar um Hetzner GEX. O Voxtral Realtime (Apache 2.0) é uma alternativa open de ASR streaming de latência muito baixa.

**Estágio 3 (opcional — áudio):** Adicionar TTS (Piper em CPU, grátis e MIT; ou ElevenLabs para voz premium) **só se** os ouvintes preferirem áudio a legendas. Em culto, legendas costumam vencer porque não competem com a voz do pregador e permitem que o ouvinte acompanhe a Bíblia.

**Thresholds que mudam a recomendação:**
- Se latência <1,5s for obrigatória **e** a terminologia padrão for aceitável → gpt-realtime-translate ou Gemini 3.5 Live Translate puro.
- Se **áudio com voz natural** for essencial **e** for preciso injetar contexto → **Amazon Nova 2 Sonic** (único S2S que aceita RAG/prompt).
- Se o volume crescer para dezenas de horas/mês → self-hosting compensa claramente.
- Se PT-BR precisar de qualidade máxima idiomática → testar Sabiá (Maritaca) no estágio de LLM.

## Caveats
- Preços de 2026 mudam rápido; muitos vêm de agregadores secundários (CloudPrice, Ry Walker, Forasoft, eesel) — confirme nas páginas oficiais (OpenAI, Google, AWS Bedrock, Hetzner, Mistral) antes de decidir.
- **SeamlessStreaming e Canary têm licenças não-comerciais (research-only)** — verifique se o uso ministerial se qualifica antes de adotar.
- **XTTS-v2 é não-comercial** (a Coqui encerrou em jan/2024, sem licença comercial à venda); para TTS comercial use Piper (MIT) ou StyleTTS/F5-TTS.
- LLMs cumprem glossário de forma **probabilística**, não determinística — para termos críticos use pós-processamento ou glossário determinístico (Azure phrase-fix/sent-fix).
- "Gemini 3.5 Live Translate" e "gpt-realtime-translate" são recentes (maio–junho de 2026) e em preview/GA inicial; a inconsistência de voz e a detecção de idioma ainda são limitações documentadas nos model cards.
- A qualidade de **todos** os modelos degrada com ruído de fundo, sotaque e áudio de microfone de lapela distante — invista em captura de áudio limpa; é o fator isolado que mais afeta o resultado no cenário do Johnny (lapela perto do pregador, sem mesa de som).


---


Ranking por LATÊNCIA (mais rápido → mais lento)
#	Opção	Latência	Tipo
1	gpt-realtime-translate	<1s	S2S
2	Voxtral Realtime	~200ms (ASR)	Open
3	Amazon Nova 2 Sonic	~500ms–1s	S2S
4	Gemini 3.5 Live Translate	1–2s	S2S
5	Soniox / Deepgram (ASR)	150–300ms	Componente
6	SeamlessStreaming	~2s	Open
7	Cascata (ASR→LLM→legenda)	2–4s	Híbrido
8	Cascata com TTS	3–5s	Híbrido
9	Whisper self-hosted em CPU	5s+ e acumula	Inviável
Ranking por EFICIÊNCIA (custo + qualidade teológica + escala p/ 5 idiomas)

1º — Cascata ASR → LLM → legendas. US$5–30/mês pelos 5 idiomas. Único caminho com controle total de terminologia. O ASR roda uma vez e o texto é distribuído para N idiomas — dobrar de 5 para 10 idiomas quase não muda o custo.

2º — Amazon Nova 2 Sonic. ~US$0,015/min, aceita RAG e prompt. Melhor S2S se você quiser áudio de verdade. ~US$45/mês.

3º — Gemini 3.5 Live Translate (seu setup atual). Fácil, boa voz, mas ~US$100/mês nos 5 idiomas e não aceita glossário — é exatamente a limitação que te incomoda hoje.

4º — gpt-realtime-translate. Mais rápido de todos, mesmo custo do Gemini, mesma limitação: sem prompt, sem glossário, e pode trocar nomes próprios.

5º — Self-host completo em GPU. Custo quase zero por culto (alugar sob demanda), mas exige montar e manter tudo. Seu Hetzner atual é CPU-only e não dá conta.

Último — DeepL Voice. ~US$4/hora e enterprise. Caro demais para o volume.

O ponto que decide: os 3 mais rápidos são justamente os que não entendem contexto. Como sermão tolera 2–5s de atraso, você tem espaço de sobra para trocar 2 segundos por tradução teológica correta. A cascata perde na latência e ganha em tudo o que importa no seu caso.

Então o que conseguimos passar contexto sobre que é um culto e se precisar fazer referências bíblicas o melhor é o cascata seria isto

Exatamente isso.

Cascata = você controla o estágio de tradução com um LLM de texto, e ali você pode enfiar tudo:

system prompt explicando que é um culto evangélico, tom reverente
glossário fixo (grace→graça, atonement→expiação, born again→nascido de novo)
nomes bíblicos em português (John→João, James→Tiago)
RAG com o texto de Almeida/NVI/Reina-Valera para quando o pastor citar um versículo
pós-processamento determinístico para os termos que não podem errar

Nos S2S "puros" (Gemini Live Translate, gpt-realtime-translate) nada disso existe — a documentação da OpenAI diz literalmente que o modelo não aceita prompts customizados nem glossários, e avisa que ele às vezes troca nomes e entidades. Num sermão isso é grave: "James" vira "James" em vez de "Tiago".

Uma exceção vale registrar: o Amazon Nova 2 Sonic é S2S (áudio de verdade, voz natural) e aceita prompt e knowledge grounding via Bedrock. É o único que junta as duas coisas. Se áudio for essencial em vez de legenda, é por ali.

Mas para começar, a cascata com legendas é o caminho: mais barato, mais controlável, e num culto a legenda no celular funciona melhor que áudio competindo com a voz do pregador.

E 1 hora ou 10 horas de culto simultâneo custa 30 US seria isto ?

Calculou custos de transcrição e tradução para serviços simultâneos
Calculou custos de transcrição e tradução para serviços simultâneos

Não — o US$30 era o teto conservador do mês inteiro, não o piso. A conta real é menor. Vamos separar:

Cascata (ASR + LLM texto + legendas), 5 idiomas:

ASR roda uma vez só — Soniox ~US$0,12/hora
Um sermão de 1h ≈ 8.000 palavras ≈ 10 mil tokens. Traduzir isso 5 vezes com um LLM Flash custa centavos
1 hora ≈ US$0,20–0,50 total (os 5 idiomas juntos)
10 horas ≈ US$2–5

O US$5–30/mês incluía margem para TTS, retries e picos. Se for só legenda, fica na faixa baixa.

Já o S2S (Gemini/OpenAI), para comparar:

~US$0,035/min × 60 = ~US$2/hora por idioma
5 idiomas = US$10/hora
10 horas = US$100/mês

A diferença é de ~20x, e a razão é estrutural: no S2S você paga áudio 5 vezes; na cascata você paga áudio 1 vez e texto 5 vezes — e texto é ordens de magnitude mais barato.

Ressalva: são estimativas com preços de tabela. Confirme nas páginas oficiais antes de fechar conta, e rode um culto real medindo o consumo — é o único número que vale.


