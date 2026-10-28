/**
 * Mémorisation facultative des coordonnées sur l'appareil : choix explicite, champs autorisés
 * seulement, lecture vérifiée, erreurs de stockage sans effet sur la commande, message WhatsApp
 * identique à partir des valeurs du formulaire.
 */
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildWhatsappOrderMessage } from "../src/cart/buildOrderMessage";
import { CartProvider, useCart } from "../src/cart/CartContext";
import { EMPTY_CHECKOUT, checkoutDetails, validateCheckout, type CheckoutInfo } from "../src/cart/checkout";
import {
  SAVED_CHECKOUT_KEY,
  forgetSavedCheckout,
  prefilledCheckout,
  readSavedCheckout,
  saveCheckout,
  type StorageLike,
} from "../src/cart/savedCheckout";
import { CheckoutForm, type CheckoutMemory } from "../src/components/CheckoutSteps";
import { getStaticMenu } from "../src/data/menuSource";
import { cartTotalDh, sampleCartLines } from "./referenceCases";

class MemoryStorage implements StorageLike {
  data = new Map<string, string>();
  getItem(k: string) {
    return this.data.has(k) ? this.data.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
}

/** Stockage qui échoue (quota plein, navigation privée stricte, accès refusé). */
const failing: StorageLike = {
  getItem: () => {
    throw new Error("SecurityError");
  },
  setItem: () => {
    throw new Error("QuotaExceededError");
  },
  removeItem: () => {
    throw new Error("SecurityError");
  },
};

const delivery: CheckoutInfo = {
  mode: "delivery",
  payment: "cash",
  fullName: "  Yasmine  El   Amrani ",
  address: "12 rue des Lilas, imm. 4",
  neighborhood: "Maârif",
  locationUrl: "https://maps.app.goo.gl/abc123",
  phone: "+212 6 12 34 56 78",
};

const stored = (s: MemoryStorage) => JSON.parse(s.getItem(SAVED_CHECKOUT_KEY)!);

describe("enregistrement", () => {
  it("garde uniquement nom, téléphone normalisé, adresse et quartier (ni paiement, ni mode, ni GPS)", () => {
    const s = new MemoryStorage();
    expect(saveCheckout(delivery, s)).toBe(true);
    expect(stored(s)).toEqual({
      v: 1,
      fullName: "Yasmine El Amrani",
      phone: "0612345678",
      address: "12 rue des Lilas, imm. 4",
      neighborhood: "Maârif",
    });
    expect([...s.data.keys()]).toEqual([SAVED_CHECKOUT_KEY]);
    const raw = s.getItem(SAVED_CHECKOUT_KEY)!;
    expect(raw).not.toMatch(/maps|cash|payment|mode|delivery/);
  });

  it("modification : la nouvelle saisie remplace l'ancienne", () => {
    const s = new MemoryStorage();
    saveCheckout(delivery, s);
    saveCheckout({ ...delivery, fullName: "Sara B.", phone: "0700000000", address: "5 bd Anfa", neighborhood: "CIL" }, s);
    expect(readSavedCheckout(s)).toEqual({ fullName: "Sara B.", phone: "0700000000", address: "5 bd Anfa", neighborhood: "CIL" });
  });

  it("à emporter : adresse et quartier déjà mémorisés conservés", () => {
    const s = new MemoryStorage();
    saveCheckout(delivery, s);
    saveCheckout({ ...delivery, mode: "pickup", fullName: "Yasmine A.", address: "", neighborhood: "" }, s);
    expect(readSavedCheckout(s)).toEqual({
      fullName: "Yasmine A.",
      phone: "0612345678",
      address: "12 rue des Lilas, imm. 4",
      neighborhood: "Maârif",
    });
  });

  it("suppression : plus rien sur l'appareil", () => {
    const s = new MemoryStorage();
    saveCheckout(delivery, s);
    forgetSavedCheckout(s);
    expect(s.data.size).toBe(0);
    expect(readSavedCheckout(s)).toBeNull();
  });
});

describe("lecture vérifiée", () => {
  const withRaw = (raw: string) => {
    const s = new MemoryStorage();
    s.setItem(SAVED_CHECKOUT_KEY, raw);
    return s;
  };

  it("première visite : rien d'enregistré, formulaire vide", () => {
    expect(readSavedCheckout(new MemoryStorage())).toBeNull();
    expect(prefilledCheckout(null)).toEqual(EMPTY_CHECKOUT);
  });

  it("préremplissage : téléphone lisible, paiement non choisi, mode livraison", () => {
    const s = new MemoryStorage();
    saveCheckout(delivery, s);
    expect(prefilledCheckout(readSavedCheckout(s))).toEqual({
      ...EMPTY_CHECKOUT,
      fullName: "Yasmine El Amrani",
      phone: "06 12 34 56 78",
      address: "12 rue des Lilas, imm. 4",
      neighborhood: "Maârif",
    });
  });

  it("JSON illisible, tableau, null, version inconnue : effacés et ignorés", () => {
    for (const raw of ["{oops", "[]", "null", '"x"', JSON.stringify({ v: 2, fullName: "A" }), JSON.stringify({ fullName: "A" })]) {
      const s = withRaw(raw);
      expect(readSavedCheckout(s), raw).toBeNull();
      expect(s.data.size, raw).toBe(0);
    }
  });

  it("champs inattendus ignorés, types et formats vérifiés", () => {
    const s = withRaw(
      JSON.stringify({ v: 1, fullName: 42, phone: "123", address: "  3  rue X ", neighborhood: "Paris", token: "secret", cart: [1] }),
    );
    expect(readSavedCheckout(s)).toEqual({ fullName: "", phone: "", address: "3 rue X", neighborhood: "" });
  });

  it("données incomplètes : préremplissage partiel, la commande reste validée normalement", () => {
    const s = withRaw(JSON.stringify({ v: 1, fullName: "Omar" }));
    const info = prefilledCheckout(readSavedCheckout(s));
    expect(info.fullName).toBe("Omar");
    expect(Object.keys(validateCheckout(info)).sort()).toEqual(["address", "neighborhood", "payment", "phone"]);
  });

  it("valeur anormalement longue rejetée", () => {
    const s = withRaw(JSON.stringify({ v: 1, fullName: "A".repeat(301), phone: "0612345678" }));
    expect(readSavedCheckout(s)).toEqual({ fullName: "", phone: "0612345678", address: "", neighborhood: "" });
  });

  it("rien d'utilisable : entrée supprimée", () => {
    const s = withRaw(JSON.stringify({ v: 1, fullName: "   ", phone: "abc" }));
    expect(readSavedCheckout(s)).toBeNull();
    expect(s.data.size).toBe(0);
  });
});

describe("stockage indisponible ou en erreur", () => {
  it("lecture, écriture et suppression ne lèvent jamais d'erreur", () => {
    expect(readSavedCheckout(failing)).toBeNull();
    expect(saveCheckout(delivery, failing)).toBe(false);
    expect(() => forgetSavedCheckout(failing)).not.toThrow();
    expect(readSavedCheckout(null)).toBeNull();
    expect(saveCheckout(delivery, null)).toBe(false);
  });
});

describe("parcours de commande", () => {
  const lines = sampleCartLines(getStaticMenu());
  const total = cartTotalDh(lines);

  it("message WhatsApp : valeurs actuelles du formulaire, total inchangé", () => {
    const s = new MemoryStorage();
    saveCheckout(delivery, s);
    const edited = { ...prefilledCheckout(readSavedCheckout(s)), payment: "card" as const, address: "8 rue Nouvelle" };
    const msg = buildWhatsappOrderMessage(lines, total, undefined, checkoutDetails(edited));
    expect(msg).toContain("8 rue Nouvelle");
    expect(msg).not.toContain("12 rue des Lilas");
    expect(msg).toBe(
      buildWhatsappOrderMessage(lines, total, undefined, checkoutDetails({ ...delivery, payment: "card", address: "8 rue Nouvelle", locationUrl: "" })),
    );
  });

  it("aucune journalisation des coordonnées", () => {
    const code = readFileSync(new URL("../src/cart/savedCheckout.ts", import.meta.url), "utf8");
    expect(code).not.toMatch(/console\./);
    expect(code).not.toMatch(/supabase/i);
  });
});

describe("formulaire", () => {
  const memory = (over: Partial<CheckoutMemory> = {}): CheckoutMemory => ({
    remember: false,
    onRememberChange: () => {},
    prefilled: false,
    onForget: () => {},
    ...over,
  });
  const render = (m?: CheckoutMemory, value: CheckoutInfo = EMPTY_CHECKOUT) =>
    renderToStaticMarkup(<CheckoutForm formId="f" value={value} onChange={() => {}} errors={{}} onSubmit={() => {}} memory={m} />);

  it("case non cochée par défaut, libellé et explication de l'appareil", () => {
    const html = render(memory());
    expect(html).toContain("Mémoriser mes informations pour mes prochaines commandes");
    expect(html).toContain("uniquement sur cet appareil, dans ce navigateur");
    expect(html).toMatch(/<input id="checkout-remember" type="checkbox"(?![^>]*checked)/);
    expect(html).not.toContain("Informations préremplies");
  });

  it("préremplissage : case cochée, indicateur discret et bouton Effacer", () => {
    const html = render(memory({ remember: true, prefilled: true }), prefilledCheckout({ fullName: "Omar", phone: "0612345678", address: "", neighborhood: "" }));
    expect(html).toMatch(/<input id="checkout-remember" type="checkbox"[^>]*checked/);
    expect(html).toContain("Informations préremplies");
    expect(html).toContain(">Effacer</button>");
    expect(html).toContain('value="Omar"');
    expect(html).toContain('value="06 12 34 56 78"');
  });

  it("sans option de mémorisation : formulaire inchangé", () => {
    expect(render()).not.toContain("checkout-remember");
  });
});

describe("CartProvider", () => {
  afterEach(() => vi.unstubAllGlobals());

  function Probe() {
    const { checkout, rememberCheckout, checkoutPrefilled } = useCart();
    return <output>{JSON.stringify({ checkout, rememberCheckout, checkoutPrefilled })}</output>;
  }
  const probe = () =>
    JSON.parse(
      renderToStaticMarkup(
        <CartProvider>
          <Probe />
        </CartProvider>,
      )
        .replace(/^<output>|<\/output>$/g, "")
        .replace(/&quot;/g, '"'),
    );

  it("retour sur le site (navigateur rouvert) : formulaire prérempli, case cochée", () => {
    const s = new MemoryStorage();
    saveCheckout(delivery, s);
    vi.stubGlobal("window", { localStorage: s });
    expect(probe()).toEqual({
      checkout: prefilledCheckout(readSavedCheckout(s)),
      rememberCheckout: true,
      checkoutPrefilled: true,
    });
  });

  it("première visite ou stockage bloqué : formulaire vide, case décochée", () => {
    vi.stubGlobal("window", { localStorage: new MemoryStorage() });
    expect(probe()).toEqual({ checkout: EMPTY_CHECKOUT, rememberCheckout: false, checkoutPrefilled: false });
    vi.stubGlobal("window", {
      get localStorage(): Storage {
        throw new Error("SecurityError");
      },
    });
    expect(probe()).toEqual({ checkout: EMPTY_CHECKOUT, rememberCheckout: false, checkoutPrefilled: false });
  });
});
