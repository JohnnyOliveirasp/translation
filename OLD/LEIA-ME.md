# OLD — backup e aprendizado

*Arquivado em 20/09/2026. **Nada aqui é ativo.** Não deployar, não editar, não usar como referência do estado atual.*
*O que está vivo é só `livetranslate/` → https://livetranslate.church. Ver `MAPA-DO-PROJETO.md` na raiz.*

Tudo aqui continua no git com o histórico preservado (movido com `git mv`). Serve para consultar **por que** uma decisão foi tomada — cada pasta ensinou alguma coisa que está no produto hoje.

---

## `v1-live-translate/` — o sistema original (04/08 a 06/09/2026)

Next.js + LiveKit self-hosted + Gemini Live S2S. Rodou **todos os cultos reais** de 09/08 até a igreja migrar para o produto. Esteve no ar em traducao.jcsolutionsus.com (PM2 `traducao`, porta 4017).

**O que ele ensinou — tudo isto está no produto hoje:**
- **Serializar captura de áudio.** O `AudioSource` do `@livekit/rtc-node` não aceita capturas concorrentes: na primeira colisão entra em `InvalidState` permanente (voz morta, só legenda). Toda captura tem que passar por uma fila serial única.
- **Wake Lock nas duas telas.** O iPad do operador desligava a tela no meio do culto.
- **Manter o ouvinte vivo no mute.** No louvor (mute longo) o celular dorme e derruba todo mundo — a ponte publica silêncio contínuo.
- **Ponte não cai enquanto mutada.** O Safari do iPhone suspende a página no louvor, os heartbeats param e o `IDLE_TIMEOUT` derrubava a ponte; quando a pregação voltava, o ouvinte ficava mudo.
- **Legenda chegando ≠ áudio ok.** O Chrome do iOS pausa o `<audio>` no louvor e não retoma; as legendas continuavam (vêm por data channel) e mascaravam a falha. Daí o "vigia de áudio". Sempre testar os dois canais, e no Chrome iOS além do Safari.
- **Make-before-break.** No aviso de `goAway` abrir a sessão nova em paralelo e só chavear quando ela produzir — o corte de 3-5s na troca cai para menos de 1s.
- **Blip de voz.** O modelo preview ignora o `speechConfig` nos primeiros segundos de sessão retomada com handle. Mitigado com sessão limpa (`NO_RESUME`) + aquecimento; validado no culto de 06/09.
- **Log forense em disco.** O console do PM2 era apagado às 04:00 por um cron de limpeza — o culto de 16/08 ficou sem diagnóstico possível.

## `poc2/` — cascata ASR → LLM → legendas (11/08 a 12/08/2026)

Soniox + Gemini Flash, zero dependências, sem LiveKit. **Gate de qualidade aprovado**: terminologia, citações bíblicas no texto consagrado (Almeida/Reina-Valera) sem RAG, diarização de 2 falantes, ~US$0,6/h. **Morreu na latência**: 1,6-1,9s no CLI, mas na prática o tempo de tradução ficou longo demais. Em standby por decisão do Johnny em 12/08; o processo no servidor está caído (502) desde então.

**Fica como o caminho do "Grupo B"** (entonação, citações direto da NVI, grego/hebraico transliterado) — só quando houver 2-3 igrejas pagando.

## `poc3/` — detecção automática de louvor × pregação (13/08 a 24/08/2026)

YAMNet via MediaPipe Tasks Audio, **no navegador** (custo zero no servidor). Virou o **Worship Sense**, o diferencial de mercado do produto — nenhum concorrente anuncia auto-detecção de louvor.

**O que ele ensinou:** o YAMNet quase nunca emite "Singing" — voz cantada pontua como "Speech". A trava absoluta nunca liberava o mute. A solução foi a **regra relativa**, calibrada por simulação contra o CSV do culto inteiro de 23/08 (mic na lapela do pastor → música abafada, score ~0,2): média móvel de 5 janelas; muta se música ≥0,15 e >2× a fala por 4 janelas; desmuta se fala ≥0,30 e > música por 8 janelas.

**O código já está portado** para `livetranslate/site/src/lib/worship-sense.ts`. Esta pasta é só a origem.

## `docs-v1/`
`SPEC-traducao-simultanea-gemini.md` e `PLANEJAMENTO.md` (spec e cronograma originais do v1) + `diagrama-audio/` (diagrama de conexão Qu-6D → computador e o e-mail para a equipe de som da igreja).

## `cartazes-qr/`
Cartazes impressos, QRs, apresentação para o pastor. O `QR-traducao-IMPRIMIR.png` aponta para o domínio do **v1** — não reimprimir; o produto tem QR próprio.

## `_bugs/` e `_sermoes/`
Prints, fotos de WhatsApp e relatórios de bug dos cultos; pesquisa externa. `_sermoes/` tem os PDFs e logs do culto de 30/08, o primeiro no produto.

## `.env.hetzner`
Segredo do v1 (fora do git). Movido junto, nunca lido.

---

## A fazer no servidor (decidido em 20/09, NÃO executado)

Desabilitar tudo que não é o livetranslate.church. **Nunca em domingo.**

1. Conferir o que está de pé: `pm2 list`, `ls /etc/nginx/sites-enabled/`.
2. Backup da conf antes de tocar (o padrão do projeto: `/root/traducao.nginx.bak-*`).
3. `pm2 stop traducao poc2` → confirmar que `livetranslate-api` segue de pé → `pm2 delete` e `pm2 save` só depois de alguns dias no ar sem o v1.
4. nginx: remover o symlink de `traducao.jcsolutionsus.com` (e os blocos `/poc2/` e `/poc3/`), `nginx -t`, `systemctl reload nginx`.
5. **Cuidado:** há outros 13 sites no nginx desse servidor. `sites-enabled/traducao` **não é symlink** de `sites-available` — em 13/08 eram arquivos divergentes. Conferir os dois.
6. Não apagar `/mnt/volume/traducao/` — é a retaguarda física e a fonte do `node_modules` e do `vendor/` que o produto reusa.
