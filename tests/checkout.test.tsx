/**
 * Parcours de commande : coordonnées client (livraison / à emporter), récapitulatif et message
 * WhatsApp. Sans coordonnées, le message reste strictement celui de référence.
 */
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildWhatsappOrderMessage, type CartLine } from "../src/cart/buildOrderMessage";
import {
  EMPTY_CHECKOUT,
  checkoutDetails,
  mapsUrlFromCoords,
  normalizeLocationUrl,
  validateCheckout,
  type CheckoutInfo,
} from "../src/cart/checkout";
import { whatsappHref } from "../src/config/site";
import { CheckoutForm, OrderRecap } from "../src/components/CheckoutSteps";
import { getStaticMenu } from "../src/data/menuSource";
import { WHATSAPP_REFERENCE_FILE, cartTotalDh, sampleCartLines } from "./referenceCases";

const reference = readFileSync(WHATSAPP_REFERENCE_FILE, "utf8");
const lines = sampleCartLines(getStaticMenu());
const total = cartTotalDh(lines);

const delivery: CheckoutInfo = {
  mode: "delivery",
  firstName: "  Yasmine ",
  lastName: "El   Amrani",
  address: "12 rue des Lilas, imm. 4, 2e étage",
  neighborhood: "Californie",
  instructions: "Sonner à l'interphone B",
  locationUrl: "maps.app.goo.gl/abc123",
};
const pickup: CheckoutInfo = { ...delivery, mode: "pickup" };

describe("validation des coordonnées", () => {
  it("prénom et nom obligatoires (y compris espaces seuls)", () => {
    const e = validateCheckout({ ...EMPTY_CHECKOUT, mode: "pickup", firstName: "   " });
    expect(e).toEqual({ firstName: "Veuillez indiquer votre prénom.", lastName: "Veuillez indiquer votre nom." });
  });

  it("livraison : adresse et quartier obligatoires ; instructions et localisation facultatives", () => {
    const e = validateCheckout({ ...EMPTY_CHECKOUT, firstName: "A", lastName: "B" });
    expect(Object.keys(e).sort()).toEqual(["address", "neighborhood"]);
    expect(validateCheckout({ ...delivery, instructions: "", locationUrl: "" })).toEqual({});
  });

  it("à emporter : adresse et quartier non requis, même vides", () => {
    expect(validateCheckout({ ...EMPTY_CHECKOUT, mode: "pickup", firstName: "A", lastName: "B" })).toEqual({});
  });

  it("localisation : lien web accepté (schéma ajouté), texte libre refusé", () => {
    expect(normalizeLocationUrl("maps.app.goo.gl/abc")).toBe("https://maps.app.goo.gl/abc");
    expect(normalizeLocationUrl("https://www.google.com/maps?q=33.5,-7.6")).toBe("https://www.google.com/maps?q=33.5,-7.6");
    expect(normalizeLocationUrl("près de la mosquée")).toBeNull();
    expect(validateCheckout({ ...delivery, locationUrl: "près de la mosquée" }).locationUrl).toMatch(/pas valide/);
    expect(mapsUrlFromCoords(33.528081, -7.6155)).toBe("https://www.google.com/maps?q=33.52808,-7.61550");
  });

  it("aucun champ téléphone dans le formulaire", () => {
    const html = renderToStaticMarkup(
      <CheckoutForm formId="f" value={delivery} onChange={() => {}} errors={{}} onSubmit={() => {}} />,
    );
    expect(html).not.toMatch(/type="tel"|téléphone\b(?! demandé)/i);
  });
});

describe("coordonnées nettoyées (récapitulatif et message)", () => {
  it("livraison : espaces normalisés, lien normalisé", () => {
    expect(checkoutDetails(delivery)).toEqual({
      mode: "delivery",
      firstName: "Yasmine",
      lastName: "El Amrani",
      address: "12 rue des Lilas, imm. 4, 2e étage",
      neighborhood: "Californie",
      instructions: "Sonner à l'interphone B",
      locationUrl: "https://maps.app.goo.gl/abc123",
    });
  });

  it("à emporter : champs de livraison retirés même s'ils avaient été saisis", () => {
    expect(checkoutDetails(pickup)).toEqual({ mode: "pickup", firstName: "Yasmine", lastName: "El Amrani" });
  });
});

