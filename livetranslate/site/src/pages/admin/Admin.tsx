import { useEffect, useState, type FormEvent } from 'react';
import { CalendarDays, Check, ChevronDown, Copy, CreditCard, Download, FileDown, Loader2, ExternalLink, LayoutDashboard, Languages as Languages2, Lock, Radio, Settings2, ShieldCheck, Trash2, Users } from 'lucide-react';
import { supabase, logoUrl, type Church, type Role } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { useLang } from '../../i18n';
import { useRouter } from '../../router';
import { LANGUAGE_CATALOG, SPEAKER_CATALOG, languageLimit, langLabel, posterHeadline } from '../../lib/languages';
import { AuthShell, Field, Select, Button, ErrorMsg, Note } from '../auth/ui';
import Shell, { PageHead, type NavItem } from './Shell';
import QrCode, { downloadQrPng } from '../../components/QrCode';
import ChurchLogo, { detectLightLogo } from '../../components/ChurchLogo';
import { downloadPosterPdf } from '../../lib/poster';
import Billing from './Billing';

type Tab = 'overview' | 'settings' | 'languages' | 'team' | 'services' | 'sermons' | 'billing';
const SITE = 'https://livetranslate.church';

/** Logado sem igreja. Se o signup deixou a igreja pendente no navegador (fluxo do
 *  Google: preencheu o formulário → OAuth → voltou aqui), cria sozinha; senão manda
 *  DIRETO para o /signup, que para quem já está logado pede só os dados da igreja
 *  (22/09: sem tela intermediária — a igreja é obrigatória para usar qualquer coisa). */
function SemIgreja() {
  const { t } = useLang();
  const { refresh, signOut } = useAuth();
  const { navigate } = useRouter();
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    const pendente = JSON.parse(sessionStorage.getItem('lt-pending-church') || 'null');
    if (!pendente?.name || !pendente?.slug) { navigate('/signup'); return; }
    const defaults = pendente.lang === 'en' ? ['es', 'pt-BR'] : ['en'];
    supabase.rpc('create_church', {
      p_name: pendente.name, p_slug: pendente.slug, p_speaker_lang: pendente.lang, p_languages: defaults, p_country: pendente.country ?? null,
    }).then(async ({ error }) => {
      sessionStorage.removeItem('lt-pending-church');
      if (error) { setErr(error.message); return; }
      await refresh();   // memberships chegam e o Admin renderiza normal
    });
  }, [refresh, navigate]);
  return (
    <AuthShell>
      {err ? (
        <>
          <ErrorMsg msg={err} />
          <p className="mt-4 text-sm text-muted">{t('ad.noChurch')}</p>
          <a href="/signup" className="mt-6 inline-block rounded-full bg-ink px-6 py-3 text-sm text-white">{t('ad.createChurch')}</a>
          <button onClick={signOut} className="mt-4 block text-xs text-muted hover:text-ink">{t('ad.signout')}</button>
        </>
      ) : (
        <p className="flex items-center gap-2 text-sm text-muted"><Loader2 className="h-4 w-4 animate-spin" /> {t('a.working')}</p>
      )}
    </AuthShell>
  );
}

