/**
 * Cadres des cartes formules : même ratio extérieur pour toutes les sections ;
 * affiches en object-contain (pas de recadrage).
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
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

  it("autorise la carte midi à 17h inclus Casablanca", async () => {
    const { casablancaLocalToUtc } = await import("../src/data/formuleMidiAvailability");
    vi.useFakeTimers();
    vi.setSystemTime(casablancaLocalToUtc(2026, 10, 26, 17, 0));
    try {
      const html = renderCarousel([midi]);
      expect(html).toContain("Ajouter au panier");
      expect(html).not.toContain('aria-disabled="true"');
    } finally {
      vi.useRealTimers();
    }
  });

  it("désactive le bouton midi hors créneau Casablanca (texte Disponible de 11h30 à 17h)", async () => {
    const { casablancaLocalToUtc } = await import("../src/data/formuleMidiAvailability");
    // Lundi 26 oct 2026, 17:01 Casablanca → hors créneau (offset local, pas UTC fixe).
    vi.useFakeTimers();
    vi.setSystemTime(casablancaLocalToUtc(2026, 10, 26, 17, 1, 0));
    try {
      const html = renderCarousel([duo, midi]);
      expect(html).toContain("Disponible de 11h30 à 17h");
      expect(html).toContain("Ajouter au panier"); // Duo reste commandable
      expect(html).toMatch(/aria-disabled="true"/);
    } finally {
      vi.useRealTimers();
    }
  });

  it("n'affiche une affiche Supabase qu'à l'approche de la zone visible du carrousel", () => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://exemple.supabase.co");
    const poster = "https://exemple.supabase.co/storage/v1/object/public/menu-images/products/p1/affiche.jpg";
    const item = { ...duo, image: poster };
    try {
      // Sans IntersectionObserver : affiche demandée tout de suite (comportement d'avant).
      expect(renderCarousel([item])).toContain("render/image/public/menu-images/products/p1/affiche.jpg?width=750");
      // Avec IntersectionObserver : rien n'est téléchargé avant que la carte approche de la vue.
      vi.stubGlobal("IntersectionObserver", class {});
      const html = renderCarousel([item]);
      expect(html).toContain('src="data:image/gif;base64,');
      expect(html).not.toContain("affiche.jpg");
      expect(html).toContain('alt="Affiche Formule Duo');
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    }
  });
});
