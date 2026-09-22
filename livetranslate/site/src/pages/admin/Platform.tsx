import { Fragment, useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Building2, Coins, ExternalLink, LayoutDashboard, Loader2, Lock } from 'lucide-react';
import { supabase, type Church } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { useLang } from '../../i18n';
import { useRouter } from '../../router';
import { langLabel, LANGUAGE_CATALOG, PLAN_LIMITS, languageLimit } from '../../lib/languages';
import { ErrorMsg } from '../auth/ui';
import Shell, { PageHead, type NavItem } from './Shell';

/**
 * PAINEL DA PLATAFORMA — só quem está em `platform_admins` (Johnny). HANDOFF §22.
 * Tudo aqui é lido com a chave publicável + RLS: as policies de platform admin existem
 * desde a migration 0001 (churches, memberships, profiles, services, service_costs) e a
 * 0009 trouxe platform_settings / platform_grants / platform_grant_days().
 * Gráficos em SVG à mão (mesma escolha do PlatformLucasArrial: sem lib).
 */

type Tab = 'overview' | 'churches' | 'costs';

type ChurchRow = Church & {
  created_at: string;
  memberships: { role: string; profiles: { email: string; full_name: string | null } | null }[];
  church_languages: { lang_code: string; enabled: boolean; blocked_by_platform: boolean }[];
};
type ServiceRow = {
  id: number; church_id: number; started_at: string; ended_at: string | null;
  service_languages: { lang_code: string; minutes: number; peak_listeners: number }[];
  service_costs: { lang_code: string; cost_usd: number }[];
};
type Settings = {
  cost_per_lang_minute_usd: number;
  fixed_costs_usd_month: Record<string, number>;
  usd_brl: number;
  plan_prices: Record<string, { usd: number | null; brl: number | null }>;
  plan_hours: Record<string, number | null>;                                   // teto de horas-idioma/mês (null = sem teto)
  hour_pack: { hours: number; usd: number | null; brl: number | null; valid_months: number };
  overage_tolerance: number;
};
type Pack = { id: number; church_id: number; hours: number; hours_used: number; source: string; expires_at: string; note: string | null; created_at: string };
type Grant = { id: number; church_id: number; days: number; until_at: string; note: string | null; created_at: string };
type Payment = { id: number; church_id: number; provider: string; amount_cents: number; currency: 'usd' | 'brl'; paid_at: string };

const GOOGLE_SPEND = 'https://aistudio.google.com/app/spend';
const FIXED_KEYS = ['hetzner', 'supabase', 'livekit', 'resend', 'cloudflare', 'other'] as const;
const DEFAULTS: Settings = {
  cost_per_lang_minute_usd: 0.05,
  fixed_costs_usd_month: { hetzner: 0, supabase: 0, livekit: 0, resend: 0, cloudflare: 0, other: 0 },
  usd_brl: 5.5,
  plan_prices: { starter: { usd: 7990, brl: null }, growth: { usd: 13900, brl: null } },
  plan_hours: { starter: 12, growth: 30, congregation: null },
  hour_pack: { hours: 10, usd: 3900, brl: 19900, valid_months: 3 },
  overage_tolerance: 0.2,
};

