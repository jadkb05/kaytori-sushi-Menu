/**
 * SEO-02 : <head> des deux pages HTML (présent dans le HTML initial, sans JavaScript) et données
 * structurées JSON-LD. index.html = page d'accueil (/), menu/index.html = menu digital (/menu).
 * Valeurs = informations confirmées par le restaurant ; rien d'inventé
 * (pas de code postal, pas d'avis, pas de priceRange, pas de réservation).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const SITE_URL = "https://www.kaytori.com/";
const MENU_URL = `${SITE_URL}menu`;
/** Image de partage du menu (inchangée) et de l'accueil (photo de la salle). */
const OG_IMAGE = `${SITE_URL}og/kaytori-sushi-casablanca-1200x630.jpg`;
const HOME_OG_IMAGE = `${SITE_URL}og/kaytori-sushi-salle-1200x630.jpg`;
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const menuHtml = readFileSync(new URL("../menu/index.html", import.meta.url), "utf8");

const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"');

/** Lecture du <head> d'une page : balises, meta uniques, titres. */
function headOf(page: string) {
  const head = page.slice(0, page.indexOf("</head>"));
  /** Attributs de chaque balise <tag …> du <head> (attributs multi-lignes acceptés). */
  const tags = (tag: string): Record<string, string>[] =>
    [...head.matchAll(new RegExp(`<${tag}\\b([^>]*)>`, "g"))].map((m) =>
      Object.fromEntries([...m[1].matchAll(/([\w:-]+)="([^"]*)"/g)].map((a) => [a[1], decode(a[2])])),
    );
  const meta = (key: "name" | "property", value: string): string => {
    const found = tags("meta").filter((m) => m[key] === value);
    expect(found, `${key}="${value}" présent une seule fois`).toHaveLength(1);
    return found[0].content;
  };
  const titles = [...head.matchAll(/<title>([^<]*)<\/title>/g)].map((m) => decode(m[1]));
  return { head, tags, meta, titles };
}
const home = headOf(html);
const menu = headOf(menuHtml);
const { head, tags, meta } = home;

const jsonLdBlocks = [...head.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
type Node = Record<string, unknown>;
const graph = () => (JSON.parse(jsonLdBlocks[0]) as { "@graph": Node[] })["@graph"];
const byType = (type: string) => graph().find((n) => n["@type"] === type)!;

describe("<head> du menu (/menu) : title, description, canonical", () => {
  it("title SEO local du menu inchangé (marque + ville + cuisine), longueur raisonnable", () => {
    expect(menu.titles).toEqual(["Kaytôri Sushi Casablanca — Menu Sushi, Wok & Thaï"]);
    expect(menu.titles[0].length).toBeLessThanOrEqual(60);
  });

  it("meta description naturelle, sans promesse non confirmée", () => {
    const d = menu.meta("name", "description");
    for (const word of ["Kaytôri Sushi", "Casablanca", "sushi", "wok", "thaï", "Consultez la carte", "commandez"]) {
      expect(d).toContain(word);
    }
    expect(d.length).toBeLessThanOrEqual(160);
    expect(d.toLowerCase()).not.toMatch(/livraison|gratuit|réserv|meilleur|n°1/);
  });

  it("canonical unique vers /menu", () => {
    expect(menu.tags("link").filter((l) => l.rel === "canonical")).toEqual([{ rel: "canonical", href: MENU_URL }]);
  });

  it("lang, viewport, favicon ; l'application du menu (src/main.tsx) est son point d'entrée", () => {
    expect(menuHtml).toContain('<html lang="fr">');
    expect(menu.meta("name", "viewport")).toContain("width=device-width");
    expect(menu.tags("link").some((l) => l.rel === "icon" && l.href === "/kaytori-logo-2026-64.png")).toBe(true);
    expect(menuHtml).toContain('<script type="module" src="/src/main.tsx"></script>');
  });

  it("Open Graph et Twitter du menu : URL /menu, image d'origine", () => {
    expect(menu.meta("property", "og:title")).toBe("Kaytôri Sushi Casablanca — Menu Sushi, Wok & Thaï");
    expect(menu.meta("property", "og:url")).toBe(MENU_URL);
    expect(menu.meta("property", "og:image")).toBe(OG_IMAGE);
    expect(menu.meta("name", "twitter:title")).toBe(menu.meta("property", "og:title"));
    expect(menu.meta("name", "twitter:image")).toBe(OG_IMAGE);
  });

  it("le Restaurant n'est déclaré qu'une fois, sur la page d'accueil (pas de JSON-LD sur /menu)", () => {
    expect(menuHtml).not.toContain("application/ld+json");
  });
});

describe("<head> de l'accueil (/) : title, description, canonical", () => {
  it("title SEO local (marque + activité + ville), distinct du menu, longueur raisonnable", () => {
    expect(home.titles).toEqual(["Kaytôri Sushi — Restaurant de sushi à Casablanca"]);
    expect(home.titles[0].length).toBeLessThanOrEqual(60);
    expect(home.titles[0]).not.toBe(menu.titles[0]);
  });

  it("meta description naturelle, distincte du menu, sans promesse non confirmée", () => {
    const d = meta("name", "description");
    for (const word of ["Kaytôri Sushi", "Casablanca", "sushi", "wok", "thaï", "commandez"]) {
      expect(d).toContain(word);
    }
    expect(d.length).toBeLessThanOrEqual(160);
    expect(d).not.toBe(menu.meta("name", "description"));
    expect(d.toLowerCase()).not.toMatch(/livraison|gratuit|réserv|meilleur|n°1/);
  });

  it("canonical unique vers la racine du domaine Vercel actuel", () => {
    const canonicals = tags("link").filter((l) => l.rel === "canonical");
    expect(canonicals).toEqual([{ rel: "canonical", href: SITE_URL }]);
  });

  it("lang, viewport et favicon (nouveau logo) ; entrée dédiée de la page d'accueil", () => {
    expect(html).toContain('<html lang="fr">');
    expect(meta("name", "viewport")).toContain("width=device-width");
    expect(tags("link").some((l) => l.rel === "icon" && l.href === "/kaytori-logo-2026-64.png")).toBe(true);
    expect(tags("link").some((l) => l.rel === "apple-touch-icon" && l.href === "/kaytori-logo-2026-180.png")).toBe(true);
    expect(html).toContain('<script type="module" src="/src/home/main.tsx"></script>');
  });

  it("photos du hero préchargées en priorité, une seule par type d'écran (fichiers présents dans public/)", () => {
    const preloads = tags("link").filter((l) => l.rel === "preload" && l.as === "image");
    // Photo verticale sur téléphone en portrait, horizontale ailleurs : media exactement complémentaires.
    expect(preloads.map((l) => l.media)).toEqual([
      "not all and (max-width: 1023px) and (orientation: portrait)",
      "(max-width: 1023px) and (orientation: portrait)",
    ]);
    for (const preload of preloads) {
      expect(preload.fetchpriority).toBe("high");
      for (const src of preload.imagesrcset.split(",").map((c) => c.trim().split(" ")[0])) {
        expect(readFileSync(new URL(`../public${src}`, import.meta.url)).length).toBeGreaterThan(0);
      }
    }
  });
});

describe("Open Graph et Twitter (accueil)", () => {
  it("Open Graph complet", () => {
    expect(meta("property", "og:type")).toBe("website");
    expect(meta("property", "og:site_name")).toBe("Kaytôri Sushi");
    expect(meta("property", "og:title")).toBe("Kaytôri Sushi — Restaurant de sushi à Casablanca");
    expect(meta("property", "og:description")).toContain("Casablanca");
    expect(meta("property", "og:url")).toBe(SITE_URL);
    expect(meta("property", "og:image")).toBe(HOME_OG_IMAGE);
    expect(meta("property", "og:image:width")).toBe("1200");
    expect(meta("property", "og:image:height")).toBe("630");
    expect(meta("property", "og:image:type")).toBe("image/jpeg");
    expect(meta("property", "og:locale")).toBe("fr_MA");
  });

  it("Twitter : summary_large_image, même titre/description/image qu'Open Graph", () => {
    expect(meta("name", "twitter:card")).toBe("summary_large_image");
    expect(meta("name", "twitter:title")).toBe(meta("property", "og:title"));
    expect(meta("name", "twitter:description")).toBe(meta("property", "og:description"));
    expect(meta("name", "twitter:image")).toBe(HOME_OG_IMAGE);
  });

  it.each([
    ["kaytori-sushi-casablanca-1200x630.jpg"],
    ["kaytori-sushi-salle-1200x630.jpg"],
  ])("l'image OG %s existe dans public/og/ en 1200 × 630 (JPEG)", (name) => {
    const file = readFileSync(new URL(`../public/og/${name}`, import.meta.url));
    expect(file.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
    // Marqueur SOF (baseline 0xC0 ou progressif 0xC2) : hauteur puis largeur sur 2 octets.
    let i = 2;
    while (i < file.length && !(file[i] === 0xff && (file[i + 1] === 0xc0 || file[i + 1] === 0xc2))) {
      i += 2 + file.readUInt16BE(i + 2);
    }
    expect({ width: file.readUInt16BE(i + 7), height: file.readUInt16BE(i + 5) }).toEqual({ width: 1200, height: 630 });
  });
});

describe("JSON-LD (HTML initial)", () => {
  it("un seul bloc, JSON valide, @graph Restaurant + WebSite", () => {
    expect(jsonLdBlocks).toHaveLength(1);
    const data = JSON.parse(jsonLdBlocks[0]) as Node;
    expect(data["@context"]).toBe("https://schema.org");
    expect(graph().map((n) => n["@type"])).toEqual(["Restaurant", "WebSite"]);
  });

  it("Restaurant : nom, URL, image, téléphone, cuisine, menu, réseaux", () => {
    const r = byType("Restaurant");
    expect(r.name).toBe("KAYTÔRI SUSHI");
    expect(r.url).toBe(SITE_URL);
    expect(r.menu).toBe(MENU_URL);
    expect(r.image).toBe(HOME_OG_IMAGE);
    expect(r.telephone).toBe("+212520026824");
    expect(r.servesCuisine).toEqual(["Sushi", "Japonaise", "Thaïlandaise", "Asiatique"]);
    expect(r.sameAs).toEqual(["https://www.instagram.com/kaytorisushi/"]);
    expect(r.hasMap).toBe("https://maps.app.goo.gl/HPD8cTM8YA4h7HZP8");
  });

  it("Restaurant : adresse confirmée, sans code postal inventé ; coordonnées de la fiche Maps", () => {
    const r = byType("Restaurant");
    expect(r.address).toEqual({
      "@type": "PostalAddress",
      streetAddress: "Les Perles de Californie, Mag. 5, Av. Al Hachmi Al Filali",
      addressLocality: "Casablanca",
      addressCountry: "MA",
    });
    expect(r.geo).toEqual({ "@type": "GeoCoordinates", latitude: 33.5280816, longitude: -7.6155004 });
  });

  it("Restaurant : horaires exacts (lun–jeu 12h–23h, ven–dim 12h–00h), chaque jour une seule fois", () => {
    const hours = byType("Restaurant").openingHoursSpecification as Node[];
    expect(hours).toEqual([
      { "@type": "OpeningHoursSpecification", dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday"], opens: "12:00", closes: "23:00" },
      { "@type": "OpeningHoursSpecification", dayOfWeek: ["Friday", "Saturday", "Sunday"], opens: "12:00", closes: "00:00" },
    ]);
    const days = hours.flatMap((h) => h.dayOfWeek as string[]);
    expect(new Set(days).size).toBe(7);
  });

  it("aucune information non confirmée (avis, note, prix, réservation, code postal)", () => {
    const text = jsonLdBlocks[0];
    for (const key of ["aggregateRating", "review", "priceRange", "acceptsReservations", "postalCode"]) {
      expect(text).not.toContain(`"${key}"`);
    }
  });

  it("WebSite : nom, URL, variantes du nom, lien vers le Restaurant", () => {
    const w = byType("WebSite");
    expect(w.name).toBe("KAYTÔRI SUSHI");
    expect(w.url).toBe(SITE_URL);
    expect(w.alternateName).toEqual(["Kaytori Sushi", "Kaytôri"]);
    expect(w.publisher).toEqual({ "@id": byType("Restaurant")["@id"] });
  });
});
