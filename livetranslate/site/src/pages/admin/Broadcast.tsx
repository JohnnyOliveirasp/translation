import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Loader2, Mic, MicOff, Radio, Settings2, Users } from 'lucide-react';
import { supabase, type Church } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { useLang } from '../../i18n';
import { useRouter } from '../../router';
import { LANGUAGE_CATALOG, langLabel } from '../../lib/languages';
import ChurchLogo from '../../components/ChurchLogo';
import { BroadcastEngine, CFG_PADRAO, type Cfg, type Janela, type Modo } from '../../lib/broadcast-engine';

/**
 * Painel do operador — /broadcast/{slug}. Transmite de verdade: publica o microfone
 * na sala LiveKit DESTA igreja e liga o Worship Sense (auto-mute do louvor), a mesma
 * lógica calibrada da POC3. Sem senha: quem chega aqui já entrou no painel da igreja.
 */
const SOURCE_LANGS = ['en', 'pt-BR', 'es'];   // idiomas que o orador pode falar (como na POC3)

export default function Broadcast({ slug }: { slug: string }) {
  const { t } = useLang();
  const { navigate } = useRouter();
  const { loading, user, memberships } = useAuth();

  const [langs, setLangs] = useState<string[] | null>(null);
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [mic, setMic] = useState('');
  const [source, setSource] = useState('en');
  const [fase, setFase] = useState<'pronto' | 'ligando' | 'no-ar'>('pronto');
  const [erro, setErro] = useState<string | null>(null);
  const [janela, setJanela] = useState<Janela | null>(null);
  const [nivel, setNivel] = useState(0);
  const [muted, setMuted] = useState<boolean | null>(null);
  const [modo, setModo] = useState<Modo>('AUTO');
  const [ouvintes, setOuvintes] = useState<Record<string, number>>({});
  const [cfg, setCfg] = useState<Cfg>({ ...CFG_PADRAO });
  const [ajustes, setAjustes] = useState(false);
  const engine = useRef<BroadcastEngine | null>(null);

  useEffect(() => { if (!loading && !user) navigate('/login'); }, [loading, user, navigate]);

  const m = memberships.find(x => x.churches.slug === slug);
  const church: Church | undefined = m?.churches;

  useEffect(() => {
    if (!church) return;
    setSource(church.speaker_lang || 'en');
    supabase.from('church_languages').select('lang_code').eq('church_id', church.id).eq('enabled', true)
      .then(({ data }) => setLangs((data ?? []).map(r => r.lang_code)));
  }, [church]);

  // libera os rótulos dos microfones
  useEffect(() => {
    if (!church) return;
    BroadcastEngine.microfones()
      .then(({ list, preferido }) => { setMics(list); setMic(preferido); })
      .catch(() => setErro(t('bc.micDenied')));
  }, [church, t]);

  useEffect(() => () => { engine.current?.encerrar(); }, []);
  useEffect(() => { engine.current?.setCfg(cfg); }, [cfg]);

  async function iniciar() {
    if (!church) return;
    setErro(null); setFase('ligando');
    const eng = new BroadcastEngine(church.slug, {
      onJanela: (j, n) => { setJanela(j); setNivel(n); },
      onMute: mu => setMuted(mu),
      onStatus: s => setOuvintes(s.listeners),
      onErro: msg => setErro(msg),
    });
    eng.setCfg(cfg);
    eng.setModo(modo);
    engine.current = eng;
    try {
      await eng.iniciar(mic, source);
      setFase('no-ar');
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
      setFase('pronto');
      await eng.encerrar().catch(() => {});
      engine.current = null;
    }
  }

  async function encerrar() {
    await engine.current?.encerrar();
    engine.current = null;
    setFase('pronto'); setJanela(null); setMuted(null); setOuvintes({});
  }

  function trocarModo(mm: Modo) { setModo(mm); engine.current?.setModo(mm); }

  if (loading || !user) return null;

  if (!church) {
    return (
      <main className="relative z-10 flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="font-serif text-3xl">{t('bc.noAccess')}</p>
        <a href="/admin" className="rounded-full bg-ink px-6 py-3 text-sm text-white">{t('bc.back')}</a>
      </main>
    );
  }

  const noAr = fase === 'no-ar';
  const estado = janela?.estado ?? 'UNKNOWN';

  return (
    <main className="relative z-10 min-h-screen">
      <div className="mx-auto w-full max-w-4xl px-4 py-8 md:px-8 md:py-12">
        <a href="/admin" className="inline-flex items-center gap-2 text-sm text-muted hover:text-ink">
          <ArrowLeft className="h-4 w-4" /> {t('bc.back')}
        </a>

        <header className="mt-6 flex flex-wrap items-end justify-between gap-4">
          <div className="flex items-center gap-4">
            <ChurchLogo path={church.logo_path} light={church.logo_is_light} name={church.name}
              className="h-12 shrink-0 rounded-xl" imgClassName="max-h-9 max-w-[9rem]"
              fallbackClassName="h-12 w-12 rounded-xl text-xl" />
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] text-muted">{church.name}</p>
              <h1 className="mt-1 font-serif text-4xl leading-none">{t('bc.title')}</h1>
              <p className="mt-2 text-sm text-muted">{t('bc.sub')}</p>
            </div>
          </div>
          {noAr && (
            <span className="inline-flex items-center gap-2 rounded-full bg-red-50 px-4 py-2 text-sm text-red-700">
              <span className="h-2 w-2 animate-pulse rounded-full bg-red-600" /> {t('bc.onAir')}
            </span>
          )}
        </header>

        {erro && <p role="alert" className="mt-6 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{erro}</p>}

        {!noAr ? (
          <section className="mt-8 space-y-4">
            <div className="rounded-2xl border border-black/[0.08] bg-white/90 p-6 backdrop-blur-sm">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted">{t('bc.mic')}</span>
                <select value={mic} onChange={e => setMic(e.target.value)}
                  className="w-full rounded-xl border border-black/10 bg-white px-4 py-3 text-sm outline-none focus:border-ink">
                  {mics.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || 'Microphone'}</option>)}
                </select>
              </label>
              <p className="mt-2 text-xs text-muted">{t('bc.micHint')}</p>

              <label className="mt-5 block">
                <span className="mb-1.5 block text-xs font-medium text-muted">{t('bc.speakerLang')}</span>
                <select value={source} onChange={e => setSource(e.target.value)}
                  className="w-full rounded-xl border border-black/10 bg-white px-4 py-3 text-sm outline-none focus:border-ink">
                  {LANGUAGE_CATALOG.filter(l => SOURCE_LANGS.includes(l.code)).map(l => (
                    <option key={l.code} value={l.code}>{l.flag} {l.label}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="rounded-2xl border border-black/[0.08] bg-white/90 p-6 backdrop-blur-sm">
              <p className="text-xs font-medium text-muted">{t('bc.langs')}</p>
              {langs === null
                ? <Loader2 className="mt-3 h-4 w-4 animate-spin text-muted" />
                : <p className="mt-2 text-sm">{langs.length ? langs.map(langLabel).join(' · ') : t('bc.noLangs')}</p>}
              <p className="mt-3 text-xs text-muted">
                {t('bc.listeners')} <a className="underline" href={`/${church.slug}`} target="_blank" rel="noopener">livetranslate.church/{church.slug}</a>
              </p>
            </div>

            <button onClick={iniciar} disabled={fase === 'ligando' || !langs?.length}
              className="inline-flex items-center gap-2 rounded-full bg-ink px-7 py-3.5 text-sm text-white disabled:opacity-50">
              {fase === 'ligando' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Radio className="h-4 w-4" />}
              {fase === 'ligando' ? t('bc.starting') : t('bc.start')}
            </button>
            {!langs?.length && langs !== null && <p className="text-xs text-muted">{t('bc.noLangs')}</p>}
          </section>
        ) : (
          <section className="mt-8 space-y-4">
            {/* Estado ao vivo */}
            <div className={'rounded-2xl border p-6 backdrop-blur-sm transition-colors ' +
              (muted ? 'border-amber-200 bg-amber-50/90' : 'border-emerald-200 bg-emerald-50/90')}>
              <div className="flex items-center gap-3">
                {muted ? <MicOff className="h-6 w-6 text-amber-700" /> : <Mic className="h-6 w-6 text-emerald-700" />}
                <div>
                  <p className={'text-lg font-medium ' + (muted ? 'text-amber-900' : 'text-emerald-900')}>
                    {muted ? t('bc.mutedNow') : t('bc.liveNow')}
                  </p>
                  <p className="text-xs text-muted">
                    {t('bc.detector')}: {estado === 'SPEECH' ? t('bc.speech') : estado === 'MUSIC' ? t('bc.music') : '—'}
                    {janela && ` · ${t('bc.speech')} ${janela.smF.toFixed(2)} · ${t('bc.music')} ${janela.smM.toFixed(2)}`}
                  </p>
                </div>
              </div>
              {/* medidor de entrada */}
              <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-black/10">
                <div className="h-full bg-ink transition-[width] duration-100" style={{ width: `${Math.round(nivel * 100)}%` }} />
              </div>
            </div>

            {/* Modo */}
            <div className="rounded-2xl border border-black/[0.08] bg-white/90 p-6 backdrop-blur-sm">
              <p className="text-xs font-medium text-muted">{t('bc.mode')}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {(['AUTO', 'FORCE_ON', 'FORCE_OFF'] as Modo[]).map(mm => (
                  <button key={mm} onClick={() => trocarModo(mm)}
                    className={'rounded-full px-4 py-2 text-sm transition-colors ' +
                      (modo === mm ? 'bg-ink text-white' : 'border border-black/10 hover:bg-black/[0.04]')}>
                    {t('bc.mode.' + mm)}
                  </button>
                ))}
              </div>
              <p className="mt-3 text-xs text-muted">{t('bc.modeHint')}</p>
            </div>

            {/* Ouvintes */}
            <div className="rounded-2xl border border-black/[0.08] bg-white/90 p-6 backdrop-blur-sm">
              <p className="flex items-center gap-2 text-xs font-medium text-muted"><Users className="h-4 w-4" /> {t('bc.listenersNow')}</p>
              <div className="mt-3 flex flex-wrap gap-4 text-sm">
                {(langs ?? []).map(code => (
                  <span key={code} className="rounded-full bg-black/[0.04] px-4 py-2">{langLabel(code)} · {ouvintes[code] ?? 0}</span>
                ))}
              </div>
            </div>

            {/* Calibração (fica escondida — só quando o operador quiser mexer) */}
            <div className="rounded-2xl border border-black/[0.08] bg-white/90 p-6 backdrop-blur-sm">
              <button onClick={() => setAjustes(a => !a)} className="flex items-center gap-2 text-xs font-medium text-muted hover:text-ink">
                <Settings2 className="h-4 w-4" /> {t('bc.tuning')}
              </button>
              {ajustes && (
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  {([
                    ['limFala', t('bc.tune.speechThr'), 0.05, 0.9, 0.05],
                    ['limMus', t('bc.tune.musicThr'), 0.05, 0.9, 0.05],
                    ['margem', t('bc.tune.dominance'), 1, 3, 0.1],
                    ['janFala', t('bc.tune.speechWin'), 1, 15, 1],
                    ['janMus', t('bc.tune.musicWin'), 1, 10, 1],
                  ] as const).map(([k, label, min, max, step]) => (
                    <label key={k} className="block text-xs">
                      <span className="mb-1 block text-muted">{label}: <b className="text-ink">{cfg[k]}</b></span>
                      <input type="range" min={min} max={max} step={step} value={cfg[k]}
                        onChange={e => setCfg({ ...cfg, [k]: Number(e.target.value) })} className="w-full" />
                    </label>
                  ))}
                </div>
              )}
            </div>

            <button onClick={encerrar} className="rounded-full border border-red-200 bg-red-50 px-7 py-3.5 text-sm text-red-700">
              {t('bc.stop')}
            </button>
          </section>
        )}
      </div>
    </main>
  );
}