const monthKey = (d: Date | string) => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`; };
function lastMonths(n: number) {
  const out: string[] = []; const d = new Date(); d.setDate(1);
  for (let i = 0; i < n; i++) { out.push(monthKey(d)); d.setMonth(d.getMonth() - 1); }
  return out;
}
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const serviceMinutes = (s: ServiceRow) => sum(s.service_languages.map(l => Number(l.minutes) || 0));
const serviceCost = (s: ServiceRow) => sum(s.service_costs.map(c => Number(c.cost_usd) || 0));

function usePlatformData() {
  const [churches, setChurches] = useState<ChurchRow[]>([]);
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [grants, setGrants] = useState<Grant[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [packs, setPacks] = useState<Pack[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setErr(null);
    const since = new Date(); since.setMonth(since.getMonth() - 12); since.setDate(1);
    const [c, s, g, p, hp, st] = await Promise.all([
      supabase.from('churches').select('*, memberships(role, profiles(email, full_name)), church_languages(lang_code, enabled, blocked_by_platform)').order('created_at', { ascending: false }),
      supabase.from('services').select('id, church_id, started_at, ended_at, service_languages(lang_code, minutes, peak_listeners), service_costs(lang_code, cost_usd)').gte('started_at', since.toISOString()).order('started_at', { ascending: false }),
      supabase.from('platform_grants').select('id, church_id, days, until_at, note, created_at').order('created_at', { ascending: false }).limit(200),
      supabase.from('payments').select('id, church_id, provider, amount_cents, currency, paid_at').gte('paid_at', since.toISOString()).order('paid_at', { ascending: false }),
      supabase.from('hour_packs').select('id, church_id, hours, hours_used, source, expires_at, note, created_at').order('created_at', { ascending: false }).limit(500),
      supabase.from('platform_settings').select('key, value'),
    ]);
    const e = c.error ?? s.error ?? g.error ?? p.error ?? hp.error ?? st.error;
    if (e) { setErr(e.message); setLoading(false); return; }
    setChurches((c.data ?? []) as unknown as ChurchRow[]);
    setServices((s.data ?? []) as unknown as ServiceRow[]);
    setGrants((g.data ?? []) as Grant[]);
    setPayments((p.data ?? []) as Payment[]);
    setPacks(((hp.data ?? []) as Pack[]).map(x => ({ ...x, hours: Number(x.hours), hours_used: Number(x.hours_used) })));
    const merged: Settings = { ...DEFAULTS };
    for (const row of st.data ?? []) {
      const r = row as { key: string; value: unknown };
      if (r.key === 'cost_per_lang_minute_usd') merged.cost_per_lang_minute_usd = Number(r.value) || DEFAULTS.cost_per_lang_minute_usd;
      else if (r.key === 'usd_brl') merged.usd_brl = Number(r.value) || DEFAULTS.usd_brl;
      else if (r.key === 'fixed_costs_usd_month') merged.fixed_costs_usd_month = { ...DEFAULTS.fixed_costs_usd_month, ...(r.value as Record<string, number>) };
      else if (r.key === 'plan_prices') merged.plan_prices = { ...DEFAULTS.plan_prices, ...(r.value as Settings['plan_prices']) };
      else if (r.key === 'plan_hours') merged.plan_hours = { ...DEFAULTS.plan_hours, ...(r.value as Settings['plan_hours']) };
      else if (r.key === 'hour_pack') merged.hour_pack = { ...DEFAULTS.hour_pack, ...(r.value as Settings['hour_pack']) };
      else if (r.key === 'overage_tolerance') merged.overage_tolerance = Number(r.value) >= 0 ? Number(r.value) : DEFAULTS.overage_tolerance;
    }
    setSettings(merged);
    setLoading(false);
  }, []);

  useEffect(() => { void reload(); }, [reload]);
  return { churches, services, grants, payments, packs, settings, loading, err, reload };
}

export default function Platform() {
  const { t } = useLang();
  const { navigate } = useRouter();
  const { loading, user, isPlatformAdmin, signOut } = useAuth();
  const [tab, setTab] = useState<Tab>('overview');
  const data = usePlatformData();

  useEffect(() => {
    if (loading) return;
    if (!user) navigate('/login');
    else if (!isPlatformAdmin) navigate('/admin');   // quem não é da plataforma nem vê a página
  }, [loading, user, isPlatformAdmin, navigate]);
  if (loading || !user || !isPlatformAdmin) return null;

  const items: NavItem[] = [
    { id: 'overview', label: t('pf.overview'), icon: LayoutDashboard },
    { id: 'churches', label: t('pf.churches'), icon: Building2 },
    { id: 'costs', label: t('pf.costs'), icon: Coins },
  ];
  const current = items.find(x => x.id === tab) ?? items[0];

  return (
    <Shell church={null} items={items} active={current.id} onSelect={id => setTab(id as Tab)} churches={data.churches}
      user={user.email ?? ''} onSignOut={() => signOut().then(() => navigate('/'))}>
      <PageHead title={current.label} sub={t('pf.sub')} />
      <ErrorMsg msg={data.err} />
      {data.loading ? (
        <p className="flex items-center gap-2 text-sm text-muted"><Loader2 className="h-4 w-4 animate-spin" /> {t('pf.working')}</p>
      ) : (
        <>
          {tab === 'overview' && <Overview {...data} />}
          {tab === 'churches' && <Churches {...data} />}
          {tab === 'costs' && <Costs settings={data.settings} reload={data.reload} />}
        </>
      )}
    </Shell>
  );
}

/* ── util de formatação ─────────────────────────────────────────────────── */
function useFmt() {
  const { lang } = useLang();
  const loc = lang === 'pt' ? 'pt-BR' : lang;
  return {
    loc,
    usd: (v: number) => new Intl.NumberFormat(loc, { style: 'currency', currency: 'USD' }).format(v),
    money: (cents: number | null, cur: string) => cents == null ? '—' : new Intl.NumberFormat(loc, { style: 'currency', currency: cur.toUpperCase() }).format(cents / 100),
    date: (d: string | null) => d ? new Date(d).toLocaleDateString(loc, { dateStyle: 'medium' }) : '—',
    month: (key: string) => new Date(`${key}-15T12:00:00Z`).toLocaleDateString(loc, { month: 'short', year: '2-digit', timeZone: 'UTC' }),
    country: (code: string | null) => {
      if (!code) return '—';
      try { return new Intl.DisplayNames([loc], { type: 'region' }).of(code) ?? code; } catch { return code; }
    },
  };
}

/* ── Visão geral ─────────────────────────────────────────────────────────── */
type Data = ReturnType<typeof usePlatformData>;

function Overview({ churches, services, payments, settings }: Data) {
  const { t } = useLang();
  const f = useFmt();
  const months = useMemo(() => lastMonths(12), []);
  const [month, setMonth] = useState(months[0]);

  const fixedMonth = sum(Object.values(settings.fixed_costs_usd_month).map(Number));
  const inMonth = services.filter(s => monthKey(s.started_at) === month);
  const gemini = sum(inMonth.map(serviceCost));
  // Entrou: pagamentos do Stripe (US em USD + BR em BRL convertido pela cotação das configurações)
  const emUsd = (p: Payment) => p.currency === 'brl' ? p.amount_cents / 100 / (settings.usd_brl || 5.5) : p.amount_cents / 100;
  const paysMonth = payments.filter(p => monthKey(p.paid_at) === month);
  const moneyIn = sum(paysMonth.map(emUsd));
  const inUsd = sum(paysMonth.filter(p => p.currency === 'usd').map(p => p.amount_cents / 100));
  const inBrl = sum(paysMonth.filter(p => p.currency === 'brl').map(p => p.amount_cents / 100));
  const out = gemini + fixedMonth;

  const paying = churches.filter(c => c.status === 'active').length;
  const free = churches.filter(c => c.status === 'trial').length;
  const canceled = churches.filter(c => c.status === 'canceled').length;

  // últimos 6 meses para o gráfico (mais antigo → mais novo)
  const chart = lastMonths(6).reverse().map(k => {
    const g = sum(services.filter(s => monthKey(s.started_at) === k).map(serviceCost));
    return { k, out: g + fixedMonth, gemini: g, in: sum(payments.filter(p => monthKey(p.paid_at) === k).map(emUsd)) };
  });

  // cultos do mês por igreja
  const perChurch = churches.map(c => {
    const mine = inMonth.filter(s => s.church_id === c.id);
    return { c, n: mine.length, min: sum(mine.map(serviceMinutes)), cost: sum(mine.map(serviceCost)) };
  }).filter(r => r.n > 0).sort((a, b) => b.cost - a.cost);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-xs font-medium text-muted">{t('pf.month')}</label>
        <select value={month} onChange={e => setMonth(e.target.value)} className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm">
          {months.map(m => <option key={m} value={m}>{f.month(m)}</option>)}
        </select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label={t('pf.kpi.churches')} value={String(churches.length)}
          sub={`${paying} ${t('pf.kpi.paying')} · ${free} ${t('pf.kpi.free')} · ${canceled} ${t('pf.kpi.canceled')}`} />
        <Kpi label={t('pf.kpi.in')} value={f.usd(moneyIn)}
          sub={paysMonth.length ? `${paysMonth.length} × · US$ ${inUsd.toFixed(2)} · R$ ${inBrl.toFixed(2)}` : t('pf.noStripe')} />
        <Kpi label={t('pf.kpi.out')} value={f.usd(out)} sub={`${t('pf.gemini')} ${f.usd(gemini)} · ${t('pf.fixed')} ${f.usd(fixedMonth)}`} />
        <Kpi label={t('pf.kpi.result')} value={f.usd(moneyIn - out)} tone={moneyIn - out >= 0 ? 'ok' : 'bad'} />
      </div>

      <p className="text-xs text-muted">
        {t('pf.geminiHint')}{' '}
        <a href={GOOGLE_SPEND} target="_blank" rel="noopener" className="inline-flex items-center gap-1 underline underline-offset-4 hover:text-ink">
          {t('pf.geminiLink')} <ExternalLink className="h-3 w-3" />
        </a>
      </p>

      <section className="rounded-2xl border border-black/[0.08] bg-white p-6">
        <p className="text-xs font-medium text-muted">{t('pf.chart')}</p>
        <Bars data={chart} labelIn={t('pf.chartIn')} labelOut={t('pf.chartOut')} fmt={f.usd} month={f.month} />
      </section>

      <section className="rounded-2xl border border-black/[0.08] bg-white">
        <div className="flex items-center justify-between px-6 py-4">
          <p className="text-xs font-medium text-muted">{t('pf.services')} · {f.month(month)}</p>
          <p className="text-[11px] text-muted">{t('pf.sinceHint')}</p>
        </div>
        {perChurch.length === 0 ? (
          <p className="px-6 pb-6 text-sm text-muted">{t('pf.noServices')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted"><tr>
                <th className="px-6 py-2 font-medium">{t('pf.church')}</th><th className="px-4 py-2 font-medium">{t('pf.nServices')}</th>
                <th className="px-4 py-2 font-medium">{t('pf.minutes')}</th><th className="px-6 py-2 text-right font-medium">{t('pf.cost')}</th>
              </tr></thead>
              <tbody className="divide-y divide-black/[0.06]">
                {perChurch.map(r => (
                  <tr key={r.c.id}>
                    <td className="px-6 py-3">{r.c.name}</td><td className="px-4 py-3">{r.n}</td>
                    <td className="px-4 py-3">{Math.round(r.min)}</td><td className="px-6 py-3 text-right">{f.usd(r.cost)}</td>
                  </tr>
                ))}
                <tr className="font-medium">
                  <td className="px-6 py-3">{t('pf.total')}</td><td className="px-4 py-3">{sum(perChurch.map(r => r.n))}</td>
                  <td className="px-4 py-3">{Math.round(sum(perChurch.map(r => r.min)))}</td><td className="px-6 py-3 text-right">{f.usd(gemini)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'ok' | 'bad' }) {
  return (
    <div className="rounded-2xl border border-black/[0.08] bg-white p-5">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className={`mt-1 font-serif text-3xl leading-none ${tone === 'ok' ? 'text-emerald-700' : tone === 'bad' ? 'text-red-700' : 'text-ink'}`}>{value}</p>
      {sub && <p className="mt-2 text-[11px] leading-snug text-muted">{sub}</p>}
    </div>
  );
}

/** Barras mensais entrou × saiu — SVG à mão, valores sempre escritos. */
function Bars({ data, labelIn, labelOut, fmt, month }: {
  data: { k: string; in: number; out: number }[]; labelIn: string; labelOut: string;
  fmt: (v: number) => string; month: (k: string) => string;
}) {
  const max = Math.max(1, ...data.flatMap(d => [d.in, d.out]));
  const W = 640, H = 180, pad = 8, base = 140, gw = W / data.length;
  return (
    <div className="mt-4">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-44 w-full" role="img">
        {data.map((d, i) => {
          const x0 = i * gw + pad, bw = (gw - pad * 2) / 2 - 3;
          const hIn = (d.in / max) * 110, hOut = (d.out / max) * 110;
          return (
            <g key={d.k}>
              <rect x={x0} y={base - hIn} width={bw} height={hIn} rx={4} className="fill-emerald-600" />
              <rect x={x0 + bw + 6} y={base - hOut} width={bw} height={hOut} rx={4} className="fill-red-500" />
              <text x={x0 + bw / 2} y={base - hIn - 4} textAnchor="middle" className="fill-emerald-700 text-[9px]">{d.in ? fmt(d.in) : ''}</text>
              <text x={x0 + bw + 6 + bw / 2} y={base - hOut - 4} textAnchor="middle" className="fill-red-700 text-[9px]">{d.out ? fmt(d.out) : ''}</text>
              <text x={i * gw + gw / 2} y={H - 18} textAnchor="middle" className="fill-current text-[11px] text-muted">{month(d.k)}</text>
            </g>
          );
        })}
        <line x1={0} y1={base} x2={W} y2={base} className="stroke-black/10" />
      </svg>
      <div className="mt-1 flex gap-4 text-[11px] text-muted">
        <span className="inline-flex items-center gap-1"><i className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-600" /> {labelIn}</span>
        <span className="inline-flex items-center gap-1"><i className="inline-block h-2.5 w-2.5 rounded-sm bg-red-500" /> {labelOut}</span>
      </div>
    </div>
  );
}

/* ── Igrejas ─────────────────────────────────────────────────────────────── */
function Churches({ churches, services, grants, packs, settings, reload }: Data) {
  const { t } = useLang();
  const f = useFmt();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<number | null>(null);
  const thisMonth = monthKey(new Date());

  const rows = churches.filter(c => {
    const s = q.trim().toLowerCase();
    if (!s) return true;
    const emails = c.memberships.map(m => m.profiles?.email ?? '').join(' ');
    return `${c.name} ${c.slug} ${emails}`.toLowerCase().includes(s);
  });

  return (
    <div className="space-y-4">
      <input value={q} onChange={e => setQ(e.target.value)} placeholder={t('pf.search')}
        className="w-full max-w-md rounded-xl border border-black/10 bg-white px-4 py-2.5 text-sm outline-none focus:border-ink" />
      {rows.length === 0 ? <p className="text-sm text-muted">{t('pf.noChurches')}</p> : (
        <div className="overflow-x-auto rounded-2xl border border-black/[0.08] bg-white">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted"><tr>
              <th className="px-4 py-3 font-medium">{t('pf.church')}</th><th className="px-4 py-3 font-medium">{t('pf.admin')}</th>
              <th className="px-4 py-3 font-medium">{t('pf.country')}</th><th className="px-4 py-3 font-medium">{t('pf.plan')}</th>
              <th className="px-4 py-3 font-medium">{t('pf.status')}</th><th className="px-4 py-3 font-medium">{t('pf.until')}</th>
              <th className="px-4 py-3 font-medium">{t('pf.lastService')}</th><th className="px-4 py-3 font-medium">{t('pf.hours')}</th><th className="px-4 py-3 text-right font-medium">{t('pf.monthCost')}</th>
            </tr></thead>
            <tbody className="divide-y divide-black/[0.06]">
              {rows.map(c => {
                const admin = c.memberships.find(m => m.role === 'admin')?.profiles;
                const mine = services.filter(s => s.church_id === c.id);
                const last = mine[0]?.started_at ?? null;
                const cost = sum(mine.filter(s => monthKey(s.started_at) === thisMonth).map(serviceCost));
                const hoursUsed = sum(mine.filter(s => monthKey(s.started_at) === thisMonth).map(serviceMinutes)) / 60;
                const cap = settings.plan_hours[c.plan] ?? null;
                const packsLeft = sum(packs.filter(p => p.church_id === c.id && new Date(p.expires_at) > new Date()).map(p => Math.max(0, p.hours - p.hours_used)));
                const over = cap !== null && hoursUsed >= cap;
                const ends = c.trial_ends_at ? new Date(c.trial_ends_at) : null;
                const days = ends ? Math.ceil((ends.getTime() - Date.now()) / 86400000) : null;
                const isOpen = open === c.id;
                return (
                  <Fragment key={c.id}>
                    <tr onClick={() => setOpen(isOpen ? null : c.id)} className="cursor-pointer hover:bg-black/[0.02]">
                      <td className="px-4 py-3"><p className="font-medium text-ink">{c.name}</p><p className="text-[11px] text-muted">/{c.slug} · {t('pf.signedUp')} {f.date(c.created_at)}</p></td>
                      <td className="px-4 py-3"><p>{admin?.email ?? '—'}</p>{admin?.full_name && <p className="text-[11px] text-muted">{admin.full_name}</p>}</td>
                      <td className="px-4 py-3">{f.country(c.country)} <span className="text-[11px] uppercase text-muted">{c.billing_currency}</span></td>
                      <td className="px-4 py-3 capitalize">{c.plan}</td>
                      <td className="px-4 py-3"><StatusPill status={c.status} label={t('pf.status.' + c.status)} /></td>
                      <td className="px-4 py-3">{f.date(c.trial_ends_at)}{days !== null && c.status !== 'active' && (
                        <p className={`text-[11px] ${days <= 7 ? 'text-red-600' : 'text-muted'}`}>{days > 0 ? t('pf.daysLeft').replace('{n}', String(days)) : t('pf.expired')}</p>
                      )}</td>
                      <td className="px-4 py-3">{last ? f.date(last) : t('pf.never')}</td>
                      <td className="px-4 py-3">
                        <span className={over ? 'font-medium text-red-600' : hoursUsed >= (cap ?? Infinity) * 0.8 ? 'text-amber-700' : ''}>{hoursUsed.toFixed(1)} h</span>
                        <span className="text-muted">{cap !== null ? ` / ${cap} h` : ''}</span>
                        {packsLeft > 0 && <p className="text-[11px] text-muted">+{packsLeft.toFixed(1)} h {t('pf.packs')}</p>}
                      </td>
                      <td className="px-4 py-3 text-right">{f.usd(cost)}</td>
                    </tr>
                    {isOpen && (
                      <tr><td colSpan={9} className="bg-black/[0.02] px-4 py-5">
                        <ChurchDetail church={c} grants={grants.filter(g => g.church_id === c.id)} packs={packs.filter(p => p.church_id === c.id)} reload={reload} />
                      </td></tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatusPill({ status, label }: { status: string; label: string }) {
  const cls = status === 'active' ? 'bg-emerald-50 text-emerald-700' : status === 'trial' ? 'bg-sky-50 text-sky-700'
    : status === 'past_due' ? 'bg-amber-50 text-amber-700' : 'bg-black/[0.05] text-muted';
  return <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${cls}`}>{label}</span>;
}

