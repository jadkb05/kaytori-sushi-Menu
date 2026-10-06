-- =============================================================================
-- Kaytôri Sushi — catalogue complet depuis /admin (Phase 3E)
--
-- AJOUTS UNIQUEMENT (aucune table, colonne ni politique RLS modifiée ; aucune donnée existante
-- modifiée par cette migration) :
--   - admin_save_product   : enregistrement atomique d'un produit (champs, photo, catégorie,
--                            position, liste finale des variantes : ajouts / modifications /
--                            suppressions / ordre) + journal ;
--   - admin_delete_product : suppression atomique (variantes en cascade, produits suivants
--                            remontés) + journal ;
--   - admin_create_product : même signature, prix parent = variante ACTIVE la moins chère
--                            (règle commune avec admin_save_product).
-- admin_update_product (Phase 3B) reste inchangée.
--
-- Toutes : security invoker (RLS existantes), set search_path = '', is_admin() vérifié,
-- exécution réservée à authenticated. Aucune ne supprime de fichier Storage.
--
-- Positions (catégories à ordre manuel ; ordre affiché = sort_order puis id) :
--   - insertion en position k  : le produit prend la valeur du k-ième, les suivants +1 ;
--   - retrait (suppression / changement de catégorie) : les suivants −1 ;
--   - déplacement dans la catégorie : redistribution des MÊMES valeurs (réversible exactement) ;
--   - valeurs en double dans une catégorie : renumérotation (min, min+1, …) ;
--   - catégories à ordre automatique (Plats Thaï, Assortiments) : ajout en fin, aucun décalage.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- admin_create_product : identique à la Phase 3D, sauf le prix parent avec variantes
-- (variante ACTIVE la moins chère ; repli sur toutes les variantes si aucune n'est active).
-- -----------------------------------------------------------------------------
create or replace function public.admin_create_product(
  p_product jsonb,
  p_variants jsonb default '[]'::jsonb,
  p_position integer default null
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  product_fields constant text[] := array['id', 'name', 'description', 'price', 'category_id', 'is_active', 'image_url'];
  variant_fields constant text[] := array['id', 'label', 'price', 'sort_order', 'is_active'];
  k text;
  item jsonb;
  new_id text;
  new_name text;
  new_description text;
  new_price numeric;
  min_active numeric;
  min_all numeric;
  new_category text;
  new_active boolean := true;
  new_image text;
  v_display_mode text;
  has_variants boolean;
  seen_variant_ids text[] := array[]::text[];
  v_id text;
  v_price numeric;
  sibling_ids text[];
  sibling_sorts integer[];
  n integer;
  strictly_increasing boolean := true;
  new_sort integer;
  base_sort integer;
  i integer;
  shifted jsonb := '[]'::jsonb;
  result jsonb;
begin
  if not public.is_admin() then
    raise exception 'Accès refusé : droits administrateur requis.' using errcode = '42501';
  end if;

  p_variants := coalesce(p_variants, '[]'::jsonb);
  if p_product is null or jsonb_typeof(p_product) <> 'object' then
    raise exception 'Données produit invalides.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_variants) <> 'array' then
    raise exception 'Données des variantes invalides.' using errcode = '22023';
  end if;
  for k in select jsonb_object_keys(p_product) loop
    if not k = any(product_fields) then
      raise exception 'Champ produit non autorisé : %.', k using errcode = '22023';
    end if;
  end loop;
  has_variants := jsonb_array_length(p_variants) > 0;

  if jsonb_typeof(p_product -> 'id') is distinct from 'string' or (p_product ->> 'id') !~ '^[0-9a-f]{10}$' then
    raise exception 'Identifiant produit invalide (10 caractères hexadécimaux).' using errcode = '22023';
  end if;
  new_id := p_product ->> 'id';
  if exists (select 1 from public.products where id = new_id) then
    raise exception 'Identifiant produit déjà utilisé : %.', new_id using errcode = '23505';
  end if;

  if jsonb_typeof(p_product -> 'name') is distinct from 'string' or btrim(p_product ->> 'name') = '' then
    raise exception 'Le nom du produit est obligatoire.' using errcode = '22023';
  end if;
  new_name := btrim(p_product ->> 'name');

  if p_product ? 'description' and jsonb_typeof(p_product -> 'description') not in ('string', 'null') then
    raise exception 'Description invalide.' using errcode = '22023';
  end if;
  new_description := coalesce(p_product ->> 'description', '');

  if jsonb_typeof(p_product -> 'category_id') is distinct from 'string' then
    raise exception 'La catégorie est obligatoire.' using errcode = '22023';
  end if;
  new_category := p_product ->> 'category_id';
  select c.display_mode into v_display_mode from public.categories c where c.id = new_category;
  if not found then
    raise exception 'Catégorie inexistante : %.', new_category using errcode = '23503';
  end if;

  if p_product ? 'is_active' then
    if jsonb_typeof(p_product -> 'is_active') <> 'boolean' then
      raise exception 'Statut invalide.' using errcode = '22023';
    end if;
    new_active := (p_product ->> 'is_active')::boolean;
  end if;

  if jsonb_typeof(p_product -> 'image_url') is distinct from 'string' or btrim(p_product ->> 'image_url') = '' then
    raise exception 'La photo est obligatoire pour créer un produit.' using errcode = '22023';
  end if;
  new_image := btrim(p_product ->> 'image_url');

  if has_variants then
    if p_product ? 'price' then
      raise exception 'Produit à variantes : le prix se définit au niveau des variantes.' using errcode = '22023';
    end if;
  else
    if jsonb_typeof(p_product -> 'price') is distinct from 'number' then
      raise exception 'Le prix est obligatoire.' using errcode = '22023';
    end if;
    new_price := (p_product ->> 'price')::numeric;
    if new_price < 0 or new_price <> round(new_price, 2) or new_price >= 100000000 then
      raise exception 'Prix invalide : nombre positif avec au plus 2 décimales.' using errcode = '22023';
    end if;
  end if;

  for item in select * from jsonb_array_elements(p_variants) loop
    if jsonb_typeof(item) <> 'object' then
      raise exception 'Variante invalide.' using errcode = '22023';
    end if;
    for k in select jsonb_object_keys(item) loop
      if not k = any(variant_fields) then
        raise exception 'Champ de variante non autorisé : %.', k using errcode = '22023';
      end if;
    end loop;
    if jsonb_typeof(item -> 'id') is distinct from 'string' or (item ->> 'id') !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
      raise exception 'Identifiant de variante invalide : %.', coalesce(item ->> 'id', '(vide)') using errcode = '22023';
    end if;
    v_id := item ->> 'id';
    if v_id = any(seen_variant_ids) then
      raise exception 'Deux variantes ont le même identifiant : %.', v_id using errcode = '22023';
    end if;
    seen_variant_ids := seen_variant_ids || v_id;
    if jsonb_typeof(item -> 'label') is distinct from 'string' or btrim(item ->> 'label') = '' then
      raise exception 'Le libellé de la variante % est obligatoire.', v_id using errcode = '22023';
    end if;
    if jsonb_typeof(item -> 'price') is distinct from 'number'
       or (item ->> 'price')::numeric < 0
       or (item ->> 'price')::numeric <> round((item ->> 'price')::numeric, 2)
       or (item ->> 'price')::numeric >= 100000000 then
      raise exception 'Prix invalide pour la variante %.', v_id using errcode = '22023';
    end if;
    if jsonb_typeof(item -> 'sort_order') is distinct from 'number'
       or (item ->> 'sort_order')::numeric < 0
       or (item ->> 'sort_order')::numeric <> trunc((item ->> 'sort_order')::numeric)
       or (item ->> 'sort_order')::numeric > 2147483647 then
      raise exception 'Ordre invalide pour la variante %.', v_id using errcode = '22023';
    end if;
    if item ? 'is_active' and jsonb_typeof(item -> 'is_active') <> 'boolean' then
      raise exception 'Statut invalide pour la variante %.', v_id using errcode = '22023';
    end if;
    v_price := (item ->> 'price')::numeric;
    if min_all is null or v_price < min_all then min_all := v_price; end if;
    if coalesce((item ->> 'is_active')::boolean, true) and (min_active is null or v_price < min_active) then
      min_active := v_price;
    end if;
  end loop;
  if has_variants then
    new_price := coalesce(min_active, min_all); -- prix parent = variante active la moins chère
  end if;

  perform 1 from public.products where category_id = new_category for update;
  select coalesce(array_agg(p.id order by p.sort_order, p.id), array[]::text[]),
         coalesce(array_agg(p.sort_order order by p.sort_order, p.id), array[]::integer[])
    into sibling_ids, sibling_sorts
    from public.products p where p.category_id = new_category;
  n := coalesce(array_length(sibling_ids, 1), 0);
  for i in 2..n loop
    if sibling_sorts[i] <= sibling_sorts[i - 1] then strictly_increasing := false; end if;
  end loop;

  if v_display_mode <> 'list' then
    new_sort := case when n = 0 then 0 else sibling_sorts[n] + 1 end;
  else
    if p_position is null or p_position < 1 or p_position > n + 1 then
      raise exception 'Position invalide : entre 1 et %.', n + 1 using errcode = '22023';
    end if;
    if p_position = n + 1 then
      new_sort := case when n = 0 then 0 else sibling_sorts[n] + 1 end;
    elsif strictly_increasing then
      new_sort := sibling_sorts[p_position];
      for i in reverse n..p_position loop
        update public.products set sort_order = sort_order + 1 where id = sibling_ids[i];
        shifted := shifted || jsonb_build_object('id', sibling_ids[i], 'before', sibling_sorts[i], 'after', sibling_sorts[i] + 1);
      end loop;
    else
      base_sort := sibling_sorts[1];
      new_sort := base_sort + p_position - 1;
      for i in 1..n loop
        if (case when i < p_position then base_sort + i - 1 else base_sort + i end) <> sibling_sorts[i] then
          update public.products
             set sort_order = case when i < p_position then base_sort + i - 1 else base_sort + i end
           where id = sibling_ids[i];
          shifted := shifted || jsonb_build_object('id', sibling_ids[i], 'before', sibling_sorts[i],
            'after', case when i < p_position then base_sort + i - 1 else base_sort + i end);
        end if;
      end loop;
    end if;
  end if;

  insert into public.products (id, category_id, name, description, price, currency, image_url, sort_order, is_active)
  values (new_id, new_category, new_name, new_description, new_price, 'MAD', new_image, new_sort, new_active);

  insert into public.product_variants (product_id, id, label, price, sort_order, is_active)
  select new_id, x ->> 'id', btrim(x ->> 'label'), (x ->> 'price')::numeric, (x ->> 'sort_order')::integer,
         coalesce((x ->> 'is_active')::boolean, true)
    from jsonb_array_elements(p_variants) x;

  select jsonb_build_object(
           'product', (select to_jsonb(p) - 'created_at' - 'updated_at' from public.products p where p.id = new_id),
           'variants', coalesce((
             select jsonb_agg(to_jsonb(v) - 'created_at' - 'updated_at' order by v.sort_order, v.id)
             from public.product_variants v where v.product_id = new_id), '[]'::jsonb))
    into result;

  insert into public.audit_log (user_id, action, entity_type, entity_id, payload)
  values (auth.uid(), 'product.create', 'product', new_id,
          jsonb_build_object('created', result, 'position', p_position, 'shifted', shifted));

  return result;
end;
$$;

-- -----------------------------------------------------------------------------
-- admin_save_product : enregistrement complet d'un produit existant (une transaction).
--   p_product  : champs à modifier parmi name, description, price, category_id, is_active, image_url
--   p_variants : null = variantes inchangées ;
--                tableau = LISTE FINALE ORDONNÉE [{ id, label, price, is_active? }] :
--                id existant → modifié, id nouveau (slug) → créé, variante absente → supprimée ;
--                ordre interne = position dans la liste (0, 1, 2…).
--   p_position : position humaine dans la catégorie (actuelle ou nouvelle) ; null = inchangée
--                (en cas de changement de catégorie sans position : en dernier).
-- Prix parent : saisi seulement SANS variantes ; recalculé (variante active la moins chère)
--               uniquement quand la liste des variantes est fournie.
-- -----------------------------------------------------------------------------
create function public.admin_save_product(
  p_product_id text,
  p_product jsonb default '{}'::jsonb,
  p_variants jsonb default null,
  p_position integer default null
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  product_fields constant text[] := array['name', 'description', 'price', 'category_id', 'is_active', 'image_url'];
  variant_fields constant text[] := array['id', 'label', 'price', 'is_active'];
  p public.products%rowtype;
  k text;
  item jsonb;
  i integer;
  v_id text;
  v_old public.product_variants%rowtype;
  seen_variant_ids text[] := array[]::text[];
  new_name text;
  new_description text;
  new_price numeric;
  new_category text;
  new_active boolean;
  new_image text;
  new_sort integer;
  old_mode text;
  new_mode text;
  moving boolean;
  variants_after integer;
  min_active numeric;
  min_all numeric;
  -- positions
  sibling_ids text[];
  sibling_sorts integer[];
  n integer;
  strictly_increasing boolean;
  cur integer;
  base_sort integer;
  slots integer[];
  ordered text[];
  shifted jsonb := '[]'::jsonb;
  created_ids text[] := array[]::text[];
  updated_ids text[] := array[]::text[];
  deleted_ids text[] := array[]::text[];
  before_state jsonb;
  after_state jsonb;
begin
  -- 1. Droits et forme des données.
  if not public.is_admin() then
    raise exception 'Accès refusé : droits administrateur requis.' using errcode = '42501';
  end if;
  p_product := coalesce(p_product, '{}'::jsonb);
  if jsonb_typeof(p_product) <> 'object' then
    raise exception 'Données produit invalides.' using errcode = '22023';
  end if;
  if p_variants is not null and jsonb_typeof(p_variants) <> 'array' then
    raise exception 'Données des variantes invalides.' using errcode = '22023';
  end if;
  for k in select jsonb_object_keys(p_product) loop
    if not k = any(product_fields) then
      raise exception 'Champ produit non modifiable : %.', k using errcode = '22023';
    end if;
  end loop;

  select * into p from public.products where id = p_product_id for update;
  if not found then
    raise exception 'Produit introuvable : %.', p_product_id using errcode = 'P0002';
  end if;

  before_state := jsonb_build_object(
    'product', to_jsonb(p) - 'created_at' - 'updated_at',
    'variants', coalesce((
      select jsonb_agg(to_jsonb(x) - 'created_at' - 'updated_at' order by x.sort_order, x.id)
      from public.product_variants x where x.product_id = p_product_id), '[]'::jsonb));

  -- 2. Champs du produit.
  new_name := p.name;
  if p_product ? 'name' then
    if jsonb_typeof(p_product -> 'name') <> 'string' or btrim(p_product ->> 'name') = '' then
      raise exception 'Le nom du produit est obligatoire.' using errcode = '22023';
    end if;
    new_name := btrim(p_product ->> 'name');
  end if;

  new_description := p.description;
  if p_product ? 'description' then
    if jsonb_typeof(p_product -> 'description') not in ('string', 'null') then
      raise exception 'Description invalide.' using errcode = '22023';
    end if;
    new_description := p_product ->> 'description';
  end if;

  new_category := p.category_id;
  if p_product ? 'category_id' then
    if jsonb_typeof(p_product -> 'category_id') <> 'string' then
      raise exception 'Catégorie invalide.' using errcode = '22023';
    end if;
    new_category := p_product ->> 'category_id';
  end if;
  select c.display_mode into new_mode from public.categories c where c.id = new_category;
  if not found then
    raise exception 'Catégorie inexistante : %.', new_category using errcode = '23503';
  end if;
  select c.display_mode into old_mode from public.categories c where c.id = p.category_id;
  moving := new_category <> p.category_id;

  new_active := p.is_active;
  if p_product ? 'is_active' then
    if jsonb_typeof(p_product -> 'is_active') <> 'boolean' then
      raise exception 'Statut invalide.' using errcode = '22023';
    end if;
    new_active := (p_product ->> 'is_active')::boolean;
  end if;

  new_image := p.image_url;
  if p_product ? 'image_url' then
    if jsonb_typeof(p_product -> 'image_url') <> 'string' or btrim(p_product ->> 'image_url') = '' then
      raise exception 'Photo invalide.' using errcode = '22023';
    end if;
    new_image := btrim(p_product ->> 'image_url');
  end if;

  -- 3. Variantes : validation complète de la liste finale (avant toute écriture).
  if p_variants is null then
    variants_after := (select count(*) from public.product_variants where product_id = p_product_id);
  else
    variants_after := jsonb_array_length(p_variants);
    for item in select * from jsonb_array_elements(p_variants) loop
      if jsonb_typeof(item) <> 'object' then
        raise exception 'Variante invalide.' using errcode = '22023';
      end if;
      for k in select jsonb_object_keys(item) loop
        if not k = any(variant_fields) then
          raise exception 'Champ de variante non modifiable : %.', k using errcode = '22023';
        end if;
      end loop;
      if jsonb_typeof(item -> 'id') is distinct from 'string' or (item ->> 'id') !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
        raise exception 'Identifiant de variante invalide : %.', coalesce(item ->> 'id', '(vide)') using errcode = '22023';
      end if;
      v_id := item ->> 'id';
      if v_id = any(seen_variant_ids) then
        raise exception 'Cette variante existe déjà : %.', v_id using errcode = '23505';
      end if;
      seen_variant_ids := seen_variant_ids || v_id;
      if jsonb_typeof(item -> 'label') is distinct from 'string' or btrim(item ->> 'label') = '' then
        raise exception 'Le libellé de la variante % est obligatoire.', v_id using errcode = '22023';
      end if;
      if jsonb_typeof(item -> 'price') is distinct from 'number'
         or (item ->> 'price')::numeric < 0
         or (item ->> 'price')::numeric <> round((item ->> 'price')::numeric, 2)
         or (item ->> 'price')::numeric >= 100000000 then
        raise exception 'Prix invalide pour la variante %.', v_id using errcode = '22023';
      end if;
      if item ? 'is_active' and jsonb_typeof(item -> 'is_active') <> 'boolean' then
        raise exception 'Statut invalide pour la variante %.', v_id using errcode = '22023';
      end if;
    end loop;
  end if;

  -- 4. Prix parent : saisi uniquement pour un produit SANS variantes (après enregistrement).
  new_price := p.price;
  if p_product ? 'price' then
    if variants_after > 0 then
      raise exception 'Produit à variantes : le prix se modifie au niveau des variantes.' using errcode = '22023';
    end if;
    if jsonb_typeof(p_product -> 'price') <> 'number' then
      raise exception 'Prix invalide.' using errcode = '22023';
    end if;
    new_price := (p_product ->> 'price')::numeric;
    if new_price < 0 or new_price <> round(new_price, 2) or new_price >= 100000000 then
      raise exception 'Prix invalide : nombre positif avec au plus 2 décimales.' using errcode = '22023';
    end if;
  end if;

  -- 5. Position (atomique, dans cette transaction).
  new_sort := p.sort_order;
  if moving then
    -- 5a. Départ de l'ancienne catégorie : les produits suivants remontent (ordre manuel).
    if old_mode = 'list' then
      perform 1 from public.products where category_id = p.category_id for update;
      select coalesce(array_agg(x.id order by x.sort_order, x.id), array[]::text[]),
             coalesce(array_agg(x.sort_order order by x.sort_order, x.id), array[]::integer[])
        into sibling_ids, sibling_sorts
        from public.products x where x.category_id = p.category_id;
      n := coalesce(array_length(sibling_ids, 1), 0);
      strictly_increasing := true;
      for i in 2..n loop
        if sibling_sorts[i] <= sibling_sorts[i - 1] then strictly_increasing := false; end if;
      end loop;
      cur := array_position(sibling_ids, p_product_id);
      if strictly_increasing then
        for i in cur + 1..n loop
          update public.products set sort_order = sort_order - 1 where id = sibling_ids[i];
          shifted := shifted || jsonb_build_object('id', sibling_ids[i], 'before', sibling_sorts[i], 'after', sibling_sorts[i] - 1);
        end loop;
      else
        base_sort := sibling_sorts[1];
        cur := 0;
        for i in 1..n loop
          if sibling_ids[i] <> p_product_id then
            if base_sort + cur <> sibling_sorts[i] then
              update public.products set sort_order = base_sort + cur where id = sibling_ids[i];
              shifted := shifted || jsonb_build_object('id', sibling_ids[i], 'before', sibling_sorts[i], 'after', base_sort + cur);
            end if;
            cur := cur + 1;
          end if;
        end loop;
      end if;
    end if;

    -- 5b. Arrivée dans la nouvelle catégorie : position demandée (manuel) ou en dernier.
    perform 1 from public.products where category_id = new_category for update;
    select coalesce(array_agg(x.id order by x.sort_order, x.id), array[]::text[]),
           coalesce(array_agg(x.sort_order order by x.sort_order, x.id), array[]::integer[])
      into sibling_ids, sibling_sorts
      from public.products x where x.category_id = new_category;
    n := coalesce(array_length(sibling_ids, 1), 0);
    if new_mode <> 'list' or p_position is null then
      -- Ordre automatique, ou position non précisée : en dernier.
      new_sort := case when n = 0 then 0 else sibling_sorts[n] + 1 end;
    else
      if p_position < 1 or p_position > n + 1 then
        raise exception 'Position invalide : entre 1 et %.', n + 1 using errcode = '22023';
      end if;
      strictly_increasing := true;
      for i in 2..n loop
        if sibling_sorts[i] <= sibling_sorts[i - 1] then strictly_increasing := false; end if;
      end loop;
      if p_position = n + 1 then
        new_sort := case when n = 0 then 0 else sibling_sorts[n] + 1 end;
      elsif strictly_increasing then
        new_sort := sibling_sorts[p_position];
        for i in reverse n..p_position loop
          update public.products set sort_order = sort_order + 1 where id = sibling_ids[i];
          shifted := shifted || jsonb_build_object('id', sibling_ids[i], 'before', sibling_sorts[i], 'after', sibling_sorts[i] + 1);
        end loop;
      else
        base_sort := sibling_sorts[1];
        new_sort := base_sort + p_position - 1;
        for i in 1..n loop
          if (case when i < p_position then base_sort + i - 1 else base_sort + i end) <> sibling_sorts[i] then
            update public.products
               set sort_order = case when i < p_position then base_sort + i - 1 else base_sort + i end
             where id = sibling_ids[i];
            shifted := shifted || jsonb_build_object('id', sibling_ids[i], 'before', sibling_sorts[i],
              'after', case when i < p_position then base_sort + i - 1 else base_sort + i end);
          end if;
        end loop;
      end if;
    end if;
  elsif p_position is not null and new_mode = 'list' then
    -- 5c. Déplacement dans la même catégorie : redistribution des mêmes valeurs.
    perform 1 from public.products where category_id = new_category for update;
    select coalesce(array_agg(x.id order by x.sort_order, x.id), array[]::text[]),
           coalesce(array_agg(x.sort_order order by x.sort_order, x.id), array[]::integer[])
      into sibling_ids, sibling_sorts
      from public.products x where x.category_id = new_category;
    n := coalesce(array_length(sibling_ids, 1), 0);
    if p_position < 1 or p_position > n then
      raise exception 'Position invalide : entre 1 et %.', n using errcode = '22023';
    end if;
    cur := array_position(sibling_ids, p_product_id);
    if cur <> p_position then
      strictly_increasing := true;
      for i in 2..n loop
        if sibling_sorts[i] <= sibling_sorts[i - 1] then strictly_increasing := false; end if;
      end loop;
      if strictly_increasing then
        slots := sibling_sorts;
      else
        slots := array(select sibling_sorts[1] + g - 1 from generate_series(1, n) g);
      end if;
      ordered := array_remove(sibling_ids, p_product_id);
      ordered := ordered[1:p_position - 1] || p_product_id || ordered[p_position:n - 1];
      for i in 1..n loop
        if ordered[i] = p_product_id then
          new_sort := slots[i];
        elsif slots[i] <> sibling_sorts[array_position(sibling_ids, ordered[i])] then
          update public.products set sort_order = slots[i] where id = ordered[i];
          shifted := shifted || jsonb_build_object('id', ordered[i],
            'before', sibling_sorts[array_position(sibling_ids, ordered[i])], 'after', slots[i]);
        end if;
      end loop;
    end if;
  end if;

  -- 6. Produit (id et devise jamais modifiés).
  update public.products
     set name = new_name,
         description = new_description,
         price = new_price,
         category_id = new_category,
         is_active = new_active,
         image_url = new_image,
         sort_order = new_sort
   where id = p_product_id;

  -- 7. Variantes : liste finale (suppressions, modifications, créations, ordre 0..n-1).
  if p_variants is not null then
    select coalesce(array_agg(v.id order by v.id), array[]::text[]) into deleted_ids
      from public.product_variants v
     where v.product_id = p_product_id and not (v.id = any(seen_variant_ids));
    delete from public.product_variants where product_id = p_product_id and id = any(deleted_ids);

    i := 0;
    for item in select * from jsonb_array_elements(p_variants) loop
      v_id := item ->> 'id';
      select * into v_old from public.product_variants where product_id = p_product_id and id = v_id for update;
      if found then
        if v_old.label <> btrim(item ->> 'label') or v_old.price <> (item ->> 'price')::numeric
           or v_old.sort_order <> i or v_old.is_active <> coalesce((item ->> 'is_active')::boolean, v_old.is_active) then
          update public.product_variants
             set label = btrim(item ->> 'label'),
                 price = (item ->> 'price')::numeric,
                 sort_order = i,
                 is_active = coalesce((item ->> 'is_active')::boolean, v_old.is_active)
           where product_id = p_product_id and id = v_id;
          updated_ids := updated_ids || v_id;
        end if;
      else
        insert into public.product_variants (product_id, id, label, price, sort_order, is_active)
        values (p_product_id, v_id, btrim(item ->> 'label'), (item ->> 'price')::numeric, i,
                coalesce((item ->> 'is_active')::boolean, true));
        created_ids := created_ids || v_id;
      end if;
      i := i + 1;
    end loop;

    -- Prix parent = variante active la moins chère (repli : toutes les variantes).
    if variants_after > 0 then
      select min(v.price) filter (where v.is_active), min(v.price) into min_active, min_all
        from public.product_variants v where v.product_id = p_product_id;
      update public.products set price = coalesce(min_active, min_all) where id = p_product_id;
    end if;
  end if;

  -- 8. État enregistré + journal (une seule entrée, même transaction).
  select * into p from public.products where id = p_product_id;
  after_state := jsonb_build_object(
    'product', to_jsonb(p) - 'created_at' - 'updated_at',
    'variants', coalesce((
      select jsonb_agg(to_jsonb(x) - 'created_at' - 'updated_at' order by x.sort_order, x.id)
      from public.product_variants x where x.product_id = p_product_id), '[]'::jsonb));

  insert into public.audit_log (user_id, action, entity_type, entity_id, payload)
  values (auth.uid(), 'product.update', 'product', p_product_id,
          jsonb_build_object(
            'before', before_state,
            'after', after_state,
            'changes', jsonb_build_object(
              'variants_created', to_jsonb(created_ids),
              'variants_updated', to_jsonb(updated_ids),
              'variants_deleted', to_jsonb(deleted_ids),
              'photo_changed', (before_state #>> '{product,image_url}') is distinct from (after_state #>> '{product,image_url}'),
              'category_changed', moving,
              'position', p_position,
              'shifted', shifted)));

  return after_state;
end;
$$;

-- -----------------------------------------------------------------------------
-- admin_delete_product : suppression atomique. Variantes supprimées par la cascade existante ;
-- produits suivants de la catégorie remontés (ordre manuel). La photo Storage n'est PAS
-- supprimée (nettoyage dans une phase dédiée).
-- -----------------------------------------------------------------------------
create function public.admin_delete_product(p_product_id text) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  p public.products%rowtype;
  v_mode text;
  sibling_ids text[];
  sibling_sorts integer[];
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

  select * into p from public.products where id = p_product_id for update;
  if not found then
    raise exception 'Produit introuvable : %.', p_product_id using errcode = 'P0002';
  end if;

  before_state := jsonb_build_object(
    'product', to_jsonb(p) - 'created_at' - 'updated_at',
    'variants', coalesce((
      select jsonb_agg(to_jsonb(x) - 'created_at' - 'updated_at' order by x.sort_order, x.id)
      from public.product_variants x where x.product_id = p_product_id), '[]'::jsonb));

  select c.display_mode into v_mode from public.categories c where c.id = p.category_id;
  if v_mode = 'list' then
    perform 1 from public.products where category_id = p.category_id for update;
    select coalesce(array_agg(x.id order by x.sort_order, x.id), array[]::text[]),
           coalesce(array_agg(x.sort_order order by x.sort_order, x.id), array[]::integer[])
      into sibling_ids, sibling_sorts
      from public.products x where x.category_id = p.category_id;
    n := coalesce(array_length(sibling_ids, 1), 0);
    for i in 2..n loop
      if sibling_sorts[i] <= sibling_sorts[i - 1] then strictly_increasing := false; end if;
    end loop;
    cur := array_position(sibling_ids, p_product_id);
    if strictly_increasing then
      for i in cur + 1..n loop
        update public.products set sort_order = sort_order - 1 where id = sibling_ids[i];
        shifted := shifted || jsonb_build_object('id', sibling_ids[i], 'before', sibling_sorts[i], 'after', sibling_sorts[i] - 1);
      end loop;
    else
      base_sort := sibling_sorts[1];
      cur := 0;
      for i in 1..n loop
        if sibling_ids[i] <> p_product_id then
          if base_sort + cur <> sibling_sorts[i] then
            update public.products set sort_order = base_sort + cur where id = sibling_ids[i];
            shifted := shifted || jsonb_build_object('id', sibling_ids[i], 'before', sibling_sorts[i], 'after', base_sort + cur);
          end if;
          cur := cur + 1;
        end if;
      end loop;
    end if;
  end if;

  delete from public.products where id = p_product_id; -- variantes : cascade existante

  insert into public.audit_log (user_id, action, entity_type, entity_id, payload)
  values (auth.uid(), 'product.delete', 'product', p_product_id,
          jsonb_build_object('before', before_state, 'shifted', shifted));

  return jsonb_build_object('deleted', before_state, 'shifted', shifted);
end;
$$;

revoke all on function public.admin_save_product(text, jsonb, jsonb, integer) from public;
revoke all on function public.admin_save_product(text, jsonb, jsonb, integer) from anon;
grant execute on function public.admin_save_product(text, jsonb, jsonb, integer) to authenticated;

revoke all on function public.admin_delete_product(text) from public;
revoke all on function public.admin_delete_product(text) from anon;
grant execute on function public.admin_delete_product(text) to authenticated;
