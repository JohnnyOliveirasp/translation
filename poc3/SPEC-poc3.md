# POC3 — Detecção Automática de Louvor × Pregação (Auto-Mute)

> Base: **v1 em produção** (LiveKit + Gemini Live). O v1 NÃO é alterado até a POC provar valor.
> Origem: recomendações do ChatGPT em `_bugs/church_live_translation_recommendations.md`,
> revisadas e adaptadas após pesquisa própria (13/08/2026). POC2 (cascata) segue em standby.

---

## 1. O problema real (vivido no culto de 09/08)

- O operador precisa MUTAR manualmente no louvor e DESMUTAR na pregação — atenção constante o culto inteiro.
- Descoberta de produto do 1º culto: ouvintes testaram durante o louvor (mute ligado), ouviram silêncio e concluíram "não funciona".
- Objetivo comercial: **"No operator required during the service"** — nenhum concorrente pesquisado
  (Wordly, Sunflower AI, OneAccord, Maestra, Boostlingo, spf.io, stenomatic) anuncia isso hoje.

**POC3 = uma camada de classificação de áudio que liga/desliga a tradução sozinha**, com o operador
apenas supervisionando (AUTO / FORCE ON / FORCE OFF).

---

## 2. O que a análise do documento do ChatGPT concluiu

### ✅ Correto e aproveitado
- Detecção automática é a melhoria de maior valor operacional — confirmado pela dor real do culto.
- Princípios de engenharia: captura contínua, buffer rolante, histerese/debounce, máquina de estados,
  override do operador, scores de confiança para debug, dataset real da igreja, abstração do classificador,
  NÃO treinar modelo próprio antes de validar com modelo genérico.
- Latência: overhead do classificador deve ficar < 200–500ms e não degradar os ~2s atuais.

### ❌ Errado ou desatualizado para o NOSSO v1 (correções)
1. **O documento assume pipeline de legendas com cascata STT→tradução** (isso é a POC2, que está em standby).
   O v1 é speech-to-speech (voz traduzida + legendas). Adaptação: o classificador não "encaminha áudio
   para STT" — ele **controla o MUTE já existente** (A4: mute sincronizado + aviso de louvor no idioma
   do ouvinte). Reusa 100% do encanamento validado em produção.
2. **"Church Context Engine" (Fase 2 dele) NÃO se aplica ao v1**: o modelo Gemini Live translate S2S
   não aceita prompt/glossário por design — foi exatamente por isso que a POC2 nasceu. Contexto/glossário
   pertence ao futuro da POC2, não à POC3.
3. **inaSpeechSegmenter descartado para tempo real**: é Python, orientado a ARQUIVO (batch), sem API de
   streaming. Uso correto dele: **rotular offline as gravações dos cultos** para montar o dataset (é MIT,
   detecta speech/music/noise — bom rotulador automático de 1ª passada).
4. **YAMNet sim, mas na embalagem moderna**: MediaPipe Tasks Audio (`@mediapipe/tasks-audio`, WASM),
   roda **no navegador** — direto na página do broadcast. Zero custo de servidor, zero mudança no bridge.
5. **Descoberta crítica da pesquisa — fraqueza conhecida do YAMNet**: ele raramente emite o rótulo
   "Singing"; canto a capela tende a classificar como **Speech** (pior caso possível para nós).
   Consequência: a regra de decisão deve se apoiar no score de **Music** (banda/instrumentos presentes),
   não em distinguir voz falada × voz cantada. No nosso culto o louvor tem banda → Music alto → OK.
   Caso de risco real: canto a capela solo → pode parecer Speech → é para isso que existe o FORCE OFF.
6. **Regra do documento tem conflito**: `music > threshold → OFF` desligaria a tradução quando o pastor
   fala sobre piano suave. Correção: **prioridade da fala** — Speech alto liga a tradução MESMO com
   Music moderado; só Music alto + Speech baixo desliga.
7. **Complemento não citado no documento**: Silero VAD tem port de navegador maduro
   (`@ricky0123/vad-web`, ONNX Runtime Web). Híbrido possível se o YAMNet sozinho oscilar:
   VAD responde "tem voz humana?" e YAMNet responde "tem música?" → fala = voz SIM + música BAIXA.

---

## 3. Arquitetura da POC3

