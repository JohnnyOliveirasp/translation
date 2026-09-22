-- 0012 — Limite de idiomas por igreja (override da plataforma) + trava de colunas de plano (22/09/2026)
-- Aplicada no projeto yrqtncjkwfrgwecyxkmc via MCP (apply_migration). HANDOFF §28.
--
-- Pedido do Johnny: enquanto a igreja está no período grátis (status = trial, sem assinatura),
-- o plano continua "starter" para ela, mas ELE pode liberar quantos idiomas quiser pelo /platform
-- (ligar/desligar idiomas e subir o limite). Quando a igreja assina, o webhook zera o override
-- e o limite volta a ser o do plano.

-- 1) override do limite (null = limite do plano em PLAN_LIMITS do site)
alter table public.churches
  add column if not exists language_limit integer
  check (language_limit is null or language_limit between 0 and 99);

-- 2) só a PLATAFORMA mexe em plan / language_limit / trial_ends_at.
--    A RLS de churches deixa o admin da igreja dar UPDATE em qualquer coluna (nome, orador…),
--    e sem esta trava ele poderia se promover a 'congregation' ou esticar o próprio trial.
--    service_role (webhook do Stripe, API) não tem auth.uid() → passa direto.
--    cancel_subscription()/resume_subscription() mexem só em `status` → não são afetadas.
create or replace function private.guard_church_plan_columns()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then return new; end if;
  if (new.plan, new.language_limit, new.trial_ends_at) is distinct from (old.plan, old.language_limit, old.trial_ends_at)
     and not (select private.is_platform_admin()) then
    raise exception 'platform admin only';
  end if;
  return new;
end $$;
revoke execute on function private.guard_church_plan_columns() from public, anon;

drop trigger if exists churches_guard_plan_columns on public.churches;
create trigger churches_guard_plan_columns before update on public.churches
  for each row execute function private.guard_church_plan_columns();
