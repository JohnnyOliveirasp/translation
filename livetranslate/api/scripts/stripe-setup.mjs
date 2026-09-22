#!/usr/bin/env node
// Configura o Stripe das DUAS contas (US = JC Business Solutions USA, BR = LiveTranslate Brasil)
// pela API, sem SDK — HANDOFF §22/§23. Idempotente: pode rodar de novo à vontade.
//
//   set -a; . .env.local; set +a; node scripts/stripe-setup.mjs .env.local
//
// Para cada conta com STRIPE_<X>_SECRET_KEY no ambiente:
//   - produto por plano (starter / growth), achado por metadata.lt_plan
//   - preço mensal por plano×moeda, achado por lookup_key `lt_<plano>_<moeda>_month`
//     (BRL só é criado se STRIPE_BR_AMOUNT_STARTER / _GROWTH existirem — Johnny ainda vai negociar)
//   - webhook https://livetranslate.church/api/billing/webhook/<us|br>
// Grava no .env.local (argumento) as linhas STRIPE_<X>_PRICE_STARTER / _GROWTH / _WEBHOOK_SECRET.
// NUNCA imprime chave nem segredo — só ids públicos (prod_…, price_…, we_…).

import { readFileSync, writeFileSync } from 'node:fs';

const ENV_FILE = process.argv[2] || '.env.local';
const SITE = (process.env.PUBLIC_URL || 'https://livetranslate.church').replace(/\/$/, '');
const CONTAS = [
  { tag: 'US', moeda: 'usd', valores: { starter: 7990, growth: 13900 } },
  { tag: 'BR', moeda: 'brl', valores: { starter: num(process.env.STRIPE_BR_AMOUNT_STARTER), growth: num(process.env.STRIPE_BR_AMOUNT_GROWTH) } },
];
const PLANOS = {
  starter: { nome: 'LiveTranslate Starter', desc: 'Live sermon translation — up to 2 languages, unlimited listeners.' },
  growth:  { nome: 'LiveTranslate Growth',  desc: 'Live sermon translation — up to 5 languages, unlimited listeners.' },
};
const EVENTOS = ['checkout.session.completed', 'customer.subscription.created', 'customer.subscription.updated',
  'customer.subscription.deleted', 'invoice.paid', 'invoice.payment_failed'];

function num(v) { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.round(n) : null; }

function form(obj, prefix = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}[${k}]` : k;
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) v.forEach((x, i) => typeof x === 'object' ? form(x, `${key}[${i}]`, out) : out.append(`${key}[]`, String(x)));
    else if (typeof v === 'object') form(v, key, out);
    else out.append(key, String(v));
  }
  return out;
}

function cliente(key) {
  return async (method, path, body) => {
    const r = await fetch(`https://api.stripe.com/v1/${path}`, {
      method,
      headers: { Authorization: `Basic ${Buffer.from(key + ':').toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body ? form(body) : undefined,
    });
    const j = await r.json();
    if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${j.error?.message ?? ''}`);
    return j;
  };
}

const envLinhas = new Map();
function setEnv(k, v) { envLinhas.set(k, v); }

