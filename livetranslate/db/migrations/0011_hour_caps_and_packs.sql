-- 0011 — Teto de horas-idioma por plano + pacotes extras de horas (22/09/2026)
-- Aplicada no projeto yrqtncjkwfrgwecyxkmc via MCP (apply_migration). HANDOFF §24.
--
-- "hora-idioma" = 1 hora de UM idioma traduzido (o que custa Gemini). Um culto real da Redeem
-- gasta 2–2,5. O plano inclui X horas/mês (platform_settings.plan_hours); acima disso a igreja
-- consome pacotes (comprados no Stripe ou dados pelo Johnny); sem pacote e além da tolerância,
-- a API não abre idioma novo até o mês virar.

-- 1) configurações (editáveis em /platform → Costs & prices)
insert into public.platform_settings (key, value) values
  ('plan_hours',        '{"starter":12,"growth":30,"congregation":null}'),   -- null = sem teto
  ('hour_pack',         '{"hours":10,"usd":3900,"brl":19900,"valid_months":3}'),
  ('overage_tolerance', '0.2')                                               -- 20% além do teto ainda passa
on conflict (key) do nothing;

-- 2) pacotes de horas (comprados ou cortesia da plataforma)
create table if not exists public.hour_packs (
  id          bigint generated always as identity primary key,
  church_id   bigint not null references public.churches (id) on delete cascade,
  hours       numeric(8,2) not null check (hours > 0),
  hours_used  numeric(8,2) not null default 0 check (hours_used >= 0),
  source      text not null check (source in ('stripe_us', 'stripe_br', 'platform')),
  reference   text unique,                 -- checkout session (Stripe) — idempotência
  note        text,
  granted_by  uuid references auth.users (id) on delete set null,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now()
);
create index if not exists hour_packs_church_idx on public.hour_packs (church_id, expires_at);
alter table public.hour_packs enable row level security;
drop policy if exists hour_packs_select on public.hour_packs;
create policy hour_packs_select on public.hour_packs for select to authenticated
  using ((select private.is_member(church_id)) or (select private.is_platform_admin()));

-- 3) avisos de uso já enviados (para não repetir o e-mail de 80% / 100% no mesmo mês)
alter table public.churches
  add column if not exists usage_alert_month text,          -- 'AAAA-MM'
  add column if not exists usage_alert_level integer not null default 0;   -- 0 | 80 | 100

-- 4) horas-idioma usadas no mês corrente (UTC) — a mesma conta que a API faz
create or replace function public.church_hours_month(p_church bigint, p_month date default date_trunc('month', now())::date)
returns numeric language sql stable security definer set search_path = '' as $$
  select coalesce(sum(l.minutes), 0) / 60.0
  from public.services s
  join public.service_languages l on l.service_id = s.id
  where s.church_id = p_church
    and s.started_at >= date_trunc('month', p_month::timestamptz)
    and s.started_at <  date_trunc('month', p_month::timestamptz) + interval '1 month';
$$;
revoke execute on function public.church_hours_month(bigint, date) from public, anon;
grant execute on function public.church_hours_month(bigint, date) to authenticated;

-- 5) resumo para a aba Assinatura / painel: usadas, teto do plano, horas de pacote restantes
create or replace function public.usage_summary(p_church bigint)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_plan text; v_cap numeric; v_used numeric; v_packs numeric; v_tol numeric;
begin
  if not ((select private.is_member(p_church)) or (select private.is_platform_admin())) then
    raise exception 'not a member';
  end if;
  select plan into v_plan from public.churches where id = p_church;
  select nullif(value -> v_plan, 'null')::numeric into v_cap from public.platform_settings where key = 'plan_hours';
  select coalesce(value::numeric, 0.2) into v_tol from public.platform_settings where key = 'overage_tolerance';
  v_used := public.church_hours_month(p_church);
  select coalesce(sum(hours - hours_used), 0) into v_packs
    from public.hour_packs where church_id = p_church and expires_at > now() and hours_used < hours;
  return jsonb_build_object(
    'plan', v_plan, 'cap_hours', v_cap, 'used_hours', round(v_used, 2), 'pack_hours_left', round(v_packs, 2),
    'tolerance', v_tol,
    'blocked', case when v_cap is null then false else v_used >= v_cap * (1 + v_tol) + v_packs end
  );
end $$;
revoke execute on function public.usage_summary(bigint) from public, anon;
grant execute on function public.usage_summary(bigint) to authenticated;

-- 6) Johnny dá horas extras (cortesia) pelo painel da plataforma
create or replace function public.platform_grant_hours(p_church bigint, p_hours numeric, p_note text default null, p_months integer default 3)
returns bigint language plpgsql security definer set search_path = '' as $$
declare v_id bigint;
begin
  if not (select private.is_platform_admin()) then raise exception 'platform admin only'; end if;
  if p_hours is null or p_hours <= 0 then raise exception 'hours must be positive'; end if;
  insert into public.hour_packs (church_id, hours, source, note, granted_by, expires_at)
  values (p_church, p_hours, 'platform', nullif(trim(coalesce(p_note, '')), ''), (select auth.uid()), now() + make_interval(months => greatest(1, coalesce(p_months, 3))))
  returning id into v_id;
  return v_id;
end $$;
revoke execute on function public.platform_grant_hours(bigint, numeric, text, integer) from public, anon;
grant execute on function public.platform_grant_hours(bigint, numeric, text, integer) to authenticated;

-- 7) configuração do pacote de horas para a aba Assinatura (só o pacote, nunca o resto das settings)
create or replace function public.hour_pack_config()
returns jsonb language sql security definer stable set search_path = '' as $$
  select coalesce((select value from public.platform_settings where key = 'hour_pack'), '{}'::jsonb);
$$;
grant execute on function public.hour_pack_config() to anon, authenticated;
