import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Plus } from 'lucide-react';
import { useLang } from '../i18n';
import { WordsPullUpMultiStyle } from './TextEffects';

export default function FAQ() {
  const { t } = useLang();
  const [open, setOpen] = useState<number | null>(0);
  const qs = [1, 2, 3, 4, 5].map(n => ({ q: t(`faq.q${n}`), a: t(`faq.a${n}`) }));

  return (
    <section id="faq" className="relative z-10 px-4 py-24 md:px-6 md:py-32">
      <div className="surface mx-auto max-w-3xl rounded-[2rem] px-6 py-16 shadow-[0_40px_120px_-60px_rgba(0,0,0,0.25)] md:px-14 md:py-24">
        <p className="mb-6 text-center text-[10px] uppercase tracking-[0.2em] text-muted sm:text-xs">{t('faq.label')}</p>
        <WordsPullUpMultiStyle text={t('faq.title')} className="display w-full text-4xl sm:text-5xl md:text-6xl" emClassName="italic text-muted" />
        <div className="mt-12 border-t border-black/[0.08]">
          {qs.map((it, i) => {
            const isOpen = open === i;
            return (
              <div key={i} className="border-b border-black/[0.08]">
                <button
                  onClick={() => setOpen(isOpen ? null : i)}
                  className="flex w-full items-start justify-between gap-6 py-6 text-left"
                  aria-expanded={isOpen}
                >
                  <span className="font-serif text-xl leading-snug sm:text-2xl">{it.q}</span>
                  <motion.span animate={{ rotate: isOpen ? 45 : 0 }} transition={{ duration: 0.3 }} className="mt-1 shrink-0 text-muted">
                    <Plus className="h-5 w-5" strokeWidth={1.75} />
                  </motion.span>
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      key="a"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                      className="overflow-hidden"
                    >
                      <p className="max-w-2xl pb-7 pr-10 text-sm leading-relaxed text-muted sm:text-base">{it.a}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
