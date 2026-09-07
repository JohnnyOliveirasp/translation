import { useState, type FormEvent } from 'react';
import { supabase } from '../../lib/supabase';
import { useLang } from '../../i18n';
import { useRouter } from '../../router';
import { AuthShell, Title, Field, Button, ErrorMsg, GoogleButton, OrDivider } from './ui';

export default function Login() {
  const { t } = useLang();
  const { navigate } = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [needsCode, setNeedsCode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault(); setErr(null); setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      if (/not confirmed/i.test(error.message)) {
        await supabase.auth.resend({ type: 'signup', email });
        setNeedsCode(true); setErr(t('a.err.notConfirmed'));
        return;
      }
      setErr(t('a.err.creds')); return;
    }
    navigate('/admin');
  }

  async function verify(e: FormEvent) {
    e.preventDefault(); setErr(null); setBusy(true);
    const { error } = await supabase.auth.verifyOtp({ email, token: code.replace(/\D/g, ''), type: 'signup' });
    setBusy(false);
    if (error) { setErr(t('a.err.code')); return; }
    navigate('/admin');
  }

  return (
    <AuthShell>
      <Title text={t('a.login.title')} />
      {needsCode ? (
        <form onSubmit={verify} className="mt-8 space-y-4">
          <p className="text-sm text-muted">{t('a.verify.sub')} <strong className="text-ink">{email}</strong></p>
          <Field label={t('a.code')} inputMode="numeric" maxLength={8} autoComplete="one-time-code" value={code}
            onChange={e => setCode(e.target.value)} required autoFocus className="tracking-[0.4em]" />
          <ErrorMsg msg={err} />
          <Button type="submit" loading={busy}>{busy ? t('a.working') : t('a.verify.cta')}</Button>
        </form>
      ) : (
        <>
        <div className="mt-8"><GoogleButton label={t('a.google')} /></div>
        <OrDivider label={t('a.or')} />
        <form onSubmit={submit} className="space-y-4">
          <Field label={t('a.email')} type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" autoFocus />
          <Field label={t('a.password')} type="password" value={password} onChange={e => setPassword(e.target.value)} required autoComplete="current-password" />
          <ErrorMsg msg={err} />
          <Button type="submit" loading={busy}>{busy ? t('a.working') : t('a.login.cta')}</Button>
          <a href="/recover" className="block text-center text-xs text-muted hover:text-ink">{t('a.forgot')}</a>
        </form>
        </>
      )}
      <p className="mt-6 text-center text-xs text-muted">{t('a.noAccount')} <a href="/signup" className="text-ink underline">{t('a.signup.cta')}</a></p>
    </AuthShell>
  );
}
