-- =============================================================================
-- PRODUCTION — 17 : Assortiments, passage de l'ordre automatique à l'ordre manuel
--
-- DONNÉES UNIQUEMENT : aucune table, colonne, fonction, contrainte ni politique RLS modifiée.
-- Le schéma actuel suffit : display_mode = 'list' est déjà accepté (contrainte check) et la RPC
-- admin_save_product déplace déjà les produits des catégories en 'list' (flèches ↑ / ↓ de l'admin).
--
-- Avant : display_mode = 'assortiments_by_pcs' ; le menu public retrie les assortiments
-- (src/data/menuTabSections.ts) par format (nombre de pièces ; Extasy 40 → 36 ; 44 → 48 ; sans
-- « pcs » → en dernier), puis par nom (localeCompare « fr »), égalités dans l'ordre sort_order, id ;
-- l'admin affiche « Ordre automatique » et la RPC ignore toute position demandée.
-- Après : display_mode = 'list' ; le menu suit sort_order (positions modifiables dans l'admin) et
-- garde les sous-titres « Assortiments XX pcs » (menuCategoryPcsHeadings, id « assortiments »).
--
-- Prérequis : 16_assortiments_preview_readonly.sql lancé, colonne « controle » = ok partout,
-- et le site déployé avec la version qui garde les sous-titres en ordre manuel (sinon les
-- sous-titres disparaissent du menu public jusqu'au déploiement ; l'ordre reste le même).
--
-- Une seule transaction, dans cet ordre :
--   1. calcule l'ordre affiché aujourd'hui (même règle que le TypeScript, reproduite ici) ;
--   2. réattribue aux produits de la catégorie les MÊMES valeurs sort_order (triées) dans cet
--      ordre (valeurs en double : renumérotation min, min+1, … comme les RPC admin) ;
--   3. vérifie que l'ordre sort_order, id obtenu est exactement l'ordre calculé ;
--   4. seulement alors : display_mode = 'list', puis une ligne dans audit_log (avant / après).
--
-- Garde-fous : ARRÊT sans rien modifier si un nom contient un caractère dont l'ordre
-- alphabétique ne peut pas être garanti identique au navigateur, ou si deux noms différents
-- de même format ne se distinguent que par les accents, la casse ou des caractères équivalents.
-- Rien d'autre n'est touché : IDs, catégorie, noms, prix, variantes, photos, autres catégories.
-- Sans effet si la catégorie n'existe pas ou est déjà en ordre manuel (relancé : ne fait rien).
-- Résultat : les assortiments dans l'ordre enregistré, à comparer avec l'aperçu 16.
-- Retour arrière (ordre automatique ; les sort_order réattribués ne changent pas l'ordre affiché) :
--   update public.categories set display_mode = 'assortiments_by_pcs' where id = 'assortiments';
-- =============================================================================

begin;

do $assortiments$
declare
  v_mode text;
  n integer;
  ambiguous text;
  rejected text;
  before_state jsonb;
  after_state jsonb;
  mismatch integer;
  distinct_values boolean;
begin
  select c.display_mode into v_mode from public.categories c where c.id = 'assortiments' for update;
  if not found then
    raise notice 'Assortiments : catégorie absente, rien à faire.';
    return;
  end if;
  if v_mode = 'list' then
    raise notice 'Assortiments : déjà en ordre manuel, rien à faire.';
    return;
  end if;
  if v_mode <> 'assortiments_by_pcs' then
    raise exception 'ARRÊT — rien n''a été modifié : mode d''affichage inattendu pour Assortiments (%).', v_mode;
  end if;

  perform 1 from public.products where category_id = 'assortiments' for update;

  -- Ordre affiché aujourd'hui (règle de menuTabSections.ts, mode assortiments_by_pcs).
  create temporary table assortiments_order on commit drop as
  with base as (
    select p.id, p.name, p.sort_order, p.is_active,
           -- assortimentSortKey() : /extasy\s*40/i → 36 ; /(\d+)\s*pcs/i → n (44 → 48) ; sinon 999.
           case
             when p.name ~ '[Ee][Xx][Tt][Aa][Ss][Yy][\t\n\v\f\r \u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]*40' then 36::numeric
             when p.name ~ '[0-9]+[\t\n\v\f\r \u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]*[Pp][Cc][Ss]' then
               case substring(p.name from '([0-9]+)[\t\n\v\f\r \u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]*[Pp][Cc][Ss]')::numeric
                 when 44 then 48::numeric
                 else substring(p.name from '([0-9]+)[\t\n\v\f\r \u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]*[Pp][Cc][Ss]')::numeric
               end
             else 999::numeric
           end as format_key,
           -- Clé alphabétique « primaire » (comme localeCompare : accents et casse ignorés,
           -- espace < ponctuation < chiffres < lettres), comparée octet par octet.
           translate(
             replace(replace(replace(replace(p.name, 'œ', 'oe'), 'Œ', 'oe'), 'æ', 'ae'), 'Æ', 'ae'),
             'ABCDEFGHIJKLMNOPQRSTUVWXYZÀÂÄÁÃÅàâäáãåÇçÉÈÊËéèêëÍÌÎÏíìîïÑñÓÒÔÖÕóòôöõÚÙÛÜúùûüÝýÿ -,.''’()/&',
             'abcdefghijklmnopqrstuvwxyzaaaaaaaaaaaacceeeeeeeeiiiiiiiinnoooooooooouuuuuuuuyyy'
               || chr(1) || chr(2) || chr(3) || chr(4) || chr(5) || chr(6) || chr(7) || chr(8) || chr(9) || chr(11)
           ) as name_key
    from public.products p
    where p.category_id = 'assortiments'
  )
  select b.*,
         row_number() over (order by b.format_key, b.name_key collate "C", b.sort_order, b.id collate "C")::integer as position
  from base b;

  select count(*) into n from assortiments_order;
  if n = 0 then
    drop table assortiments_order;
    update public.categories set display_mode = 'list' where id = 'assortiments';
    insert into public.audit_log (user_id, action, entity_type, entity_id, payload)
    values (auth.uid(), 'category.ordering', 'category', 'assortiments',
            jsonb_build_object('display_mode', jsonb_build_object('before', v_mode, 'after', 'list'), 'products', '[]'::jsonb));
    return;
  end if;

  -- Garde 1 : caractères dont l'ordre est garanti identique au navigateur uniquement.
  select string_agg(format('%s (%s)', o.name, o.id), ', ') into rejected
  from assortiments_order o
  where o.name !~ '^[A-Za-z0-9 ÀÂÄÁÃÅàâäáãåÇçÉÈÊËéèêëÍÌÎÏíìîïÑñÓÒÔÖÕóòôöõÚÙÛÜúùûüÝýÿŒœÆæ,.''’()/&-]*$';
  if rejected is not null then
    raise exception 'ARRÊT — rien n''a été modifié : ordre alphabétique non garanti pour : %.', rejected;
  end if;

  -- Garde 2 : deux noms différents de même clé (ex. « Délice » / « Delice ») dans le même format.
  select string_agg(format('%s / %s', a.name, b.name), ', ') into ambiguous
  from assortiments_order a
  join assortiments_order b on a.format_key = b.format_key and a.name_key = b.name_key and a.name < b.name;
  if ambiguous is not null then
    raise exception 'ARRÊT — rien n''a été modifié : noms à départager par accent ou casse : %.', ambiguous;
  end if;

  before_state := (select jsonb_agg(jsonb_build_object('id', o.id, 'name', o.name, 'sort_order', o.sort_order)
                                    order by o.sort_order, o.id collate "C") from assortiments_order o);

  -- Mêmes valeurs, redistribuées dans l'ordre affiché ; doublons → min, min+1, …
  select count(distinct o.sort_order) = count(*) into distinct_values from assortiments_order o;
  with vals as (
    select case
             when distinct_values then o.sort_order
             else min(o.sort_order) over () + (row_number() over (order by o.sort_order, o.id collate "C"))::integer - 1
           end as new_sort,
           row_number() over (order by o.sort_order, o.id collate "C")::integer as rank
    from assortiments_order o
  )
  update public.products p
     set sort_order = v.new_sort
    from assortiments_order o
    join vals v on v.rank = o.position
   where p.id = o.id and p.sort_order <> v.new_sort;

  -- Vérification : l'ordre sort_order, id (celui du menu en mode list) = l'ordre calculé.
  select count(*) into mismatch
  from (
    select p.id, row_number() over (order by p.sort_order, p.id collate "C")::integer as rank,
           count(*) over (partition by p.sort_order) as same
    from public.products p where p.category_id = 'assortiments'
  ) r
  join assortiments_order o on o.id = r.id
  where r.rank <> o.position or r.same > 1;
  if mismatch > 0 then
    raise exception 'ARRÊT — rien n''a été modifié : ordre obtenu différent de l''ordre affiché (% écart(s)).', mismatch;
  end if;

  after_state := (select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'sort_order', p.sort_order)
                                   order by p.sort_order, p.id collate "C")
                  from public.products p where p.category_id = 'assortiments');

  -- Positions en place et vérifiées : seulement maintenant, l'ordre devient manuel.
  update public.categories set display_mode = 'list' where id = 'assortiments';

  insert into public.audit_log (user_id, action, entity_type, entity_id, payload)
  values (auth.uid(), 'category.ordering', 'category', 'assortiments',
          jsonb_build_object('display_mode', jsonb_build_object('before', v_mode, 'after', 'list'),
                             'before', before_state, 'after', after_state));

  drop table assortiments_order;
  raise notice 'Assortiments : % produit(s), ordre manuel activé.', n;
end
$assortiments$;

commit;

select row_number() over (order by p.sort_order, p.id) as position, p.id, p.name as nom, p.is_active as visible,
       p.sort_order, c.display_mode
from public.products p join public.categories c on c.id = p.category_id
where p.category_id = 'assortiments'
order by p.sort_order, p.id;
