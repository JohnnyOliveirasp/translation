// Gera token de acesso à sala LiveKit.
// ouvinte: só escuta. operador: exige senha e pode publicar o microfone.

import { AccessToken } from 'livekit-server-sdk';
import { NextResponse } from 'next/server';

export async function POST(req) {
  const { role, password } = await req.json();

  let identity, canPublish;
  if (role === 'operador') {
    if (password !== process.env.BROADCAST_PASSWORD) {
      return NextResponse.json({ error: 'wrong password' }, { status: 401 });
    }
    identity = 'organizador';
    canPublish = true;
  } else {
    identity = `ouvinte-${Math.random().toString(36).slice(2, 10)}`;
    canPublish = false;
  }

  const at = new AccessToken(process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET, { identity, ttl: '6h' });
  at.addGrant({
    room: process.env.ROOM_NAME || 'culto',
    roomJoin: true,
    canPublish,
    canSubscribe: true,
    canPublishData: true, // sem isso o livekit-client abre data channels e o servidor corta (erro no console)
  });

  // o cliente descobre o servidor pela própria origem quando LIVEKIT_URL é relativo à VPS
  return NextResponse.json({ token: await at.toJwt(), url: process.env.LIVEKIT_URL, identity });
}
