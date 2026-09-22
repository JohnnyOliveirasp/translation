// POST /api/billing/webhook/us | /br — eventos do Stripe (uma URL por conta). HANDOFF §23.
// Corpo CRU + assinatura HMAC; idempotente pela tabela billing_events (provider, event_id);
// grava com service_role (db-admin) porque o Stripe chega sem ninguém logado.
// Erro no tratamento → 500 (o Stripe tenta de novo); assinatura inválida → 400 (não tenta).

import { rest, igrejaPorId, igrejaPorCampo, atualizarIgreja, dbAdminConfigurado } from '@/lib/db-admin';
import { verificarWebhook, webhookSecret, provider, statusDaIgreja, planoDoPrice, stripe, CONTAS } from '@/lib/stripe';

const json = (data, status = 200) => Response.json(data, { status });
const iso = seg => seg ? new Date(seg * 1000).toISOString() : null;

export async function POST(req, { params }) {
  const { account } = await params;
  if (!CONTAS.includes(account)) return json({ error: 'unknown account' }, 404);
  if (!dbAdminConfigurado()) return json({ error: 'db not configured' }, 503);

  const corpo = await req.text();
  let evento;
  try {
    evento = verificarWebhook(corpo, req.headers.get('stripe-signature'), webhookSecret(account));
  } catch (e) {
    return json({ error: e.message }, e.status || 400);
  }

  const prov = provider(account);
  // idempotência: insere ignorando duplicado; se não voltou linha, já foi processado antes
  const inseridos = await rest('billing_events?on_conflict=provider,event_id', {
    method: 'POST', prefer: 'resolution=ignore-duplicates,return=representation',
    body: { provider: prov, event_id: evento.id, type: evento.type, payload: evento.data?.object ?? null },
  });
  if (!inseridos?.length) return json({ received: true, duplicate: true });
  const registro = inseridos[0];

  try {
    const churchId = await tratar(account, prov, evento);
    await rest(`billing_events?id=eq.${registro.id}`, { method: 'PATCH', prefer: 'return=minimal', body: { processed_at: new Date().toISOString(), church_id: churchId ?? null, error: null } });
    return json({ received: true });
  } catch (e) {
    await rest(`billing_events?id=eq.${registro.id}`, { method: 'PATCH', prefer: 'return=minimal', body: { error: String(e?.message || e).slice(0, 500) } }).catch(() => {});
    console.error(`[webhook ${account}] ${evento.type} ${evento.id}: ${e?.message || e}`);
    return json({ error: 'handler failed' }, 500);
  }
}

/** Acha a igreja pelo que o evento trouxer: metadata.church_id → subscription → customer. Devolve id ou null. */
async function acharIgreja(obj) {
  const metaId = obj?.metadata?.church_id || obj?.subscription_details?.metadata?.church_id || obj?.client_reference_id;
  if (metaId) { const c = await igrejaPorId(metaId); if (c) return c; }
  const sub = typeof obj?.subscription === 'string' ? obj.subscription : obj?.object === 'subscription' ? obj.id : null;
  if (sub) { const c = await igrejaPorCampo('stripe_subscription_id', sub); if (c) return c; }
  const cust = typeof obj?.customer === 'string' ? obj.customer : null;
  if (cust) { const c = await igrejaPorCampo('stripe_customer_id', cust); if (c) return c; }
  return null;
}

async function aplicarAssinatura(account, igreja, sub) {
  const item = sub.items?.data?.[0];
  const plano = planoDoPrice(item?.price);
  const status = statusDaIgreja(sub.status);
  const campos = {
    stripe_account: account,
    stripe_customer_id: typeof sub.customer === 'string' ? sub.customer : igreja.stripe_customer_id,
    stripe_subscription_id: sub.id,
    current_period_end: iso(item?.current_period_end ?? sub.current_period_end),
    cancel_at_period_end: !!sub.cancel_at_period_end,
  };
  if (plano && plano !== 'congregation') campos.plan = plano;
  if (status) campos.status = status;
  // trial da assinatura no Stripe = acesso garantido até lá
  if (sub.status === 'trialing' && sub.trial_end) campos.trial_ends_at = iso(sub.trial_end);
  // ativa: o acesso passa a ser regido pelo período pago
  if (sub.status === 'active' && campos.current_period_end) campos.trial_ends_at = campos.current_period_end;
  await atualizarIgreja(igreja.id, campos);
}

async function tratar(account, prov, evento) {
  const obj = evento.data?.object;
  switch (evento.type) {
    case 'checkout.session.completed': {
      const igreja = await acharIgreja(obj);
      if (!igreja) throw new Error('igreja não encontrada para a sessão');
      if (obj.mode === 'subscription' && typeof obj.subscription === 'string') {
        const sub = await stripe(account, 'GET', `subscriptions/${obj.subscription}`);
        await aplicarAssinatura(account, igreja, sub);
      }
      return igreja.id;
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const igreja = await acharIgreja(obj);
      if (!igreja) throw new Error('igreja não encontrada para a assinatura');
      await aplicarAssinatura(account, igreja, obj);
      return igreja.id;
    }
    case 'customer.subscription.deleted': {
      const igreja = await acharIgreja(obj);
      if (!igreja) return null;
      await atualizarIgreja(igreja.id, { status: 'canceled', cancel_at_period_end: false, current_period_end: iso(obj.ended_at ?? obj.canceled_at) });
      return igreja.id;
    }
    case 'invoice.paid': {
      const igreja = await acharIgreja(obj);
      if (!igreja) throw new Error('igreja não encontrada para a fatura');
      const linha = obj.lines?.data?.[0];
      if ((obj.amount_paid ?? 0) > 0) {
        await rest('payments?on_conflict=invoice_id', {
          method: 'POST', prefer: 'resolution=ignore-duplicates,return=minimal',
          body: {
            church_id: igreja.id, provider: prov, invoice_id: obj.id,
            amount_cents: obj.amount_paid, currency: String(obj.currency || '').toLowerCase(),
            paid_at: iso(obj.status_transitions?.paid_at) ?? new Date().toISOString(),
            period_start: iso(linha?.period?.start), period_end: iso(linha?.period?.end),
            hosted_url: obj.hosted_invoice_url ?? null,
          },
        });
      }
      // fatura paga com valor = assinatura em dia (a fatura de R$0 do início do trial não muda nada)
      if ((obj.amount_paid ?? 0) > 0) {
        const campos = { status: 'active' };
        if (linha?.period?.end) { campos.current_period_end = iso(linha.period.end); campos.trial_ends_at = iso(linha.period.end); }
        await atualizarIgreja(igreja.id, campos);
      }
      return igreja.id;
    }
    case 'invoice.payment_failed': {
      const igreja = await acharIgreja(obj);
      if (!igreja) return null;
      await atualizarIgreja(igreja.id, { status: 'past_due' });
      return igreja.id;
    }
    default:
      return null;
  }
}