for (const conta of CONTAS) {
  const key = process.env[`STRIPE_${conta.tag}_SECRET_KEY`];
  if (!key) { console.log(`[${conta.tag}] sem STRIPE_${conta.tag}_SECRET_KEY — pulando`); continue; }
  const api = cliente(key);
  console.log(`\n[${conta.tag}] moeda ${conta.moeda}`);

  // produtos
  const existentes = (await api('GET', 'products?active=true&limit=100')).data;
  for (const [plano, info] of Object.entries(PLANOS)) {
    let prod = existentes.find(p => p.metadata?.lt_plan === plano);
    if (!prod) {
      prod = await api('POST', 'products', { name: info.nome, description: info.desc, metadata: { lt_plan: plano } });
      console.log(`[${conta.tag}] produto ${plano} criado: ${prod.id}`);
    } else console.log(`[${conta.tag}] produto ${plano} já existe: ${prod.id}`);

    // preço mensal
    const lookup = `lt_${plano}_${conta.moeda}_month`;
    const achados = (await api('GET', `prices?lookup_keys[]=${lookup}&active=true&limit=1`)).data;
    let price = achados[0];
    const valor = conta.valores[plano];
    if (!price && !valor) { console.log(`[${conta.tag}] preço ${plano} ${conta.moeda}: valor ainda não definido — pulando`); continue; }
    if (price && valor && price.unit_amount !== valor) {
      // valor mudou: novo preço fica com o lookup_key (transfer_lookup_key) e o antigo continua válido para quem já assina
      price = await api('POST', 'prices', { product: prod.id, currency: conta.moeda, unit_amount: valor, recurring: { interval: 'month' }, lookup_key: lookup, transfer_lookup_key: 'true', metadata: { lt_plan: plano } });
      console.log(`[${conta.tag}] preço ${plano} atualizado para ${valor}: ${price.id}`);
    } else if (!price) {
      price = await api('POST', 'prices', { product: prod.id, currency: conta.moeda, unit_amount: valor, recurring: { interval: 'month' }, lookup_key: lookup, metadata: { lt_plan: plano } });
      console.log(`[${conta.tag}] preço ${plano} criado (${valor} ${conta.moeda}/mês): ${price.id}`);
    } else console.log(`[${conta.tag}] preço ${plano} já existe (${price.unit_amount} ${conta.moeda}): ${price.id}`);
    setEnv(`STRIPE_${conta.tag}_PRICE_${plano.toUpperCase()}`, price.id);
  }

  // Customer Portal (trocar cartão, cancelar/reativar, faturas) — precisa de uma configuração
  if (!process.env[`STRIPE_${conta.tag}_PORTAL_CONFIG`]) {
    const configs = (await api('GET', 'billing_portal/configurations?limit=100')).data;
    let cfg = configs.find(c => c.metadata?.lt === 'portal' && c.active);
    if (!cfg) {
      cfg = await api('POST', 'billing_portal/configurations', {
        business_profile: { headline: 'LiveTranslate', privacy_policy_url: `${SITE}/privacy`, terms_of_service_url: `${SITE}/terms` },
        default_return_url: `${SITE}/admin?church=1`,
        features: {
          customer_update: { enabled: 'true', allowed_updates: ['email', 'name', 'address', 'tax_id'] },
          invoice_history: { enabled: 'true' },
          payment_method_update: { enabled: 'true' },
          subscription_cancel: { enabled: 'true', mode: 'at_period_end', cancellation_reason: { enabled: 'true', options: ['too_expensive', 'missing_features', 'switched_service', 'unused', 'other'] } },
        },
        metadata: { lt: 'portal' },
      });
      console.log(`[${conta.tag}] portal criado: ${cfg.id}`);
    } else console.log(`[${conta.tag}] portal já existe: ${cfg.id}`);
    setEnv(`STRIPE_${conta.tag}_PORTAL_CONFIG`, cfg.id);
  }

  // webhook
  const url = `${SITE}/api/billing/webhook/${conta.tag.toLowerCase()}`;
  const hooks = (await api('GET', 'webhook_endpoints?limit=100')).data.filter(w => w.url === url);
  const jaTemSegredo = !!process.env[`STRIPE_${conta.tag}_WEBHOOK_SECRET`];
  if (hooks.length && jaTemSegredo) {
    console.log(`[${conta.tag}] webhook já existe: ${hooks[0].id}`);
  } else {
    // sem o segredo em mãos o endpoint não serve (o Stripe só mostra o segredo na criação) → recria
    for (const w of hooks) { await api('DELETE', `webhook_endpoints/${w.id}`); console.log(`[${conta.tag}] webhook antigo removido: ${w.id}`); }
    const w = await api('POST', 'webhook_endpoints', { url, enabled_events: EVENTOS, description: `LiveTranslate ${conta.tag}`, api_version: '2025-08-27.basil' });
    console.log(`[${conta.tag}] webhook criado: ${w.id} → ${url}`);
    setEnv(`STRIPE_${conta.tag}_WEBHOOK_SECRET`, w.secret);
  }
}

// grava no .env.local (substitui linhas existentes, nunca imprime valores)
if (envLinhas.size) {
  let txt = '';
  try { txt = readFileSync(ENV_FILE, 'utf8'); } catch {}
  const linhas = txt.split('\n').filter(l => !envLinhas.has(l.split('=')[0]));
  while (linhas.length && linhas[linhas.length - 1] === '') linhas.pop();
  for (const [k, v] of envLinhas) linhas.push(`${k}=${v}`);
  writeFileSync(ENV_FILE, linhas.join('\n') + '\n', { mode: 0o600 });
  console.log(`\n${ENV_FILE}: gravadas ${[...envLinhas.keys()].join(', ')}`);
}
