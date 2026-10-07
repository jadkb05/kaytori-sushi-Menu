-- =============================================================================
-- PRODUCTION — 01 : schéma du menu CMS (tables, RLS, fonctions, Storage)
-- GÉNÉRÉ depuis supabase/migrations/ — ne pas éditer à la main.
--
-- Une seule transaction : tout ou rien. La garde initiale ARRÊTE tout si une table, une fonction,
-- une politique Storage ou le bucket existe déjà (aucun écrasement possible).
-- Ne contient AUCUNE donnée du catalogue (voir 02_catalog.sql).
--
-- Sources :
--   20261006000000_menu_schema.sql  sha256:d7f2fb3bcd677303
--   20261007000000_admin_update_product.sql  sha256:ffb69fcd79af5bb6
--   20261008000000_admin_create_product.sql  sha256:50e466ed4856a145
--   20261009000000_admin_catalog.sql  sha256:8d42a37bf059278f
--   20261010000000_admin_categories.sql  sha256:3c75ae0ea3f746fb
--   20261011000000_menu_images_limits.sql  sha256:28de8ddde822a4f7
-- =============================================================================

begin;

do $guard$
declare
  found text[] := array[]::text[];
  t text;
begin
  foreach t in array array['categories', 'products', 'product_variants', 'admin_users', 'audit_log'] loop
    if to_regclass('public.' || t) is not null then found := found || ('table public.' || t); end if;
  end loop;
  foreach t in array array['is_admin', 'set_updated_at', 'admin_update_product', 'admin_create_product', 'admin_save_product', 'admin_delete_product', 'admin_create_category', 'admin_update_category', 'admin_delete_category'] loop
    if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = t) then
      found := found || ('fonction public.' || t);
    end if;
  end loop;
  foreach t in array array['menu-images: lecture publique', 'menu-images: ajout admin', 'menu-images: modification admin', 'menu-images: suppression admin'] loop
    if exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = t) then
      found := found || ('politique storage « ' || t || ' »');
    end if;
  end loop;
  if exists (select 1 from storage.buckets where id = 'menu-images') then
    found := found || 'bucket menu-images (existant : à décider après audit, jamais écrasé automatiquement)'::text;
  end if;
  if cardinality(found) > 0 then
    raise exception 'ARRÊT — rien n''a été modifié. Objets déjà présents : %', array_to_string(found, ' ; ');
  end if;
end
$guard$;

-- >>>>>>>>>> 20261006000000_menu_schema.sql
-- =============================================================================
-- Kaytôri Sushi — schéma du menu (Phase 1 CMS)
--
-- Représente exactement le menu statique actuel (src/data/yumloMenu.ts) :
--   - IDs produits et IDs de variantes conservés tels quels (TEXT) ;
--   - ordre des catégories, des produits et des variantes via sort_order ;
--   - règles d'affichage particulières des catégories via display_mode.
-- Le menu public n'utilise PAS encore cette base (source active : statique).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Tables
-- -----------------------------------------------------------------------------

