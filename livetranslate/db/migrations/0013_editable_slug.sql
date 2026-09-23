-- 0013 — Link da igreja (slug) editável sem quebrar o QR já impresso (23/09/2026)
-- Pedido do Johnny (HANDOFF §28, "bug do slug não editável").
-- Aplicada no projeto yrqtncjkwfrgwecyxkmc via MCP (apply_migration). HANDOFF §30.
--
-- O slug é o endereço da página do ouvinte e o conteúdo do QR/cartaz. Trocar direto na tabela
-- deixaria os QR impressos apontando para "Igreja não encontrada". Por isso:
--   1) o slug antigo vira APELIDO (church_slug_aliases) e a página do ouvinte redireciona;
--   2) a troca só acontece pela RPC change_church_slug (valida formato, reservados, duplicidade
--      e recusa com culto no ar — a ponte usa o slug no nome dos participantes e dos logs);
--   3) a sala do LiveKit (churches.livekit_room) NÃO muda: ela é gravada no cadastro.

create table if not exists public.church_slug_aliases (
  slug       text primary key check (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?$'),
  church_id  bigint not null references public.churches (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists church_slug_aliases_church_idx on public.church_slug_aliases (church_id);
alter table public.church_slug_aliases enable row level security;

-- membros veem os apelidos da própria igreja (a API lista os PDFs das pastas antigas)
create policy church_slug_aliases_select on public.church_slug_aliases for select to authenticated
  using (exists (select 1 from public.memberships m where m.church_id = church_slug_aliases.church_id and m.user_id = (select auth.uid()))
         or (select private.is_platform_admin()));

-- Troca o link. Admin da igreja ou da plataforma.
create or replace function public.change_church_slug(p_church_id bigint, p_new_slug text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_new text := lower(trim(p_new_slug));
  v_old text;
begin
  if not ((select private.is_church_admin(p_church_id)) or (select private.is_platform_admin())) then
    raise exception 'not allowed';
  end if;
  if v_new !~ '^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?$' then raise exception 'invalid slug'; end if;
  if v_new in ('signup','login','recover','admin','platform','invite','broadcast','assets','terms','privacy','testimonials','api','www') then
    raise exception 'slug taken';
  end if;

  select slug into v_old from public.churches where id = p_church_id for update;
  if v_old is null then raise exception 'church not found'; end if;
  if v_old = v_new then return v_new; end if;

  if exists (select 1 from public.churches where slug = v_new)
     or exists (select 1 from public.church_slug_aliases where slug = v_new and church_id <> p_church_id) then
    raise exception 'slug taken';
  end if;
  if exists (select 1 from public.services where church_id = p_church_id and ended_at is null
             and started_at > now() - interval '12 hours') then
    raise exception 'service live';
  end if;

  -- voltar para um link antigo da própria igreja: ele deixa de ser apelido
  delete from public.church_slug_aliases where slug = v_new;
  insert into public.church_slug_aliases (slug, church_id) values (v_old, p_church_id)
    on conflict (slug) do nothing;
  update public.churches set slug = v_new where id = p_church_id;
  return v_new;
end $$;
revoke execute on function public.change_church_slug(bigint, text) from public, anon;
grant execute on function public.change_church_slug(bigint, text) to authenticated;

-- Página do ouvinte / QR antigo: dado um slug, devolve o slug ATUAL (ou null).
create or replace function public.resolve_church_slug(p_slug text)
returns text language sql stable security definer set search_path = '' as $$
  select c.slug from public.church_slug_aliases a
  join public.churches c on c.id = a.church_id
  where a.slug = lower(p_slug) and c.status in ('trial', 'active')
$$;
revoke execute on function public.resolve_church_slug(text) from public;
grant execute on function public.resolve_church_slug(text) to anon, authenticated;

-- A mesma trava vale para criar igreja nova com um link que é apelido de outra.
create or replace function private.guard_slug_not_alias()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.church_slug_aliases where slug = new.slug and church_id <> new.id) then
    -- mesmo código do unique de churches.slug: o cadastro já mostra "Esse link já está em uso"
    raise exception using errcode = '23505', message = 'duplicate key value violates unique constraint "churches_slug_key"';
  end if;
  return new;
end $$;
revoke execute on function private.guard_slug_not_alias() from public, anon;
drop trigger if exists churches_guard_slug_alias on public.churches;
create trigger churches_guard_slug_alias before insert or update of slug on public.churches
  for each row execute function private.guard_slug_not_alias();
