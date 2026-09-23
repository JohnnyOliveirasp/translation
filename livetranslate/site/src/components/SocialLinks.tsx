import type { ReactNode } from 'react';
import { useLang } from '../i18n';

// Redes do LiveTranslate (23/09). Ícones em SVG próprio: o lucide-react 1.x não traz marcas.
// Sem `href` = rede ainda não criada → aparece apagada, com "Em breve".
type Rede = { nome: string; href?: string; icone: ReactNode };

const fill = (d: string) => <path d={d} fill="currentColor" />;

const REDES: Rede[] = [
  {
    nome: 'Instagram', href: 'https://www.instagram.com/livetranslate.church',
    icone: (
      <g fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="2.5" y="2.5" width="19" height="19" rx="5.5" />
        <circle cx="12" cy="12" r="4.3" />
        <circle cx="17.6" cy="6.4" r="1" fill="currentColor" stroke="none" />
      </g>
    ),
  },
  {
    nome: 'Facebook', href: 'https://www.facebook.com/profile.php?id=61594539307466',
    icone: fill('M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.971H15.83c-1.491 0-1.956.93-1.956 1.886v2.267h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z'),
  },
  {
    nome: 'YouTube', href: 'https://www.youtube.com/@LiveTranslateChurch',
    icone: fill('M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z'),
  },
  {
    nome: 'LinkedIn',
    icone: fill('M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 1 1 0-4.125 2.062 2.062 0 0 1 0 4.125zM7.119 20.452H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z'),
  },
  {
    nome: 'X',
    icone: fill('M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z'),
  },
  {
    nome: 'TikTok',
    icone: fill('M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z'),
  },
];

const Svg = ({ children }: { children: ReactNode }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="h-[18px] w-[18px]">{children}</svg>
);

export default function SocialLinks() {
  const { t } = useLang();
  const ativas = REDES.filter(r => r.href);
  const embreve = REDES.filter(r => !r.href);
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
      <span className="text-xs text-muted">{t('footer.follow')}</span>
      <div className="flex items-center gap-2">
        {ativas.map(r => (
          <a key={r.nome} href={r.href} target="_blank" rel="noopener noreferrer" aria-label={r.nome} title={r.nome}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-black/[0.08] bg-white text-ink transition-colors hover:bg-ink hover:text-white">
            <Svg>{r.icone}</Svg>
          </a>
        ))}
      </div>
      {embreve.length > 0 && (
        <div className="flex items-center gap-2">
          {embreve.map(r => (
            <span key={r.nome} title={`${r.nome} · ${t('footer.soon')}`} aria-label={`${r.nome} · ${t('footer.soon')}`}
              className="flex h-9 w-9 cursor-default items-center justify-center rounded-full border border-dashed border-black/[0.12] text-muted opacity-50">
              <Svg>{r.icone}</Svg>
            </span>
          ))}
          <span className="rounded-full bg-black/[0.05] px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-muted">{t('footer.soon')}</span>
        </div>
      )}
    </div>
  );
}
