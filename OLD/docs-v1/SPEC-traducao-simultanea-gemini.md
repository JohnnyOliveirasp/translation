# SPEC — App de Tradução Simultânea ao Vivo

**Stack:** Next.js + LiveKit (self-hosted) + Gemini Live API (`gemini-3.5-live-translate-preview`)
**Autor:** Johnny — JC Business Solutions
**Versão:** 2 — reescrita sobre a arquitetura de referência do Google
**Docs verificadas em:** agosto/2026 (modelo em *preview* — reconferir antes de codar)

---

## 1. Objetivo

Traduzir a fala de um orador ao vivo e entregar o **áudio traduzido** em tempo real no celular
de cada ouvinte. O ouvinte **não instala nada**: escaneia um QR code, escolhe o idioma, põe o
fone e ouve.

### Restrições reais (não ignorar)

- **Não existe mesa de som no local.** Captação por **microfone de lapela sem fio** ligado a um
  celular Android dedicado (USB-C) ou ao computador. Nada de line-out, XLR ou interface de áudio.
- Wi-Fi do local pode ser instável → reconexão automática, zero intervenção durante o evento.
- Ouvintes não são técnicos → tela com um botão grande de play e nada mais.
- Custo previsível e baixo.
- O orador é **monolíngue em inglês** — sem alternância de idioma no meio da fala.

---

## 2. Decisão de arquitetura

Construção nossa, replicando o que já está validado em produção no repositório oficial
**`google-gemini/gemini-live-translate-livekit`** (Apache 2.0). Ele resolve o mesmo problema
para 1.000+ ouvintes e 20+ idiomas; nós replicamos o miolo e cortamos o que existe só por
causa da escala deles.

### 2.1 O que replicamos

| Elemento | Por quê |
|---|---|
| **LiveKit (WebRTC) como transporte** | Jitter, perda de pacote, codificação Opus, reconexão e agendamento de playback vêm resolvidos pelo protocolo. Escrever isso à mão sobre WebSocket + PCM cru é o maior gerador de bug do projeto. |
| **Uma sessão Gemini por idioma**, compartilhada por todos os ouvintes daquele idioma | Custo escala com idiomas, não com público |
| **Manager singleton** com spin-up sob demanda e teardown por ociosidade | Idioma sem ouvinte não custa nada |
| **Bot server-side** (`@livekit/rtc-node`) que entra na sala e publica o áudio traduzido | Não depende de navegador aberto no servidor |
| **Fila serial de frames** de áudio (promise chain) | Evita pile-up no FFI do LiveKit |
| **Transcrição por data channel confiável** (`publishData`), desacoplada do áudio | Legenda não quebra ao trocar de idioma |
| **Cleanup com `navigator.sendBeacon()`** no `beforeunload` | Decrementa ouvintes e derruba sessão ociosa quando a aba fecha |
| **QR code de sessão** | Entrada do ouvinte |
| **Senha do organizador** por variável de ambiente | Protege quem transmite, deixa a página do ouvinte pública |

### 2.2 O que cortamos

Existe no repo por causa da escala deles, não da nossa:

- Criação/listagem de múltiplas sessões e landing page → **uma sala fixa**
- Cloud Run, Secret Manager, IAP → **VPS próprio**
- LiveKit Cloud → **LiveKit self-hosted** (o tier gratuito deles tem teto de 100 conexões
  concorrentes e 50 participant-hours/mês; um culto de 90 min com 40 pessoas já estoura)
- Arquitetura de 3 camadas com salas por idioma → **sala única** (o próprio Google indica
  que a sala única atende bem até ~15–20 idiomas e algumas centenas de ouvintes)
- Autoscaling e coordenação via Redis → **uma instância**

### 2.3 O que acrescentamos

Não existe no repo deles e é decisivo para nós:

1. **Tratamento do limite de sessão** (§4.3) — sem isso o áudio morre no meio do culto
2. **UI em português** e tela do ouvinte simplificada
3. **Contador de minutos e custo por idioma** em tempo real (§7)
4. **Log de latência ponta a ponta** (§8.2)

---

## 3. Arquitetura

