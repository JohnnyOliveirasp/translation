import BackgroundVideo from './components/BackgroundVideo';
import BackgroundStill from './components/BackgroundStill';
import Landing from './pages/Landing';
import Signup from './pages/auth/Signup';
import Login from './pages/auth/Login';
import Recover from './pages/auth/Recover';
import Invite from './pages/auth/Invite';
import Admin from './pages/admin/Admin';
import Listen from './pages/Listen';
import Broadcast from './pages/admin/Broadcast';
import { useRouter, matchPath } from './router';
import { Privacy, Terms } from './pages/Legal';

/** Caminhos do produto — tudo que sobrar de 1 segmento é slug de igreja (/{slug}). */
const RESERVED = new Set(['signup', 'login', 'recover', 'admin', 'invite', 'broadcast', 'assets', 'terms', 'privacy']);
const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,}$/;

export default function App() {
  const { path } = useRouter();
  const invite = matchPath('/invite/:token', path);
  const bc = matchPath('/broadcast/:slug', path);
  const seg = path.split('/').filter(Boolean);
  const slug = seg.length === 1 && !RESERVED.has(seg[0]) && SLUG_RE.test(seg[0]) ? seg[0] : null;

  let page: React.ReactNode;
  if (path === '/signup') page = <Signup />;
  else if (path === '/login') page = <Login />;
  else if (path === '/recover') page = <Recover />;
  else if (path === '/admin') page = <Admin />;
  else if (path === '/privacy') page = <Privacy />;
  else if (path === '/terms') page = <Terms />;
  else if (invite) page = <Invite token={invite.token} />;
  else if (bc) page = <Broadcast slug={bc.slug} />;
  else if (slug) page = <Listen slug={slug} />;
  else page = <Landing />;

  // App logado: fundo ESTÁTICO (cruz de madeira) — o vídeo em loop piscava na tela
  // de trabalho (feedback do operador, culto de 06/09). A landing continua com vídeo.
  const isApp = !!bc || path === '/admin';
  return (
    <div className="relative min-h-screen w-full">
      {isApp && <BackgroundStill src="/assets/cross-bg.jpg" srcPortrait="/assets/cross-bg-portrait.jpg" dim={0.5} />}
      {slug && <BackgroundVideo src="/assets/app-bg.mp4" poster="/assets/app-bg.jpg"
        srcPortrait="/assets/app-bg-portrait.mp4" posterPortrait="/assets/app-bg-portrait.jpg" dim={0.62} />}
      {!isApp && !slug && <BackgroundVideo />}
      {page}
    </div>
  );
}
