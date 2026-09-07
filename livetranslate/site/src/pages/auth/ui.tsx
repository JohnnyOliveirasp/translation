import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';
import { segments } from '../../i18n';
import { supabase } from '../../lib/supabase';

export function AuthShell({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className="relative z-10 flex min-h-screen flex-col">
      <header className="mx-auto w-full max-w-7xl px-8 py-6">
        <a href="/" aria-label="LiveTranslate"><img src="/assets/lockup-horizontal-color.svg" alt="LiveTranslate" className="h-8 w-auto" /></a>
      </header>
      <main className="flex flex-1 items-center justify-center px-4 pb-20">
        <div className={`surface w-full rounded-[2rem] p-8 shadow-[0_40px_120px_-60px_rgba(0,0,0,0.3)] sm:p-10 ${wide ? 'max-w-5xl' : 'max-w-md'}`}>
          {children}
        </div>
      </main>
    </div>
  );
}

export function Title({ text, className = '' }: { text: string; className?: string }) {
  return (
    <h1 className={`display text-4xl sm:text-5xl ${className}`}>
      {segments(text).map((s, i) => (s.em ? <em key={i}>{s.text}</em> : <span key={i}>{s.text}</span>))}
    </h1>
  );
}

const base = 'w-full rounded-xl border border-black/10 bg-white px-4 py-3 text-sm text-ink placeholder:text-muted/70 outline-none transition-colors focus:border-ink';

export function Field({ label, hint, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted">{label}</span>
      <input className={base} {...props} />
      {hint && <span className="mt-1 block text-[11px] text-muted/80">{hint}</span>}
    </label>
  );
}

export function Select({ label, children, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted">{label}</span>
      <select className={base} {...props}>{children}</select>
    </label>
  );
}

export function Button({ children, loading, secondary = false, ...props }:
  React.ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean; secondary?: boolean }) {
  return (
    <button
      {...props}
      disabled={loading || props.disabled}
      className={`w-full rounded-full px-6 py-3.5 text-sm font-medium transition-transform duration-300 hover:scale-[1.02] disabled:opacity-60 disabled:hover:scale-100 ${secondary ? 'border border-ink bg-transparent text-ink' : 'bg-ink text-white'} ${props.className ?? ''}`}
    >
      {children}
    </button>
  );
}

/** Divisor "ou" entre o login social e o formulário de e-mail/senha. */
export function OrDivider({ label }: { label: string }) {
  return (
    <div className="my-5 flex items-center gap-3 text-[11px] uppercase tracking-[0.2em] text-muted/70">
      <span className="h-px flex-1 bg-black/10" />{label}<span className="h-px flex-1 bg-black/10" />
    </div>
  );
}

/** "Continue with Google" — OAuth do Supabase; volta em /admin com a sessão criada.
 *  `onBefore` roda antes do redirect (ex.: guardar a igreja pendente do signup). */
export function GoogleButton({ label, onBefore }: { label: string; onBefore?: () => void }) {
  async function go() {
    onBefore?.();
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/admin` },
    });
  }
  return (
    <button type="button" onClick={go}
      className="flex w-full items-center justify-center gap-3 rounded-full border border-black/10 bg-white px-6 py-3.5 text-sm font-medium text-ink transition-transform duration-300 hover:scale-[1.02]">
      <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
      </svg>
      {label}
    </button>
  );
}

export function ErrorMsg({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{msg}</p>;
}

export function Note({ children }: { children: ReactNode }) {
  return <p className="rounded-xl bg-black/[0.04] px-4 py-3 text-sm text-ink">{children}</p>;
}

/** "Grace Church of Tampa" → "grace-church-of-tampa" */
export function slugify(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
}