```text
Página /broadcast (navegador do operador)
    │
    ├── captura do mic (já existe: mesa USB-C ou lapela, failover já pronto)
    │
    ├── AudioContext ──► MediaPipe YAMNet (WASM, ~1 inferência/s, janela 0.975s)
    │                         │
    │                         ▼
    │                   scores {speech, music, singing, applause, silence}
    │                         │
    │                         ▼
    │                   MÁQUINA DE ESTADOS (histerese)
    │                   UNKNOWN → SPEECH → TRANSITION → MUSIC
    │                   modos: AUTO | FORCE_ON | FORCE_OFF
    │                         │
    │                         ▼
    │              chama o MUTE JÁ EXISTENTE (track.mute/unmute + set-mute API A4)
    │              → aviso de louvor na tela dos ouvintes, pausa coletiva (tudo já validado)
    │
    └── painel debug: scores ao vivo + estado + decisão (só para o operador)
```

Regra de decisão (ponto de partida — calibrar com dataset real):

```text
LIGAR  (→ SPEECH): speech ≥ 0.5 sustentado por 2 janelas (~1s)   [prioridade da fala]
DESLIGAR (→ MUSIC): music ≥ 0.5 E speech < 0.3 sustentado por 4 janelas (~2s)
Applause/Silence/Noise: mantém o estado atual (não decide sozinho)
```

Assimetria proposital: liga rápido (perder pregação é pior), desliga devagar (falso mute é pior que
traduzir 2s de música).

### Perda de palavras na transição (buffer rolante)
Na fase 1, ao religar após o louvor perde-se ~1s de fala (tempo de confirmação) — igual ou melhor
que um operador humano. O buffer rolante de 1s para NÃO perder nada exige mover o gate para o bridge
(servidor), que já tem infraestrutura de buffer (goAway). Isso é a **Fase 3**, só se a POC provar valor.

---

## 4. Fases e gates

### Fase 0 — Dataset real da igreja (pré-requisito, custo zero)
- Gravar a saída da mesa no próximo culto (celular/laptop gravando o feed, ou OBS).
- Cortar e rotular segmentos: `speech_clean`, `speech_with_piano`, `worship_band`, `worship_solo`,
  `prayer`, `announcement`, `applause`, `crowd`, `silence`, `transition_music_to_speech`,
  `transition_speech_to_music`.
- 1ª passada de rótulos com inaSpeechSegmenter offline (Python, venv isolado), revisão manual.
- **Gate G0**: ≥ 30 min rotulados cobrindo todas as categorias, incluindo ≥ 5 transições reais.

### Fase 1 — Protótipo do classificador no navegador (sem tocar no v1)
- Página standalone em `poc3/` que roda MediaPipe YAMNet (WASM) sobre: (a) os WAVs do dataset,
  (b) o microfone ao vivo.
- Máquina de estados + histerese + log CSV (timestamp, scores, estado, decisão).
- Interface `AudioClassifier` abstrata (trocar YAMNet por ONNX/custom sem reescrever o resto).
- **Gate G1**: nas gravações reais, decisão ON/OFF correta ≥ 95% do tempo; transição música→fala ≤ 2s;
  fala→música ≤ 4s; zero "falso mute" durante pregação contínua.
- **Gate G2 (hardware)**: CPU/bateria aceitáveis no aparelho real do broadcast (iPad? laptop?).
  ATENÇÃO: WASM no Safari/iPad precisa de teste dedicado; MediaPipe audio tem issues abertas de
  streaming — fallback: TFJS YAMNet ou onnxruntime-web, ou classificador no bridge (Node/ARM).

### Fase 2 — Integração com o broadcast (cópia do v1 em poc3/, produção intocada)
- Botões `[AUTO] [FORCE ON] [FORCE OFF]` na tela do operador; AUTO controla o mute A4 existente.
- Painel debug retrátil com scores ao vivo.
- Ensaio ao vivo obrigatório antes de qualquer culto (lição do bug do A5: mudança sem ensaio = incidente).
- **Gate G3**: um culto inteiro em AUTO com ≤ 2 intervenções manuais.

### Fase 3 — (futuro, só após G3) Gate no bridge com buffer rolante
- Move a decisão para o servidor, buffer de 1s, zero perda de palavras na transição.

### Fora de escopo da POC3
- Glossário/contexto (impossível no S2S do v1 — pertence à POC2).
- Scripture detection nas legendas (roadmap, depois).
- Pós-culto (transcrição/resumo), pricing.

---

## 5. Dependências e segurança

- `@mediapipe/tasks-audio` (npm) + modelo YAMNet `.tflite` — **auto-hospedar** o WASM e o modelo
  (nada de CDN em produção). Instalação segue o protocolo do CLAUDE.md: cooldown 7 dias, osv/socket,
  dry-run, versão pinada, OK explícito do Johnny.
- Python + inaSpeechSegmenter: só ferramenta offline de rotulagem, em venv isolado, nunca em produção.
- Nenhuma mudança no servidor Hetzner até a Fase 2.
