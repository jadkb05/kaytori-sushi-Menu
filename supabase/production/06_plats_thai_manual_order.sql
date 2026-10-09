-- =============================================================================
-- PRODUCTION — 06 : Plats Thaï, passage de l'ordre automatique à l'ordre manuel
-- GÉNÉRÉ depuis supabase/migrations/20261012000000_plats_thai_manual_order.sql (contenu identique,
-- vérifié par les tests) — ne pas éditer à la main.
--
-- Prérequis : 05_plats_thai_preview_readonly.sql lancé, colonne « controle » = ok partout.
-- Une seule transaction : tout ou rien. Relancé, il ne fait rien (déjà en ordre manuel).
-- Résultat : les plats dans l'ordre enregistré, à comparer avec l'aperçu 05.
-- Retour arrière (ordre automatique) :
--   update public.categories set display_mode = 'plats_thai_sorted' where id = 'plats-thai';
-- =============================================================================

begin;

-- =============================================================================
-- Kaytôri Sushi — Plats Thaï : passage de l'ordre automatique à l'ordre manuel
--
-- Avant : display_mode = 'plats_thai_sorted' ; le menu public retrie les plats par nom
-- (src/data/menuTabSections.ts) : Bulgogi, Red curry, Ananas, Korean/Corean, Saté, puis les
-- autres par ordre alphabétique (localeCompare « fr »), égalités dans l'ordre sort_order, id.
-- Après : display_mode = 'list' ; le menu suit sort_order (positions modifiables dans l'admin).
--
-- Une transaction, dans cet ordre :
--   1. calcule l'ordre affiché aujourd'hui (même règle que le TypeScript, reproduite ici) ;
--   2. réattribue aux produits de la catégorie les MÊMES valeurs sort_order (triées) dans cet
--      ordre (valeurs en double : renumérotation min, min+1, … comme les RPC admin) ;
--   3. vérifie que l'ordre sort_order, id obtenu est exactement l'ordre calculé ;
--   4. seulement alors : display_mode = 'list', puis une ligne dans audit_log (avant / après).
--
-- Garde-fous : ARRÊT sans rien modifier si un nom contient un caractère dont l'ordre
-- alphabétique ne peut pas être garanti identique au navigateur, ou si deux noms différents
-- ne se distinguent que par les accents, la casse ou des caractères équivalents.
-- Rien d'autre n'est touché : IDs, catégorie, prix, variantes, images, autres catégories.
-- Sans effet si la catégorie n'existe pas (base vide) ou est déjà en ordre manuel.
-- Retour arrière : update public.categories set display_mode = 'plats_thai_sorted' where id = 'plats-thai';
-- =============================================================================

do $plats_thai$
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
  select c.display_mode into v_mode from public.categories c where c.id = 'plats-thai' for update;
  if not found then
    raise notice 'Plats Thaï : catégorie absente, rien à faire.';
    return;
  end if;
  if v_mode = 'list' then
    raise notice 'Plats Thaï : déjà en ordre manuel, rien à faire.';
    return;
  end if;
  if v_mode <> 'plats_thai_sorted' then
    raise exception 'ARRÊT — rien n''a été modifié : mode d''affichage inattendu pour Plats Thaï (%).', v_mode;
  end if;

  perform 1 from public.products where category_id = 'plats-thai' for update;

  -- Ordre affiché aujourd'hui (règle de menuTabSections.ts, mode plats_thai_sorted).
  create temporary table plats_thai_order on commit drop as
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
  )
  select b.*,
         row_number() over (order by b.section, b.name_key collate "C", b.sort_order, b.id collate "C")::integer as position
  from base b;

  select count(*) into n from plats_thai_order;
  if n = 0 then
    drop table plats_thai_order;
    update public.categories set display_mode = 'list' where id = 'plats-thai';
    insert into public.audit_log (user_id, action, entity_type, entity_id, payload)
    values (auth.uid(), 'category.ordering', 'category', 'plats-thai',
            jsonb_build_object('display_mode', jsonb_build_object('before', v_mode, 'after', 'list'), 'products', '[]'::jsonb));
    return;
  end if;

  -- Garde 1 : caractères dont l'ordre est garanti identique au navigateur uniquement.
  select string_agg(format('%s (%s)', o.name, o.id), ', ') into rejected
  from plats_thai_order o
  where o.name !~ '^[A-Za-z0-9 ÀÂÄÁÃÅàâäáãåÇçÉÈÊËéèêëÍÌÎÏíìîïÑñÓÒÔÖÕóòôöõÚÙÛÜúùûüÝýÿŒœÆæ,.''’()/&-]*$';
  if rejected is not null then
    raise exception 'ARRÊT — rien n''a été modifié : ordre alphabétique non garanti pour : %.', rejected;
  end if;

  -- Garde 2 : deux noms différents de même clé (ex. « Saté » / « Sate ») dans la même section.
  select string_agg(format('%s / %s', a.name, b.name), ', ') into ambiguous
  from plats_thai_order a
  join plats_thai_order b on a.section = b.section and a.name_key = b.name_key and a.name < b.name;
  if ambiguous is not null then
    raise exception 'ARRÊT — rien n''a été modifié : noms à départager par accent ou casse : %.', ambiguous;
  end if;

  before_state := (select jsonb_agg(jsonb_build_object('id', o.id, 'name', o.name, 'sort_order', o.sort_order)
                                    order by o.sort_order, o.id collate "C") from plats_thai_order o);

  -- Mêmes valeurs, redistribuées dans l'ordre affiché ; doublons → min, min+1, …
  select count(distinct o.sort_order) = count(*) into distinct_values from plats_thai_order o;
  with vals as (
    select case
             when distinct_values then o.sort_order
             else min(o.sort_order) over () + (row_number() over (order by o.sort_order, o.id collate "C"))::integer - 1
           end as new_sort,
           row_number() over (order by o.sort_order, o.id collate "C")::integer as rank
    from plats_thai_order o
  )
  update public.products p
     set sort_order = v.new_sort
    from plats_thai_order o
    join vals v on v.rank = o.position
   where p.id = o.id and p.sort_order <> v.new_sort;

  -- Vérification : l'ordre sort_order, id (celui du menu en mode list) = l'ordre calculé.
  select count(*) into mismatch
  from (
    select p.id, row_number() over (order by p.sort_order, p.id collate "C")::integer as rank,
           count(*) over (partition by p.sort_order) as same
    from public.products p where p.category_id = 'plats-thai'
  ) r
  join plats_thai_order o on o.id = r.id
  where r.rank <> o.position or r.same > 1;
  if mismatch > 0 then
    raise exception 'ARRÊT — rien n''a été modifié : ordre obtenu différent de l''ordre affiché (% écart(s)).', mismatch;
  end if;

  after_state := (select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'sort_order', p.sort_order)
                                   order by p.sort_order, p.id collate "C")
                  from public.products p where p.category_id = 'plats-thai');

  -- Positions en place et vérifiées : seulement maintenant, l'ordre devient manuel.
  update public.categories set display_mode = 'list' where id = 'plats-thai';

  insert into public.audit_log (user_id, action, entity_type, entity_id, payload)
  values (auth.uid(), 'category.ordering', 'category', 'plats-thai',
          jsonb_build_object('display_mode', jsonb_build_object('before', v_mode, 'after', 'list'),
                             'before', before_state, 'after', after_state));

  drop table plats_thai_order;
  raise notice 'Plats Thaï : % produit(s), ordre manuel activé.', n;
end
$plats_thai$;

commit;

select row_number() over (order by p.sort_order, p.id) as position, p.id, p.name as nom, p.is_active as visible,
       p.sort_order, c.display_mode
from public.products p join public.categories c on c.id = p.category_id
where p.category_id = 'plats-thai'
order by p.sort_order, p.id;
