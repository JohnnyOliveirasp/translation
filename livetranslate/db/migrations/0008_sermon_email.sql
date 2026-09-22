-- 0008 — Envio do sermão por e-mail (22/09/2026)
--
-- Decisão do Johnny: quem deixou o e-mail recebe o sermão de TODO culto, no idioma que
-- escolheu, com link de descadastro em cada e-mail (antes o cartão dizia "a mensagem de hoje").

-- 1) descadastro: token secreto por inscrito + data de saída (o registro fica — histórico/consentimento)
alter table public.listener_emails
  add column if not exists unsubscribe_token uuid not null default gen_random_uuid(),
  add column if not exists unsubscribed_at   timestamptz;
create unique index if not exists listener_emails_unsubscribe_token_idx
  on public.listener_emails (unsubscribe_token);

-- 2) quem se inscreve de novo volta a receber
create or replace function public.subscribe_listener(p_slug text, p_email text, p_lang text, p_consent boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare v_church bigint;
begin
  select id into v_church from public.churches where slug = lower(p_slug) and status in ('trial', 'active');
  if v_church is null then raise exception 'church not found'; end if;
  insert into public.listener_emails (church_id, email, lang_code, consent_marketing)
  values (v_church, lower(p_email), p_lang, p_consent)
  on conflict (church_id, email) do update
    set lang_code = excluded.lang_code,
        consent_marketing = excluded.consent_marketing,
        unsubscribed_at = null;
end $$;
grant execute on function public.subscribe_listener(text, text, text, boolean) to anon, authenticated;

-- 3) lista de envio, lida pelo servidor no "End broadcast" COM O TOKEN DE QUEM ENCERROU.
--    A RLS de listener_emails só deixa o ADMIN ler — mas quem encerra pode ser o OPERADOR
--    (o voluntário de 06/09 era operador). Sem isto, a lista viria vazia e ninguém
--    receberia nada, em silêncio. Qualquer MEMBRO da igreja pode pedir a lista de envio.
create or replace function public.sermon_mailing_list(p_slug text)
returns jsonb language plpgsql security definer stable set search_path = '' as $$
declare v_church public.churches%rowtype;
begin
  select * into v_church from public.churches where slug = lower(p_slug);
  if v_church.id is null or not private.is_member(v_church.id) then
    raise exception 'not a member of this church';
  end if;
  return jsonb_build_object(
    'name', v_church.name,
    'speaker_lang', v_church.speaker_lang,
    'logo_path', v_church.logo_path,
    'recipients', to_jsonb(v_church.sermon_recipients),
    'listeners', coalesce((
      select jsonb_agg(jsonb_build_object('email', e.email, 'lang', e.lang_code, 'token', e.unsubscribe_token) order by e.id)
      from public.listener_emails e
      where e.church_id = v_church.id and e.unsubscribed_at is null
    ), '[]'::jsonb)
  );
end $$;
revoke execute on function public.sermon_mailing_list(text) from public, anon;
grant execute on function public.sermon_mailing_list(text) to authenticated;

-- 4) descadastro pelo link do e-mail — anônimo; o token (uuid aleatório) é a credencial
create or replace function public.unsubscribe_listener(p_token uuid)
returns table (church_name text, lang_code text) language plpgsql security definer set search_path = '' as $$
begin
  return query
    update public.listener_emails e
       set unsubscribed_at = coalesce(e.unsubscribed_at, now())
      from public.churches c
     where e.unsubscribe_token = p_token and c.id = e.church_id
    returning c.name, e.lang_code;
end $$;
revoke execute on function public.unsubscribe_listener(uuid) from public;
grant execute on function public.unsubscribe_listener(uuid) to anon, authenticated;
