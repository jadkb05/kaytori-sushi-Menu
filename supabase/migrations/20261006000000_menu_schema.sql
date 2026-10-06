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
