# PLANEJAMENTO — Tradução Simultânea ao Vivo

> Complementa a `SPEC-traducao-simultanea-gemini.md`. A spec define **o quê e como**;
> este documento define **quando e em que ordem**, com as decisões tomadas com o Johnny.

**Data-alvo: domingo, 09/08/2026** (primeiro uso real)

---

## Decisões tomadas (04/08/2026)

1. **Escopo do domingo: apenas `pt-BR` e `es`.** Os demais idiomas (zh-Hans, hi, fr, ar)
   ficam para depois do primeiro evento real.
2. **Tudo via navegador**, sem app. Duas páginas só: `/` (ouvinte) e `/broadcast` (operador).
3. **UI básica primeiro** — HTML direto, botões grandes, coluna única responsiva
   (celular e PC). Estética entra depois que o áudio estiver validado.
4. **SEM valores de custo na tela.** O rastreio de minutos continua no código
   (aciona a trava `MAX_SESSION_MINUTES` e gera o relatório final), mas custo e
   minutos por idioma só aparecem no log e no relatório pós-evento — nunca no painel.
5. Teste local primeiro; deploy no servidor Hetzner existente (Johnny passa os
   acessos na Fase 7).

---

## Cronograma até domingo

| Dia | Fases (da spec §8) | Entregável / Aceite |
|---|---|---|
| **Ter 04/08** | Fase 0 + Fase 1 | Chave Gemini paga configurada. CLI `.wav` → Gemini → `.wav` traduzido. **GATE: testar `contextWindowCompression` + `sessionResumption` no modelo — resultado define caminho principal ou plano B (§4.4)** |
| **Qua 05/08** | Fase 2 + Fase 3 | LiveKit local (Docker) + `/broadcast` publicando a lapela + bridge de 1 idioma + tela do ouvinte. Ouvinte escuta traduzido |
| **Qui 06/08** | Fase 4 + Fase 5 | Smoke test PT→EN em casa (iPhone via QR). **BLOQUEANTE: 30 min contínuos sem corte audível.** Latência medida nos minutos 1, 10, 20, 30 |
| **Sex 07/08** | Fase 6 + Fase 7 | Manager multi-idioma `pt-BR` + `es` sob demanda, falha isolada. Deploy no Hetzner + domínio + QR definitivo |
| **Sáb 08/08** | Ensaio geral | Checklist §10 da spec no local: ensaio completo, vídeo de backup gravado, celulares em 4G, fone no ouvinte, power bank |
| **Dom 09/08** | **EVENTO** | 90 min, zero intervenção |

Folga: se quinta atrasar, sexta absorve a Fase 5 e o deploy desliza para sábado de manhã.
O ensaio de sábado não pode ser cortado.

---

## Telas (formato aprovado em 04/08)

### `/` — Ouvinte (QR aponta para cá)

**Estado 1 — Escolher idioma** (abre ao escanear; o toque no idioma é o gesto
que libera o áudio no navegador — 1 toque e está ouvindo):

```
┌───────────────────────┐
│    Tradução ao Vivo   │
│  🎧 Use fone de ouvido │
│  Toque no seu idioma: │
│ ┌───────────────────┐ │
│ │  🇧🇷  Português    │ │
│ └───────────────────┘ │
│ ┌───────────────────┐ │
│ │  🇪🇸  Español      │ │
│ └───────────────────┘ │
└───────────────────────┘
```

**Estado 2 — Ouvindo:**

```
┌───────────────────────┐
│  🇧🇷 Português         │
│   ● AO VIVO           │
│      ┌─────────┐      │
│      │   ⏸     │      │  ← botão gigante central
│      │  PAUSAR │      │
│      └─────────┘      │
│ ┌───────────────────┐ │
│ │ legenda ao vivo   │ │  ← transcript via data channel
│ └───────────────────┘ │
│  Trocar idioma        │
└───────────────────────┘
```

- Queda de rede → banner "Reconectando..." + reconexão automática, sem ação do ouvinte.
- "Trocar idioma" volta ao estado 1 sem derrubar a conexão.

### `/broadcast` — Operador

**Estado 1 — Entrada:** senha + seletor de microfone (escolher a lapela) + medidor
de nível para confirmar captação **antes** de iniciar. Botão "Iniciar transmissão".

**Estado 2 — Painel ao vivo (SEM valores de custo):**

```
┌─────────────────────────┐
│ ● TRANSMITINDO   47:12  │  ← relógio de duração da transmissão
│ Nível: ▂▄▆█▆▄▂  ✓ lapela│
│ ┌─────────────────────┐ │
│ │       🔇 MUTE       │ │  ← usar na hora da música/louvor
│ └─────────────────────┘ │
│ Idiomas ativos:         │
│ 🇧🇷 Português  12 ouvintes│
│ 🇪🇸 Español     3 ouvintes│
│ ⏱ Latência: 3.2s        │
│ [Ver QR code] [Encerrar]│
└─────────────────────────┘
```

- [Ver QR code] abre o QR em tela cheia (projetar ou imprimir).
- Relatório final (minutos/custo por idioma, pico de ouvintes) gerado ao Encerrar —
  visível só ali, não durante a transmissão.

---

## Ambiente verificado (04/08)

- Node v25.9.0 (spec pede 22 LTS — tentar com 25; se `@livekit/rtc-node` falhar
  nos binários nativos, instalar 22 ao lado)
- npm 11.16.0, Docker 28.1.1 ✓
- Lapela sem fio: comprada, em mãos ✓
- Servidor Hetzner: já existe rodando outros projetos (acessos na Fase 7)

## Pendências do Johnny

- [ ] Pegar a chave Gemini de **tier pago** e colar no `.env.local` (nunca no chat)
- [ ] Escolher a senha do `/broadcast` (também direto no `.env.local`)
- [ ] Confirmar se o orador de domingo fala inglês (spec assume orador monolíngue EN)
- [ ] Fase 7: passar acesso/detalhes do servidor Hetzner e o domínio a usar
