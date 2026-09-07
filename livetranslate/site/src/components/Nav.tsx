import { useEffect, useState } from 'react';
import { LayoutDashboard, LogIn, Menu, X } from 'lucide-react';
import { LANGS, useLang } from '../i18n';
import { useAuth } from '../lib/auth';

const ITEMS: { key: string; href: string }[] = [
  { key: 'nav.home', href: '/#top' },
  { key: 'nav.how', href: '/#how' },
  { key: 'nav.worship', href: '/#features' },
  { key: 'nav.pricing', href: '/#pricing' },
  { key: 'nav.faq', href: '/#faq' },
];

export default function Nav() {
  const { t, lang, setLang } = useLang();
  const { user } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 24);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);

  // Já logado: o botão leva direto ao painel.
  const memberHref = user ? '/admin' : '/login';
  const memberLabel = user ? t('ad.title') : t('nav.login');
  const MemberIcon = user ? LayoutDashboard : LogIn;

  return (
    <header className={`fixed inset-x-0 top-0 z-30 transition-all duration-500 ${scrolled || open ? 'surface shadow-[0_1px_0_rgba(0,0,0,0.06)]' : ''}`}>
      <div className={`mx-auto flex max-w-7xl items-center justify-between px-5 transition-all duration-500 sm:px-8 ${scrolled ? 'py-3' : 'py-6'}`}>
        <a href="#top" aria-label="LiveTranslate" className="shrink-0">
          <img src="/assets/lockup-horizontal-color.svg" alt="LiveTranslate" className="h-7 w-auto sm:h-8" />
        </a>

        <nav className="hidden items-center gap-8 md:flex" aria-label="Main">
          {ITEMS.map((it, i) => (
            <a
              key={it.key}
              href={it.href}
              className="text-sm transition-colors hover:text-ink"
              style={{ color: i === 0 ? '#000000' : '#6F6F6F' }}
            >
              {t(it.key)}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          <div className="hidden rounded-full border border-black/10 p-[2px] sm:flex" role="group" aria-label="Language">
            {LANGS.map(l => (
              <button
                key={l}
                onClick={() => setLang(l)}
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-wider transition-colors ${lang === l ? 'bg-ink text-white' : 'text-muted hover:text-ink'}`}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>

          {/* Já é membro: botão de contorno, visível também no celular */}
          <a
            href={memberHref}
            className="inline-flex items-center gap-2 rounded-full border border-ink/25 px-4 py-2 text-sm text-ink transition-colors hover:border-ink hover:bg-black/[0.04] sm:px-5 sm:py-2.5"
          >
            <MemberIcon className="h-4 w-4" />
            <span>{memberLabel}</span>
          </a>

          <a
            href="/signup"
            className="hidden rounded-full bg-ink px-6 py-2.5 text-sm text-white transition-transform duration-300 hover:scale-[1.03] sm:inline-block"
          >
            {t('nav.cta')}
          </a>

          <button
            onClick={() => setOpen(o => !o)}
            aria-label="Menu"
            aria-expanded={open}
            className="rounded-full border border-black/10 p-2 md:hidden"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Menu do celular */}
      {open && (
        <div className="border-t border-black/[0.06] bg-white px-5 pb-6 pt-2 shadow-[0_20px_40px_-20px_rgba(0,0,0,0.25)] md:hidden">
          <nav className="flex flex-col" aria-label="Mobile">
            {ITEMS.map(it => (
              <a key={it.key} href={it.href} onClick={() => setOpen(false)} className="border-b border-black/[0.04] py-3 text-sm text-ink">
                {t(it.key)}
              </a>
            ))}
          </nav>
          <div className="mt-5 flex items-center justify-between gap-3">
            <div className="flex rounded-full border border-black/10 p-[2px]" role="group" aria-label="Language">
              {LANGS.map(l => (
                <button
                  key={l}
                  onClick={() => setLang(l)}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-wider transition-colors ${lang === l ? 'bg-ink text-white' : 'text-muted hover:text-ink'}`}
                >
                  {l.toUpperCase()}
                </button>
              ))}
            </div>
            <a href="/signup" onClick={() => setOpen(false)} className="rounded-full bg-ink px-5 py-2.5 text-sm text-white">
              {t('nav.cta')}
            </a>
          </div>
        </div>
      )}
    </header>
  );
}
