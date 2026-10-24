-- À appliquer UNE FOIS sur Supabase après autorisation explicite (pas exécuté automatiquement par Vercel).
-- Prérequis : 08_formule_sections.sql déjà appliqué (table formule_sections présente).
-- Une seule transaction : tout ou rien.
-- =============================================================================
-- PRODUCTION — 09 : description facultative des sections de formules
-- Contenu aligné sur supabase/migrations/20261024180000_formule_section_description.sql
-- =============================================================================

begin;

-- =============================================================================
-- Kaytôri Sushi — description facultative des sections de formules
--
-- AJOUTS :
--   - colonne formule_sections.description (text, nullable) ;
--   - admin_update_formule_section accepte le champ « description » dans p_changes ;
--   - admin_create_formule_section accepte p_description (optionnel).
--
-- L'ordre des sections (sort_order / p_position) existait déjà : inchangé.
-- Aucun produit, prix ni RLS existante n'est modifié.
-- =============================================================================

alter table public.formule_sections
  add column if not exists description text;

comment on column public.formule_sections.description is
  'Sous-titre facultatif affiché sous le nom sur le menu public.';

-- -----------------------------------------------------------------------------
-- admin_create_formule_section (signature étendue : p_description)
-- -----------------------------------------------------------------------------
drop function if exists public.admin_create_formule_section(text, text, boolean, integer);

