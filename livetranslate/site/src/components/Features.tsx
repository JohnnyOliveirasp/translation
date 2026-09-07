import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { ArrowRight, Check, Music, FileText, CalendarDays, type LucideIcon } from 'lucide-react';
import { useLang } from '../i18n';
import { WordsPullUp } from './TextEffects';

const EASE = [0.22, 1, 0.36, 1] as const;

function Card({ index, children, className = '' }: { index: number; children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-100px' });
  return (
    <motion.div
      ref={ref}
      className={`relative overflow-hidden rounded-2xl ${className}`}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={inView ? { opacity: 1, scale: 1 } : {}}
      transition={{ delay: index * 0.15, duration: 0.7, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

function FeatureCard({ index, num, icon: Icon, title, items, more }:
  { index: number; num: string; icon: LucideIcon; title: string; items: string[]; more: string }) {
  return (
    <Card index={index} className="surface-solid flex h-full flex-col border border-black/[0.06] p-6 sm:p-7">
      <div className="mb-8 flex h-10 w-10 items-center justify-center rounded-xl bg-black/[0.05] sm:h-12 sm:w-12">
        <Icon className="h-5 w-5 text-ink" strokeWidth={1.75} />
      </div>
      <div className="mb-auto flex items-start justify-between gap-4">
        <h3 className="font-serif text-2xl leading-tight sm:text-[1.7rem]">{title}</h3>
        <span className="mt-1 text-xs text-muted">{num}</span>
      </div>
      <ul className="mt-10 space-y-3">
        {items.map(it => (
          <li key={it} className="flex gap-3 text-sm leading-snug text-muted">
            <Check className="mt-[2px] h-4 w-4 shrink-0 text-ink" strokeWidth={2.2} />
            <span>{it}</span>
          </li>
        ))}
      </ul>
      <a href="#pricing" className="mt-8 inline-flex items-center gap-2 text-sm text-ink transition-opacity hover:opacity-70">
        {more} <ArrowRight className="h-4 w-4 -rotate-45" strokeWidth={2} />
      </a>
    </Card>
  );
}

export default function Features() {
  const { t } = useLang();
  return (
    <section id="features" className="relative z-10 px-4 py-24 md:px-6 md:py-32">
      <div className="mx-auto max-w-7xl">
        <div className="surface rounded-[2rem] p-4 shadow-[0_40px_120px_-60px_rgba(0,0,0,0.25)] sm:p-6 md:p-8">
          <div className="mb-10 max-w-3xl px-2 pt-4">
            <WordsPullUp text={t('feat.h1')} className="text-xl font-normal leading-tight text-ink sm:text-2xl md:text-3xl lg:text-4xl" />
            <WordsPullUp text={t('feat.h2')} className="text-xl font-normal leading-tight text-muted sm:text-2xl md:text-3xl lg:text-4xl" as="p" />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:gap-2 md:grid-cols-2 md:gap-1 lg:h-[480px] lg:grid-cols-4">
            <Card index={0} className="min-h-[320px] bg-black/5">
              <video src="/assets/hero.mp4" autoPlay loop muted playsInline className="absolute inset-0 h-full w-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
              <p className="absolute bottom-6 left-6 font-serif text-2xl text-white">{t('feat.video')}</p>
            </Card>
            <FeatureCard index={1} num="01" icon={Music} title={t('feat.1.t')} more={t('feat.more')}
              items={[t('feat.1.a'), t('feat.1.b'), t('feat.1.c'), t('feat.1.d')]} />
            <FeatureCard index={2} num="02" icon={FileText} title={t('feat.2.t')} more={t('feat.more')}
              items={[t('feat.2.a'), t('feat.2.b'), t('feat.2.c')]} />
            <FeatureCard index={3} num="03" icon={CalendarDays} title={t('feat.3.t')} more={t('feat.more')}
              items={[t('feat.3.a'), t('feat.3.b'), t('feat.3.c')]} />
          </div>
        </div>
      </div>
    </section>
  );
}
