# HANDOFF — LiveTranslate (para o próximo agente)
*Escrito em 27/08/2026. Leia isto antes de qualquer coisa. Complementa `PLANEJAMENTO-produto.md` (decisões) e a memória do projeto.*

## 1. Estado em uma frase
Landing page + login/signup/recuperação/convite + painel admin **construídos e funcionando localmente** sobre Supabase (projeto `livetranslate`, ref `yrqtncjkwfrgwecyxkmc`). Auth do Supabase **já configurado** (código de 6 dígitos, só e-mail/senha). Site estático **já no ar em https://livetranslate.church** (27/08). Falta: broadcast/ouvinte por igreja (backend multi-tenant), painel do admin da plataforma, Stripe, PDF pós-culto.

## 2. Onde está cada coisa
```
livetranslate/
├── site/                 ← Vite 8 + React 18 + TS 7 + Tailwind 3 + framer-motion 13 + lucide + @supabase/supabase-js 2.112.3
│   ├── src/pages/Landing.tsx, auth/{Signup,Login,Recover,Invite,ui}.tsx, admin/Admin.tsx
│   ├── src/components/   ← Nav, Hero, About, Features, HowItWorks, Testimonials, Pricing, FAQ, Footer, BackgroundVideo, TextEffects
│   ├── src/i18n/         ← dictionary.ts (landing) + auth.ts (auth/admin); EN é o padrão; `*texto*` vira itálico cinza
│   ├── src/lib/          ← supabase.ts (client + tipos), auth.tsx (AuthProvider/useAuth), languages.ts (catálogo + limites por plano)
│   ├── src/router.tsx    ← roteador próprio por pathname (sem react-router); intercepta <a href="/...">
│   ├── src/content/testimonials.ts ← 3 amostras marcadas `sample: true` (Johnny troca por depoimentos reais)
│   ├── public/assets/    ← hero.mp4 (vídeo do vale — Johnny declarou livre de uso), hero.png, logos SVG, fontes Instrument Serif, qr-demo.png
│   └── .env              ← VITE_SUPABASE_URL + VITE_SUPABASE_PUBLISHABLE_KEY (chave publicável, não é segredo; .env está no .gitignore)
├── db/migrations/0001..0003 ← schema aplicado no Supabase (fonte de verdade); db/auth-email-templates/ ← templates JÁ aplicados
├── brand/                ← logo vetorial (svg/), PNGs 4096 transparentes (png/), fontes; gerar-logo.js + render-png.sh
└── docs/                 ← PLANEJAMENTO-produto.md, este HANDOFF, screenshots/, logos/ (rascunhos IA)
```
Pesquisa de concorrentes: `_bugs/pesquisa-concorrentes-2026-08-25.md` (raiz do repo).

## 3. Como rodar
```
cd livetranslate/site
npm run dev        # http://127.0.0.1:5180 (hot reload)
npm run build && npm run preview   # http://127.0.0.1:5181 (serve dist/)
npm run typecheck
```
Se a porta 5181 estiver ocupada por um preview antigo, matar só Chromium/vite do Playwright — nunca o Chrome do Johnny.

## 4. Supabase — o que já existe
- **Tabelas** (todas com RLS): churches, memberships (admin|operator), platform_admins, church_languages, invites (token, 7 dias), services, service_languages, service_costs (SÓ platform admin), listener_emails, sermons, profiles (trigger de auth.users).
- **Helpers** `private.is_member / is_church_admin / is_platform_admin` (security definer, `(select auth.uid())`).
- **RPCs**: `create_church(p_name,p_slug,p_speaker_lang,p_languages)` (signup), `accept_invite(p_token)`, `subscribe_listener(slug,email,lang,consent)` (anon), `church_public(slug)` (anon).
- **Storage**: bucket `logos` público; escrita só admin em `{church_id}/…`.
- **Auth** (configurado pelo painel em 27/08): Confirm signup + Reset password com `{{ .Token }}`; Site URL `https://livetranslate.church`; redirects prod + 127.0.0.1:5180/5181; Confirm email ON; só provedor Email. **Falta SMTP próprio** (o embutido tem rate limit baixo) — Authentication → SMTP Settings.
- MCP do Supabase: use `list_tables`, `apply_migration` (DDL), `execute_sql`, `get_advisors` após DDL. Config de Auth NÃO está no MCP — foi feita pelo Playwright com o Johnny logado no painel (Monaco: `window.monaco.editor.getModels()[0].setValue(html)`).
- Custo: US$10/mês (3º projeto da org Pro). NÃO misturar com AICloneVerse/ResumeFrank.

