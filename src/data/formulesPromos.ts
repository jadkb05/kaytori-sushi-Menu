import type { YumloMenuItem } from "./yumloMenu";

/**
 * Libellé unique en base / seed / CMS (une seule catégorie Supabase).
 * L'affichage public découpe ensuite en FORMULE_PUBLIC_SECTIONS (voir formulePublicCategory).
 */
export const FORMULES_PROMOS_CATEGORY = "Formules & Promos";

/** Identifiant stable de la catégorie dans Supabase (slug, pas le libellé affiché). */
export const FORMULES_CATEGORY_ID = "formules-promos";

/** Sections publiques, dans l'ordre d'affichage du menu. */
export const FORMULE_SECTION_SOLO_DUO_FAMILY = "Formules Solo / Duo / Family";
export const FORMULE_SECTION_MIDI = "Formule Midi";
export const FORMULE_SECTION_PROMO = "Promo";

export const FORMULE_PUBLIC_SECTIONS = [
  FORMULE_SECTION_SOLO_DUO_FAMILY,
  FORMULE_SECTION_MIDI,
  FORMULE_SECTION_PROMO,
] as const;

export type FormulePublicSection = (typeof FORMULE_PUBLIC_SECTIONS)[number];

/**
 * Catégorie affichée en carrousel d'affiches.
 * `knownSectionNames` : noms issus de formule_sections (prépare le menu public dynamique
 * sans changer les composants d'affichage).
 */
export function isFormuleCarouselCategory(
  category: string,
  knownSectionNames?: readonly string[] | null,
): boolean {
  if (category === FORMULES_PROMOS_CATEGORY) return true;
  if ((FORMULE_PUBLIC_SECTIONS as readonly string[]).includes(category)) return true;
  return Boolean(knownSectionNames?.includes(category));
}

/**
 * Affecte une formule à l'une des 3 sections publiques, sans inventer d'offre.
 * Solo / Duo / Family : id ou nom contenant solo, duo ou family.
 * Formule Midi : id ou nom contenant « midi ».
 * Promo : le reste (boxes et autres offres de la catégorie formules).
 */
export function formulePublicCategory(item: { id: string; name: string }): FormulePublicSection {
  const hay = `${item.id} ${item.name}`
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
  if (/\bmidi\b/.test(hay) || hay.includes("formule-midi") || hay.includes("formule midi")) {
    return FORMULE_SECTION_MIDI;
  }
  if (/\b(solo|duo|family)\b/.test(hay) || /formule-(solo|duo|family)\b/.test(hay)) {
    return FORMULE_SECTION_SOLO_DUO_FAMILY;
  }
  return FORMULE_SECTION_PROMO;
}

/**
 * Formules du client, relevées sur ses affiches (public/formules/, fichiers d'origine non modifiés).
 * Ordre catalogue : Formule Duo et Family, puis les boxes du moins cher au plus cher.
 * Duo et Family : affiches officielles, prix confirmés (279 / 539 DH), sans ancien prix barré.
 * Yaki, Fusion, Crispy, Nara, Kyoto, Spring : affiches officielles (2e envoi), prix et ancien prix relevés sur l'affiche.
 * Party, Zen et Fry : affiches officielles (3e envoi), mêmes prix que déjà relevés. Master Box : nouvelle formule du même envoi.
 * Reprises dans Supabase par supabase/production/07_formules_promos.sql (à appliquer manuellement). Noms, pièces et prix : ceux des affiches.
 * Pas de Formule Solo ni Formule Midi dans les données actuelles : elles apparaîtront dans la bonne section dès qu'elles seront ajoutées au CMS.
 */
