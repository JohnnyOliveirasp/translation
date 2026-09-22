import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { DICT, type Lang } from './dictionary';

export const LANGS: Lang[] = ['en', 'es', 'pt'];

type Ctx = { lang: Lang; setLang: (l: Lang) => void; t: (key: string) => string };
const LangContext = createContext<Ctx | null>(null);

// Idioma principal do site é INGLÊS (decisão de 26/08). Só muda se o visitante escolher no seletor
// — ou se vier por um LINK COM IDIOMA (22/09): livetranslate.church/?lang=pt abre em português e
// guarda a escolha. É o link para compartilhar com igrejas no Brasil (aceita pt, pt-BR, es, en).
function detectLang(): Lang {
  try {
    const q = new URLSearchParams(window.location.search).get('lang')?.toLowerCase();
    const daUrl = q === 'pt-br' ? 'pt' : (q as Lang | undefined);
    if (daUrl && LANGS.includes(daUrl)) {
      try { localStorage.setItem('lt-lang', daUrl); } catch {}
      return daUrl;
    }
  } catch {}
  try {
    const saved = localStorage.getItem('lt-lang') as Lang | null;
    if (saved && LANGS.includes(saved)) return saved;
  } catch {}
  return 'en';
}

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detectLang);
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try { localStorage.setItem('lt-lang', l); } catch {}
  }, []);
  useEffect(() => { document.documentElement.lang = lang === 'pt' ? 'pt-BR' : lang; }, [lang]);
  const t = useCallback((key: string) => DICT[lang][key] ?? DICT.en[key] ?? key, [lang]);
  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useLang() {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error('useLang fora do LangProvider');
  return ctx;
}

/** Quebra "texto *itálico* texto" em segmentos para renderizar <em> */
export function segments(text: string): { text: string; em: boolean }[] {
  return text.split(/(\*[^*]+\*)/g).filter(Boolean).map(s =>
    s.startsWith('*') && s.endsWith('*') ? { text: s.slice(1, -1), em: true } : { text: s, em: false },
  );
}
