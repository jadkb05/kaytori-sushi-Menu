/**
 * SEO-03 (robots.txt, sitemap.xml, en-têtes Vercel) et SEO-04 (H1, intro, infos locales visibles).
 * Les informations visibles du footer doivent correspondre exactement au JSON-LD d'index.html.
 */
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CartProvider } from "../src/cart/CartContext";
import { SITE, whatsappHref } from "../src/config/site";
import { staticMenuSource } from "../src/data/menuSource";
import { MenuProvider } from "../src/menu/MenuProvider";
import { MenuPage } from "../src/pages/MenuPage";

const SITE_URL = "https://kaytori-sushi-menu.vercel.app/";
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

/** Page publique rendue (menu statique), commentaires React retirés. */
const page = renderToStaticMarkup(
  <MenuProvider source={staticMenuSource}>
    <CartProvider>
      <MenuPage />
    </CartProvider>
  </MenuProvider>,
).replace(/<!-- -->/g, "");
/** Texte visible (balises retirées, entités de base décodées). */
const visibleText = page
  .replace(/<span class="sr-only">[^<]*<\/span>/g, "")
  .replace(/<[^>]+>/g, " ")
  .replace(/&amp;/g, "&")
  .replace(/&#x27;/g, "'")
  .replace(/\s+/g, " ");
const footer = page.slice(page.indexOf("<footer"));
const hrefs = [...page.matchAll(/href="([^"]*)"/g)].map((m) => m[1].replace(/&amp;/g, "&"));

type Node = Record<string, unknown>;
const jsonLd = JSON.parse(read("index.html").match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)![1]) as {
  "@graph": Node[];
};
const restaurant = jsonLd["@graph"].find((n) => n["@type"] === "Restaurant")!;

describe("SEO-04 : H1 et introduction", () => {
  it("exactement un H1 public : « Kaytôri Sushi », avec les classes du titre d'origine", () => {
    const h1 = [...page.matchAll(/<h1([^>]*)>([^<]*)<\/h1>/g)];
    expect(h1).toHaveLength(1);
    expect(h1[0][2]).toBe("Kaytôri Sushi");
    expect(h1[0][1]).toContain("font-display text-[1.1rem] font-semibold tracking-tight text-kaytori-cream");
  });
});

describe("SEO-04 : informations locales visibles (footer)", () => {
  it("adresse officielle visible, liée à la fiche Google Maps du restaurant", () => {
    expect(SITE.address).toBe("Les Perles de Californie, Mag. 5, Av. Al Hachmi Al Filali, Casablanca");
    expect(visibleText).toContain(SITE.address);
    expect(SITE.mapsUrl).toBe("https://maps.app.goo.gl/HPD8cTM8YA4h7HZP8");
    expect(footer).toContain(`href="${SITE.mapsUrl}"`);
    expect(page).not.toContain("Hachimi");
  });

  it("téléphone principal SEO / NAP visible et cliquable dans le footer : 05 20 02 68 24 → tel:+212520026824", () => {
    expect(SITE.phoneFixeDisplay).toBe("05 20 02 68 24");
    expect(SITE.phoneFixeE164).toBe("212520026824");
    expect(footer).toContain(">05 20 02 68 24</a>");
    expect(footer).toContain('href="tel:+212520026824"');
  });

  it("horaires visibles, sans autre horaire contradictoire", () => {
    expect(visibleText).toContain("Lundi – Jeudi : 12h–23h");
    expect(visibleText).toContain("Vendredi – Dimanche : 12h–00h");
    expect(visibleText).not.toMatch(/minuit|12h – 23h/);
  });

  it("Instagram officiel visible et lié", () => {
    expect(visibleText).toContain("@kaytorisushi");
    expect(footer).toContain('href="https://www.instagram.com/kaytorisushi/"');
  });
});

describe("bouton Appeler et WhatsApp (numéros distincts du numéro SEO)", () => {
  it("le bouton Appeler du header garde son numéro : 06 65 80 18 07 → tel:+212665801807", () => {
    const header = page.slice(0, page.indexOf("</header>"));
    expect(SITE.callE164).toBe("212665801807");
    expect(SITE.callDisplay).toBe("06 65 80 18 07");
    expect(header).toContain('href="tel:+212665801807"');
    expect(header).toContain('aria-label="Appeler 06 65 80 18 07"');
    expect(header).not.toContain("212520026824");
    // Header : bouton Appeler ; footer : numéro SEO / NAP.
    expect(hrefs.filter((h) => h.startsWith("tel:"))).toEqual(["tel:+212665801807", "tel:+212520026824"]);
  });

  it("WhatsApp inchangé : 212675565913", () => {
    expect(SITE.whatsappE164).toBe("212675565913");
    expect(whatsappHref()).toBe("https://api.whatsapp.com/send?phone=212675565913");
    expect(whatsappHref("Bonjour")).toBe("https://api.whatsapp.com/send?phone=212675565913&text=Bonjour");
  });
});