## 5. Fluxos do site (como estão)
- `/signup` → `auth.signUp` → código → `verifyOtp(type:'signup')` → `rpc create_church` (idiomas padrão: es+pt-BR se orador en, senão en; trial 14 dias) → `/admin`. Dados da igreja ficam em sessionStorage `lt-pending-church` entre os passos.
- `/login` → `signInWithPassword`; se "Email not confirmed" reenvia código e pede o código.
- `/recover` → `resetPasswordForEmail` → `verifyOtp(type:'recovery')` → `updateUser({password})`.
- `/invite/:token` → cria conta (ou usa a logada) → `rpc accept_invite`.
- `/admin` → abas Overview (link do ouvinte `livetranslate.church/{slug}`, botão "Open broadcast" → `/broadcast/{slug}` **ainda não existe**), Settings (nome, idioma, recipients, review toggle, logo upload), Languages (limite 2/5 por plano), Team (membros + convites por link copiável — envio de e-mail do convite não existe), Services (lista `services` + `service_languages`).
- Sem login, `/admin` redireciona para `/login`. Só `memberships[0]` é usado (multi-igreja por usuário fica para depois).

## 6. Pendências do Johnny (não bloqueiam código)
1. ~~Fazer o 1º signup real~~ FEITO 28/08: igreja `redeem-community-church` criada (support.livetranslate.001@gmail.com, trial até 28/09). Falta: marcar o Johnny como platform admin (`insert into public.platform_admins (user_id) select id from auth.users where email = '<email>'`) e subir o LOGO da igreja em Settings (sem logo, a página do ouvinte mostra o nome).
2. ~~Registrar `livetranslate.church`~~ FEITO 27/08: comprado no Namecheap, zona no Cloudflare (zone id `b0b39532534a41439d0945707a2298fe`, NS irena/watson.ns.cloudflare.com, já apontados no Namecheap). DNS: A @ → 91.99.15.213 (proxied), CNAME www → @ (proxied); MX/TXT de parking removidos. SSL mode = Full (strict). Sem e-mail no domínio ainda (SMTP do Supabase precisa de SPF/DKIM quando escolher provedor).
3. SMTP próprio (Resend/SES/Workspace) no painel do Supabase.
4. Depoimentos reais para `src/content/testimonials.ts`.
5. Decidir o QR demo da landing (hoje aponta para a igreja piloto no v1).
6. Nome legal/endereço para termos e privacidade; Stripe (fase final; conta separada).

### O que mudou em 28/08 (sessão do domínio + painel)
- **Trial = 1 mês** (era 14 dias) — `db/migrations/0004_trial_1_month_and_cancel.sql`, aplicada. Mesma migration criou `cancel_subscription()` e `resume_subscription()`.
- **Painel separado da landing**: `site/src/pages/admin/Shell.tsx` (sidebar fixa + gaveta no celular, sem vídeo de fundo). Abas viraram menu: Overview, Languages, Services, Team, Settings, **Subscription** (mostra trial/dias restantes e cancela/reativa — sem Stripe ainda).
- **Página do ouvinte genérica** `/{slug}` (`site/src/pages/Listen.tsx`): topo com LOGO da igreja, ou o NOME quando não há logo; lista os idiomas; estado "fora do ar" até o broadcast multi-tenant existir. Rota catch-all em `App.tsx` com lista de reservados.
- **QR por igreja**: gerador próprio em `site/src/lib/qr.ts` (zero dependência, modo byte/ECC M, v1–10) + `components/QrCode.tsx`. Validado contra a lib `qrcode` do v1 (bate módulo a módulo, v3–v10) e decodificado com OpenCV. Aparece no Overview do painel com download PNG. A landing NÃO mostra mais o QR ao vivo da igreja piloto — agora explica que cada igreja recebe o seu.
- **OTP de 8 dígitos**: o Supabase deste projeto manda 8; os campos aceitavam 6 e cortavam o código. Corrigido nos 4 fluxos (maxLength 8 + `replace(/\D/g,'')`).
- **/broadcast/{slug}** existe (`pages/admin/Broadcast.tsx`), sem senha (o operador já está logado), mas o botão "Go live" está desativado: o motor ainda é o do v1 com sala fixa. É o item 1 abaixo.

