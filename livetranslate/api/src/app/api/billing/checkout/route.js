// POST /api/billing/checkout { slug, plan } → { url } da tela de pagamento do Stripe (assinatura mensal).
// Só o ADMIN da igreja. A conta Stripe (us|br) vem do país da igreja; o trial que ainda resta
// vira `trial_end` da assinatura (a igreja não paga duas vezes o mês grátis). HANDOFF §23.

import { requireMember } from '@/lib/tenant';
import { igrejaPorSlug, atualizarIgreja, dbAdminConfigurado } from '@/lib/db-admin';
import { stripe, StripeError, contaDaIgreja, priceId, contaConfigurada } from '@/lib/stripe';

const json = (data, status = 200) => Response.json(data, { status });
const SITE = (process.env.PUBLIC_URL || 'https://livetranslate.church').replace(/\/$/, '');

export async function POST(req) {
  try {
    const { slug, plan } = await req.json();
    if (!slug) return json({ error: 'missing slug' }, 400);
    if (!['starter', 'growth'].includes(plan)) return json({ error: 'invalid plan' }, 400);
    const auth = await requireMember(req, slug);
    if (auth.error) return json({ error: auth.error }, auth.status);
    if (auth.role !== 'admin') return json({ error: 'church admin only' }, 403);
    if (!dbAdminConfigurado()) return json({ error: 'billing not configured' }, 503);

    const igreja = await igrejaPorSlug(slug);
    if (!igreja) return json({ error: 'church not found' }, 404);
    if (igreja.stripe_subscription_id && igreja.status !== 'canceled') return json({ error: 'already subscribed', code: 'already_subscribed' }, 409);

    const conta = contaDaIgreja(igreja);
    if (!contaConfigurada(conta)) return json({ error: `billing for ${conta} not configured` }, 503);
    const price = priceId(conta, plan);
    if (!price) return json({ error: 'price not available yet for your country', code: 'price_pending' }, 409);

    // customer: um por igreja, por conta
    let customer = igreja.stripe_account === conta ? igreja.stripe_customer_id : null;
    if (!customer) {
      const c = await stripe(conta, 'POST', 'customers', {
        email: auth.user.email, name: igreja.name,
        metadata: { church_id: String(igreja.id), slug: igreja.slug },
      }, { idem: `customer-${conta}-${igreja.id}` });
      customer = c.id;
      await atualizarIgreja(igreja.id, { stripe_customer_id: customer, stripe_account: conta });
    }

    // trial restante (o Stripe exige pelo menos 48 h no futuro)
    const trialEnd = igreja.trial_ends_at ? Math.floor(new Date(igreja.trial_ends_at).getTime() / 1000) : 0;
    const minimo = Math.floor(Date.now() / 1000) + 48 * 3600;
    const subscription_data = { metadata: { church_id: String(igreja.id), slug: igreja.slug, plan } };
    if (igreja.status === 'trial' && trialEnd > minimo) subscription_data.trial_end = trialEnd;

    const sessao = await stripe(conta, 'POST', 'checkout/sessions', {
      mode: 'subscription',
      customer,
      client_reference_id: String(igreja.id),
      line_items: [{ price, quantity: 1 }],
      subscription_data,
      payment_method_collection: 'always',
      allow_promotion_codes: 'true',
      billing_address_collection: 'auto',
      locale: 'auto',
      success_url: `${SITE}/admin?church=1&billing=success`,
      cancel_url: `${SITE}/admin?church=1&billing=cancel`,
      metadata: { church_id: String(igreja.id), slug: igreja.slug, plan },
    });
    return json({ url: sessao.url });
  } catch (e) {
    if (e instanceof StripeError) return json({ error: e.message, code: e.code }, e.status >= 500 ? 502 : e.status);
    return json({ error: e.message }, 500);
  }
}
