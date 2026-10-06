-- =============================================================================
-- Kaytôri Sushi — création atomique d'un produit depuis /admin (Phase 3D)
--
-- AJOUT UNIQUEMENT : une fonction. Aucune table, colonne ni politique RLS modifiée.
--
-- Une seule transaction : produit + variantes + position (décalage des produits suivants)
-- + journal. La moindre erreur annule tout : jamais de produit partiellement créé.
--
-- security invoker : s'exécute avec les droits de l'appelant (politiques RLS existantes),
-- et vérifie is_admin() avant toute écriture.
--
-- p_product  : { id, name, description?, price?, category_id, is_active?, image_url }
--              id : 10 caractères hexadécimaux, jamais déjà utilisé (généré par l'admin, qui
--                   en a besoin avant pour le chemin de la photo dans Storage) ;
--              image_url : OBLIGATOIRE (aucun produit sans photo) ;
--              price : obligatoire SANS variantes, refusé AVEC variantes (prix parent fixé
--                      automatiquement au prix de variante le plus bas, comme le menu actuel).
-- p_variants : [] ou [{ id (slug), label, price, sort_order, is_active? }]
-- p_position : position humaine 1…N+1 dans une catégorie à ordre manuel ; ignorée pour les
--              catégories à ordre automatique (ajout en fin).
-- Retour : { product, variants } tels qu'enregistrés.
-- =============================================================================

create function public.admin_create_product(
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
  -- 1. Droits.
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

  -- 2. Produit.
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

  -- 3. Variantes (validation complète avant toute écriture).
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
    if new_price is null or v_price < new_price then
      new_price := v_price; -- prix parent = prix de variante le plus bas
    end if;
  end loop;

  -- 4. Position : catégorie verrouillée, ordre affiché = (sort_order, id).
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
    -- Ordre automatique (Plats Thaï, Assortiments) : position ignorée, ajout en fin.
    new_sort := case when n = 0 then 0 else sibling_sorts[n] + 1 end;
  else
    if p_position is null or p_position < 1 or p_position > n + 1 then
      raise exception 'Position invalide : entre 1 et %.', n + 1 using errcode = '22023';
    end if;
    if p_position = n + 1 then
      new_sort := case when n = 0 then 0 else sibling_sorts[n] + 1 end;
    elsif strictly_increasing then
      -- Le nouveau produit prend la place du produit en position p ; celui-ci et les suivants
      -- descendent d'un cran (+1), dans l'ordre : l'ordre relatif est conservé, sans doublon.
      new_sort := sibling_sorts[p_position];
      for i in reverse n..p_position loop
        update public.products set sort_order = sort_order + 1 where id = sibling_ids[i];
        shifted := shifted || jsonb_build_object('id', sibling_ids[i], 'before', sibling_sorts[i], 'after', sibling_sorts[i] + 1);
      end loop;
    else
      -- Valeurs en double : renumérotation de la catégorie (min, min+1, …) avec le nouveau produit.
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

  -- 5. Écritures : produit puis variantes.
  insert into public.products (id, category_id, name, description, price, currency, image_url, sort_order, is_active)
  values (new_id, new_category, new_name, new_description, new_price, 'MAD', new_image, new_sort, new_active);

  insert into public.product_variants (product_id, id, label, price, sort_order, is_active)
  select new_id, x ->> 'id', btrim(x ->> 'label'), (x ->> 'price')::numeric, (x ->> 'sort_order')::integer,
         coalesce((x ->> 'is_active')::boolean, true)
    from jsonb_array_elements(p_variants) x;

  -- 6. Résultat + journal (même transaction).
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

revoke all on function public.admin_create_product(jsonb, jsonb, integer) from public;
revoke all on function public.admin_create_product(jsonb, jsonb, integer) from anon;
grant execute on function public.admin_create_product(jsonb, jsonb, integer) to authenticated;
