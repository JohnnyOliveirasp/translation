# LiveTranslate — Planejamento do produto
*Consolidado em 25/08/2026 a partir das conversas de 19–25/08. Fonte de verdade para retomar a sessão.*

## 1. Identidade
- **Nome/domínio:** LiveTranslate — **livetranslate.church** (Johnny vai registrar). Alternativa .com sugerida: sundaytranslate.com.
- **Posicionamento:** tradução ao vivo de culto por IA, speech-to-speech, sem operador. Membro escaneia QR e ouve o sermão no idioma dele no celular. **Diferencial único no mercado: detecção automática de louvor × pregação (auto-mute)** — dar nome próprio (sugestão: "Worship Sense™"; ® só após registro).
- **Claims que só nós podemos fazer** (validados pela pesquisa em `_bugs/pesquisa-concorrentes-2026-08-25.md`):
  1. Muta sozinho no louvor — ninguém detecta automaticamente (Wordly = botão manual).
  2. Voz natural contínua, não TTS frase-a-frase picotado.
  3. Mensal fixo, "domingos ilimitados", ouvintes ilimitados, sem add-on por idioma, sem cotação.
  4. "Um cabo, um QR, nada para vigiar" — funciona com o celular no bolso/tela bloqueada (já resolvido no v1).
  5. Suporte no domingo.
  6. "Seus minutos nunca queimam no louvor" — automático.
- **História real para a landing:** 1º culto (09/08) — ouvinte hispânica ouviu a pregação inteira e elogiou espontaneamente. Padrão do mercado: depoimento "entendeu o sermão pela 1ª vez / chorou".

## 2. Preços (fechados)
| Plano | Preço | Inclui | Custo est. | Margem |
|---|---|---|---|---|
| 2 idiomas | **$79.90/mês** | 1 culto/domingo, ouvintes ilimitados | ~$17–22 | ~$58–63 |
| 5 idiomas | **$139/mês** | idem | ~$35–48 | ~$91–104 |
| 6+ idiomas | **Contact us** | negociado | — | — |
- Primeiro domingo grátis. Fair-use na letra miúda (~25–30h/mês). Idioma extra avulso e desconto anual: ideias, não fechados.
- Custo medido: ~US$1,40/idioma/hora de culto (Gemini Live translate, preview — já subiu 1×; manter gordura 30–40%). Auto-mute reduz custo (louvor mutado não cobra).
- Setup com branding da igreja (~$200) discutido em 13/08 — logo + QR personalizado.
- Mercado: Wordly ~$75/h (cotação, contrato anual); OneAccord $150/5h; Aurelo €49–199; baratos com teto de horas: Kaleo $24, Selah $29, Exbabel $39, Breeze $8/sem, Hope $13.92. Nosso $79.90 NÃO é o mais barato — vende por valor (ilimitado + auto-mute + PDF).

## 3. Site (landing)
- **3 idiomas: EN / ES / PT.** Comprador principal: igreja americana.
- **Estilo:** o prompt de referência "Cinematic Hero" — React + Vite + Tailwind + TS; fontes **Instrument Serif** (display) + **Inter** (corpo); preto #000 / cinza #6F6F6F / branco; vídeo de fundo com loop fade-in/out (0,5s) via requestAnimationFrame + gradiente; nav com logo, menu, CTA pill preto; manchete text-5xl→8xl, line-height 0,95, letter-spacing −2.46px, palavras em itálico cinza; animações fade-rise (0,8s ease-out, delays 0,2/0,4s). Vídeo: stock/abstrato de placeholder (o do prompt é de terceiros — não usar).
- **Seções:** hero → **trial por QR na página** (escaneia, fala uma frase, ouve traduzida — sem cadastro; ninguém no mercado tem) → como funciona (3 passos) → seção de motion do auto-mute (banner MUTED→TRANSLATING) → prova real → pricing ($79.90 / $139 / contact) → FAQ (objeções) → CTA "Try it this Sunday".
- **Padrões de copy do mercado:** gancho Ap 7:9 / Mt 28:19; "No app. Scan QR."; "X igrejas em Y países"; comparação com receptores FM ($5–20K); "IA treinada na Bíblia".
- **FAQ — objeções do pastor:** WiFi ruim do santuário; vai errar Escritura/nomes?; e os louvores?; idosos sem celular; substitui o intérprete humano?

