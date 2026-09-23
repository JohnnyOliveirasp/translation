# HANDOFF — LiveTranslate (para o próximo agente)

> **ÚLTIMO ESTADO (22/09/2026, noite):** leia as seções **§22 a §28** — painel da plataforma, Stripe com 2 contas e preços novos, teto de horas + pacotes, deploy por GitHub Actions, /testimonials e Perfil do Google. Pendências que esperam terceiros estão em §23.2, §25 e §26. A memória `livetranslate-handoff` tem o resumo.

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
Pesquisa de concorrentes: `livetranslate/docs/pesquisa-concorrentes-2026-08-25.md`.

> **Reorganizacao de 20/09/2026:** o repo agora tem **so duas pastas na raiz** — `livetranslate/` (unica ativa) e `OLD/` (backup e aprendizado: v1, poc2, poc3, cartazes, _bugs, _sermoes). Caminhos antigos como `live-translate/...`, `poc2/...`, `poc3/...` viraram `OLD/v1-live-translate/...`, `OLD/poc2/...`, `OLD/poc3/...`. Ver `MAPA-DO-PROJETO.md` na raiz e `OLD/LEIA-ME.md`.

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

## 18. Login com Google + páginas legais (07/09)
- Google Cloud: projeto `livetranslate-507920` (conta johnny.oliveira@jcsolutionsus.com), cliente OAuth "LiveTranslate Web", app EM PRODUÇÃO (escopos básicos; sem logo de propósito — logo exige verificação do Google). Redirect: `https://yrqtncjkwfrgwecyxkmc.supabase.co/auth/v1/callback`.
- Supabase: provider Google Enabled (dashboard → Auth → Sign In/Providers).
- Site: `GoogleButton`/`OrDivider` em `site/src/pages/auth/ui.tsx`; botão no /login e /signup; usuário logado sem igreja → /signup pede só a igreja (`a.finish.*`); /admin auto-cria a igreja se `lt-pending-church` estiver no sessionStorage.
- `/privacy` e `/terms` criados (`site/src/pages/Legal.tsx`, rotas no App.tsx) — texto padrão, Johnny precisa revisar.
- Pendente de decisão: Custom Domain do Supabase (US$10/mês) p/ tela do Google mostrar `auth.livetranslate.church`.

## 19. Próximo: Stripe
Copiar a integração de um projeto do Johnny (ele passa o caminho; provável ResumePro). Schema já tem plan/status/trial; painel já tem a aba Subscription.

## 20. Idiomas, e-mail do sermão e PDF multialfabeto (20–22/09/2026)
- **Idiomas:** os catálogos do site (`site/src/lib/languages.ts`) e da API (`api/src/lib/languages.js`) TÊM que andar juntos — a API valida contra o dela. 16 idiomas; `ht` (Kreyòl) não existe no Gemini, Filipino é `fil`. Redeem com 9 ativos e `plan = congregation` (a trava de plano da aba Languages recusava calada).
- **E-mail (Resend, conta própria do LiveTranslate, domínio verificado):** `api/src/lib/email.js` + `sermon-mail.js` + `/api/unsubscribe` + migration `0008`. Todo inscrito recebe todo culto, 10 min após o End broadcast; cancelado se o operador voltar ao ar (`set-source`). Log em `logs/email.log`; registro por culto em `sermons/{slug}/{dia}-envio.json`. Reenvio manual: `enviarSermao({ ..., rodada: 'v2', aviso })`.
- **SMTP do login no Supabase** também pelo Resend (`no-reply@livetranslate.church`).
- **PDF:** latinos no gerador à mão (inalterado byte a byte); zh/ko/ja/ru/uk/ar/hi/vi pelo Chromium do servidor (`pdf-chromium.js`, CDP via pipe, sem pacote).
- **Bug corrigido:** ponte que nascia com o louvor já mutado achava que era pregação (falava e gravava a letra). Agora nasce com `worship = c.muted`.
- **Pendências:** botão "reenviar sermão" no painel; subir o Resend para Pro quando houver 2–3 igrejas (limite de 100 e-mails/dia no Free); os idiomas novos ainda não rodaram num culto real.

## 21. PRÓXIMO AGENTE — idiomas (resto) + STRIPE (22/09/2026)
Pedido do Johnny: *"o site precisa estar em 3 idiomas, inglês default, espanhol e português… vou compartilhar com igrejas no Brasil"* + *"configurar o Stripe… dólar para os países de língua inglesa e espanhola, Real para os de língua portuguesa"*. Referência dele: **`C:\Users\johnn\Downloads\Desenvolvimento\Codigos\Python\ResumePro`**. O agente de 22/09 começou; você termina.

