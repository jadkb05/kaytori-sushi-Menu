/**
 * Parcours de commande : mode livraison / à emporter, récapitulatif et message WhatsApp.
 * Sans coordonnées, le message reste strictement celui de référence.
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
  payment: "card",
  address: "12 rue des Lilas, imm. 4, 2e étage",
  locationUrl: "maps.app.goo.gl/abc123",
};
const pickup: CheckoutInfo = { ...delivery, mode: "pickup" };

describe("validation des coordonnées", () => {
  it("livraison : adresse obligatoire ; localisation facultative", () => {
    const e = validateCheckout({ ...EMPTY_CHECKOUT, payment: "cash" });
    expect(Object.keys(e).sort()).toEqual(["address"]);
    expect(validateCheckout({ ...delivery, locationUrl: "" })).toEqual({});
  });

  it("à emporter : adresse non requise, même vide", () => {
    expect(validateCheckout({ ...EMPTY_CHECKOUT, mode: "pickup", payment: "card" })).toEqual({});
  });

  it("localisation : lien web accepté (schéma ajouté), texte libre refusé", () => {
    expect(normalizeLocationUrl("maps.app.goo.gl/abc")).toBe("https://maps.app.goo.gl/abc");
    expect(normalizeLocationUrl("https://www.google.com/maps?q=33.5,-7.6")).toBe("https://www.google.com/maps?q=33.5,-7.6");
    expect(normalizeLocationUrl("près de la mosquée")).toBeNull();
    expect(validateCheckout({ ...delivery, locationUrl: "près de la mosquée" }).locationUrl).toMatch(/pas valide/);
    expect(mapsUrlFromCoords(33.528081, -7.6155)).toBe("https://www.google.com/maps?q=33.52808,-7.61550");
  });

  it("aucun champ téléphone, prénom, nom, quartier ni instructions dans le formulaire", () => {
    const html = renderToStaticMarkup(
      <CheckoutForm formId="f" value={delivery} onChange={() => {}} errors={{}} onSubmit={() => {}} />,
    );
    expect(html).not.toMatch(/type="tel"|téléphone\b(?! demandé)/i);
    expect(html).not.toMatch(/Prénom|Quartier|Instructions de livraison|checkout-firstName|checkout-lastName|checkout-neighborhood|checkout-instructions/);
    expect(html).not.toMatch(/>Nom</);
  });

  it("adresse : pas d'autoFocus (évite l'ouverture du clavier iOS à l'arrivée sur Coordonnées)", () => {
    const html = renderToStaticMarkup(
      <CheckoutForm formId="f" value={delivery} onChange={() => {}} errors={{}} onSubmit={() => {}} />,
    );
    expect(html).toContain('id="checkout-address"');
    expect(html).not.toMatch(/id="checkout-address"[^>]*autoFocus|autoFocus[^>]*id="checkout-address"/i);
  });
});

describe("mode de paiement", () => {
  const filled = { ...delivery, payment: "" as const };

  it("obligatoire, aucun choix par défaut, en livraison comme à emporter", () => {
    expect(EMPTY_CHECKOUT.payment).toBe("");
    expect(validateCheckout(filled)).toEqual({ payment: "Veuillez choisir un mode de paiement." });
    expect(validateCheckout({ ...filled, mode: "pickup" })).toEqual({ payment: "Veuillez choisir un mode de paiement." });
  });

  it.each([
    ["cash", "💵 MODE DE PAIEMENT\nPaiement : Espèces\n"],
    ["card", "💳 MODE DE PAIEMENT\nPaiement : Carte bancaire (TPE)\n"],
  ] as const)("%s : accepté pour les deux modes, dans le message avant la commande", (payment, block) => {
    for (const mode of ["delivery", "pickup"] as const) {
      const info = { ...delivery, mode, payment };
      expect(validateCheckout(info)).toEqual({});
      const msg = buildWhatsappOrderMessage(lines, total, undefined, checkoutDetails(info));
      expect(msg).toContain(`\n\n${block}\n🛍️ COMMANDE\n`);
      expect(msg).toContain("Total : 514,00 DH");
      expect(msg).not.toMatch(/payé|réglé/i);
    }
  });

  it("formulaire : deux options, aucune cochée par défaut, l'option choisie cochée", () => {
    const form = (payment: CheckoutInfo["payment"], errors = {}) =>
      renderToStaticMarkup(<CheckoutForm formId="f" value={{ ...delivery, payment }} onChange={() => {}} errors={errors} onSubmit={() => {}} />);
    const radios = (html: string) => html.match(/<input[^>]*name="checkout-payment"[^>]*>/g) ?? [];
    expect(radios(form(""))).toHaveLength(2);
    expect(radios(form("")).filter((r) => r.includes("checked"))).toHaveLength(0);
    expect(radios(form("cash")).find((r) => r.includes("checked"))).toContain('value="cash"');
    expect(radios(form("card")).find((r) => r.includes("checked"))).toContain('value="card"');
    expect(form("", { payment: "Veuillez choisir un mode de paiement." })).toContain('id="checkout-payment-error"');
    expect(form("")).not.toMatch(/numéro de carte|cvv|expiration/i);
  });
});

describe("coordonnées nettoyées (récapitulatif et message)", () => {
  it("livraison : espaces normalisés, lien normalisé", () => {
    expect(checkoutDetails(delivery)).toEqual({
      mode: "delivery",
      payment: "card",
      address: "12 rue des Lilas, imm. 4, 2e étage",
      locationUrl: "https://maps.app.goo.gl/abc123",
    });
  });

  it("à emporter : champs de livraison retirés même s'ils avaient été saisis", () => {
    expect(checkoutDetails(pickup)).toEqual({ mode: "pickup", payment: "card" });
  });
});

describe("message WhatsApp", () => {
  it("sans coordonnées : identique octet par octet à la référence", () => {
    expect(buildWhatsappOrderMessage(lines, total)).toBe(reference);
    expect(buildWhatsappOrderMessage(lines, total, undefined, undefined)).toBe(reference);
  });

  it("livraison : blocs livraison + paiement, lignes et total de référence inchangés", () => {
    const msg = buildWhatsappOrderMessage(lines, total, undefined, checkoutDetails(delivery));
    const refLines = reference.split("\n");
    const detailStart = refLines.findIndex((l) => l.startsWith("• "));
    expect(msg).toBe(
      [
        ...refLines.slice(0, detailStart),
        "📍 LIVRAISON",
        "Mode : Livraison",
        "Adresse : 12 rue des Lilas, imm. 4, 2e étage",
        "Localisation : https://maps.app.goo.gl/abc123",
        "",
        "💳 MODE DE PAIEMENT",
        "Paiement : Carte bancaire (TPE)",
        "",
        "🛍️ COMMANDE",
        "",
        ...refLines.slice(detailStart, refLines.indexOf("Total : 514,00 DH")),
        "Livraison : offerte",
        ...refLines.slice(refLines.indexOf("Total : 514,00 DH")),
      ].join("\n"),
    );
    expect(msg).not.toMatch(/CLIENT|Prénom|Nom :|Quartier|Instructions/);
  });

  it("localisation vide omise", () => {
    const msg = buildWhatsappOrderMessage(lines, total, undefined, checkoutDetails({ ...delivery, locationUrl: "" }));
    expect(msg).not.toMatch(/Localisation/);
    expect(msg).toContain("Adresse : 12 rue des Lilas, imm. 4, 2e étage");
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
    expect(html).toContain("Carte bancaire (TPE)");
    expect(html).toContain("À régler à la livraison.");
    expect(html).not.toMatch(/Prénom|Quartier|Instructions|recap-client/);
  });

  it("à emporter : pas d'adresse ni de ligne livraison", () => {
    const html = recap(pickup);
    expect(html).toContain("À emporter (retrait au restaurant)");
    expect(html).not.toMatch(/12 rue des Lilas|Offerte|Quartier/);
    expect(html).toContain("À régler au retrait.");
  });

  it("boutons modifier livraison/retrait, paiement et panier présents", () => {
    const html = recap(delivery);
    expect(html).toContain('aria-label="Modifier la livraison"');
    expect(html).toContain('aria-label="Modifier le panier"');
    expect(html).toContain('aria-label="Modifier le mode de paiement"');
    expect(html).not.toContain('aria-label="Modifier mes informations"');
  });
});
