// POST → recebe lotes do detector da POC3 (página /poc3/broadcast.html) e grava em
// logs/detector-AAAAMMDD.log — decisão de 24/08: o CSV baixado no aparelho do operador
// se perdia (reload da página apagava; ficou com o Johnny em 2 cultos seguidos).
// No servidor o dado fica onde a análise acontece, com retenção automática.
//
// Formato da linha (igual ao CSV antigo, scores CRUS para recalibragem):
//   hora;fala;musica;top1;estado;modo;mutado
// Retenção: arquivos detector-*.log com mais de POC3_LOG_DAYS dias (padrão 30) são
// apagados na primeira gravação de cada dia.

import { NextResponse } from 'next/server';
import { appendFileSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';

const DIR = 'logs';
const RETENCAO_DIAS = Number(process.env.POC3_LOG_DAYS) || 30;

function limparAntigos() {
  const hoje = new Date().toISOString().slice(0, 10);
  if (globalThis.__poc3LogLimpezaDia === hoje) return; // 1× por dia por processo
  globalThis.__poc3LogLimpezaDia = hoje;
  try {
    const limite = Date.now() - RETENCAO_DIAS * 24 * 3600 * 1000;
    for (const f of readdirSync(DIR)) {
      if (!/^detector-\d{8}\.log$/.test(f)) continue; // só os nossos — nunca custo/sessao
      if (statSync(`${DIR}/${f}`).mtimeMs < limite) unlinkSync(`${DIR}/${f}`);
    }
  } catch {}
}

export async function POST(req) {
  let body;
  try { body = await req.json(); } catch { body = {}; }
  if (body.password !== process.env.BROADCAST_PASSWORD) {
    return NextResponse.json({ error: 'wrong password' }, { status: 401 });
  }
  const rows = Array.isArray(body.rows) ? body.rows.slice(0, 2000) : [];
  const linhas = rows
    .filter(r => typeof r === 'string' && r.length <= 300)
    .map(r => r.replace(/[\r\n]/g, ' '));
  if (!linhas.length) return NextResponse.json({ ok: true, gravadas: 0 });

  const dia = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  try {
    mkdirSync(DIR, { recursive: true });
    appendFileSync(`${DIR}/detector-${dia}.log`, linhas.join('\n') + '\n');
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
  limparAntigos();
  return NextResponse.json({ ok: true, gravadas: linhas.length });
}
