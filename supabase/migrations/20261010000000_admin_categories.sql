-- =============================================================================
-- Kaytôri Sushi — gestion des catégories depuis /admin/categories
--
-- AJOUTS UNIQUEMENT (aucune table, colonne ni politique RLS modifiée ; aucune donnée existante
-- modifiée par cette migration) :
--   - index unique categories_name_unique_idx : deux catégories ne peuvent pas porter le même
--     nom (casse et espaces de début/fin ignorés) — les 31 noms actuels sont déjà uniques ;
--   - admin_create_category : création (nom, visibilité, position) + journal category.create ;
--   - admin_update_category : renommage, masquer / afficher, déplacement atomique
--                             + journal category.update ;
--   - admin_delete_category : suppression d'une catégorie VIDE uniquement (produits masqués
--                             compris) + journal category.delete.
--
-- L'identifiant (slug) d'une catégorie ne change jamais, même après renommage : les produits
-- (products.category_id) et le mode d'affichage (display_mode, ex. tri Plats Thaï /
-- Assortiments par pièces) restent attachés à l'identifiant, pas au nom. display_mode n'est
-- pas modifiable ici ; une nouvelle catégorie est toujours en 'list'.
--
-- Toutes : security invoker (RLS existantes), set search_path = '', is_admin() vérifié,
-- exécution réservée à authenticated. Les trois fonctions verrouillent la table categories
-- (share row exclusive) : deux opérations simultanées sur l'ordre ne peuvent pas se croiser.
--
-- Positions (toutes les catégories, masquées comprises ; ordre = sort_order puis id) :
--   - création en position k : la catégorie prend la valeur de la k-ième, les suivantes +1 ;
--   - suppression : les suivantes −1 ;
--   - déplacement : redistribution des MÊMES valeurs (réversible exactement) ;
--   - valeurs en double : renumérotation (min, min+1, …).
-- =============================================================================

create unique index categories_name_unique_idx on public.categories (lower(btrim(name)));

