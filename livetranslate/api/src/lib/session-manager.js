// Manager multi-tenant: 1 TranslationBridge por (IGREJA, idioma), sob demanda.
// Derivado do v1 (live-translate/src/lib/session-manager.js), que tinha um manager
// global com Map chaveado só por idioma — aqui tudo que era global do processo
// (sourceLang, muted, presenças, contagem) passou a ser POR IGREJA.
// Idioma sem ouvinte cai após IDLE_TIMEOUT_SECONDS (custo zero).

import { TranslationBridge } from './translation-bridge.js';
import { CATALOGO } from './languages.js';
import { appendFileSync, mkdirSync } from 'node:fs';
import { gerarSermao } from './sermon-pdf.js';
import { churchLogo } from './tenant.js';

class SessionManager {
  constructor() {
    this.entries = new Map();   // `${churchId}:${lang}` → { bridge, vazioDesde, startedAt, maxTimer, churchId, lang }
    this.churches = new Map();  // churchId → { slug, room, sourceLang, muted, eventStartedAt }
    this.presencas = new Map(); // id do ouvinte → { churchId, lang, visto }
    try { mkdirSync('logs', { recursive: true }); } catch {}
    setInterval(() => this.varrer(), 5000).unref?.();
  }

  key(churchId, lang) { return `${churchId}:${lang}`; }

  /** Garante UMA ponte gravando a fala do orador por igreja (base do PDF do sermão). */
  garantirEscriba(churchId) {
    const daIgreja = [...this.entries.values()].filter(e => e.churchId === churchId);
    if (daIgreja.some(e => e.bridge.escriba && e.bridge.running !== false)) return;
    const nova = daIgreja.find(e => e.bridge.running !== false);
    if (nova) nova.bridge.escriba = true;
  }

  /** Estado da igreja (criado na primeira vez que alguém a toca). */
  igreja(church) {
    let c = this.churches.get(church.id);
    if (!c) {
      c = { slug: church.slug, room: church.room, sourceLang: church.speakerLang || 'en', muted: false, eventStartedAt: null };
      this.churches.set(church.id, c);
    } else {
      c.room = church.room || c.room;         // mantém em dia se o cadastro mudar
      c.slug = church.slug || c.slug;
    }
    return c;
  }

  logCusto(church, line) {
    // minutos/custo NUNCA vão para a tela — só log e relatório final (decisão de 04/08)
    try { appendFileSync('logs/custo.log', `${new Date().toISOString()} [${church.slug}] ${line}\n`); } catch {}
  }

  setSource(church, lang) {
    if (!CATALOGO.some(l => l.code === lang)) throw new Error(`invalid language: ${lang}`);
    const c = this.igreja(church);
    c.sourceLang = lang;
    // ninguém pode "ouvir tradução" para o idioma que já está sendo falado
    if (this.entries.has(this.key(church.id, lang))) this.teardown(church.id, lang, 'virou o idioma do orador');
  }

  setMuted(church, muted) {
    const c = this.igreja(church);
    const mudou = c.muted !== !!muted;
    c.muted = !!muted;
    // Louvor: as pontes desta igreja param de publicar voz e passam a mandar a letra.
    for (const [k, e] of this.entries) {
      if (k.startsWith(`${church.id}:`)) e.bridge.worship = c.muted;
    }
    return mudou;
  }

  valid(church, lang) {
    const c = this.igreja(church);
    return lang !== c.sourceLang && CATALOGO.some(l => l.code === lang);
  }

  async request(church, lang) {
    if (!this.valid(church, lang)) throw new Error(`language not available: ${lang}`);
    const c = this.igreja(church);
    const k = this.key(church.id, lang);
    let e = this.entries.get(k);
    // ponte morta (reconexão desistiu, processo anterior, etc.) → descarta e recria
    if (e && e.bridge.running === false) {
      await this.teardown(church.id, lang, 'ponte morta detectada — recriando');
      e = null;
    }
    if (!e) {
      const bridge = new TranslationBridge(lang, {
        room: c.room,
        speakerIdentity: `organizador-${c.slug}`,
        tag: c.slug,
      });
      e = { bridge, vazioDesde: null, startedAt: Date.now(), churchId: church.id, lang };
      this.entries.set(k, e);
      this.garantirEscriba(church.id);
      c.eventStartedAt ??= Date.now();
      this.logCusto(c, `START ${lang}`);
      try {
        // teto de 20s: partida travada não pode prender o ouvinte em "Connecting..."
        await Promise.race([
          bridge.start(),
          new Promise((_, rej) => setTimeout(() => rej(new Error('translation engine took too long to start — please try again')), 20000)),
        ]);
      } catch (err) {
        this.entries.delete(k);
        bridge.stop().catch(() => {});
        throw err;
      }
      this.armarTravaDeGasto(church.id, lang, e);
    }
    e.vazioDesde = null;
    return e;
  }

