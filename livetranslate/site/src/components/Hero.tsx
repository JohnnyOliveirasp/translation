import { useLang, segments } from '../i18n';

export default function Hero() {
  const { t } = useLang();
  return (
    <section
      id="top"
      className="relative z-10 flex min-h-screen w-full flex-col items-center justify-center px-6 pb-40 text-center"
      style={{ paddingTop: 'calc(8rem - 75px)' }}
    >
      <h1 className="display animate-fade-rise max-w-7xl text-5xl font-normal sm:text-7xl md:text-8xl">
        {segments(t('hero.title')).map((s, i) =>
          s.em ? <em key={i}>{s.text}</em> : <span key={i}>{s.text}</span>,
        )}
      </h1>

      <p className="animate-fade-rise-delay mt-8 max-w-2xl text-base leading-relaxed text-muted sm:text-lg">
        {t('hero.desc')}
      </p>

      <a
        href="#pricing"
        className="animate-fade-rise-delay-2 mt-12 rounded-full bg-ink px-14 py-5 text-base text-white transition-transform duration-300 hover:scale-[1.03]"
      >
        {t('hero.cta')}
      </a>

      <p className="animate-fade-rise-delay-2 mt-10 text-[11px] uppercase tracking-[0.18em] text-muted">
        {t('hero.trust')}
      </p>
    </section>
  );
}
