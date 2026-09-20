# MAPA DO PROJETO — LiveTranslate

*Reorganizado em 20/09/2026. Se você é um agente começando agora, leia este arquivo primeiro e depois `livetranslate/docs/HANDOFF.md`.*

---

## A regra única

> **Só existe uma pasta ativa: `livetranslate/`.**
> É o produto no ar em https://livetranslate.church. Todo o resto está em `OLD/` como backup e aprendizado — **não se mexe, não se deploya, não se usa como referência de "como está hoje".**

---

## Estrutura

```
TradutorIgreja/
├── livetranslate/        ← ÚNICA PASTA ATIVA — o produto
│   ├── site/             ← Vite + React + TS (landing, auth, /admin, /broadcast/{slug}, /{slug})
│   ├── api/              ← backend multi-tenant (PM2 livetranslate-api, porta 4020)
│   ├── db/migrations/    ← schema do Supabase (fonte de verdade)
│   ├── brand/            ← logo vetorial, PNGs, fontes
│   ├── tools/ · images/
│   └── docs/
│       ├── HANDOFF.md                      ← DOCUMENTO VIVO, comece por ele
│       ├── PLANEJAMENTO-produto.md         ← decisões de produto (25/08)
│       ├── pesquisa-concorrentes-2026-08-25.md
│       └── manual-operador/ · screenshots/ · logos/
│
├── OLD/                  ← BACKUP E APRENDIZADO — nada aqui é ativo
│   ├── LEIA-ME.md        ← o que cada pasta foi, por que morreu, o que ensinou
│   ├── v1-live-translate/ · poc2/ · poc3/
│   ├── docs-v1/ · cartazes-qr/ · _bugs/ · _sermoes/
│   └── .env.hetzner      ← segredo do v1 (fora do git)
│
└── MAPA-DO-PROJETO.md    ← este arquivo
```

---

## O que está no ar (verificado em 20/09/2026)

| Onde | Status | O que é |
|---|---|---|
| **livetranslate.church** | ✅ **200 — produto em produção** | Site estático em `/mnt/volume/livetranslate/site` + API `livetranslate-api` (PM2, porta 4020) |
| traducao.jcsolutionsus.com | ⚠️ 200 — v1 legado, **a desligar** | Next via PM2 `traducao` porta 4017 |
| traducao.../poc2/ | ❌ 502 — já morto | PM2 `poc2` caído desde o standby de 12/08 |
| traducao.../poc3/ | ⚠️ 200 — página estática legada, **a desligar** | Alias no nginx, sem processo |

**Servidor:** Hetzner 91.99.15.213 (ARM). O build do backend **tem** que ser feito no servidor (binário ARM do `@livekit/rtc-node`).

**Decisão de 20/09:** o que está no servidor além do livetranslate.church vai ser desabilitado. Plano em `OLD/LEIA-ME.md`, ainda **não executado**.

---

## Regras que valem sempre

- **Protocolo de dependências do `CLAUDE.md`**: cooldown de 7 dias, osv.dev, dry-run, versão pinada, **OK explícito do Johnny antes de instalar**.
- **Nunca deployar em dia de culto (domingo).**
- Nunca criar contas, digitar senhas do Johnny, nem expor valores de `.env`.
- Conversa em português; UI do produto em inglês por padrão (+ ES/PT).