- **Logo claro**: logos de igreja costumam vir em PNG transparente com texto BRANCO (o da Redeem é assim) e sumiam no fundo claro. Coluna `churches.logo_is_light` (migration `0005`), detectada no upload por luminância (`components/ChurchLogo.tsx` → `detectLightLogo`, >170 e com transparência) e ajustável por checkbox em Settings; onde o logo aparece, ele ganha um cartão escuro atrás.
- **Fundo do app**: áreas logadas (/admin e /broadcast) usam o mesmo estilo da landing com OUTRO vídeo — `site/public/assets/app-bg.mp4` (cruz na colina; original de 12 MB em `livetranslate/images/`, recomprimido para 1,3 MB com ffmpeg, crf 30, sem áudio) + poster `app-bg.jpg`, com véu claro de 50% por cima (`<BackgroundVideo dim={0.5}>`). A landing segue com `hero.mp4`; a página do ouvinte não carrega vídeo (celular no culto).

## 7. Próximos passos de código (ordem)
1. ~~**Broadcast por igreja**~~ **FEITO 28/08** — ver seção 9 abaixo.
2. ~~**Página do ouvinte**~~ **FEITA 28/08** — `/{slug}` com áudio, legendas, aviso de louvor e vigia de áudio (seção 9).
3. **Painel do admin da plataforma** (todas as igrejas, custos, margem) — `platform_admins`.
4. PDF pós-culto (as transcrições já chegam na ponte: `inputAudioTranscription/outputAudioTranscription`), Stripe.
5. Teste de culto real com a igreja piloto no produto novo (hoje ela roda no v1).

## 9. O motor multi-tenant (28/08/2026)
**Backend novo, separado do v1:** `livetranslate/api/` → servidor `/mnt/volume/livetranslate/api`, PM2 **`livetranslate-api`** porta **4020**, nginx `livetranslate.church/api/` → 4020. Reusa os MESMOS pacotes do v1 (node_modules copiado de `/mnt/volume/traducao/app`, zero instalação nova). `.env.local` próprio (chaves LiveKit/Gemini copiadas do v1 + `SUPABASE_URL`/`SUPABASE_ANON_KEY`). Build feito NO servidor (binário ARM do rtc-node).
- **O v1 não foi tocado.** `traducao` (4017) e a POC3 seguem intactos para os cultos da igreja piloto.
- **Sem senha**: `BROADCAST_PASSWORD` não existe aqui. O operador manda o access token do Supabase; `src/lib/tenant.js` valida em `/auth/v1/user` e confirma a associação consultando `memberships` COM O TOKEN DELE (a RLS é quem autoriza) — sem service_role no servidor.
- **Por igreja**: sala = `churches.livekit_room`; operador = `organizador-{slug}`; ponte = `translator-{slug}-{lang}`; o manager (`src/lib/session-manager.js`) tem `Map` chaveado por `${churchId}:${lang}` e `sourceLang`/`muted`/presenças por igreja (no v1 eram globais do processo — dois cultos simultâneos se atropelavam).
- **Rotas**: `POST /api/token` (operador|ouvinte), `GET/POST /api/translate` (request/release/heartbeat anônimos; set-source/set-mute/stop-all exigem membro), `POST /api/detector-log` (log do Worship Sense por igreja: `logs/detector-{slug}-AAAAMMDD.log`).
- **Migrations 0005/0006**: `logo_is_light` e `livekit_room` no RPC `church_public`.

