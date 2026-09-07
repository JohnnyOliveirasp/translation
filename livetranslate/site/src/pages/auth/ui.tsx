import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';
import { segments } from '../../i18n';

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
