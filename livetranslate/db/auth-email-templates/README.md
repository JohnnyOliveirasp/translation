# Templates de e-mail do Supabase Auth (código de 6 dígitos)

> **STATUS 27/08/2026: JÁ CONFIGURADO no painel** (Claude, via navegador): Confirm signup e Reset password
> com `{{ .Token }}`, assunto `Your LiveTranslate code: {{ .Token }}`, Site URL `https://livetranslate.church`,
> redirects prod + 127.0.0.1:5180/5181, Confirm email ON, só provedor Email (Google e demais OFF).
> Este arquivo fica como fonte de verdade para reaplicar se algo mudar. Falta só o SMTP próprio (produção).

O site usa **código** (OTP) em vez de link para confirmar o cadastro e recuperar a senha —
decisão do Johnny (26/08). Para isso os templates do Supabase precisam conter `{{ .Token }}`.

## Onde colar
Painel do Supabase → projeto **livetranslate** → **Authentication → Email Templates**:

| Template no painel | Arquivo aqui | Usado por |
|---|---|---|
| Confirm signup | `confirm-signup.html` | /signup, /invite (código de confirmação) |
| Reset password | `reset-password.html` | /recover (código de recuperação) |
| Magic Link | `magic-link.html` | (não usado hoje; deixa igual por segurança) |

Assunto sugerido: `Your LiveTranslate code: {{ .Token }}`

## Configurações (Authentication → Settings / URL Configuration)
- **Site URL**: `https://livetranslate.church`
- **Redirect URLs**: `https://livetranslate.church/**`, `http://127.0.0.1:5180/**` (dev)
- **Enable email confirmations**: ON (padrão)
- **OTP length**: 6 · **OTP expiry**: 3600s (padrão) — pode reduzir para 600s
- **Enable Google/other providers**: OFF (só e-mail + senha)

## Produção: SMTP próprio
O SMTP embutido do Supabase é limitado (poucos e-mails por hora, só para testes).
Em **Authentication → SMTP Settings** configurar o provedor (Resend / SES / Google Workspace)
com remetente `hello@livetranslate.church`. Sem isso, cadastros em volume falham.
