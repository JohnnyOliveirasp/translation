// POST /api/billing/portal { slug } → { url } do Customer Portal do Stripe (cartão, cancelar/reativar, faturas).
// Só o ADMIN da igreja, e só quem já tem customer no Stripe. HANDOFF §23.

import { requireMember } from '@/lib/tenant';
import { igrejaPorSlug } from '@/lib/db-admin';
import { stripe, StripeError, portalConfig } from '@/lib/stripe';

const json = (data, status = 200) => Response.json(data, { status });
const SITE = (process.env.PUBLIC_URL || 'https://livetranslate.church').replace(/\/$/, '');

export async function POST(req) {
  try {
    const { slug, flow } = await req.json();   // flow: 'cancel' abre o portal direto na confirmação de cancelamento
    if (!slug) return json({ error: 'missing slug' }, 400);
    const auth = await requireMember(req, slug);
    if (auth.error) return json({ error: auth.error }, auth.status);
    if (auth.role !== 'admin') return json({ error: 'church admin only' }, 403);

    const igreja = await igrejaPorSlug(slug);
    if (!igreja?.stripe_customer_id || !igreja.stripe_account) return json({ error: 'no billing account yet', code: 'no_customer' }, 409);

    const body = { customer: igreja.stripe_customer_id, return_url: `${SITE}/admin?church=${igreja.id}` };
    const cfg = portalConfig(igreja.stripe_account);
    if (cfg) body.configuration = cfg;
    // Botão "Cancelar assinatura" da aba (22/09): pula a lista do portal e vai direto à confirmação.
    if (flow === 'cancel' && igreja.stripe_subscription_id) {
      body.flow_data = {
        type: 'subscription_cancel',
        subscription_cancel: { subscription: igreja.stripe_subscription_id },
        after_completion: { type: 'redirect', redirect: { return_url: body.return_url } },
      };
    }
    const s = await stripe(igreja.stripe_account, 'POST', 'billing_portal/sessions', body);
    return json({ url: s.url });
  } catch (e) {
    if (e instanceof StripeError) {
      // já agendado para cancelar (o site estava desatualizado): código próprio para o site mostrar texto amigável
      if (/already set to be canceled/i.test(e.message)) return json({ error: e.message, code: 'already_canceling' }, 409);
      return json({ error: e.message, code: e.code }, e.status >= 500 ? 502 : e.status);
    }
    return json({ error: e.message }, 500);
  }
}
