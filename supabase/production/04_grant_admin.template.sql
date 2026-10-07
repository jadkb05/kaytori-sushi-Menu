-- =============================================================================
-- PRODUCTION — 04 : donner les droits admin à UN compte (MODÈLE — ne pas exécuter tel quel)
--
-- Prérequis (Dashboard → Authentication → Users → Add user → « Auto Confirm User ») :
-- le compte existe déjà. Aucun mot de passe ici ; ce fichier ne contient aucune donnée réelle.
-- Remplacer <EMAIL_ADMIN> (une seule occurrence) puis exécuter dans le SQL Editor.
-- Retour arrière : delete from public.admin_users where user_id = (select id from auth.users where email = '<EMAIL_ADMIN>');
-- =============================================================================

begin;

do $grant$
declare
  target uuid;
  n int;
begin
  select count(*), min(id::text)::uuid into n, target from auth.users where lower(email) = lower('<EMAIL_ADMIN>');
  if n <> 1 then
    raise exception 'ARRÊT — rien n''a été modifié : % compte(s) trouvé(s) pour cet e-mail (1 attendu).', n;
  end if;
  insert into public.admin_users (user_id) values (target) on conflict (user_id) do nothing;
  raise notice 'Admins déclarés : %', (select count(*) from public.admin_users);
end
$grant$;

commit;
