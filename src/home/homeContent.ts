/**
 * Contenu de la page d'accueil (/) : photos, plats mis en avant, liens vers le menu.
 * Une seule source pour remplacer les visuels plus tard sans toucher à la mise en page.
 *
 * Volontairement sans import des données du menu (yumloMenu, formules…) : la page d'accueil
 * reste légère. tests/homePage.test.tsx vérifie que les noms, descriptions et ancres
 * ci-dessous correspondent toujours au menu statique.
 */

/** Menu digital (destination de tous les boutons « Commander »). */
export const MENU_PATH = "/menu";

export type ResponsiveImage = {
  src: string;
  srcSet: string;
  width: number;
  height: number;
  alt: string;
};

/**
 * Photo du hero (fournie par le restaurant, original : public/accueil/hero-sushi.png, dérivés WebP
 * à côté). Zone sombre en haut à gauche pour le texte, plats en bas : ne pas recadrer sur la table.
 */
export const HERO_PHOTO: ResponsiveImage = {
  src: "/accueil/hero-sushi-1280.webp",
  srcSet: "/accueil/hero-sushi-828.webp 828w, /accueil/hero-sushi-1280.webp 1280w, /accueil/hero-sushi-1672.webp 1672w",
  width: 1672,
  height: 941,
  alt: "Nigiri, makis et sashimi dressés sur une table en bois, dans une salle aux lumières tamisées.",
};

/**
 * Photo du hero sur téléphone et tablette en portrait (fournie par le restaurant, original :
 * public/accueil/hero-mobile-salle.jpg) : la salle, ses lanternes et la fresque ; le titre et les
 * boutons se placent sur le feuillage flou du premier plan, assombri par un voile vert (#001814).
 */
export const HERO_MOBILE_PHOTO = {
  srcSet: "/accueil/hero-mobile-salle-640.webp 640w, /accueil/hero-mobile-salle-853.webp 853w",
  width: 853,
  height: 1280,
  /** Même règle que le <link rel="preload"> d'index.html. */
  media: "(max-width: 1023px) and (orientation: portrait)",
} as const;

/**
 * Photos de la section « L'art des saveurs » (fournies par le restaurant ; originaux .png à côté,
 * liseré de capture d'écran retiré dans les .webp). Résolution source limitée (~470 px de large) :
 * à remplacer par les fichiers haute définition dès qu'ils sont disponibles.
 */
export const STORY_PHOTOS = {
  main: {
    src: "/accueil/salle-plateau.webp",
    width: 469,
    height: 636,
    alt: "Plateau de makis et de sushi sur une table du restaurant, devant la fresque de la geisha et les banquettes de velours vert.",
  },
  detail: {
    src: "/accueil/salle-fresque.webp",
    width: 474,
    height: 636,
    alt: "La salle de Kaytôri : fresque colorée, lanternes tressées, plantes suspendues et fauteuils de velours vert.",
  },
} as const;

/** Logo-titre du hero (fourni par le restaurant, original : public/accueil/kaytori-logo-titre.png). */
export const HERO_TITLE_IMAGE: ResponsiveImage = {
  src: "/accueil/kaytori-logo-titre-1100.webp",
  srcSet: "/accueil/kaytori-logo-titre-640.webp 640w, /accueil/kaytori-logo-titre-1100.webp 1100w",
  width: 1875,
  height: 556,
  alt: "Kaytôri Sushi — Sushi, Wok & Thaï. Des saveurs asiatiques, une explosion de saveurs.",
};

export type FeaturedDish = {
  /** Id du produit dans le menu (src/data/yumloMenu.ts, mêmes ids dans Supabase). */
  id: string;
  name: string;
  /** Résumé de la description du menu (aucun ingrédient ajouté). */
  description: string;
  /** Catégorie du menu (contrôlée par les tests). */
  category: string;
  /** Photo fournie par le restaurant (original .jpg + dérivés WebP), affichée sans recadrage. */
  image: { src: string; srcSet: string; width: number; height: number };
};

const dishImage = (slug: string, width: number, height: number) => ({
  src: `/accueil/plats/${slug}-880.webp`,
  srcSet: `/accueil/plats/${slug}-480.webp 480w, /accueil/plats/${slug}-880.webp 880w, /accueil/plats/${slug}.jpg ${width}w`,
  width,
  height,
});

/** Lien direct vers la carte du plat dans le menu (#plat-<id>, cf. dishAnchorId et menuDeepLinks.ts). */
export const dishMenuHref = (dish: FeaturedDish) => `${MENU_PATH}#plat-${dish.id}`;

/** Plats mis en avant : le premier est affiché en grand. Noms et descriptions = menu, sans prix. */
export const FEATURED_DISHES: readonly FeaturedDish[] = [
  {
    id: "36987b1e67",
    name: "Red Curry Thaï",
    description: "Curry rouge thaï au lait de coco, poivrons et légumes, servi avec du riz",
    category: "Plats Thaï",
    image: dishImage("red-curry-thai", 1280, 906),
  },
  {
    id: "083ac320dd",
    name: "Wok",
    description: "Nouilles sautées, sauce au choix : oyster, teriyaki, aigre-doux ou sweet chili",
    category: "Wok & Thaï",
    image: dishImage("wok", 1280, 1087),
  },
  {
    id: "0d86283322",
    name: "Tacos Chicken Garlic",
    description: "Deux tacos au poulet, sauce chili",
    category: "Tacos",
    image: dishImage("tacos-chicken-garlic", 960, 1280),
  },
  {
    id: "76d7875ff7",
    name: "Rouleaux de printemps",
    description: "Huit pièces, au choix végétarien, poulet ou crevettes, sauce au choix",
    category: "Nems & Gyoza & Rouleaux de printemps",
    image: dishImage("rouleaux-de-printemps", 1004, 1280),
  },
  {
    id: "b446a7355a",
    name: "Salade Exotic Chicken",
    description: "Poulet pané, avocat, mangue, surimi, maïs, tomate cerise, chou, carottes, tobiko",
    category: "Salades",
    image: dishImage("salade-exotic-chicken", 1280, 1148),
  },
];

/** Accès directs aux sections formules du menu (liens profonds existants, cf. menuDeepLinks.ts). */
export const MENU_SHORTCUTS = [
  {
    hash: "formules-midi",
    label: "Formules midi",
    detail: "Du lundi au vendredi, de 11h30 à 17h",
  },
  {
    hash: "formules-solo-duo-family",
    label: "Formules Solo, Duo & Family",
    detail: "Des formules pour un, deux ou toute la famille",
  },
  {
    hash: "promos",
    label: "Promos",
    detail: "Les offres du moment",
  },
] as const;

/** Sections de la page (ancres de la navigation). */
export const HOME_SECTIONS = [
  { id: "restaurant", label: "Le restaurant" },
  { id: "specialites", label: "Spécialités" },
  { id: "infos", label: "Infos pratiques" },
] as const;