**Front (site React):**
- `/broadcast/{slug}` (`pages/admin/Broadcast.tsx` + `lib/broadcast-engine.ts` + `lib/worship-sense.ts`): porta da POC3 — YAMNet/MediaPipe do `public/vendor/` (mesmos arquivos e versões da POC3, copiados do servidor; ficam fora do git), regra RELATIVA calibrada (média de 5 janelas; desmuta com fala ≥0,30 por 8 janelas; muta com música ≥0,15 e >2× a fala por 4 janelas), DUAS capturas do mic (crua p/ detector, processada p/ LiveKit), começa mutado, modos AUTO/sempre-ligado/sempre-mutado, sliders de calibração, medidor, contagem de ouvintes, wake lock e log em lotes (no `pagehide` é `fetch keepalive`, não `sendBeacon` — o endpoint exige o login e beacon não manda cabeçalho).
- `/{slug}` (`pages/Listen.tsx` + `lib/listen-engine.ts`): áudio + legendas por data channel, sinal de vida a cada 4s, aviso de louvor no idioma do ouvinte, **vigia de áudio** (Chrome iOS pausa o `<audio>` no louvor e não retoma), pausa manual, wake lock e `release` ao sair.
- **Testado ponta a ponta em 28/08**: ouvinte escolheu Español em produção → log do servidor `sessão Gemini aberta` + `conectado à sala church-redeem-community-church` + `track de tradução publicada`. **Falta o teste com microfone real** (operador logado), que só o Johnny pode fazer.

<!-- antigo:
1. **Broadcast por igreja** `/broadcast/:slug` — portar `poc3/public/broadcast.html` (regra relativa calibrada, logs) para React; exige backend: hoje o v1 (`live-translate/`, Next.js no Hetzner porta 4017) tem sala fixa `culto` e senha no .env. Precisa virar multi-tenant: token LiveKit por `churches.livekit_room`, ponte por igreja+idioma, escrever `services`/`service_languages`/`service_costs` via service_role (chave SÓ no servidor). Ver `live-translate/src/lib/{session-manager,translation-bridge}.js`.
2. **Página do ouvinte** `/:slug` — portar `live-translate/src/app/page.js` (v1) com `church_public(slug)` (nome, logo, idiomas) + opt-in de e-mail (`subscribe_listener`).
3. **Painel do admin da plataforma** (todas as igrejas, custos, margem) — `platform_admins`.
4. **Deploy** — SITE ESTÁTICO JÁ NO AR (27/08): https://livetranslate.church. Arquivos em `/mnt/volume/livetranslate/site`, conf `/etc/nginx/sites-available/livetranslate.church` (symlink em sites-enabled; certbot já editou com HTTPS + redirect). Redeploy: `npm run build` → `tar czf /tmp/lt-dist.tgz -C dist .` → scp → `tar xzf ... -C /mnt/volume/livetranslate/site` (nada de PM2, sem build no servidor). Falta: app Next multi-tenant em novo PM2 (não tocar em traducao/poc2/poc3 nem nos outros 13 sites do nginx; warnings de n8n.jcsolutionsus.com duplicado são pré-existentes).
5. PDF pós-culto, Stripe.
-->

## 8. Regras que valem sempre
- Protocolo de dependências do CLAUDE.md: cooldown 7 dias, osv.dev, dry-run, versão pinada, **OK explícito do Johnny antes de instalar**. socket.dev bloqueia robô (403) — registrar isso no checklist.
- Nunca criar contas nem digitar senhas do Johnny; nunca ler `.env` do servidor no chat.
- Igreja piloto continua no v1 (traducao.jcsolutionsus.com) até o produto estar ensaiado. Culto de domingo: não deployar no v1 perto de domingo sem ensaio.
- Johnny prefere que eu FAÇA (via MCP/Playwright) em vez de pedir cliques; só peço quando é senha, cobrança ou decisão dele.
- Idioma da conversa: português; UI do produto: inglês padrão + ES/PT.

## 10. Operação do motor novo (o que checar quando algo der errado)
- Processo: `pm2 logs livetranslate-api` (linhas `[bridge:{slug}:{lang}]`), `pm2 restart livetranslate-api`.
- Custos/ciclo: `/mnt/volume/livetranslate/api/logs/custo.log` (`START/STOP {lang} minutos= motivo=`), `sessao.log` (Gemini: goAway, chaveio, reconexão, MUTE/UNMUTE), `detector-{slug}-AAAAMMDD.log` (Worship Sense, scores crus).
- Ciclo normal e esperado: ouvinte escolhe idioma → ponte sobe (`sessão Gemini aberta` + `conectado à sala church-{slug}` + `track publicada`); saiu todo mundo → cai sozinha em ~2 min (`STOP ... motivo="ocioso"`, `IDLE_TIMEOUT_SECONDS=120`). Enquanto o operador está em MUTE (louvor) a ponte NÃO cai de propósito.
- Rebuild depois de mexer no código: `cd /mnt/volume/livetranslate/api && nvm use 22 && npm run build && pm2 restart livetranslate-api` (o build TEM que ser no servidor: binário ARM do `@livekit/rtc-node`).
- O `vendor/` do site (YAMNet + MediaPipe + livekit-client, ~18 MB) fica FORA do git, igual à POC3; se sumir, copiar de `/mnt/volume/traducao/poc3/vendor/`.