function ChurchDetail({ church, grants, packs, reload }: { church: ChurchRow; grants: Grant[]; packs: Pack[]; reload: () => Promise<void> }) {
  const { t } = useLang();
  const f = useFmt();
  const [days, setDays] = useState('30');
  const [note, setNote] = useState('');
  const [hours, setHours] = useState('10');
  const [hnote, setHnote] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function give(e: FormEvent) {
    e.preventDefault(); setErr(null); setMsg(null); setBusy(true);
    const { data, error } = await supabase.rpc('platform_grant_days', { p_church: church.id, p_days: Number(days) || 0, p_note: note || null });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setMsg(t('pf.given').replace('{d}', f.date(data as string)));
    setNote('');
    await reload();
  }

  async function giveHours(e: FormEvent) {
    e.preventDefault(); setErr(null); setMsg(null); setBusy(true);
    const { error } = await supabase.rpc('platform_grant_hours', { p_church: church.id, p_hours: Number(hours) || 0, p_note: hnote || null, p_months: 3 });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setMsg(t('pf.hoursGiven').replace('{n}', hours));
    setHnote('');
    await reload();
  }

  async function setPlan(plan: string) {
    setErr(null);
    const { error } = await supabase.from('churches').update({ plan }).eq('id', church.id);
    if (error) { setErr(error.message); return; }
    await reload();
  }

  async function toggleBlock(code: string, blocked: boolean) {
    setErr(null);
    const { error } = await supabase.from('church_languages').update({ blocked_by_platform: !blocked }).eq('church_id', church.id).eq('lang_code', code);
    if (error) { setErr(error.message); return; }
    await reload();
  }

  // 0012: a plataforma liga/desliga qualquer idioma da igreja (mesma tabela que a aba Languages da igreja usa)
  async function toggleEnable(code: string, on: boolean) {
    setErr(null);
    const q = on
      ? supabase.from('church_languages').delete().eq('church_id', church.id).eq('lang_code', code)
      : supabase.from('church_languages').upsert({ church_id: church.id, lang_code: code, enabled: true }, { onConflict: 'church_id,lang_code' });   // a linha pode existir desligada
    const { error } = await q;
    if (error) { setErr(error.message); return; }
    await reload();
  }

  // 0012: limite de idiomas da igreja — vazio = limite do plano
  const [limit, setLimit] = useState(church.language_limit == null ? '' : String(church.language_limit));
  async function saveLimit(e: FormEvent) {
    e.preventDefault(); setErr(null);
    const v = limit.trim() === '' ? null : Math.max(0, Math.min(99, Math.round(Number(limit))));
    const { error } = await supabase.from('churches').update({ language_limit: v }).eq('id', church.id);
    if (error) { setErr(error.message); return; }
    await reload();
  }

  const enabled = church.church_languages.filter(l => l.enabled);
  const planLimit = PLAN_LIMITS[church.plan] ?? 2;

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <ErrorMsg msg={err} />
      <div className="lg:col-span-2">
        <div className="flex flex-wrap items-end gap-4">
          <label className="block">
            <span className="block text-xs font-medium text-muted">{t('pf.plan')}</span>
            <select value={church.plan} onChange={e => setPlan(e.target.value)} className="mt-2 rounded-xl border border-black/10 bg-white px-3 py-2 text-sm capitalize">
              {['starter', 'growth', 'congregation'].map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          <form onSubmit={saveLimit} className="flex items-end gap-2">
            <label className="block">
              <span className="block text-xs font-medium text-muted">{t('pf.langLimit')}</span>
              <input type="number" min={0} max={99} value={limit} onChange={e => setLimit(e.target.value)} placeholder={String(planLimit)}
                className="mt-2 w-24 rounded-xl border border-black/10 bg-white px-3 py-2 text-sm" />
            </label>
            <button type="submit" className="rounded-full border border-black/10 bg-white px-4 py-2 text-xs hover:border-ink">{t('pf.give')}</button>
          </form>
        </div>
        <p className="mt-1 text-[11px] text-muted">{t('pf.langLimitHint').replace('{n}', String(planLimit))}</p>

        <p className="mt-5 text-xs font-medium text-muted">{t('pf.langs')} · {enabled.length}/{languageLimit(church)}</p>
        <p className="mt-1 text-[11px] text-muted">{t('pf.langsHint')}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {LANGUAGE_CATALOG.filter(l => l.code !== church.speaker_lang).map(l => {
            const row = church.church_languages.find(x => x.lang_code === l.code && x.enabled);
            const on = !!row, blocked = !!row?.blocked_by_platform;
            return (
              <span key={l.code} className={`inline-flex items-center overflow-hidden rounded-full border text-xs transition-colors ${blocked ? 'border-red-200 bg-red-50 text-red-700' : on ? 'border-ink bg-ink text-white' : 'border-black/10 bg-white text-muted hover:border-ink'}`}>
                <button onClick={() => toggleEnable(l.code, on)} className={`px-3 py-1.5 ${blocked ? 'line-through' : ''}`} title={on ? t('pf.turnOff') : t('pf.turnOn')}>
                  {l.flag} {l.label}
                </button>
                {on && (
                  <button onClick={() => toggleBlock(l.code, blocked)} title={blocked ? t('pf.unblock') : t('pf.block')}
                    className={`border-l px-2 py-1.5 ${blocked ? 'border-red-200' : 'border-white/20'}`}>
                    <Lock className="h-3 w-3" />
                  </button>
                )}
              </span>
            );
          })}
        </div>
      </div>

      <form onSubmit={give}>
        <p className="text-xs font-medium text-muted">{t('pf.giveDays')}</p>
        <label className="mt-2 block">
          <span className="mb-1 block text-[11px] text-muted">{t('pf.days')}</span>
          <input type="number" value={days} onChange={e => setDays(e.target.value)} className="w-32 rounded-xl border border-black/10 bg-white px-3 py-2 text-sm" />
        </label>
        <label className="mt-3 block">
          <span className="mb-1 block text-[11px] text-muted">{t('pf.note')}</span>
          <input value={note} onChange={e => setNote(e.target.value)} className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm" />
        </label>
        <button type="submit" disabled={busy} className="mt-4 rounded-full bg-ink px-5 py-2.5 text-sm text-white disabled:opacity-60">
          {busy ? t('pf.working') : t('pf.give')}
        </button>
        {msg && <p className="mt-3 text-sm text-emerald-700">{msg}</p>}
      </form>

      <div>
        <p className="text-xs font-medium text-muted">{t('pf.history')}</p>
        {grants.length === 0 ? <p className="mt-2 text-sm text-muted">{t('pf.noHistory')}</p> : (
          <ul className="mt-2 space-y-2 text-sm">
            {grants.map(g => (
              <li key={g.id} className="rounded-xl bg-white px-3 py-2">
                <span className="font-medium">{g.days > 0 ? '+' : ''}{g.days}</span> → {f.date(g.until_at)}
                <span className="block text-[11px] text-muted">{f.date(g.created_at)}{g.note ? ` · ${g.note}` : ''}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <form onSubmit={giveHours}>
          <p className="text-xs font-medium text-muted">{t('pf.giveHours')}</p>
          <label className="mt-2 block">
            <span className="mb-1 block text-[11px] text-muted">{t('pf.hoursLabel')}</span>
            <input type="number" min="1" step="1" value={hours} onChange={e => setHours(e.target.value)} className="w-32 rounded-xl border border-black/10 bg-white px-3 py-2 text-sm" />
          </label>
          <label className="mt-3 block">
            <span className="mb-1 block text-[11px] text-muted">{t('pf.note')}</span>
            <input value={hnote} onChange={e => setHnote(e.target.value)} className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm" />
          </label>
          <button type="submit" disabled={busy} className="mt-4 rounded-full bg-ink px-5 py-2.5 text-sm text-white disabled:opacity-60">{busy ? t('pf.working') : t('pf.give')}</button>
        </form>
        <p className="mt-5 text-xs font-medium text-muted">{t('pf.packsTitle')}</p>
        {packs.length === 0 ? <p className="mt-2 text-sm text-muted">{t('pf.noPacks')}</p> : (
          <ul className="mt-2 space-y-2 text-sm">
            {packs.map(p => (
              <li key={p.id} className="rounded-xl bg-white px-3 py-2">
                <span className="font-medium">{(p.hours - p.hours_used).toFixed(1)} / {p.hours} h</span>
                <span className="ml-2 text-[11px] uppercase text-muted">{p.source === 'platform' ? t('pf.courtesy') : p.source.replace('stripe_', 'stripe ')}</span>
                <span className="block text-[11px] text-muted">{t('pf.expires')} {f.date(p.expires_at)}{p.note ? ` · ${p.note}` : ''}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/* ── Custos e preços ─────────────────────────────────────────────────────── */
function Costs({ settings, reload }: { settings: Settings; reload: () => Promise<void> }) {
  const { t } = useLang();
  const [rate, setRate] = useState(String(settings.cost_per_lang_minute_usd));
  const [fixed, setFixed] = useState<Record<string, string>>(Object.fromEntries(FIXED_KEYS.map(k => [k, String(settings.fixed_costs_usd_month[k] ?? 0)])));
  const [usdBrl, setUsdBrl] = useState(String(settings.usd_brl));
  const [prices, setPrices] = useState<Record<string, { usd: string; brl: string }>>({
    starter: { usd: String(settings.plan_prices.starter?.usd ?? ''), brl: String(settings.plan_prices.starter?.brl ?? '') },
    growth: { usd: String(settings.plan_prices.growth?.usd ?? ''), brl: String(settings.plan_prices.growth?.brl ?? '') },
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [planHours, setPlanHours] = useState({ starter: String(settings.plan_hours.starter ?? ''), growth: String(settings.plan_hours.growth ?? ''), congregation: String(settings.plan_hours.congregation ?? '') });
  const [pack, setPack] = useState({ hours: String(settings.hour_pack.hours), usd: String(settings.hour_pack.usd ?? ''), brl: String(settings.hour_pack.brl ?? ''), valid_months: String(settings.hour_pack.valid_months) });
  const [tol, setTol] = useState(String(Math.round(settings.overage_tolerance * 100)));

  async function save(e: FormEvent) {
    e.preventDefault(); setErr(null); setMsg(null); setBusy(true);
    const cents = (v: string) => v.trim() === '' ? null : Math.round(Number(v));
    const rows = [
      { key: 'cost_per_lang_minute_usd', value: Number(rate) || 0 },
      { key: 'fixed_costs_usd_month', value: Object.fromEntries(FIXED_KEYS.map(k => [k, Number(fixed[k]) || 0])) },
      { key: 'usd_brl', value: Number(usdBrl) || 0 },
      { key: 'plan_prices', value: { starter: { usd: cents(prices.starter.usd), brl: cents(prices.starter.brl) }, growth: { usd: cents(prices.growth.usd), brl: cents(prices.growth.brl) } } },
      { key: 'plan_hours', value: { starter: planHours.starter.trim() === '' ? null : Number(planHours.starter), growth: planHours.growth.trim() === '' ? null : Number(planHours.growth), congregation: planHours.congregation.trim() === '' ? null : Number(planHours.congregation) } },
      { key: 'hour_pack', value: { hours: Number(pack.hours) || 10, usd: cents(pack.usd), brl: cents(pack.brl), valid_months: Number(pack.valid_months) || 3 } },
      { key: 'overage_tolerance', value: Math.max(0, Number(tol) || 0) / 100 },
    ];
    const { error } = await supabase.from('platform_settings').upsert(rows, { onConflict: 'key' });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setMsg(t('pf.saved'));
    await reload();
  }

  const input = 'mt-1 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-ink';
  return (
    <form onSubmit={save} className="grid max-w-3xl gap-6">
      <ErrorMsg msg={err} />
      <section className="rounded-2xl border border-black/[0.08] bg-white p-6">
        <label className="block text-xs font-medium text-muted">{t('pf.rate')}
          <input type="number" step="0.001" min="0" value={rate} onChange={e => setRate(e.target.value)} className={input} />
        </label>
        <p className="mt-2 text-[11px] text-muted">{t('pf.rateHint')}</p>
      </section>

      <section className="rounded-2xl border border-black/[0.08] bg-white p-6">
        <p className="text-xs font-medium text-muted">{t('pf.fixedTitle')}</p>
        <p className="mt-1 text-[11px] text-muted">{t('pf.fixedHint')}</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {FIXED_KEYS.map(k => (
            <label key={k} className="block text-[11px] text-muted">{t('pf.f.' + k)}
              <input type="number" step="0.01" min="0" value={fixed[k]} onChange={e => setFixed({ ...fixed, [k]: e.target.value })} className={input} />
            </label>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-black/[0.08] bg-white p-6">
        <p className="text-xs font-medium text-muted">{t('pf.prices')}</p>
        <p className="mt-1 text-[11px] text-muted">{t('pf.pricesHint')}</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {(['starter', 'growth'] as const).map(p => (
            <div key={p} className="rounded-xl bg-black/[0.03] p-3">
              <p className="text-xs font-medium capitalize text-ink">{p}</p>
              <label className="mt-2 block text-[11px] text-muted">USD
                <input type="number" min="0" value={prices[p].usd} onChange={e => setPrices({ ...prices, [p]: { ...prices[p], usd: e.target.value } })} className={input} />
              </label>
              <label className="mt-2 block text-[11px] text-muted">BRL
                <input type="number" min="0" value={prices[p].brl} onChange={e => setPrices({ ...prices, [p]: { ...prices[p], brl: e.target.value } })} className={input} />
              </label>
            </div>
          ))}
        </div>
        <label className="mt-4 block text-[11px] text-muted">{t('pf.usdBrl')}
          <input type="number" step="0.01" min="0" value={usdBrl} onChange={e => setUsdBrl(e.target.value)} className={`${input} max-w-[10rem]`} />
        </label>
      </section>

      <section className="rounded-2xl border border-black/[0.08] bg-white p-6">
        <p className="text-xs font-medium text-muted">{t('pf.capTitle')}</p>
        <p className="mt-1 text-[11px] text-muted">{t('pf.capHint')}</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {(['starter', 'growth', 'congregation'] as const).map(p => (
            <label key={p} className="block text-[11px] capitalize text-muted">{p}
              <input type="number" min="0" step="1" value={planHours[p]} onChange={e => setPlanHours({ ...planHours, [p]: e.target.value })} placeholder="∞" className={input} />
            </label>
          ))}
        </div>
        <label className="mt-4 block text-[11px] text-muted">{t('pf.tolerance')}
          <input type="number" min="0" max="100" step="5" value={tol} onChange={e => setTol(e.target.value)} className={`${input} max-w-[8rem]`} />
        </label>
        <p className="mt-5 text-xs font-medium text-muted">{t('pf.packTitle')}</p>
        <p className="mt-1 text-[11px] text-muted">{t('pf.packHint')}</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-4">
          <label className="block text-[11px] text-muted">{t('pf.packHours')}
            <input type="number" min="1" step="1" value={pack.hours} onChange={e => setPack({ ...pack, hours: e.target.value })} className={input} />
          </label>
          <label className="block text-[11px] text-muted">USD
            <input type="number" min="0" value={pack.usd} onChange={e => setPack({ ...pack, usd: e.target.value })} className={input} />
          </label>
          <label className="block text-[11px] text-muted">BRL
            <input type="number" min="0" value={pack.brl} onChange={e => setPack({ ...pack, brl: e.target.value })} className={input} />
          </label>
          <label className="block text-[11px] text-muted">{t('pf.packMonths')}
            <input type="number" min="1" step="1" value={pack.valid_months} onChange={e => setPack({ ...pack, valid_months: e.target.value })} className={input} />
          </label>
        </div>
      </section>

      <div className="flex items-center gap-4">
        <button type="submit" disabled={busy} className="rounded-full bg-ink px-6 py-3 text-sm text-white disabled:opacity-60">{busy ? t('pf.working') : t('pf.save')}</button>
        {msg && <p className="text-sm text-emerald-700">{msg}</p>}
      </div>
    </form>
  );
}