### 21.1 Idiomas — o que JÁ FOI FEITO (commit 3d71482, no ar)
- O site já tinha o sistema de 3 idiomas (`site/src/i18n/`: `dictionary.ts` landing, `auth.ts` login/painel, `listener.ts` ouvinte em 16 idiomas; `index.tsx` = contexto, EN padrão, escolha guardada em `localStorage` na chave `lt-lang`, seletor na Nav).
- Fechados os buracos: `/privacy` e `/terms` em 3 idiomas (`i18n/legal.ts` + seletor EN·ES·PT próprio), "Sign out" do painel (estava fixo), depoimentos trilíngues (`content/testimonials.ts`, tipo `Txt`), rótulos de acessibilidade, aviso de louvor do ouvinte (filipino `tl` → `fil`; holandês faltava).
- **Link com idioma:** `livetranslate.church/?lang=pt` (ou `es` / `en` / `pt-BR`) abre no idioma e guarda a escolha. É o link para mandar às igrejas do Brasil.
- Auditoria: nenhum texto visível fixo fora do dicionário; en/es/pt com as MESMAS chaves (145 na landing, 138 no painel). Para refazer: regex de nó de texto JSX + atributos placeholder/title/aria-label/alt nos `.tsx`, e comparar o conjunto de chaves de cada idioma em `dictionary.ts` e `auth.ts`.

### 21.2 Idiomas — o que FALTA
1. **E-mails de login do Supabase só em inglês** (`db/auth-email-templates/`, assunto "Your LiveTranslate code"). Caminho: no signup gravar o idioma no metadata — `supabase.auth.signUp({ ..., options: { data: { full_name, lang } } })` em `Signup.tsx` e `Invite.tsx` — e trocar os templates Confirm signup / Reset password por Go template condicional (`{{ if eq .Data.lang "pt" }} ... {{ else if eq .Data.lang "es" }} ... {{ else }} ... {{ end }}`), inclusive o assunto. Aplicar no painel do Supabase (Auth → Emails → Templates; o editor é Monaco: `window.monaco.editor.getModels()[0].setValue(html)`) e salvar os arquivos em `db/auth-email-templates/`. Login com Google não tem `lang` → cai no inglês (aceitável).
2. **DECISÃO DO JOHNNY — detectar o idioma do navegador?** O ResumePro detecta (`frontend/middleware.ts`: cookie → Accept-Language → `en`). O LiveTranslate NÃO detecta, por decisão dele de 26/08 ("inglês sempre"). Se ele quiser igual ao ResumePro: em `i18n/index.tsx`, depois do `?lang=` e do localStorage, olhar `navigator.languages` (pt* → pt, es* → es) antes de cair no `en`.
3. Como o ResumePro faz (referência): **next-intl**, `frontend/messages/{en,es,pt-BR}.json` (~2.500 linhas cada, mesmas chaves), `frontend/i18n/request.ts`, cookie `NEXT_LOCALE`, `components/landing/LanguageSelector.tsx`. O site do LiveTranslate é Vite + React (não Next): copiamos o PADRÃO (dicionário por idioma, mesmas chaves, EN padrão, preferência guardada), não a biblioteca. Não instalar next-intl.