```
        LOCAL                              VPS HETZNER                        OUVINTES
┌──────────────────┐            ┌────────────────────────────────┐
│ Orador           │            │  Next.js  (app + API)          │
│  ↓ lapela        │            │  LiveKit server (Docker)       │
│ Celular/PC       │  WebRTC    │                                │  WebRTC   ┌──────────┐
│ /broadcast       ├───────────►│  ┌── Sala única ────────────┐  ├──────────►│ pt-BR    │
│ publica áudio    │            │  │ organizador (publisher)  │  │           │ fone     │
└──────────────────┘            │  │ translator-pt ─┐         │  │           └──────────┘
                                │  │ translator-es ─┤         │  │           ┌──────────┐
   QR code na parede            │  └────────────────┼─────────┘  ├──────────►│ es       │
        │                       │                   │            │           │ fone     │
        └──────────────────────►│   TranslationBridge (por idioma)│          └──────────┘
                                │   └─► Gemini Live API           │
                                └────────────────────────────────┘
```

O áudio do orador entra **uma vez**. Cada `TranslationBridge` entra na sala como bot,
assina o áudio do organizador, envia para sua sessão Gemini e publica o resultado como
`translator-{lang}`. O ouvinte assina **apenas** a track do idioma escolhido (`setSubscribed`).

---

## 4. A API do Gemini

> Fonte: https://ai.google.dev/gemini-api/docs/live-api/live-translate

### 4.1 Fatos

| Item | Valor |
|---|---|
| Modelo | `gemini-3.5-live-translate-preview` |
| Áudio de entrada | PCM 16-bit LE, **16 kHz**, mono, chunks de 100 ms |
| Áudio de saída | PCM 16-bit LE, **24 kHz**, mono |
| Entrada de texto | **não suportada** |
| Tools / function calling | **não suportado** |
| System instructions | **não suportado** → **sem glossário de terminologia** |
| Idiomas | BCP-47 (`pt-BR`, `es`, `en`, `fr`, `zh-Hans`, `hi`, `ar`…) |
| **Tier gratuito** | **NÃO SERVE** — limita conexões WebSocket concorrentes a ~3–5 e os bridges caem. **Chave de tier pago é obrigatória.** |

### 4.2 Configuração

```js
{
  responseModalities: ['AUDIO'],
  inputAudioTranscription: {},
  outputAudioTranscription: {},
  translationConfig: {
    targetLanguageCode: 'pt-BR',
    echoTargetLanguage: false
  }
}
```

`echoTargetLanguage: false` — se a fala já estiver no idioma alvo, a sessão fica em silêncio
em vez de gerar artefato. Sem contrapartida no nosso caso: o orador não alterna idiomas.

### 4.3 ⚠️ Limite de sessão — o trabalho que é só nosso

| Limite | Sem tratamento | Solução oficial |
|---|---|---|
| Sessão só de áudio | ~15 min (limite de **tokens**: ~25 tokens/s de áudio) | `contextWindowCompression` → duração ilimitada |
| Conexão WebSocket | ~10 min | `sessionResumption` → sessão sobrevive à troca de conexão |
| Aviso de fim | — | mensagem `goAway`, com `timeLeft` |

```js
contextWindowCompression: { slidingWindow: { targetTokens: 4000 }, triggerTokens: 100000 },
sessionResumption: {}
```

A compressão descarta histórico da conversa. **Para nós isso não custa nada** — tradução é
frase a frase, não há contexto a preservar.

Ao receber `goAway`: guardar o handle de `sessionResumptionUpdate`, abrir nova conexão com o
handle, e podar o buffer de envio por `lastConsumedClientMessageIndex` para não perder áudio.
Handles valem 2 horas.

**Verificar na fase 1** se o modelo de tradução aceita esses dois campos — ele tem
configuração simplificada e a documentação não confirma. Se **não** aceitar: plano B em §4.4.

### 4.4 Plano B (só se 4.3 falhar)

Reconexão sobreposta por idioma: ao receber `goAway` (e por timer preventivo aos 8 min), abrir
a sessão sucessora, alimentar as duas por ~2 s, trocar a fonte publicada na sala, fechar a
antiga. Escalonar o ciclo entre idiomas com offset de 30 s. Trocar em silêncio detectado ou
com crossfade de 150 ms.

### 4.5 Limitações conhecidas do modelo

1. **Detecção confunde espanhol e português** — afeta o transcript de entrada, não a tradução.
   Não usar o transcript de entrada para lógica de negócio.
2. **A voz pode variar** após pausas longas. Não prometer "voz do orador" na UI.
3. **Ruído e música** são filtrados, mas não totalmente → botão **MUTE** no `/broadcast`.
4. **Sem glossário.** Nomes próprios e terminologia específica podem sair inconsistentes.
5. **Qualidade não é uniforme entre idiomas** — melhor em inglês, espanhol, chinês, japonês,
   coreano e vietnamita; cai nos menos comuns. Testar cada idioma antes de anunciá-lo.

---

## 5. Idiomas

