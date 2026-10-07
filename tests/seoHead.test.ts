/**
 * SEO-02 : <head> d'index.html (présent dans le HTML initial, sans JavaScript) et données
 * structurées JSON-LD. Valeurs = informations confirmées par le restaurant ; rien d'inventé
 * (pas de code postal, pas d'avis, pas de priceRange, pas de réservation).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const SITE_URL = "https://kaytori-sushi-menu.vercel.app/";
const OG_IMAGE = `${SITE_URL}og/kaytori-sushi-casablanca-1200x630.jpg`;
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const head = html.slice(0, html.indexOf("</head>"));

const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"');

/** Attributs de chaque balise <tag …> du <head> (attributs multi-lignes acceptés). */
function tags(tag: string): Record<string, string>[] {
  return [...head.matchAll(new RegExp(`<${tag}\\b([^>]*)>`, "g"))].map((m) =>
    Object.fromEntries([...m[1].matchAll(/([\w:-]+)="([^"]*)"/g)].map((a) => [a[1], decode(a[2])])),
  );
}
const metas = tags("meta");
function meta(key: "name" | "property", value: string): string {
  const found = metas.filter((m) => m[key] === value);
  expect(found, `${key}="${value}" présent une seule fois`).toHaveLength(1);
  return found[0].content;
}

const jsonLdBlocks = [...head.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
type Node = Record<string, unknown>;
const graph = () => (JSON.parse(jsonLdBlocks[0]) as { "@graph": Node[] })["@graph"];
const byType = (type: string) => graph().find((n) => n["@type"] === type)!;

describe("<head> : title, description, canonical", () => {
  it("title SEO local (marque + ville + cuisine), longueur raisonnable", () => {
    const titles = [...head.matchAll(/<title>([^<]*)<\/title>/g)].map((m) => decode(m[1]));
    expect(titles).toEqual(["Kaytôri Sushi Casablanca — Menu Sushi, Wok & Thaï"]);
    expect(titles[0].length).toBeLessThanOrEqual(60);
  });

  it("meta description naturelle, sans promesse non confirmée", () => {
    const d = meta("name", "description");
    for (const word of ["Kaytôri Sushi", "Casablanca", "sushi", "wok", "thaï", "Consultez la carte", "commandez"]) {
      expect(d).toContain(word);
    }
    expect(d.length).toBeLessThanOrEqual(160);
    expect(d.toLowerCase()).not.toMatch(/livraison|gratuit|réserv|meilleur|n°1/);
  });

  it("canonical unique vers la racine du domaine Vercel actuel", () => {
    const canonicals = tags("link").filter((l) => l.rel === "canonical");
    expect(canonicals).toEqual([{ rel: "canonical", href: SITE_URL }]);
  });

  it("lang, viewport et favicon inchangés", () => {
    expect(html).toContain('<html lang="fr">');
    expect(meta("name", "viewport")).toContain("width=device-width");
    expect(tags("link").some((l) => l.rel === "icon" && l.href === "/kaytori-logo-clean.png")).toBe(true);
  });
});

describe("Open Graph et Twitter", () => {
  it("Open Graph complet", () => {
    expect(meta("property", "og:type")).toBe("website");
    expect(meta("property", "og:site_name")).toBe("Kaytôri Sushi");
    expect(meta("property", "og:title")).toBe("Kaytôri Sushi Casablanca — Menu Sushi, Wok & Thaï");
    expect(meta("property", "og:description")).toContain("Casablanca");
    expect(meta("property", "og:url")).toBe(SITE_URL);
    expect(meta("property", "og:image")).toBe(OG_IMAGE);
    expect(meta("property", "og:image:width")).toBe("1200");
    expect(meta("property", "og:image:height")).toBe("630");
    expect(meta("property", "og:image:type")).toBe("image/jpeg");
    expect(meta("property", "og:locale")).toBe("fr_MA");
  });

  it("Twitter : summary_large_image, même titre/description/image qu'Open Graph", () => {
    expect(meta("name", "twitter:card")).toBe("summary_large_image");
    expect(meta("name", "twitter:title")).toBe(meta("property", "og:title"));
    expect(meta("name", "twitter:description")).toBe(meta("property", "og:description"));
    expect(meta("name", "twitter:image")).toBe(OG_IMAGE);
  });

  it("l'image OG existe dans public/ en 1200 × 630 (JPEG)", () => {
    const file = readFileSync(new URL("../public/og/kaytori-sushi-casablanca-1200x630.jpg", import.meta.url));
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
    expect(r.menu).toBe(SITE_URL);
    expect(r.image).toBe(OG_IMAGE);
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
