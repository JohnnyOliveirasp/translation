import { useEffect, useState, type FormEvent } from 'react';
import { CalendarDays, Check, Copy, CreditCard, Download, FileDown, Loader2, ExternalLink, LayoutDashboard, Languages as Languages2, Radio, Settings2, Trash2, Users } from 'lucide-react';
import { supabase, logoUrl, type Church, type Role } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { useLang } from '../../i18n';
import { useRouter } from '../../router';
import { LANGUAGE_CATALOG, PLAN_LIMITS, langLabel, posterHeadline } from '../../lib/languages';
import { AuthShell, Field, Select, Button, ErrorMsg, Note } from '../auth/ui';
import Shell, { PageHead, type NavItem } from './Shell';
import QrCode, { downloadQrPng } from '../../components/QrCode';
import ChurchLogo, { detectLightLogo } from '../../components/ChurchLogo';
import { downloadPosterPdf } from '../../lib/poster';

type Tab = 'overview' | 'settings' | 'languages' | 'team' | 'services' | 'sermons' | 'billing';
const SITE = 'https://livetranslate.church';

/** Logado sem igreja. Se o signup deixou a igreja pendente no navegador (fluxo do
 *  Google: preencheu o formulário → OAuth → voltou aqui), cria sozinha; senão manda
 *  para o /signup, que para quem já está logado pede só os dados da igreja. */
function SemIgreja() {
  const { t } = useLang();
  const { refresh, signOut } = useAuth();
  const [criando, setCriando] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    const pendente = JSON.parse(sessionStorage.getItem('lt-pending-church') || 'null');
    if (!pendente?.name || !pendente?.slug) return;
    setCriando(true);
    const defaults = pendente.lang === 'en' ? ['es', 'pt-BR'] : ['en'];
    supabase.rpc('create_church', {
      p_name: pendente.name, p_slug: pendente.slug, p_speaker_lang: pendente.lang, p_languages: defaults,
    }).then(async ({ error }) => {
      sessionStorage.removeItem('lt-pending-church');
      if (error) { setErr(error.message); setCriando(false); return; }
      await refresh();   // memberships chegam e o Admin renderiza normal
    });
  }, [refresh]);
  return (
    <AuthShell>
      {criando ? (
        <p className="flex items-center gap-2 text-sm text-muted"><Loader2 className="h-4 w-4 animate-spin" /> {t('a.working')}</p>
      ) : (
        <>
          <ErrorMsg msg={err} />
          <p className={`text-sm text-muted ${err ? 'mt-4' : ''}`}>{t('ad.noChurch')}</p>
          <a href="/signup" className="mt-6 inline-block rounded-full bg-ink px-6 py-3 text-sm text-white">{t('ad.createChurch')}</a>
          <button onClick={signOut} className="mt-4 block text-xs text-muted hover:text-ink">{t('ad.signout')}</button>
        </>
      )}
    </AuthShell>
  );
}

