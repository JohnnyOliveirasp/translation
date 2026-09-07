import { useLang } from '../i18n';
import { WordsPullUpMultiStyle, Rise } from './TextEffects';
import QrCode from './QrCode';

export default function HowItWorks() {
  const { t } = useLang();
  const steps = [1, 2, 3].map(n => ({ n, title: t(`how.${n}.t`), desc: t(`how.${n}.d`) }));
  return (
    <section id="how" className="relative z-10 px-4 py-24 md:px-6 md:py-32">
      <div className="surface mx-auto max-w-6xl rounded-[2rem] px-6 py-16 shadow-[0_40px_120px_-60px_rgba(0,0,0,0.25)] md:px-14 md:py-24">
        <p className="mb-6 text-[10px] uppercase tracking-[0.2em] text-muted sm:text-xs">{t('how.label')}</p>
        <WordsPullUpMultiStyle
          text={t('how.title')}
          center={false}
          className="display max-w-3xl text-4xl sm:text-5xl md:text-6xl"
          emClassName="italic text-muted"
        />
        <div className="mt-16 grid gap-10 md:grid-cols-3">
          {steps.map((s, i) => (
            <Rise key={s.n} delay={i * 0.12}>
              <span className="block font-serif text-6xl leading-none text-black/10">{s.n}</span>
              <h3 className="mt-4 font-serif text-3xl">{s.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-muted sm:text-base">{s.desc}</p>
            </Rise>
          ))}
        </div>

        {/* Cada igreja recebe o SEU QR (gerado no painel). Aqui é a demonstração do conceito:
            o celular mostra a página do ouvinte com o logo da igreja no topo. */}
        <div className="mt-20 grid items-center gap-10 border-t border-black/[0.06] pt-16 md:grid-cols-[1.1fr_0.9fr]">
          <Rise>
            <p className="mb-4 text-[10px] uppercase tracking-[0.2em] text-muted sm:text-xs">{t('demo.label')}</p>
            <WordsPullUpMultiStyle text={t('demo.title')} center={false} className="display text-4xl sm:text-5xl" emClassName="italic text-muted" />
            <p className="mt-6 max-w-md text-sm leading-relaxed text-muted sm:text-base">{t('demo.text')}</p>
            <p className="mt-3 text-xs text-muted/80">{t('demo.note')}</p>
          </Rise>
          <Rise delay={0.15} className="justify-self-center">
            <div className="flex items-center gap-6">
              {/* QR ilustrativo (aponta para o próprio site) */}
              <div className="surface-solid rotate-[-1.5deg] rounded-3xl border border-black/[0.06] p-4 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.25)] transition-transform duration-500 hover:rotate-0">
                <QrCode text="https://livetranslate.church" className="h-32 w-32 [&>svg]:h-full [&>svg]:w-full sm:h-40 sm:w-40" />
              </div>
              {/* Celular: o que o membro vê ao escanear — logo da igreja no topo */}
              <div className="w-40 shrink-0 rounded-[1.75rem] border-4 border-ink/85 bg-white p-3 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.35)] sm:w-44">
                <div className="flex flex-col items-center rounded-[1.25rem] bg-white pb-3 pt-4">
                  <img src="/assets/churches/redeem-community-church.png" alt="" className="h-6 w-auto" />
                  <span className="mt-2 text-[7px] uppercase tracking-[0.16em] text-muted">{t('demo.phoneLabel')}</span>
                  <div className="mt-3 w-full space-y-1.5 px-3">
                    <span className="block rounded-lg bg-ink px-2 py-1.5 text-[9px] text-white">🇪🇸 Español</span>
                    <span className="block rounded-lg border border-black/10 px-2 py-1.5 text-[9px] text-ink/70">🇧🇷 Português</span>
                    <span className="block rounded-lg border border-black/10 px-2 py-1.5 text-[9px] text-ink/70">🇭🇹 Kreyòl</span>
                  </div>
                </div>
              </div>
            </div>
          </Rise>
        </div>
      </div>
    </section>
  );
}
