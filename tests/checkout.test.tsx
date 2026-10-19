/**
 * Parcours de commande : mode livraison / à emporter, identité, quartier searchable,
 * récapitulatif et message WhatsApp. Sans coordonnées, le message reste celui de référence.
 */
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildWhatsappOrderMessage, type CartLine } from "../src/cart/buildOrderMessage";
import {
  EMPTY_CHECKOUT,
  NEIGHBORHOODS,
  checkoutDetails,
  filterNeighborhoods,
  foldSearch,
  isValidNeighborhood,
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
/** Ligne « Total : … DH » de la référence WhatsApp (suit le panier type du menu actuel). */
const totalLine = reference.split("\n").find((l) => l.startsWith("Total : "))!;
const totalAmountLabel = totalLine.replace(/^Total : /, "");

const delivery: CheckoutInfo = {
  mode: "delivery",
  payment: "card",
  fullName: "  Yasmine  El   Amrani ",
  address: "12 rue des Lilas, imm. 4, 2e étage",
  neighborhood: "Polo / Bachkou / Oasis",
  locationUrl: "maps.app.goo.gl/abc123",
};
const pickup: CheckoutInfo = { ...delivery, mode: "pickup" };

describe("quartiers (liste client)", () => {
  it("contient exactement les 15 options fournies, dans l'ordre", () => {
    expect([...NEIGHBORHOODS]).toEqual([
      "Bourgogne",
      "Ain Diab",
      "Maarif / Anfa / Palmier",
      "Maarif ext",
      "Val Fleuri / Derb Ghallef / Anoual",
      "CFC / El Hana / CIL / Ghandi",
      "Oulfa / Hay Hassani / Laymoune",
      "Belvédère / Roche Noire",
      "Centre Ville",
      "Ain Chok / Inara",
      "Mers Sultan / Q. Hopitaux / 2 Mars",
      "Polo / Bachkou / Oasis",
      "Californie",
      "Bouskoura - Ville Verte",
      "Almaz",
    ]);
    expect(NEIGHBORHOODS).toHaveLength(15);
  });

  it("recherche insensible à la casse et aux accents", () => {
    expect(foldSearch("Belvédère")).toBe(foldSearch("belvedere"));
    expect(filterNeighborhoods("belve").map(String)).toContain("Belvédère / Roche Noire");
    expect(filterNeighborhoods("CALIFORNIE").map(String)).toEqual(["Californie"]);
    expect(filterNeighborhoods("maarif").map(String)).toEqual(["Maarif / Anfa / Palmier", "Maarif ext"]);
    expect(filterNeighborhoods("xyz-inconnu")).toEqual([]);
  });

  it("n'accepte qu'une valeur exacte de la liste", () => {
    expect(isValidNeighborhood("Polo / Bachkou / Oasis")).toBe(true);
    expect(isValidNeighborhood("Californie")).toBe(true);
    expect(isValidNeighborhood("Oasis")).toBe(false);
    expect(isValidNeighborhood("")).toBe(false);
  });
});

describe("validation des coordonnées", () => {
  it("nom et prénom obligatoires", () => {
    const e = validateCheckout({ ...EMPTY_CHECKOUT, mode: "pickup", payment: "cash", fullName: "   " });
    expect(e.fullName).toMatch(/nom et prénom/i);
  });

  it("livraison : adresse et quartier obligatoires ; localisation facultative", () => {
    const e = validateCheckout({
      ...EMPTY_CHECKOUT,
      payment: "cash",
      fullName: "A B",
    });
    expect(Object.keys(e).sort()).toEqual(["address", "neighborhood"]);
    expect(validateCheckout({ ...delivery, locationUrl: "" })).toEqual({});
  });

  it("livraison : quartier hors liste refusé", () => {
    expect(validateCheckout({ ...delivery, neighborhood: "Dar Bouazza" }).neighborhood).toMatch(/liste/i);
  });

  it("à emporter : adresse et quartier non requis", () => {
    expect(
      validateCheckout({
        ...EMPTY_CHECKOUT,
        mode: "pickup",
        payment: "card",
        fullName: "A B",
      }),
    ).toEqual({});
  });

  it("localisation : lien web accepté (schéma ajouté), texte libre refusé", () => {
    expect(normalizeLocationUrl("maps.app.goo.gl/abc")).toBe("https://maps.app.goo.gl/abc");
    expect(normalizeLocationUrl("https://www.google.com/maps?q=33.5,-7.6")).toBe("https://www.google.com/maps?q=33.5,-7.6");
    expect(normalizeLocationUrl("près de la mosquée")).toBeNull();
    expect(validateCheckout({ ...delivery, locationUrl: "près de la mosquée" }).locationUrl).toMatch(/pas valide/);
    expect(mapsUrlFromCoords(33.528081, -7.6155)).toBe("https://www.google.com/maps?q=33.52808,-7.61550");
  });

  it("formulaire : nom et prénom regroupés, quartier searchable ; pas de téléphone ni instructions", () => {
    const html = renderToStaticMarkup(
      <CheckoutForm formId="f" value={delivery} onChange={() => {}} errors={{}} onSubmit={() => {}} />,
    );
    expect(html).toContain("Nom et prénom");
    expect(html).toContain('id="checkout-fullName"');
    expect(html).not.toContain('id="checkout-firstName"');
    expect(html).not.toContain('id="checkout-lastName"');
    expect(html).toContain("Quartier");
    expect(html).toContain('role="combobox"');
    expect(html).toContain('id="checkout-address"');
    expect(html).not.toMatch(/type="tel"|téléphone\b(?! demandé)/i);
    expect(html).not.toMatch(/Instructions de livraison/);
    expect(html).not.toMatch(/id="checkout-address"[^>]*autoFocus|autoFocus[^>]*id="checkout-address"/i);
  });

  it("à emporter : champs adresse et quartier absents du formulaire", () => {
    const html = renderToStaticMarkup(
      <CheckoutForm formId="f" value={pickup} onChange={() => {}} errors={{}} onSubmit={() => {}} />,
    );
    expect(html).not.toContain('id="checkout-address"');
    expect(html).not.toContain('id="checkout-neighborhood"');
    expect(html).toContain("retirer au restaurant");
  });
});

describe("mode de paiement", () => {
  const filled = { ...delivery, payment: "" as const };

  it("obligatoire, aucun choix par défaut, en livraison comme à emporter", () => {
    expect(EMPTY_CHECKOUT.payment).toBe("");
    expect(validateCheckout(filled)).toEqual({ payment: "Veuillez choisir un mode de paiement." });
    expect(validateCheckout({ ...filled, mode: "pickup" })).toEqual({ payment: "Veuillez choisir un mode de paiement." });
  });

  it("libellé TPE exact", () => {
    const html = renderToStaticMarkup(
      <CheckoutForm formId="f" value={delivery} onChange={() => {}} errors={{}} onSubmit={() => {}} />,
    );
    expect(html).toContain("Carte bancaire");
    expect(html).toContain("Paiement par carte");
    expect(html).toContain("Paiement en espèces");
    expect(html).not.toContain("à la livraison ou au retrait");
  });

  it.each([
    ["cash", "💵 MODE DE PAIEMENT\nPaiement : Espèces\n"],
    ["card", "💳 MODE DE PAIEMENT\nPaiement : Carte bancaire\n"],
  ] as const)("%s : accepté pour les deux modes, dans le message avant la commande", (payment, block) => {
    for (const mode of ["delivery", "pickup"] as const) {
      const info = { ...delivery, mode, payment };
      expect(validateCheckout(info)).toEqual({});
      const msg = buildWhatsappOrderMessage(lines, total, undefined, checkoutDetails(info));
      expect(msg).toContain(`\n\n${block}\n🛍️ COMMANDE\n`);
      expect(msg).toContain(totalLine);
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
  it("livraison : espaces normalisés, lien normalisé, nom complet", () => {
    expect(checkoutDetails(delivery)).toEqual({
      mode: "delivery",
      payment: "card",
      fullName: "Yasmine El Amrani",
      address: "12 rue des Lilas, imm. 4, 2e étage",
      neighborhood: "Polo / Bachkou / Oasis",
      locationUrl: "https://maps.app.goo.gl/abc123",
    });
  });

  it("à emporter : champs de livraison retirés même s'ils avaient été saisis", () => {
    expect(checkoutDetails(pickup)).toEqual({
      mode: "pickup",
      payment: "card",
      fullName: "Yasmine El Amrani",
    });
  });
});

describe("message WhatsApp", () => {
  it("sans coordonnées : identique octet par octet à la référence", () => {
    expect(buildWhatsappOrderMessage(lines, total)).toBe(reference);
    expect(buildWhatsappOrderMessage(lines, total, undefined, undefined)).toBe(reference);
  });

  it("livraison : client, adresse, quartier, localisation, paiement", () => {
    const msg = buildWhatsappOrderMessage(lines, total, undefined, checkoutDetails(delivery));
    const refLines = reference.split("\n");
    const detailStart = refLines.findIndex((l) => l.startsWith("• "));
    expect(msg).toBe(
      [
        ...refLines.slice(0, detailStart),
        "👤 CLIENT",
        "Nom et prénom : Yasmine El Amrani",
        "",
        "📍 LIVRAISON",
        "Mode : Livraison",
        "Adresse : 12 rue des Lilas, imm. 4, 2e étage",
        "Quartier : Polo / Bachkou / Oasis",
        "Localisation : https://maps.app.goo.gl/abc123",
        "",
        "💳 MODE DE PAIEMENT",
        "Paiement : Carte bancaire",
        "",
        "🛍️ COMMANDE",
        "",
        ...refLines.slice(detailStart, refLines.indexOf(totalLine)),
        "Livraison : offerte",
        ...refLines.slice(refLines.indexOf(totalLine)),
      ].join("\n"),
    );
  });

  it("localisation vide omise", () => {
    const msg = buildWhatsappOrderMessage(lines, total, undefined, checkoutDetails({ ...delivery, locationUrl: "" }));
    expect(msg).not.toMatch(/Localisation/);
    expect(msg).toContain("Quartier : Polo / Bachkou / Oasis");
  });

  it("à emporter : mode retrait, ni adresse ni ligne livraison ; total inchangé", () => {
    const msg = buildWhatsappOrderMessage(lines, total, undefined, checkoutDetails(pickup));
    expect(msg).toContain("🏪 RETRAIT\nMode : À emporter (retrait au restaurant)");
    expect(msg).toContain("Nom et prénom : Yasmine El Amrani");
    expect(msg).not.toMatch(/Adresse|Quartier|Livraison/);
    expect(msg).toContain(totalLine);
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

  it("ordre demandé : mode, nom, adresse, quartier, localisation, paiement", () => {
    const html = recap(delivery);
    const order = [
      "Livraison ou à emporter",
      "Nom et prénom",
      "Adresse complète",
      "Quartier",
      "Localisation",
      "Mode de paiement",
    ];
    let prev = -1;
    for (const label of order) {
      const i = html.indexOf(label);
      expect(i, label).toBeGreaterThan(prev);
      prev = i;
    }
    expect(html).toContain("Yasmine El Amrani");
    expect(html).toContain("Polo / Bachkou / Oasis");
    expect(html).toContain("Carte bancaire");
  });

  it("données réelles du panier : produit, variante, quantité × prix unitaire, total", () => {
    const html = recap(delivery);
    expect(html).toContain("Teppanyaki");
    expect(html).toContain("Saumon");
    expect(html).toContain("2 × 89,00 DH");
    expect(html).toContain("178,00 DH");
    expect(html.match(new RegExp(totalAmountLabel.replace(".", "\\."), "g"))).toHaveLength(2);
    expect(html).toContain("Offerte");
    expect(html).toContain("12 rue des Lilas");
    expect(html).toContain('href="https://maps.app.goo.gl/abc123"');
    expect(html).toContain("À régler à la livraison.");
  });

  it("à emporter : pas d'adresse ni de ligne livraison", () => {
    const html = recap(pickup);
    expect(html).toContain("À emporter (retrait au restaurant)");
    expect(html).toContain("Yasmine El Amrani");
    expect(html).not.toMatch(/12 rue des Lilas|Offerte|Polo \/ Bachkou/);
    expect(html).toContain("À régler au retrait.");
  });

  it("boutons modifier informations et panier présents", () => {
    const html = recap(delivery);
    expect(html).toContain('aria-label="Modifier mes informations"');
    expect(html).toContain('aria-label="Modifier le panier"');
  });
});
