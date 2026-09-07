-- 0004 — Trial de 1 mês + cancelamento/reativação pelo admin da igreja (28/08/2026)
-- Aplicada no projeto yrqtncjkwfrgwecyxkmc via MCP (apply_migration).

-- Trial passa de 14 dias para 1 mês (decisão do Johnny).
create or replace function public.create_church(p_name text, p_slug text, p_speaker_lang text default 'en', p_languages text[] default array['es','pt-BR'])
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_id  bigint;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  insert into public.churches (name, slug, speaker_lang, livekit_room, trial_ends_at)
  values (p_name, lower(p_slug), p_speaker_lang, 'church-' || lower(p_slug), now() + interval '1 month')
  returning id into v_id;
  insert into public.memberships (user_id, church_id, role) values (v_uid, v_id, 'admin');
  insert into public.church_languages (church_id, lang_code)
  select v_id, unnest(p_languages);
  return v_id;
end $$;
revoke execute on function public.create_church(text, text, text, text[]) from public, anon;
grant execute on function public.create_church(text, text, text, text[]) to authenticated;

-- Cancelamento pelo próprio admin da igreja: marca canceled (o acesso segue até trial_ends_at;
-- quando o Stripe entrar, é aqui que o cancelamento na operadora será disparado).
create or replace function public.cancel_subscription()
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_church bigint;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select church_id into v_church from public.memberships
  where user_id = v_uid and role = 'admin' limit 1;
  if v_church is null then raise exception 'not a church admin'; end if;
  update public.churches set status = 'canceled' where id = v_church;
end $$;
revoke execute on function public.cancel_subscription() from public, anon;
grant execute on function public.cancel_subscription() to authenticated;

-- Reativar (enquanto ainda houver trial/período pago): volta para trial se a data não passou.
create or replace function public.resume_subscription()
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_church bigint;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select church_id into v_church from public.memberships
  where user_id = v_uid and role = 'admin' limit 1;
  if v_church is null then raise exception 'not a church admin'; end if;
  update public.churches
     set status = case when trial_ends_at is null or trial_ends_at > now() then 'trial' else 'past_due' end
   where id = v_church and status = 'canceled';
end $$;
revoke execute on function public.resume_subscription() from public, anon;
grant execute on function public.resume_subscription() to authenticated;
