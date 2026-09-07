-- 0006 — church_public passa a devolver livekit_room (28/08/2026)
-- O ouvinte anônimo precisa saber em qual sala LiveKit entrar. O nome da sala não é
-- segredo (o acesso vem do token assinado pelo servidor), então entra no RPC público.
drop function if exists public.church_public(text);
create function public.church_public(p_slug text)
returns table (name text, logo_path text, logo_is_light boolean, speaker_lang text, livekit_room text, languages text[])
language sql security definer stable set search_path = '' as $$
  select c.name, c.logo_path, c.logo_is_light, c.speaker_lang, c.livekit_room,
         coalesce(array_agg(l.lang_code order by l.lang_code) filter (where l.enabled), '{}')
  from public.churches c
  left join public.church_languages l on l.church_id = c.id
  where c.slug = lower(p_slug) and c.status in ('trial', 'active')
  group by c.id;
$$;
grant execute on function public.church_public(text) to anon, authenticated;
