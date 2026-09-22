// HTML → PDF pelo Chromium que JÁ existe no servidor, conversando direto pelo
// protocolo de depuração (CDP) via pipe — sem Puppeteer/Playwright, sem porta de rede.
//
// Por que existe (22/09/2026): o gerador escrito à mão (sermon-pdf.js) usa as fontes
// base do PDF, que só cobrem o alfabeto latino — chinês, hindi e russo saíam "????",
// e o vietnamita perdia os acentos de tom. O hindi ainda exige COMPOSIÇÃO de texto
// (a vogal "ि" é desenhada antes da consoante; letras se fundem em conjuntos), coisa
// que só um motor de verdade faz. O Chromium faz, e as fontes estão no sistema.
//
// Protocolo pipe: o Chromium lê comandos no fd 3 e escreve respostas no fd 4, cada
// mensagem JSON terminada por '\0'.

import { spawn } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';

// Ordem de preferência. O headless_shell não é snap (sobe rápido, sem confinamento);
// o snap funciona também, porque o HTML entra e o PDF sai pelo pipe — ele não precisa
// ler nem gravar arquivo nenhum.
const CANDIDATOS = [
  process.env.PDF_CHROMIUM,
  '/root/.cache/ms-playwright/chromium_headless_shell-1148/chrome-linux/headless_shell',
  '/usr/bin/chromium-browser',
  '/snap/bin/chromium',
  '/usr/bin/chromium',
].filter(Boolean);

export function acharChromium() {
  return CANDIDATOS.find(p => existsSync(p)) ?? null;
}

/**
 * Renderiza `html` e devolve o PDF (Buffer).
 * O tamanho da página e as margens vêm do `@page` do próprio HTML.
 * `rodape` (opcional) = HTML do rodapé; aceita <span class="pageNumber"> e <span class="totalPages">.
 */
export async function htmlParaPdf(html, { rodape = null, timeoutMs = 90_000 } = {}) {
  const bin = acharChromium();
  if (!bin) throw new Error('chromium não encontrado no servidor');

  const perfil = `/tmp/lt-pdf-${process.pid}-${Date.now()}`;
  const proc = spawn(bin, [
    '--headless', '--remote-debugging-pipe', '--no-sandbox', '--disable-gpu',
    '--disable-dev-shm-usage', '--no-first-run', '--no-default-browser-check',
    '--hide-scrollbars', '--mute-audio', `--user-data-dir=${perfil}`, 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] });

  const escrita = proc.stdio[3];
  const leitura = proc.stdio[4];
  // ⚠️ Este código roda DENTRO do processo das pontes de tradução ao vivo. Erro de
  // stream sem ouvinte (EPIPE ao escrever num Chromium que já saiu) ou promessa
  // rejeitada sem .catch derrubam o processo inteiro no Node 22 — e o áudio de todo
  // mundo junto. Por isso cada stream tem 'error' tratado e cada promessa tem .catch.
  escrita.on('error', () => {});
  leitura.on('error', () => {});
  proc.stderr.on('error', () => {});
  let stderr = '';
  proc.stderr.on('data', d => { if (stderr.length < 4000) stderr += d; });

  let seq = 0;
  const pendentes = new Map();
  let resto = '';
  leitura.on('data', chunk => {
    resto += chunk.toString('utf8');
    let i;
    while ((i = resto.indexOf('\0')) >= 0) {
      const bruto = resto.slice(0, i);
      resto = resto.slice(i + 1);
      let msg;
      try { msg = JSON.parse(bruto); } catch { continue; }
      if (msg.id && pendentes.has(msg.id)) {
        const { ok, falha } = pendentes.get(msg.id);
        pendentes.delete(msg.id);
        if (msg.error) falha(new Error(`${msg.error.message} (${msg.error.code})`));
        else ok(msg.result);
      }
    }
  });

  let encerrado = false;
  const cmd = (method, params = {}, sessionId) => new Promise((ok, falha) => {
    if (encerrado) return falha(new Error('chromium já encerrado'));
    const id = ++seq;
    pendentes.set(id, { ok, falha });
    escrita.write(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }) + '\0');
  });
  const abortarPendentes = motivo => {
    encerrado = true;
    for (const { falha } of pendentes.values()) falha(new Error(motivo));
    pendentes.clear();
  };

  const morreu = new Promise((_, falha) => {
    proc.on('error', e => { abortarPendentes('chromium não iniciou'); falha(new Error(`chromium não iniciou: ${e.message}`)); });
    proc.on('exit', code => { abortarPendentes('chromium saiu'); falha(new Error(`chromium saiu (código ${code}): ${stderr.trim().slice(-300)}`)); });
  });
  morreu.catch(() => {});   // a saída NORMAL (depois do Browser.close) também rejeita — não pode vazar
  let relogio;
  const estourou = new Promise((_, falha) => {
    relogio = setTimeout(() => falha(new Error(`chromium não respondeu em ${timeoutMs / 1000}s`)), timeoutMs);
  });
  estourou.catch(() => {});

  const trabalho = (async () => {
    const { targetId } = await cmd('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await cmd('Target.attachToTarget', { targetId, flatten: true });
    await cmd('Page.enable', {}, sessionId);
    const { frameTree } = await cmd('Page.getFrameTree', {}, sessionId);
    await cmd('Page.setDocumentContent', { frameId: frameTree.frame.id, html }, sessionId);
    // espera as fontes e a imagem do logo (data URI) antes de imprimir
    await cmd('Runtime.evaluate', {
      expression: 'Promise.all([document.fonts.ready, ...[...document.images].map(i => i.decode().catch(() => {}))]).then(() => true)',
      awaitPromise: true,
    }, sessionId);
    const { data } = await cmd('Page.printToPDF', {
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: !!rodape,
      headerTemplate: '<span></span>',
      footerTemplate: rodape ?? '<span></span>',
    }, sessionId);
    return Buffer.from(data, 'base64');
  })();
  trabalho.catch(() => {});

  try {
    return await Promise.race([trabalho, morreu, estourou]);
  } finally {
    clearTimeout(relogio);
    const saiu = proc.exitCode !== null ? Promise.resolve() : new Promise(r => proc.once('exit', r));
    try { await Promise.race([cmd('Browser.close').catch(() => {}), new Promise(r => setTimeout(r, 1500))]); } catch { /* já caiu */ }
    // só apaga o perfil depois que o processo SAIU — antes disso ele ainda grava lá dentro
    // (ENOTEMPTY no teste de 22/09) e sobraria uma pasta no /tmp a cada culto
    if (!(await Promise.race([saiu.then(() => true), new Promise(r => setTimeout(() => r(false), 3000))]))) {
      try { proc.kill('SIGKILL'); } catch { /* já saiu */ }
      await Promise.race([saiu, new Promise(r => setTimeout(r, 2000))]);
    }
    try { rmSync(perfil, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 }); } catch { /* sobra no /tmp; o sistema limpa no boot */ }
  }
}
