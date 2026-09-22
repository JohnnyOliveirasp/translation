// Stripe sem SDK (padrão do projeto: REST + fetch, como o Resend em email.js) — HANDOFF §23.
// DUAS contas: 'us' (JC Business Solutions USA, USD) e 'br' (LiveTranslate Brasil, BRL).
// A conta é decidida pelo PAÍS da igreja (churches.country): BR → br, resto → us.
// Chaves e ids só no .env.local do servidor (criados por scripts/stripe-setup.mjs); nunca no cliente.

import { createHmac, timingSafeEqual } from 'node:crypto';

export const CONTAS = ['us', 'br'];

export function contaDaIgreja(church) {
  if (church?.stripe_account) return church.stripe_account;          // já assinou por uma conta: nunca troca
  return String(church?.country || '').toUpperCase() === 'BR' ? 'br' : 'us';
}
export const moedaDaConta = conta => conta === 'br' ? 'brl' : 'usd';
export const provider = conta => `stripe_${conta}`;

function env(conta, sufixo) { return process.env[`STRIPE_${conta.toUpperCase()}_${sufixo}`] || null; }
export const chave = conta => env(conta, 'SECRET_KEY');
export const webhookSecret = conta => env(conta, 'WEBHOOK_SECRET');
export const portalConfig = conta => env(conta, 'PORTAL_CONFIG');
/** price_… do plano na conta; null = preço ainda não definido (caso do BRL até o Johnny fechar os valores). */
export const priceId = (conta, plan) => env(conta, `PRICE_${String(plan).toUpperCase()}`);
export const contaConfigurada = conta => !!(chave(conta) && webhookSecret(conta));

/** Corpo application/x-www-form-urlencoded no formato aninhado do Stripe (a[b][c]=x, lista[]=y). */
export function form(obj, prefix = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}[${k}]` : k;
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) v.forEach((x, i) => typeof x === 'object' ? form(x, `${key}[${i}]`, out) : out.append(`${key}[]`, String(x)));
    else if (typeof v === 'object') form(v, key, out);
    else out.append(key, String(v));
  }
  return out;
}

export class StripeError extends Error {
  constructor(msg, status, code) { super(msg); this.status = status; this.code = code; }
}

/** Chamada à API do Stripe na conta indicada. `idem` = Idempotency-Key (criação de sessão/customer). */
export async function stripe(conta, method, path, body, { idem } = {}) {
  const k = chave(conta);
  if (!k) throw new StripeError(`Stripe ${conta} não configurado`, 503, 'not_configured');
  const r = await fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    headers: {
      Authorization: `Basic ${Buffer.from(k + ':').toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      ...(idem ? { 'Idempotency-Key': idem } : {}),
    },
    body: body ? form(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new StripeError(j.error?.message || `Stripe ${r.status}`, r.status, j.error?.code);
  return j;
}

/**
 * Assinatura do webhook: header `Stripe-Signature: t=…,v1=…` = HMAC-SHA256(`${t}.${corpoCru}`, secret).
 * Tolerância de 5 min contra replay. Devolve o evento ou lança.
 */
export function verificarWebhook(corpoCru, header, secret, toleranciaSeg = 300) {
  if (!secret) throw new StripeError('webhook secret ausente', 503, 'not_configured');
  const partes = Object.fromEntries(String(header || '').split(',').map(p => p.split('=').map(s => s.trim())).filter(p => p.length === 2));
  const t = Number(partes.t);
  const v1 = partes.v1;
  if (!t || !v1) throw new StripeError('assinatura ausente', 400, 'bad_signature');
  if (Math.abs(Date.now() / 1000 - t) > toleranciaSeg) throw new StripeError('assinatura expirada', 400, 'bad_signature');
  const esperado = createHmac('sha256', secret).update(`${t}.${corpoCru}`).digest('hex');
  const a = Buffer.from(esperado), b = Buffer.from(v1);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new StripeError('assinatura inválida', 400, 'bad_signature');
  return JSON.parse(corpoCru);
}

/** status do Stripe → status da igreja (churches.status: trial | active | past_due | canceled). */
export function statusDaIgreja(subStatus) {
  switch (subStatus) {
    case 'trialing': return 'trial';
    case 'active': return 'active';
    case 'past_due': case 'unpaid': case 'incomplete': return 'past_due';
    case 'canceled': case 'incomplete_expired': return 'canceled';
    default: return null;
  }
}

/** plano a partir do price (lookup_key `lt_<plano>_<moeda>_month` ou metadata.lt_plan). */
export function planoDoPrice(price) {
  const m = /^lt_(starter|growth|congregation)_/.exec(price?.lookup_key || '');
  return m?.[1] || price?.metadata?.lt_plan || null;
}
