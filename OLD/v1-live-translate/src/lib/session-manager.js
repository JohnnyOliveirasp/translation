// Manager singleton: 1 TranslationBridge por idioma, sob demanda.
// Idioma sem ouvinte é derrubado após IDLE_TIMEOUT_SECONDS (custo zero).
// globalThis evita duplicação no hot-reload do Next em dev.

import { TranslationBridge } from './translation-bridge.js';
import { CATALOGO } from './languages.js';
import { appendFileSync, mkdirSync } from 'node:fs';

class SessionManager {
  constructor() {
    this.entries = new Map(); // lang → { bridge, vazioDesde, startedAt, maxTimer }
    this.eventStartedAt = null;
    this.sourceLang = 'en'; // idioma FALADO pelo orador (operador define no /broadcast)
    this.muted = false;     // A4: operador mutou (louvor) → ouvintes veem aviso e pausam juntos
    this.presencas = new Map(); // id do ouvinte → { lang, visto } — contagem por sinal de vida
    try { mkdirSync('logs', { recursive: true }); } catch {}
    setInterval(() => this.varrer(), 5000).unref?.();
  }

  setSource(lang) {
    if (!CATALOGO.some(l => l.code === lang)) throw new Error(`invalid language: ${lang}`);
    this.sourceLang = lang;
    // ninguém pode "ouvir tradução" para o idioma que já está sendo falado
    if (this.entries.has(lang)) this.teardown(lang, 'virou o idioma do orador');
  }

  logCusto(line) {
    // minutos/custo NUNCA vão para a tela — só log e relatório final (decisão de 04/08)
    try { appendFileSync('logs/custo.log', `${new Date().toISOString()} ${line}\n`); } catch {}
  }

  valid(lang) { return lang !== this.sourceLang && CATALOGO.some(l => l.code === lang); }

  async request(lang) {
    if (!this.valid(lang)) throw new Error(`language not available: ${lang}`);
    let e = this.entries.get(lang);
    // ponte morta (reconexão desistiu, processo anterior, etc.) → descarta e recria
    if (e && e.bridge.running === false) {
      await this.teardown(lang, 'ponte morta detectada — recriando');
      e = null;
    }
    if (!e) {
      e = { bridge: new TranslationBridge(lang), vazioDesde: null, startedAt: Date.now() };
      this.entries.set(lang, e);
      this.eventStartedAt ??= Date.now();
      this.logCusto(`START ${lang}`);
      try {
        // teto de 20s: partida travada não pode prender o ouvinte em "Connecting..."
        await Promise.race([
          e.bridge.start(),
          new Promise((_, rej) => setTimeout(() => rej(new Error('translation engine took too long to start — please try again')), 20000)),
        ]);
      } catch (err) {
        this.entries.delete(lang);
        e.bridge.stop().catch(() => {});
        throw err;
      }
      this.armarTravaDeGasto(lang, e);
    }
    e.vazioDesde = null;
    return e;
  }

  // PRESENÇA — cada ouvinte manda um sinal de vida a cada poucos segundos.
  // Substitui o contador incremental antigo, que dessincronizava para sempre
  // quando o iPhone disparava "saída" ao bloquear a tela (culto 09/08: mostrava
  // 1 ouvinte havendo 2). Aqui não há como acumular erro: quem não dá sinal, sai.
  heartbeat(id, lang) {
    if (!id || !lang) return;
    this.presencas.set(id, { lang, visto: Date.now() });
    const e = this.entries.get(lang);
    if (e) e.vazioDesde = null;
  }

  contar(lang) {
    const limite = Date.now() - 15000; // sem sinal há 15s → considerado desconectado
    let n = 0;
    for (const p of this.presencas.values()) if (p.lang === lang && p.visto > limite) n++;
    return n;
  }

  release(lang, id) {
    if (id) this.presencas.delete(id); // saída explícita: some na hora
  }

  // varredura: limpa presenças mortas e derruba idioma sem ouvinte
  varrer() {
    const agora = Date.now(), limite = agora - 15000;
    for (const [id, p] of this.presencas) if (p.visto <= limite) this.presencas.delete(id);
    // MUTE (louvor) = ponte NÃO cai por ociosidade. Descoberto no teste de 13/08:
    // o Safari do iPhone suspende a página no louvor longo → heartbeats param →
    // ponte era derrubada e o ouvinte ficava mudo quando a pregação voltava.
    // Ponte mutada custa ~zero (nenhum áudio vai ao Gemini), então manter é seguro.
    if (this.muted) { for (const e of this.entries.values()) e.vazioDesde = null; return; }
    const idleMs = (Number(process.env.IDLE_TIMEOUT_SECONDS) || 120) * 1000;
    for (const [lang, e] of this.entries) {
      if (this.contar(lang) > 0) { e.vazioDesde = null; continue; }
      e.vazioDesde ??= agora;
      if (agora - e.vazioDesde > idleMs) this.teardown(lang, 'ocioso');
    }
  }

  armarTravaDeGasto(lang, e) {
    const maxMin = Number(process.env.MAX_SESSION_MINUTES) || 180;
    e.maxTimer = setTimeout(() => this.teardown(lang, `trava de ${maxMin} min atingida`), maxMin * 60 * 1000);
  }

  async teardown(lang, motivo) {
    const e = this.entries.get(lang);
    if (!e) return;
    this.entries.delete(lang);
    clearTimeout(e.maxTimer);
    const minutos = ((Date.now() - e.startedAt) / 60000).toFixed(1);
    this.logCusto(`STOP ${lang} minutos=${minutos} motivo="${motivo}"`);
    await e.bridge.stop();
  }

  status() {
    // ouvintes veem o catálogo MENOS o idioma que está sendo falado
    const alvos = CATALOGO.filter(l => l.code !== this.sourceLang);
    return {
      languages: alvos,
      catalogo: CATALOGO,
      sourceLang: this.sourceLang,
      muted: this.muted,
      active: alvos.map(({ code }) => {
        const e = this.entries.get(code);
        return {
          lang: code,
          listeners: this.contar(code),
          traduzindo: !!e,
          firstLatencyMs: e?.bridge.stats.firstLatencyMs ?? null,
          geminiReconnects: e?.bridge.stats.geminiReconnects ?? 0,
        };
      }),
    };
  }

  async stopAll() {
    for (const lang of [...this.entries.keys()]) await this.teardown(lang, 'encerrado pelo operador');
  }
}

export const manager = (globalThis.__tradutorManager ??= new SessionManager());