export default function Admin() {
  const { t } = useLang();
  const { navigate } = useRouter();
  const { loading, user, memberships, signOut } = useAuth();
  const [tab, setTab] = useState<Tab>('overview');

  useEffect(() => { if (!loading && !user) navigate('/login'); }, [loading, user, navigate]);
  if (loading || !user) return null;

  const m = memberships[0];
  if (!m) return <SemIgreja />;
  const church = m.churches;
  const isAdmin = m.role === 'admin';
  const items: (NavItem & { admin?: boolean; sub?: string })[] = [
    { id: 'overview', label: t('ad.overview'), icon: LayoutDashboard },
    { id: 'languages', label: t('ad.languages'), icon: Languages2, admin: true },
    { id: 'services', label: t('ad.services'), icon: CalendarDays },
    { id: 'sermons', label: t('ad.sermons'), icon: FileDown },
    { id: 'team', label: t('ad.team'), icon: Users, admin: true },
    { id: 'settings', label: t('ad.settings'), icon: Settings2, admin: true },
    { id: 'billing', label: t('ad.billing'), icon: CreditCard, admin: true },
  ];
  const visible = items.filter(x => !x.admin || isAdmin);
  const current = visible.find(x => x.id === tab) ?? visible[0];

  return (
    <Shell
      church={church}
      items={visible}
      active={current.id}
      onSelect={id => setTab(id as Tab)}
      user={user.email ?? ''}
      onSignOut={() => signOut().then(() => navigate('/'))}
    >
      <PageHead
        title={current.label}
        sub={current.id === 'overview' ? `${SITE}/${church.slug} · ${t('ad.role.' + m.role)}` : undefined}
        right={
          <a href={`/broadcast/${church.slug}`} className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm text-white">
            <Radio className="h-4 w-4" /> {t('ad.broadcast')}
          </a>
        }
      />
      {tab === 'overview' && <Overview church={church} />}
      {tab === 'settings' && isAdmin && <Settings church={church} />}
      {tab === 'languages' && isAdmin && <LanguagesTab church={church} />}
      {tab === 'team' && isAdmin && <Team church={church} userId={user.id} />}
      {tab === 'services' && <Services church={church} />}
      {tab === 'sermons' && <Sermons church={church} />}
      {tab === 'billing' && isAdmin && <Billing church={church} />}
    </Shell>
  );
}

