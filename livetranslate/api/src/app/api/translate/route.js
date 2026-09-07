// Controle das pontes de tradução, por IGREJA.
// Ações do ouvinte (request/release/heartbeat) são anônimas mas sempre levam o slug.
// Ações do operador (set-source/set-mute/stop-all) exigem o login do painel (membro da igreja).

import { manager } from '@/lib/session-manager';
import { logSessao } from '@/lib/translation-bridge';
import { churchPublic, requireMember } from '@/lib/tenant';

const json = (data, status = 200) => Response.json(data, { status });

/** Igreja para ações públicas (ouvinte): só pelo slug. */
async function publicChurch(slug) {
  const c = await churchPublic(slug);
  if (!c) return null;
  return { id: `slug:${c.slug}`, slug: c.slug, name: c.name, room: c.room, speakerLang: c.speakerLang };
}

export async function GET(req) {
  const slug = new URL(req.url).searchParams.get('slug');
  if (!slug) return json({ error: 'missing slug' }, 400);
  const church = await publicChurch(slug);
  if (!church) return json({ error: 'church not found' }, 404);
  return json(manager.status(church));
}

export async function POST(req) {
  try {
    const body = await req.json();
    const { slug, lang, action, id } = body;
    if (!slug) return json({ error: 'missing slug' }, 400);

    // ── ouvinte (anônimo) ──
    if (action === 'request' || action === 'release' || action === 'heartbeat') {
      const church = await publicChurch(slug);
      if (!church) return json({ error: 'church not found' }, 404);

      if (action === 'request') {
        await manager.request(church, lang);
        manager.heartbeat(church.id, id, lang);
        return json({ ok: true });
      }
      if (action === 'release') { manager.release(id); return json({ ok: true }); }
      manager.heartbeat(church.id, id, lang);
      return json(manager.status(church));
    }

    // ── operador (logado no painel) ──
    const auth = await requireMember(req, slug);
    if (auth.error) return json({ error: auth.error }, auth.status);
    const church = { ...auth.church, id: `slug:${auth.church.slug}` };

    if (action === 'set-source') {
      manager.setSource(church, lang);
      return json({ ok: true, sourceLang: lang });
    }
    if (action === 'set-mute') {
      const mudou = manager.setMuted(church, !!body.muted);
      // só a transição vira log (a timeline de mutes de um culto teve de ser
      // reconstruída do nginx uma vez — desde então fica em disco)
      if (mudou) logSessao(church.slug, `${body.muted ? 'MUTE' : 'UNMUTE'} (${body.by || 'operador'})`);
      return json({ ok: true, muted: !!body.muted });
    }
    if (action === 'stop-all') {
      const sermoes = await manager.stopAll(church.id, church.name);
      return json({ ok: true, sermoes });
    }
    return json({ error: 'invalid action' }, 400);
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}
