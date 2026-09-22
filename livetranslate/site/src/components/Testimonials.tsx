import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Star } from 'lucide-react';
import { useLang } from '../i18n';
import { TESTIMONIALS, txt } from '../content/testimonials';
import { WordsPullUpMultiStyle, Rise } from './TextEffects';

const AUTOPLAY_MS = 6500;

/** Carrossel de depoimentos: um card por vez, estrelas, avatar, nome/cargo/igreja, setas, bolinhas e autoplay. */
export default function Testimonials() {
  const { t, lang } = useLang();
  const [i, setI] = useState(0);
  const [dir, setDir] = useState(1);
  const n = TESTIMONIALS.length;
  const go = (d: number) => { setDir(d); setI((v) => (v + d + n) % n); };

  useEffect(() => {
    const id = setInterval(() => go(1), AUTOPLAY_MS);
    return () => clearInterval(id);
  }, [i]); // reinicia o timer após interação manual

  const it = TESTIMONIALS[i];
  const dotLabel = (k: number) => 'Go to ' + (k + 1);
  return (
    <section id="testimonials" className="relative z-10 px-4 py-24 md:px-6 md:py-32">
      <div className="mx-auto max-w-4xl">
        <div className="mb-12 text-center">
          <p className="mb-6 text-[10px] uppercase tracking-[0.2em] text-muted sm:text-xs">{t('tst.label')}</p>
          <WordsPullUpMultiStyle text={t('tst.title')} className="display text-4xl sm:text-5xl md:text-6xl" emClassName="italic text-muted" />
          <p className="mt-5 text-sm text-muted sm:text-base">{t('tst.sub')}</p>
        </div>

        <Rise>
          <div className="relative">
            <button onClick={() => go(-1)} aria-label={t('a11y.prev')} className="absolute left-0 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 rounded-full border border-black/10 bg-white p-2 shadow-sm transition hover:bg-black hover:text-white md:-translate-x-full">
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button onClick={() => go(1)} aria-label={t('a11y.next')} className="absolute right-0 top-1/2 z-10 -translate-y-1/2 translate-x-1/2 rounded-full border border-black/10 bg-white p-2 shadow-sm transition hover:bg-black hover:text-white md:translate-x-full">
              <ChevronRight className="h-5 w-5" />
            </button>

            <div className="surface relative overflow-hidden rounded-3xl shadow-[0_40px_120px_-60px_rgba(0,0,0,0.25)]">
              <AnimatePresence initial={false} custom={dir} mode="wait">
                <motion.figure
                  key={i}
                  custom={dir}
                  initial={{ opacity: 0, x: dir * 40 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -dir * 40 }}
                  transition={{ duration: 0.35, ease: 'easeOut' }}
                  className="flex flex-col items-center gap-6 p-8 text-center md:flex-row md:items-start md:gap-10 md:p-12 md:text-left"
                >
                  {it.sample && (
                    <span className="absolute right-4 top-4 rounded-full border border-dashed border-black/20 px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted">
                      {t('tst.sample')}
                    </span>
                  )}
                  {it.photo ? (
                    <img src={it.photo} alt="" className="h-24 w-24 shrink-0 rounded-full object-cover ring-4 ring-white md:h-28 md:w-28" />
                  ) : (
                    <span className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full bg-black/[0.06] font-serif text-4xl text-ink md:h-28 md:w-28">
                      {it.name.charAt(0)}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="mb-4 flex justify-center gap-1 md:justify-start" aria-label={t('a11y.stars')}>
                      {Array.from({ length: 5 }).map((_, k) => <Star key={k} className="h-4 w-4 fill-amber-400 text-amber-400" />)}
                    </div>
                    <blockquote className="font-serif text-xl leading-snug text-ink sm:text-2xl md:text-[1.7rem]">“{txt(it.quote, lang)}”</blockquote>
                    <figcaption className="mt-6 flex flex-col items-center gap-2 md:flex-row md:items-center md:gap-3">
                      <div className="text-sm">
                        <div className="font-medium text-ink">{it.name}</div>
                        <div className="text-muted">{txt(it.role, lang)} · {it.org}</div>
                      </div>
                      {it.badge && (
                        <span className="rounded-full bg-black/[0.06] px-3 py-1 text-xs text-ink md:ml-auto">{txt(it.badge, lang)}</span>
                      )}
                    </figcaption>
                  </div>
                </motion.figure>
              </AnimatePresence>
            </div>

            <div className="mt-6 flex justify-center gap-2">
              {TESTIMONIALS.map((_, k) => (
                <button key={k} onClick={() => { setDir(k > i ? 1 : -1); setI(k); }} aria-label={dotLabel(k)}
                  className={'h-2 rounded-full transition-all ' + (k === i ? 'w-6 bg-black' : 'w-2 bg-black/20 hover:bg-black/40')} />
              ))}
            </div>
            {/* página só com vídeos reais (22/09) */}
            <div className="mt-8 text-center">
              <a href="/testimonials" className="inline-flex items-center gap-2 rounded-full border border-ink px-6 py-3 text-sm text-ink transition-colors hover:bg-ink hover:text-white">
                {t('tst.all')} →
              </a>
            </div>
          </div>
        </Rise>
      </div>
    </section>
  );
}
