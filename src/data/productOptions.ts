/**
 * Personnalisation avancée de certains plats, en plus de leurs variantes (protéine, etc.).
 * Clé : id du plat (identique en statique et en Supabase). Les options ne sont pas des produits
 * du catalogue et n'ont pas de prix : le prix reste celui de la variante choisie.
 *
 * Un plat listé ici a une fenêtre de choix « à la Glovo » : section variantes titrée, aucun choix
 * présélectionné, chaque section requise, quantité et bouton « Ajouter N pour X DH ».
 */
export type ProductOption = {
  id: string;
  label: string;
  /** Précision affichée sous le libellé dans la fenêtre de choix (pas dans le panier). */
  description?: string;
};

export type ProductOptionGroup = {
  id: string;
  /** Titre de la section dans la fenêtre de choix. */
  title: string;
  /** Libellé dans le nom de la ligne panier et dans WhatsApp : « Sauce : Teriyaki ». */
  cartLabel: string;
  options: readonly ProductOption[];
};

export type ProductCustomization = {
  /** Titre de la section variantes, aussi préfixe des libellés (« Wok Poulet »). */
  variantTitle: string;
  /** Sections supplémentaires, une option obligatoire dans chacune. */
  groups: readonly ProductOptionGroup[];
};

const WOK_SAUCES: ProductOptionGroup = {
  id: "sauce",
  title: "Choix de Sauces",
  cartLabel: "Sauce",
  options: [
    { id: "teriyaki", label: "Teriyaki", description: "Sucrée" },
    { id: "oyster", label: "Oyster", description: "Salée" },
    { id: "sweet-chili", label: "Sweet Chili", description: "Sucrée, un peu piquante" },
    { id: "aigre-doux", label: "Aigre Doux" },
  ],
};

export const PRODUCT_CUSTOMIZATIONS: Readonly<Record<string, ProductCustomization>> = {
  /** Wok (nouilles), catégorie Wok & Thaï. */
  "083ac320dd": { variantTitle: "Wok", groups: [WOK_SAUCES] },
};

/**
 * Ligne panier d'un plat personnalisé : id `platId:variantId:groupe=option…` (le préfixe `platId:`
 * reste celui des variantes) et nom « Wok — Poulet — Sauce : Teriyaki ».
 */
export function customizedCartLine(
  item: { id: string; name: string },
  variant: { id: string; label: string },
  custom: ProductCustomization,
  chosen: Readonly<Record<string, string>>,
): { id: string; name: string } {
  const parts = custom.groups.map((g) => {
    const option = g.options.find((o) => o.id === chosen[g.id]);
    if (!option) throw new Error(`Option manquante : ${g.id}`);
    return { key: `${g.id}=${option.id}`, text: `${g.cartLabel} : ${option.label}` };
  });
  return {
    id: [item.id, variant.id, ...parts.map((p) => p.key)].join(":"),
    name: [item.name, variant.label, ...parts.map((p) => p.text)].join(" — "),
  };
}
