-- =============================================================================
-- PRODUCTION — 99 : RETOUR ARRIÈRE de 01_schema.sql + 02_catalog.sql
--
-- DESTRUCTIF pour les objets créés par 01/02 (tables du menu CMS, fonctions, politiques).
-- À n'utiliser qu'avec un GO explicite. Le site public n'en dépend pas tant que
-- VITE_MENU_SOURCE n'est pas « supabase » (menu statique), et le menu Supabase retomberait
-- de toute façon sur le statique (repli automatique).
--
-- Garde-fous :
--   - ne fait RIEN tant que la ligne de confirmation ci-dessous n'est pas décommentée ;
--   - n'efface AUCUN fichier Storage : si le bucket menu-images contient des fichiers, le bucket
--     et ses 4 politiques sont conservés (seule la base est retirée) ;
--   - ne touche à aucun autre objet (autres tables, autres buckets, auth.users).
-- Une seule transaction : tout ou rien.
-- =============================================================================

begin;

-- Décommenter pour confirmer :
-- select set_config('kaytori.confirm_rollback', 'OUI', true);

do $rollback$
declare
  files bigint;
begin
  if coalesce(current_setting('kaytori.confirm_rollback', true), '') <> 'OUI' then
    raise exception 'ARRÊT — rien n''a été modifié : confirmation absente (voir la ligne à décommenter).';
  end if;

  drop function if exists public.admin_delete_category(text);
  drop function if exists public.admin_update_category(text, jsonb, integer);
  drop function if exists public.admin_create_category(text, text, boolean, integer);
  drop function if exists public.admin_delete_product(text);
  drop function if exists public.admin_save_product(text, jsonb, jsonb, integer);
  drop function if exists public.admin_create_product(jsonb, jsonb, integer);
  drop function if exists public.admin_update_product(text, jsonb, jsonb);

  -- Tables (variantes → produits → catégories ; triggers, index et politiques suivent leur table).
  drop table if exists public.product_variants;
  drop table if exists public.products;
  drop table if exists public.categories;
  drop table if exists public.audit_log;
  drop table if exists public.admin_users;

  select count(*) into files from storage.objects where bucket_id = 'menu-images';
  if files = 0 then
    drop policy if exists "menu-images: lecture publique" on storage.objects;
    drop policy if exists "menu-images: ajout admin" on storage.objects;
    drop policy if exists "menu-images: modification admin" on storage.objects;
    drop policy if exists "menu-images: suppression admin" on storage.objects;
    delete from storage.buckets where id = 'menu-images';
  else
    raise notice 'Bucket menu-images conservé avec ses politiques : % fichier(s), aucun supprimé.', files;
  end if;

  -- Après les politiques Storage, qui l'utilisent.
  if files = 0 then
    drop function if exists public.is_admin();
  end if;
  drop function if exists public.set_updated_at();
end
$rollback$;

commit;