create table public.categories (
  id           text primary key,                 -- slug stable, ex. 'plats-thai'
  name         text not null,                    -- libellé affiché (« Plats Thaï »)
  sort_order   integer not null,
  is_active    boolean not null default true,
  display_mode text not null default 'list'
               check (display_mode in ('list', 'plats_thai_sorted', 'assortiments_by_pcs')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.products (
  id              text primary key,              -- ID existant (10 hex), jamais régénéré
  category_id     text not null references public.categories (id) on update cascade,
  name            text not null,
  description     text,
  price           numeric(10, 2) not null check (price >= 0),
  currency        text not null default 'MAD',
  image_url       text,                          -- chemin public actuel ou URL Storage
  thumb_small_url text,                          -- vignette 224 px
  thumb_large_url text,                          -- vignette 336 px
  sort_order      integer not null,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index products_category_sort_idx on public.products (category_id, sort_order);

create table public.product_variants (
  product_id text not null references public.products (id) on update cascade on delete cascade,
  id         text not null,                      -- slug existant ('poulet', 'fruits-de-mer'…)
  label      text not null,
  price      numeric(10, 2) not null check (price >= 0),
  sort_order integer not null,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (product_id, id)
);

create table public.admin_users (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.audit_log (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid,
  action      text not null,
  entity_type text not null,
  entity_id   text,
  payload     jsonb,
  created_at  timestamptz not null default now()
);

create index audit_log_entity_idx on public.audit_log (entity_type, entity_id, created_at desc);

-- -----------------------------------------------------------------------------
-- updated_at automatique
-- -----------------------------------------------------------------------------

create function public.set_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger categories_set_updated_at before update on public.categories
  for each row execute function public.set_updated_at();
create trigger products_set_updated_at before update on public.products
  for each row execute function public.set_updated_at();
create trigger product_variants_set_updated_at before update on public.product_variants
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Rôle admin : un utilisateur est admin s'il figure dans admin_users.
-- (Ajout d'un admin : manuellement en SQL / service role, jamais depuis le frontend.)
-- -----------------------------------------------------------------------------

create function public.is_admin() returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admin_users where user_id = auth.uid());
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------

alter table public.categories       enable row level security;
alter table public.products         enable row level security;
alter table public.product_variants enable row level security;
alter table public.admin_users      enable row level security;
alter table public.audit_log        enable row level security;

-- Lecture publique : uniquement le contenu actif (et dont les parents sont actifs).
create policy "categories: lecture publique des actives"
  on public.categories for select to anon, authenticated
  using (is_active);

create policy "products: lecture publique des actifs"
  on public.products for select to anon, authenticated
  using (
    is_active
    and exists (select 1 from public.categories c where c.id = category_id and c.is_active)
  );

create policy "product_variants: lecture publique des actives"
  on public.product_variants for select to anon, authenticated
  using (
    is_active
    and exists (
      select 1
      from public.products p
      join public.categories c on c.id = p.category_id
      where p.id = product_id and p.is_active and c.is_active
    )
  );

-- Admin : accès complet au contenu du menu (y compris les éléments inactifs).
create policy "categories: admin" on public.categories for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "products: admin" on public.products for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "product_variants: admin" on public.product_variants for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- admin_users : chacun peut seulement vérifier sa propre ligne ; aucune écriture via l'API.
create policy "admin_users: lecture de sa propre ligne"
  on public.admin_users for select to authenticated
  using (user_id = auth.uid());

-- audit_log : lecture et ajout réservés aux admins (pas de modification/suppression).
create policy "audit_log: lecture admin" on public.audit_log for select to authenticated
  using (public.is_admin());
create policy "audit_log: ajout admin" on public.audit_log for insert to authenticated
  with check (public.is_admin() and user_id = auth.uid());

-- Privilèges explicites (RLS filtre ensuite les lignes).
revoke all on public.categories, public.products, public.product_variants,
              public.admin_users, public.audit_log from anon, authenticated;
grant select on public.categories, public.products, public.product_variants to anon, authenticated;
grant insert, update, delete on public.categories, public.products, public.product_variants to authenticated;
grant select on public.admin_users to authenticated;
grant select, insert on public.audit_log to authenticated;

-- -----------------------------------------------------------------------------
-- Storage : bucket public « menu-images » (lecture publique, écriture admin)
-- Aucune image n'est migrée ici : les photos actuelles restent dans public/.
-- -----------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('menu-images', 'menu-images', true)
on conflict (id) do nothing;

create policy "menu-images: lecture publique"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'menu-images');

create policy "menu-images: ajout admin"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'menu-images' and public.is_admin());

create policy "menu-images: modification admin"
  on storage.objects for update to authenticated
  using (bucket_id = 'menu-images' and public.is_admin())
  with check (bucket_id = 'menu-images' and public.is_admin());

create policy "menu-images: suppression admin"
  on storage.objects for delete to authenticated
  using (bucket_id = 'menu-images' and public.is_admin());

-- >>>>>>>>>> 20261007000000_admin_update_product.sql
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

-- >>>>>>>>>> 20261008000000_admin_create_product.sql
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

-- >>>>>>>>>> 20261009000000_admin_catalog.sql
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

-- >>>>>>>>>> 20261010000000_admin_categories.sql
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

-- >>>>>>>>>> 20261011000000_menu_images_limits.sql
-- =============================================================================
-- Kaytôri Sushi — limites du bucket « menu-images »
--
-- Aligne Storage sur la validation de l'admin : 5 Mo maximum, JPEG / PNG / WebP uniquement.
-- Aucun fichier existant n'est modifié ni supprimé. Idempotent (déjà appliqué à la main sur TEST).
-- =============================================================================

update storage.buckets
   set file_size_limit = 5242880,
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
 where id = 'menu-images';

commit;
