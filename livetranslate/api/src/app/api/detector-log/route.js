// POST → lotes do detector de louvor (Worship Sense) da página de broadcast.
// Herdado da POC3 (/api/poc3-log): o CSV baixado no aparelho do operador se perdia
// no reload, então o dado vai para o servidor, onde a análise acontece.
// Agora POR IGREJA: logs/detector-{slug}-AAAAMMDD.log, e sem senha — quem grava
// precisa ser membro da igreja (mesmo login do painel).
//
// Linha: hora;fala;musica;top1;estado;modo;mutado   (scores CRUS, para recalibrar)
// Retenção: arquivos com mais de DETECTOR_LOG_DAYS dias (padrão 30) são apagados
// na primeira gravação do dia.

import { NextResponse } from 'next/server';
import { appendFileSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { requireMember } from '@/lib/tenant';

const DIR = 'logs';
const RETENCAO_DIAS = Number(process.env.DETECTOR_LOG_DAYS) || 30;

function limparAntigos() {
  const hoje = new Date().toISOString().slice(0, 10);
  if (globalThis.__ltLogLimpezaDia === hoje) return; // 1× por dia por processo
  globalThis.__ltLogLimpezaDia = hoje;
  try {
    const limite = Date.now() - RETENCAO_DIAS * 24 * 3600 * 1000;
    for (const f of readdirSync(DIR)) {
      if (!/^detector-.+-\d{8}\.log$/.test(f)) continue; // só os nossos — nunca custo/sessao
      if (statSync(`${DIR}/${f}`).mtimeMs < limite) unlinkSync(`${DIR}/${f}`);
    }
  } catch {}
}

export async function POST(req) {
  let body;
  try { body = await req.json(); } catch { body = {}; }
  if (!body.slug) return NextResponse.json({ error: 'missing slug' }, { status: 400 });

  const auth = await requireMember(req, body.slug);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const rows = Array.isArray(body.rows) ? body.rows.slice(0, 2000) : [];
  const linhas = rows
    .filter(r => typeof r === 'string' && r.length <= 300)
    .map(r => r.replace(/[\r\n]/g, ' '));
  if (!linhas.length) return NextResponse.json({ ok: true, gravadas: 0 });

  const dia = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const safeSlug = auth.church.slug.replace(/[^a-z0-9-]/g, '');
  try {
    mkdirSync(DIR, { recursive: true });
    appendFileSync(`${DIR}/detector-${safeSlug}-${dia}.log`, linhas.join('\n') + '\n');
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
  limparAntigos();
  return NextResponse.json({ ok: true, gravadas: linhas.length });
}