-- -----------------------------------------------------------------------------
-- admin_create_category
-- -----------------------------------------------------------------------------
create function public.admin_create_category(
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
  base_sort integer;
  strictly_increasing boolean := true;
  shifted jsonb := '[]'::jsonb;
  after_state jsonb;
begin
  if not public.is_admin() then
    raise exception 'Accès refusé : droits administrateur requis.' using errcode = '42501';
  end if;
  if v_name = '' then
    raise exception 'Le nom de la catégorie est obligatoire.' using errcode = '22023';
  end if;
  if length(v_name) > 60 then
    raise exception 'Nom trop long (60 caractères maximum).' using errcode = '22023';
  end if;
  if p_id is null or length(p_id) > 64 or p_id !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'Identifiant de catégorie invalide.' using errcode = '22023';
  end if;
  if p_is_active is null then
    raise exception 'Statut invalide.' using errcode = '22023';
  end if;

  lock table public.categories in share row exclusive mode;

  if exists (select 1 from public.categories where id = p_id) then
    raise exception 'Identifiant de catégorie déjà utilisé : %.', p_id using errcode = '23505';
  end if;
  if exists (select 1 from public.categories where lower(btrim(name)) = lower(v_name)) then
    raise exception 'Une catégorie porte déjà ce nom.' using errcode = '23505';
  end if;

  select coalesce(array_agg(c.id order by c.sort_order, c.id), array[]::text[]),
         coalesce(array_agg(c.sort_order order by c.sort_order, c.id), array[]::integer[])
    into ids, sorts
    from public.categories c;
  n := coalesce(array_length(ids, 1), 0);

  if p_position is not null and (p_position < 1 or p_position > n + 1) then
    raise exception 'Position invalide : entre 1 et %.', n + 1 using errcode = '22023';
  end if;

  if p_position is null or p_position = n + 1 then
    new_sort := coalesce(sorts[n] + 1, 0);
  else
    for i in 2..n loop
      if sorts[i] <= sorts[i - 1] then strictly_increasing := false; end if;
    end loop;
    if strictly_increasing then
      new_sort := sorts[p_position];
      for i in reverse n..p_position loop
        update public.categories set sort_order = sort_order + 1 where id = ids[i];
        shifted := shifted || jsonb_build_object('id', ids[i], 'before', sorts[i], 'after', sorts[i] + 1);
      end loop;
    else
      base_sort := sorts[1];
      new_sort := base_sort + p_position - 1;
      for i in 1..n loop
        if (case when i < p_position then base_sort + i - 1 else base_sort + i end) <> sorts[i] then
          update public.categories
             set sort_order = case when i < p_position then base_sort + i - 1 else base_sort + i end
           where id = ids[i];
          shifted := shifted || jsonb_build_object('id', ids[i], 'before', sorts[i],
            'after', case when i < p_position then base_sort + i - 1 else base_sort + i end);
        end if;
      end loop;
    end if;
  end if;

  insert into public.categories (id, name, sort_order, is_active, display_mode)
  values (p_id, v_name, new_sort, p_is_active, 'list');

  select to_jsonb(c) - 'created_at' - 'updated_at' into after_state from public.categories c where c.id = p_id;

  insert into public.audit_log (user_id, action, entity_type, entity_id, payload)
  values (auth.uid(), 'category.create', 'category', p_id,
          jsonb_build_object('after', after_state, 'position', p_position, 'shifted', shifted));

  return after_state;
end;
$$;

-- -----------------------------------------------------------------------------
-- admin_update_category : p_changes peut contenir name et/ou is_active (rien d'autre) ;
-- p_position (facultatif) déplace la catégorie à cette position (1…N).
-- -----------------------------------------------------------------------------
create function public.admin_update_category(
  p_category_id text,
  p_changes jsonb default '{}'::jsonb,
  p_position integer default null
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  cat public.categories%rowtype;
  k text;
  new_name text;
  new_active boolean;
  new_sort integer;
  ids text[];
  sorts integer[];
  slots integer[];
  ordered text[];
  n integer;
  i integer;
  cur integer;
  strictly_increasing boolean := true;
  shifted jsonb := '[]'::jsonb;
  before_state jsonb;
  after_state jsonb;
begin
  if not public.is_admin() then
    raise exception 'Accès refusé : droits administrateur requis.' using errcode = '42501';
  end if;
  if p_changes is null or jsonb_typeof(p_changes) <> 'object' then
    raise exception 'Modifications invalides.' using errcode = '22023';
  end if;
  for k in select jsonb_object_keys(p_changes) loop
    if k not in ('name', 'is_active') then
      raise exception 'Champ de catégorie non modifiable : %.', k using errcode = '22023';
    end if;
  end loop;

  lock table public.categories in share row exclusive mode;

  select * into cat from public.categories where id = p_category_id;
  if not found then
    raise exception 'Catégorie introuvable : %.', p_category_id using errcode = 'P0002';
  end if;
  before_state := to_jsonb(cat) - 'created_at' - 'updated_at';

  new_name := cat.name;
  if p_changes ? 'name' then
    if jsonb_typeof(p_changes -> 'name') <> 'string' then
      raise exception 'Le nom de la catégorie est obligatoire.' using errcode = '22023';
    end if;
    new_name := btrim(p_changes ->> 'name');
    if new_name = '' then
      raise exception 'Le nom de la catégorie est obligatoire.' using errcode = '22023';
    end if;
    if length(new_name) > 60 then
      raise exception 'Nom trop long (60 caractères maximum).' using errcode = '22023';
    end if;
    if exists (select 1 from public.categories where id <> p_category_id and lower(btrim(name)) = lower(new_name)) then
      raise exception 'Une catégorie porte déjà ce nom.' using errcode = '23505';
    end if;
  end if;

  new_active := cat.is_active;
  if p_changes ? 'is_active' then
    if jsonb_typeof(p_changes -> 'is_active') <> 'boolean' then
      raise exception 'Statut invalide.' using errcode = '22023';
    end if;
    new_active := (p_changes ->> 'is_active')::boolean;
  end if;

  new_sort := cat.sort_order;
  if p_position is not null then
    select array_agg(c.id order by c.sort_order, c.id), array_agg(c.sort_order order by c.sort_order, c.id)
      into ids, sorts
      from public.categories c;
    n := array_length(ids, 1);
    if p_position < 1 or p_position > n then
      raise exception 'Position invalide : entre 1 et %.', n using errcode = '22023';
    end if;
    cur := array_position(ids, p_category_id);
    if cur <> p_position then
      for i in 2..n loop
        if sorts[i] <= sorts[i - 1] then strictly_increasing := false; end if;
      end loop;
      if strictly_increasing then
        slots := sorts;
      else
        slots := array(select sorts[1] + g - 1 from generate_series(1, n) g);
      end if;
      ordered := array_remove(ids, p_category_id);
      ordered := ordered[1:p_position - 1] || p_category_id || ordered[p_position:n - 1];
      for i in 1..n loop
        if ordered[i] = p_category_id then
          new_sort := slots[i];
        elsif slots[i] <> sorts[array_position(ids, ordered[i])] then
          update public.categories set sort_order = slots[i] where id = ordered[i];
          shifted := shifted || jsonb_build_object('id', ordered[i],
            'before', sorts[array_position(ids, ordered[i])], 'after', slots[i]);
        end if;
      end loop;
    end if;
  end if;

  -- id et display_mode jamais modifiés.
  update public.categories
     set name = new_name,
         is_active = new_active,
         sort_order = new_sort
   where id = p_category_id;

  select to_jsonb(c) - 'created_at' - 'updated_at' into after_state from public.categories c where c.id = p_category_id;

  insert into public.audit_log (user_id, action, entity_type, entity_id, payload)
  values (auth.uid(), 'category.update', 'category', p_category_id,
          jsonb_build_object('before', before_state, 'after', after_state,
                             'position', p_position, 'shifted', shifted));

  return after_state;
end;
$$;

-- -----------------------------------------------------------------------------
-- admin_delete_category : uniquement si AUCUN produit (actif ou masqué) n'y est rattaché.
-- -----------------------------------------------------------------------------
create function public.admin_delete_category(p_category_id text) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  cat public.categories%rowtype;
  product_count integer;
  ids text[];
  sorts integer[];
  n integer;
  i integer;
  cur integer;
  base_sort integer;
  strictly_increasing boolean := true;
  shifted jsonb := '[]'::jsonb;
  before_state jsonb;
begin
  if not public.is_admin() then
    raise exception 'Accès refusé : droits administrateur requis.' using errcode = '42501';
  end if;

  lock table public.categories in share row exclusive mode;

  select * into cat from public.categories where id = p_category_id;
  if not found then
    raise exception 'Catégorie introuvable : %.', p_category_id using errcode = 'P0002';
  end if;

  -- Verrouille les produits de la catégorie : aucun ne peut y être ajouté pendant la vérification.
  perform 1 from public.products where category_id = p_category_id for update;
  select count(*) into product_count from public.products where category_id = p_category_id;
  if product_count > 0 then
    raise exception '%', case when product_count = 1
        then 'Cette catégorie contient 1 produit. Déplacez-le avant de la supprimer.'
        else format('Cette catégorie contient %s produits. Déplacez-les avant de la supprimer.', product_count)
      end
      using errcode = '23503', detail = product_count::text;
  end if;

  before_state := to_jsonb(cat) - 'created_at' - 'updated_at';

  select array_agg(c.id order by c.sort_order, c.id), array_agg(c.sort_order order by c.sort_order, c.id)
    into ids, sorts
    from public.categories c;
  n := array_length(ids, 1);
  for i in 2..n loop
    if sorts[i] <= sorts[i - 1] then strictly_increasing := false; end if;
  end loop;
  cur := array_position(ids, p_category_id);
  if strictly_increasing then
    for i in cur + 1..n loop
      update public.categories set sort_order = sort_order - 1 where id = ids[i];
      shifted := shifted || jsonb_build_object('id', ids[i], 'before', sorts[i], 'after', sorts[i] - 1);
    end loop;
  else
    base_sort := sorts[1];
    cur := 0;
    for i in 1..n loop
      if ids[i] <> p_category_id then
        if base_sort + cur <> sorts[i] then
          update public.categories set sort_order = base_sort + cur where id = ids[i];
          shifted := shifted || jsonb_build_object('id', ids[i], 'before', sorts[i], 'after', base_sort + cur);
        end if;
        cur := cur + 1;
      end if;
    end loop;
  end if;

  delete from public.categories where id = p_category_id;

  insert into public.audit_log (user_id, action, entity_type, entity_id, payload)
  values (auth.uid(), 'category.delete', 'category', p_category_id,
          jsonb_build_object('before', before_state, 'shifted', shifted));

  return jsonb_build_object('deleted', before_state, 'shifted', shifted);
end;
$$;

revoke all on function public.admin_create_category(text, text, boolean, integer) from public;
revoke all on function public.admin_create_category(text, text, boolean, integer) from anon;
grant execute on function public.admin_create_category(text, text, boolean, integer) to authenticated;

revoke all on function public.admin_update_category(text, jsonb, integer) from public;
revoke all on function public.admin_update_category(text, jsonb, integer) from anon;
grant execute on function public.admin_update_category(text, jsonb, integer) to authenticated;

revoke all on function public.admin_delete_category(text) from public;
revoke all on function public.admin_delete_category(text) from anon;
grant execute on function public.admin_delete_category(text) to authenticated;