## 4. Arquitetura do produto (multi-tenant)
```
TradutorIgreja/
└── livetranslate/          ← pasta definitiva (futuro default do Johnny)
    ├── CLAUDE.md           ← regras (herda protocolo de dependências)
    ├── site/               ← landing 3 idiomas + signup/login
    ├── app/                ← produto: evolução v1 + POC3 (broadcast = POC3 auto; ouvinte = v1)
    ├── db/                 ← schema + migrações
    └── docs/               ← este arquivo, pricing, análises
```
- Hoje tudo é 1 igreja (sala `culto`, senha no .env). Produto = por igreja: sala própria, idiomas, QR, senha, medição de custo.
- **Banco: SQLite** em arquivo no volume do Hetzner (backup = copiar arquivo); Postgres só se doer. Tabelas: `igrejas` (nome, slug → URL `livetranslate.church/{slug}`, idioma do orador, plano, logo), `usuarios` (email, hash, igreja, papel), `assinaturas` (plano, status, stripe_id), `cultos` (igreja, início, fim, minutos por idioma → fatura + controle de lucro), `idiomas_igreja`, `convites` (email, token), `ouvintes_email` (opt-in do PDF).
- **Papéis:** admin da igreja (assinante: histórico, métricas, operadores, logo, idiomas, assinatura) · operador (convidado por e-mail, só transmite) · super-admin (Johnny: todas as igrejas, custos reais, margem — custo NUNCA para a igreja).
- **Logo da igreja:** upload no admin, só PNG/JPG (SVG bloqueado), ≤2MB, redimensionado (~512px WebP), salvo em `/uploads/{igreja}/`; páginas carregam por slug; fallback = nome em Instrument Serif / monograma.
- **Stripe:** reaproveitar configuração do projeto `C:\Users\johnn\Downloads\Desenvolvimento\Codigos\Python\ResumePro`. Fase final; antes, ativação manual das primeiras igrejas.
- **Igreja atual** continua no v1 intocado até o produto estar ensaiado; migra como cliente nº 1.

## 5. Pós-culto (PDF por e-mail) — feature-chave
1. Durante o culto guardar transcrição do original (inglês) e das traduções (a ponte já recebe `inputAudioTranscription`/`outputAudioTranscription` — hoje descartadas).
2. Após o culto: LLM limpa (pontuação, gagueiras, frases ruins), **detecta versículos e insere o texto bíblico correto**, resumo, estudos relacionados, perguntas para pequenos grupos → **PDF em inglês primeiro**, depois nos idiomas dos ouvintes. **Glossário entra aqui** (pós-processamento determinístico — a POC2 renasce como feature).
3. **Pastor recebe por e-mail** (campo "quem recebe o sermão" no admin — pastor, secretária) — **só revisa/aprova, não corrige**. Chave no admin **"Revisar antes de enviar aos ouvintes"**: ligada no início (aprova com 1 clique), desliga quando confiar → envio automático.
4. **Ouvinte** informa e-mail na página se quiser receber → PDF no idioma dele; e-mail vira base de contatos da igreja (visitantes) e nossa (com consentimento explícito).
- SMS/WhatsApp: depois (Twilio custa por msg; WhatsApp exige aprovação Meta). E-mail resolve.
- Custo ~centavos/culto. Pendente escolher: serviço de e-mail e gerador de PDF (protocolo de dependências). Cuidado: versões bíblicas licenciadas (NIV/NVI) — usar versão livre ou citação curta.
- Validação de mercado: ouvinte da Sunflower tirou 20 screenshots das legendas para reler versículos.

## 6. Ordem de construção
1. Landing 3 idiomas (hero do prompt) + trial por QR
2. Signup/login + admin (operadores, logo, métricas, histórico, recebedores do sermão)
3. Broadcast (POC3) e ouvinte parametrizados por igreja
4. Pós-culto: transcrição → revisão → PDF por e-mail com opt-in
5. Stripe
6. Depois: telão/OBS (**pronto na gaveta**, igreja já usa o telão — pode não autorizar), voz clonada como add-on via API (não construir), SMS.
- **ProPresenter: NÃO** (sem budget/assinatura).

## 7. Estado técnico atual (25/08)
- v1 em produção (traducao.jcsolutionsus.com), Hetzner 91.99.15.213, PM2 `traducao` porta 4017.
- **POC3 /poc3/broadcast.html = broadcast definitivo**: regra relativa calibrada com CSV do culto 23/08 (mic na lapela → música abafada): média móvel 5 janelas; MUTA se smMusic≥0,15 e >smFala×2 por 4 jan; DESMUTA se smFala≥0,30 e >smMusic por 8 jan. Simulação: 3 eventos, zero falso-mute em 38 min. **Pendente: ensaio antes do culto 30/08.**
- Deployado 24/08: `logs/sessao.log` (sessões Gemini, goAway, chaveio, MUTE/UNMUTE), `/api/poc3-log` → `logs/detector-AAAAMMDD.log` (retenção 30d), cleanup diário preserva logs PM2 do traducao em `/mnt/volume/traducao/logs-pm2/`. CSV local extinto.
- Aberto: trocas de voz nas renovações (blip mesmo com NO_RESUME=1) — diagnosticar com sessao.log do 30/08.
- Feedback de ouvinte (16/08): tom monótono, pausas curtas, "support→suportar", tempo verbal — limitações do S2S; resolvidas no PDF/glossário e futuro pipeline 3 estágios.

## 8. Logo (pendente)
- Precisa de impacto; funcionar em preto no branco (estilo editorial do site) e em pequeno (favicon, QR). Conceitos a explorar: onda sonora + cruz; línguas de fogo (Pentecostes = idiomas); globo/campanário + ondas; monograma LT.