describe("message WhatsApp", () => {
  it("sans coordonnées : identique octet par octet à la référence", () => {
    expect(buildWhatsappOrderMessage(lines, total)).toBe(reference);
    expect(buildWhatsappOrderMessage(lines, total, undefined, undefined)).toBe(reference);
  });

  it("livraison : blocs client + livraison, lignes et total de référence inchangés", () => {
    const msg = buildWhatsappOrderMessage(lines, total, undefined, checkoutDetails(delivery));
    const refLines = reference.split("\n");
    const detailStart = refLines.findIndex((l) => l.startsWith("• "));
    expect(msg).toBe(
      [
        ...refLines.slice(0, detailStart),
        "👤 CLIENT",
        "Prénom : Yasmine",
        "Nom : El Amrani",
        "",
        "📍 LIVRAISON",
        "Mode : Livraison",
        "Adresse : 12 rue des Lilas, imm. 4, 2e étage",
        "Quartier : Californie",
        "Instructions : Sonner à l'interphone B",
        "Localisation : https://maps.app.goo.gl/abc123",
        "",
        "🛍️ COMMANDE",
        "",
        ...refLines.slice(detailStart, refLines.indexOf("Total : 514,00 DH")),
        "Livraison : offerte",
        ...refLines.slice(refLines.indexOf("Total : 514,00 DH")),
      ].join("\n"),
    );
  });

  it("champs facultatifs vides omis", () => {
    const msg = buildWhatsappOrderMessage(lines, total, undefined, checkoutDetails({ ...delivery, instructions: " ", locationUrl: "" }));
    expect(msg).not.toMatch(/Instructions|Localisation/);
    expect(msg).toContain("Quartier : Californie");
  });

  it("à emporter : mode retrait, ni adresse ni ligne livraison ; total inchangé", () => {
    const msg = buildWhatsappOrderMessage(lines, total, undefined, checkoutDetails(pickup));
    expect(msg).toContain("🏪 RETRAIT\nMode : À emporter (retrait au restaurant)");
    expect(msg).not.toMatch(/Adresse|Quartier|Livraison/);
    expect(msg).toContain("Total : 514,00 DH");
    for (const l of reference.split("\n").filter((x) => x.startsWith("• "))) expect(msg).toContain(l);
  });

  it("lien WhatsApp : même numéro, emojis encodés sans perte", () => {
    const msg = buildWhatsappOrderMessage(lines, total, undefined, checkoutDetails(delivery));
    const url = whatsappHref(msg);
    expect(url.startsWith("https://api.whatsapp.com/send?phone=212675565913&text=")).toBe(true);
    expect(decodeURIComponent(new URL(url).searchParams.get("text")!)).toBe(msg);
  });
});

describe("récapitulatif", () => {
  const recap = (info: CheckoutInfo, cart: readonly CartLine[] = lines) =>
    renderToStaticMarkup(
      <OrderRecap lines={cart} totalDh={cartTotalDh([...cart])} details={checkoutDetails(info)} onEditDetails={() => {}} onEditCart={() => {}} />,
    );

  it("données réelles du panier : produit, variante, quantité × prix unitaire, total de ligne et total", () => {
    const html = recap(delivery);
    expect(html).toContain("Teppanyaki");
    expect(html).toContain("Saumon");
    expect(html).toContain("2 × 89,00 DH");
    expect(html).toContain("178,00 DH");
    expect(html.match(/514,00 DH/g)).toHaveLength(2); // sous-total + total
    expect(html).toContain("Offerte");
    expect(html).toContain("12 rue des Lilas");
    expect(html).toContain('href="https://maps.app.goo.gl/abc123"');
  });

  it("à emporter : pas d'adresse ni de ligne livraison", () => {
    const html = recap(pickup);
    expect(html).toContain("À emporter (retrait au restaurant)");
    expect(html).not.toMatch(/12 rue des Lilas|Offerte|Quartier/);
  });

  it("boutons modifier coordonnées et panier présents", () => {
    const html = recap(delivery);
    expect(html).toContain('aria-label="Modifier mes informations"');
    expect(html).toContain('aria-label="Modifier le panier"');
  });
});
