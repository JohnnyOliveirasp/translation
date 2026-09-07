-- Ajustes apontados pelos advisors do Supabase após a 0001.
create index if not exists invites_invited_by_idx on public.invites (invited_by);

drop policy if exists church_languages_write on public.church_languages;
create policy church_languages_insert on public.church_languages for insert to authenticated
  with check ((select private.is_church_admin(church_id)) or (select private.is_platform_admin()));
create policy church_languages_update on public.church_languages for update to authenticated
  using ((select private.is_church_admin(church_id)) or (select private.is_platform_admin()))
  with check ((select private.is_church_admin(church_id)) or (select private.is_platform_admin()));
create policy church_languages_delete on public.church_languages for delete to authenticated
  using ((select private.is_church_admin(church_id)) or (select private.is_platform_admin()));

drop policy if exists invites_admin on public.invites;
create policy invites_select on public.invites for select to authenticated
  using ((select private.is_church_admin(church_id)) or (select private.is_platform_admin()));
create policy invites_insert on public.invites for insert to authenticated
  with check ((select private.is_church_admin(church_id)) or (select private.is_platform_admin()));
create policy invites_update on public.invites for update to authenticated
  using ((select private.is_church_admin(church_id)) or (select private.is_platform_admin()))
  with check ((select private.is_church_admin(church_id)) or (select private.is_platform_admin()));
create policy invites_delete on public.invites for delete to authenticated
  using ((select private.is_church_admin(church_id)) or (select private.is_platform_admin()));
