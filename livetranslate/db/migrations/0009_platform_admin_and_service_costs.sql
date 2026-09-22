-- 0009 — Painel da plataforma + registro de cultos/custo + país da igreja (22/09/2026)
-- Aplicada no projeto yrqtncjkwfrgwecyxkmc via MCP (apply_migration). Ver HANDOFF seção 22.

-- 1) Johnny é o admin da plataforma (a tabela existe desde a 0001 e estava vazia).
insert into public.platform_admins (user_id)
select id from auth.users where lower(email) = 'johnny.oliveirasp@gmail.com'
on conflict (user_id) do nothing;

-- 2) Igreja: país (a MOEDA é decidida pelo país — decisão de 22/09) e moeda de cobrança.
alter table public.churches
  add column if not exists country          text check (country ~ '^[A-Z]{2}$'),
  add column if not exists billing_currency text not null default 'usd' check (billing_currency in ('usd', 'brl'));
update public.churches set country = 'US' where slug = 'redeem-community-church' and country is null;

-- create_church passa a receber o país; BR → brl, resto → usd.
drop function if exists public.create_church(text, text, text, text[]);
create or replace function public.create_church(
  p_name text, p_slug text, p_speaker_lang text default 'en',
  p_languages text[] default array['es','pt-BR'], p_country text default null)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_id  bigint;
  v_country text := nullif(upper(trim(coalesce(p_country, ''))), '');
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  insert into public.churches (name, slug, speaker_lang, livekit_room, trial_ends_at, country, billing_currency)
  values (p_name, lower(p_slug), p_speaker_lang, 'church-' || lower(p_slug), now() + interval '1 month',
          v_country, case when v_country = 'BR' then 'brl' else 'usd' end)
  returning id into v_id;
  insert into public.memberships (user_id, church_id, role) values (v_uid, v_id, 'admin');
  insert into public.church_languages (church_id, lang_code)
  select v_id, unnest(p_languages);
  return v_id;
end $$;
revoke execute on function public.create_church(text, text, text, text[], text) from public, anon;
grant execute on function public.create_church(text, text, text, text[], text) to authenticated;

-- 3) Idioma bloqueado PELA PLATAFORMA (Johnny corta um idioma caro de uma igreja).
--    A igreja continua vendo o idioma na aba Languages, marcado como bloqueado, e não consegue destravar.
alter table public.church_languages
  add column if not exists blocked_by_platform boolean not null default false;

create or replace function private.guard_platform_block()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.blocked_by_platform is distinct from old.blocked_by_platform
     and not (select private.is_platform_admin()) then
    raise exception 'only the platform admin can block or unblock a language';
  end if;
  return new;
end $$;
drop trigger if exists church_languages_platform_block on public.church_languages;
create trigger church_languages_platform_block before update on public.church_languages
  for each row execute function private.guard_platform_block();

-- o ouvinte não vê idioma bloqueado (RPC público; mesmo retorno da 0006)
create or replace function public.church_public(p_slug text)
returns table (name text, logo_path text, logo_is_light boolean, speaker_lang text, livekit_room text, languages text[])
language sql security definer stable set search_path = '' as $$
  select c.name, c.logo_path, c.logo_is_light, c.speaker_lang, c.livekit_room,
         coalesce(array_agg(l.lang_code order by l.lang_code) filter (where l.enabled and not l.blocked_by_platform), '{}')
  from public.churches c
  left join public.church_languages l on l.church_id = c.id
  where c.slug = lower(p_slug) and c.status in ('trial', 'active')
  group by c.id;
$$;
grant execute on function public.church_public(text) to anon, authenticated;

-- 4) Dias grátis dados pelo Johnny: histórico + RPC (estende trial_ends_at a partir de hoje ou da data atual, a maior).
create table if not exists public.platform_grants (
  id         bigint generated always as identity primary key,
  church_id  bigint not null references public.churches (id) on delete cascade,
  granted_by uuid references auth.users (id) on delete set null,
  days       integer not null check (days between -3650 and 3650),
  until_at   timestamptz not null,
  note       text,
  created_at timestamptz not null default now()
);
create index if not exists platform_grants_church_idx on public.platform_grants (church_id, created_at desc);
alter table public.platform_grants enable row level security;
drop policy if exists platform_grants_admin on public.platform_grants;
create policy platform_grants_admin on public.platform_grants for select to authenticated
  using ((select private.is_platform_admin()));

create or replace function public.platform_grant_days(p_church bigint, p_days integer, p_note text default null)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare v_until timestamptz;
begin
  if not (select private.is_platform_admin()) then raise exception 'platform admin only'; end if;
  update public.churches
     set trial_ends_at = greatest(coalesce(trial_ends_at, now()), now()) + make_interval(days => p_days),
         status = case when status = 'past_due' then 'trial' else status end
   where id = p_church
   returning trial_ends_at into v_until;
  if v_until is null then raise exception 'church not found'; end if;
  insert into public.platform_grants (church_id, granted_by, days, until_at, note)
  values (p_church, (select auth.uid()), p_days, v_until, nullif(trim(coalesce(p_note, '')), ''));
  return v_until;
end $$;
revoke execute on function public.platform_grant_days(bigint, integer, text) from public, anon;
grant execute on function public.platform_grant_days(bigint, integer, text) to authenticated;

-- 5) Configurações da plataforma (tarifa da estimativa de gasto, custos fixos, preços) — SÓ platform admin.
create table if not exists public.platform_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);
drop trigger if exists platform_settings_updated_at on public.platform_settings;
create trigger platform_settings_updated_at before update on public.platform_settings
  for each row execute function private.set_updated_at();
alter table public.platform_settings enable row level security;
drop policy if exists platform_settings_admin on public.platform_settings;
create policy platform_settings_admin on public.platform_settings for all to authenticated
  using ((select private.is_platform_admin())) with check ((select private.is_platform_admin()));
insert into public.platform_settings (key, value) values
  -- calibrada em 22/09 com a fatura real: 06/09 = 118,6 min de ponte → US$6,70; 13/09 = 143,4 min → US$5,70
  ('cost_per_lang_minute_usd', '0.05'),
  ('fixed_costs_usd_month',    '{"hetzner":0,"supabase":0,"livekit":0,"resend":0,"cloudflare":0,"other":0}'),
  ('plan_prices',              '{"starter":{"usd":7990,"brl":null},"growth":{"usd":13900,"brl":null}}'),
  ('usd_brl',                  '5.5')
on conflict (key) do nothing;

-- 6) Custo por culto: tokens informados pelo Gemini (informativo) e a tarifa usada na estimativa.
alter table public.service_costs
  add column if not exists tokens_in           bigint not null default 0,
  add column if not exists tokens_out          bigint not null default 0,
  add column if not exists rate_usd_per_minute numeric(8,4);