/* ── Assinatura ──────────────────────────────────────────────────────────── */
function Billing({ church }: { church: Church }) {
  const { t, lang } = useLang();
  const { refresh } = useAuth();
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const loc = lang === 'pt' ? 'pt-BR' : lang;
  const ends = church.trial_ends_at ? new Date(church.trial_ends_at) : null;
  const daysLeft = ends ? Math.max(0, Math.ceil((ends.getTime() - Date.now()) / 86400000)) : null;
  const canceled = church.status === 'canceled';

  async function cancel() {
    setErr(null); setBusy(true);
    const { error } = await supabase.rpc('cancel_subscription');
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setDone(true); await refresh();
  }
  async function resume() {
    setErr(null); setBusy(true);
    const { error } = await supabase.rpc('resume_subscription');
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setConfirming(false); setDone(false); await refresh();
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="rounded-2xl border border-black/[0.08] bg-white p-6">
        <p className="text-xs font-medium text-muted">{t('ad.plan')}</p>
        <p className="mt-1 font-serif text-2xl capitalize">{church.plan}</p>
        <dl className="mt-5 grid grid-cols-2 gap-y-3 text-sm">
          <dt className="text-muted">{t('ad.status')}</dt><dd>{t('ad.status.' + church.status)}</dd>
          <dt className="text-muted">{church.status === 'trial' ? t('ad.trialEnds') : t('ad.accessUntil')}</dt>
          <dd>{ends ? ends.toLocaleDateString(loc, { dateStyle: 'medium' }) : '—'}</dd>
        </dl>
        {church.status === 'trial' && daysLeft !== null && (
          <p className="mt-4 rounded-xl bg-black/[0.04] px-4 py-3 text-sm">{t('ad.trialLeft').replace('{n}', String(daysLeft))}</p>
        )}
      </div>

      <div className="rounded-2xl border border-black/[0.08] bg-white p-6">
        <p className="text-xs font-medium text-muted">{t('ad.subscription')}</p>
        <ErrorMsg msg={err} />
        {canceled ? (
          <>
            <p className="mt-3 text-sm text-ink">{t('ad.canceledMsg')}</p>
            <p className="mt-1 text-xs text-muted">{t('ad.canceledUntil')} {ends ? ends.toLocaleDateString(loc, { dateStyle: 'medium' }) : '—'}</p>
            <button onClick={resume} disabled={busy} className="mt-5 rounded-full bg-ink px-5 py-2.5 text-sm text-white disabled:opacity-60">
              {busy ? t('a.working') : t('ad.resume')}
            </button>
          </>
        ) : done ? (
          <p className="mt-3 text-sm text-ink">{t('ad.cancelDone')}</p>
        ) : !confirming ? (
          <>
            <p className="mt-3 text-sm text-muted">{t('ad.billingHint')}</p>
            <button onClick={() => setConfirming(true)} className="mt-5 text-sm text-muted underline underline-offset-4 transition-colors hover:text-red-600">
              {t('ad.cancel')}
            </button>
          </>
        ) : (
          <div className="mt-3">
            <p className="font-serif text-xl">{t('ad.cancelTitle')}</p>
            <p className="mt-2 text-sm text-muted">{t('ad.cancelSub')}</p>
            <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} placeholder={t('ad.cancelReason')}
              className="mt-4 w-full rounded-xl border border-black/10 px-4 py-3 text-sm outline-none focus:border-ink" />
            <div className="mt-4 flex flex-wrap gap-2">
              <button onClick={() => setConfirming(false)} className="rounded-full border border-black/10 px-5 py-2.5 text-sm hover:bg-black/[0.04]">{t('ad.keep')}</button>
              <button onClick={cancel} disabled={busy} className="rounded-full border border-red-200 bg-red-50 px-5 py-2.5 text-sm text-red-700 disabled:opacity-60">
                {busy ? t('a.working') : t('ad.cancelConfirm')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Visão geral ─────────────────────────────────────────────────────────── */
function Overview({ church }: { church: Church }) {
  const { t, lang } = useLang();
  const [copied, setCopied] = useState(false);
  const [langs, setLangs] = useState<string[]>([]);
  const [pdfBusy, setPdfBusy] = useState(false);

  useEffect(() => {
    supabase.from('church_languages').select('lang_code').eq('church_id', church.id).eq('enabled', true)
      .then(({ data }) => setLangs((data ?? []).map(r => r.lang_code)));
  }, [church.id]);

  async function poster() {
    setPdfBusy(true);
    try {
      await downloadPosterPdf({
        churchName: church.name,
        logoUrl: logoUrl(church.logo_path),
        logoIsLight: church.logo_is_light,
        url: link,
        headline: posterHeadline(church.speaker_lang),
        scanLine: t('poster.scan'),
        translations: langs.map(code => ({ label: langLabel(code), text: posterHeadline(code) })),
        footer: t('poster.footer'),
      }, `livetranslate-${church.slug}`);
    } finally { setPdfBusy(false); }
  }
  const link = `${SITE}/${church.slug}`;
  const copy = () => navigator.clipboard.writeText(link).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  const fmt = (d: string | null) => d ? new Date(d).toLocaleDateString(lang === 'pt' ? 'pt-BR' : lang) : '—';
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="rounded-2xl border border-black/[0.08] bg-white p-6">
        <p className="text-xs font-medium text-muted">{t('ad.listenerLink')}</p>
        <div className="mt-2 flex items-center gap-2">
          <code className="flex-1 truncate rounded-lg bg-black/[0.04] px-3 py-2 text-sm">{link}</code>
          <button onClick={copy} className="rounded-lg border border-black/10 p-2 hover:bg-black/[0.04]" aria-label={t('ad.copyLink')}>
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </button>
        </div>
        <p className="mt-2 text-xs text-muted">{t('ad.listenerHint')}</p>
        <a href={`/broadcast/${church.slug}`} className="mt-5 inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm text-white">
          <Radio className="h-4 w-4" /> {t('ad.broadcast')}
        </a>
      </div>
      <div className="rounded-2xl border border-black/[0.08] bg-white p-6 text-sm">
        <dl className="grid grid-cols-2 gap-y-3">
          <dt className="text-muted">{t('ad.plan')}</dt><dd className="capitalize">{church.plan}</dd>
          <dt className="text-muted">{t('ad.status')}</dt><dd>{t('ad.status.' + church.status)}</dd>
          <dt className="text-muted">{t('ad.trialEnds')}</dt><dd>{fmt(church.trial_ends_at)}</dd>
        </dl>
      </div>

      {/* QR exclusivo da igreja: aponta para /{slug} e abre com o logo (ou o nome) da igreja */}
      <div className="rounded-2xl border border-black/[0.08] bg-white p-6 md:col-span-2">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
          <div className="shrink-0 rounded-2xl border border-black/[0.08] p-3">
            <QrCode text={link} className="h-40 w-40 [&>svg]:h-full [&>svg]:w-full" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-muted">{t('ad.qr')}</p>
            <p className="mt-2 text-sm text-muted">{t('ad.qrHint')}</p>
            <p className="mt-3 flex items-center gap-2 text-sm">
              {church.logo_path
                ? <><ChurchLogo path={church.logo_path} light={church.logo_is_light} name={church.name}
                      className="h-7 rounded" imgClassName="max-h-5 max-w-[6rem]" /> {t('ad.qrLogoOn')}</>
                : <span className="text-muted">{t('ad.qrLogoOff')}</span>}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button onClick={poster} disabled={pdfBusy}
                className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm text-white disabled:opacity-60">
                <FileDown className="h-4 w-4" /> {pdfBusy ? t('a.working') : t('ad.qrPdf')}
              </button>
              <button onClick={() => downloadQrPng(link, `qr-${church.slug}`)}
                className="inline-flex items-center gap-2 rounded-full border border-black/10 px-5 py-2.5 text-sm hover:bg-black/[0.04]">
                <Download className="h-4 w-4" /> {t('ad.qrDownload')}
              </button>
              <a href={`/${church.slug}`} target="_blank" rel="noopener"
                className="inline-flex items-center gap-2 rounded-full border border-black/10 px-5 py-2.5 text-sm hover:bg-black/[0.04]">
                <ExternalLink className="h-4 w-4" /> {t('ad.qrPreview')}
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Configurações ───────────────────────────────────────────────────────── */
function Settings({ church }: { church: Church }) {
  const { t } = useLang();
  const { refresh } = useAuth();
  const [name, setName] = useState(church.name);
  const [speakerLang, setSpeakerLang] = useState(church.speaker_lang);
  const [recipients, setRecipients] = useState(church.sermon_recipients.join(', '));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function save(e: FormEvent) {
    e.preventDefault(); setErr(null); setMsg(null); setBusy(true);
    const list = recipients.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    const { error } = await supabase.from('churches').update({
      name, speaker_lang: speakerLang, sermon_recipients: list,
    }).eq('id', church.id);
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setMsg(t('ad.saved')); await refresh();
  }

  async function upload(file: File) {
    setErr(null); setMsg(null);
    if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 2 * 1024 * 1024) { setErr(t('ad.logoHint')); return; }
    setBusy(true);
    const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
    const path = `${church.id}/logo.${ext}`;
    const up = await supabase.storage.from('logos').upload(path, file, { upsert: true, contentType: file.type });
    if (up.error) { setBusy(false); setErr(up.error.message); return; }
    // Logo de texto branco em PNG transparente sumiria no fundo claro — detecta e marca.
    const isLight = await detectLightLogo(file);
    const { error } = await supabase.from('churches').update({ logo_path: path, logo_is_light: isLight }).eq('id', church.id);
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setMsg(t('ad.saved')); await refresh();
  }

  return (
    <form onSubmit={save} className="grid gap-6 md:grid-cols-2">
      <div className="space-y-4">
        <Field label={t('a.churchName')} value={name} onChange={e => setName(e.target.value)} required />
        <Select label={t('a.speakerLang')} value={speakerLang} onChange={e => setSpeakerLang(e.target.value)}>
          {LANGUAGE_CATALOG.map(l => <option key={l.code} value={l.code}>{l.flag} {l.label}</option>)}
        </Select>
        <Field label={t('ad.recipients')} hint={t('ad.recipientsHint')} value={recipients} onChange={e => setRecipients(e.target.value)} placeholder="pastor@church.org, office@church.org" />
        <ErrorMsg msg={err} />
        {msg && <Note>{msg}</Note>}
        <Button type="submit" loading={busy}>{busy ? t('a.working') : t('ad.save')}</Button>
      </div>
      <div className="rounded-2xl border border-black/[0.08] bg-white p-6">
        <p className="text-xs font-medium text-muted">{t('ad.logo')}</p>
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <ChurchLogo path={church.logo_path} light={church.logo_is_light} name={church.name}
            className="h-20 rounded-xl" imgClassName="max-h-16 max-w-[10rem]"
            fallbackClassName="h-20 w-20 rounded-xl text-3xl" />
          <label className="cursor-pointer rounded-full border border-ink px-4 py-2 text-sm hover:bg-black/[0.04]">
            {t('ad.upload')}
            <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={e => e.target.files?.[0] && upload(e.target.files[0])} />
          </label>
        </div>
        <p className="mt-3 text-xs text-muted">{t('ad.logoHint')}</p>
        {church.logo_path && (
          <label className="mt-4 flex items-start gap-3 text-sm">
            <input type="checkbox" checked={church.logo_is_light} className="mt-1 h-4 w-4"
              onChange={async e => {
                const v = e.target.checked;
                const { error } = await supabase.from('churches').update({ logo_is_light: v }).eq('id', church.id);
                if (error) { setErr(error.message); return; }
                await refresh();
              }} />
            <span>{t('ad.logoLight')}</span>
          </label>
        )}
      </div>
    </form>
  );
}

/* ── Idiomas ─────────────────────────────────────────────────────────────── */
function LanguagesTab({ church }: { church: Church }) {
  const { t } = useLang();
  const [enabled, setEnabled] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const limit = PLAN_LIMITS[church.plan] ?? 2;

  useEffect(() => {
    supabase.from('church_languages').select('lang_code').eq('church_id', church.id).eq('enabled', true)
      .then(({ data }) => setEnabled((data ?? []).map(r => r.lang_code)));
  }, [church.id]);

  async function toggle(code: string) {
    setErr(null);
    if (enabled.includes(code)) {
      const { error } = await supabase.from('church_languages').delete().eq('church_id', church.id).eq('lang_code', code);
      if (error) { setErr(error.message); return; }
      setEnabled(enabled.filter(c => c !== code));
    } else {
      if (enabled.length >= limit) return;
      const { error } = await supabase.from('church_languages').insert({ church_id: church.id, lang_code: code });
      if (error) { setErr(error.message); return; }
      setEnabled([...enabled, code]);
    }
  }

  return (
    <div>
      <p className="mb-4 text-sm text-muted">{t('ad.langHint').replace('{n}', String(limit))} · {enabled.length}/{limit}</p>
      <ErrorMsg msg={err} />
      <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
        {LANGUAGE_CATALOG.filter(l => l.code !== church.speaker_lang).map(l => {
          const on = enabled.includes(l.code);
          const full = !on && enabled.length >= limit;
          return (
            <button key={l.code} onClick={() => toggle(l.code)} disabled={full}
              className={`flex items-center justify-between rounded-xl border px-4 py-3 text-left text-sm transition-colors ${on ? 'border-ink bg-ink text-white' : 'border-black/10 bg-white hover:border-ink'} disabled:opacity-40`}>
              <span>{l.flag} {l.label}</span>{on && <Check className="h-4 w-4" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ── Equipe ──────────────────────────────────────────────────────────────── */
type Member = { user_id: string; role: Role; profiles: { email: string; full_name: string | null } | null };
type InviteRow = { id: number; email: string; role: Role; token: string; expires_at: string };

function Team({ church, userId }: { church: Church; userId: string }) {
  const { t } = useLang();
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('operator');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  async function load() {
    const [m, i] = await Promise.all([
      supabase.from('memberships').select('user_id, role, profiles(email, full_name)').eq('church_id', church.id),
      supabase.from('invites').select('id, email, role, token, expires_at').eq('church_id', church.id).is('accepted_at', null).order('created_at', { ascending: false }),
    ]);
    setMembers(((m.data ?? []) as unknown) as Member[]);
    setInvites((i.data ?? []) as InviteRow[]);
  }
  useEffect(() => { load(); }, [church.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function invite(e: FormEvent) {
    e.preventDefault(); setErr(null); setBusy(true);
    const { error } = await supabase.from('invites').insert({ church_id: church.id, email: email.trim().toLowerCase(), role, invited_by: userId });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setEmail(''); await load();
  }
  async function remove(uid: string) {
    const { error } = await supabase.from('memberships').delete().eq('church_id', church.id).eq('user_id', uid);
    if (error) { setErr(error.message); return; }
    await load();
  }
  async function revoke(id: number) {
    await supabase.from('invites').delete().eq('id', id); await load();
  }
  function copyLink(inv: InviteRow) {
    navigator.clipboard.writeText(`${window.location.origin}/invite/${inv.token}`)
      .then(() => { setCopiedId(inv.id); setTimeout(() => setCopiedId(null), 1500); });
  }

  return (
    <div className="grid gap-8 md:grid-cols-2">
      <div>
        <h3 className="mb-3 font-serif text-2xl">{t('ad.members')}</h3>
        <ul className="divide-y divide-black/[0.06] rounded-2xl border border-black/[0.08] bg-white">
          {members.map(mb => (
            <li key={mb.user_id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <div>
                <div>{mb.profiles?.full_name || mb.profiles?.email} {mb.user_id === userId && <span className="text-muted">({t('ad.you')})</span>}</div>
                <div className="text-xs text-muted">{mb.profiles?.email} · {t('ad.role.' + mb.role)}</div>
              </div>
              {mb.role === 'operator' && (
                <button onClick={() => remove(mb.user_id)} className="text-muted hover:text-red-600" aria-label={t('ad.remove')}><Trash2 className="h-4 w-4" /></button>
              )}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h3 className="mb-3 font-serif text-2xl">{t('ad.invites')}</h3>
        <form onSubmit={invite} className="mb-4 flex flex-wrap items-end gap-2">
          <div className="min-w-[200px] flex-1"><Field label={t('ad.inviteEmail')} type="email" value={email} onChange={e => setEmail(e.target.value)} required /></div>
          <div className="w-36"><Select label="Role" value={role} onChange={e => setRole(e.target.value as Role)}>
            <option value="operator">{t('ad.role.operator')}</option><option value="admin">{t('ad.role.admin')}</option>
          </Select></div>
          <Button type="submit" loading={busy} className="!w-auto">{t('ad.invite')}</Button>
        </form>
        <ErrorMsg msg={err} />
        <p className="mb-3 text-xs text-muted">{t('ad.inviteHint')}</p>
        <ul className="divide-y divide-black/[0.06] rounded-2xl border border-black/[0.08] bg-white">
          {invites.map(inv => (
            <li key={inv.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <div><div>{inv.email}</div><div className="text-xs text-muted">{t('ad.role.' + inv.role)}</div></div>
              <div className="flex items-center gap-2">
                <button onClick={() => copyLink(inv)} className="inline-flex items-center gap-1 rounded-full border border-black/10 px-3 py-1 text-xs hover:bg-black/[0.04]">
                  {copiedId === inv.id ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />} {copiedId === inv.id ? t('ad.copied') : t('ad.copyLink')}
                </button>
                <button onClick={() => revoke(inv.id)} className="text-muted hover:text-red-600" aria-label={t('ad.remove')}><Trash2 className="h-4 w-4" /></button>
              </div>
            </li>
          ))}
          {!invites.length && <li className="px-4 py-3 text-xs text-muted">—</li>}
        </ul>
      </div>
    </div>
  );
}

/* ── Sermões em PDF (gerados no fim de cada culto) ────────────────────────── */
type SermonRow = { file: string; date: string; lang: string; bytes: number };

function Sermons({ church }: { church: Church }) {
  const { t, lang } = useLang();
  const [rows, setRows] = useState<SermonRow[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function auth(): Promise<Record<string, string>> {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`/api/sermons?slug=${encodeURIComponent(church.slug)}`, { headers: await auth() });
        if (!r.ok) throw new Error(String(r.status));
        setRows((await r.json()).sermons ?? []);
      } catch { setRows([]); }
    })();
  }, [church.slug]);

  async function baixar(row: SermonRow) {
    setErro(null);
    try {
      const r = await fetch(`/api/sermons?slug=${encodeURIComponent(church.slug)}&file=${encodeURIComponent(row.file)}`, { headers: await auth() });
      if (!r.ok) throw new Error(String(r.status));
      const blob = await r.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = href; a.download = `sermao-${church.slug}-${row.file}`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(href), 4000);
    } catch (e) { setErro(String(e)); }
  }

  const loc = lang === 'pt' ? 'pt-BR' : lang;
  if (rows === null) return <Loader2 className="h-4 w-4 animate-spin text-muted" />;
  if (!rows.length) return <p className="text-sm text-muted">{t('ad.noSermons')}</p>;

  return (
    <div>
      <p className="mb-4 text-sm text-muted">{t('ad.sermonsHint')}</p>
      <ErrorMsg msg={erro} />
      <ul className="divide-y divide-black/[0.06] rounded-2xl border border-black/[0.08] bg-white">
        {rows.map(r => (
          <li key={r.file} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
            <div>
              <div>{new Date(r.date + 'T12:00:00').toLocaleDateString(loc, { dateStyle: 'long' })}</div>
              <div className="text-xs text-muted">
                {r.lang === 'original' ? t('ad.sermonOriginal') : langLabel(r.lang)} · {Math.round(r.bytes / 1024)} KB
              </div>
            </div>
            <button onClick={() => baixar(r)} className="inline-flex items-center gap-2 rounded-full border border-black/10 px-4 py-2 text-xs hover:bg-black/[0.04]">
              <FileDown className="h-3.5 w-3.5" /> PDF
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ── Cultos ──────────────────────────────────────────────────────────────── */
type ServiceRow = { id: number; started_at: string; ended_at: string | null; service_languages: { lang_code: string; minutes: number; peak_listeners: number }[] };

function Services({ church }: { church: Church }) {
  const { t, lang } = useLang();
  const [rows, setRows] = useState<ServiceRow[]>([]);
  useEffect(() => {
    supabase.from('services').select('id, started_at, ended_at, service_languages(lang_code, minutes, peak_listeners)')
      .eq('church_id', church.id).order('started_at', { ascending: false }).limit(50)
      .then(({ data }) => setRows(((data ?? []) as unknown) as ServiceRow[]));
  }, [church.id]);
  const loc = lang === 'pt' ? 'pt-BR' : lang;
  const dur = (a: string, b: string | null) => b ? Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000) + ' min' : '…';
  if (!rows.length) return <p className="text-sm text-muted">{t('ad.noServices')}</p>;
  return (
    <div className="overflow-x-auto rounded-2xl border border-black/[0.08] bg-white">
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-muted"><tr>
          <th className="px-4 py-3 font-medium">{t('ad.date')}</th><th className="px-4 py-3 font-medium">{t('ad.duration')}</th><th className="px-4 py-3 font-medium">{t('ad.langs')}</th>
        </tr></thead>
        <tbody className="divide-y divide-black/[0.06]">
          {rows.map(r => (
            <tr key={r.id}>
              <td className="px-4 py-3">{new Date(r.started_at).toLocaleString(loc, { dateStyle: 'medium', timeStyle: 'short' })}</td>
              <td className="px-4 py-3">{dur(r.started_at, r.ended_at)}</td>
              <td className="px-4 py-3 text-muted">{r.service_languages.map(l => `${langLabel(l.lang_code)} · ${l.minutes} min · ${l.peak_listeners}`).join('  |  ') || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
