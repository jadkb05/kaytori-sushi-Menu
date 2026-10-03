# Kaytôri Sushi — Menu digital

Menu digital du restaurant Kaytôri Sushi (Casablanca), ouvert par QR code ou lien :
menu → catégories → produit → variante éventuelle → panier → commande WhatsApp.

Stack : Vite 5, React 19, TypeScript, Tailwind CSS. Site statique, aucun backend.

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

## Vignettes

Après l'ajout ou le remplacement d'une photo dans `public/menu-hd-*/` ou `public/starters-hd/` :

```bash
python3 scripts/generate-menu-thumbs.py   # nécessite Pillow
```

Sans vignette, la carte affiche automatiquement la photo d'origine.

## Déploiement (Vercel)

Preset Vite, commande `npm run build`, dossier `dist`. `/` ouvre le menu ; `vercel.json` sert aussi `/menu`.