create or replace function public.admin_create_formule_section(
  p_id text,
  p_name text,
  p_is_active boolean default true,
  p_position integer default null,
  p_description text default null
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_desc text := nullif(btrim(coalesce(p_description, '')), '');
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
  if v_name = '' then
    raise exception 'Le nom de la section est obligatoire.' using errcode = '22023';
  end if;
  if length(v_name) > 60 then
    raise exception 'Nom trop long (60 caractères maximum).' using errcode = '22023';
  end if;
  if v_desc is not null and length(v_desc) > 160 then
    raise exception 'Description trop longue (160 caractères maximum).' using errcode = '22023';
  end if;
  if p_id is null or length(p_id) > 64 or p_id !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'Identifiant de section invalide.' using errcode = '22023';
  end if;

  lock table public.formule_sections in share row exclusive mode;

  if exists (select 1 from public.formule_sections where id = p_id) then
    raise exception 'Identifiant de section déjà utilisé : %.', p_id using errcode = '23505';
  end if;
  if exists (select 1 from public.formule_sections where lower(btrim(name)) = lower(v_name)) then
    raise exception 'Une section porte déjà ce nom.' using errcode = '23505';
  end if;

  select coalesce(array_agg(s.id order by s.sort_order, s.id), array[]::text[]),
         coalesce(array_agg(s.sort_order order by s.sort_order, s.id), array[]::integer[])
    into ids, sorts
    from public.formule_sections s;
  n := coalesce(array_length(ids, 1), 0);

  if p_position is not null and (p_position < 1 or p_position > n + 1) then
    raise exception 'Position invalide : entre 1 et %.', n + 1 using errcode = '22023';
  end if;

  if p_position is null or p_position = n + 1 then
    new_sort := coalesce(sorts[n] + 1, 0);
  else
    new_sort := sorts[p_position];
    for i in reverse n..p_position loop
      update public.formule_sections set sort_order = sort_order + 1 where id = ids[i];
    end loop;
  end if;

  insert into public.formule_sections (id, name, description, sort_order, is_active)
  values (p_id, v_name, v_desc, new_sort, coalesce(p_is_active, true));

  select to_jsonb(s) - 'created_at' - 'updated_at' into after_state
    from public.formule_sections s where s.id = p_id;

  insert into public.audit_log (user_id, action, entity_type, entity_id, payload)
  values (auth.uid(), 'formule_section.create', 'formule_section', p_id,
          jsonb_build_object('after', after_state, 'position', p_position));

  return after_state;
end;
$$;

-- -----------------------------------------------------------------------------
-- admin_update_formule_section (accepte description)
-- -----------------------------------------------------------------------------
create or replace function public.admin_update_formule_section(
  p_section_id text,
  p_changes jsonb default '{}'::jsonb,
  p_position integer default null
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  sec public.formule_sections%rowtype;
  k text;
  new_name text;
  new_active boolean;
  new_desc text;
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
    if k not in ('name', 'is_active', 'description') then
      raise exception 'Champ de section non modifiable : %.', k using errcode = '22023';
    end if;
  end loop;

  lock table public.formule_sections in share row exclusive mode;

  select * into sec from public.formule_sections where id = p_section_id for update;
  if not found then
    raise exception 'Section introuvable : %.', p_section_id using errcode = 'P0002';
  end if;

  new_name := sec.name;
  if p_changes ? 'name' then
    if jsonb_typeof(p_changes -> 'name') <> 'string' or btrim(p_changes ->> 'name') = '' then
      raise exception 'Le nom de la section est obligatoire.' using errcode = '22023';
    end if;
    new_name := btrim(p_changes ->> 'name');
    if length(new_name) > 60 then
      raise exception 'Nom trop long (60 caractères maximum).' using errcode = '22023';
    end if;
    if exists (
      select 1 from public.formule_sections
      where lower(btrim(name)) = lower(new_name) and id <> p_section_id
    ) then
      raise exception 'Une section porte déjà ce nom.' using errcode = '23505';
    end if;
  end if;

  new_active := sec.is_active;
  if p_changes ? 'is_active' then
    if jsonb_typeof(p_changes -> 'is_active') <> 'boolean' then
      raise exception 'Statut invalide.' using errcode = '22023';
    end if;
    new_active := (p_changes ->> 'is_active')::boolean;
  end if;

  new_desc := sec.description;
  if p_changes ? 'description' then
    if p_changes ->> 'description' is null then
      new_desc := null;
    elsif jsonb_typeof(p_changes -> 'description') <> 'string' then
      raise exception 'Description invalide.' using errcode = '22023';
    else
      new_desc := nullif(btrim(p_changes ->> 'description'), '');
      if new_desc is not null and length(new_desc) > 160 then
        raise exception 'Description trop longue (160 caractères maximum).' using errcode = '22023';
      end if;
    end if;
  end if;

  update public.formule_sections
     set name = new_name, is_active = new_active, description = new_desc
   where id = p_section_id;

  if p_position is not null then
    select coalesce(array_agg(s.id order by s.sort_order, s.id), array[]::text[]),
           coalesce(array_agg(s.sort_order order by s.sort_order, s.id), array[]::integer[])
      into ids, sorts
      from public.formule_sections s;
    n := coalesce(array_length(ids, 1), 0);
    if p_position < 1 or p_position > n then
      raise exception 'Position invalide : entre 1 et %.', n using errcode = '22023';
    end if;
    from_pos := array_position(ids, p_section_id);
    to_pos := p_position;
    if from_pos is not null and from_pos is distinct from to_pos then
      select coalesce(array_agg(s.id order by s.sort_order, s.id), array[]::text[]) into ids
        from public.formule_sections s where s.id <> p_section_id;
      ids := ids[:to_pos - 1] || array[p_section_id] || ids[to_pos:];
      for i in 1..coalesce(array_length(ids, 1), 0) loop
        update public.formule_sections set sort_order = sorts[1] + i - 1 where id = ids[i];
      end loop;
    end if;
  end if;

  select to_jsonb(s) - 'created_at' - 'updated_at' into after_state
    from public.formule_sections s where s.id = p_section_id;

  insert into public.audit_log (user_id, action, entity_type, entity_id, payload)
  values (auth.uid(), 'formule_section.update', 'formule_section', p_section_id,
          jsonb_build_object('after', after_state, 'position', p_position));

  return after_state;
end;
$$;

revoke all on function public.admin_create_formule_section(text, text, boolean, integer, text) from public;
revoke all on function public.admin_create_formule_section(text, text, boolean, integer, text) from anon;
grant execute on function public.admin_create_formule_section(text, text, boolean, integer, text) to authenticated;

revoke all on function public.admin_update_formule_section(text, jsonb, integer) from public;
revoke all on function public.admin_update_formule_section(text, jsonb, integer) from anon;
grant execute on function public.admin_update_formule_section(text, jsonb, integer) to authenticated;

commit;
