-- À appliquer UNE FOIS sur Supabase après autorisation explicite.
-- Prérequis : 10_cover_banners.sql déjà appliqué.
-- =============================================================================
-- PRODUCTION — 11 : liaison couverture → formule (ajout panier)
-- Contenu aligné sur supabase/migrations/20261024210000_cover_banner_product.sql
-- =============================================================================

begin;

-- =============================================================================
-- Kaytôri Sushi — lier une photo de couverture à une formule / produit (ajout panier)
--
-- AJOUTS :
--   - cover_banners.product_id (nullable, FK products ON DELETE SET NULL) ;
--   - admin_update_cover_banner accepte product_id dans p_changes ;
--   - associations initiales (photos formules déjà uploadées en couverture).
-- =============================================================================

alter table public.cover_banners
  add column if not exists product_id text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'cover_banners_product_id_fkey'
  ) then
    alter table public.cover_banners
      add constraint cover_banners_product_id_fkey
      foreign key (product_id) references public.products (id) on delete set null;
  end if;
end $$;

create index if not exists cover_banners_product_id_idx
  on public.cover_banners (product_id)
  where product_id is not null;

comment on column public.cover_banners.product_id is
  'Formule / produit ajouté au panier via le « + » sur cette couverture (null = décoratif).';

-- Associations relevées sur les affiches (nom + prix visibles sur la photo).
update public.cover_banners set product_id = '721f54c1ed' where id = 'cover-5bdc163cc0'; -- Formule Californie 89
update public.cover_banners set product_id = '4f85ff0b40' where id = 'cover-4ed2ee762c'; -- Formule Aromaki 99
update public.cover_banners set product_id = '539d5c9a19' where id = 'cover-74b47c2261'; -- Formule Yakitori 89
update public.cover_banners set product_id = '637a0e29de' where id = 'cover-f83a14c3c4'; -- Formule Crunchy 99
update public.cover_banners set product_id = 'f0534d1ed8' where id = 'cover-7688cc9cf4'; -- Formule Thaï 99
update public.cover_banners set product_id = '9d7cb6c1f9' where id = 'cover-6712afb710'; -- Formule Solo 139
update public.cover_banners set product_id = 'formule-duo' where id = 'cover-778984f58f'; -- Formule Duo 1 279
update public.cover_banners set product_id = 'formule-duo' where id = 'cover-71d6f65bac'; -- Formule Duo 1 279
update public.cover_banners set product_id = 'f1f534eefe' where id = 'cover-eb6a3cc1af'; -- Formule Duo 2 239
-- cover-default (« Nos formules ») : décoratif, pas de produit.

-- -----------------------------------------------------------------------------
-- admin_update_cover_banner : product_id autorisé
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
  new_product text;
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
    if k not in ('is_active', 'image_url', 'storage_path', 'product_id') then
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

  new_product := ban.product_id;
  if p_changes ? 'product_id' then
    if p_changes ->> 'product_id' is null or btrim(coalesce(p_changes ->> 'product_id', '')) = '' then
      new_product := null;
    elsif jsonb_typeof(p_changes -> 'product_id') <> 'string' then
      raise exception 'Produit de couverture invalide.' using errcode = '22023';
    else
      new_product := btrim(p_changes ->> 'product_id');
      if not exists (select 1 from public.products where id = new_product) then
        raise exception 'Produit introuvable : %.', new_product using errcode = 'P0002';
      end if;
    end if;
  end if;

  update public.cover_banners
     set is_active = new_active,
         image_url = new_url,
         storage_path = new_path,
         product_id = new_product
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

revoke all on function public.admin_update_cover_banner(text, jsonb, integer) from public;
revoke all on function public.admin_update_cover_banner(text, jsonb, integer) from anon;
grant execute on function public.admin_update_cover_banner(text, jsonb, integer) to authenticated;

-- -----------------------------------------------------------------------------
-- admin_create_cover_banner : product_id optionnel à la création
-- (remplace la signature sans product_id de la migration 10)
-- -----------------------------------------------------------------------------
drop function if exists public.admin_create_cover_banner(text, text, text, boolean, integer);

create or replace function public.admin_create_cover_banner(
  p_id text,
  p_image_url text,
  p_storage_path text default null,
  p_is_active boolean default true,
  p_position integer default null,
  p_product_id text default null
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_url text := btrim(coalesce(p_image_url, ''));
  v_path text := nullif(btrim(coalesce(p_storage_path, '')), '');
  v_product text := nullif(btrim(coalesce(p_product_id, '')), '');
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
  if v_product is not null and not exists (select 1 from public.products where id = v_product) then
    raise exception 'Produit introuvable : %.', v_product using errcode = 'P0002';
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

  insert into public.cover_banners (id, image_url, storage_path, sort_order, is_active, product_id)
  values (p_id, v_url, v_path, new_sort, coalesce(p_is_active, true), v_product);

  select to_jsonb(b) - 'created_at' - 'updated_at' into after_state
    from public.cover_banners b where b.id = p_id;

  insert into public.audit_log (user_id, action, entity_type, entity_id, payload)
  values (auth.uid(), 'cover_banner.create', 'cover_banner', p_id,
          jsonb_build_object('after', after_state, 'position', p_position));

  return after_state;
end;
$$;

revoke all on function public.admin_create_cover_banner(text, text, text, boolean, integer, text) from public;
revoke all on function public.admin_create_cover_banner(text, text, text, boolean, integer, text) from anon;
grant execute on function public.admin_create_cover_banner(text, text, text, boolean, integer, text) to authenticated;


commit;
