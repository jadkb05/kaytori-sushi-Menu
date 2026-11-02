/**
 * Carrousel de couverture : cadre premium inchangé, repli statique, « + » si formule liée.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CartProvider } from "../src/cart/CartContext";
import { PRODUCTION_COVER_SLIDES } from "../src/data/coverBanners";
import { CoverCarousel } from "../src/menu/CoverCarousel";

describe("CoverCarousel", () => {
  it("affiche les 21 couvertures de production dès le premier rendu, cadre 2:1 et cadrage inchangés", () => {
    const html = renderToStaticMarkup(
      <CartProvider>
        <CoverCarousel />
      </CartProvider>,
    );
    const first = PRODUCTION_COVER_SLIDES[0];
    expect(html).toContain(`src="${first.imageUrl}"`);
    expect(html).not.toContain("kaytori-makis"); // pas de bannière de repli intermédiaire
    expect(html).not.toContain("supabase");
    expect(html).toMatch(/aspect-\[2\/1\]/);
    expect(html).toContain("object-cover object-[50%_62%] md:object-[50%_40%]");
    expect(html).not.toMatch(/filter:|brightness\(|contrast\(|saturate\(/i);
    expect(html.match(/<img /g)).toHaveLength(PRODUCTION_COVER_SLIDES.length);
    expect(PRODUCTION_COVER_SLIDES).toHaveLength(21);
  });

  it("« + » sur une couverture liée à une formule (nom de la formule)", () => {
    const html = renderToStaticMarkup(
      <CartProvider>
        <CoverCarousel />
      </CartProvider>,
    );
    const first = PRODUCTION_COVER_SLIDES[0];
    if (first.productName) expect(html).toContain(`aria-label="Ajouter ${first.productName} au panier"`);
    else expect(html).not.toContain("au panier");
  });
});
