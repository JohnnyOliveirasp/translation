import { useState, type FormEvent } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { useLang } from '../../i18n';
import { useRouter } from '../../router';
import { AuthShell, Title, Field, Button, ErrorMsg } from './ui';

// /invite/:token — operador convidado cria a senha (ou, se já logado, aceita direto)
export default function Invite({ token }: { token: string }) {
  const { t } = useLang();
  const { navigate } = useRouter();
  const { user, refresh } = useAuth();
  const [step, setStep] = useState<'form' | 'verify'>('form');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function accept() {
    const { error } = await supabase.rpc('accept_invite', { p_token: token });
    if (error) { setErr(t('a.err.invite')); return; }
    await refresh();
    navigate('/admin');
  }

  async function submit(e: FormEvent) {
    e.preventDefault(); setErr(null);
    if (password.length < 8) { setErr(t('a.err.weak')); return; }
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName } } });
    if (error) { setBusy(false); setErr(error.message); return; }
    if (data.session) { await accept(); setBusy(false); return; }
    setBusy(false); setStep('verify');
  }

  async function verify(e: FormEvent) {
    e.preventDefault(); setErr(null); setBusy(true);
    const { error } = await supabase.auth.verifyOtp({ email, token: code.replace(/\D/g, ''), type: 'signup' });
    if (error) { setBusy(false); setErr(t('a.err.code')); return; }
    await accept(); setBusy(false);
  }

  if (user) {
    return (
      <AuthShell>
        <Title text={t('a.invite.title')} />
        <p className="mt-3 text-sm text-muted">{user.email}</p>
        <ErrorMsg msg={err} />
        <Button className="mt-8" onClick={() => { setBusy(true); accept().finally(() => setBusy(false)); }} loading={busy}>
          {busy ? t('a.working') : t('a.invite.accept')}
        </Button>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <Title text={t('a.invite.title')} />
      <p className="mt-3 text-sm text-muted">{t('a.invite.sub')}</p>
      {step === 'verify' ? (
        <form onSubmit={verify} className="mt-8 space-y-4">
          <p className="text-sm text-muted">{t('a.verify.sub')} <strong className="text-ink">{email}</strong></p>
          <Field label={t('a.code')} inputMode="numeric" maxLength={8} autoComplete="one-time-code" value={code}
            onChange={e => setCode(e.target.value)} required autoFocus className="tracking-[0.4em]" />
          <ErrorMsg msg={err} />
          <Button type="submit" loading={busy}>{busy ? t('a.working') : t('a.verify.cta')}</Button>
        </form>
      ) : (
        <form onSubmit={submit} className="mt-8 space-y-4">
          <Field label={t('a.fullName')} value={fullName} onChange={e => setFullName(e.target.value)} required autoComplete="name" />
          <Field label={t('a.email')} type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" />
          <Field label={t('a.password')} type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} autoComplete="new-password" />
          <ErrorMsg msg={err} />
          <Button type="submit" loading={busy}>{busy ? t('a.working') : t('a.invite.cta')}</Button>
          <p className="text-center text-xs text-muted">{t('a.haveAccount')} <a href="/login" className="text-ink underline">{t('a.login.cta')}</a></p>
        </form>
      )}
    </AuthShell>
  );
}
