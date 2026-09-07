import { useLang } from '../i18n';
import { WordsPullUpMultiStyle, ScrollRevealParagraph } from './TextEffects';

/** Card "About" do Prisma, na paleta clara: frase mista (Inter + Instrument Serif itálico) e parágrafo revelado no scroll. */
export default function About() {
  const { t } = useLang();
  return (
    <section id="about" className="relative z-10 px-4 py-24 md:px-6 md:py-32">
      <div className="surface mx-auto max-w-6xl rounded-[2rem] px-6 py-20 text-center shadow-[0_40px_120px_-60px_rgba(0,0,0,0.25)] md:px-16 md:py-28">
        <p className="mb-8 text-[10px] uppercase tracking-[0.2em] text-muted sm:text-xs">{t('about.label')}</p>
        <WordsPullUpMultiStyle
          text={t('about.title')}
          className="mx-auto max-w-4xl text-3xl leading-[0.95] tracking-[-0.02em] sm:text-4xl sm:leading-[0.9] md:text-5xl lg:text-6xl"
          emClassName="font-serif italic text-muted"
        />
        <ScrollRevealParagraph
          text={t('about.body')}
          className="mx-auto mt-14 max-w-2xl text-sm leading-relaxed text-ink sm:text-base md:text-lg"
        />
        <p className="mt-12 text-[11px] uppercase tracking-[0.18em] text-muted">{t('about.for')}</p>
      </div>
    </section>
  );
}
