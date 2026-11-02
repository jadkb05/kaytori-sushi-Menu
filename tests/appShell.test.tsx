/**
 * Squelette statique d'index.html : visible avant l'exécution de JavaScript (pas de page vide),
 * en-tête identique à celui du menu (aucun saut quand React prend le relais), pas de second H1.
 */
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CartProvider } from "../src/cart/CartContext";
import { SITE } from "../src/config/site";
import { MenuProvider } from "../src/menu/MenuProvider";
import { MenuPage } from "../src/pages/MenuPage";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const root = html.slice(html.indexOf('<div id="root">'), html.indexOf('<script type="module"'));
const shell = root.replace(/<!--[\s\S]*?-->/g, "");
const page = renderToStaticMarkup(
  <MenuProvider>
    <CartProvider>
      <MenuPage />
    </CartProvider>
  </MenuProvider>,
);
const classOf = (markup: string, re: RegExp) => markup.match(re)?.[1];

describe("squelette de chargement (index.html)", () => {
  it("#root n'est pas vide : en-tête Kaytôri et message de chargement, sans H1", () => {
    expect(shell).toContain("data-app-shell");
    expect(shell).toContain("Chargement du menu…");
    expect(shell).toContain(`${SITE.nameAccent} Sushi`);
    expect(shell).not.toMatch(/<h1/i);
    expect(shell).toContain('role="status"');
  });

  it("logo et téléphone = ceux du menu (bouton Appeler utilisable sans JavaScript)", () => {
    expect(shell).toContain(`src="${SITE.logoUrl}"`);
    expect(shell).toContain(`href="tel:+${SITE.callE164}"`);
    expect(shell).toContain(`aria-label="Appeler ${SITE.callDisplay}"`);
  });

  it("mêmes classes que l'en-tête de MenuPage (fond, hauteur, titre, sous-titre, filet doré)", () => {
    expect(classOf(shell, /<div data-app-shell class="([^"]+)"/)).toBe("min-h-dvh bg-kaytori-page");
    expect(page).toContain('<div class="min-h-dvh bg-kaytori-page">');
    expect(classOf(shell, /<div class="(sticky top-0 z-30 [^"]+)"/)).toBe(classOf(page, /<header class="([^"]+)"/));
    expect(classOf(shell, /<div class="(mx-auto flex h-14 [^"]+)"/)).toBe(classOf(page, /<header [^>]*><div class="([^"]+)"/));
    expect(classOf(shell, /<p class="(truncate font-display[^"]+)"/)).toBe(classOf(page, /<h1 class="([^"]+)"/));
    expect(classOf(shell, /<p class="(mt-1\.5 whitespace-nowrap[^"]+)"/)).toBe(classOf(page, /<h1 [^>]*>[^<]*<\/h1><p class="([^"]+)"/));
    expect(shell).toContain("bg-gradient-to-r from-transparent via-kaytori-gold/55 to-transparent");
  });
});
