import { useState, type ReactNode } from 'react';
import { Menu, X, LogOut, ExternalLink } from 'lucide-react';
import { type Church } from '../../lib/supabase';
import ChurchLogo from '../../components/ChurchLogo';

/**
 * Casca do PAINEL (área logada) — separada da landing: fundo próprio, sem vídeo,
 * menu lateral fixo no desktop e gaveta no celular.
 */
export type NavItem = { id: string; label: string; icon: React.ComponentType<{ className?: string }> };

export default function Shell({
  church, items, active, onSelect, user, onSignOut, children,
}: {
  church: Church;
  items: NavItem[];
  active: string;
  onSelect: (id: string) => void;
  user: string;
  onSignOut: () => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  const nav = (
    <nav className="flex flex-1 flex-col gap-1">
      {items.map(it => {
        const Icon = it.icon;
        const on = it.id === active;
        return (
          <button
            key={it.id}
            onClick={() => { onSelect(it.id); setOpen(false); }}
            className={'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ' +
              (on ? 'bg-ink text-white' : 'text-muted hover:bg-black/[0.04] hover:text-ink')}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="truncate">{it.label}</span>
          </button>
        );
      })}
    </nav>
  );

  const aside = (
    <div className="flex h-full flex-col gap-6 px-4 py-6">
      <a href="/" aria-label="LiveTranslate" className="px-2">
        <img src="/assets/lockup-horizontal-color.svg" alt="LiveTranslate" className="h-7 w-auto" />
      </a>

      <div className="flex items-center gap-3 rounded-2xl bg-black/[0.03] px-3 py-3">
        <ChurchLogo path={church.logo_path} light={church.logo_is_light} name={church.name}
          className="h-9 shrink-0 overflow-hidden rounded-lg" imgClassName="h-full max-w-[5rem]"
          fallbackClassName="h-9 w-9 shrink-0 rounded-lg bg-white text-lg" />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink">{church.name}</p>
          <a href={`/${church.slug}`} target="_blank" rel="noopener" className="flex items-center gap-1 truncate text-[11px] text-muted hover:text-ink">
            /{church.slug} <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>

      {nav}

      <div className="border-t border-black/[0.06] pt-4">
        <p className="truncate px-3 text-[11px] text-muted">{user}</p>
        <button onClick={onSignOut} className="mt-2 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-muted transition-colors hover:bg-black/[0.04] hover:text-ink">
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      </div>
    </div>
  );

  return (
    <div className="relative z-10 min-h-screen">
      {/* Topo (celular) */}
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-black/[0.06] bg-white/90 px-4 py-3 backdrop-blur md:hidden">
        <img src="/assets/lockup-horizontal-color.svg" alt="LiveTranslate" className="h-6 w-auto" />
        <button onClick={() => setOpen(true)} aria-label="Menu" className="rounded-lg border border-black/10 p-2">
          <Menu className="h-5 w-5" />
        </button>
      </div>

      {/* Gaveta (celular) */}
      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-72 bg-white shadow-2xl">
            <button onClick={() => setOpen(false)} aria-label="Close" className="absolute right-3 top-3 rounded-lg p-2 text-muted hover:bg-black/[0.04]">
              <X className="h-5 w-5" />
            </button>
            {aside}
          </aside>
        </div>
      )}

      <div className="mx-auto flex w-full max-w-[1400px]">
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r border-black/[0.06] bg-white/85 backdrop-blur md:block">{aside}</aside>
        <main className="min-w-0 flex-1 px-4 py-8 md:px-10 md:py-10">{children}</main>
      </div>
    </div>
  );
}

/** Cabeçalho de página dentro do painel. */
export function PageHead({ title, sub, right }: { title: string; sub?: string; right?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-serif text-3xl leading-none text-ink">{title}</h1>
        {sub && <p className="mt-2 text-sm text-muted">{sub}</p>}
      </div>
      {right}
    </div>
  );
}
