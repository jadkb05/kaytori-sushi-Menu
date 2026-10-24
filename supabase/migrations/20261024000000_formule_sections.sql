-- =============================================================================
-- Kaytôri Sushi — sections des formules (Admin → Formules)
--
-- AJOUTS :
--   - table public.formule_sections (id, name, sort_order, is_active) ;
--   - colonne products.formule_section_id (nullable, FK) ;
--   - RLS : lecture publique des sections actives ; admin tout ;
--   - RPC admin_create / update / delete_formule_section ;
--   - RPC admin_set_formule_section (rattacher une offre + position dans la section).
--
-- Les 3 sections initiales sont créées (noms client). L'affectation des produits
-- existants est idempotente (UPDATE … where formule_section_id is null).
-- Aucune politique RLS existante n'est retirée. Aucun prix / nom de produit modifié.
-- =============================================================================

create table public.formule_sections (
  id         text primary key,
  name       text not null,
  sort_order integer not null,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index formule_sections_name_unique_idx
  on public.formule_sections (lower(btrim(name)));

create trigger formule_sections_set_updated_at
  before update on public.formule_sections
  for each row execute function public.set_updated_at();

alter table public.products
  add column if not exists formule_section_id text
    references public.formule_sections (id) on update cascade on delete set null;

create index if not exists products_formule_section_sort_idx
  on public.products (formule_section_id, sort_order);

alter table public.formule_sections enable row level security;

create policy "formule_sections: lecture publique des actives"
  on public.formule_sections for select
  to anon, authenticated
  using (is_active = true or public.is_admin());

create policy "formule_sections: admin"
  on public.formule_sections for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select on public.formule_sections to anon, authenticated;
grant insert, update, delete on public.formule_sections to authenticated;

insert into public.formule_sections (id, name, sort_order, is_active) values
  ('formules-solo-duo-family', 'Formules Solo / Duo / Family', 0, true),
  ('formule-midi', 'Formule Midi', 1, true),
  ('promo', 'Promo', 2, true)
on conflict (id) do nothing;

-- Affectation initiale (no-op si produits absents ou déjà classés).
update public.products set formule_section_id = 'formules-solo-duo-family'
  where id in ('formule-duo', 'formule-family') and formule_section_id is null;
update public.products set formule_section_id = 'promo'
  where id in (
    'formule-zen-box', 'formule-yaki-box', 'formule-fry-box', 'formule-spring-box',
    'formule-kyoto-box', 'formule-nara-box', 'formule-crispy-box', 'formule-party-box',
    'formule-fusion-box', 'formule-master-box'
  ) and formule_section_id is null;

-- -----------------------------------------------------------------------------
-- admin_create_formule_section
-- -----------------------------------------------------------------------------
create or replace function public.admin_create_formule_section(
  p_id text,
  p_name text,
  p_is_active boolean default true,
  p_position integer default null
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
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

  insert into public.formule_sections (id, name, sort_order, is_active)
  values (p_id, v_name, new_sort, coalesce(p_is_active, true));

  select to_jsonb(s) - 'created_at' - 'updated_at' into after_state
    from public.formule_sections s where s.id = p_id;

  insert into public.audit_log (user_id, action, entity_type, entity_id, payload)
  values (auth.uid(), 'formule_section.create', 'formule_section', p_id,
          jsonb_build_object('after', after_state, 'position', p_position));

  return after_state;
end;
$$;

-- -----------------------------------------------------------------------------
-- admin_update_formule_section
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
    if k not in ('name', 'is_active') then
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

  update public.formule_sections
     set name = new_name, is_active = new_active
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

-- -----------------------------------------------------------------------------
-- admin_delete_formule_section : uniquement si aucune offre rattachée
-- -----------------------------------------------------------------------------
create or replace function public.admin_delete_formule_section(p_section_id text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  sec public.formule_sections%rowtype;
  n integer;
  before_state jsonb;
begin
  if not public.is_admin() then
    raise exception 'Accès refusé : droits administrateur requis.' using errcode = '42501';
  end if;

  lock table public.formule_sections in share row exclusive mode;

  select * into sec from public.formule_sections where id = p_section_id for update;
  if not found then
    raise exception 'Section introuvable : %.', p_section_id using errcode = 'P0002';
  end if;

  select count(*) into n from public.products where formule_section_id = p_section_id;
  if n > 0 then
    raise exception 'Cette section contient % offre(s). Déplacez-les avant de la supprimer.', n
      using errcode = '23503';
  end if;

  before_state := to_jsonb(sec) - 'created_at' - 'updated_at';
  delete from public.formule_sections where id = p_section_id;

  insert into public.audit_log (user_id, action, entity_type, entity_id, payload)
  values (auth.uid(), 'formule_section.delete', 'formule_section', p_section_id,
          jsonb_build_object('before', before_state));

  return before_state;
end;
$$;

-- -----------------------------------------------------------------------------
-- admin_set_formule_section : rattache une offre formules-promos à une section
-- et la place en position humaine (1…N) parmi les offres de cette section.
-- -----------------------------------------------------------------------------
create or replace function public.admin_set_formule_section(
  p_product_id text,
  p_section_id text,
  p_position integer default null
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  p public.products%rowtype;
  sibling_ids text[];
  sibling_sorts integer[];
  n integer;
  i integer;
  target integer;
  new_sort integer;
  base_sort integer;
  after_state jsonb;
begin
  if not public.is_admin() then
    raise exception 'Accès refusé : droits administrateur requis.' using errcode = '42501';
  end if;

  select * into p from public.products where id = p_product_id for update;
  if not found then
    raise exception 'Produit introuvable : %.', p_product_id using errcode = 'P0002';
  end if;
  if p.category_id <> 'formules-promos' then
    raise exception 'Seules les formules peuvent être placées dans une section.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.formule_sections where id = p_section_id) then
    raise exception 'Section introuvable : %.', p_section_id using errcode = '23503';
  end if;

  update public.products set formule_section_id = p_section_id where id = p_product_id;

  select coalesce(array_agg(x.id order by x.sort_order, x.id) filter (where x.id <> p_product_id), array[]::text[]),
         coalesce(array_agg(x.sort_order order by x.sort_order, x.id) filter (where x.id <> p_product_id), array[]::integer[])
    into sibling_ids, sibling_sorts
    from public.products x
   where x.category_id = 'formules-promos' and x.formule_section_id = p_section_id;

  n := coalesce(array_length(sibling_ids, 1), 0);
  target := coalesce(p_position, n + 1);
  if target < 1 or target > n + 1 then
    raise exception 'Position invalide : entre 1 et %.', n + 1 using errcode = '22023';
  end if;

  if n = 0 then
    -- seule offre de la section : conserver son sort_order
    null;
  else
    base_sort := sibling_sorts[1];
    -- Insérer p_product_id à target et renuméroter les sort_order de la section
    sibling_ids := sibling_ids[:target - 1] || array[p_product_id] || sibling_ids[target:];
    for i in 1..coalesce(array_length(sibling_ids, 1), 0) loop
      new_sort := base_sort + i - 1;
      -- éviter collisions avec d'autres sections : décaler toute la catégorie si besoin
      update public.products set sort_order = new_sort where id = sibling_ids[i];
    end loop;
  end if;

  select jsonb_build_object(
    'product_id', p_product_id,
    'formule_section_id', p_section_id,
    'position', target
  ) into after_state;

  insert into public.audit_log (user_id, action, entity_type, entity_id, payload)
  values (auth.uid(), 'formule_section.assign', 'product', p_product_id, after_state);

  return after_state;
end;
$$;

revoke all on function public.admin_create_formule_section(text, text, boolean, integer) from public;
revoke all on function public.admin_create_formule_section(text, text, boolean, integer) from anon;
grant execute on function public.admin_create_formule_section(text, text, boolean, integer) to authenticated;

revoke all on function public.admin_update_formule_section(text, jsonb, integer) from public;
revoke all on function public.admin_update_formule_section(text, jsonb, integer) from anon;
grant execute on function public.admin_update_formule_section(text, jsonb, integer) to authenticated;

revoke all on function public.admin_delete_formule_section(text) from public;
revoke all on function public.admin_delete_formule_section(text) from anon;
grant execute on function public.admin_delete_formule_section(text) to authenticated;

revoke all on function public.admin_set_formule_section(text, text, integer) from public;
revoke all on function public.admin_set_formule_section(text, text, integer) from anon;
grant execute on function public.admin_set_formule_section(text, text, integer) to authenticated;
