import { useEffect, useState } from 'react';
import { Check, ExternalLink, Loader2 } from 'lucide-react';
import { supabase, type Church } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { useLang } from '../../i18n';
import { PLAN_LIMITS } from '../../lib/languages';
import { ErrorMsg } from '../auth/ui';

/**
 * Aba ASSINATURA da igreja — Stripe com duas contas (HANDOFF §23).
 * - Sem assinatura: escolhe o plano e vai para a tela de pagamento do Stripe (POST /api/billing/checkout).
 * - Com assinatura: "Gerenciar" abre o Customer Portal (POST /api/billing/portal) — cartão, faturas, cancelar.
 * - A moeda vem do país da igreja (billing_currency); preço BRL pode estar pendente (plan_prices).
 */

type Payment = { id: number; amount_cents: number; currency: string; paid_at: string; hosted_url: string | null };
type Prices = Record<string, { usd: number | null; brl: number | null }>;
type Usage = { plan: string; cap_hours: number | null; used_hours: number; pack_hours_left: number; tolerance: number; blocked: boolean };
type PackCfg = { hours: number; usd: number | null; brl: number | null; valid_months: number };
const CONTACT = 'mailto:johnny.oliveira@jcsolutionsus.com?subject=LiveTranslate';

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
}

export default function Billing({ church }: { church: Church }) {
  const { t, lang } = useLang();
  const { refresh } = useAuth();
  const [prices, setPrices] = useState<Prices>({});
  const [payments, setPayments] = useState<Payment[]>([]);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [pack, setPack] = useState<PackCfg | null>(null);
  const [plan, setPlan] = useState<'starter' | 'growth'>(church.plan === 'growth' ? 'growth' : 'starter');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const banner = new URLSearchParams(window.location.search).get('billing');

  const loc = lang === 'pt' ? 'pt-BR' : lang;
  const cur = church.billing_currency || 'usd';
  const money = (cents: number, c: string = cur) => new Intl.NumberFormat(loc, { style: 'currency', currency: c.toUpperCase() }).format(cents / 100);
  const date = (d: string | null) => d ? new Date(d).toLocaleDateString(loc, { dateStyle: 'medium' }) : '—';

  useEffect(() => {
    supabase.rpc('plan_prices').then(({ data }) => setPrices((data ?? {}) as Prices));
    supabase.rpc('usage_summary', { p_church: church.id }).then(({ data }) => setUsage((data ?? null) as Usage | null));
    supabase.rpc('hour_pack_config').then(({ data }) => setPack((data ?? null) as PackCfg | null));
    supabase.from('payments').select('id, amount_cents, currency, paid_at, hosted_url').eq('church_id', church.id).order('paid_at', { ascending: false }).limit(24)
      .then(({ data }) => setPayments((data ?? []) as Payment[]));
  }, [church.id]);

  // depois do pagamento o webhook atualiza a igreja em segundos: recarrega o perfil algumas vezes
  useEffect(() => {
    if (banner !== 'success') return;
    let n = 0;
    const id = setInterval(() => { void refresh(); if (++n >= 6) clearInterval(id); }, 3000);
    return () => clearInterval(id);
  }, [banner, refresh]);

  async function go(path: 'checkout' | 'portal', kind: 'subscription' | 'hour_pack' = 'subscription') {
    setErr(null); setBusy(true);
    try {
      const r = await fetch(`/api/billing/${path}`, { method: 'POST', headers: await authHeaders(), body: JSON.stringify({ slug: church.slug, plan, kind }) });
      const j = await r.json();
      if (!r.ok || !j.url) { setErr(j.code === 'price_pending' ? t('ad.priceSoon') : (j.error || t('a.err.generic'))); setBusy(false); return; }
      window.location.href = j.url;
    } catch { setErr(t('a.err.generic')); setBusy(false); }
  }

  async function cancelTrial() {
    setErr(null); setBusy(true);
    const { error } = await supabase.rpc('cancel_subscription');
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setConfirming(false); await refresh();
  }
  async function resumeTrial() {
    setErr(null); setBusy(true);
    const { error } = await supabase.rpc('resume_subscription');
    setBusy(false);
    if (error) { setErr(error.message); return; }
    await refresh();
  }

  const subscribed = !!church.stripe_subscription_id && church.status !== 'canceled';
  const ends = church.status === 'active' ? church.current_period_end : church.trial_ends_at;
  const daysLeft = church.trial_ends_at ? Math.max(0, Math.ceil((new Date(church.trial_ends_at).getTime() - Date.now()) / 86400000)) : null;

  return (
    <div className="space-y-6">
      {banner === 'success' && <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{t('ad.paySuccess')}</p>}
      {banner === 'cancel' && <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">{t('ad.payCancel')}</p>}
      {banner === 'pack' && <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{t('ad.packSuccess')}</p>}
      {church.status === 'past_due' && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{t('ad.pastDue')}</p>}
      <ErrorMsg msg={err} />

      <div className="grid gap-6 md:grid-cols-2">
        {/* situação atual */}
        <div className="rounded-2xl border border-black/[0.08] bg-white p-6">
          <p className="text-xs font-medium text-muted">{t('ad.plan')}</p>
          <p className="mt-1 font-serif text-2xl capitalize">{church.status === 'trial' ? t('ad.planTrial') : church.plan}</p>
          <dl className="mt-5 grid grid-cols-2 gap-y-3 text-sm">
            <dt className="text-muted">{t('ad.status')}</dt><dd>{t('ad.status.' + church.status)}</dd>
            <dt className="text-muted">{church.status === 'active' ? (church.cancel_at_period_end ? t('ad.endsOn') : t('ad.renewsOn')) : church.status === 'trial' ? t('ad.trialEnds') : t('ad.accessUntil')}</dt>
            <dd>{date(ends)}</dd>
          </dl>
          {church.status === 'trial' && daysLeft !== null && !subscribed && (
            <p className="mt-4 rounded-xl bg-black/[0.04] px-4 py-3 text-sm">{t('ad.trialLeft').replace('{n}', String(daysLeft))}</p>
          )}
          {church.cancel_at_period_end && <p className="mt-4 text-xs text-amber-700">{t('ad.cancelScheduled')}</p>}
        </div>

        {/* ação: assinar ou gerenciar */}
        <div className="rounded-2xl border border-black/[0.08] bg-white p-6">
          {subscribed ? (
            <>
              <p className="text-xs font-medium text-muted">{t('ad.subscription')}</p>
              <p className="mt-3 text-sm text-muted">{t('ad.manageHint')}</p>
              <button onClick={() => go('portal')} disabled={busy} className="mt-5 inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm text-white disabled:opacity-60">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />} {t('ad.manage')}
              </button>
            </>
          ) : church.status === 'canceled' && !church.stripe_subscription_id ? (
            <>
              <p className="mt-3 text-sm text-ink">{t('ad.canceledMsg')}</p>
              <p className="mt-1 text-xs text-muted">{t('ad.canceledUntil')} {date(church.trial_ends_at)}</p>
              <button onClick={resumeTrial} disabled={busy} className="mt-5 rounded-full bg-ink px-5 py-2.5 text-sm text-white disabled:opacity-60">{busy ? t('a.working') : t('ad.resume')}</button>
            </>
          ) : (
            <>
              <p className="text-xs font-medium text-muted">{t('ad.choosePlan')}</p>
              <div className="mt-3 grid gap-2">
                {(['starter', 'growth'] as const).map(p => {
                  const cents = prices[p]?.[cur as 'usd' | 'brl'] ?? null;
                  const on = plan === p;
                  return (
                    <button key={p} type="button" onClick={() => setPlan(p)}
                      className={`flex items-center justify-between rounded-xl border px-4 py-3 text-left text-sm transition-colors ${on ? 'border-ink bg-ink text-white' : 'border-black/10 bg-white hover:border-ink'}`}>
                      <span><span className="font-medium capitalize">{p}</span><span className={`ml-2 text-xs ${on ? 'text-white/70' : 'text-muted'}`}>{t('ad.langsIncluded').replace('{n}', String(PLAN_LIMITS[p]))}</span></span>
                      <span className="flex items-center gap-2">{cents !== null ? <span>{money(cents)}<span className={`text-xs ${on ? 'text-white/70' : 'text-muted'}`}>{t('ad.perMonth')}</span></span> : <span className="text-xs">—</span>}{on && <Check className="h-4 w-4" />}</span>
                    </button>
                  );
                })}
              </div>
              {prices[plan]?.[cur as 'usd' | 'brl'] == null && Object.keys(prices).length > 0 ? (
                <p className="mt-4 text-sm text-muted">{t('ad.priceSoon')} <a href={CONTACT} className="underline underline-offset-4">{t('ad.contactUs')}</a></p>
              ) : (
                <>
                  <button onClick={() => go('checkout')} disabled={busy || !Object.keys(prices).length} className="mt-4 inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm text-white disabled:opacity-60">
                    {busy && <Loader2 className="h-4 w-4 animate-spin" />} {t('ad.subscribe')}
                  </button>
                  <p className="mt-3 text-[11px] text-muted">{t('ad.subscribeHint')}</p>
                </>
              )}
              <p className="mt-4 text-xs text-muted">{t('ad.congregation')} <a href={CONTACT} className="underline underline-offset-4">{t('ad.contactUs')}</a></p>
              {church.status === 'trial' && (
                confirming ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button onClick={() => setConfirming(false)} className="rounded-full border border-black/10 px-4 py-2 text-xs hover:bg-black/[0.04]">{t('ad.keep')}</button>
                    <button onClick={cancelTrial} disabled={busy} className="rounded-full border border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700 disabled:opacity-60">{t('ad.cancelConfirm')}</button>
                  </div>
                ) : (
                  <button onClick={() => setConfirming(true)} className="mt-4 text-xs text-muted underline underline-offset-4 hover:text-red-600">{t('ad.trialCancelLink')}</button>
                )
              )}
            </>
          )}
        </div>
      </div>

      {/* horas de tradução do mês (teto do plano + pacotes) — HANDOFF §24 */}
      {usage && (
        <section className="rounded-2xl border border-black/[0.08] bg-white p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-muted">{t('ad.hoursTitle')}</p>
              <p className="mt-1 font-serif text-2xl">
                {usage.used_hours.toFixed(1)} h{usage.cap_hours !== null && <span className="text-base text-muted"> / {usage.cap_hours} h</span>}
              </p>
              <p className="mt-1 text-[11px] text-muted">{t('ad.hoursHint')}</p>
            </div>
            {usage.pack_hours_left > 0 && <p className="text-sm text-muted">{t('ad.packLeft').replace('{n}', usage.pack_hours_left.toFixed(1))}</p>}
          </div>
          {usage.cap_hours !== null && (() => {
            const pct = Math.min(1, usage.used_hours / usage.cap_hours);
            const tone = usage.blocked ? 'bg-red-500' : pct >= 0.8 ? 'bg-amber-500' : 'bg-emerald-600';
            return (
              <>
                <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-black/[0.06]"><div className={`h-full ${tone}`} style={{ width: `${pct * 100}%` }} /></div>
                {usage.blocked ? <p className="mt-3 text-sm text-red-700">{t('ad.hoursBlocked')}</p>
                  : pct >= 0.8 ? <p className="mt-3 text-sm text-amber-700">{t('ad.hoursWarn')}</p> : null}
              </>
            );
          })()}
          {pack && pack[cur as 'usd' | 'brl'] != null && (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button onClick={() => go('checkout', 'hour_pack')} disabled={busy} className="rounded-full border border-ink px-5 py-2.5 text-sm text-ink hover:bg-ink hover:text-white disabled:opacity-60">
                {t('ad.buyPack').replace('{n}', String(pack.hours)).replace('{price}', money(pack[cur as 'usd' | 'brl'] as number))}
              </button>
              <span className="text-[11px] text-muted">{t('ad.packHint').replace('{m}', String(pack.valid_months))}</span>
            </div>
          )}
        </section>
      )}

      {/* pagamentos */}
      <section className="rounded-2xl border border-black/[0.08] bg-white">
        <p className="px-6 py-4 text-xs font-medium text-muted">{t('ad.payments')}</p>
        {payments.length === 0 ? <p className="px-6 pb-6 text-sm text-muted">{t('ad.noPayments')}</p> : (
          <table className="w-full text-sm">
            <tbody className="divide-y divide-black/[0.06]">
              {payments.map(p => (
                <tr key={p.id}>
                  <td className="px-6 py-3">{date(p.paid_at)}</td>
                  <td className="px-4 py-3">{money(p.amount_cents, p.currency)}</td>
                  <td className="px-6 py-3 text-right">{p.hosted_url && <a href={p.hosted_url} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-xs text-muted underline underline-offset-4 hover:text-ink">{t('ad.receipt')} <ExternalLink className="h-3 w-3" /></a>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
