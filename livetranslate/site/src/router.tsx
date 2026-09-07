import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

// Roteador mínimo por pathname (sem dependência): intercepta cliques em <a href="/..."> e usa pushState.
type Ctx = { path: string; navigate: (to: string) => void };
const RouterCtx = createContext<Ctx>({ path: '/', navigate: () => {} });

function scrollToHash() {
  const id = window.location.hash.slice(1);
  if (!id) { window.scrollTo({ top: 0 }); return; }
  setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }), 60);
}

export function RouterProvider({ children }: { children: ReactNode }) {
  const [path, setPath] = useState(window.location.pathname);
  const navigate = useCallback((to: string) => {
    window.history.pushState({}, '', to);
    setPath(window.location.pathname);
    scrollToHash();
  }, []);

  useEffect(() => {
    const onPop = () => { setPath(window.location.pathname); scrollToHash(); };
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element).closest('a');
      if (!a) return;
      const href = a.getAttribute('href') || '';
      if (!href.startsWith('/') || href.startsWith('//') || a.target === '_blank' || a.hasAttribute('download')) return;
      e.preventDefault();
      navigate(href);
    };
    window.addEventListener('popstate', onPop);
    document.addEventListener('click', onClick);
    return () => { window.removeEventListener('popstate', onPop); document.removeEventListener('click', onClick); };
  }, [navigate]);

  const value = useMemo(() => ({ path, navigate }), [path, navigate]);
  return <RouterCtx.Provider value={value}>{children}</RouterCtx.Provider>;
}

export const useRouter = () => useContext(RouterCtx);

/** Casa "/invite/:token" → { token } */
export function matchPath(pattern: string, path: string): Record<string, string> | null {
  const p = pattern.split('/').filter(Boolean), s = path.split('/').filter(Boolean);
  if (p.length !== s.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(':')) params[p[i].slice(1)] = decodeURIComponent(s[i]);
    else if (p[i] !== s[i]) return null;
  }
  return params;
}
