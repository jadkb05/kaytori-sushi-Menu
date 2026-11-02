-- =============================================================================
-- PRODUCTION — 15 : droits de gestion de la fidélité pour UN compte (MODÈLE — ne pas exécuter tel quel)
--
-- Prérequis : 13_loyalty.sql appliqué ; le compte existe déjà
-- (Dashboard → Authentication → Users → Add user → « Auto Confirm User »), UN compte par personne.
-- Remplacer chaque <EMAIL_MANAGER> par l'e-mail du compte et <ROLE> (ligne « v_role ») par
-- manager ou owner, puis exécuter dans le SQL Editor.
--   manager : recherche, fiche, tampons, récompenses, corrections, nouveau lien ;
--             AUCUN droit sur le menu, les formules ou les réglages de la fidélité.
--   owner   : manager + réglages, suspension de cartes, diagnostic.
-- Les admins du site (admin_users) sont déjà owner : inutile de les ajouter ici.
-- Aucun mot de passe ici ; ce fichier ne contient aucune donnée réelle.
-- Retour arrière : delete from loyalty.staff where user_id = (select id from auth.users where lower(email) = lower('<EMAIL_MANAGER>'));
-- =============================================================================

begin;

do $grant$
declare
  target uuid;
  n int;
  v_role constant text := '<ROLE>';
begin
  if v_role not in ('manager', 'owner') then
    raise exception 'ARRÊT — rien n''a été modifié : rôle « % » invalide (manager ou owner).', v_role;
  end if;
  select count(*), min(id::text)::uuid into n, target from auth.users where lower(email) = lower('<EMAIL_MANAGER>');
  if n <> 1 then
    raise exception 'ARRÊT — rien n''a été modifié : % compte(s) trouvé(s) pour cet e-mail (1 attendu).', n;
  end if;
  insert into loyalty.staff (user_id, role) values (target, v_role)
  on conflict (user_id) do update set role = excluded.role;
  raise notice 'Personnel fidélité : % manager(s), % owner(s) déclarés.',
    (select count(*) from loyalty.staff where role = 'manager'),
    (select count(*) from loyalty.staff where role = 'owner');
end
$grant$;

commit;