export default function Admin() {
  const { t } = useLang();
  const { navigate } = useRouter();
  const { loading, user, memberships, isPlatformAdmin, signOut } = useAuth();
  const [tab, setTab] = useState<Tab>('overview');

  useEffect(() => { if (!loading && !user) navigate('/login'); }, [loading, user, navigate]);
  // Admin da PLATAFORMA (Johnny) cai direto no /platform — pedido de 22/09 ("eu sou o administrador do
  // site todo"). Com `?church=<id>` ele fica aqui: se for membro, é a igreja dele; se não for, abre a
  // igreja escolhida no seletor do /platform COMO SE fosse o admin dela (RLS já deixa a plataforma ler
  // e escrever nas tabelas da igreja; a API aceita platform admin em requireMember).
  const churchParam = new URLSearchParams(window.location.search).get('church');
  const wantedId = Number(churchParam) || 0;
  const vaiParaPlataforma = !loading && !!user && isPlatformAdmin && churchParam === null;
  useEffect(() => { if (vaiParaPlataforma) navigate('/platform'); }, [vaiParaPlataforma, navigate]);

  const own = memberships.find(x => x.church_id === wantedId) ?? null;
  const [asPlatform, setAsPlatform] = useState<Church | null>(null);
  const [asPlatformErr, setAsPlatformErr] = useState<string | null>(null);
  const precisaCarregar = !loading && !!user && isPlatformAdmin && wantedId > 0 && !own;
  useEffect(() => {
    if (!precisaCarregar) { setAsPlatform(null); return; }
    supabase.from('churches').select('*').eq('id', wantedId).maybeSingle()
      .then(({ data, error }) => { if (error || !data) setAsPlatformErr(error?.message ?? 'church not found'); else setAsPlatform(data as Church); });
  }, [precisaCarregar, wantedId]);

  if (loading || !user || vaiParaPlataforma) return null;
  if (precisaCarregar && !asPlatform && !asPlatformErr) {
    return <AuthShell><p className="flex items-center gap-2 text-sm text-muted"><Loader2 className="h-4 w-4 animate-spin" /> {t('a.working')}</p></AuthShell>;
  }

  // id inexistente (ex.: link antigo ?church=1) → cai na própria igreja; sem igreja própria, mostra o erro
  const m = own ?? (asPlatform ? { church_id: asPlatform.id, role: 'admin' as Role, churches: asPlatform } : memberships[0]);
  if (!m) return asPlatformErr ? <AuthShell><ErrorMsg msg={asPlatformErr} /></AuthShell> : <SemIgreja />;
  const church = m.churches;
  const isAdmin = m.role === 'admin';
  const vendoComoPlataforma = !!asPlatform && m.churches.id === asPlatform.id;
  const items: (NavItem & { admin?: boolean; sub?: string })[] = [
    { id: 'overview', label: t('ad.overview'), icon: LayoutDashboard },
    { id: 'languages', label: t('ad.languages'), icon: Languages2, admin: true },
    { id: 'services', label: t('ad.services'), icon: CalendarDays },
    { id: 'sermons', label: t('ad.sermons'), icon: FileDown },
    { id: 'team', label: t('ad.team'), icon: Users, admin: true },
    { id: 'settings', label: t('ad.settings'), icon: Settings2, admin: true },
    { id: 'billing', label: t('ad.billing'), icon: CreditCard, admin: true },
  ];
  // painel da PLATAFORMA (só platform_admins): entra no menu como atalho para /platform
  if (isPlatformAdmin) items.push({ id: 'platform', label: t('pf.nav'), icon: ShieldCheck });
  const visible = items.filter(x => !x.admin || isAdmin);
  const current = visible.find(x => x.id === tab) ?? visible[0];

  return (
    <Shell
      church={church}
      items={visible}
      active={current.id}
      onSelect={id => id === 'platform' ? navigate('/platform') : setTab(id as Tab)}
      user={user.email ?? ''}
      onSignOut={() => signOut().then(() => navigate('/'))}
    >
      {vendoComoPlataforma && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span><ShieldCheck className="mr-2 inline h-4 w-4" />{t('pf.viewingAs').replace('{c}', church.name)}</span>
          <a href="/platform" className="rounded-full border border-amber-300 bg-white px-4 py-1.5 text-xs hover:border-amber-500">{t('pf.backToPlatform')}</a>
        </div>
      )}
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

/* ── Visão geral ─────────────────────────────────────────────────────────── */
function Overview({ church }: { church: Church }) {
  const { t, lang } = useLang();
  const [copied, setCopied] = useState(false);
  const [langs, setLangs] = useState<string[]>([]);
  const [pdfBusy, setPdfBusy] = useState(false);

  useEffect(() => {
    supabase.from('church_languages').select('lang_code').eq('church_id', church.id).eq('enabled', true).eq('blocked_by_platform', false)
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
          <dt className="text-muted">{t('ad.plan')}</dt><dd className="capitalize">{church.status === 'trial' ? t('ad.planTrial') : church.plan}</dd>
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
    // Se o orador passou a falar um idioma que estava ligado para os ouvintes, desliga essa linha:
    // ninguém pode "ouvir tradução" para o idioma que está sendo falado (a API recusa e o ouvinte veria erro).
    if (!error && speakerLang !== church.speaker_lang) {
      await supabase.from('church_languages').delete().eq('church_id', church.id).eq('lang_code', speakerLang);
    }
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
          {SPEAKER_CATALOG.map(l => <option key={l.code} value={l.code}>{l.flag} {l.label}</option>)}
        </Select>
        <Field label={t('ad.recipients')} hint={t('ad.recipientsHint')} value={recipients} onChange={e => setRecipients(e.target.value)} placeholder={t('ad.recipientsPh')} />
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
  const [blocked, setBlocked] = useState<string[]>([]);   // bloqueado pela PLATAFORMA (0009) — a igreja não destrava
  const [err, setErr] = useState<string | null>(null);
  const limit = languageLimit(church);   // 0012: override do /platform ou o do plano

  useEffect(() => {
    supabase.from('church_languages').select('lang_code, blocked_by_platform').eq('church_id', church.id).eq('enabled', true)
      .then(({ data }) => {
        setEnabled((data ?? []).map(r => r.lang_code));
        setBlocked((data ?? []).filter(r => r.blocked_by_platform).map(r => r.lang_code));
      });
  }, [church.id]);

  async function toggle(code: string) {
    setErr(null);
    if (blocked.includes(code)) return;
    if (enabled.includes(code)) {
      const { error } = await supabase.from('church_languages').delete().eq('church_id', church.id).eq('lang_code', code);
      if (error) { setErr(error.message); return; }
      setEnabled(enabled.filter(c => c !== code));
    } else {
      // antes saía calado (parecia bug: "o botão só desliga") — agora explica o limite
      if (enabled.length >= limit) { setErr(t('ad.langLimit').replace('{n}', String(limit))); return; }
      // upsert: a linha pode existir desligada (sobra de versão antiga) — insert dava 'duplicate key'
      const { error } = await supabase.from('church_languages').upsert({ church_id: church.id, lang_code: code, enabled: true }, { onConflict: 'church_id,lang_code' });
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
          const lock = blocked.includes(l.code);
          const full = !on && enabled.length >= limit;
          return (
            <button key={l.code} onClick={() => toggle(l.code)} disabled={lock} title={lock ? t('ad.langBlocked') : full ? t('ad.langLimit').replace('{n}', String(limit)) : undefined}
              className={`flex items-center justify-between rounded-xl border px-4 py-3 text-left text-sm transition-colors ${lock ? 'border-red-200 bg-red-50 text-red-700' : on ? 'border-ink bg-ink text-white' : 'border-black/10 bg-white hover:border-ink'} disabled:opacity-60`}>
              <span>{l.flag} {l.label}</span>{lock ? <Lock className="h-4 w-4" /> : on && <Check className="h-4 w-4" />}
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
// MÊS → CULTO (uma linha por dia) → um botão por idioma, com filtros de mês, data e idioma
// que só oferecem o que existe (pedido do Johnny em 22/09: "para não ficar solto").
type SermonRow = { file: string; date: string; lang: string; bytes: number };

function Sermons({ church }: { church: Church }) {
  const { t, lang } = useLang();
  const [rows, setRows] = useState<SermonRow[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [baixando, setBaixando] = useState<string | null>(null);
  const [fMes, setFMes] = useState('');
  const [fData, setFData] = useState('');
  const [fLang, setFLang] = useState('');
  const [abertos, setAbertos] = useState<Record<string, boolean>>({});

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
    setBaixando(row.file);
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
    finally { setBaixando(null); }
  }

  const loc = lang === 'pt' ? 'pt-BR' : lang;
  if (rows === null) return <Loader2 className="h-4 w-4 animate-spin text-muted" />;
  if (!rows.length) return <p className="text-sm text-muted">{t('ad.noSermons')}</p>;

  const nomeLang = (c: string) => (c === 'original' ? t('ad.sermonOriginal') : langLabel(c));
  const maiuscula = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
  const mesDe = (d: string) => d.slice(0, 7);
  const rotuloMes = (m: string) => maiuscula(new Date(`${m}-15T12:00:00`).toLocaleDateString(loc, { month: 'long', year: 'numeric' }));
  const rotuloDia = (d: string) => maiuscula(new Date(`${d}T12:00:00`).toLocaleDateString(loc, { weekday: 'long', day: 'numeric', month: 'long' }));
  // original primeiro; depois pelo nome do idioma
  const ordemLang = (a: string, b: string) => (a === 'original' ? -1 : b === 'original' ? 1 : nomeLang(a).localeCompare(nomeLang(b), loc));

  // opções dos filtros: só o que existe (a data respeita o mês escolhido)
  const meses = [...new Set(rows.map(r => mesDe(r.date)))].sort().reverse();
  const datas = [...new Set(rows.filter(r => !fMes || mesDe(r.date) === fMes).map(r => r.date))].sort().reverse();
  const idiomas = [...new Set(rows.map(r => r.lang))].sort(ordemLang);

  const visiveis = rows.filter(r => (!fMes || mesDe(r.date) === fMes) && (!fData || r.date === fData) && (!fLang || r.lang === fLang));
  const grupos = new Map<string, Map<string, SermonRow[]>>();   // mês → dia → PDFs
  for (const r of visiveis) {
    const m = mesDe(r.date);
    if (!grupos.has(m)) grupos.set(m, new Map());
    const dias = grupos.get(m)!;
    if (!dias.has(r.date)) dias.set(r.date, []);
    dias.get(r.date)!.push(r);
  }
  const mesesVis = [...grupos.keys()].sort().reverse();
  const filtrando = !!(fMes || fData || fLang);
  // aberto: o mês mais recente, ou todos quando há filtro; o clique manda
  const aberto = (m: string, i: number) => abertos[m] ?? (filtrando || i === 0);

  return (
    <div>
      <p className="mb-4 text-sm text-muted">{t('ad.sermonsHint')}</p>

      <div className="mb-3 grid gap-3 sm:grid-cols-3">
        <Select label={t('ad.fMonth')} value={fMes} onChange={e => { setFMes(e.target.value); setFData(''); }}>
          <option value="">{t('ad.allMonths')}</option>
          {meses.map(m => <option key={m} value={m}>{rotuloMes(m)}</option>)}
        </Select>
        <Select label={t('ad.fDate')} value={fData} onChange={e => setFData(e.target.value)}>
          <option value="">{t('ad.allDates')}</option>
          {datas.map(d => <option key={d} value={d}>{rotuloDia(d)}</option>)}
        </Select>
        <Select label={t('ad.fLang')} value={fLang} onChange={e => setFLang(e.target.value)}>
          <option value="">{t('ad.allLangs')}</option>
          {idiomas.map(c => <option key={c} value={c}>{nomeLang(c)}</option>)}
        </Select>
      </div>
      <div className="mb-5 h-5">
        {filtrando && (
          <button onClick={() => { setFMes(''); setFData(''); setFLang(''); }} className="text-xs text-muted underline underline-offset-2 hover:text-ink">
            {t('ad.clearFilters')}
          </button>
        )}
      </div>

      <ErrorMsg msg={erro} />

      {!mesesVis.length ? <p className="text-sm text-muted">{t('ad.noMatch')}</p> : (
        <div className="space-y-4">
          {mesesVis.map((m, i) => {
            const dias = grupos.get(m)!;
            const chaves = [...dias.keys()].sort().reverse();
            const abre = aberto(m, i);
            return (
              <section key={m} className="overflow-hidden rounded-2xl border border-black/[0.08] bg-white">
                <button onClick={() => setAbertos({ ...abertos, [m]: !abre })} aria-expanded={abre}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-black/[0.02]">
                  <span className="font-serif text-xl">{rotuloMes(m)}</span>
                  <span className="flex items-center gap-2 text-xs text-muted">
                    {chaves.length === 1 ? t('ad.oneService') : t('ad.nServices').replace('{n}', String(chaves.length))}
                    <ChevronDown className={`h-4 w-4 transition-transform ${abre ? 'rotate-180' : ''}`} />
                  </span>
                </button>
                {abre && (
                  <table className="w-full table-fixed text-sm">
                    <thead className="border-t border-black/[0.06] text-left text-xs text-muted">
                      <tr>
                        {/* largura fixa: a coluna de PDFs fica alinhada entre os meses */}
                        <th className="w-[42%] px-4 py-2 font-medium sm:w-[34%]">{t('ad.colService')}</th>
                        <th className="px-4 py-2 font-medium">{t('ad.colPdfs')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-black/[0.06]">
                      {chaves.map(d => (
                        <tr key={d} className="align-top">
                          <td className="px-4 py-3">{rotuloDia(d)}</td>
                          <td className="px-4 py-2.5">
                            <div className="flex flex-wrap gap-2">
                              {[...dias.get(d)!].sort((a, b) => ordemLang(a.lang, b.lang)).map(r => (
                                <button key={r.file} onClick={() => baixar(r)} disabled={baixando === r.file}
                                  title={`${Math.round(r.bytes / 1024)} KB`}
                                  className="inline-flex items-center gap-1.5 rounded-full border border-black/10 px-3 py-1.5 text-xs hover:bg-black/[0.04] disabled:opacity-50">
                                  {baixando === r.file ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />}
                                  {nomeLang(r.lang)}
                                </button>
                              ))}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>
            );
          })}
        </div>
      )}
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