| Idioma | Código | Racional |
|---|---|---|
| Português (BR) | `pt-BR` | requisito fixo |
| Espanhol | `es` | requisito fixo |
| Mandarim | `zh-Hans` | 2º mais falado; entre os de melhor qualidade no modelo |
| Hindi | `hi` | 3º mais falado |
| Francês | `fr` | cobertura parcial da comunidade haitiana |
| Árabe | `ar` | opcional |

Sessão sob demanda ⇒ idioma sem ouvinte **não gera custo** ⇒ não há penalidade em deixar 6
cadastrados.

> ⚠️ **Crioulo haitiano (`ht`) não é suportado pelo modelo.** Se virar requisito, exige
> pipeline separado (ASR + tradução + TTS) e não cabe nesta arquitetura.

Validar os códigos no boot contra a lista oficial e falhar com mensagem clara se houver
código não suportado.

---

## 6. Estrutura e configuração

```
live-translate/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── token/          # geração de token LiveKit
│   │   │   └── translate/      # request de idioma, status, teardown
│   │   ├── broadcast/          # tela do operador
│   │   └── page.tsx            # tela do ouvinte (QR aponta pra cá)
│   ├── components/QRCode.tsx
│   └── lib/
│       ├── languages.ts               # allowlist + labels
│       ├── translation-bridge.ts      # LiveKit ↔ Gemini (1 idioma)
│       ├── session-manager.ts         # singleton: 1 sessão por idioma
│       └── cost-tracker.ts            # minutos e custo por idioma
├── docker-compose.yml                 # livekit-server + app
└── .env.local
```

```bash
GEMINI_API_KEY=                      # TIER PAGO obrigatório
LIVEKIT_URL=ws://localhost:7880
LIVEKIT_API_KEY=devkey
LIVEKIT_API_SECRET=secret
BROADCAST_PASSWORD=

# SMOKE TEST: dev fala PORTUGUÊS e ouve INGLÊS (ele é trilíngue, valida sozinho)
TARGET_LANGUAGES=en
LANGUAGE_LABELS=en:English
# TESTE 2 (direção real):  pt-BR,es
# PRODUÇÃO:                pt-BR,es,zh-Hans,hi,fr

ALWAYS_ON_LANGUAGES=                 # vazio no teste; pt-BR em produção
IDLE_TIMEOUT_SECONDS=120
ENABLE_CONTEXT_COMPRESSION=true
ENABLE_SESSION_RESUMPTION=true
MAX_SESSION_MINUTES=180              # trava de gasto
PUBLIC_URL=                          # base do QR code
```

**Regra de portabilidade:** nada de hostname no código. Cliente descobre o servidor pela
própria origem. Trocar de VPS = `rsync` + DNS + `docker compose up`.

---

## 7. Custo

```
custo ≈ minutos × preço_por_minuto × idiomas COM OUVINTE
```

Buscar o preço vigente em https://ai.google.dev/gemini-api/docs/pricing e implementar:

- contador de minutos **por idioma** e total, ao vivo na tela `/broadcast`
- estimativa de custo acumulado do evento
- trava `MAX_SESSION_MINUTES` que encerra tudo ao atingir o teto
- relatório final: minutos e custo por idioma, pico de ouvintes por idioma

É a primeira pergunta que o pastor vai fazer. A resposta tem que estar na tela.

---

## 8. Fases

| Fase | Entregável | Aceite |
|---|---|---|
| **1** | CLI Node: `.wav` → Gemini → `.wav` traduzido. **Testar `contextWindowCompression` e `sessionResumption` neste modelo** | Áudio correto + resposta registrada no README sobre as duas flags |
| **2** | LiveKit local (Docker) + `/broadcast` publicando o microfone | Áudio do organizador chega na sala |
| **3** | `TranslationBridge` de 1 idioma + tela do ouvinte | Ouvinte escuta traduzido |
| **4** | **Smoke test PT→EN em casa**: dev fala, iPhone ouve via QR | Compreensível; latência medida nos minutos 1, 10 e 20 |
| **5** | Sessão longa (§4.3) | **30 min contínuos sem corte audível** — bloqueante |
| **6** | Manager multi-idioma: `pt-BR` + `es`, sob demanda, falha isolada | Matar 1 bridge à força e o outro não pisca |
| **7** | Deploy no Hetzner + domínio + QR code | 90 min, zero intervenção |
| **8** | Expansão para 5 idiomas | Cada idioma validado individualmente |

### 8.1 Latência esperada

