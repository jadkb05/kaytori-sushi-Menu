-- =============================================================================
-- PRODUCTION — 03 : vérification après 01_schema.sql et 02_catalog.sql — LECTURE SEULE
--
-- Uniquement des SELECT. Résultat : « controle | ok | detail ». Tout doit être ok = true.
-- Complété par `npm run supabase:parity` (parité champ par champ avec le menu statique,
-- clé publique) et par supabase/tests/rls_check.sql (droits simulés, rollback interne).
-- =============================================================================

with
admin_functions(name) as (
  values ('admin_update_product'), ('admin_create_product'), ('admin_save_product'), ('admin_delete_product'),
         ('admin_create_category'), ('admin_update_category'), ('admin_delete_category')
),
fn as (
  select p.proname as name, p.prosecdef as definer, p.proconfig as config,
         has_function_privilege('anon', p.oid, 'execute') as anon_exec,
         has_function_privilege('authenticated', p.oid, 'execute') as auth_exec,
         exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                 where a.grantee = 0 and a.privilege_type = 'EXECUTE') as public_exec
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
),
expected_policies(schema_name, table_name, policy) as (
  values ('public', 'categories', 'categories: lecture publique des actives'),
         ('public', 'categories', 'categories: admin'),
         ('public', 'products', 'products: lecture publique des actifs'),
         ('public', 'products', 'products: admin'),
         ('public', 'product_variants', 'product_variants: lecture publique des actives'),
         ('public', 'product_variants', 'product_variants: admin'),
         ('public', 'admin_users', 'admin_users: lecture de sa propre ligne'),
         ('public', 'audit_log', 'audit_log: lecture admin'),
         ('public', 'audit_log', 'audit_log: ajout admin'),
         ('storage', 'objects', 'menu-images: lecture publique'),
         ('storage', 'objects', 'menu-images: ajout admin'),
         ('storage', 'objects', 'menu-images: modification admin'),
         ('storage', 'objects', 'menu-images: suppression admin')
),
checks(n, controle, ok, detail) as (
  select 1, 'tables présentes, RLS activée (5)',
         count(*) filter (where c.relrowsecurity) = 5,
         string_agg(c.relname || '=' || c.relrowsecurity, ', ' order by c.relname)
  from pg_class c join pg_namespace s on s.oid = c.relnamespace
  where s.nspname = 'public' and c.relname in ('categories', 'products', 'product_variants', 'admin_users', 'audit_log')
  union all
  select 2, 'catalogue : 31 catégories / 214 produits / 67 variantes',
         (select count(*) from public.categories) = 31 and (select count(*) from public.products) = 214
           and (select count(*) from public.product_variants) = 67,
         (select count(*) from public.categories) || ' / ' || (select count(*) from public.products) || ' / ' || (select count(*) from public.product_variants)
  union all
  select 3, 'tout est actif (aucun élément masqué à l''import)',
         not exists (select 1 from public.categories where not is_active) and not exists (select 1 from public.products where not is_active)
           and not exists (select 1 from public.product_variants where not is_active),
         null
  union all
  select 4, 'display_mode : assortiments = assortiments_by_pcs, 30 en list (plats-thai compris)',
         (select display_mode from public.categories where id = 'plats-thai') = 'list'
           and (select display_mode from public.categories where id = 'assortiments') = 'assortiments_by_pcs'
           and (select count(*) from public.categories where display_mode = 'list') = 30,
         (select string_agg(id || '=' || display_mode, ', ') from public.categories where display_mode <> 'list')
  union all
  select 5, 'aucun prix négatif, aucun produit sans image ni catégorie',
         not exists (select 1 from public.products where price < 0 or coalesce(image_url, '') = '')
           and not exists (select 1 from public.product_variants where price < 0),
         null
  union all
  select 6, 'fonctions admin : 7 présentes, SECURITY INVOKER, search_path vide',
         count(*) = 7 and bool_and(not f.definer) and bool_and(f.config = array['search_path=""']),
         string_agg(f.name || (case when f.definer then ' DEFINER' else '' end), ', ' order by f.name)
  from fn f join admin_functions a on a.name = f.name
  union all
  select 7, 'fonctions admin : exécutables par authenticated uniquement (ni anon, ni PUBLIC)',
         count(*) = 7 and bool_and(f.auth_exec and not f.anon_exec and not f.public_exec),
         string_agg(f.name || ' anon=' || f.anon_exec || ' public=' || f.public_exec, ', ' order by f.name)
           filter (where f.anon_exec or f.public_exec or not f.auth_exec)
  from fn f join admin_functions a on a.name = f.name
  union all
  select 8, 'is_admin : SECURITY DEFINER avec search_path vide (lit admin_users malgré la RLS)',
         bool_and(f.definer and f.config = array['search_path=""']), null
  from fn f where f.name = 'is_admin'
  union all
  select 9, 'politiques RLS / Storage : 13 attendues présentes',
         count(p.policyname) = 13,
         string_agg(e.policy, ', ') filter (where p.policyname is null)
  from expected_policies e
  left join pg_policies p on p.schemaname = e.schema_name and p.tablename = e.table_name and p.policyname = e.policy
  union all
  select 10, 'anon : SELECT seulement sur les 3 tables du menu, rien sur admin_users / audit_log',
         not exists (select 1 from information_schema.role_table_grants
                     where table_schema = 'public' and grantee = 'anon'
                       and (privilege_type <> 'SELECT' or table_name in ('admin_users', 'audit_log'))),
         (select string_agg(table_name || ':' || privilege_type, ', ') from information_schema.role_table_grants
           where table_schema = 'public' and grantee = 'anon'
             and (privilege_type <> 'SELECT' or table_name in ('admin_users', 'audit_log')))
  union all
  select 11, 'bucket menu-images : public, 5 Mo, JPEG / PNG / WebP',
         coalesce(bool_and(b.public and b.file_size_limit = 5242880
           and b.allowed_mime_types::text[] @> array['image/jpeg', 'image/png', 'image/webp']
           and cardinality(b.allowed_mime_types) = 3), false),
         string_agg('public=' || b.public || ' limite=' || coalesce(b.file_size_limit::text, 'aucune')
           || ' types=' || coalesce(array_to_string(b.allowed_mime_types, ','), 'tous'), '')
  from storage.buckets b where b.id = 'menu-images'
  union all
  select 12, 'unicité des noms de catégorie (categories_name_unique_idx)',
         to_regclass('public.categories_name_unique_idx') is not null, null
  union all
  select 13, 'administrateurs déclarés (information : 0 avant la phase 5)',
         true, (select count(*) from public.admin_users)::text
)
select controle, ok, detail from checks order by n;