describe("JSON-LD = informations visibles", () => {
  const FR_DAYS: Record<string, string> = {
    Lundi: "Monday",
    Mardi: "Tuesday",
    Mercredi: "Wednesday",
    Jeudi: "Thursday",
    Vendredi: "Friday",
    Samedi: "Saturday",
    Dimanche: "Sunday",
  };
  const ORDER = Object.keys(FR_DAYS);
  /** « Lundi – Jeudi » / « 12h–23h » (affichage) → OpeningHoursSpecification. */
  const toSpec = ({ days, range }: { days: string; range: string }) => {
    const [from, to] = days.split(" – ");
    const [opens, closes] = range.split("–").map((h) => `${h.replace("h", "").padStart(2, "0")}:00`);
    return {
      "@type": "OpeningHoursSpecification",
      dayOfWeek: ORDER.slice(ORDER.indexOf(from), ORDER.indexOf(to) + 1).map((d) => FR_DAYS[d]),
      opens,
      closes,
    };
  };

  it("nom : JSON-LD « KAYTÔRI SUSHI » = H1 « Kaytôri Sushi » (même nom, casse près)", () => {
    expect(restaurant.name).toBe("KAYTÔRI SUSHI");
    expect((restaurant.name as string).toLocaleLowerCase("fr")).toBe("Kaytôri Sushi".toLocaleLowerCase("fr"));
  });

  it("adresse : streetAddress + ville = adresse visible", () => {
    const address = restaurant.address as Node;
    expect(`${address.streetAddress}, ${address.addressLocality}`).toBe(SITE.address);
  });

  it("téléphone : JSON-LD = numéro SEO visible dans le footer (pas celui du bouton Appeler)", () => {
    expect(restaurant.telephone).toBe("+212520026824");
    expect(restaurant.telephone).toBe(`+${SITE.phoneFixeE164}`);
    expect(restaurant.telephone).not.toBe(`+${SITE.callE164}`);
  });

  it("horaires : JSON-LD = horaires visibles (jours, ouverture, fermeture)", () => {
    expect(SITE.hours.map(toSpec)).toEqual(restaurant.openingHoursSpecification);
  });

  it("Google Maps et Instagram : JSON-LD = liens visibles", () => {
    expect(restaurant.hasMap).toBe(SITE.mapsUrl);
    expect(restaurant.sameAs).toEqual([SITE.instagram]);
  });
});

describe("SEO-03 : robots.txt et sitemap.xml", () => {
  it("robots.txt : tout autorisé (y compris /admin, pour que son noindex soit lu), sitemap référencé", () => {
    const robots = read("public/robots.txt");
    expect(robots).toBe(`User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}sitemap.xml\n`);
    expect(robots).not.toMatch(/Disallow/i);
  });

  it("sitemap.xml : XML bien formé, une seule URL = canonical, ni /admin ni /menu ni ancre", () => {
    const xml = read("public/sitemap.xml");
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n')).toBe(true);
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(xml.trimEnd().endsWith("</urlset>")).toBe(true);
    // Balises équilibrées et bien imbriquées.
    const stack: string[] = [];
    for (const [, close, name, self] of xml.replace(/<\?xml[^>]*\?>/, "").matchAll(/<(\/?)([\w:]+)[^>]*?(\/?)>/g)) {
      if (self) continue;
      if (close) expect(stack.pop()).toBe(name);
      else stack.push(name);
    }
    expect(stack).toEqual([]);
    const locs = [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]);
    expect(locs).toEqual([SITE_URL]);
    expect(read("index.html")).toContain(`<link rel="canonical" href="${locs[0]}" />`);
    expect(xml).not.toMatch(/\/admin|\/menu|#/);
  });
});

describe("SEO-03 : vercel.json", () => {
  const config = JSON.parse(read("vercel.json")) as {
    rewrites: { source: string; destination: string }[];
    headers: { source: string; headers: { key: string; value: string }[] }[];
  };

  it("rewrites inchangés (/menu, /menu/, /admin, /admin/:path* → index.html)", () => {
    expect(config.rewrites).toEqual([
      { source: "/menu", destination: "/index.html" },
      { source: "/menu/", destination: "/index.html" },
      { source: "/admin", destination: "/index.html" },
      { source: "/admin/:path*", destination: "/index.html" },
    ]);
  });

  it("X-Robots-Tag noindex, nofollow sur /admin et /admin/:path* uniquement", () => {
    const noindex = config.headers.filter((h) => h.headers.some((x) => x.key === "X-Robots-Tag"));
    expect(noindex.map((h) => h.source)).toEqual(["/admin", "/admin/:path*"]);
    for (const h of noindex) expect(h.headers).toEqual([{ key: "X-Robots-Tag", value: "noindex, nofollow" }]);
  });

  it("cache immutable sur les assets hashés de Vite uniquement", () => {
    const cache = config.headers.filter((h) => h.headers.some((x) => x.key === "Cache-Control"));
    expect(cache).toEqual([
      { source: "/assets/(.*)", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
    ]);
  });
});
