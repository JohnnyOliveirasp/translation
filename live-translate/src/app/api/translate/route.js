// GET  → idiomas disponíveis + status das sessões ativas (sem custo — decisão de 04/08)
// POST → { lang, action: 'request' | 'release' | 'stop-all' }
//        request: garante bridge do idioma e conta o ouvinte
//        release: decrementa; sem ouvintes → teardown por ociosidade
//        stop-all: encerra tudo (botão Encerrar do /broadcast, exige senha)

import { NextResponse } from 'next/server';
import { manager } from '@/lib/session-manager';

export async function GET() {
  return NextResponse.json({ ...manager.status(), publicUrl: process.env.PUBLIC_URL || null });
}

export async function POST(req) {
  let body;
  try { body = await req.json(); } catch { body = {}; }
  const { lang, langs, action, password, id } = body;

  try {
    if (action === 'request') {
      await manager.request(lang);
      manager.heartbeat(id, lang);
      return NextResponse.json({ ok: true });
    }
    if (action === 'release') {
      manager.release(lang, id);
      return NextResponse.json({ ok: true });
    }
    // sinal de vida do ouvinte: mantém a contagem correta e devolve o status na mesma volta
    if (action === 'heartbeat') {
      manager.heartbeat(id, lang);
      return NextResponse.json(manager.status());
    }
    if (action === 'set-source') {
      if (password !== process.env.BROADCAST_PASSWORD) {
        return NextResponse.json({ error: 'wrong password' }, { status: 401 });
      }
      manager.setSource(lang);
      return NextResponse.json({ ok: true, sourceLang: manager.sourceLang });
    }
    if (action === 'set-mute') {
      if (password !== process.env.BROADCAST_PASSWORD) {
        return NextResponse.json({ error: 'wrong password' }, { status: 401 });
      }
      manager.muted = !!body.muted;
      return NextResponse.json({ ok: true, muted: manager.muted });
    }
    if (action === 'stop-all') {
      if (password !== process.env.BROADCAST_PASSWORD) {
        return NextResponse.json({ error: 'wrong password' }, { status: 401 });
      }
      await manager.stopAll();
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: 'invalid action' }, { status: 400 });
  } catch (e) {
    console.error('[api/translate]', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
