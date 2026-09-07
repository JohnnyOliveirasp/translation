-- LiveTranslate — schema inicial (multi-tenant) — Supabase projeto `livetranslate`
-- Convenções (supabase-postgres-best-practices): identificadores minúsculos, bigint identity,
-- timestamptz, text + check em vez de enum, RLS em TODAS as tabelas, helpers em schema `private`
-- (security definer, search_path vazio), (select auth.uid()) nas policies, índices nas colunas de RLS.
--
-- Papéis do produto:
--   platform admin  → Johnny (vê tudo, inclusive custo)        → tabela platform_admins
--   church admin    → quem assinou (config, operadores, métricas) → memberships.role = 'admin'
--   operator        → convidado, só transmite                    → memberships.role = 'operator'
--   listener        → anônimo (página do ouvinte); só grava e-mail via RPC

create schema if not exists private;
revoke all on schema private from public;

-- ── util: updated_at automático ─────────────────────────────────────────────
create or replace function private.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ── igrejas / organizações (o tenant) ───────────────────────────────────────
create table public.churches (
  id                bigint generated always as identity primary key,
  slug              text not null unique check (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?$'),
  name              text not null check (char_length(name) between 2 and 120),
  logo_path         text,                       -- objeto no bucket `logos`
  speaker_lang      text not null default 'en',
  plan              text not null default 'starter' check (plan in ('starter', 'growth', 'congregation')),
  status            text not null default 'trial' check (status in ('trial', 'active', 'past_due', 'canceled')),
  trial_ends_at     timestamptz,
  stripe_customer_id text unique,
  review_before_send boolean not null default true,   -- pastor aprova o PDF antes de ir aos ouvintes
  sermon_recipients text[] not null default '{}',      -- e-mails que recebem o sermão pós-culto
  livekit_room      text not null unique,              -- sala própria por igreja
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create trigger churches_updated_at before update on public.churches
  for each row execute function private.set_updated_at();

-- ── quem pertence a qual igreja ─────────────────────────────────────────────
create table public.memberships (
  user_id    uuid not null references auth.users (id) on delete cascade,
  church_id  bigint not null references public.churches (id) on delete cascade,
  role       text not null check (role in ('admin', 'operator')),
  created_at timestamptz not null default now(),
  primary key (user_id, church_id)
);
create index memberships_church_id_idx on public.memberships (church_id);

-- ── administradores da plataforma (Johnny) ──────────────────────────────────
create table public.platform_admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- ── idiomas ativos por igreja ───────────────────────────────────────────────
create table public.church_languages (
  church_id  bigint not null references public.churches (id) on delete cascade,
  lang_code  text not null,
  enabled    boolean not null default true,
  primary key (church_id, lang_code)
);

-- ── convites de operador/admin ──────────────────────────────────────────────
create table public.invites (
  id          bigint generated always as identity primary key,
  church_id   bigint not null references public.churches (id) on delete cascade,
  email       text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role        text not null default 'operator' check (role in ('admin', 'operator')),
  token       text not null unique default encode(gen_random_bytes(24), 'hex'),
  invited_by  uuid references auth.users (id) on delete set null,
  expires_at  timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  created_at  timestamptz not null default now()
);
create index invites_church_id_idx on public.invites (church_id);

-- ── cultos / transmissões (base da fatura e das métricas) ───────────────────
create table public.services (
  id           bigint generated always as identity primary key,
  church_id    bigint not null references public.churches (id) on delete cascade,
  started_at   timestamptz not null default now(),
  ended_at     timestamptz,
  ended_reason text,
  created_at   timestamptz not null default now()
);
create index services_church_started_idx on public.services (church_id, started_at desc);

-- minutos por idioma (visível para a igreja)
create table public.service_languages (
  service_id     bigint not null references public.services (id) on delete cascade,
  lang_code      text not null,
  minutes        numeric(8,1) not null default 0,
  peak_listeners integer not null default 0,
  primary key (service_id, lang_code)
);

-- custo real (SÓ platform admin — nunca aparece para a igreja; decisão de 04/08)
create table public.service_costs (
  service_id bigint not null references public.services (id) on delete cascade,
  lang_code  text not null,
  cost_usd   numeric(10,4) not null default 0,
  primary key (service_id, lang_code)
);

-- ── e-mails de ouvintes (opt-in do PDF) ─────────────────────────────────────
create table public.listener_emails (
  id                bigint generated always as identity primary key,
  church_id         bigint not null references public.churches (id) on delete cascade,
  email             text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  lang_code         text not null,
  consent_marketing boolean not null default false,   -- aceita receber novidades do LiveTranslate
  created_at        timestamptz not null default now(),
  unique (church_id, email)
);

-- ── sermão pós-culto (transcrição → revisão → PDF → envio) ───────────────────
create table public.sermons (
  id            bigint generated always as identity primary key,
  service_id    bigint not null unique references public.services (id) on delete cascade,
  church_id     bigint not null references public.churches (id) on delete cascade,
  status        text not null default 'processing' check (status in ('processing', 'review', 'approved', 'sent', 'failed')),
  title         text,
  transcript    text,           -- original limpo (idioma do orador)
  summary       text,
  pdf_paths     jsonb not null default '{}'::jsonb,   -- { "es": "sermons/12/es.pdf", ... }
  approved_at   timestamptz,
  sent_at       timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index sermons_church_id_idx on public.sermons (church_id);
create trigger sermons_updated_at before update on public.sermons
  for each row execute function private.set_updated_at();

-- ── helpers de autorização (security definer, executam 1× por query) ────────
create or replace function private.is_platform_admin()
returns boolean language sql security definer stable set search_path = '' as $$
  select exists (select 1 from public.platform_admins where user_id = (select auth.uid()));
$$;

create or replace function private.is_member(p_church_id bigint)
returns boolean language sql security definer stable set search_path = '' as $$
  select exists (
    select 1 from public.memberships
    where church_id = p_church_id and user_id = (select auth.uid())
  );
$$;

create or replace function private.is_church_admin(p_church_id bigint)
returns boolean language sql security definer stable set search_path = '' as $$
  select exists (
    select 1 from public.memberships
    where church_id = p_church_id and user_id = (select auth.uid()) and role = 'admin'
  );
$$;

-- só o papel autenticado pode chamar (schema private não é exposto pela API)
revoke execute on function private.is_platform_admin() from public, anon;
revoke execute on function private.is_member(bigint) from public, anon;
revoke execute on function private.is_church_admin(bigint) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.is_platform_admin() to authenticated;
grant execute on function private.is_member(bigint) to authenticated;
grant execute on function private.is_church_admin(bigint) to authenticated;

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.churches          enable row level security;
alter table public.memberships       enable row level security;
alter table public.platform_admins   enable row level security;
alter table public.church_languages  enable row level security;
alter table public.invites           enable row level security;
alter table public.services          enable row level security;
alter table public.service_languages enable row level security;
alter table public.service_costs     enable row level security;
alter table public.listener_emails   enable row level security;
alter table public.sermons           enable row level security;

-- churches: membro lê; admin da igreja edita; platform admin tudo. Insert só via RPC create_church.
create policy churches_select on public.churches for select to authenticated
  using ((select private.is_member(id)) or (select private.is_platform_admin()));
create policy churches_update on public.churches for update to authenticated
  using ((select private.is_church_admin(id)) or (select private.is_platform_admin()))
  with check ((select private.is_church_admin(id)) or (select private.is_platform_admin()));

-- memberships: vê as próprias e as da igreja onde é admin; admin remove operadores
create policy memberships_select on public.memberships for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_church_admin(church_id)) or (select private.is_platform_admin()));
create policy memberships_delete on public.memberships for delete to authenticated
  using (((select private.is_church_admin(church_id)) and role = 'operator') or (select private.is_platform_admin()));

-- platform_admins: só o próprio registro (para o app saber que é admin)
create policy platform_admins_select on public.platform_admins for select to authenticated
  using (user_id = (select auth.uid()));

-- church_languages: membro lê; admin escreve
create policy church_languages_select on public.church_languages for select to authenticated
  using ((select private.is_member(church_id)) or (select private.is_platform_admin()));
create policy church_languages_write on public.church_languages for all to authenticated
  using ((select private.is_church_admin(church_id)) or (select private.is_platform_admin()))
  with check ((select private.is_church_admin(church_id)) or (select private.is_platform_admin()));

-- invites: admin da igreja gerencia
create policy invites_admin on public.invites for all to authenticated
  using ((select private.is_church_admin(church_id)) or (select private.is_platform_admin()))
  with check ((select private.is_church_admin(church_id)) or (select private.is_platform_admin()));

-- services / service_languages: membro lê (escrita é do servidor via service_role)
create policy services_select on public.services for select to authenticated
  using ((select private.is_member(church_id)) or (select private.is_platform_admin()));
create policy service_languages_select on public.service_languages for select to authenticated
  using (exists (select 1 from public.services s where s.id = service_id
                 and ((select private.is_member(s.church_id)) or (select private.is_platform_admin()))));

-- service_costs: SOMENTE platform admin
create policy service_costs_platform on public.service_costs for select to authenticated
  using ((select private.is_platform_admin()));

-- listener_emails: admin da igreja lê/apaga; insert só via RPC subscribe_listener
create policy listener_emails_admin_select on public.listener_emails for select to authenticated
  using ((select private.is_church_admin(church_id)) or (select private.is_platform_admin()));
create policy listener_emails_admin_delete on public.listener_emails for delete to authenticated
  using ((select private.is_church_admin(church_id)) or (select private.is_platform_admin()));

-- sermons: membro lê; admin aprova (update)
create policy sermons_select on public.sermons for select to authenticated
  using ((select private.is_member(church_id)) or (select private.is_platform_admin()));
create policy sermons_update on public.sermons for update to authenticated
  using ((select private.is_church_admin(church_id)) or (select private.is_platform_admin()))
  with check ((select private.is_church_admin(church_id)) or (select private.is_platform_admin()));

-- ── RPCs ─────────────────────────────────────────────────────────────────────
-- Signup: cria a igreja + membership admin + idiomas padrão + trial, atomicamente.
create or replace function public.create_church(p_name text, p_slug text, p_speaker_lang text default 'en', p_languages text[] default array['es','pt-BR'])
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_id  bigint;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  insert into public.churches (name, slug, speaker_lang, livekit_room, trial_ends_at)
  values (p_name, lower(p_slug), p_speaker_lang, 'church-' || lower(p_slug), now() + interval '14 days')
  returning id into v_id;
  insert into public.memberships (user_id, church_id, role) values (v_uid, v_id, 'admin');
  insert into public.church_languages (church_id, lang_code)
  select v_id, unnest(p_languages);
  return v_id;
end $$;
revoke execute on function public.create_church(text, text, text, text[]) from public, anon;
grant execute on function public.create_church(text, text, text, text[]) to authenticated;

-- Aceite de convite: usuário logado apresenta o token e entra na igreja com o papel do convite.
create or replace function public.accept_invite(p_token text)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_inv public.invites%rowtype;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select * into v_inv from public.invites
  where token = p_token and accepted_at is null and expires_at > now();
  if not found then raise exception 'invite invalid or expired'; end if;
  insert into public.memberships (user_id, church_id, role) values (v_uid, v_inv.church_id, v_inv.role)
  on conflict (user_id, church_id) do update set role = excluded.role;
  update public.invites set accepted_at = now() where id = v_inv.id;
  return v_inv.church_id;
end $$;
revoke execute on function public.accept_invite(text) from public, anon;
grant execute on function public.accept_invite(text) to authenticated;

-- Página do ouvinte (anônima): opt-in do e-mail para receber o sermão.
create or replace function public.subscribe_listener(p_slug text, p_email text, p_lang text, p_consent boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare v_church bigint;
begin
  select id into v_church from public.churches where slug = lower(p_slug) and status in ('trial', 'active');
  if v_church is null then raise exception 'church not found'; end if;
  insert into public.listener_emails (church_id, email, lang_code, consent_marketing)
  values (v_church, lower(p_email), p_lang, p_consent)
  on conflict (church_id, email) do update set lang_code = excluded.lang_code, consent_marketing = excluded.consent_marketing;
end $$;
grant execute on function public.subscribe_listener(text, text, text, boolean) to anon, authenticated;

-- Página do ouvinte (anônima): dados públicos mínimos da igreja pelo slug (nome, logo, idiomas).
create or replace function public.church_public(p_slug text)
returns table (name text, logo_path text, speaker_lang text, languages text[]) language sql security definer stable set search_path = '' as $$
  select c.name, c.logo_path, c.speaker_lang,
         coalesce(array_agg(l.lang_code order by l.lang_code) filter (where l.enabled), '{}')
  from public.churches c
  left join public.church_languages l on l.church_id = c.id
  where c.slug = lower(p_slug) and c.status in ('trial', 'active')
  group by c.id;
$$;
grant execute on function public.church_public(text) to anon, authenticated;

-- ── Storage: bucket público de logos; escrita só pelo admin da igreja na pasta {church_id}/ ──
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('logos', 'logos', true, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

create policy logos_public_read on storage.objects for select to public
  using (bucket_id = 'logos');
create policy logos_admin_write on storage.objects for insert to authenticated
  with check (bucket_id = 'logos' and (select private.is_church_admin(split_part(name, '/', 1)::bigint)));
create policy logos_admin_update on storage.objects for update to authenticated
  using (bucket_id = 'logos' and (select private.is_church_admin(split_part(name, '/', 1)::bigint)));
create policy logos_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'logos' and (select private.is_church_admin(split_part(name, '/', 1)::bigint)));