### 21.3 STRIPE — o que existe e o que NÃO dá para copiar do ResumePro
- ResumePro: **backend Python/Flask** — `services/payments/stripe_service.py` (138 linhas), `APIS/API_DASHBOARD/controllers/payments/stripe_controller.py` e `subscription_controller.py`. Faz **compra avulsa de créditos** via Checkout; webhook com verificação de assinatura; trata **só** `checkout.session.completed`; rota `/verify-payment`. **A assinatura mensal está comentada (não implementada) e não há multimoeda.** Envs: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`.
- Então: copiar o PADRÃO (Checkout Session + webhook assinado + verificação) e implementar o que o LiveTranslate precisa e o ResumePro não tem: **assinatura mensal com trial, cancelar/reativar, USD e BRL**.
- LiveTranslate hoje: `churches.plan` (starter | growth | congregation), `status` (trial | active | past_due | canceled), `trial_ends_at`, **`stripe_customer_id` já existe** (0001); RPCs `cancel_subscription()` / `resume_subscription()` (0004); aba **Subscription** no painel com cancelar/reativar. Preços: **US$ 79,90/mês (starter, 2 idiomas)**, **US$ 139/mês (growth, 5 idiomas)**, congregation (6+) = contato. Trial = 1 mês, sem cartão.

### 21.4 STRIPE — plano recomendado
- **Sem SDK** (padrão do projeto, igual ao Resend em `api/src/lib/email.js`): REST com `fetch` e corpo `application/x-www-form-urlencoded`. Assinatura do webhook: header `Stripe-Signature` (`t=...,v1=...`) = HMAC-SHA256 de `${t}.${corpoCru}` com `STRIPE_WEBHOOK_SECRET` via `node:crypto` (`timingSafeEqual`, tolerância de 5 min). Se preferir o pacote `stripe`, seguir o PROTOCOLO de dependências do `CLAUDE.md` (cooldown de 7 dias, osv, dry-run, OK explícito, versão pinada).
- **Rotas na API** (`livetranslate/api`, route handlers do Next): `POST /api/billing/checkout` (só admin da igreja; cria o Customer se `stripe_customer_id` estiver vazio; Checkout Session `mode=subscription` com a `currency` escolhida; `subscription_data[trial_end]` = `trial_ends_at` se ainda estiver no trial; `client_reference_id` = id da igreja; success/cancel voltando para a aba de assinatura do painel), `POST /api/billing/portal` (Customer Portal do Stripe: trocar cartão, cancelar, faturas — pode substituir o cancelar/reativar caseiro), `POST /api/billing/webhook` (ler o corpo CRU; eventos mínimos: `checkout.session.completed`, `customer.subscription.created|updated|deleted`, `invoice.paid`, `invoice.payment_failed` → atualizar `plan` / `status` / `current_period_end`).
- **Moeda:** regra do Johnny = idioma → `pt` paga em **BRL**, `en` / `es` pagam em **USD**. No Stripe: um Price por plano com `currency_options` (usd + brl) e a `currency` passada na Checkout Session — ou um Price por plano×moeda num mapa de env. Guardar `churches.billing_currency` (o Stripe trava a moeda do Customer depois da 1ª assinatura).
- **Banco (migration 0009):** `churches.stripe_subscription_id`, `billing_currency`, `current_period_end`; tabela `billing_events` (id do evento do Stripe, unique) para o webhook ser idempotente.
- ⚠️ **O servidor NÃO tem service_role** (decisão de arquitetura: a RLS autoriza com o token do usuário). O webhook vem do Stripe, sem usuário → precisa escrever no banco de outro jeito: (a) `SUPABASE_SERVICE_ROLE_KEY` no `.env.local` da API, usada SÓ no webhook; ou (b) uma RPC `security definer` que confere um segredo compartilhado. Decidir com o Johnny.

### 21.5 DECISÕES PENDENTES DO JOHNNY (perguntar antes de codar o Stripe)
1. **Preços em reais** dos 2 planos (não é conversão direta — ele define).
2. **Moeda por idioma ou por país?** Pela regra dele, uma igreja brasileira nos EUA que use o site em português pagaria em BRL. Alternativa: moeda pelo país da igreja, ou a igreja escolhe no checkout.
3. **Qual conta Stripe** (país da empresa — JC Solutions US?). Conta dos EUA cobra BRL no cartão (com conversão); Pix e Boleto dependem de entidade no Brasil — pesquisar antes de prometer.
4. Webhook: (a) service_role só no webhook ou (b) RPC com segredo.
5. Detectar o idioma do navegador (21.2, item 2).
6. ⏰ **O trial da Redeem vence em 28/09/2026** (a aba Subscription mostra "7 days left"). Se o Stripe não estiver pronto até lá, estender o `trial_ends_at` — é a igreja piloto, `plan = congregation`.

### 21.6 Outros fatos de 22/09 (para não repetir erros)
- Segunda-feira à noite também é pregação (culto com tradução pt-BR, ~18h30 EDT) → o e-mail do sermão sai também às segundas. Não mudar nada.
- Sermões por e-mail, PDF multialfabeto e aba Sermons por mês com filtros: seção 20 e commits 69cdfaf, 83b9c0b, 9d55bd0, 24b6e66.
- Branches: trabalhar em `dev`, fast-forward para `main` no deploy, push das duas.

## 22. PAINEL DA PLATAFORMA + registro de cultos/custo → depois STRIPE (22/09/2026, em andamento)
Decisões do Johnny em 22/09 (conversa com o agente desta seção):
- **Moeda por PAÍS da igreja** (não por idioma): Brasil paga em BRL, todo o resto em USD. O cadastro passa a pedir o país.
- **Duas contas Stripe**: a americana (JC Solutions US, a mesma do ResumePro, `acct_…11QUWJj3aj`) para USD e uma **brasileira** (empresa dele no Brasil) para BRL — Pix/boleto só existem na conta BR.
- **Preços em BRL: ainda não definidos** ("vamos negociar"). USD seguem 79,90 / 139.
- **Webhook grava com `SUPABASE_SERVICE_ROLE_KEY`** (padrão dos dois projetos dele: ResumePro `get_admin_client()`, PlatformLucasArrial `getAdmin()`), com tabela de eventos idempotente (`payment_events` do PlatformLucasArrial). A chave fica SÓ em `api/src/lib/db-admin.js`.
- **Período grátis**: toda igreja entra com 30 dias; o Johnny dá mais dias a quem quiser pelo painel da plataforma. Durante o grátis a igreja usa **livre**, e ele pode **bloquear um idioma** de uma igreja se ficar caro (`church_languages.blocked_by_platform`).
- Idioma do site: inglês padrão, a pessoa muda (sem detectar navegador) — item encerrado.
- **Painel da plataforma** (`/platform`, só `platform_admins` = johnny.oliveirasp@gmail.com): igrejas cadastradas com e-mail do admin, quem paga e quem está de graça, quanto entrou (Stripe, quando existir), quanto saiu (Gemini ESTIMADO + custos fixos editáveis), gráfico mensal, dar dias grátis, bloquear idioma, mudar plano. Referência de layout: PlatformLucasArrial `frontend/src/components/admin/*` (KPIs + donut/barras em SVG à mão, sem lib de gráfico).
- **"Saldo do Google" não existe** (pós-pago — ver memória `custo-gemini`). O painel mostra gasto estimado = minutos de ponte × tarifa por idioma-minuto (`platform_settings.cost_per_lang_minute_usd`, calibrada em **US$0,05/min**: 06/09 = 118,6 min → US$6,70; 13/09 = 143,4 min → US$5,70), com link para a página real de gasto. Fatura real do Google exigiria export para BigQuery — fica para depois se a estimativa não bastar.

### 22.1 Ordem de trabalho
1. **API grava cultos** (`services` / `service_languages` / `service_costs` estavam VAZIAS — a API nunca escreveu, só `logs/custo.log`). Migration `0009`, `api/src/lib/db-admin.js` (service_role), `session-manager.js` abre o culto na 1ª ponte, soma minutos/pico/custo a cada teardown, fecha no `stop-all` (ou sozinho após 30 min sem ponte). Sem a chave no `.env.local`, vira no-op com aviso — o culto nunca para por causa disso.
2. **Painel `/platform`** no site (Vite/React, mesmos padrões do `/admin`).
3. **Stripe** (seção 21.4 continua valendo; agora com 2 contas → `STRIPE_US_*` e `STRIPE_BR_*`, webhook por conta, país da igreja decide a conta).

### 22.1b ESTADO em 22/09 (fim da sessão) — itens 1 e 2 NO AR, item 3 (Stripe) não começou
- **Migration 0009 aplicada** (`db/migrations/0009_platform_admin_and_service_costs.sql`): Johnny em `platform_admins`; `churches.country` + `billing_currency` (Redeem = US/usd); `church_languages.blocked_by_platform` (trigger impede a igreja de destravar; `church_public` esconde do ouvinte); `platform_grants` + RPC `platform_grant_days(church, dias, nota)`; `platform_settings` (tarifa, custos fixos, preços, câmbio); `service_costs.tokens_in/out/rate_usd_per_minute`; `create_church` ganhou `p_country` (BR → brl).
- **API** (`db-admin.js`, `session-manager.js`, `translation-bridge.js`, deployada, PM2 online): abre `services` na 1ª ponte da igreja, soma `service_languages` (minutos, pico) e `service_costs` (minutos × tarifa; tokens do `usageMetadata` só informativos) a cada teardown, fecha no `stop-all` ou sozinho após 30 min sem ponte. Linhas `DB culto #…` no `logs/custo.log`. **⚠️ Só grava depois que `SUPABASE_SERVICE_ROLE_KEY` entrar no `.env.local` do servidor + `pm2 restart`** — até lá aparece um aviso `[db-admin]` e nada quebra. Cultos anteriores a isso NÃO existem no banco (só no custo.log).
- **Site** (deployado): `/platform` (Overview com KPIs entrou/saiu/resultado + gráfico 6 meses + cultos do mês por igreja; Churches com e-mail do admin, país, plano editável, status, acesso até, dar dias grátis, bloquear idioma, histórico; Costs & prices com tarifa, custos fixos, preços USD/BRL, câmbio). Atalho "Platform" no menu do `/admin` para quem é platform admin. Cadastro pede **país** (`lib/countries.ts`, nomes via `Intl.DisplayNames`). Aba Languages da igreja mostra cadeado em idioma bloqueado. Dicionário `i18n/platform.ts` (74 chaves × 3).
- Testado por SQL simulando o usuário do Johnny (RLS): leitura de tudo, `platform_grant_days`, bloqueio de idioma e `church_public` sem o idioma bloqueado — OK (rollback). Não foi testado no navegador com login (login do Johnny é Google).
- **"Entrou" está fixo em 0** até o Stripe existir; quando entrar, criar `payments` (church_id, provider us|br, cents, currency, paid_at, invoice_id) e somar por mês em `Overview` (`moneyIn`).
- **Trial vencido NÃO bloqueia nada ainda** (status continua `trial`; `requireMember` só barra `canceled`/`past_due`). Decidir com o Johnny quando o Stripe entrar: bloquear transmissão ou só avisar.
- Idioma bloqueado: se a igreja DESLIGAR o idioma (a aba apaga a linha) e religar depois, o bloqueio se perde. Aceito por ora.

### 22.2 Pendências do Johnny para esta seção
- Colar/colocar `SUPABASE_SERVICE_ROLE_KEY` no `/mnt/volume/livetranslate/api/.env.local` (Supabase → Project Settings → API Keys → service_role). Sem isso, o item 1 não grava.
- Criar uma chave Gemini SÓ do LiveTranslate (hoje a chave é compartilhada com o n8n — o gasto do painel nunca vai bater com a fatura enquanto for assim).
- Valores mensais dos custos fixos (Hetzner, Supabase, LiveKit, Resend, Cloudflare) — ou digitar direto na aba Settings do `/platform`.
- Preços em BRL e a conta Stripe BR (chaves) quando for começar o item 3.
- **22/09 à tarde**: `SUPABASE_SERVICE_ROLE_KEY` ENTROU no `.env.local` do servidor (copiada do painel do Supabase para o servidor sem passar pelo chat) — `db-admin` testado: `configurado=true`, Redeem id=2. O registro de cultos está ATIVO a partir do próximo culto. Custos fixos preenchidos em `platform_settings`: Hetzner 10 (CAX21 + volume 40 GB, dividido com outros projetos), Supabase 25 (Pro, org compartilhada com 3 projetos), LiveKit 0 (**auto-hospedado** em Docker no Hetzner, container `livekit-traducao`, host `traducao.jcsolutionsus.com` — NÃO existe conta no LiveKit Cloud), Cloudflare/domínio 1. n8n: **não existe mais** — a chave Gemini é só do LiveTranslate. Admin da plataforma logando em `/admin` é redirecionado para `/platform`; o painel da Redeem dele fica em `/admin?church=1`.

## 23. STRIPE NO AR com DUAS CONTAS + Custom Domain do Supabase + pesquisa Brasil (22/09/2026, tarde/noite)
### 23.1 O que está no ar
- **Duas contas Stripe, ambas LIVE**: `us` = JC Business Solutions USA Corp (`acct_1Sajmm11QUWJj3aj`, a mesma do ResumePro) e `br` = **LiveTranslate Brasil** (`acct_1UIWK1Acwp9Gf2vM`, criada pelo Johnny em 22/09 como **Pessoa Física** — ele não tem conta bancária PJ; recebe no CPF, declara no IR; para virar PJ é outra conta). A BR ficou com "Review in progress, 2–3 dias" — cobranças reais só depois. Pix/boleto: ligar em Settings → Payment methods quando a revisão terminar.
- Chaves restritas (template "Recurring subscriptions and billing") criadas no dashboard e copiadas para `/mnt/volume/livetranslate/api/.env.local` SEM passar pelo chat (clipboard → ssh). `scripts/stripe-setup.mjs` (idempotente; roda NO servidor com o env carregado) criou: produtos `lt_plan=starter|growth` nas duas contas; preços USD (`STRIPE_US_PRICE_STARTER/GROWTH`, 7990/13900, lookup_key `lt_<plano>_usd_month`); **BRL SEM preço** (o script pula até existir `STRIPE_BR_AMOUNT_STARTER/GROWTH` no env); webhooks `https://livetranslate.church/api/billing/webhook/us|br` (`STRIPE_*_WEBHOOK_SECRET`); Customer Portal (`STRIPE_*_PORTAL_CONFIG`, cancelamento no fim do período). Env completo: `STRIPE_{US,BR}_{SECRET_KEY,WEBHOOK_SECRET,PORTAL_CONFIG}`, `STRIPE_US_PRICE_{STARTER,GROWTH}`.
- **Migration 0010** (aplicada): `churches.stripe_account|stripe_subscription_id|current_period_end|cancel_at_period_end`; `billing_events` (idempotência, unique provider+event_id); `payments` (alimenta o "Entrou" do /platform e a lista da aba Assinatura); RPC pública `plan_prices()`.
- **API** (`lib/stripe.js` sem SDK; `POST /api/billing/checkout {slug, plan}` → URL do Checkout, conta pelo PAÍS da igreja, `trial_end` = trial restante se > 48 h; `POST /api/billing/portal` → Customer Portal; `POST /api/billing/webhook/[us|br]` → HMAC + `billing_events` + atualiza igreja/`payments`). Testado ao vivo com evento assinado à mão: 1ª vez 200, repetição `duplicate:true`. ⚠️ PostgREST: upsert "ignore-duplicates" em unique que NÃO é PK exige `?on_conflict=col1,col2` (foi o bug do 1º teste).
- **Site**: `pages/admin/Billing.tsx` nova (escolhe plano com preço na moeda da igreja, botão Assinar → Stripe; com assinatura → "Gerenciar assinatura" = portal; banner `?billing=success|cancel`; lista de pagamentos; cancelar trial ainda pelo RPC antigo). `/platform` Overview soma `payments` (BRL convertido por `usd_brl`). `Church` type ganhou os campos novos.
- **Custom Domain do Supabase ATIVO E EM USO**: `auth.livetranslate.church` (add-on US$10/mês ligado em 22/09 com OK do Johnny; CNAME + TXT `_acme-challenge.auth` criados na Cloudflare, DNS only). **FEITO na mesma noite** (Johnny logou no Google Cloud): origem + redirect adicionados no cliente OAuth "LiveTranslate Web"; `VITE_SUPABASE_URL` do site trocada para o domínio novo, rebuild e deploy (`index-BkVyeW8K.js`). A API segue com `SUPABASE_URL` antigo (funciona; trocar é opcional). O Google avisa que a mudança pode levar de minutos a horas para valer. Lista original do que faltava, já feita: (1) no Google Cloud (projeto `livetranslate-507920`, conta johnny.oliveira@jcsolutionsus.com — pediu senha, o Johnny precisa logar) adicionar origem `https://auth.livetranslate.church` e redirect `https://auth.livetranslate.church/auth/v1/callback` no cliente OAuth "LiveTranslate Web"; (2) trocar `VITE_SUPABASE_URL` do site para `https://auth.livetranslate.church`, rebuild e deploy; (3) opcional: `SUPABASE_URL` da API. Só depois disso a tela do Google mostra o domínio novo. O domínio antigo `yrqtncjkwfrgwecyxkmc.supabase.co` continua funcionando.
- Pesquisa de concorrentes no Brasil: `docs/pesquisa-concorrentes-brasil-2026-09-22.md` (resumo: NENHUM concorrente brasileiro; 7 globais já com site em pt-BR; faixa R$70–335 entrada, R$300–920 meio; LiveTranslator.pro tem nome quase igual; Glossa já vende para igreja brasileira nos EUA).

### 23.2 Decisões do Johnny (22/09) e pendências
- **Preços**: ele achou alto, quer baixar, "especialmente para o Brasil". Proposta do agente (aguardando OK): **US$ 69,90 / US$ 119** e **R$ 249 / R$ 499** (Growth BR a R$449 dá prejuízo no teto). Para aplicar: US → editar `valores` em `scripts/stripe-setup.mjs` (o script cria preço novo e transfere o lookup_key; assinantes antigos ficam no preço antigo); BR → `STRIPE_BR_AMOUNT_STARTER=24900 STRIPE_BR_AMOUNT_GROWTH=49900` no env e rodar o script; e atualizar `platform_settings.plan_prices` (aba Costs & prices do /platform) para a aba Assinatura mostrar o valor certo.
- **Teto de horas-idioma por plano** (proposta: Starter 12 h, Growth 25–30 h; aviso em 80%, tolera +20%, depois bloqueia abrir idioma; override no /platform) — Johnny pediu explicação e pareceu de acordo; **NÃO implementado**. Base já existe: `service_languages.minutes`. **Pacote extra de horas** (compra avulsa, ex. 10 h por US$39 / R$199, validade 3 meses) — ideia dele, anotada, não implementada.
- Modelo: **assinatura** (ele cogitou crédito e descartou).
- Trial vencido continua sem bloquear (só a aba mostra). Decidir junto com o teto.
- Conta BR: esperar a revisão do Stripe (2–3 dias) antes de testar um pagamento real em BRL.

## 24. TETO DE HORAS-IDIOMA + PACOTES EXTRAS (22/09/2026, noite) — NO AR
Decisão do Johnny: assinatura (não crédito) + teto por plano + pacote extra comprável. Margem líquida explicada a ele: EUA ~50% (Starter US$36, Growth US$70 típico); Brasil ~1/3 (Gemini é em dólar).
- **Migration 0011** (aplicada): `platform_settings.plan_hours` {starter 12, growth 30, congregation null=sem teto}, `hour_pack` {10 h, US$39, R$199, 3 meses}, `overage_tolerance` 0.2; tabela `hour_packs` (source stripe_us|stripe_br|platform, `reference` = checkout session p/ idempotência, `hours_used`); `churches.usage_alert_month/level`; RPCs `church_hours_month`, `usage_summary` (aba Assinatura), `platform_grant_hours` (Johnny dá horas), `hour_pack_config` (pública).
- **API** `lib/usage.js`: `podeAbrirIdioma(churchId)` é chamado no `session-manager.request()` ANTES de criar ponte nova — bloqueia (erro "monthly translation hours used up…") quando usadas ≥ teto×(1+tol)+pacote; `aposTrecho()` após cada STOP debita pacotes (alvo = usadas−teto, idempotente) e manda e-mail (Resend, 3 idiomas pelo `speaker_lang`) ao admin da igreja em 80% e 100%, uma vez por mês. Ponte já aberta NUNCA cai por teto; só idioma novo deixa de abrir. Cache 60 s. Sem service_role → nunca bloqueia.
- **Checkout** `kind: 'hour_pack'` → sessão `mode=payment` com `price_data` montado na hora (valor de `hour_pack[moeda]`); webhook `checkout.session.completed` com `metadata.kind=hour_pack` → insere `hour_packs` + `payments`.
- **Site**: aba Assinatura mostra horas usadas/teto (barra verde/âmbar/vermelha), horas de pacote e botão "Adicionar N horas extras — preço" (banner `?billing=pack`). `/platform`: coluna "Horas este mês" (vermelho se estourou), "Dar horas extras" + lista de pacotes na igreja, e em Costs & prices: teto por plano, tolerância, pacote (horas/USD/BRL/validade).
- Testado: RPCs via SQL simulando o Johnny (grant 5 h → usage_summary 5 h de pacote); `usoDaIgreja(2)` no servidor (Redeem = congregation, sem teto). **Não testado**: bloqueio real numa igreja starter (não há outra igreja) e compra real de pacote (precisa cartão).
- **Pendente do Johnny**: OK dos preços novos (US$69,90/119, R$249/499) — até lá Stripe US cobra 79,90/139 e BRL não tem preço. Quando ele confirmar: (1) `scripts/stripe-setup.mjs` → editar `valores` US e rodar com `STRIPE_BR_AMOUNT_STARTER=24900 STRIPE_BR_AMOUNT_GROWTH=49900`; (2) /platform → Costs & prices → preços; (3) aviso no HANDOFF.
- **22/09, mais tarde — PREÇOS NOVOS APLICADOS** (o Johnny já tinha mandado ajustar): Stripe US `price_1UIXX0…cm0Q08MJ` starter US$69,90 e `…JrEdJD0v` growth US$119 (lookup_key transferido; os `price_` antigos de 79,90/139 continuam ativos mas sem lookup_key e sem assinante); Stripe BR criados `price_1UIXX1…AP6VouRt` starter R$249 e `…mvUDHoyF` growth R$499; `STRIPE_BR_PRICE_*` no env; `platform_settings.plan_prices` = {starter 6990/24900, growth 11900/49900}; vitrine da landing (`components/Pricing.tsx`) mostra R$ em português e US$ em inglês/espanhol. Defaults do `stripe-setup.mjs` agora são esses valores (env `STRIPE_US_AMOUNT_*` / `STRIPE_BR_AMOUNT_*` sobrescrevem).

## 25. DEPLOY POR GITHUB ACTIONS (22/09/2026, noite) — NO AR, testado
Pedido do Johnny ("vamos criar um action"). Repo `JohnnyOliveirasp/translation`, workflows em `.github/workflows/`:
- **`deploy-site.yml`** — push em `main` tocando `livetranslate/site/**` (ou manual): `npm ci` + `tsc --noEmit` + `vite build` no runner (Node 22, variáveis `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` do repositório), tar → scp → extrai em `/mnt/volume/livetranslate/site`, confere que o `index-*.js` novo está no ar. ~30 s.
- **`deploy-api.yml`** — push tocando `livetranslate/api/src|scripts|next.config` (ou manual): `node --check` em lib/api/scripts, rsync `src/` (com `--delete`) e `scripts/`, build NO servidor (nvm 22) e `pm2 restart livetranslate-api`, verifica `/api/translate`. **Não toca em node_modules** (protocolo do CLAUDE.md). ~1–2 min.
- **Trava de culto** nos dois: NY domingo 07–14h e segunda 17–21h → o run termina com aviso e NÃO deploya (rodar de novo depois ou `force`). A API ainda checa `logs/custo.log` por ponte START sem STOP e aborta se houver tradução ao vivo.
- Segredo `DEPLOY_SSH_KEY` (ed25519 só para deploy; pública em `~/.ssh/authorized_keys` do Hetzner com comentário `github-actions-livetranslate-deploy`) e variáveis `DEPLOY_HOST_KEY`, `VITE_*`. Gravados com `gh secret/variable set` (o Johnny fez `gh auth login` em 22/09; a chave privada nunca passou pelo chat).
- **Fluxo agora**: commitar em `dev` → `git checkout main && git merge --ff-only dev && git push origin main dev` → a Action deploya. Deploy manual por scp continua funcionando como fallback. Mudança só em `docs/` não dispara nada.
- nginx: `location /` passou a mandar `Cache-Control: no-cache` no index.html (o navegador do Johnny ficou com a landing antiga depois de um deploy); `/assets/` segue `immutable` 30 d.
- Cupom de teste na conta Stripe US: coupon `T1OQ69Gs` (99%, once) + promotion code **`TESTE99`** (5 usos) — para o teste com igreja falsa que o Johnny vai fazer.

## 26. DEPOIMENTOS EM VÍDEO + PERFIL DA EMPRESA NO GOOGLE (22/09/2026, noite)
- **`/testimonials`** (só vídeos reais, pedido do Johnny): `site/src/pages/Testimonials.tsx` + conteúdo em `content/videoTestimonials.ts`. Card com moldura, capa (miniatura do YouTube ou `/assets/testimonials/<id>.jpg`) e botão Reproduzir — o player só carrega ao clicar; suporte a vídeo vertical (`portrait: true`). Link "Depoimentos" no menu (`Nav.tsx`) e botão na seção de depoimentos da landing. Bloco "Você usa o LiveTranslate?" com mailto e o botão "Avalie no Google" (aparece quando `GOOGLE_REVIEW_URL` for preenchido).
- **1º depoimento real NO AR**: Pastor Marcus Livoni, Ministério Celebrando a Recuperação (Celebrate Recovery) · Orlando, FL — YouTube Short `DUv5XURmJGs` (canal do site, criado pelo Johnny em 22/09). Transcrição feita com o skill /watch (Whisper): fala em português, elogia dublagem + legenda, ~1 s de atraso, "dois cliques". Vídeos NÃO vão para o git nem para o servidor (decisão dele: YouTube para não ocupar espaço); a pasta `/mnt/volume/livetranslate/site/assets/testimonials/` existe para o caso de algum ficar local.
- **Fotos dos cards da landing** (`content/testimonials.ts` → `photo`): geradas pelo PRÓPRIO Johnny (decisão dele; o agente registrou o alerta da regra da FTC sobre depoimentos falsos e manteve a etiqueta "Sample" nos 5 cards). Originais em `_videos/fotosCards/` (fora do git); web em `site/public/assets/people/*.jpg` (640 px).
- **Perfil da Empresa no Google — CRIADO pelo Johnny em 22/09** (conta johnny.oliveira@jcsolutionsus.com): nome LiveTranslate, categoria Empresa de Software, sem endereço, áreas Brasil e Estados Unidos, site, descrição em inglês. Estado: **"O Google está processando sua verificação. Isso pode levar até 5 dias"**, NÃO visível publicamente. **Próximo passo (só depois de verificado)**: na busca "minha empresa" logado → "Ler avaliações" → "Receber mais avaliações" → copiar o link curto (g.page/r/…/review) → colar em `GOOGLE_REVIEW_URL` em `content/videoTestimonials.ts` → push. Opcional: telefone no perfil.

## 27. SIGNUP (igreja primeiro) + IDIOMAS DO ORADOR RESTRITOS (22/09/2026, noite) — NO AR
- **/signup**: dados da igreja (nome, link, idioma do orador, país) vêm PRIMEIRO; depois "Como você quer entrar?" com Google ou nome/e-mail/senha. Quem volta do Google sem igreja cai DIRETO no formulário "Último passo — sua igreja" (o `/admin` redireciona; a tela intermediária só aparece se a criação falhar). Tela "Último passo" ganhou "Sair". Chave `a.signup.how` (EN/ES/PT).
- **Idiomas do orador = 7** (`SPEAKER_CODES` no site, `ORADOR` na API — andam juntos): en, pt-BR, es, it, fr, hi, zh-Hans. Decisão do Johnny: incluir os demais conforme forem testados ao vivo (até 22/09 só o inglês rodou em culto real; a ponte manda só `targetLanguageCode`, o Gemini detecta a origem). Os 16 continuam como destino. Settings: trocar o orador apaga a linha dele em `church_languages`.
- **Stripe BR (visto no dashboard em 22/09)**: status **"Paused — Payments"**, tarefa "Update your account representative — In review"; Cartões "Pending approval", Boleto/Google Pay desligados, **Pix ainda não aparece**. Checkout em BRL dá "No valid payment method types" até a análise terminar → depois ligar cartão/Pix/boleto em Settings → Payment methods e rodar de novo o teste de sessão. Teste com igreja falsa: só pela conta US (TESTE99) por enquanto.
- Ideia anotada (não feita): 2FA opcional (TOTP do Supabase) na aba Settings — deixar para depois do Stripe.

