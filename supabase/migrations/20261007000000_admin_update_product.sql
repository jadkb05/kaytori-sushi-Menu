-- =============================================================================
-- Kaytôri Sushi — édition atomique d'un produit existant depuis /admin (Phase 3B)
--
-- AJOUT UNIQUEMENT : une fonction. Aucune table, colonne ni politique RLS modifiée.
--
-- Pourquoi une fonction : l'API REST (PostgREST) ne modifie qu'une table par requête.
-- Produit + variantes + audit_log = 3 requêtes = 3 transactions. Ici, tout s'exécute
-- dans UNE transaction : la moindre erreur annule l'ensemble (aucun état partiel).
--
-- security invoker : la fonction s'exécute avec les droits de l'appelant, donc sous les
-- politiques RLS existantes ; elle vérifie en plus is_admin() avant toute écriture.
--
-- Modifiable : products.name, description, price, category_id, is_active, sort_order ;
--              product_variants.label, price, sort_order, is_active (variantes EXISTANTES).
-- Jamais modifié : IDs, image_url, vignettes, currency. Aucune variante ajoutée/supprimée.
-- Prix parent : refusé pour un produit à variantes (les prix se gèrent sur les variantes).
--
-- Appel : rpc('admin_update_product', { p_product_id, p_product, p_variants })
--   p_product  : objet avec uniquement les champs à modifier (clé inconnue = erreur)
--   p_variants : tableau d'objets { id, label?, price?, sort_order?, is_active? }
-- Retour : { product, variants } tels qu'enregistrés en base.
-- =============================================================================