export const FORMULES_PROMOS_ITEMS = [
  {
    id: "formule-duo",
    category: FORMULES_PROMOS_CATEGORY,
    name: "Formule Duo",
    description: "Pour deux personnes",
    priceMAD: "279.00",
    currency: "MAD",
    image: "/formules/formule-duo.jpeg",
  },
  {
    id: "formule-family",
    category: FORMULES_PROMOS_CATEGORY,
    name: "Formule Family",
    description: "Pour quatre personnes",
    priceMAD: "539.00",
    currency: "MAD",
    image: "/formules/formule-family.jpeg",
  },
  {
    id: "formule-zen-box",
    category: FORMULES_PROMOS_CATEGORY,
    name: "Zen Box",
    description: "16 pièces",
    priceMAD: "109.00",
    currency: "MAD",
    image: "/formules/zen-box.jpeg",
  },
  {
    id: "formule-yaki-box",
    category: FORMULES_PROMOS_CATEGORY,
    name: "Yaki Box",
    description: "16 pièces",
    priceMAD: "129.00",
    currency: "MAD",
    image: "/formules/yaki-box.jpeg",
  },
  {
    id: "formule-fry-box",
    category: FORMULES_PROMOS_CATEGORY,
    name: "Fry Box",
    description: "26 pièces",
    priceMAD: "139.00",
    currency: "MAD",
    image: "/formules/fry-box.jpeg",
  },
  {
    id: "formule-spring-box",
    category: FORMULES_PROMOS_CATEGORY,
    name: "Spring Box",
    description: "34 pièces",
    priceMAD: "156.00",
    currency: "MAD",
    image: "/formules/spring-box.jpeg",
  },
  {
    id: "formule-kyoto-box",
    category: FORMULES_PROMOS_CATEGORY,
    name: "Kyoto Box",
    description: "28 pièces",
    priceMAD: "159.00",
    currency: "MAD",
    image: "/formules/kyoto-box.jpeg",
  },
  {
    id: "formule-nara-box",
    category: FORMULES_PROMOS_CATEGORY,
    name: "Nara Box",
    description: "30 pièces",
    priceMAD: "189.00",
    currency: "MAD",
    image: "/formules/nara-box.jpeg",
  },
  {
    id: "formule-crispy-box",
    category: FORMULES_PROMOS_CATEGORY,
    name: "Crispy Box",
    description: "42 pièces",
    priceMAD: "229.00",
    currency: "MAD",
    image: "/formules/crispy-box.jpeg",
  },
  {
    id: "formule-party-box",
    category: FORMULES_PROMOS_CATEGORY,
    name: "Party Box",
    description: "50 pièces",
    priceMAD: "329.00",
    currency: "MAD",
    image: "/formules/party-box.jpeg",
  },
  {
    id: "formule-fusion-box",
    category: FORMULES_PROMOS_CATEGORY,
    name: "Fusion Box",
    description: "60 pièces",
    priceMAD: "369.00",
    currency: "MAD",
    image: "/formules/fusion-box.jpeg",
  },
  {
    id: "formule-master-box",
    category: FORMULES_PROMOS_CATEGORY,
    name: "Master Box",
    description: "60 pièces",
    priceMAD: "369.00",
    currency: "MAD",
    image: "/formules/master-box.jpeg",
  },
] as const satisfies readonly YumloMenuItem[];

/** Ancien prix barré, tel qu'affiché sur l'affiche (promotion confirmée par le client). */
export const FORMULES_PROMOS_OLD_PRICE_MAD: Readonly<Record<string, string>> = {
  "formule-party-box": "370.00",
  "formule-master-box": "450.00",
  "formule-zen-box": "134.00",
  "formule-fry-box": "211.00",
  "formule-yaki-box": "145.00",
  "formule-fusion-box": "450.00",
  "formule-crispy-box": "310.00",
  "formule-nara-box": "278.00",
  "formule-kyoto-box": "219.00",
  "formule-spring-box": "278.00",
};

/**
 * Cadre extérieur unique des cartes formules (référence visuelle Solo / Duo / Family).
 * Toutes les sections (Midi, Promos, …) utilisent ce ratio ; l'affiche reste en object-contain.
 */
export const FORMULE_CARD_FRAME = { width: 909, height: 1024 } as const;

/** Repli de dimensions HTML si une affiche n'a pas d'entrée dans FORMULE_IMAGE_SIZE_BY_ID. */
export const FORMULE_IMAGE_SIZE = FORMULE_CARD_FRAME;

/** Dimensions intrinsèques des affiches (fichiers d'origine) — pour width/height HTML / CLS uniquement. */
export const FORMULE_IMAGE_SIZE_BY_ID: Readonly<Record<string, { width: number; height: number }>> = {
  "formule-party-box": { width: 970, height: 1104 },
  "formule-zen-box": { width: 970, height: 1114 },
  "formule-fry-box": { width: 970, height: 1114 },
  "formule-master-box": { width: 970, height: 1087 },
  "formule-duo": { width: 909, height: 1024 },
  "formule-family": { width: 909, height: 1024 },
  "formule-yaki-box": { width: 970, height: 1092 },
  "formule-fusion-box": { width: 970, height: 1102 },
  "formule-crispy-box": { width: 970, height: 1114 },
  "formule-nara-box": { width: 970, height: 1097 },
  "formule-kyoto-box": { width: 970, height: 1115 },
  "formule-spring-box": { width: 970, height: 1108 },
};
