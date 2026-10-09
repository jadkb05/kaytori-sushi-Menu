-- =============================================================================
-- PRODUCTION — 05 : Plats Thaï, APERÇU avant le passage en ordre manuel — LECTURE SEULE
--
-- Uniquement des SELECT : rien n'est modifié. Pour chaque produit de Plats Thaï (masqués
-- compris) : position affichée aujourd'hui, sort_order actuel et sort_order que
-- 06_plats_thai_manual_order.sql attribuera. Même calcul que la migration
-- supabase/migrations/20261012000000_plats_thai_manual_order.sql (vérifié par les tests).
--
-- Colonne « controle » : tout doit être « ok ». Sinon ne pas lancer 06 (il s'arrêterait de
-- toute façon sans rien modifier) et transmettre le résultat.
-- =============================================================================

with base as (
  select p.id, p.name, p.sort_order, p.is_active,
         -- platsThaiSection() : premier motif reconnu (regex JS insensibles à la casse).
         case
           when p.name ~ '[Bb][Uu][Ll][Gg][Oo][Gg][Ii]' then 0
           when p.name ~ '[Rr][Ee][Dd][\t\n\v\f\r \u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]*[Cc][Uu][Rr][Rr][Yy]' then 1
           when p.name ~ '[Aa][Nn][Aa][Nn][Aa][Ss]' then 2
           when p.name ~ '[CcKk][Oo][Rr][Ee][Aa][Nn]' then 3
           when p.name ~ '[Ss][Aa][Tt][ÉéEe]' then 4
           else 5
         end as section,
         -- Clé alphabétique « primaire » (comme localeCompare : accents et casse ignorés,
         -- espace < ponctuation < chiffres < lettres), comparée octet par octet.
         translate(
           replace(replace(replace(replace(p.name, 'œ', 'oe'), 'Œ', 'oe'), 'æ', 'ae'), 'Æ', 'ae'),
           'ABCDEFGHIJKLMNOPQRSTUVWXYZÀÂÄÁÃÅàâäáãåÇçÉÈÊËéèêëÍÌÎÏíìîïÑñÓÒÔÖÕóòôöõÚÙÛÜúùûüÝýÿ -,.''’()/&',
           'abcdefghijklmnopqrstuvwxyzaaaaaaaaaaaacceeeeeeeeiiiiiiiinnoooooooooouuuuuuuuyyy'
             || chr(1) || chr(2) || chr(3) || chr(4) || chr(5) || chr(6) || chr(7) || chr(8) || chr(9) || chr(11)
         ) as name_key
  from public.products p
  where p.category_id = 'plats-thai'
),
ordered as (
  select b.*,
         row_number() over (order by b.section, b.name_key collate "C", b.sort_order, b.id collate "C")::integer as position,
         row_number() over (order by b.sort_order, b.id collate "C")::integer as value_rank,
         min(b.sort_order) over () as min_sort,
         (select count(distinct x.sort_order) = count(*) from base x) as distinct_values
  from base b
)
select o.position as position_affichee,
       o.id,
       o.name as nom,
       o.is_active as visible,
       o.sort_order as sort_order_actuel,
       case when o.distinct_values then (select v.sort_order from ordered v where v.value_rank = o.position)
            else o.min_sort + o.position - 1 end as sort_order_apres,
       (select c.display_mode from public.categories c where c.id = 'plats-thai') as display_mode_actuel,
       case
         when o.name !~ '^[A-Za-z0-9 ÀÂÄÁÃÅàâäáãåÇçÉÈÊËéèêëÍÌÎÏíìîïÑñÓÒÔÖÕóòôöõÚÙÛÜúùûüÝýÿŒœÆæ,.''’()/&-]*$' then 'ARRÊT : caractère non garanti'
         when exists (select 1 from ordered x where x.section = o.section and x.name_key = o.name_key and x.name <> o.name)
           then 'ARRÊT : nom à départager par accent ou casse'
         else 'ok'
       end as controle
from ordered o
order by o.position;
