// Envio de e-mail transacional via Resend (REST, sem SDK — zero dependência nova).
// Padrão trazido do PlatformLucasArrial (frontend/src/lib/email/resend.ts), com o que o
// sermão exige a mais: anexo PDF, versão em texto puro, cabeçalhos (List-Unsubscribe),
// Idempotency-Key e nova tentativa em 429/5xx.
//
// Envs (em .env.local, nunca no git):
//   RESEND_API_KEY     re_...
//   RESEND_FROM_EMAIL  só o endereço verificado (ex.: sermons@livetranslate.church);
//                      o NOME de exibição é o da igreja, montado aqui
//   RESEND_REPLY_TO    opcional
//
// ⚠️ As três saídas LOGAM. No outro projeto (incidente #305) 19 de 19 avisos falharam
// calados e ninguém soube se era chave ausente, domínio recusado ou rede. Aqui toda saída
// vai para logs/email.log — com o endereço MASCARADO, nunca inteiro.

import { appendFileSync } from 'node:fs';

const RESEND_API = 'https://api.resend.com/emails';

export const emailConfigurado = () => Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL);

/** "joao@gmail.com" → "jo***@gmail.com" — dá para rastrear sem expor ninguém no log. */
export function mascarar(email) {
  const [u = '', d = '?'] = String(email).split('@');
  return `${u.slice(0, 2)}***@${d}`;
}

export function logEmail(linha) {
  try { appendFileSync('logs/email.log', `${new Date().toISOString()} ${linha}\n`); } catch { /* sem pasta de logs */ }
  console.log(`[email] ${linha}`);
}

const pausa = ms => new Promise(r => setTimeout(r, ms));

/**
 * Envia UM e-mail para UM destinatário. Nunca lança: devolve { ok, id?, motivo? }.
 * `anexos` = [{ nome, buf }]. `chave` vira Idempotency-Key (o Resend não reenvia a mesma
 * chave em 24h — protege contra duplicata se a gente repetir depois de um timeout).
 */
export async function enviarEmail({ para, assunto, html, texto, nomeRemetente, anexos = [], cabecalhos = {}, chave, responderPara }) {
  const apiKey = process.env.RESEND_API_KEY;
  const endereco = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !endereco) {
    logEmail(`IGNORADO: falta ${[!apiKey && 'RESEND_API_KEY', !endereco && 'RESEND_FROM_EMAIL'].filter(Boolean).join(' e ')} — para=${mascarar(para)} assunto="${assunto.slice(0, 80)}"`);
    return { ok: false, motivo: 'nao-configurado' };
  }

  const nome = String(nomeRemetente || 'LiveTranslate').replace(/["<>\r\n]/g, '').slice(0, 70);
  const replyTo = responderPara || process.env.RESEND_REPLY_TO;
  const corpo = {
    from: `"${nome}" <${endereco}>`,
    to: [para],
    subject: assunto,
    html,
    ...(texto ? { text: texto } : {}),
    ...(replyTo ? { reply_to: replyTo } : {}),
    ...(anexos.length ? { attachments: anexos.map(a => ({ filename: a.nome, content: a.buf.toString('base64') })) } : {}),
    ...(Object.keys(cabecalhos).length ? { headers: cabecalhos } : {}),
  };

  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    try {
      const res = await fetch(RESEND_API, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          ...(chave ? { 'Idempotency-Key': chave } : {}),
        },
        body: JSON.stringify(corpo),
      });
      if (res.ok) {
        const j = await res.json().catch(() => ({}));
        logEmail(`OK para=${mascarar(para)} id=${j.id ?? '?'} anexos=${anexos.length} assunto="${assunto.slice(0, 80)}"`);
        return { ok: true, id: j.id };
      }
      // status + corpo: é o que separa 403 (domínio não verificado) de 422 (endereço inválido)
      const txt = await res.text().catch(() => '');
      const repete = res.status === 429 || res.status >= 500;
      logEmail(`RECUSADO HTTP ${res.status} (tentativa ${tentativa}${repete && tentativa < 3 ? ', vai repetir' : ''}) para=${mascarar(para)} corpo=${txt.slice(0, 300)}`);
      if (!repete) return { ok: false, motivo: `http-${res.status}` };
    } catch (e) {
      logEmail(`FALHOU (exceção, tentativa ${tentativa}): ${e?.message ?? e} para=${mascarar(para)}`);
    }
    await pausa(tentativa * 2500);
  }
  return { ok: false, motivo: 'esgotou-tentativas' };
}
