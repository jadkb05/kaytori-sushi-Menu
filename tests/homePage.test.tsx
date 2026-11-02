/**
 * Page d'accueil (/) : rendu, liens vers le menu (/menu), contenu aligné sur le menu statique,
 * informations pratiques confirmées, redirection des anciens liens du menu servi à la racine.
 */
import { existsSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SITE } from "../src/config/site";
import { FORMULE_MIDI_SCHEDULE_HINT } from "../src/data/formuleMidiAvailability";
import { getStaticMenu } from "../src/data/menuSource";
import { HomePage } from "../src/home/HomePage";
import { dishMenuHref, FEATURED_DISHES, HOME_SECTIONS, MENU_PATH, MENU_SHORTCUTS, HERO_PHOTO, HERO_TITLE_IMAGE } from "../src/home/homeContent";
import { legacyMenuUrl } from "../src/home/legacyMenuHash";
import { MENU_DEEP_LINKS, resolveDishDeepLink, resolveMenuDeepLink } from "../src/menu/menuDeepLinks";

const page = renderToStaticMarkup(<HomePage />).replace(/<!-- -->/g, "");
const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&#x27;/g, "'");
const visibleText = decode(page.replace(/<span class="sr-only">[^<]*<\/span>/g, "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ");
/** [href, texte du lien] de chaque <a>. */
const links = [...page.matchAll(/<a [^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => [
  decode(m[1]),
  decode(m[2].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim(),
]);
const menu = getStaticMenu();
/** Texte alternatif tel qu'il apparaît dans le HTML rendu (« & » encodé). */
const heroTitleAlt = `alt="${HERO_TITLE_IMAGE.alt.replace(/&/g, "&amp;")}"`;
const publicFile = (src: string) => new URL(`../public${src}`, import.meta.url);
/**
 * Lien profond du menu : un des liens formules (menuDeepLinks.ts ; leur résolution dépend des
 * sections formules chargées, testée dans menuDeepLinks.test.ts) ou une ancre de catégorie existante.
 */
const isMenuLink = (hash: string) =>
  (MENU_DEEP_LINKS as readonly string[]).includes(hash) ||
  resolveMenuDeepLink(`#${hash}`, menu) !== null ||
  resolveDishDeepLink(`#${hash}`, menu) !== null;

describe("page d'accueil : structure", () => {
  it("un seul H1, au nom du restaurant", () => {
    const h1 = [...page.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/g)];
    expect(h1).toHaveLength(1);
    // Logo-titre en image : le nom du restaurant est porté par son texte alternatif.
    expect(h1[0][1]).toContain(heroTitleAlt);
    expect(HERO_TITLE_IMAGE.alt).toContain("Kaytôri Sushi");
  });

  it("chaque bouton « Commander » mène au menu existant (/menu)", () => {
    const order = links.filter(([, text]) => /^Commander/.test(text));
    expect(order.length).toBeGreaterThanOrEqual(3);
    for (const [href] of order) expect(href).toBe(MENU_PATH);
  });

  it("toutes les ancres internes (#…) ciblent une section présente dans la page", () => {
    const anchors = links.map(([href]) => href).filter((h) => h.startsWith("#"));
    expect(anchors.length).toBeGreaterThan(0);
    for (const href of anchors) expect(page).toContain(`id="${href.slice(1)}"`);
    for (const s of HOME_SECTIONS) expect(page).toContain(`id="${s.id}"`);
  });

  it("liens vers le menu : /menu ou une section existante du menu, jamais une autre page", () => {
    const menuLinks = links.map(([href]) => href).filter((h) => h.startsWith("/"));
    for (const href of menuLinks) {
      if (href === "/") continue;
      expect(href.startsWith(`${MENU_PATH}`)).toBe(true);
      const hash = href.split("#")[1];
      if (hash) expect(isMenuLink(hash), href).toBe(true);
    }
  });

  it("aucun prix affiché sur la page d'accueil", () => {
    expect(visibleText).not.toMatch(/\d\s*(DH|Dhs?|MAD)\b/i);
  });

  it("images : dimensions déclarées, texte alternatif sur la photo principale, fichiers présents", () => {
    const imgs = [...page.matchAll(/<img ([^>]*)>/g)].map((m) => m[1]);
    for (const attrs of imgs) {
      expect(attrs).toMatch(/width="\d+"/);
      expect(attrs).toMatch(/height="\d+"/);
      expect(attrs).toMatch(/alt="/);
    }
    expect(page).toContain(`alt="${HERO_PHOTO.alt}"`);
    const sources = imgs.flatMap((a) => (a.match(/srcSet="([^"]*)"/i)?.[1] ?? "").split(",")).map((c) => c.trim().split(" ")[0]);
    for (const src of sources.filter((s) => s.startsWith("/accueil/"))) expect(existsSync(publicFile(src)), src).toBe(true);
    // Seule la photo du hero est chargée en priorité ; les autres attendent le défilement.
    const priority = (a: string) => /fetchpriority="high"/i.test(a);
    expect(imgs.filter(priority)).toHaveLength(1);
    // (le logo, minuscule et visible dans l'en-tête, n'est pas concerné)
    // (logo-titre du hero : visible dès l'ouverture, chargé normalement)
    const heroTitle = (a: string) => a.includes(heroTitleAlt);
    for (const attrs of imgs.filter((a) => !priority(a) && !heroTitle(a) && a.includes('src="/accueil/'))) {
      expect(attrs).toContain('loading="lazy"');
    }
  });
});

describe("section « L'art des saveurs » : texte exact fourni par le restaurant", () => {
  it("titre, descriptions et phrase finale, à l'identique", () => {
    for (const text of [
      "L'art des saveurs",
      "Chez Kaytôri, chaque détail invite au voyage. Des fresques colorées aux lumières tamisées, des matières naturelles aux assises de velours vert, le restaurant compose un cadre singulier où l'on prend le temps de savourer l'instant.",
      "Dans l'assiette, les traditions asiatiques rencontrent la créativité : sushi, maki, sashimi, spécialités au wok, cuisine thaïlandaise et bentos généreux. Une cuisine haute en couleur, pensée pour éveiller les sens et donner envie de partager.",
      "Une adresse, plusieurs univers, une même envie : vous faire plaisir.",
    ]) {
      expect(visibleText).toContain(text);
    }
    // Espace insécable avant les deux-points (typographie française) dans la phrase finale.
    expect(page).toContain("une même envie\u00a0: vous faire plaisir.");
    expect(page).toContain('id="restaurant-title"');
  });
});

describe("page d'accueil : informations pratiques (confirmées, identiques au menu)", () => {
  it("adresse liée à Google Maps, téléphone principal, Instagram, horaires", () => {
    expect(visibleText).toContain(SITE.address);
    expect(page).toContain(`href="${SITE.mapsUrl}"`);
    expect(page).toContain(`href="tel:+${SITE.phoneFixeE164}"`);
    expect(visibleText).toContain(SITE.phoneFixeDisplay);
    expect(page).toContain(`href="${SITE.instagram}"`);
    for (const { days, range } of SITE.hours) {
      expect(visibleText).toContain(days);
      expect(visibleText).toContain(range);
    }
    // Rien de non confirmé : pas de code postal, de livraison ni de réservation annoncées.
    expect(visibleText.toLowerCase()).not.toMatch(/livraison|réserv|\b20\d{3}\b/);
  });
});

describe("homeContent : aligné sur le menu statique", () => {
  it.each(FEATURED_DISHES.map((d) => [d.name, d] as const))("%s : produit et lien direct vers sa carte dans le menu", (_, dish) => {
    const item = menu.items.find((it) => it.id === dish.id);
    expect(item, dish.id).toBeDefined();
    expect(item!.name.toLowerCase().startsWith(dish.name.toLowerCase())).toBe(true);
    expect(item!.category).toBe(dish.category);
    const href = dishMenuHref(dish);
    expect(href).toBe(`/menu#plat-${dish.id}`);
    expect(resolveDishDeepLink(`#${href.split("#")[1]}`, menu)).toBe(dish.id);
    // Lien présent dans la page (image, nom et « Voir le plat » dans le même lien).
    const link = links.find(([h]) => h === href);
    expect(link?.[1]).toContain(dish.name);
    expect(link?.[1]).toContain("Voir le plat");
    for (const src of dish.image.srcSet.split(",").map((c) => c.trim().split(" ")[0])) {
      expect(existsSync(publicFile(src)), src).toBe(true);
    }
  });

  it("accès directs : liens profonds existants du menu, horaire du midi identique au menu", () => {
    for (const s of MENU_SHORTCUTS) expect(MENU_DEEP_LINKS, s.hash).toContain(s.hash);
    const midi = MENU_SHORTCUTS.find((s) => s.hash === "formules-midi")!;
    expect(FORMULE_MIDI_SCHEDULE_HINT.toLowerCase()).toContain(midi.detail.toLowerCase());
  });
});

describe("anciens liens du menu servi à la racine", () => {
  it.each([
    ["#formules-midi", "/menu#formules-midi"],
    ["#Formules-Midi", "/menu#formules-midi"],
    ["#formules-solo-duo-family", "/menu#formules-solo-duo-family"],
    ["#promos", "/menu#promos"],
    ["#menu-cat-special-roll", "/menu#menu-cat-special-roll"],
  ])("/%s → %s", (hash, url) => {
    expect(legacyMenuUrl(hash)).toBe(url);
  });

  it.each([[""], ["#"], ["#restaurant"], ["#specialites"], ["#infos"], ["#contenu"], ["#%E0%A4%A"]])(
    "« %s » reste sur la page d'accueil",
    (hash) => {
      expect(legacyMenuUrl(hash)).toBeNull();
    },
  );
});