create function public.admin_update_product(
  p_product_id text,
  p_product jsonb default '{}'::jsonb,
  p_variants jsonb default '[]'::jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  product_fields constant text[] := array['name', 'description', 'price', 'category_id', 'is_active', 'sort_order'];
  variant_fields constant text[] := array['id', 'label', 'price', 'sort_order', 'is_active'];
  p public.products%rowtype;
  v public.product_variants%rowtype;
  has_variants boolean;
  item jsonb;
  seen_variant_ids text[] := array[]::text[];
  k text;
  v_id text;
  new_name text;
  new_description text;
  new_price numeric;
  new_category text;
  new_active boolean;
  new_sort integer;
  before_state jsonb;
  after_state jsonb;
begin
  -- 1. Droits : connecté ne suffit pas, il faut figurer dans admin_users.
  if not public.is_admin() then
    raise exception 'Accès refusé : droits administrateur requis.' using errcode = '42501';
  end if;

  p_product := coalesce(p_product, '{}'::jsonb);
  p_variants := coalesce(p_variants, '[]'::jsonb);
  if jsonb_typeof(p_product) <> 'object' then
    raise exception 'Données produit invalides.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_variants) <> 'array' then
    raise exception 'Données des variantes invalides.' using errcode = '22023';
  end if;
  for k in select jsonb_object_keys(p_product) loop
    if not k = any(product_fields) then
      raise exception 'Champ produit non modifiable : %.', k using errcode = '22023';
    end if;
  end loop;

  -- 2. Produit existant, verrouillé pendant la transaction.
  select * into p from public.products where id = p_product_id for update;
  if not found then
    raise exception 'Produit introuvable : %.', p_product_id using errcode = 'P0002';
  end if;
  has_variants := exists (select 1 from public.product_variants where product_id = p_product_id);

  before_state := jsonb_build_object(
    'product', to_jsonb(p) - 'created_at' - 'updated_at',
    'variants', coalesce((
      select jsonb_agg(to_jsonb(x) - 'created_at' - 'updated_at' order by x.sort_order, x.id)
      from public.product_variants x where x.product_id = p_product_id), '[]'::jsonb));

  -- 3. Validation des champs produit (valeur actuelle conservée si le champ est absent).
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

  new_price := p.price;
  if p_product ? 'price' then
    if has_variants then
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

  new_category := p.category_id;
  if p_product ? 'category_id' then
    if jsonb_typeof(p_product -> 'category_id') <> 'string' then
      raise exception 'Catégorie invalide.' using errcode = '22023';
    end if;
    new_category := p_product ->> 'category_id';
    if not exists (select 1 from public.categories where id = new_category) then
      raise exception 'Catégorie inexistante : %.', new_category using errcode = '23503';
    end if;
  end if;

  new_active := p.is_active;
  if p_product ? 'is_active' then
    if jsonb_typeof(p_product -> 'is_active') <> 'boolean' then
      raise exception 'Statut invalide.' using errcode = '22023';
    end if;
    new_active := (p_product ->> 'is_active')::boolean;
  end if;

  new_sort := p.sort_order;
  if p_product ? 'sort_order' then
    if jsonb_typeof(p_product -> 'sort_order') <> 'number'
       or (p_product ->> 'sort_order')::numeric < 0
       or (p_product ->> 'sort_order')::numeric <> trunc((p_product ->> 'sort_order')::numeric)
       or (p_product ->> 'sort_order')::numeric > 2147483647 then
      raise exception 'Ordre invalide : nombre entier positif ou nul.' using errcode = '22023';
    end if;
    new_sort := (p_product ->> 'sort_order')::integer;
  end if;

  -- 4. Mise à jour du produit : uniquement les champs autorisés (id, image_url, vignettes, currency intacts).
  update public.products
     set name = new_name,
         description = new_description,
         price = new_price,
         category_id = new_category,
         is_active = new_active,
         sort_order = new_sort
   where id = p_product_id;

  -- 5. Variantes EXISTANTES de ce produit uniquement (aucun ajout, aucune suppression).
  for item in select * from jsonb_array_elements(p_variants) loop
    if jsonb_typeof(item) <> 'object' or jsonb_typeof(item -> 'id') is distinct from 'string' then
      raise exception 'Variante invalide : identifiant manquant.' using errcode = '22023';
    end if;
    for k in select jsonb_object_keys(item) loop
      if not k = any(variant_fields) then
        raise exception 'Champ de variante non modifiable : %.', k using errcode = '22023';
      end if;
    end loop;
    v_id := item ->> 'id';
    if v_id = any(seen_variant_ids) then
      raise exception 'Variante en double : %.', v_id using errcode = '22023';
    end if;
    seen_variant_ids := seen_variant_ids || v_id;

    select * into v from public.product_variants where product_id = p_product_id and id = v_id for update;
    if not found then
      raise exception 'Variante inconnue pour ce produit : %.', v_id using errcode = 'P0002';
    end if;

    if item ? 'label' then
      if jsonb_typeof(item -> 'label') <> 'string' or btrim(item ->> 'label') = '' then
        raise exception 'Le libellé de la variante % est obligatoire.', v_id using errcode = '22023';
      end if;
      v.label := btrim(item ->> 'label');
    end if;
    if item ? 'price' then
      if jsonb_typeof(item -> 'price') <> 'number'
         or (item ->> 'price')::numeric < 0
         or (item ->> 'price')::numeric <> round((item ->> 'price')::numeric, 2)
         or (item ->> 'price')::numeric >= 100000000 then
        raise exception 'Prix invalide pour la variante %.', v_id using errcode = '22023';
      end if;
      v.price := (item ->> 'price')::numeric;
    end if;
    if item ? 'sort_order' then
      if jsonb_typeof(item -> 'sort_order') <> 'number'
         or (item ->> 'sort_order')::numeric < 0
         or (item ->> 'sort_order')::numeric <> trunc((item ->> 'sort_order')::numeric)
         or (item ->> 'sort_order')::numeric > 2147483647 then
        raise exception 'Ordre invalide pour la variante %.', v_id using errcode = '22023';
      end if;
      v.sort_order := (item ->> 'sort_order')::integer;
    end if;
    if item ? 'is_active' then
      if jsonb_typeof(item -> 'is_active') <> 'boolean' then
        raise exception 'Statut invalide pour la variante %.', v_id using errcode = '22023';
      end if;
      v.is_active := (item ->> 'is_active')::boolean;
    end if;

    update public.product_variants
       set label = v.label, price = v.price, sort_order = v.sort_order, is_active = v.is_active
     where product_id = p_product_id and id = v_id;
  end loop;

  -- 6. État enregistré + journal (même transaction : un échec ici annule tout).
  select * into p from public.products where id = p_product_id;
  after_state := jsonb_build_object(
    'product', to_jsonb(p) - 'created_at' - 'updated_at',
    'variants', coalesce((
      select jsonb_agg(to_jsonb(x) - 'created_at' - 'updated_at' order by x.sort_order, x.id)
      from public.product_variants x where x.product_id = p_product_id), '[]'::jsonb));

  insert into public.audit_log (user_id, action, entity_type, entity_id, payload)
  values (auth.uid(), 'product.update', 'product', p_product_id,
          jsonb_build_object('before', before_state, 'after', after_state));

  return after_state;
end;
$$;

-- Appel réservé aux utilisateurs connectés (les droits admin sont vérifiés dans la fonction et par la RLS).
revoke all on function public.admin_update_product(text, jsonb, jsonb) from public;
revoke all on function public.admin_update_product(text, jsonb, jsonb) from anon;
grant execute on function public.admin_update_product(text, jsonb, jsonb) to authenticated;
