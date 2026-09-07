// Sermões em PDF gerados no fim de cada culto.
//   GET /api/sermons?slug=...              → lista o que existe (data, idioma, tamanho)
//   GET /api/sermons?slug=...&file=...pdf  → baixa um PDF
// Só membro da igreja: o sermão é conteúdo dela, não fica público.

import { readdirSync, statSync, existsSync, readFileSync } from 'node:fs';
import { requireMember } from '@/lib/tenant';

const json = (data, status = 200) => Response.json(data, { status });

export async function GET(req) {
  const url = new URL(req.url);
  const slug = url.searchParams.get('slug');
  const file = url.searchParams.get('file');
  if (!slug) return json({ error: 'missing slug' }, 400);

  const auth = await requireMember(req, slug);
  if (auth.error) return json({ error: auth.error }, auth.status);

  const dir = `sermons/${auth.church.slug}`;

  if (file) {
    // nome vem da lista; ainda assim, nada de caminho — só o arquivo dentro da pasta
    if (!/^[0-9]{8}-[A-Za-z-]+\.pdf$/.test(file)) return json({ error: 'invalid file' }, 400);
    const caminho = `${dir}/${file}`;
    if (!existsSync(caminho)) return json({ error: 'not found' }, 404);
    return new Response(readFileSync(caminho), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="sermao-${auth.church.slug}-${file}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  }

  let arquivos = [];
  try {
    arquivos = readdirSync(dir)
      .filter(f => /^[0-9]{8}-[A-Za-z-]+\.pdf$/.test(f))
      .map(f => {
        const [dia, resto] = f.split('-');
        const lang = resto.replace('.pdf', '') || f.slice(9, -4);
        const st = statSync(`${dir}/${f}`);
        return {
          file: f,
          date: `${dia.slice(0, 4)}-${dia.slice(4, 6)}-${dia.slice(6, 8)}`,
          lang: f.slice(9, -4),
          bytes: st.size,
          at: st.mtime.toISOString(),
          _ord: dia,
          _l: lang,
        };
      })
      .sort((a, b) => (b._ord.localeCompare(a._ord) || a.lang.localeCompare(b.lang)))
      .map(({ _ord, _l, ...r }) => r);
  } catch { /* pasta ainda não existe: igreja sem culto encerrado */ }

  return json({ sermons: arquivos });
}