  // PRESENÇA — cada ouvinte manda sinal de vida a cada poucos segundos (v1: contador
  // incremental dessincronizava quando o iPhone "saía" ao bloquear a tela).
  heartbeat(churchId, id, lang) {
    if (!id || !lang) return;
    this.presencas.set(id, { churchId, lang, visto: Date.now() });
    const e = this.entries.get(this.key(churchId, lang));
    if (e) e.vazioDesde = null;
  }

  contar(churchId, lang) {
    const limite = Date.now() - 15000; // sem sinal há 15s → considerado desconectado
    let n = 0;
    for (const p of this.presencas.values()) if (p.churchId === churchId && p.lang === lang && p.visto > limite) n++;
    return n;
  }

  release(id) { if (id) this.presencas.delete(id); }

  varrer() {
    const agora = Date.now(), limite = agora - 15000;
    for (const [id, p] of this.presencas) if (p.visto <= limite) this.presencas.delete(id);
    const idleMs = (Number(process.env.IDLE_TIMEOUT_SECONDS) || 120) * 1000;
    for (const [k, e] of this.entries) {
      const c = this.churches.get(e.churchId);
      // MUTE (louvor) = ponte NÃO cai por ociosidade — agora por igreja: o louvor de
      // uma igreja não pode segurar (nem derrubar) as pontes de outra.
      if (c?.muted) { e.vazioDesde = null; continue; }
      if (this.contar(e.churchId, e.lang) > 0) { e.vazioDesde = null; continue; }
      e.vazioDesde ??= agora;
      if (agora - e.vazioDesde > idleMs) this.teardown(e.churchId, e.lang, 'ocioso');
      void k;
    }
  }

  armarTravaDeGasto(churchId, lang, e) {
    const maxMin = Number(process.env.MAX_SESSION_MINUTES) || 180;
    e.maxTimer = setTimeout(() => this.teardown(churchId, lang, `trava de ${maxMin} min atingida`), maxMin * 60 * 1000);
  }

  async teardown(churchId, lang, motivo) {
    const k = this.key(churchId, lang);
    const e = this.entries.get(k);
    if (!e) return;
    this.entries.delete(k);
    clearTimeout(e.maxTimer);
    const minutos = ((Date.now() - e.startedAt) / 60000).toFixed(1);
    const c = this.churches.get(churchId) || { slug: String(churchId) };
    this.logCusto(c, `STOP ${lang} minutos=${minutos} motivo="${motivo}"`);
    await e.bridge.stop();
    this.garantirEscriba(churchId);   // se a escriba caiu, outra ponte assume
  }

  status(church) {
    const c = this.igreja(church);
    // ouvintes veem o catálogo MENOS o idioma que está sendo falado
    const alvos = CATALOGO.filter(l => l.code !== c.sourceLang);
    return {
      church: { slug: c.slug, name: church.name ?? null },
      languages: alvos,
      catalogo: CATALOGO,
      sourceLang: c.sourceLang,
      muted: c.muted,
      active: alvos.map(({ code }) => {
        const e = this.entries.get(this.key(church.id, code));
        return {
          lang: code,
          listeners: this.contar(church.id, code),
          traduzindo: !!e,
          firstLatencyMs: e?.bridge.stats.firstLatencyMs ?? null,
          geminiReconnects: e?.bridge.stats.geminiReconnects ?? 0,
        };
      }),
    };
  }

  async stopAll(churchId, nomeIgreja) {
    for (const [, e] of [...this.entries]) {
      if (e.churchId === churchId) await this.teardown(churchId, e.lang, 'encerrado pelo operador');
    }
    const c = this.churches.get(churchId);
    if (c) { c.muted = false; c.eventStartedAt = null; }

    // Fim do culto: o PDF do sermão sai sozinho, do original e de cada idioma.
    try {
      // logo no cabeçalho do PDF — se o bucket falhar, o PDF sai sem logo, nunca deixa de sair
      const logo = await churchLogo(c?.slug).catch(() => null);
      const feitos = gerarSermao(c?.slug ?? String(churchId), nomeIgreja ?? c?.slug ?? '', undefined, logo);
      for (const f of feitos) this.logCusto(c ?? { slug: churchId }, `PDF ${f.lang} paginas=${f.paginas} palavras=${f.palavras} -> ${f.arquivo}`);
      return feitos;
    } catch (e) {
      this.logCusto(c ?? { slug: churchId }, `PDF FALHOU: ${e?.message ?? e}`);
      return [];
    }
  }
}

export const manager = (globalThis.__ltManager ??= new SessionManager());
