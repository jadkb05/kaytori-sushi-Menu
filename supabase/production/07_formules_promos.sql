-- Kaytôri Sushi — catégorie « Formules & Promos » et formules déjà en ligne.
--
-- À appliquer UNE FOIS sur le projet Supabase, après autorisation.
-- Ce fichier n'est pas dans supabase/migrations/ : les tests de parité ne doivent pas
-- l'exécuter automatiquement (le seed figé ne contient pas ces lignes).
--
-- Idempotent : une formule ou la catégorie déjà présentes ne sont pas écrasées
-- (on conflict do nothing). Aucune suppression, aucune politique RLS modifiée.
-- Les images pointent vers les affiches déjà servies par le site (/formules/…).
-- Un remplacement depuis l'admin écrira ensuite l'URL Storage, sans retoucher ce script.

insert into public.categories (id, name, sort_order, is_active, display_mode)
values ('formules-promos', 'Formules & Promos', 1000, true, 'list')
on conflict (id) do nothing;

insert into public.products (
  id, category_id, name, description, price, currency, image_url, sort_order, is_active
) values
  ('formule-duo', 'formules-promos', 'Formule Duo', 'Pour deux personnes', 279.00, 'MAD', '/formules/formule-duo.jpeg', 1, true),
  ('formule-family', 'formules-promos', 'Formule Family', 'Pour quatre personnes', 539.00, 'MAD', '/formules/formule-family.jpeg', 2, true),
  ('formule-zen-box', 'formules-promos', 'Zen Box', '16 pièces', 109.00, 'MAD', '/formules/zen-box.jpeg', 3, true),
  ('formule-yaki-box', 'formules-promos', 'Yaki Box', '16 pièces', 129.00, 'MAD', '/formules/yaki-box.jpeg', 4, true),
  ('formule-fry-box', 'formules-promos', 'Fry Box', '26 pièces', 139.00, 'MAD', '/formules/fry-box.jpeg', 5, true),
  ('formule-spring-box', 'formules-promos', 'Spring Box', '34 pièces', 156.00, 'MAD', '/formules/spring-box.jpeg', 6, true),
  ('formule-kyoto-box', 'formules-promos', 'Kyoto Box', '28 pièces', 159.00, 'MAD', '/formules/kyoto-box.jpeg', 7, true),
  ('formule-nara-box', 'formules-promos', 'Nara Box', '30 pièces', 189.00, 'MAD', '/formules/nara-box.jpeg', 8, true),
  ('formule-crispy-box', 'formules-promos', 'Crispy Box', '42 pièces', 229.00, 'MAD', '/formules/crispy-box.jpeg', 9, true),
  ('formule-party-box', 'formules-promos', 'Party Box', '50 pièces', 329.00, 'MAD', '/formules/party-box.jpeg', 10, true),
  ('formule-fusion-box', 'formules-promos', 'Fusion Box', '60 pièces', 369.00, 'MAD', '/formules/fusion-box.jpeg', 11, true),
  ('formule-master-box', 'formules-promos', 'Master Box', '60 pièces', 369.00, 'MAD', '/formules/master-box.jpeg', 12, true)
on conflict (id) do nothing;
