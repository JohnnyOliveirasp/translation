-- 0010 — Stripe com DUAS contas (US = JC Business Solutions USA, BR = LiveTranslate Brasil) (22/09/2026)
-- Aplicada no projeto yrqtncjkwfrgwecyxkmc via MCP (apply_migration). HANDOFF §23.
-- O webhook grava com service_role (api/src/lib/db-admin.js); o painel da igreja só lê.

-- 1) assinatura da igreja
alter table public.churches
  add column if not exists stripe_account         text check (stripe_account in ('us', 'br')),
  add column if not exists stripe_subscription_id text unique,
  add column if not exists current_period_end     timestamptz,
  add column if not exists cancel_at_period_end   boolean not null default false;

-- 2) eventos do Stripe já processados (idempotência do webhook — padrão payment_events do PlatformLucasArrial)
create table if not exists public.billing_events (
  id           bigint generated always as identity primary key,
  provider     text not null check (provider in ('stripe_us', 'stripe_br')),
  event_id     text not null,
  type         text not null,
  church_id    bigint references public.churches (id) on delete set null,
  payload      jsonb,
  processed_at timestamptz,
  error        text,
  created_at   timestamptz not null default now(),
  unique (provider, event_id)
);
create index if not exists billing_events_church_idx on public.billing_events (church_id, created_at desc);
alter table public.billing_events enable row level security;
drop policy if exists billing_events_platform on public.billing_events;
create policy billing_events_platform on public.billing_events for select to authenticated
  using ((select private.is_platform_admin()));

-- 3) pagamentos recebidos (alimenta o "Entrou" do painel da plataforma e a aba Assinatura da igreja)
create table if not exists public.payments (
  id           bigint generated always as identity primary key,
  church_id    bigint not null references public.churches (id) on delete cascade,
  provider     text not null check (provider in ('stripe_us', 'stripe_br')),
  invoice_id   text not null unique,
  amount_cents integer not null,
  currency     text not null check (currency in ('usd', 'brl')),
  paid_at      timestamptz not null,
  period_start timestamptz,
  period_end   timestamptz,
  hosted_url   text,
  created_at   timestamptz not null default now()
);
create index if not exists payments_church_paid_idx on public.payments (church_id, paid_at desc);
create index if not exists payments_paid_idx on public.payments (paid_at desc);
alter table public.payments enable row level security;
drop policy if exists payments_select on public.payments;
create policy payments_select on public.payments for select to authenticated
  using ((select private.is_church_admin(church_id)) or (select private.is_platform_admin()));

-- 4) preços dos planos para a aba Assinatura da igreja (platform_settings é só do admin; esta RPC expõe SÓ os preços)
create or replace function public.plan_prices()
returns jsonb language sql security definer stable set search_path = '' as $$
  select coalesce((select value from public.platform_settings where key = 'plan_prices'), '{}'::jsonb);
$$;
grant execute on function public.plan_prices() to anon, authenticated;
