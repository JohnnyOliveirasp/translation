import { useState } from 'react';
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

/** Card com QUADRO ao redor do vídeo: mostra a capa com botão de reproduzir e só carrega o player ao clicar (pedido do Johnny, 22/09). */
function VideoCard({ v }: { v: VideoTestimonial }) {
  const { lang, t } = useLang();
  const [playing, setPlaying] = useState(false);
  const loc = lang === 'pt' ? 'pt-BR' : lang;
  // capa: local (/assets/testimonials/<id>.jpg) se existir; para YouTube, a miniatura do próprio vídeo
  const poster = v.youtube ? `https://i.ytimg.com/vi/${v.youtube}/hqdefault.jpg` : `/assets/testimonials/${v.id}.jpg`;
  return (
    <figure className="surface overflow-hidden rounded-3xl shadow-[0_40px_120px_-60px_rgba(0,0,0,0.25)]">
      <div className="p-3 md:p-4">
        <div className={`relative mx-auto overflow-hidden rounded-2xl bg-black ring-1 ring-black/10 ${v.portrait ? 'aspect-[9/16] max-h-[640px]' : 'aspect-video w-full'}`}>
          {!playing ? (
            <button type="button" onClick={() => setPlaying(true)} aria-label={t('tv.play')} className="group absolute inset-0 h-full w-full">
              <img src={poster} alt="" className="h-full w-full object-cover opacity-90 transition group-hover:opacity-100" loading="lazy" />
              <span className="absolute inset-0 flex items-center justify-center">
                <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/95 text-ink shadow-lg transition group-hover:scale-105">
                  <Play className="ml-1 h-7 w-7" />
                </span>
              </span>
              <span className="absolute bottom-3 left-3 rounded-full bg-black/60 px-3 py-1 text-xs text-white">{t('tv.play')}</span>
            </button>
          ) : v.youtube ? (
            <iframe
              className="absolute inset-0 h-full w-full"
              src={`https://www.youtube-nocookie.com/embed/${v.youtube}?rel=0&modestbranding=1&autoplay=1&playsinline=1`}
              title={v.name} allow="accelerometer; autoplay; encrypted-media; picture-in-picture" allowFullScreen />
          ) : (
            <video className="absolute inset-0 h-full w-full" controls autoPlay playsInline
              poster={poster} src={`/assets/testimonials/${v.id}.mp4`} />
          )}
        </div>
      </div>
      <figcaption className="px-6 pb-6 md:px-7 md:pb-7">
        <div className="mb-3 flex items-center gap-1" aria-hidden>
          {Array.from({ length: 5 }).map((_, k) => <Star key={k} className="h-4 w-4 fill-amber-400 text-amber-400" />)}
        </div>
        {v.quote && <blockquote className="font-serif text-lg leading-snug text-ink md:text-xl">“{txt(v.quote, lang)}”</blockquote>}
        <div className={`${v.quote ? 'mt-4' : ''} text-sm`}>
          <div className="font-medium text-ink">{v.name} <span className="font-normal text-muted">· {txt(v.role, lang)}</span></div>
          <div className="mt-0.5 text-muted">{v.org}</div>
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
