-- 0005 — Logo claro (texto branco sobre transparente) precisa de fundo escuro (28/08/2026)
-- Aplicada no projeto yrqtncjkwfrgwecyxkmc via MCP.
alter table public.churches add column if not exists logo_is_light boolean not null default false;

drop function if exists public.church_public(text);
create function public.church_public(p_slug text)
returns table (name text, logo_path text, logo_is_light boolean, speaker_lang text, languages text[])
language sql security definer stable set search_path = '' as $$
  select c.name, c.logo_path, c.logo_is_light, c.speaker_lang,
         coalesce(array_agg(l.lang_code order by l.lang_code) filter (where l.enabled), '{}')
  from public.churches c
  left join public.church_languages l on l.church_id = c.id
  where c.slug = lower(p_slug) and c.status in ('trial', 'active')
  group by c.id;
$$;
grant execute on function public.church_public(text) to anon, authenticated;
