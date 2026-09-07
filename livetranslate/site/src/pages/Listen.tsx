import { useEffect, useRef, useState } from 'react';
import { Check, Headphones, Loader2, Mail, Pause, Play, Volume2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import ChurchLogo from '../components/ChurchLogo';
import { LANGUAGE_CATALOG } from '../lib/languages';
import { ListenEngine, AVISO_LOUVOR, type Estado } from '../lib/listen-engine';
import { useLang } from '../i18n';
import { listenerStrings, RTL_LANGS } from '../i18n/listener';

/**
 * Página do ouvinte — uma por igreja: livetranslate.church/{slug}.
 * É o que abre ao escanear o QR. Topo com o LOGO da igreja (ou o NOME, se não houver).
 * Um toque no idioma já começa a ouvir — o toque é o gesto que o navegador exige
 * para liberar áudio.
 */
type Pub = { name: string; logo_path: string | null; logo_is_light: boolean; speaker_lang: string; languages: string[] };

export default function Listen({ slug }: { slug: string }) {
  const { t } = useLang();
  const [carga, setCarga] = useState<'loading' | 'ok' | 'notfound'>('loading');
  const [church, setChurch] = useState<Pub | null>(null);
  const [estado, setEstado] = useState<Estado>('inicio');
  const [lang, setLang] = useState<string | null>(null);
  const [mutado, setMutado] = useState(false);
  const [pausado, setPausado] = useState(false);
  const [precisaToque, setPrecisaToque] = useState(false);
  const [paragrafos, setParagrafos] = useState<string[]>([]);
  const [letra, setLetra] = useState<{ original: string; traduzido: string }>({ original: '', traduzido: '' });
  const [erro, setErro] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [assinado, setAssinado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erroEmail, setErroEmail] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const engineRef = useRef<ListenEngine | null>(null);
  const legendaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data, error } = await supabase.rpc('church_public', { p_slug: slug });
      if (!alive) return;
      const row = (data as Pub[] | null)?.[0];
      if (error || !row) { setCarga('notfound'); return; }
      setChurch(row);
      setCarga('ok');
      document.title = row.name + ' · LiveTranslate';
    })();
    return () => { alive = false; };
  }, [slug]);

  // motor + sinal de vida (mantém contagem de ouvintes e traz o estado de mute)
  useEffect(() => {
    if (carga !== 'ok' || !audioRef.current) return;
    const eng = new ListenEngine(slug, audioRef.current, {
      onEstado: setEstado,
      onMutado: setMutado,
      onPrecisaToque: setPrecisaToque,
      onLetra: parte => setLetra(prev => ({
        original: (prev.original + (parte.original ?? '')).slice(-400),
        traduzido: (prev.traduzido + (parte.traduzido ?? '')).slice(-400),
      })),
      onLegenda: texto => setParagrafos(prev => {
        const arr = prev.length ? [...prev] : [''];
        arr[arr.length - 1] += texto;
        // frase terminada + parágrafo longo → abre outro; guarda os últimos 5
        if (/[.!?…]\s*$/.test(arr[arr.length - 1]) && arr[arr.length - 1].length > 160) arr.push('');
        return arr.slice(-5);
      }),
    });
    engineRef.current = eng;
    eng.iniciarPulso();
    return () => { eng.sair(); engineRef.current = null; };
  }, [carga, slug]);

  // fim do louvor: momento exato em que a voz volta — tenta destravar o áudio na hora
  useEffect(() => {
    if (!mutado && estado === 'ouvindo') { engineRef.current?.garantirAgora(); setLetra({ original: '', traduzido: '' }); }
  }, [mutado, estado]);

  useEffect(() => {
    if (legendaRef.current) legendaRef.current.scrollTop = legendaRef.current.scrollHeight;
  }, [paragrafos]);

  async function escolher(code: string) {
    setErro(null); setLang(code); setParagrafos([]);
    try { await engineRef.current?.ouvir(code); }
    catch (e) { setErro(e instanceof Error ? e.message : String(e)); setLang(null); setEstado('inicio'); }
  }

  async function voltar() {
    await engineRef.current?.sair();
    setLang(null); setEstado('inicio'); setParagrafos([]); setPausado(false);
    engineRef.current?.iniciarPulso();
  }

  /** Opt-in do PDF: o ouvinte recebe a pregação de hoje traduzida no idioma dele. */
  async function assinar(e: React.FormEvent) {
    e.preventDefault();
    setErroEmail(null); setEnviando(true);
    const { error } = await supabase.rpc('subscribe_listener', {
      p_slug: slug, p_email: email.trim().toLowerCase(), p_lang: lang ?? church?.speaker_lang ?? 'en', p_consent: false,
    });
    setEnviando(false);
    if (error) { setErroEmail(error.message); return; }
    setAssinado(true);
  }

  function alternarPausa() {
    const novo = !pausado;
    setPausado(novo);
    engineRef.current?.pausar(novo);
  }

  if (carga === 'loading') {
    return <main className="relative z-10 flex min-h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted" /></main>;
  }

  if (carga === 'notfound' || !church) {
    return (
      <main className="relative z-10 flex min-h-screen flex-col items-center justify-center px-6 text-center">
        <img src="/assets/lockup-horizontal-color.svg" alt="LiveTranslate" className="h-8 w-auto" />
        <h1 className="mt-8 font-serif text-3xl">{t('lst.notFound')}</h1>
        <p className="mt-3 max-w-sm text-sm text-muted">{t('lst.notFoundHint')}</p>
        <a href="/" className="mt-8 rounded-full bg-ink px-6 py-3 text-sm text-white">{t('lst.home')}</a>
      </main>
    );
  }

  const langs = LANGUAGE_CATALOG.filter(l => church.languages.includes(l.code));
  const aviso = AVISO_LOUVOR[lang || 'en'] ?? AVISO_LOUVOR['en'];
  // Depois do toque no idioma, a TELA INTEIRA fala esse idioma (quem escolheu Español
  // não pode continuar lendo "Want today's message by email?").
  const s = listenerStrings(lang);
  const rtl = !!lang && RTL_LANGS.includes(lang.split('-')[0]);

  return (
    <main dir={rtl ? 'rtl' : 'ltr'} className="relative z-10 mx-auto flex min-h-screen w-full max-w-lg flex-col px-5 py-10">
      <audio ref={audioRef} autoPlay playsInline />

      <header className="flex flex-col items-center text-center">
        {church.logo_path
          ? <ChurchLogo path={church.logo_path} light={church.logo_is_light} name={church.name}
              className="rounded-2xl" imgClassName="max-h-20 w-auto max-w-[15rem]" />
          : <h1 className="font-serif text-3xl leading-tight text-ink sm:text-4xl">{church.name}</h1>}
        <p className="mt-3 text-[10px] uppercase tracking-[0.2em] text-muted">{lang ? s.label : t('lst.label')}</p>
      </header>

      {estado === 'inicio' ? (
        <section className="surface mt-8 rounded-3xl p-6 shadow-[0_40px_120px_-60px_rgba(0,0,0,0.25)]">
          <p className="flex items-center justify-center gap-2 text-sm text-muted"><Headphones className="h-4 w-4" /> {t('lst.headphones')}</p>
          <p className="mt-5 text-sm text-muted">{t('lst.pick')}</p>
          <div className="mt-4 grid gap-2">
            {langs.length === 0 && <p className="text-sm text-muted">{t('lst.noLangs')}</p>}
            {langs.map(l => (
              <button key={l.code} onClick={() => escolher(l.code)}
                className="flex items-center gap-3 rounded-2xl border border-black/10 bg-white px-4 py-4 text-left transition hover:border-ink">
                <span className="text-2xl">{l.flag}</span>
                <span className="text-lg">{l.label}</span>
              </button>
            ))}
          </div>
          {erro && <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{erro}</p>}
        </section>
      ) : (
        <section className="mt-8 flex flex-1 flex-col">
          <div className="surface rounded-3xl p-6 text-center shadow-[0_40px_120px_-60px_rgba(0,0,0,0.25)]">
            {estado === 'conectando' && (
              <p className="flex items-center justify-center gap-2 text-sm text-muted"><Loader2 className="h-4 w-4 animate-spin" /> {s.connecting}</p>
            )}
            {estado === 'reconectando' && <p className="text-sm text-muted">{s.reconnecting}</p>}

            {estado === 'ouvindo' && (mutado ? (
              <div>
                <p className="font-serif text-2xl">{aviso.titulo}</p>
                {letra.traduzido || letra.original ? (
                  <div className="mt-4 text-left">
                    <p className="text-lg leading-relaxed text-ink">{letra.traduzido || letra.original}</p>
                    {letra.traduzido && letra.original && (
                      <p className="mt-3 text-sm italic leading-relaxed text-muted">{letra.original}</p>
                    )}
                    <p className="mt-4 text-[10px] uppercase tracking-[0.18em] text-muted">{s.lyricsLive}</p>
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-muted">{aviso.texto}</p>
                )}
              </div>
            ) : (
              <p className="flex items-center justify-center gap-2 text-lg"><Volume2 className="h-5 w-5" /> {s.listening}</p>
            ))}

            {precisaToque && (
              <button onClick={() => { setPausado(false); engineRef.current?.pausar(false); }}
                className="mt-5 w-full rounded-full bg-ink px-6 py-4 text-sm text-white">
                {s.tapSound}
              </button>
            )}

            {estado === 'ouvindo' && (
              <div className="mt-6 flex items-center justify-center gap-3">
                <button onClick={alternarPausa} className="inline-flex items-center gap-2 rounded-full border border-black/10 px-5 py-2.5 text-sm">
                  {pausado ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                  {pausado ? s.resume : s.pause}
                </button>
                <button onClick={voltar} className="text-sm text-muted underline underline-offset-4">{s.change}</button>
              </div>
            )}
          </div>

          {/* PDF por e-mail — sem cadastro, só o endereço */}
          {estado === 'ouvindo' && (
            <div className="surface mt-4 rounded-3xl p-5">
              {assinado ? (
                <p className="flex items-center justify-center gap-2 text-sm text-ink">
                  <Check className="h-4 w-4" /> {s.mailDone}
                </p>
              ) : (
                <form onSubmit={assinar}>
                  <p className="flex items-center gap-2 text-sm text-ink"><Mail className="h-4 w-4 text-muted" /> {s.mailTitle}</p>
                  <p className="mt-1 text-xs text-muted">{s.mailHint}</p>
                  <div className="mt-3 flex gap-2">
                    <input type="email" required value={email} onChange={ev => setEmail(ev.target.value)}
                      placeholder={s.mailPlaceholder} autoComplete="email" inputMode="email"
                      className="min-w-0 flex-1 rounded-xl border border-black/10 bg-white px-4 py-3 text-sm outline-none focus:border-ink" />
                    <button type="submit" disabled={enviando}
                      className="shrink-0 rounded-xl bg-ink px-5 py-3 text-sm text-white disabled:opacity-60">
                      {enviando ? '…' : s.mailCta}
                    </button>
                  </div>
                  {erroEmail && <p className="mt-2 text-xs text-red-700">{erroEmail}</p>}
                </form>
              )}
            </div>
          )}

          {/* legenda em texto corrido */}
          {paragrafos.some(Boolean) && (
            <div ref={legendaRef} className="surface mt-4 max-h-64 flex-1 overflow-y-auto rounded-3xl p-5 text-left text-sm leading-relaxed text-ink">
              {paragrafos.filter(Boolean).map((p, i) => <p key={i} className="mb-3">{p}</p>)}
            </div>
          )}
        </section>
      )}

      <footer className="mt-auto pt-10 text-center">
        <a href="/" className="inline-flex items-center gap-2 text-xs text-muted hover:text-ink">
          <span>{t('lst.poweredBy')}</span>
          <img src="/assets/lockup-horizontal-color.svg" alt="LiveTranslate" className="h-4 w-auto" />
        </a>
      </footer>
    </main>
  );
}
