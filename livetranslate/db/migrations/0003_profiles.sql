-- perfis públicos mínimos (e-mail/nome) para o admin listar operadores — padrão Supabase:
-- trigger em auth.users copia para public.profiles
create table public.profiles (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  email      text not null,
  full_name  text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();

create or replace function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (user_id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (user_id) do update set email = excluded.email;
  return new;
end $$;
create trigger on_auth_user_created after insert or update of email on auth.users
  for each row execute function private.handle_new_user();

alter table public.profiles enable row level security;
create policy profiles_select on public.profiles for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select private.is_platform_admin())
    or exists (
      select 1 from public.memberships m
      where m.user_id = profiles.user_id and (select private.is_church_admin(m.church_id))
    )
  );
create policy profiles_update_own on public.profiles for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- 0004: FKs para o PostgREST embutir profiles
alter table public.memberships
  add constraint memberships_profile_fkey foreign key (user_id) references public.profiles (user_id) on delete cascade;
alter table public.invites
  add constraint invites_invited_by_profile_fkey foreign key (invited_by) references public.profiles (user_id) on delete set null;
