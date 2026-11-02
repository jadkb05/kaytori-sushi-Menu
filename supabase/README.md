# Supabase — base du menu (préparation CMS)

**État : préparé, non utilisé par le site.** Le menu public lit toujours `src/data/yumloMenu.ts`
(source `static`, voir `src/data/menuSource.ts`).

| Fichier | Rôle |
|---|---|
| `migrations/20261006000000_menu_schema.sql` | Tables `categories`, `products`, `product_variants`, `admin_users`, `audit_log` ; RLS ; bucket Storage `menu-images` |
| `seed.sql` | Menu actuel (32 catégories, 226 produits, 67 variantes), **généré** — ne pas éditer |
| `tests/rls_check.sql` | Vérification RLS/Storage à lancer dans le SQL Editor (16 contrôles, rien n'est conservé) |

## Commandes

```bash
npm run supabase:seed     # régénère seed.sql depuis yumloMenu.ts (aucune connexion)
npm test                  # applique migration + seed sur un PostgreSQL en mémoire et vérifie la parité
npm run supabase:parity   # compare le vrai projet Supabase (.env.local) au menu statique, champ par champ
```

## Règles

- IDs produits et IDs de variantes = ceux de `yumloMenu.ts`, jamais régénérés.
- Ordre : `sort_order` (catégories, produits = position dans le fichier source, variantes).
- `display_mode` : `assortiments_by_pcs` (Assortiments), sinon `list` (Plats Thaï compris depuis 20261012000000 ; `plats_thai_sorted` ne sert qu'au retour arrière).
- Assortiments en ordre manuel (données uniquement, pas de migration de schéma) : `production/16_assortiments_preview_readonly.sql`
  (aperçu, lecture seule, `controle` = ok partout) puis `production/17_assortiments_manual_order.sql` (une transaction,
  ordre public conservé, `display_mode` → `list`). Le menu public garde les sous-titres « Assortiments XX pcs » (id `assortiments`).
  À lancer après le déploiement du front. Retour arrière : `update public.categories set display_mode = 'assortiments_by_pcs' where id = 'assortiments';`
- Public (`anon`) : lecture du contenu actif uniquement. Écriture : admins (`admin_users`) seulement.
- Un admin s'ajoute en SQL (`insert into public.admin_users (user_id) values ('<uuid auth.users>')`), jamais depuis le frontend.
- Frontend : clé `anon` uniquement (`.env.local`, ignoré par Git). La clé `service_role` ne doit jamais être exposée.
- Le seed est idempotent (upsert, aucune suppression) mais remet les lignes concernées à l'état du statique :
  ne pas le relancer sur une base déjà modifiée depuis l'admin.

## Carte de fidélité (phase 1 : base de données uniquement)

Schéma dédié `loyalty` (jamais exposé par l'API) et fonctions `public.loyalty_*` (SECURITY DEFINER,
droits vérifiés dans chaque fonction). Aucun objet du menu n'est modifié ; `is_admin()` est seulement appelée.

| Fichier | Rôle |
|---|---|
| `migrations/20261026120000_loyalty.sql` | Tables `loyalty.settings/staff/customers/cards/events`, journal en ajout seul, 15 RPC |
| `production/13_loyalty.sql` | Installation gardée (refusée si déjà présente ou si `01_schema.sql` manque). Programme installé **fermé** |
| `production/14_loyalty_verify_readonly.sql` | Vérification en lecture seule (11 contrôles, tous `ok`) |
| `production/15_loyalty_grant_staff.template.sql` | Déclarer un manager ou un owner (un compte Supabase Auth par personne) |
| `production/98_loyalty_rollback.sql` | Retour arrière ; refuse de supprimer des cartes sans seconde confirmation. À lancer avant `99_rollback.sql` |

Arrêter le programme sans rien perdre : `loyalty_update_settings({"is_active": false})` (owner).
Tests : `tests/loyalty.test.ts`, `tests/loyaltyProduction.test.ts`.
