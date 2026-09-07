// Token do LiveKit por IGREJA.
// Operador: exige o access token do Supabase (o mesmo login do painel) e ser membro
// da igreja — a senha única do v1 (BROADCAST_PASSWORD) deixou de existir.
// Ouvinte: anônimo, só precisa do slug; entra sem poder publicar.

import { AccessToken } from 'livekit-server-sdk';
import { churchPublic, requireMember } from '@/lib/tenant';

const json = (data, status = 200) => Response.json(data, { status });

export async function POST(req) {
  try {
    const { slug, role } = await req.json();
    if (!slug) return json({ error: 'missing slug' }, 400);

    let room, identity, canPublish;

    if (role === 'operador') {
      const auth = await requireMember(req, slug);
      if (auth.error) return json({ error: auth.error }, auth.status);
      room = auth.church.room;
      identity = `organizador-${auth.church.slug}`;   // um por igreja (v1 usava 'organizador' global)
      canPublish = true;
    } else {
      const church = await churchPublic(slug);
      if (!church) return json({ error: 'church not found' }, 404);
      room = church.room;
      identity = `ouvinte-${Math.random().toString(36).slice(2, 10)}`;
      canPublish = false;
    }

    const at = new AccessToken(process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET, { identity, ttl: '6h' });
    // canPublishData:true também para o ouvinte — sem isso o livekit-client quebra na conexão
    at.addGrant({ room, roomJoin: true, canPublish, canSubscribe: true, canPublishData: true });

    return json({ token: await at.toJwt(), url: process.env.LIVEKIT_URL, identity, room });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}
