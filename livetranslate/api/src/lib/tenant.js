// Identidade da igreja (tenant) vinda do Supabase.
// Sem service_role: o operador manda o access token dele e nós consultamos com ESSE token,
// então a RLS do banco é quem decide o que ele pode ver. O ouvinte é anônimo e só
// enxerga o que o RPC público `church_public` expõe.

const SUPA_URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;

if (!SUPA_URL || !ANON) console.warn('[tenant] SUPABASE_URL / SUPABASE_ANON_KEY ausentes no .env');

/** Igreja pública pelo slug (anônimo): nome, sala LiveKit, idioma do orador, idiomas ativos. */
export async function churchPublic(slug) {
  const r = await fetch(`${SUPA_URL}/rest/v1/rpc/church_public`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_slug: String(slug || '').toLowerCase() }),
  });
  if (!r.ok) throw new Error(`church_public ${r.status}`);
  const rows = await r.json();
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row) return null;
  return {
    slug: String(slug).toLowerCase(),
    name: row.name,
    room: row.livekit_room,
    speakerLang: row.speaker_lang,
    languages: row.languages || [],
    logoPath: row.logo_path ?? null,
    logoIsLight: !!row.logo_is_light,
  };
}

/** Logo da igreja (bytes do bucket público `logos`) para o cabeçalho do PDF do sermão. */
export async function churchLogo(slug) {
  const church = await churchPublic(slug);
  if (!church?.logoPath) return null;
  const r = await fetch(`${SUPA_URL}/storage/v1/object/public/logos/${church.logoPath}`);
  if (!r.ok) return null;
  return { buf: Buffer.from(await r.arrayBuffer()), isLight: church.logoIsLight };
}

/** Operador: valida o access token do Supabase e confirma que ele é membro DESTA igreja. */
export async function requireMember(req, slug) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return { error: 'missing token', status: 401 };

  const u = await fetch(`${SUPA_URL}/auth/v1/user`, {
    headers: { apikey: ANON, Authorization: `Bearer ${token}` },
  });
  if (!u.ok) return { error: 'invalid token', status: 401 };
  const user = await u.json();

  // Consulta COM O TOKEN DO USUÁRIO: a RLS só devolve as igrejas dele.
  const q = new URL(`${SUPA_URL}/rest/v1/memberships`);
  q.searchParams.set('select', 'role,churches(id,slug,name,livekit_room,speaker_lang,status)');
  const m = await fetch(q, { headers: { apikey: ANON, Authorization: `Bearer ${token}` } });
  if (!m.ok) return { error: 'membership lookup failed', status: 403 };
  const rows = await m.json();
  const hit = (rows || []).find(r => r.churches?.slug === String(slug || '').toLowerCase());
  if (!hit) return { error: 'not a member of this church', status: 403 };
  if (!['trial', 'active'].includes(hit.churches.status)) return { error: 'subscription inactive', status: 402 };

  return {
    user,
    role: hit.role,
    church: {
      id: hit.churches.id,
      slug: hit.churches.slug,
      name: hit.churches.name,
      room: hit.churches.livekit_room,
      speakerLang: hit.churches.speaker_lang,
    },
  };
}
