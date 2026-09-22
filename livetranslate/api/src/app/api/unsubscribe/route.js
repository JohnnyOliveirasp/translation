// Descadastro do sermão por e-mail — o link que vai no rodapé de cada e-mail.
//   GET  /api/unsubscribe?t=<token>  → a pessoa clicou: descadastra e mostra uma página no idioma dela
//   POST /api/unsubscribe?t=<token>  → "descadastrar em um clique" do Gmail/Yahoo (RFC 8058)
// Anônimo de propósito: o token (uuid aleatório, um por inscrito) é a credencial.

import { descadastrar, paginaDescadastro } from '@/lib/sermon-mail';

const html = (corpo, status = 200) =>
  new Response(corpo, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });

export async function GET(req) {
  const t = new URL(req.url).searchParams.get('t');
  try {
    const res = await descadastrar(t);
    return html(paginaDescadastro(res), res ? 200 : 404);
  } catch {
    return html(paginaDescadastro(null), 500);
  }
}

export async function POST(req) {
  const t = new URL(req.url).searchParams.get('t');
  try {
    const res = await descadastrar(t);
    return new Response(res ? 'unsubscribed' : 'not found', { status: res ? 200 : 404 });
  } catch {
    return new Response('error', { status: 500 });
  }
}
