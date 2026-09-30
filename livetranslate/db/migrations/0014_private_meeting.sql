-- 0014 — Reunião privada (30/09/2026)
-- Pedido do Brett (Redeem): o Celebrate Recovery das segundas é confidencial. Com a opção ligada
-- a tradução acontece ao vivo normalmente, mas NADA fica guardado: sem transcrição em disco,
-- sem PDF do sermão, sem e-mail depois do culto e sem inscrição de e-mail na página do ouvinte.
-- A igreja liga/desliga em Configurações (admin da igreja — coluna comum, a RLS de churches já permite).

alter table public.churches
  add column if not exists private_mode boolean not null default false;

-- o ouvinte precisa saber (para esconder a caixa de e-mail) e a API também (para não gravar):
-- mesmo retorno da 0009 + private_mode no fim. Mudou o tipo de retorno → drop + create.
drop function if exists public.church_public(text);
create function public.church_public(p_slug text)
returns table (name text, logo_path text, logo_is_light boolean, speaker_lang text, livekit_room text, languages text[], private_mode boolean)
language sql security definer stable set search_path = '' as $$
  select c.name, c.logo_path, c.logo_is_light, c.speaker_lang, c.livekit_room,
         coalesce(array_agg(l.lang_code order by l.lang_code) filter (where l.enabled and not l.blocked_by_platform), '{}'),
         c.private_mode
  from public.churches c
  left join public.church_languages l on l.church_id = c.id
  where c.slug = lower(p_slug) and c.status in ('trial', 'active')
  group by c.id;
$$;
grant execute on function public.church_public(text) to anon, authenticated;

-- reunião privada não coleta e-mail de ouvinte (mesmo que alguém chame o RPC direto)
create or replace function public.subscribe_listener(p_slug text, p_email text, p_lang text, p_consent boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare v_church bigint; v_private boolean;
begin
  select id, private_mode into v_church, v_private from public.churches where slug = lower(p_slug) and status in ('trial', 'active');
  if v_church is null then raise exception 'church not found'; end if;
  if v_private then raise exception 'private meeting'; end if;
  insert into public.listener_emails (church_id, email, lang_code, consent_marketing)
  values (v_church, lower(p_email), p_lang, p_consent)
  on conflict (church_id, email) do update
    set lang_code = excluded.lang_code,
        consent_marketing = excluded.consent_marketing,
        unsubscribed_at = null;
end $$;
grant execute on function public.subscribe_listener(text, text, text, boolean) to anon, authenticated;
