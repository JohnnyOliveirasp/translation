import { Play, Star, ExternalLink } from 'lucide-react';
import Nav from '../components/Nav';
import Footer from '../components/Footer';
import { useLang } from '../i18n';
import { txt } from '../content/testimonials';
import { VIDEO_TESTIMONIALS, GOOGLE_REVIEW_URL, type VideoTestimonial } from '../content/videoTestimonials';
import { WordsPullUpMultiStyle, Rise } from '../components/TextEffects';

/**
 * /testimonials — SÓ vídeos reais de igrejas que usam o LiveTranslate (pedido do Johnny, 22/09).
 * Vídeos em /assets/testimonials/<id>.mp4 (+ .jpg de capa) no servidor, ou YouTube por ID.
 * Botão "Avalie no Google" aparece quando GOOGLE_REVIEW_URL estiver preenchido.
 */
const FLAG: Record<VideoTestimonial['spoken'], string> = { en: '🇺🇸', es: '🇪🇸', pt: '🇧🇷' };

function VideoCard({ v }: { v: VideoTestimonial }) {
  const { lang } = useLang();
  const loc = lang === 'pt' ? 'pt-BR' : lang;
  return (
    <figure className="surface overflow-hidden rounded-3xl shadow-[0_40px_120px_-60px_rgba(0,0,0,0.25)]">
      <div className={`relative w-full bg-black ${v.portrait ? 'mx-auto aspect-[9/16] max-h-[640px]' : 'aspect-video'}`}>
        {v.youtube ? (
          <iframe
            className="absolute inset-0 h-full w-full"
            src={`https://www.youtube-nocookie.com/embed/${v.youtube}?rel=0&modestbranding=1`}
            title={v.name} loading="lazy" allow="accelerometer; encrypted-media; picture-in-picture" allowFullScreen />
        ) : (
          <video className="absolute inset-0 h-full w-full" controls preload="metadata" playsInline
            poster={`/assets/testimonials/${v.id}.jpg`} src={`/assets/testimonials/${v.id}.mp4`} />
        )}
      </div>
      <figcaption className="p-6 md:p-7">
        <div className="mb-3 flex items-center gap-1" aria-hidden>
          {Array.from({ length: 5 }).map((_, k) => <Star key={k} className="h-4 w-4 fill-amber-400 text-amber-400" />)}
        </div>
        {v.quote && <blockquote className="font-serif text-lg leading-snug text-ink md:text-xl">“{txt(v.quote, lang)}”</blockquote>}
        <div className={`${v.quote ? 'mt-4' : ''} flex flex-wrap items-center gap-x-3 gap-y-1 text-sm`}>
          <span className="font-medium text-ink">{v.name}</span>
          <span className="text-muted">{txt(v.role, lang)} · {v.org}</span>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full bg-black/[0.06] px-2.5 py-1">{FLAG[v.spoken]}</span>
          {(v.langs ?? []).map(l => <span key={l} className="rounded-full bg-black/[0.06] px-2.5 py-1 text-ink">{l}</span>)}
          {v.date && <span className="ml-auto text-muted">{new Date(`${v.date}T12:00:00`).toLocaleDateString(loc, { month: 'short', year: 'numeric' })}</span>}
        </div>
      </figcaption>
    </figure>
  );
}

export default function Testimonials() {
  const { t } = useLang();
  return (
    <>
      <Nav />
      <main className="relative z-10">
        <section className="px-4 pb-16 pt-32 md:px-6 md:pt-40">
          <div className="mx-auto max-w-6xl">
            <div className="mb-14 text-center">
              <p className="mb-6 text-[10px] uppercase tracking-[0.2em] text-muted sm:text-xs">{t('tv.label')}</p>
              <WordsPullUpMultiStyle text={t('tv.title')} className="display text-4xl sm:text-5xl md:text-6xl" emClassName="italic text-muted" />
              <p className="mx-auto mt-5 max-w-2xl text-sm text-muted sm:text-base">{t('tv.sub')}</p>
            </div>

            {VIDEO_TESTIMONIALS.length === 0 ? (
              <Rise>
                <div className="surface mx-auto flex max-w-xl flex-col items-center gap-4 rounded-3xl p-10 text-center">
                  <span className="flex h-14 w-14 items-center justify-center rounded-full bg-black/[0.06]"><Play className="h-6 w-6" /></span>
                  <p className="font-serif text-2xl text-ink">{t('tv.soonTitle')}</p>
                  <p className="text-sm text-muted">{t('tv.soonSub')}</p>
                </div>
              </Rise>
            ) : (
              <div className="grid gap-8 md:grid-cols-2">
                {VIDEO_TESTIMONIALS.map(v => <Rise key={v.id}><VideoCard v={v} /></Rise>)}
              </div>
            )}

            <Rise>
              <div className="mx-auto mt-16 max-w-2xl rounded-3xl border border-black/[0.08] bg-white/70 p-8 text-center backdrop-blur">
                <p className="font-serif text-2xl text-ink">{t('tv.shareTitle')}</p>
                <p className="mt-2 text-sm text-muted">{t('tv.shareSub')}</p>
                <div className="mt-6 flex flex-wrap justify-center gap-3">
                  {GOOGLE_REVIEW_URL && (
                    <a href={GOOGLE_REVIEW_URL} target="_blank" rel="noopener" className="inline-flex items-center gap-2 rounded-full bg-ink px-6 py-3 text-sm text-white transition-transform hover:scale-[1.02]">
                      {t('tv.google')} <ExternalLink className="h-4 w-4" />
                    </a>
                  )}
                  <a href="mailto:johnny.oliveira@jcsolutionsus.com?subject=LiveTranslate%20testimonial" className="inline-flex items-center gap-2 rounded-full border border-ink px-6 py-3 text-sm text-ink transition-colors hover:bg-ink hover:text-white">
                    {t('tv.send')}
                  </a>
                </div>
              </div>
            </Rise>
          </div>
        </section>
        <Footer />
      </main>
    </>
  );
}
