import { useState, type FormEvent } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { useLang } from '../../i18n';
import { useRouter } from '../../router';
import { LANGUAGE_CATALOG } from '../../lib/languages';
import { AuthShell, Title, Field, Select, Button, ErrorMsg, slugify } from './ui';

type Step = 'form' | 'verify';
const PENDING_KEY = 'lt-pending-church';

export default function Signup() {
  const { t } = useLang();
  const { navigate } = useRouter();
  const { refresh } = useAuth();
  const [step, setStep] = useState<Step>('form');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [fullName, setFullName] = useState('');
  const [churchName, setChurchName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [speakerLang, setSpeakerLang] = useState('en');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');

  const onName = (v: string) => { setChurchName(v); if (!slugTouched) setSlug(slugify(v)); };

  async function createChurch() {
    const pending = JSON.parse(sessionStorage.getItem(PENDING_KEY) || 'null') || { name: churchName, slug, lang: speakerLang };
    const defaults = pending.lang === 'en' ? ['es', 'pt-BR'] : ['en'];
    const { error } = await supabase.rpc('create_church', {
      p_name: pending.name, p_slug: pending.slug, p_speaker_lang: pending.lang, p_languages: defaults,
    });
    if (error) {
      if (error.code === '23505') { setErr(t('a.err.slug')); setStep('form'); return false; }
      setErr(error.message); return false;
    }
    sessionStorage.removeItem(PENDING_KEY);
    await refresh();
    navigate('/admin');
    return true;
  }

  async function submit(e: FormEvent) {
    e.preventDefault(); setErr(null);
    if (password.length < 8) { setErr(t('a.err.weak')); return; }
    setBusy(true);
    sessionStorage.setItem(PENDING_KEY, JSON.stringify({ name: churchName, slug, lang: speakerLang }));
    const { data, error } = await supabase.auth.signUp({
      email, password, options: { data: { full_name: fullName } },
    });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    if (data.session) { setBusy(true); await createChurch(); setBusy(false); return; }
    setStep('verify'); // confirmação por código do Supabase (6 a 8 dígitos)
  }

  async function verify(e: FormEvent) {
    e.preventDefault(); setErr(null); setBusy(true);
    const { error } = await supabase.auth.verifyOtp({ email, token: code.replace(/\D/g, ''), type: 'signup' });
    if (error) { setBusy(false); setErr(t('a.err.code')); return; }
    await createChurch();
    setBusy(false);
  }

  async function resend() {
    setErr(null);
    await supabase.auth.resend({ type: 'signup', email });
  }

  if (step === 'verify') {
    return (
      <AuthShell>
        <Title text={t('a.verify.title')} />
        <p className="mt-3 text-sm text-muted">{t('a.verify.sub')} <strong className="text-ink">{email}</strong></p>
        <form onSubmit={verify} className="mt-8 space-y-4">
          <Field label={t('a.code')} inputMode="numeric" pattern="[0-9]*" maxLength={8} autoComplete="one-time-code"
            value={code} onChange={e => setCode(e.target.value)} required autoFocus className="tracking-[0.4em]" />
          <ErrorMsg msg={err} />
          <Button type="submit" loading={busy}>{busy ? t('a.working') : t('a.verify.cta')}</Button>
          <button type="button" onClick={resend} className="w-full text-center text-xs text-muted hover:text-ink">{t('a.verify.resend')}</button>
        </form>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <Title text={t('a.signup.title')} />
      <p className="mt-3 text-sm text-muted">{t('a.signup.sub')}</p>
      <form onSubmit={submit} className="mt-8 space-y-4">
        <Field label={t('a.fullName')} value={fullName} onChange={e => setFullName(e.target.value)} required autoComplete="name" />
        <Field label={t('a.churchName')} value={churchName} onChange={e => onName(e.target.value)} required />
        <Field label={t('a.slug')} value={slug} onChange={e => { setSlugTouched(true); setSlug(slugify(e.target.value)); }}
          required pattern="[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?" hint={`livetranslate.church/${slug || 'your-church'}`} />
        <Select label={t('a.speakerLang')} value={speakerLang} onChange={e => setSpeakerLang(e.target.value)}>
          {LANGUAGE_CATALOG.map(l => <option key={l.code} value={l.code}>{l.flag} {l.label}</option>)}
        </Select>
        <Field label={t('a.email')} type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" />
        <Field label={t('a.password')} type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} autoComplete="new-password" />
        <ErrorMsg msg={err} />
        <Button type="submit" loading={busy}>{busy ? t('a.working') : t('a.signup.cta')}</Button>
      </form>
      <p className="mt-6 text-center text-xs text-muted">{t('a.haveAccount')} <a href="/login" className="text-ink underline">{t('a.login.cta')}</a></p>
    </AuthShell>
  );
}
