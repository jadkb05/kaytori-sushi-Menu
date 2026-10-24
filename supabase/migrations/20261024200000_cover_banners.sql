-- =============================================================================
-- Kaytôri Sushi — photos de couverture (carrousel public)
--
-- AJOUTS :
--   - table public.cover_banners (id, image_url, storage_path, sort_order, is_active) ;
--   - RLS : lecture publique des actives ; admin tout ;
--   - RPC admin_create / update / delete_cover_banner.
--
-- Stockage : bucket existant menu-images (chemins cover/…). Aucune clé secrète.
-- La bannière statique actuelle est enregistrée comme première photo (repli / continuité).
-- =============================================================================

create table public.cover_banners (
  id           text primary key,
  image_url    text not null,
  storage_path text,
  sort_order   integer not null,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index cover_banners_active_sort_idx
  on public.cover_banners (is_active, sort_order, id);

create trigger cover_banners_set_updated_at
  before update on public.cover_banners
  for each row execute function public.set_updated_at();

alter table public.cover_banners enable row level security;

create policy "cover_banners: lecture publique des actives"
  on public.cover_banners for select
  to anon, authenticated
  using (is_active = true or public.is_admin());

create policy "cover_banners: admin"
  on public.cover_banners for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select on public.cover_banners to anon, authenticated;
grant insert, update, delete on public.cover_banners to authenticated;

-- Continuité : bannière déjà servie par le site (fichier public/, pas Storage).
insert into public.cover_banners (id, image_url, storage_path, sort_order, is_active)
values ('cover-default', '/banner/kaytori-makis-1280.webp', null, 0, true)
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- admin_create_cover_banner
-- -----------------------------------------------------------------------------
create or replace function public.admin_create_cover_banner(
  p_id text,
  p_image_url text,
  p_storage_path text default null,
  p_is_active boolean default true,
  p_position integer default null
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_url text := btrim(coalesce(p_image_url, ''));
  v_path text := nullif(btrim(coalesce(p_storage_path, '')), '');
  ids text[];
  sorts integer[];
  n integer;
  i integer;
  new_sort integer;
  after_state jsonb;
begin
  if not public.is_admin() then
    raise exception 'Accès refusé : droits administrateur requis.' using errcode = '42501';
  end if;
  if p_id is null or length(p_id) > 64 or p_id !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'Identifiant de couverture invalide.' using errcode = '22023';
  end if;
  if v_url = '' then
    raise exception 'L''adresse de la photo est obligatoire.' using errcode = '22023';
  end if;
  if exists (select 1 from public.cover_banners where id = p_id) then
    raise exception 'Identifiant déjà utilisé : %.', p_id using errcode = '23505';
  end if;

  lock table public.cover_banners in share row exclusive mode;

  select coalesce(array_agg(b.id order by b.sort_order, b.id), array[]::text[]),
         coalesce(array_agg(b.sort_order order by b.sort_order, b.id), array[]::integer[])
    into ids, sorts
    from public.cover_banners b;
  n := coalesce(array_length(ids, 1), 0);

  if p_position is not null and (p_position < 1 or p_position > n + 1) then
    raise exception 'Position invalide : entre 1 et %.', n + 1 using errcode = '22023';
  end if;

  if p_position is null or p_position = n + 1 then
    new_sort := coalesce(sorts[n] + 1, 0);
  else
    new_sort := sorts[p_position];
    for i in reverse n..p_position loop
      update public.cover_banners set sort_order = sort_order + 1 where id = ids[i];
    end loop;
  end if;

  insert into public.cover_banners (id, image_url, storage_path, sort_order, is_active)
  values (p_id, v_url, v_path, new_sort, coalesce(p_is_active, true));

  select to_jsonb(b) - 'created_at' - 'updated_at' into after_state
    from public.cover_banners b where b.id = p_id;

  insert into public.audit_log (user_id, action, entity_type, entity_id, payload)
  values (auth.uid(), 'cover_banner.create', 'cover_banner', p_id,
          jsonb_build_object('after', after_state, 'position', p_position));

  return after_state;
end;
$$;

-- -----------------------------------------------------------------------------
-- admin_update_cover_banner
-- -----------------------------------------------------------------------------
create or replace function public.admin_update_cover_banner(
  p_banner_id text,
  p_changes jsonb default '{}'::jsonb,
  p_position integer default null
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  ban public.cover_banners%rowtype;
  k text;
  new_active boolean;
  new_url text;
  new_path text;
  ids text[];
  sorts integer[];
  n integer;
  i integer;
  from_pos integer;
  to_pos integer;
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
    if k not in ('is_active', 'image_url', 'storage_path') then
      raise exception 'Champ de couverture non modifiable : %.', k using errcode = '22023';
    end if;
  end loop;

  lock table public.cover_banners in share row exclusive mode;

  select * into ban from public.cover_banners where id = p_banner_id for update;
  if not found then
    raise exception 'Photo de couverture introuvable : %.', p_banner_id using errcode = 'P0002';
  end if;

  new_active := ban.is_active;
  if p_changes ? 'is_active' then
    if jsonb_typeof(p_changes -> 'is_active') <> 'boolean' then
      raise exception 'Statut invalide.' using errcode = '22023';
    end if;
    new_active := (p_changes ->> 'is_active')::boolean;
  end if;

  new_url := ban.image_url;
  if p_changes ? 'image_url' then
    if jsonb_typeof(p_changes -> 'image_url') <> 'string' or btrim(p_changes ->> 'image_url') = '' then
      raise exception 'L''adresse de la photo est obligatoire.' using errcode = '22023';
    end if;
    new_url := btrim(p_changes ->> 'image_url');
  end if;

  -- storage_path : null explicite (bannière locale) ou chemin Storage ; clé absente = inchangé.
  new_path := ban.storage_path;
  if p_changes ? 'storage_path' then
    if p_changes ->> 'storage_path' is null then
      new_path := null;
    elsif jsonb_typeof(p_changes -> 'storage_path') <> 'string' then
      raise exception 'Chemin Storage invalide.' using errcode = '22023';
    else
      new_path := nullif(btrim(p_changes ->> 'storage_path'), '');
    end if;
  end if;

  update public.cover_banners
     set is_active = new_active, image_url = new_url, storage_path = new_path
   where id = p_banner_id;

  if p_position is not null then
    select coalesce(array_agg(b.id order by b.sort_order, b.id), array[]::text[]),
           coalesce(array_agg(b.sort_order order by b.sort_order, b.id), array[]::integer[])
      into ids, sorts
      from public.cover_banners b;
    n := coalesce(array_length(ids, 1), 0);
    if p_position < 1 or p_position > n then
      raise exception 'Position invalide : entre 1 et %.', n using errcode = '22023';
    end if;
    from_pos := array_position(ids, p_banner_id);
    to_pos := p_position;
    if from_pos is not null and from_pos is distinct from to_pos then
      select coalesce(array_agg(b.id order by b.sort_order, b.id), array[]::text[]) into ids
        from public.cover_banners b where b.id <> p_banner_id;
      ids := ids[:to_pos - 1] || array[p_banner_id] || ids[to_pos:];
      for i in 1..coalesce(array_length(ids, 1), 0) loop
        update public.cover_banners set sort_order = sorts[1] + i - 1 where id = ids[i];
      end loop;
    end if;
  end if;

  select to_jsonb(b) - 'created_at' - 'updated_at' into after_state
    from public.cover_banners b where b.id = p_banner_id;

  insert into public.audit_log (user_id, action, entity_type, entity_id, payload)
  values (auth.uid(), 'cover_banner.update', 'cover_banner', p_banner_id,
          jsonb_build_object('after', after_state, 'position', p_position));

  return after_state;
end;
$$;

-- -----------------------------------------------------------------------------
-- admin_delete_cover_banner
-- -----------------------------------------------------------------------------
create or replace function public.admin_delete_cover_banner(p_banner_id text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  ban public.cover_banners%rowtype;
  sibling_ids text[];
  sibling_sorts integer[];
  n integer;
  i integer;
  before_state jsonb;
begin
  if not public.is_admin() then
    raise exception 'Accès refusé : droits administrateur requis.' using errcode = '42501';
  end if;

  lock table public.cover_banners in share row exclusive mode;

  select * into ban from public.cover_banners where id = p_banner_id for update;
  if not found then
    raise exception 'Photo de couverture introuvable : %.', p_banner_id using errcode = 'P0002';
  end if;

  select to_jsonb(ban) - 'created_at' - 'updated_at' into before_state;

  select coalesce(array_agg(b.id order by b.sort_order, b.id), array[]::text[]),
         coalesce(array_agg(b.sort_order order by b.sort_order, b.id), array[]::integer[])
    into sibling_ids, sibling_sorts
    from public.cover_banners b
   where b.id <> p_banner_id;

  delete from public.cover_banners where id = p_banner_id;

  n := coalesce(array_length(sibling_ids, 1), 0);
  if n > 0 then
    for i in 1..n loop
      update public.cover_banners set sort_order = sibling_sorts[1] + i - 1 where id = sibling_ids[i];
    end loop;
  end if;

  insert into public.audit_log (user_id, action, entity_type, entity_id, payload)
  values (auth.uid(), 'cover_banner.delete', 'cover_banner', p_banner_id,
          jsonb_build_object('before', before_state));

  return before_state;
end;
$$;

revoke all on function public.admin_create_cover_banner(text, text, text, boolean, integer) from public;
revoke all on function public.admin_create_cover_banner(text, text, text, boolean, integer) from anon;
grant execute on function public.admin_create_cover_banner(text, text, text, boolean, integer) to authenticated;

revoke all on function public.admin_update_cover_banner(text, jsonb, integer) from public;
revoke all on function public.admin_update_cover_banner(text, jsonb, integer) from anon;
grant execute on function public.admin_update_cover_banner(text, jsonb, integer) to authenticated;

revoke all on function public.admin_delete_cover_banner(text) from public;
revoke all on function public.admin_delete_cover_banner(text) from anon;
grant execute on function public.admin_delete_cover_banner(text) to authenticated;
