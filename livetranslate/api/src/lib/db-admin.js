// Escrita no banco feita PELO SERVIDOR (service_role) — só para o que acontece sem ninguém
// logado: o registro de cultos/custo (a ponte cai sozinha, por ociosidade ou trava) e, depois,
// o webhook do Stripe. Decisão de 22/09 (HANDOFF §22): a chave vive SÓ neste módulo e nunca
// serve consulta em nome de usuário — o resto da API segue com o token do operador + RLS.
//
// Sem SUPABASE_SERVICE_ROLE_KEY no .env.local tudo aqui vira no-op com um aviso: o culto
// nunca pode parar por causa de contabilidade.

const SUPA_URL = process.env.SUPABASE_URL;
const SRK = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const dbAdminConfigurado = () => !!(SUPA_URL && SRK);
let avisou = false;

async function rest(path, { method = 'GET', body, prefer } = {}) {
  if (!dbAdminConfigurado()) {
    if (!avisou) { console.warn('[db-admin] SUPABASE_SERVICE_ROLE_KEY ausente — cultos e custo NÃO serão gravados no banco'); avisou = true; }
    return null;
  }
  const r = await fetch(`${SUPA_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SRK, Authorization: `Bearer ${SRK}`, 'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`${method} ${path.split('?')[0]} → ${r.status} ${(await r.text().catch(() => '')).slice(0, 200)}`);
  if (r.status === 204) return null;
  const txt = await r.text();
  return txt ? JSON.parse(txt) : null;
}

// ── igreja ────────────────────────────────────────────────────────────────────────────
const idPorSlug = new Map();
/** id numérico da igreja (o manager só conhece o slug). */
export async function churchIdBySlug(slug) {
  const s = String(slug || '').toLowerCase();
  if (idPorSlug.has(s)) return idPorSlug.get(s);
  const rows = await rest(`churches?select=id&slug=eq.${encodeURIComponent(s)}&limit=1`);
  const id = rows?.[0]?.id ?? null;
  if (id) idPorSlug.set(s, id);
  return id;
}

// ── culto (services) ──────────────────────────────────────────────────────────────────
/** Abre um culto; se já houver um aberto (processo reiniciou no meio), reaproveita. */
export async function abrirCulto(churchId) {
  const abertos = await rest(`services?select=id,started_at&church_id=eq.${churchId}&ended_at=is.null&order=started_at.desc&limit=1`);
  if (abertos?.[0]?.id) return { id: abertos[0].id, reaproveitado: true };
  const rows = await rest('services', { method: 'POST', body: { church_id: churchId }, prefer: 'return=representation' });
  return rows?.[0]?.id ? { id: rows[0].id, reaproveitado: false } : null;
}

export async function fecharCulto(serviceId, motivo) {
  if (!serviceId) return;
  await rest(`services?id=eq.${serviceId}`, { method: 'PATCH', body: { ended_at: new Date().toISOString(), ended_reason: String(motivo || '').slice(0, 120) }, prefer: 'return=minimal' });
}

/** Soma um trecho de ponte ao culto: minutos e pico de ouvintes (visível à igreja) + custo (só plataforma). */
export async function somarIdioma(serviceId, lang, { minutos, pico, custoUsd, tokensIn = 0, tokensOut = 0, tarifa }) {
  if (!serviceId) return;
  const q = `service_id=eq.${serviceId}&lang_code=eq.${encodeURIComponent(lang)}`;
  const [l, c] = await Promise.all([
    rest(`service_languages?select=minutes,peak_listeners&${q}`),
    rest(`service_costs?select=cost_usd,tokens_in,tokens_out&${q}`),
  ]);
  const antesL = l?.[0], antesC = c?.[0];
  await rest('service_languages', {
    method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal',
    body: {
      service_id: serviceId, lang_code: lang,
      minutes: Number((Number(antesL?.minutes ?? 0) + minutos).toFixed(1)),
      peak_listeners: Math.max(Number(antesL?.peak_listeners ?? 0), pico | 0),
    },
  });
  await rest('service_costs', {
    method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal',
    body: {
      service_id: serviceId, lang_code: lang,
      cost_usd: Number((Number(antesC?.cost_usd ?? 0) + custoUsd).toFixed(4)),
      tokens_in: Number(antesC?.tokens_in ?? 0) + (tokensIn | 0),
      tokens_out: Number(antesC?.tokens_out ?? 0) + (tokensOut | 0),
      rate_usd_per_minute: tarifa,
    },
  });
}

// ── tarifa da estimativa (platform_settings) ──────────────────────────────────────────
const TARIFA_PADRAO = 0.05;   // US$/idioma-minuto, calibrada em 22/09 (HANDOFF §22)
let tarifaCache = { valor: TARIFA_PADRAO, em: 0 };
export async function tarifaPorMinuto() {
  if (Date.now() - tarifaCache.em < 5 * 60 * 1000) return tarifaCache.valor;
  try {
    const rows = await rest('platform_settings?select=value&key=eq.cost_per_lang_minute_usd');
    const v = Number(rows?.[0]?.value);
    tarifaCache = { valor: Number.isFinite(v) && v > 0 ? v : TARIFA_PADRAO, em: Date.now() };
  } catch { tarifaCache.em = Date.now(); }
  return tarifaCache.valor;
}
