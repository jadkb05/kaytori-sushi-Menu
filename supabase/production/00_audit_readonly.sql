-- =============================================================================
-- AUDIT SUPABASE PRODUCTION — LECTURE SEULE
--
-- À exécuter dans le SQL Editor du projet PRODUCTION. Uniquement des SELECT : aucune table,
-- donnée, politique, fonction ni fichier n'est créé, modifié ou supprimé.
-- Aucune donnée personnelle n'est renvoyée (pas d'e-mail, pas d'identifiant d'utilisateur) :
-- seulement des comptages, des noms d'objets et des réglages.
--
-- Résultat : UNE ligne, UNE colonne « audit » (JSON). Copier la cellule et la transmettre.
-- =============================================================================

with
target_tables as (
  select unnest(array['categories', 'products', 'product_variants', 'admin_users', 'audit_log']) as name
),
public_tables as (
  select c.relname as name,
         c.relrowsecurity as rls_enabled,
         c.relforcerowsecurity as rls_forced,
         (xpath('/row/n/text()',
                query_to_xml(format('select count(*) as n from public.%I', c.relname), false, true, '')))[1]::text::bigint as row_count
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p')
),
target_columns as (
  select table_name, jsonb_agg(jsonb_build_object(
           'column', column_name, 'type', data_type, 'nullable', is_nullable, 'default', column_default)
           order by ordinal_position) as cols
  from information_schema.columns
  where table_schema = 'public' and table_name in (select name from target_tables)
  group by table_name
)
select jsonb_pretty(jsonb_build_object(
  'audited_at', now(),
  'postgres', current_setting('server_version'),

  -- Schéma public : toutes les tables (nom, RLS, nombre de lignes).
  'public_tables', coalesce((select jsonb_agg(to_jsonb(t) order by t.name) from public_tables t), '[]'::jsonb),
  'public_views', coalesce((select jsonb_agg(table_name order by table_name) from information_schema.views where table_schema = 'public'), '[]'::jsonb),
  'target_tables_present', (select jsonb_object_agg(name, to_regclass('public.' || name) is not null) from target_tables),
  'target_columns', coalesce((select jsonb_object_agg(table_name, cols) from target_columns), '{}'::jsonb),
  'public_indexes', coalesce((
    select jsonb_agg(jsonb_build_object('table', tablename, 'index', indexname, 'def', indexdef) order by tablename, indexname)
    from pg_indexes where schemaname = 'public'), '[]'::jsonb),
  'public_triggers', coalesce((
    select jsonb_agg(jsonb_build_object('table', event_object_table, 'trigger', trigger_name, 'timing', action_timing, 'event', event_manipulation)
      order by event_object_table, trigger_name)
    from information_schema.triggers where trigger_schema = 'public'), '[]'::jsonb),

  -- Fonctions du schéma public : SECURITY DEFINER/INVOKER, search_path, droits d'exécution.
  'public_functions', coalesce((
    select jsonb_agg(jsonb_build_object(
             'name', p.proname,
             'args', pg_get_function_identity_arguments(p.oid),
             'security_definer', p.prosecdef,
             'config', p.proconfig,
             'anon_can_execute', has_function_privilege('anon', p.oid, 'execute'),
             'authenticated_can_execute', has_function_privilege('authenticated', p.oid, 'execute'),
             'public_can_execute', exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where a.grantee = 0 and a.privilege_type = 'EXECUTE'))
           order by p.proname)
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'), '[]'::jsonb),

  -- Politiques RLS (public + storage.objects).
  'policies', coalesce((
    select jsonb_agg(jsonb_build_object(
             'schema', schemaname, 'table', tablename, 'policy', policyname, 'cmd', cmd,
             'roles', roles, 'using', qual, 'check', with_check) order by schemaname, tablename, policyname)
    from pg_policies where schemaname in ('public', 'storage')), '[]'::jsonb),

  -- Droits de table pour anon / authenticated.
  'table_grants', coalesce((
    select jsonb_agg(jsonb_build_object('table', table_name, 'grantee', grantee, 'privilege', privilege_type)
      order by table_name, grantee, privilege_type)
    from information_schema.role_table_grants
    where table_schema = 'public' and grantee in ('anon', 'authenticated')), '[]'::jsonb),

  -- Storage : buckets (réglages) et contenu (comptages et tailles uniquement).
  'storage_buckets', coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', b.id, 'public', b.public, 'file_size_limit', b.file_size_limit,
             'allowed_mime_types', b.allowed_mime_types, 'created_at', b.created_at,
             'objects', (select count(*) from storage.objects o where o.bucket_id = b.id),
             'total_bytes', (select coalesce(sum((o.metadata ->> 'size')::bigint), 0) from storage.objects o where o.bucket_id = b.id),
             'top_folders', (select jsonb_object_agg(f, n) from (
                select split_part(o.name, '/', 1) as f, count(*) as n
                from storage.objects o where o.bucket_id = b.id group by 1 order by 2 desc limit 20) x))
           order by b.id)
    from storage.buckets b), '[]'::jsonb),

  -- Auth : comptages seulement (aucun e-mail, aucun identifiant).
  'auth_users', (
    select jsonb_build_object(
      'total', count(*),
      'confirmed', count(*) filter (where email_confirmed_at is not null),
      'anonymous', count(*) filter (where coalesce(is_anonymous, false)),
      'by_provider', (select jsonb_object_agg(coalesce(p, '(aucun)'), n) from (
          select raw_app_meta_data ->> 'provider' as p, count(*) as n from auth.users group by 1) x),
      'last_sign_in', max(last_sign_in_at),
      'last_created', max(created_at))
    from auth.users),
  'admin_users_count', case when to_regclass('public.admin_users') is not null
    then (xpath('/row/n/text()', query_to_xml('select count(*) as n from public.admin_users', false, true, '')))[1]::text::bigint end,
  'audit_log_count', case when to_regclass('public.audit_log') is not null
    then (xpath('/row/n/text()', query_to_xml('select count(*) as n from public.audit_log', false, true, '')))[1]::text::bigint end,

  -- Historique de migrations (CLI Supabase), s'il existe.
  'cli_migrations', case when to_regclass('supabase_migrations.schema_migrations') is not null
    then (xpath('/row/v/text()', query_to_xml(
           'select string_agg(version || '' '' || coalesce(name, ''''), '' | '' order by version) as v from supabase_migrations.schema_migrations',
           false, true, '')))[1]::text end,

  'extensions', (select jsonb_agg(extname || ' ' || extversion order by extname) from pg_extension),
  'other_schemas', (select jsonb_agg(nspname order by nspname) from pg_namespace
                    where nspname not like 'pg\_%' and nspname not in ('information_schema'))
)) as audit;