## 11. PDF pós-culto — como ficou decidido (28/08/2026)
- **Sem aprovação do pastor.** Johnny tirou o passo de revisão ("é mais uma coisa para ele se preocupar"): migration `0007` removeu `churches.review_before_send` e o status `review`/`approved_at` de `sermons`. O PDF vai direto.
- **Quem recebe:** o ouvinte que deixou o e-mail na página do culto (RPC `subscribe_listener`, tabela `listener_emails`, guarda o idioma escolhido) **+ cópia para os endereços da igreja** (`churches.sermon_recipients`, campo em Configurações — rótulo agora é "Enviar cópia de cada sermão para").
- **Onde o ouvinte pede:** cartão discreto na página `/{slug}` enquanto ele ouve — só e-mail, sem criar conta.
- **Falta construir:** o gerador do PDF e o envio. As transcrições já chegam na ponte (`inputAudioTranscription` do orador e `outputAudioTranscription` da tradução) mas hoje só a de saída vira legenda; a de entrada é descartada (`translation-bridge.js`). O envio depende do SMTP próprio (pendência 3 da seção 6).

## 12. Letra do louvor ao vivo — IMPLEMENTADO (28/08/2026)
Decisão do Johnny: a letra tem de ser captada **na hora em que está sendo cantada** (nada de cadastrar letra antes, e as letras são da própria igreja — sem questão de licença de terceiros).

Como funciona (zero dependência nova — usa o que a ponte já recebia e jogava fora):
- O Gemini Live já vinha com `inputAudioTranscription` e `outputAudioTranscription` ligados; a de entrada era descartada.
- Quando a igreja entra em **modo louvor** (`set-mute` do detector), o manager marca `bridge.worship = true` em todas as pontes daquela igreja.
- Com `worship = true`, `translation-bridge.js`: (a) NÃO publica áudio traduzido — ninguém ouve voz cantada traduzida; (b) manda `{original, traduzido}` por data channel no topic **`louvor`** (a legenda da pregação continua no topic `legenda`).
- **Mudança importante no operador**: no louvor o áudio NÃO é mais cortado na origem — se cortasse, não haveria o que transcrever. `track.mute()` só acontece no modo "Sempre mutado" (quando o operador pede silêncio de propósito). Efeito colateral esperado: **o louvor agora consome API** (antes custava zero).
- Ouvinte (`/{slug}`): durante o louvor mostra a letra traduzida grande e a original em itálico embaixo, com o selo "Letra captada ao vivo — pode não ser exata". Sem letra ainda, mantém o aviso de louvor de sempre.

**Limite honesto:** é reconhecimento de canto com banda — vai errar palavras, sobretudo com instrumental alto ou coral. Por isso o selo de "pode não ser exata". Se a precisão não bastar no culto real, o plano B (ler a letra do software de projeção) segue registrado no git.

## 13. Fundo de tela do ouvinte (28/08/2026)
A tela que abre no celular das pessoas passou a ter o mesmo fundo em movimento do painel, com o vídeo **reenquadrado para retrato**: `site/public/assets/app-bg-portrait.mp4` (crop central 405×720 do 1280×720 → 540×960, 600 KB) + pôster `app-bg-portrait.jpg`. `BackgroundVideo` escolhe a versão pela media query `(max-width: 820px) and (orientation: portrait)`; véu de 62% para o texto continuar legível no sol. Em conexão com "Economia de dados" (`navigator.connection.saveData`) só o pôster carrega.

Três armadilhas resolvidas aqui (todas dariam TELA BRANCA no celular, e nenhuma aparece no desktop):
1. O `<main>` da página do ouvinte não tinha `relative z-10` — o véu do fundo cobria o conteúdo.
2. Autoplay barrado (iOS em economia de bateria) deixava o vídeo em `opacity: 0` para sempre; agora o `catch` do `play()` mostra o pôster.
3. Ao trocar paisagem↔retrato, a `key` diferente remonta o `<video>`, mas o efeito com `[]` seguia preso ao elemento antigo — o novo nunca recebia `play()` nem opacidade. O efeito agora depende da fonte.

