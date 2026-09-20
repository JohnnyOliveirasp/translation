# live-translate

Tradução simultânea ao vivo — ver `../SPEC-traducao-simultanea-gemini.md` e `../PLANEJAMENTO.md`.

## Fase 1 — CLI de validação (concluída em 04/08/2026)

```bash
node --env-file=../.env.local scripts/fase1-cli.js test-audio/orador-en.wav --target pt-BR
```

### ✅ Resposta do GATE §4.3 (aceite da fase)

Testado no modelo `gemini-3.5-live-translate-preview` em 04/08/2026:

| Flag | Resultado |
|---|---|
| `contextWindowCompression` (slidingWindow 4000 / trigger 100000) | **ACEITA** — setup confirmado pelo servidor com a flag presente |
| `sessionResumption` | **FUNCIONA** — servidor enviou 21 `sessionResumptionUpdate` (handles) durante sessão de ~1 min |

**Conclusão: caminho principal da spec confirmado. Plano B (§4.4, reconexão sobreposta) descartado.**

### Medições

- Latência do 1º áudio traduzido: **3,23s / 3,56s** (duas execuções) — compatível com a mediana de ~2,95s da spec + overhead
- Tradução EN→pt-BR fiel (transcrições de entrada/saída conferidas)
- `goAway`: 0 em sessão curta (esperado; tratamento será validado na Fase 5 com 30 min)

### Comportamento descoberto (importante para a Fase 3)

O modelo transmite áudio de saída **continuamente**, incluindo silêncio — 22,3s de
entrada geraram 46,5s de stream de saída. Para o `TranslationBridge` isso é bom
(fluxo constante para publicar na sala), mas qualquer lógica de "fim de fala" deve
usar `turnComplete`/transcrição, nunca "parou de chegar áudio".

### Notas de ambiente

- Node 25.9 funcionou normalmente com `@google/genai@2.13.0` (pinado)
- npm `allow-scripts` bloqueou os install scripts (`protobufjs` postinstall) — sem efeito em runtime
- Áudio de teste gerado com voz TTS do Windows: `scripts/gen-test-audio.ps1`
