import { useLang, segments } from '../i18n';
import { Rise } from './TextEffects';

export default function Footer() {
  const { t } = useLang();
  return (
    <>
      {/* CTA final — respiro sobre o vídeo, sem card */}
      <section className="relative z-10 px-6 py-32 text-center md:py-44">
        <Rise>
          <h2 className="display mx-auto max-w-5xl text-5xl sm:text-6xl md:text-8xl">
            {segments(t('final.title')).map((s, i) => (s.em ? <em key={i}>{s.text}</em> : <span key={i}>{s.text}</span>))}
          </h2>
          <a href="#pricing" className="mt-12 inline-block rounded-full bg-ink px-14 py-5 text-base text-white transition-transform duration-300 hover:scale-[1.03]">
            {t('final.cta')}
          </a>
          <p className="mt-5 text-xs text-muted">{t('final.note')}</p>
        </Rise>
      </section>

      <footer className="surface relative z-10 border-t border-black/[0.06]">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-6 px-8 py-10">
          <img src="/assets/lockup-horizontal-color.svg" alt="LiveTranslate" className="h-6 w-auto" />
          <p className="text-xs text-muted">{t('footer.tag')} · livetranslate.church</p>
          <div className="flex gap-6 text-xs text-muted">
            <a href="/login" className="hover:text-ink">{t('nav.login')}</a>
            <a href="mailto:hello@livetranslate.church" className="hover:text-ink">hello@livetranslate.church</a>
            <a href="#" className="hover:text-ink">{t('footer.privacy')}</a>
          </div>
        </div>
      </footer>
    </>
  );
}
