-- =============================================================================
-- Kaytôri Sushi — réglages du menu public (une seule ligne, id = 'default')
--
-- AJOUTS :
--   - table public.site_settings : cover_autoplay (défilement automatique des couvertures) ;
--   - RLS : lecture publique ; écriture admin uniquement via RPC ;
--   - RPC admin_update_site_settings(p_changes jsonb) avec journal d'audit.
--
-- Valeur par défaut = comportement actuel (défilement automatique activé).
-- =============================================================================

create table public.site_settings (
  id             text primary key default 'default' check (id = 'default'),
  cover_autoplay boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create trigger site_settings_set_updated_at
  before update on public.site_settings
  for each row execute function public.set_updated_at();

alter table public.site_settings enable row level security;

create policy "site_settings: lecture publique"
  on public.site_settings for select
  to anon, authenticated
  using (true);

create policy "site_settings: admin"
  on public.site_settings for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select on public.site_settings to anon, authenticated;
grant insert, update on public.site_settings to authenticated;

insert into public.site_settings (id, cover_autoplay)
values ('default', true)
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- admin_update_site_settings
-- -----------------------------------------------------------------------------
create or replace function public.admin_update_site_settings(p_changes jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  k text;
  before_state jsonb;
  after_state jsonb;
begin
  if not public.is_admin() then
    raise exception 'Accès refusé : droits administrateur requis.' using errcode = '42501';
  end if;
  p_changes := coalesce(p_changes, '{}'::jsonb);
  if jsonb_typeof(p_changes) <> 'object' then
    raise exception 'Données invalides.' using errcode = '22023';
  end if;
  for k in select jsonb_object_keys(p_changes) loop
    if k not in ('cover_autoplay') then
      raise exception 'Réglage non modifiable : %.', k using errcode = '22023';
    end if;
  end loop;
  if p_changes ? 'cover_autoplay' and jsonb_typeof(p_changes -> 'cover_autoplay') <> 'boolean' then
    raise exception 'Valeur invalide pour le défilement automatique.' using errcode = '22023';
  end if;

  insert into public.site_settings (id) values ('default') on conflict (id) do nothing;

  select to_jsonb(s) - 'created_at' - 'updated_at' into before_state
    from public.site_settings s where s.id = 'default' for update;

  update public.site_settings
     set cover_autoplay = coalesce((p_changes ->> 'cover_autoplay')::boolean, cover_autoplay)
   where id = 'default';

  select to_jsonb(s) - 'created_at' - 'updated_at' into after_state
    from public.site_settings s where s.id = 'default';

  insert into public.audit_log (user_id, action, entity_type, entity_id, payload)
  values (auth.uid(), 'site_settings.update', 'site_settings', 'default',
          jsonb_build_object('before', before_state, 'after', after_state));

  return after_state;
end;
$$;

revoke all on function public.admin_update_site_settings(jsonb) from public;
revoke all on function public.admin_update_site_settings(jsonb) from anon;
grant execute on function public.admin_update_site_settings(jsonb) to authenticated;
