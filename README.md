# Kaytôri Sushi — Menu digital

Menu digital du restaurant Kaytôri Sushi (Casablanca), ouvert par QR code ou lien :
menu → catégories → produit → variante éventuelle → panier → commande WhatsApp.

Stack : Vite 5, React 19, TypeScript, Tailwind CSS. Site statique, aucun backend, aucune variable d'environnement.

## Commandes

```bash
npm install
npm run dev      # développement
npm run build    # build de production (dist/)
npm run preview  # servir le build localement
```

## Où se trouvent les choses

| Fichier | Rôle |
|---|---|
| `src/data/menu.json` | **Source de vérité du menu** : lignes de production (catégories, produits, variantes, sections formules, couvertures, réglage de défilement), exportées de l'ancienne base Supabase le 2026-11-02 |
| `src/data/productionMenu.ts` | `menu.json` → menu affiché (mêmes fonctions qu'avant : `rowsToMenu`, `publishedFormules`, `replaceFormules`) |
| `public/media/` | Photos de production (originaux à l'identique, nom = empreinte SHA-256) et versions allégées `-<largeur>.webp` |
| `src/data/yumloMenu.ts` | Menu de référence historique (mai 2026), **plus affiché** : tests et repli de catégorie WhatsApp |
| `src/data/menuTabSections.ts` | Sous-sections (Assortiments par nombre de pièces, Plats Thaï) |
| `src/data/dishImages.ts`, `startersYakamon.ts` | Correspondance plat → photo |
| `src/pages/MenuPage.tsx` | Page du menu : header, catégories sticky, progression, sections |
| `src/menu/` | Carte produit, modale de variantes, helpers d'affichage |
| `src/cart/` | Panier (contexte, persistance 12 h, message WhatsApp) |
| `src/config/site.ts` | Numéro WhatsApp, téléphone, adresse, horaires |
| `public/menu-thumbs/` | Vignettes WebP 136/204 px affichées dans les cartes |

## Vignettes

Après l'ajout ou le remplacement d'une photo dans `public/menu-hd-*/` ou `public/starters-hd/` :

```bash
python3 scripts/generate-menu-thumbs.py   # nécessite Pillow
```

Sans vignette, la carte affiche automatiquement la photo d'origine.

## Modifier le menu (sans administration)

L'administration `/admin` et Supabase ne sont plus utilisés. Pour changer un prix, un nom, l'ordre
ou masquer un plat : modifier `src/data/menu.json` (`is_active: false` masque), puis `npm test` et redéployer.
Pour une nouvelle photo : la placer dans `public/media/…` sous le nom `<32 premiers hex du SHA-256>.<ext>`,
générer ses versions allégées (mêmes règles que `scripts/build-static-menu.py`) et référencer
`/media/…` dans `image_url`.

Régénérer tout le menu depuis un export de la base (tant que le projet Supabase existe) :

```bash
python3 scripts/build-static-menu.py <dossier-lignes-json> <copie-du-bucket-menu-images>
VITE_SUPABASE_URL=… VITE_SUPABASE_ANON_KEY=… npm run menu:parity   # 0 écart attendu
```

`supabase/` est conservé comme **archive** (schéma, migrations, scripts) pour un éventuel retour arrière.

## Déploiement (Vercel)

Preset Vite, commande `npm run build`, dossier `dist`. `/` ouvre le menu ; `vercel.json` sert aussi `/menu`.
