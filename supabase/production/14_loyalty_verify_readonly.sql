-- =============================================================================
-- PRODUCTION — 14 : vérification de la fidélité après 13_loyalty.sql — LECTURE SEULE
--
-- Uniquement des SELECT. Résultat : « controle | ok | detail ». Tout doit être ok = true.
-- Aucune donnée personnelle n'est renvoyée (seulement des comptages et des noms d'objets).
-- =============================================================================

with
api(name, args, public_access) as (
  values ('loyalty_my_role', '', true),
         ('loyalty_program', '', true),
         ('loyalty_register', 'text, text, text, uuid', true),
         ('loyalty_card_view', 'text', true),
         ('loyalty_client_redeem_reward', 'text, uuid, uuid', true),
         ('loyalty_qr_card_status', 'text', true),
         ('loyalty_qr_unlock', 'text, text', true),
         ('loyalty_qr_credit_points', 'text, text, integer, text, uuid', true),
         ('loyalty_qr_close_session', 'text', true),
         ('loyalty_stats', '', false),
         ('loyalty_search', 'text, integer, integer', false),
         ('loyalty_card_detail', 'uuid, text', false),
         ('loyalty_card_history', 'uuid, bigint, integer', false),
         ('loyalty_credit_ticket', 'uuid, integer, text, uuid, boolean', false),
         ('loyalty_adjust_points', 'uuid, integer, text, uuid', false),
         ('loyalty_redeem_reward', 'uuid, uuid, uuid', false),
         ('loyalty_revert_event', 'uuid, text, uuid', false),
         ('loyalty_list_rewards', '', false),
         ('loyalty_save_reward', 'jsonb, uuid', false),
         ('loyalty_reissue_access', 'uuid, text, uuid, text', false),
         ('loyalty_update_customer', 'uuid, jsonb, text, uuid', false),
         ('loyalty_set_card_status', 'uuid, text, text, uuid', false),
         ('loyalty_update_settings', 'jsonb', false),
         ('loyalty_set_qr_pin', 'text, text', false),
         ('loyalty_reconcile', '', false)
),
fn as (
  select a.name, a.public_access, p.oid,
         p.prosecdef as definer,
         coalesce(p.proconfig, array[]::text[]) @> array['search_path=""'] as empty_path,
         p.oid is not null and has_function_privilege('anon', p.oid, 'execute') as anon_exec,
         p.oid is not null and has_function_privilege('authenticated', p.oid, 'execute') as auth_exec,
         p.oid is not null and exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) x
                 where x.grantee = 0 and x.privilege_type = 'EXECUTE') as public_exec
  from api a
  left join pg_proc p on p.oid = to_regprocedure('public.' || a.name || '(' || a.args || ')')
),
tables(name) as (
  values ('settings'), ('staff'), ('customers'), ('rewards'), ('cards'), ('events'), ('qr_state'), ('qr_sessions')
),
tbl as (
  select t.name, c.oid, c.relrowsecurity as rls
  from tables t left join pg_class c on c.oid = to_regclass('loyalty.' || t.name)
),
journal as (
  select card_id, sum(points_delta) as points, sum(stamps_delta) as stamps, sum(redeemed_delta) as redeemed
  from loyalty.events where card_id is not null group by card_id
),
checks(n, controle, ok, detail) as (
  select 1, 'schéma loyalty présent', to_regnamespace('loyalty') is not null, null::text
  union all
  select 2, 'tables loyalty présentes, RLS activée (8)',
         count(*) filter (where rls) = 8,
         string_agg(name || '=' || coalesce(rls::text, 'absente'), ', ' order by name)
  from tbl
  union all
  select 3, 'aucun accès direct au schéma loyalty pour anon / authenticated',
         not has_schema_privilege('anon', 'loyalty', 'usage') and not has_schema_privilege('authenticated', 'loyalty', 'usage'),
         null
  union all
  select 4, 'aucun privilège de table loyalty pour anon / authenticated',
         not exists (select 1 from tbl t, unnest(array['anon', 'authenticated']) r(role),
                            unnest(array['select', 'insert', 'update', 'delete']) p(priv)
                     where t.oid is not null and has_table_privilege(r.role, t.oid, p.priv)),
         null
  union all
  select 5, 'fonctions public.loyalty_* présentes (25), SECURITY DEFINER, search_path vide',
         count(*) filter (where oid is not null and definer and empty_path) = 25,
         string_agg(name, ', ' order by name) filter (where oid is null or not definer or not empty_path)
  from fn
  union all
  select 6, 'anon : exécution limitée aux fonctions publiques et QR',
         bool_and(anon_exec = public_access),
         string_agg(name || '=' || anon_exec, ', ' order by name) filter (where anon_exec <> public_access)
  from fn where oid is not null
  union all
  select 7, 'authenticated : exécution de toutes les fonctions (droits revérifiés à l''intérieur)',
         bool_and(auth_exec),
         string_agg(name, ', ' order by name) filter (where not auth_exec)
  from fn where oid is not null
  union all
  select 8, 'aucune exécution accordée à PUBLIC',
         not bool_or(public_exec),
         string_agg(name, ', ' order by name) filter (where public_exec)
  from fn where oid is not null
  union all
  select 9, 'réglages : une ligne',
         (select count(*) from loyalty.settings) = 1,
         (select 'programme ' || case when is_active then 'OUVERT' else 'fermé' end
                 || ', 1 point = ' || point_value_centimes || ' centimes' from loyalty.settings)
  union all
  select 10, 'journal en ajout seul (triggers présents)',
         (select count(*) from pg_trigger where tgrelid = to_regclass('loyalty.events') and not tgisinternal) = 2,
         null
  union all
  select 11, 'compteurs des cartes = sommes du journal',
         not exists (select 1 from loyalty.cards c left join journal j on j.card_id = c.id
                     where c.points_balance <> coalesce(j.points, 0)
                        or c.stamps_total <> coalesce(j.stamps, 0)
                        or c.rewards_redeemed <> coalesce(j.redeemed, 0)),
         (select count(*) || ' carte(s), ' || (select count(*) from loyalty.staff) || ' membre(s) du personnel'
          from loyalty.cards)
)
select controle, ok, detail from checks order by n;
