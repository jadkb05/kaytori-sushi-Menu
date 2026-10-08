/**
 * Nom affiché d'un plat sans le préfixe répétant sa catégorie (affichage uniquement) :
 * noms réels (données, Supabase, panier, WhatsApp) inchangés.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CartProvider } from "../src/cart/CartContext";
import { getStaticMenu, staticMenuSource } from "../src/data/menuSource";
import { YUMLO_MENU } from "../src/data/yumloMenu";
import { getDisplayProductName } from "../src/menu/menuDisplay";
import { MenuProvider } from "../src/menu/MenuProvider";
import { MenuPage } from "../src/pages/MenuPage";

const display = (name: string, category: string) => getDisplayProductName({ name }, category);

/**
 * Plats raccourcis par catégorie (audit du menu actuel ; Soupes / Salades : préfixe au singulier ;
 * catégories de deux mots : préfixe court).
 */
const PREFIXED_CATEGORIES: Record<string, number> = {
  Yakitori: 3,
  Soupes: 5,
  Salades: 5,
  Tartare: 2,
  Chirashi: 1,
  Sashimi: 1,
  Carpaccio: 1,
  Tacos: 4,
  "Crispy Rice": 4,
  Nigiri: 3,
  Maki: 5,
  Futomaki: 5,
  Aromaki: 14,
  Blossom: 14,
  Premium: 10,
  Jus: 5,
  "Poké Bowl": 3,
  "California Roll": 11,
  "Special Roll": 14,
  "Makito Fry": 5,
  "Crispy Roll": 8,
  "Crunchy Roll": 9,
};

/** Préfixes courts attendus des catégories de deux mots. */
const SHORT_PREFIXES: Record<string, string[]> = {
  "Poké Bowl": ["Poké"],
  "California Roll": ["California"],
  "Special Roll": ["Special"],
  "Makito Fry": ["Makito"],
  "Crispy Roll": ["Crispy"],
  "Crunchy Roll": ["Crunchy Fry", "Crunchy"],
};

describe("getDisplayProductName", () => {
  it("retire le préfixe exact de la catégorie", () => {
    expect(display("Tartare Tropical", "Tartare")).toBe("Tropical");
    expect(display("Tartare Saumon Avocat", "Tartare")).toBe("Saumon Avocat");
    expect(display("Chirashi Saumon Avocat", "Chirashi")).toBe("Saumon Avocat");
    expect(display("Tataki Saumon", "Tataki")).toBe("Saumon");
    expect(display("Tataki Thon", "Tataki")).toBe("Thon");
    expect(display("Okinawa Saumon", "Okinawa")).toBe("Saumon");
    expect(display("Okinawa Thon", "Okinawa")).toBe("Thon");
    expect(display("Tacos Thon Épicé", "Tacos")).toBe("Thon Épicé");
    expect(display("Tacos Saumon Avocat", "Tacos")).toBe("Saumon Avocat");
    expect(display("Crispy Rice Ebi Avocat 2 pcs", "Crispy Rice")).toBe("Ebi Avocat 2 pcs");
  });

  it("retire aussi le préfixe au singulier d'une catégorie au pluriel", () => {
    expect(display("Soupe Fruits de Mer", "Soupes")).toBe("Fruits de Mer");
    expect(display("Soupe Miso", "Soupes")).toBe("Miso");
    expect(display("Salade Crevettes Tempura", "Salades")).toBe("Crevettes Tempura");
    expect(display("Salade Bobun", "Salades")).toBe("Bobun");
    expect(display("Soupes Miso", "Soupes")).toBe("Miso");
    expect(display("Temaki Saumon (1 pc)", "Temakis")).toBe("Saumon (1 pc)");
  });

  it("garde « Bento A » : une lettre seule ne serait pas lisible", () => {
    for (const l of "ABCDEFGH") expect(display(`Bento ${l}`, "Bentos")).toBe(`Bento ${l}`);
    expect(display("Maki A", "Maki")).toBe("Maki A");
    expect(display("Bento Veggie", "Bentos")).toBe("Veggie");
  });

  it("catégories de deux mots : retire le préfixe court", () => {
    expect(display("Poké Saumon", "Poké Bowl")).toBe("Saumon");
    expect(display("Poké Thon", "Poké Bowl")).toBe("Thon");
    expect(display("California Classic", "California Roll")).toBe("Classic");
    expect(display("Special Spider Roll", "Special Roll")).toBe("Spider Roll");
    expect(display("Special Mango Tango", "Special Roll")).toBe("Mango Tango");
    expect(display("Makito Crabe", "Makito Fry")).toBe("Crabe");
    expect(display("Crispy Sakura", "Crispy Roll")).toBe("Sakura");
    expect(display("Crunchy Osaka", "Crunchy Roll")).toBe("Osaka");
    expect(display("Crunchy Fry Eby Fry", "Crunchy Roll")).toBe("Eby Fry");
    expect(display("Crunchy Fry Salmon Fry", "Crunchy Roll")).toBe("Salmon Fry");
    expect(display("Crunchy Eby Tempura", "Crunchy Roll")).toBe("Eby Tempura");
    // « Crunchy Fry » seul : « Fry » reste lisible.
    expect(display("Crunchy Fry", "Crunchy Roll")).toBe("Fry");
    expect(display("California Saumon (4 pcs)", "California Roll")).toBe("Saumon (4 pcs)");
    // Catégorie complète en tête : elle est retirée en entier.
    expect(display("Crispy Roll Saumon", "Crispy Roll")).toBe("Saumon");
    // Préfixe court seul ou suivi d'une quantité : intact.
    expect(display("California 4 pcs", "California Roll")).toBe("California 4 pcs");
  });

  it("le préfixe court ne vaut que pour sa catégorie", () => {
    const unchanged: [string, string][] = [
      ["Crispy Sakura", "Crispy Rice"],
      ["Special Spider Roll", "Premium"],
      ["Poké Saumon", "Poké Bowls"],
      ["california Classic", "California Roll"],
      ["Californias Classic", "California Roll"],
      ["Eby Salmon", "California Roll"],
      ["Fresh Mango", "California Roll"],
      ["Shake Saumon", "California Roll"],
      ["Sushi Burger", "Sushi Fusion"],
    ];
    for (const [name, category] of unchanged) expect(display(name, category)).toBe(name);
    expect(display("Crispy Rice Ebi Avocat 2 pcs", "Crispy Rice")).toBe("Ebi Avocat 2 pcs");
  });

  it("préserve quantités, accents et casse du reste du nom", () => {
    expect(display("Tataki Saumon (4 pcs)", "Tataki")).toBe("Saumon (4 pcs)");
    expect(display("Yakitori Bœuf Fromage 2 pcs", "Yakitori")).toBe("Bœuf Fromage 2 pcs");
    expect(display("Blossom Bonzaï", "Blossom")).toBe("Bonzaï");
    expect(display("Premium Bora Bora", "Premium")).toBe("Bora Bora");
  });

  it("laisse intact tout nom qui ne commence pas exactement par sa catégorie", () => {
    const unchanged: [string, string][] = [
      ["Soupe Royale", "Salades"],
      ["soupe Royale", "Soupes"],
      ["Soupé Royale", "Soupes"],
      ["Soup Royale", "Soupes"],
      ["Souperie Royale", "Soupes"],
      // Premier mot d'une catégorie de plusieurs mots sans préfixe court prévu : intact.
      ["Sushi Burger", "Sushi Fusion"],
      ["tartare Tropical", "Tartare"],
      ["Tártare Tropical", "Tartare"],
      ["Makito Fry Saumon", "Maki"],
      ["Tartares Tropical", "Tartare"],
      ["Saumon Tartare", "Tartare"],
      ["Tartare Tropical", ""],
      ["Tartare Tropical", "Chirashi"],
    ];
    for (const [name, category] of unchanged) expect(display(name, category)).toBe(name);
  });

  it("laisse intact un nom égal à la catégorie ou réduit à une quantité", () => {
    for (const name of ["Tartare", "Tartare ", "Sashimi (4 pcs)", "Maki 6 pcs", "Nigiri 2 pc", "Tacos (2 pcs) 2 pcs"]) {
      expect(display(name, name.split(" ")[0])).toBe(name);
    }
  });

  it("ne lit que le nom : l'objet produit n'est pas modifié", () => {
    const product = Object.freeze({ id: "x", name: "Tartare Tropical", category: "Tartare" });
    expect(getDisplayProductName(product, product.category)).toBe("Tropical");
    expect(product.name).toBe("Tartare Tropical");
  });
});

