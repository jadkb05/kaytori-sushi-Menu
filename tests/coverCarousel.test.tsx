/**
 * Carrousel de couverture : cadre premium inchangé, repli statique, « + » si formule liée.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CartProvider } from "../src/cart/CartContext";
import { CoverCarousel } from "../src/menu/CoverCarousel";

describe("CoverCarousel", () => {
  it("affiche le repli statique et conserve le cadre 2:1 (sans + décoratif)", () => {
    const html = renderToStaticMarkup(
      <CartProvider>
        <CoverCarousel />
      </CartProvider>,
    );
    expect(html).toContain("kaytori-makis");
    expect(html).toMatch(/aspect-\[2\/1\]/);
    expect(html).toContain("object-cover");
    expect(html).not.toMatch(/filter:|brightness\(|contrast\(|saturate\(/i);
    expect(html).not.toContain("Ajouter");
  });
});
