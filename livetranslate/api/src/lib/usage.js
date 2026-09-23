// Teto de horas-idioma por plano + pacotes extras + avisos (HANDOFF §24, decisão do Johnny em 22/09).
//
// Regra: plano inclui `plan_hours[plan]` horas-idioma por mês (null = sem teto). Acima disso a igreja
// consome pacotes (`hour_packs`, comprados no Stripe ou dados no /platform). Sem pacote, ainda passa
// até `overage_tolerance` (20%) além do teto; depois a API não abre idioma novo até o mês virar.
// Avisos por e-mail ao admin da igreja em 80% e 100% (uma vez por mês cada).
// Tudo com service_role (db-admin); sem chave, nunca bloqueia.

import { rest, dbAdminConfigurado } from './db-admin.js';
import { enviarEmail, emailConfigurado, logEmail } from './email.js';

const SITE = (process.env.PUBLIC_URL || 'https://livetranslate.church').replace(/\/$/, '');
const PADRAO = { plan_hours: { starter: 12, growth: 30, congregation: null }, tol: 0.2, hour_pack: { hours: 10, usd: 3900, brl: 19900, valid_months: 3 } };
let cfg = { ...PADRAO, em: 0 };
const usoCache = new Map();   // churchId → { em, uso }

export async function configTeto() {
  if (Date.now() - cfg.em < 5 * 60 * 1000) return cfg;
  try {
    const rows = await rest('platform_settings?select=key,value&key=in.(plan_hours,overage_tolerance,hour_pack)');
    for (const r of rows || []) {
      if (r.key === 'plan_hours') cfg.plan_hours = { ...PADRAO.plan_hours, ...(r.value || {}) };
      if (r.key === 'overage_tolerance') cfg.tol = Number(r.value) >= 0 ? Number(r.value) : PADRAO.tol;
      if (r.key === 'hour_pack') cfg.hour_pack = { ...PADRAO.hour_pack, ...(r.value || {}) };
    }
  } catch {}
  cfg.em = Date.now();
  return cfg;
}

const mesAtual = () => new Date().toISOString().slice(0, 7);

/** Uso do mês da igreja: horas usadas, teto, horas de pacote restantes, bloqueado? (cache 60 s). */
export async function usoDaIgreja(churchId, { fresh = false } = {}) {
  if (!dbAdminConfigurado() || !churchId) return null;
  const c = usoCache.get(churchId);
  if (!fresh && c && Date.now() - c.em < 60 * 1000) return c.uso;
  const conf = await configTeto();
  const [igrejas, usadas, packs] = await Promise.all([
    rest(`churches?select=id,slug,name,plan,speaker_lang,usage_alert_month,usage_alert_level&id=eq.${churchId}&limit=1`),
    rest('rpc/church_hours_month', { method: 'POST', body: { p_church: churchId } }),
    rest(`hour_packs?select=id,hours,hours_used,expires_at&church_id=eq.${churchId}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&order=expires_at.asc`),
  ]);
  const igreja = igrejas?.[0];
  if (!igreja) return null;
  const cap = conf.plan_hours[igreja.plan] ?? null;
  const used = Number(usadas) || 0;
  const lista = (packs || []).map(p => ({ ...p, hours: Number(p.hours), hours_used: Number(p.hours_used) }));
  const packsLeft = lista.reduce((a, p) => a + Math.max(0, p.hours - p.hours_used), 0);
  const uso = {
    igreja, cap, used, packsLeft, packs: lista, tol: conf.tol,
    pct: cap ? used / cap : 0,
    blocked: cap !== null && used >= cap * (1 + conf.tol) + packsLeft,
  };
  usoCache.set(churchId, { em: Date.now(), uso });
  return uso;
}

/** Chamado ANTES de abrir uma ponte nova. Sem chave/erro → deixa passar. */
export async function podeAbrirIdioma(churchId) {
  try {
    const uso = await usoDaIgreja(churchId);
    return { ok: !uso?.blocked, uso };
  } catch { return { ok: true, uso: null }; }
}

/**
 * Chamado DEPOIS de somar um trecho no banco: debita pacotes pelo que passou do teto e manda os avisos.
 * Idempotente: o débito alvo é max(0, usadas − teto), e só a diferença para o já debitado é aplicada.
 */