describe("audit du menu actuel", () => {
  const shortened = YUMLO_MENU.filter((it) => getDisplayProductName(it, it.category) !== it.name);

  it("132 plats raccourcis, tous dans les catégories qui répètent leur nom", () => {
    expect(shortened).toHaveLength(132);
    const byCategory: Record<string, number> = {};
    for (const it of shortened) byCategory[it.category] = (byCategory[it.category] ?? 0) + 1;
    expect(byCategory).toEqual(PREFIXED_CATEGORIES);
  });

  it("chaque nom raccourci = nom réel sans « Catégorie » (singulier, préfixe court) en tête, rien d'autre", () => {
    for (const it of shortened) {
      const short = getDisplayProductName(it, it.category);
      const prefixes = [it.category, it.category.replace(/s$/, ""), ...(SHORT_PREFIXES[it.category] ?? [])];
      expect(prefixes.map((p) => `${p} ${short}`)).toContain(it.name);
    }
  });
});

describe("page menu (statique)", () => {
  const html = renderToStaticMarkup(
    <MenuProvider source={staticMenuSource}>
      <CartProvider>
        <MenuPage />
      </CartProvider>
    </MenuProvider>,
  );
  const dishTitles = [...html.matchAll(/<h3 class="font-display text-\[0\.95rem\][^"]*">([^<]*)<\/h3>/g)].map(
    (m) => m[1].replace(/&amp;/g, "&").replace(/&#x27;/g, "'"),
  );

  it("affiche les noms courts, dans l'ordre, pour tous les plats", () => {
    const menu = getStaticMenu();
    expect(dishTitles).toHaveLength(menu.items.length);
    expect(dishTitles).toContain("Tropical");
    expect(dishTitles).toContain("Saumon Avocat 2 pcs");
    expect(dishTitles).toContain("Bento A");
    expect(dishTitles).toContain("Royale");
    expect(dishTitles).toContain("Fruits de Mer");
    expect(dishTitles).not.toContain("Soupe Royale");
    expect(dishTitles).not.toContain("Salade Tropicale");
    expect(dishTitles).not.toContain("Tartare Tropical");
    expect(dishTitles).toContain("Classic");
    expect(dishTitles).toContain("Spider Roll");
    expect(dishTitles).toContain("Eby Salmon");
    expect(dishTitles).toContain("Sushi Burger");
    expect(dishTitles).not.toContain("California Classic");
    expect(dishTitles).toContain("Eby Fry");
    expect(dishTitles).toContain("Salmon Fry");
    expect(dishTitles).not.toContain("Fry Eby Fry");
    expect(dishTitles).not.toContain("Fry Salmon Fry");
    expect(html).toContain('aria-label="Ajouter Tropical au panier"');
  });
});
