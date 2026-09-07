import { useState, type FormEvent } from 'react';
import { supabase } from '../../lib/supabase';
import { useLang } from '../../i18n';
import { useRouter } from '../../router';
import { AuthShell, Title, Field, Button, ErrorMsg, Note } from './ui';

// Recuperação por CÓDIGO (decisão do Johnny): e-mail → código do Supabase (6 a 8 dígitos) → nova senha.
export default function Recover() {
  const { t } = useLang();
  const { navigate } = useRouter();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function sendCode(e: FormEvent) {
    e.preventDefault(); setErr(null); setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setStep('code');
  }

  async function setNew(e: FormEvent) {
    e.preventDefault(); setErr(null);
    if (password.length < 8) { setErr(t('a.err.weak')); return; }
    setBusy(true);
    const v = await supabase.auth.verifyOtp({ email, token: code.replace(/\D/g, ''), type: 'recovery' });
    if (v.error) { setBusy(false); setErr(t('a.err.code')); return; }
    const u = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (u.error) { setErr(u.error.message); return; }
    navigate('/admin');
  }

  return (
    <AuthShell>
      <Title text={t('a.recover.title')} />
      {step === 'email' ? (
        <form onSubmit={sendCode} className="mt-8 space-y-4">
          <p className="text-sm text-muted">{t('a.recover.sub')}</p>
          <Field label={t('a.email')} type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" autoFocus />
          <ErrorMsg msg={err} />
          <Button type="submit" loading={busy}>{busy ? t('a.working') : t('a.recover.cta')}</Button>
          <a href="/login" className="block text-center text-xs text-muted hover:text-ink">{t('a.back')}</a>
        </form>
      ) : (
        <form onSubmit={setNew} className="mt-8 space-y-4">
          <Note>{t('a.verify.sub')} <strong>{email}</strong></Note>
          <Field label={t('a.code')} inputMode="numeric" maxLength={8} autoComplete="one-time-code" value={code}
            onChange={e => setCode(e.target.value)} required autoFocus className="tracking-[0.4em]" />
          <Field label={t('a.newPassword')} type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} autoComplete="new-password" />
          <ErrorMsg msg={err} />
          <Button type="submit" loading={busy}>{busy ? t('a.working') : t('a.recover.set')}</Button>
        </form>
      )}
    </AuthShell>
  );
}
