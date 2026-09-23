// Sermões em PDF gerados no fim de cada culto.
//   GET /api/sermons?slug=...              → lista o que existe (data, idioma, tamanho)
//   GET /api/sermons?slug=...&file=...pdf  → baixa um PDF
// Só membro da igreja: o sermão é conteúdo dela, não fica público.

import { readdirSync, statSync, existsSync, readFileSync } from 'node:fs';
import { requireMember, slugAliases } from '@/lib/tenant';

const json = (data, status = 200) => Response.json(data, { status });

export async function GET(req) {
  const url = new URL(req.url);
  const slug = url.searchParams.get('slug');
  const file = url.searchParams.get('file');
  if (!slug) return json({ error: 'missing slug' }, 400);

  const auth = await requireMember(req, slug);
  if (auth.error) return json({ error: auth.error }, auth.status);

  // pasta do link atual + pastas dos links antigos (a igreja pode ter trocado o link — 0013)
  const dirs = [`sermons/${auth.church.slug}`, ...(await slugAliases(req, auth.church.id)).map(s => `sermons/${s}`)];

  if (file) {
    // nome vem da lista; ainda assim, nada de caminho — só o arquivo dentro da pasta
    if (!/^[0-9]{8}-[A-Za-z-]+\.pdf$/.test(file)) return json({ error: 'invalid file' }, 400);
    const caminho = dirs.map(d => `${d}/${file}`).find(c => existsSync(c));
    if (!caminho) return json({ error: 'not found' }, 404);
    return new Response(readFileSync(caminho), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="sermao-${auth.church.slug}-${file}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  }

  const vistos = new Set();
  const arquivos = [];
  for (const dir of dirs) {
    let nomes = [];
    try { nomes = readdirSync(dir); } catch { continue; }   // pasta ainda não existe: igreja sem culto encerrado
    for (const f of nomes) {
      if (!/^[0-9]{8}-[A-Za-z-]+\.pdf$/.test(f) || vistos.has(f)) continue;
      vistos.add(f);
      arquivos.push({ dir, f });
    }
  }
  const lista = arquivos
      .map(({ dir, f }) => {
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

  return json({ sermons: lista });
}