## 14. Idioma da tela do ouvinte (29/08/2026)
Assim que a pessoa toca no idioma dela, **a tela inteira passa a falar esse idioma** — não só o áudio. Antes, quem escolhia Español continuava lendo "Want today's message by email?", porque a página usava o dicionário do site (que só tem EN/ES/PT, o público do painel).
- `site/src/i18n/listener.ts`: textos da tela do ouvinte nos **16 idiomas do catálogo** (rótulo, "use fones", estados, pausa/tocar, trocar idioma, "toque para voltar o som", o convite do PDF por e-mail e o selo da letra ao vivo). `listenerStrings(code)` cai para o idioma base (`pt-BR` → `pt`) e, por fim, para inglês.
- Árabe entra com `dir="rtl"` no `<main>`.
- Antes da escolha, a tela inicial segue o idioma do site (não há idioma escolhido ainda).
- Ao acrescentar um idioma em `LANGUAGE_CATALOG`, acrescente também o bloco em `listener.ts` — sem ele a pessoa cai em inglês.

## 15. CORRIGIR DEPOIS DO CULTO (achado em 30/08, durante o culto — não mexer no ar)
`api/src/lib/translation-bridge.js:18` — a função ficou `logSessao(tag, line)` mas o corpo ainda usa `${lang}`, que não existe mais no escopo. O `try/catch {}` vazio engole o ReferenceError, então **`logs/sessao.log` do sistema novo não grava NADA** (goAway, chaveios, reconexões, MUTE/UNMUTE). O `custo.log` e o `detector-{slug}-*.log` estão gravando normalmente, e o `pm2 logs` tem a informação — mas o cron de limpeza faz `pm2 flush` às 04:00, que é exatamente o motivo pelo qual esse arquivo existe.
Correção: trocar `${lang}` por `${tag}` na linha 18, `npm run build` e `pm2 restart livetranslate-api` — **só com o culto encerrado**, porque o restart derruba as pontes e corta o áudio de quem estiver ouvindo.

## 16. Lista de pedidos do culto de 30/08 (na ordem que o Johnny pediu)
1. **TOP 1 — PDF do sermão automático + envio** por e-mail para quem se cadastrou (`listener_emails`) e cópia para `churches.sermon_recipients`. **Uma cópia em INGLÊS para o Johnny repassar ao pastor.**
2. **Logo da igreja na tela de broadcast** (`/broadcast/{slug}`) — a tela é por igreja e hoje só mostra o nome em maiúsculas; deve mostrar o logo como o painel e a página do ouvinte (usar `ChurchLogo`, que já trata logo claro).

## 17. PDF do sermão AUTOMÁTICO (30/08, depois do culto)
Quando o operador clica em **Encerrar transmissão** (`stop-all`), o servidor gera os PDFs sozinho e a resposta já traz o que saiu.
- **Matéria-prima** (a ponte grava desde 30/08): `logs/sermao-{slug}-AAAAMMDD.log` = fala do orador no idioma original (só a ponte "escriba" da igreja grava, senão cada idioma duplicaria) e `logs/traducao-{slug}-{lang}-AAAAMMDD.log` = a tradução publicada em cada idioma.
- **Gerador**: `api/src/lib/sermon-pdf.js` — PDF A4 multipágina, texto de verdade em Helvetica, quebra de linha medida pela largura real do glifo, sem nenhuma biblioteca (mesma escola do gerador de QR). Protótipo em `livetranslate/tools/sermao-pdf.py` (foi o que gerou os PDFs do culto de 30/08 antes da automação).
- **Saída**: `sermons/{slug}/{AAAAMMDD}-{lang}.pdf` (`-original` para a fala do pregador).
- **Download**: `GET /api/sermons?slug=` lista e `&file=` baixa — só membro da igreja (o sermão não é público). No painel virou a aba **Sermons**.
- **Limitação de fonte**: as fontes base do PDF cobrem só Latin-1; chinês, coreano, japonês, árabe e hindi saem como "?". Para esses idiomas será preciso embutir uma fonte (ou gerar a página como imagem, como no cartaz).
- **Falta o envio por e-mail** — depende do SMTP (pendência do Johnny). Quando existir: ler `listener_emails` (idioma de cada pessoa) + `churches.sermon_recipients` e anexar o PDF certo.
