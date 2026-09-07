import { Check } from 'lucide-react';
import { useLang } from '../i18n';
import { WordsPullUpMultiStyle, Rise } from './TextEffects';

type Plan = { name: string; price: string; per?: string; tag?: string; featured?: boolean; items: string[]; cta: string; href: string };

export default function Pricing() {
  const { t } = useLang();
  const plans: Plan[] = [
    { name: t('pr.starter'), price: '$79.90', per: t('pr.mo'), cta: t('pr.cta'), href: '/signup?plan=starter',
      items: [t('pr.l2'), t('pr.f.listeners'), t('pr.f.sundays'), t('pr.f.ws'), t('pr.f.pdf'), t('pr.f.support')] },
    { name: t('pr.growth'), price: '$139', per: t('pr.mo'), tag: t('pr.tag'), featured: true, cta: t('pr.cta'), href: '/signup?plan=growth',
      items: [t('pr.l5'), t('pr.f.listeners'), t('pr.f.sundays'), t('pr.f.ws'), t('pr.f.pdf'), t('pr.f.priority')] },
    { name: t('pr.cong'), price: t('pr.talk'), cta: t('pr.cta3'), href: 'mailto:hello@livetranslate.church',
      items: [t('pr.l6'), t('pr.f.campus'), t('pr.f.brand'), t('pr.f.listeners')] },
  ];

  return (
    <section id="pricing" className="relative z-10 px-4 py-24 md:px-6 md:py-32">
      <div className="surface mx-auto max-w-6xl rounded-[2rem] px-6 py-16 text-center shadow-[0_40px_120px_-60px_rgba(0,0,0,0.25)] md:px-14 md:py-24">
        <p className="mb-6 text-[10px] uppercase tracking-[0.2em] text-muted sm:text-xs">{t('pr.label')}</p>
        <WordsPullUpMultiStyle text={t('pr.title')} className="display text-4xl sm:text-5xl md:text-6xl" emClassName="italic text-muted" />
        <p className="mx-auto mt-6 max-w-xl text-sm leading-relaxed text-muted sm:text-base">{t('pr.sub')}</p>

        <div className="mt-14 grid gap-4 md:grid-cols-3">
          {plans.map((p, i) => (
            <Rise key={p.name} delay={i * 0.12} className="h-full">
              <div className={`relative flex h-full flex-col rounded-3xl border p-8 text-left transition-transform duration-500 hover:-translate-y-1.5 ${p.featured ? 'border-ink bg-ink text-white' : 'surface-solid border-black/[0.08]'}`}>
                {p.tag && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gold px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-black">{p.tag}</span>
                )}
                <h3 className="font-serif text-2xl">{p.name}</h3>
                <div className="mt-3 font-serif text-5xl leading-none tracking-tight">
                  {p.price}{p.per && <span className={`ml-1 font-sans text-sm ${p.featured ? 'text-white/60' : 'text-muted'}`}>{p.per}</span>}
                </div>
                <ul className="mt-8 flex-1 space-y-3">
                  {p.items.map(it => (
                    <li key={it} className={`flex gap-3 text-sm ${p.featured ? 'text-white/85' : 'text-muted'}`}>
                      <Check className={`mt-[2px] h-4 w-4 shrink-0 ${p.featured ? 'text-gold' : 'text-ink'}`} strokeWidth={2.2} />
                      <span>{it}</span>
                    </li>
                  ))}
                </ul>
                <a
                  href={p.href}
                  className={`mt-8 rounded-full px-6 py-3.5 text-center text-sm transition-transform duration-300 hover:scale-[1.03] ${p.featured ? 'bg-white text-ink' : 'bg-ink text-white'}`}
                >
                  {p.cta}
                </a>
              </div>
            </Rise>
          ))}
        </div>
        <p className="mt-8 text-xs text-muted">{t('pr.fair')}</p>
      </div>
    </section>
  );
}
