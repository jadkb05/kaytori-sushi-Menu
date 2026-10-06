-- =============================================================================
-- Vérification RLS / Storage du menu — à exécuter APRÈS la migration et le seed,
-- dans le SQL Editor du projet Supabase (rôle postgres).
--
-- Simule : visiteur anonyme, utilisateur connecté non admin, admin.
-- Toutes les modifications faites pendant le test sont ANNULÉES (rollback interne) :
-- la base reste exactement dans l'état du seed.
--
-- Résultat : un tableau « test | ok | detail ». Tout doit être ok = true.
-- =============================================================================

create temp table if not exists rls_results (n int, test text, ok boolean, detail text);
truncate rls_results;

do $rls$
declare
  results  jsonb := '[]'::jsonb;
  admin_id uuid := gen_random_uuid();
  user_id  uuid := gen_random_uuid();
  pid      text;
  n        bigint;
begin
  select id into pid
  from public.products p
  where exists (select 1 from public.product_variants v where v.product_id = p.id)
  order by sort_order
  limit 1;

  begin
    ---------------------------------------------------------------- visiteur anonyme
    perform set_config('request.jwt.claim.sub', '', true);
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    set local role anon;

    select count(*) into n from public.categories;
    results := results || jsonb_build_object('test', 'anon lit 31 catégories', 'ok', n = 31, 'detail', n);
    select count(*) into n from public.products;
    results := results || jsonb_build_object('test', 'anon lit 214 produits', 'ok', n = 214, 'detail', n);
    select count(*) into n from public.product_variants;
    results := results || jsonb_build_object('test', 'anon lit 67 variantes', 'ok', n = 67, 'detail', n);

    begin
      update public.products set price = 1;
      results := results || jsonb_build_object('test', 'anon ne peut pas modifier un produit', 'ok', false, 'detail', 'modification acceptée');
    exception when others then
      results := results || jsonb_build_object('test', 'anon ne peut pas modifier un produit', 'ok', true, 'detail', sqlerrm);
    end;

    begin
      insert into public.categories (id, name, sort_order) values ('rls-test', 'RLS test', 999);
      results := results || jsonb_build_object('test', 'anon ne peut pas créer de catégorie', 'ok', false, 'detail', 'insertion acceptée');
    exception when others then
      results := results || jsonb_build_object('test', 'anon ne peut pas créer de catégorie', 'ok', true, 'detail', sqlerrm);
    end;

    begin
      perform 1 from public.admin_users;
      results := results || jsonb_build_object('test', 'anon ne lit pas admin_users', 'ok', false, 'detail', 'lecture acceptée');
    exception when others then
      results := results || jsonb_build_object('test', 'anon ne lit pas admin_users', 'ok', true, 'detail', sqlerrm);
    end;

    begin
      perform 1 from public.audit_log;
      results := results || jsonb_build_object('test', 'anon ne lit pas audit_log', 'ok', false, 'detail', 'lecture acceptée');
    exception when others then
      results := results || jsonb_build_object('test', 'anon ne lit pas audit_log', 'ok', true, 'detail', sqlerrm);
    end;

    begin
      insert into storage.objects (bucket_id, name) values ('menu-images', 'rls-test/anon.jpg');
      results := results || jsonb_build_object('test', 'anon ne peut pas déposer d''image', 'ok', false, 'detail', 'insertion acceptée');
    exception when others then
      results := results || jsonb_build_object('test', 'anon ne peut pas déposer d''image', 'ok', true, 'detail', sqlerrm);
    end;

    reset role;

    ---------------------------------------------------------------- éléments désactivés
    update public.products set is_active = false where id = pid;
    update public.categories set is_active = false where id = 'desserts';
    set local role anon;
    select count(*) into n from public.products where id = pid;
    results := results || jsonb_build_object('test', 'anon ne voit pas un produit désactivé', 'ok', n = 0, 'detail', n);
    select count(*) into n from public.product_variants where product_id = pid;
    results := results || jsonb_build_object('test', 'anon ne voit pas ses variantes', 'ok', n = 0, 'detail', n);
    select count(*) into n from public.products where category_id = 'desserts';
    results := results || jsonb_build_object('test', 'anon ne voit pas une catégorie désactivée', 'ok', n = 0, 'detail', n);
    reset role;
    update public.products set is_active = true where id = pid;
    update public.categories set is_active = true where id = 'desserts';

    ---------------------------------------------------------------- utilisateurs de test
    insert into auth.users (id) values (admin_id), (user_id);
    insert into public.admin_users (user_id) values (admin_id);

    ---------------------------------------------------------------- connecté, non admin
    perform set_config('request.jwt.claim.sub', user_id::text, true);
    perform set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
    set local role authenticated;

    update public.products set price = 1;
    get diagnostics n = row_count;
    results := results || jsonb_build_object('test', 'non-admin : 0 produit modifié', 'ok', n = 0, 'detail', n);

    begin
      insert into storage.objects (bucket_id, name) values ('menu-images', 'rls-test/user.jpg');
      results := results || jsonb_build_object('test', 'non-admin ne peut pas déposer d''image', 'ok', false, 'detail', 'insertion acceptée');
    exception when others then
      results := results || jsonb_build_object('test', 'non-admin ne peut pas déposer d''image', 'ok', true, 'detail', sqlerrm);
    end;

    reset role;

    ---------------------------------------------------------------- admin
    perform set_config('request.jwt.claim.sub', admin_id::text, true);
    perform set_config('request.jwt.claims', json_build_object('sub', admin_id, 'role', 'authenticated')::text, true);
    set local role authenticated;

    update public.products set description = description where id = pid;
    get diagnostics n = row_count;
    results := results || jsonb_build_object('test', 'admin peut modifier un produit', 'ok', n = 1, 'detail', n);

    begin
      insert into public.audit_log (user_id, action, entity_type, entity_id)
      values (admin_id, 'rls-test', 'product', pid);
      results := results || jsonb_build_object('test', 'admin peut écrire dans audit_log', 'ok', true, 'detail', 'ok');
    exception when others then
      results := results || jsonb_build_object('test', 'admin peut écrire dans audit_log', 'ok', false, 'detail', sqlerrm);
    end;

    begin
      insert into storage.objects (bucket_id, name) values ('menu-images', 'rls-test/admin.jpg');
      results := results || jsonb_build_object('test', 'admin peut déposer une image', 'ok', true, 'detail', 'ok');
    exception when others then
      results := results || jsonb_build_object('test', 'admin peut déposer une image', 'ok', false, 'detail', sqlerrm);
    end;

    reset role;

    -- Annule TOUTES les modifications faites ci-dessus.
    raise exception using errcode = 'P0001', message = 'rls_check_rollback';
  exception
    when raise_exception then
      if sqlerrm <> 'rls_check_rollback' then raise; end if;
  end;

  insert into rls_results (n, test, ok, detail)
  select ord::int, r ->> 'test', (r ->> 'ok')::boolean, r ->> 'detail'
  from jsonb_array_elements(results) with ordinality as t(r, ord);
end;
$rls$;

select test, ok, detail from rls_results order by n;
