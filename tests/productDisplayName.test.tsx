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

/** Plats raccourcis par catégorie (audit du menu actuel ; Soupes / Salades : préfixe au singulier). */
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
      // Seul le premier mot d'une catégorie de plusieurs mots : pas un préfixe de catégorie.
      ["California Classic", "California Roll"],
      ["Special Spider Roll", "Special Roll"],
      ["Crispy Sakura", "Crispy Roll"],
      ["Crunchy Osaka", "Crunchy Roll"],
      ["Makito Crabe", "Makito Fry"],
      ["Poké Saumon", "Poké Bowl"],
      ["Sushi Burger", "Sushi Fusion"],
      ["tartare Tropical", "Tartare"],
      ["Tártare Tropical", "Tartare"],
      ["Makito Fry Saumon", "Maki"],
      ["Tartares Tropical", "Tartare"],
      ["Saumon Tartare", "Tartare"],
      ["California Saumon", "California Roll"],
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

  it("82 plats raccourcis, tous dans les catégories qui répètent leur nom", () => {
    expect(shortened).toHaveLength(82);
    const byCategory: Record<string, number> = {};
    for (const it of shortened) byCategory[it.category] = (byCategory[it.category] ?? 0) + 1;
    expect(byCategory).toEqual(PREFIXED_CATEGORIES);
  });

  it("chaque nom raccourci = nom réel sans « Catégorie » (ou son singulier) en tête, rien d'autre", () => {
    for (const it of shortened) {
      const short = getDisplayProductName(it, it.category);
      expect([`${it.category} ${short}`, `${it.category.replace(/s$/, "")} ${short}`]).toContain(it.name);
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
    expect(html).toContain('aria-label="Ajouter Tropical au panier"');
  });
});