| Etapa | Tempo |
|---|---|
| Captação + WebRTC até o servidor | ~150–250 ms |
| **Gemini (primeira saída traduzida)** | **~2.950 ms** (mediana medida de forma independente) |
| WebRTC até o ouvinte | ~50–150 ms |
| **Total percebido** | **≈ 3,5 s** |

Servidor na Alemanha acrescenta ~300–400 ms (duas travessias do Atlântico). É o **cenário
pessimista**: se funcionar bem assim, em servidor nos EUA só melhora. **Só migrar se os logs
mostrarem que vale.**

### 8.2 O dado que ninguém publicou

Os ~2.950 ms foram medidos em **falas curtas de conversa**. Um pregador falando 20 minutos
sem parar é outro regime — o atraso pode ou não crescer. **Medir latência nos minutos 1, 10,
20 e 30 e registrar.** É o resultado mais valioso do POC.

---

## 9. Infraestrutura

### 9.1 Desenvolvimento local (começar aqui)

`getUserMedia` exige contexto seguro (HTTPS **ou** `localhost`). Tocar áudio, não.
⇒ quem **captura** precisa de localhost/HTTPS; quem **ouve** funciona em HTTP na LAN.

```
Computador (LiveKit + app + captura)        iPhone (ouvinte)
lapela no PC                                mesma rede Wi-Fi
http://localhost:3000/broadcast   ─────►    http://192.168.1.x:3000
                                            FONE DE OUVIDO
```

- Servidor **no computador**, nunca num celular (Android/iOS suspendem background)
- LiveKit: `docker run -d -p 7880:7880 -p 7881:7881 -p 7882:7882/udp -e LIVEKIT_KEYS="devkey: secret" livekit/livekit-server --dev`
- QR code com `PUBLIC_URL=http://192.168.1.x:3000`
- Sem domínio, sem DNS, sem certificado nesta fase
- **Capturar pelo Android exige HTTPS** — ou adicionar a origem em
  `chrome://flags/#unsafely-treat-insecure-origin-as-secure`. Preferir captura no PC no início.

### 9.2 Produção (Hetzner)

- Ubuntu 24.04, Docker Compose: `livekit-server` + app Next.js
- **Caddy** para TLS e proxy (Let's Encrypt automático; proxy de WebSocket sem config — com
  nginx é preciso setar `Upgrade`/`Connection` na mão e o WS falha em silêncio)
- Subdomínio (ex.: `traducao.dominio.com`) com registro A para o IP
- Firewall: 22, 80, 443 **+ 7880/7881 TCP e 7882/UDP** para o LiveKit
- **Dimensionamento:** cada bridge ativo consome **~20–30 MiB de RAM e ~10% de um núcleo**
  (WebRTC nativo em C++). Para 5 idiomas: ~150 MiB. **CX22 (2 vCPU / 4 GB) é suficiente**;
  CX32 se for passar de 10 idiomas.
- **Uma instância só.** O manager é singleton em memória — escalar horizontalmente sem Redis
  cria bots duplicados na mesma sala.

---

## 10. Checklist do dia da apresentação

- [ ] Ensaio completo, sozinho, no mesmo local e horário, dias antes
- [ ] **Vídeo gravado de um teste bem-sucedido** (seguro contra falha de rede na hora)
- [ ] Ambos os celulares em **4G**, não no Wi-Fi do local
- [ ] **Fone de ouvido** no celular ouvinte — sem isso a lapela capta a tradução e realimenta
- [ ] Power bank no celular capturador; wake lock ativo
- [ ] `/broadcast` numa tela visível: idiomas ativos, ouvintes, latência e **custo acumulado**

---

## 11. Instruções para o agente de desenvolvimento

1. **Antes de codar**, ler:
   - https://ai.google.dev/gemini-api/docs/live-api/live-translate
   - https://ai.google.dev/gemini-api/docs/live-api/session-management ← crítico
   - https://ai.google.dev/gemini-api/docs/live-api/best-practices
   - **Referência de arquitetura:** https://github.com/google-gemini/gemini-live-translate-livekit
     — consultar `src/lib/translation-bridge.ts` e `translation-session-manager.ts` quando um
     problema específico aparecer. Implementação é nossa; o repo é referência.
   - CLI mínimo para a fase 1: https://github.com/google-gemini/gemini-live-api-examples
2. SDK **`@google/genai`** (o `@google/generative-ai` está deprecado). Node 22 LTS, TypeScript.
3. Entregar **fase por fase**; não começar a seguinte sem a anterior rodando.
4. Testar com áudio real desde a fase 1 — nada de mock no caminho final.
5. Comentários e UI **em português**.
6. Logar latência ponta a ponta desde o primeiro dia.
