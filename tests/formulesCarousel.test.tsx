/**
 * Cadres des cartes formules : même ratio extérieur pour toutes les sections ;
 * affiches en object-contain (pas de recadrage).
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CartProvider } from "../src/cart/CartContext";
import { FORMULE_CARD_FRAME, FORMULES_PROMOS_ITEMS } from "../src/data/formulesPromos";
import { FormulesCarousel } from "../src/menu/FormulesCarousel";
import type { YumloMenuItem } from "../src/data/yumloMenu";

const duo = FORMULES_PROMOS_ITEMS.find((it) => it.id === "formule-duo")!;
const zen = FORMULES_PROMOS_ITEMS.find((it) => it.id === "formule-zen-box")!;
/** Affiche Midi simulée (ratio différent) : même cadre que Duo. */
const midi: YumloMenuItem = {
  id: "formule-midi",
  category: "Formule Midi",
  name: "Formule Midi",
  description: "Offre midi",
  priceMAD: "99.00",
  currency: "MAD",
  image: "/formules/formule-duo.jpeg",
};

function renderCarousel(items: readonly YumloMenuItem[]) {
  return renderToStaticMarkup(
    <CartProvider>
      <FormulesCarousel items={items} label="Test formules" highlightId={null} />
    </CartProvider>,
  );
}

describe("FormulesCarousel : cadre unique", () => {
  it("expose le même ratio de cadre que Solo/Duo/Family pour Duo, Midi et Promo", () => {
    expect(FORMULE_CARD_FRAME).toEqual({ width: 909, height: 1024 });
    const html = renderCarousel([duo, midi, zen]);
    const frames = [...html.matchAll(/aspect-\[909\/1024\]/g)];
    expect(frames).toHaveLength(3);
    expect(html).toContain("object-contain");
    expect(html).not.toMatch(/object-cover/);
  });

  it("conserve le bouton d'ajout et le carrousel horizontal", () => {
    const html = renderCarousel([duo, midi]);
    expect(html).toContain("Ajouter au panier");
    expect(html).toContain('aria-roledescription="carrousel"');
    expect(html).toContain("overflow-x-auto");
  });
});
