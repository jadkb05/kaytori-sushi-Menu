# Kaytôri Sushi — Menu digital

Menu digital du restaurant Kaytôri Sushi (Casablanca), ouvert par QR code ou lien :
menu → catégories → produit → variante éventuelle → panier → commande WhatsApp.

Stack : Vite 5, React 19, TypeScript, Tailwind CSS. Site statique, aucun backend.

Deux pages HTML (build multi-pages Vite) :

- `/` (`index.html` → `src/home/main.tsx`) : page d'accueil du restaurant. Tous ses boutons
  « Commander » mènent au menu. Les anciens liens `/#formules-midi`, `/#promos`,
  `/#formules-solo-duo-family` et `/#menu-cat-…` sont redirigés vers `/menu#…`.
- `/menu` (`menu/index.html` → `src/main.tsx`) : menu digital, panier et commande WhatsApp ;
  sert aussi `/admin` et `/fidelite` (réécritures dans `vercel.json`, reproduites en dev par `vite.config.ts`).

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
| `src/data/yumloMenu.ts` | **Source de vérité du menu** : plats, catégories (ordre), prix, descriptions, variantes, images |
| `src/data/menuTabSections.ts` | Sous-sections (Assortiments par nombre de pièces, Plats Thaï) |
| `src/data/dishImages.ts`, `startersYakamon.ts` | Correspondance plat → photo |
| `src/pages/MenuPage.tsx` | Page du menu : header, catégories sticky, progression, sections |
| `src/menu/` | Carte produit, modale de variantes, helpers d'affichage |
| `src/cart/` | Panier (contexte, persistance 12 h, message WhatsApp) |
| `src/config/site.ts` | Numéro WhatsApp, téléphone, adresse, horaires |
| `public/menu-thumbs/` | Vignettes WebP 136/204 px affichées dans les cartes |
| `src/home/` | Page d'accueil (/) ; photos et plats mis en avant centralisés dans `homeContent.ts` |
| `public/accueil/` | Photos de l'accueil fournies par le restaurant (originaux + dérivés WebP) ; `salle-kaytori.jpg` = source de l'image de partage `public/og/kaytori-sushi-salle-1200x630.jpg` |
| `src/loyalty/` | Carte de fidélité (`/fidelite`), chargée à part du menu ; appels publics dans `lib/api.ts` |

## Carte de fidélité (développement local)

```bash
npm run dev:fidelite   # /fidelite avec la vraie migration SQL dans PGlite (navigateur), sans Supabase
```

Barre « Banc local » en bas à droite : cartes de démonstration, tampons, programme ouvert / fermé,
réseau simulé (lent, coupé, réponse perdue). Jamais inclus dans le build de production.
Domaine encodé dans les QR : `VITE_LOYALTY_QR_ORIGIN` (https), sinon le domaine qui sert la page.

## Vignettes

Après l'ajout ou le remplacement d'une photo dans `public/menu-hd-*/` ou `public/starters-hd/` :

```bash
python3 scripts/generate-menu-thumbs.py   # nécessite Pillow
```

Sans vignette, la carte affiche automatiquement la photo d'origine.

## Déploiement (Vercel)

Preset Vite, commande `npm run build`, dossier `dist`. `/` ouvre le menu ; `vercel.json` sert aussi `/menu`.