## 28. TESTE DE PAGAMENTO OK + idiomas flexíveis no trial + "ver como a igreja" (23/09/2026)
- **Teste real com igreja falsa FEITO** (ChurchChrist Test, id 3, slug `churchchrist-test`, admin johnny.oliveirasp1@gmail.com via Google, país US): checkout Starter com **TESTE99** → US$0,70 cobrado (fatura MUNSZO6N-0001), 3 eventos do webhook processados sem duplicata, igreja `active`, `payments` com 70 cents (aparece no "Entrou" do /platform), período até 23/10. Cancelou pelo portal → **BUG achado e corrigido**: a API nova do Stripe agenda o fim em `cancel_at` e deixa `cancel_at_period_end=false`; o webhook só lia o segundo e o painel seguia "ativa". `aplicarAssinatura` agora considera os dois. Registro da igreja 3 corrigido à mão (cancel_at_period_end=true). Cupom TESTE99: 1 de 5 usos gasto. A igreja 3 fica para os testes dos 7 idiomas de orador.
- **Aba Assinatura**: botão vermelho "Cancelar assinatura" (portal do Stripe direto na confirmação, `flow_data.subscription_cancel`), texto "Cartão, faturas e cancelamento são gerenciados com segurança pelo Stripe", e mensagem amigável quando já está agendado (`already_canceling`). Decisão do Johnny: manter o portal do Stripe, não reimplementar cartão/faturas no site.
- **Idiomas flexíveis no período grátis** (migration **0012**): `churches.language_limit` (null = limite do plano) editável só pela plataforma; trigger `churches_guard_plan_columns` impede o admin da igreja de mudar `plan`/`language_limit`/`trial_ends_at` (service_role passa; `cancel_subscription()` só mexe em `status`). `/platform` → igreja: campo "Limite de idiomas" + chips do catálogo inteiro para ligar/desligar (upsert — havia linhas `enabled=false` antigas na Redeem que davam `duplicate key`) + cadeado de bloqueio. Aba Languages da igreja mostra "Seu plano permite até N idiomas" em vez de falhar calada; Overview/Assinatura mostram **"Trial / Período de teste / Prueba"** enquanto `status=trial`. Webhook zera `language_limit` quando a assinatura paga entra.
- **"Abrir o painel de uma igreja"**: seletor no /platform (Shell) → `/admin?church=<id>` abre QUALQUER igreja como admin dela (faixa âmbar + "Voltar à plataforma"); `requireMember` da API aceita platform admin. **Bug corrigido de tabela**: `auth.tsx` não filtrava memberships por `user_id` — a plataforma lê todas pela RLS e o Johnny "herdava" a igreja de outro admin (era por isso que `?church=1` mostrava a Redeem). URLs de retorno do Stripe/e-mail de horas agora usam `?church=<id>`.
- **Signup**: igreja primeiro, depois "Como você quer entrar?" (Google ou e-mail); volta do Google sem igreja cai direto no formulário. **Orador restrito a 7 idiomas** (`SPEAKER_CODES`/`ORADOR`): en, pt-BR, es, it, fr, hi, zh-Hans.
- **Stripe BR** (visto 23/09 de manhã): ainda "Paused — Payments", representante em análise. Cartões "Pending approval", Pix não aparece. Rever em 24–25/09.
- **Redeem**: trial já está em **28/10** (Johnny estendeu). Idiomas dela agora 5: es, pt-BR, fr, zh-Hans, hi.
- Fora do LiveTranslate (e-mails do Google de 22/09): `ai-verse-clone` (FastCloner) precisa verificar `fastcloner.com` no Search Console (TXT no DNS da Cloudflare) e reenviar a verificação de marca até 21/12; `projectsn8n-490101` pode ignorar. Logo subido pelo Johnny → verificação completa.
- Ideia anotada: 2FA opcional (TOTP do Supabase) na aba Settings — depois.
- **BUG a corrigir (pedido do Johnny, 23/09)**: na aba Settings dá para mudar o nome da igreja, mas **não o link do ouvinte (slug)**. Precisa de campo editável com validação (único, minúsculas, sem espaço), redirect ou aviso de que QR/cartaz antigos param de funcionar, e manter `livekit_room` como está. Hoje só via SQL (feito para a igreja 3: `new-wine-community-church`; `livekit_room` continua `church-churchchrist-test`, funciona).
- **Campanha de vídeos (23/09)**: 5 criativos × 3 idiomas em `_videos/campanha-reels-2026-09/out/` (fora do git) — ver memória `campanha-videos`. Igreja 3 renomeada pelo Johnny para **New Wine Community Church** (logo enviado), `language_limit=5`. Nunca gravar com a Redeem: o culto de teste dispararia o e-mail do sermão falso para os ouvintes/destinatários reais.
