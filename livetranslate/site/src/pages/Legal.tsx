/**
 * Páginas legais /privacy e /terms — exigidas pelo Google OAuth (a publicação do app
 * pede a URL da política de privacidade) e pendência antiga do produto.
 * 22/09: nos 3 idiomas do site (texto em i18n/legal.ts) e com seletor próprio — quem
 * chega aqui por um link não passa pela barra da landing. O Johnny ainda revisa os
 * dados legais.
 */
import { LANGS, useLang } from '../i18n';
import { LEGAL, type Doc } from '../i18n/legal';

const ATUALIZADO = '2026-09-22';
const CONTATO = 'johnny.oliveira@jcsolutionsus.com';

function Shell({ doc }: { doc: 'privacidade' | 'termos' }) {
  const { lang, setLang, t } = useLang();
  const L = LEGAL[lang];
  const d: Doc = L[doc];
  const data = new Date(`${ATUALIZADO}T12:00:00`).toLocaleDateString(lang === 'pt' ? 'pt-BR' : lang, { dateStyle: 'long' });
  return (
    <div className="relative z-10 mx-auto max-w-3xl px-6 py-16">
      <div className="flex items-center justify-between gap-4">
        <a href="/" aria-label="LiveTranslate"><img src="/assets/lockup-horizontal-color.svg" alt="LiveTranslate" className="h-8 w-auto" /></a>
        <div className="flex gap-1 rounded-full border border-black/10 p-1 text-xs" role="group" aria-label={t('a11y.language')}>
          {LANGS.map(l => (
            <button key={l} onClick={() => setLang(l)} aria-pressed={l === lang}
              className={`rounded-full px-3 py-1 uppercase ${l === lang ? 'bg-ink text-white' : 'text-muted hover:text-ink'}`}>
              {l}
            </button>
          ))}
        </div>
      </div>
      <h1 className="display mt-10 text-4xl sm:text-5xl">{d.titulo}</h1>
      <p className="mt-2 text-sm text-muted">{L.atualizado} {data}</p>
      <div className="prose-legal mt-8 space-y-6 text-[15px] leading-relaxed text-ink/90">
        {d.blocos.map((b, i) => (
          <div key={i} className="space-y-6">
            {b.h && <h2 className="pt-2 font-serif text-2xl">{b.h}</h2>}
            <p>{b.b && <b>{b.b} </b>}{b.p}</p>
          </div>
        ))}
      </div>
      <p className="mt-12 text-sm text-muted">{L.duvidas} <a className="underline" href={`mailto:${CONTATO}`}>{CONTATO}</a>.</p>
    </div>
  );
}

export function Privacy() { return <Shell doc="privacidade" />; }
export function Terms() { return <Shell doc="termos" />; }