export async function aposTrecho(churchId) {
  if (!dbAdminConfigurado() || !churchId) return;
  let uso;
  try { uso = await usoDaIgreja(churchId, { fresh: true }); } catch { return; }
  if (!uso || uso.cap === null) return;

  // 1) pacotes
  try {
    const alvo = Math.max(0, uso.used - uso.cap);
    const jaDebitado = uso.packs.reduce((a, p) => a + p.hours_used, 0);
    let delta = alvo - jaDebitado;
    for (const p of uso.packs) {
      if (delta <= 0) break;
      const livre = p.hours - p.hours_used;
      if (livre <= 0) continue;
      const usa = Math.min(livre, delta);
      await rest(`hour_packs?id=eq.${p.id}`, { method: 'PATCH', prefer: 'return=minimal', body: { hours_used: Number((p.hours_used + usa).toFixed(2)) } });
      delta -= usa;
    }
  } catch (e) { console.warn('[usage] débito de pacote falhou:', e.message); }

  // 2) avisos 80% / 100% (uma vez por mês cada)
  try {
    const nivel = uso.pct >= 1 ? 100 : uso.pct >= 0.8 ? 80 : 0;
    const mes = mesAtual();
    const ig = uso.igreja;
    const jaAvisado = ig.usage_alert_month === mes ? Number(ig.usage_alert_level) : 0;
    if (nivel > jaAvisado) {
      await rest(`churches?id=eq.${churchId}`, { method: 'PATCH', prefer: 'return=minimal', body: { usage_alert_month: mes, usage_alert_level: nivel } });
      await avisarIgreja(ig, nivel, uso);
    }
  } catch (e) { console.warn('[usage] aviso falhou:', e.message); }
  usoCache.delete(churchId);
}

const TXT = {
  en: {
    a80: { s: '{igreja}: 80% of your monthly translation hours used', p: 'Your church has used {used} of the {cap} translation hours included in the {plan} plan this month. When they run out you can add an extra pack of hours in your dashboard, or upgrade your plan.' },
    a100: { s: '{igreja}: monthly translation hours used up', p: 'Your church has used all {cap} translation hours included in the {plan} plan this month. Translation keeps working for a short while, then new languages will not open until next month. Add an extra pack of hours or upgrade your plan in your dashboard.' },
    cta: 'Open my dashboard',
  },
  es: {
    a80: { s: '{igreja}: 80% de las horas de traducción del mes usadas', p: 'Su iglesia usó {used} de las {cap} horas de traducción incluidas en el plan {plan} este mes. Cuando se acaben, puede agregar un paquete extra de horas en su panel o subir de plan.' },
    a100: { s: '{igreja}: horas de traducción del mes agotadas', p: 'Su iglesia usó las {cap} horas de traducción incluidas en el plan {plan} este mes. La traducción sigue por un corto margen; después no se abrirán idiomas nuevos hasta el próximo mes. Agregue un paquete extra de horas o suba de plan en su panel.' },
    cta: 'Abrir mi panel',
  },
  pt: {
    a80: { s: '{igreja}: 80% das horas de tradução do mês usadas', p: 'Sua igreja usou {used} das {cap} horas de tradução incluídas no plano {plan} neste mês. Quando acabarem, dá para comprar um pacote extra de horas no painel ou subir de plano.' },
    a100: { s: '{igreja}: horas de tradução do mês esgotadas', p: 'Sua igreja usou as {cap} horas de tradução incluídas no plano {plan} neste mês. A tradução segue por uma pequena margem; depois, idiomas novos não abrem até o mês que vem. Compre um pacote extra de horas ou suba de plano no painel.' },
    cta: 'Abrir meu painel',
  },
};
const troca = (t, v) => t.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? '');

async function avisarIgreja(ig, nivel, uso) {
  if (!emailConfigurado()) { logEmail(`[usage] ${ig.slug} ${nivel}% — e-mail não configurado`); return; }
  const admins = await rest(`memberships?select=profiles(email)&church_id=eq.${ig.id}&role=eq.admin`);
  const emails = (admins || []).map(m => m.profiles?.email).filter(Boolean);
  if (!emails.length) return;
  const lang = ig.speaker_lang?.startsWith('pt') ? 'pt' : ig.speaker_lang === 'es' ? 'es' : 'en';
  const t = TXT[lang][nivel === 100 ? 'a100' : 'a80'];
  const vars = { igreja: ig.name, used: uso.used.toFixed(1), cap: String(uso.cap), plan: ig.plan };
  const html = `<!doctype html><html lang="${lang}"><body style="font-family:Arial,sans-serif;color:#111;padding:24px">
<p>${troca(t.p, vars)}</p>
<p><a href="${SITE}/admin?church=${ig.id}" style="display:inline-block;background:#0f172a;color:#fff;padding:10px 18px;border-radius:999px;text-decoration:none">${TXT[lang].cta}</a></p>
<p style="color:#666;font-size:12px">LiveTranslate · ${SITE}</p></body></html>`;
  for (const to of emails) {
    try { await enviarEmail({ para: to, assunto: troca(t.s, vars), html }); logEmail(`[usage] ${ig.slug} ${nivel}% → ${to}`); }
    catch (e) { logEmail(`[usage] ${ig.slug} ${nivel}% FALHOU → ${to}: ${e.message}`); }
  }
}
