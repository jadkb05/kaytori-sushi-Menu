/**
 * Mémorisation automatique des coordonnées sur l'appareil : sans case à cocher, « Effacer » en
 * haut du formulaire, champs autorisés seulement, lecture vérifiée, erreurs de stockage sans effet sur la commande, message WhatsApp
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
  restoreSavedCheckout,
  saveCheckout,
  type DurableStore,
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
    prefilled: false,
    onForget: () => {},
    ...over,
  });
  const render = (m?: CheckoutMemory, value: CheckoutInfo = EMPTY_CHECKOUT) =>
    renderToStaticMarkup(<CheckoutForm formId="f" value={value} onChange={() => {}} errors={{}} onSubmit={() => {}} memory={m} />);

  it("aucune case à cocher ; mention discrète de la mémorisation sur l'appareil", () => {
    const html = render(memory());
    expect(html).not.toContain('type="checkbox"');
    expect(html).not.toContain("Mémoriser mes informations");
    expect(html).toContain("mémorisés uniquement sur cet appareil, dans ce navigateur");
    expect(html).not.toContain("Informations préremplies");
    expect(html).not.toContain(">Effacer</button>");
  });

  it("préremplissage : indicateur et « Effacer » en haut, avant le premier champ", () => {
    const html = render(memory({ prefilled: true }), prefilledCheckout({ fullName: "Omar", phone: "0612345678", address: "", neighborhood: "" }));
    expect(html).not.toContain('type="checkbox"');
    expect(html).toContain("Informations préremplies");
    expect(html.indexOf(">Effacer</button>")).toBeGreaterThan(0);
    expect(html.indexOf(">Effacer</button>")).toBeLessThan(html.indexOf('id="checkout-fullName"'));
    expect(html).toContain('value="Omar"');
    expect(html).toContain('value="06 12 34 56 78"');
  });

  it("sans option de mémorisation : ni mention ni indicateur", () => {
    expect(render()).not.toContain("checkout-memory-note");
  });
});

describe("CartProvider", () => {
  afterEach(() => vi.unstubAllGlobals());

  function Probe() {
    const { checkout, checkoutPrefilled } = useCart();
    return <output>{JSON.stringify({ checkout, checkoutPrefilled })}</output>;
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

  it("retour sur le site (navigateur rouvert) : formulaire prérempli", () => {
    const s = new MemoryStorage();
    saveCheckout(delivery, s);
    vi.stubGlobal("window", { localStorage: s });
    expect(probe()).toEqual({
      checkout: prefilledCheckout(readSavedCheckout(s)),
      checkoutPrefilled: true,
    });
  });

  it("première visite ou stockage bloqué : formulaire vide", () => {
    vi.stubGlobal("window", { localStorage: new MemoryStorage() });
    expect(probe()).toEqual({ checkout: EMPTY_CHECKOUT, checkoutPrefilled: false });
    vi.stubGlobal("window", {
      get localStorage(): Storage {
        throw new Error("SecurityError");
      },
    });
    expect(probe()).toEqual({ checkout: EMPTY_CHECKOUT, checkoutPrefilled: false });
  });
});

/**
 * Fermeture et réouverture du navigateur. Le « disque » survit aux sessions ; comme dans Chrome,
 * une écriture localStorage n'y arrive qu'après coup (fermeture normale), et elle est perdue si
 * le navigateur est arrêté de force avant. La copie durable (IndexedDB « strict ») y est écrite
 * aussitôt. Chaque session repart d'objets neufs : rien n'est partagé en mémoire JavaScript.
 */
describe("fermeture et réouverture du navigateur", () => {
  class Disk {
    local = new Map<string, string>();
    durable: unknown = undefined;
    durableAvailable = true;
  }
  class BrowserSession {
    readonly storage: MemoryStorage;
    readonly durable: DurableStore;
    constructor(private disk: Disk) {
      this.storage = new MemoryStorage();
      this.storage.data = new Map(disk.local);
      this.durable = {
        read: async () => {
          if (!disk.durableAvailable) throw new Error("IndexedDB indisponible");
          return structuredClone(disk.durable);
        },
        write: async (record) => {
          if (!disk.durableAvailable) throw new Error("IndexedDB indisponible");
          disk.durable = structuredClone(record);
        },
      };
    }
    /** Fermeture normale : localStorage écrit sur le disque. */
    quit() {
      this.disk.local = new Map(this.storage.data);
    }
    /** Arrêt forcé (appli balayée, processus tué) avant l'écriture différée de localStorage. */
    kill() {}
  }
  /** Laisse s'exécuter les écritures durables lancées sans attente. */
  const settle = () => new Promise((r) => setTimeout(r, 0));

  /** Nouvelle visite : nouvelle application (contexte React neuf) puis restauration au chargement. */
  async function visit(session: BrowserSession) {
    vi.stubGlobal("window", { localStorage: session.storage });
    const first = probeProvider();
    const restored = await restoreSavedCheckout(session.storage, session.durable);
    return { first, restored, form: restored === undefined ? first.checkout : prefilledCheckout(restored) };
  }
  function probeProvider() {
    function Probe() {
      const { checkout, checkoutPrefilled } = useCart();
      return <output>{JSON.stringify({ checkout, checkoutPrefilled })}</output>;
    }
    const html = renderToStaticMarkup(
      <CartProvider>
        <Probe />
      </CartProvider>,
    );
    return JSON.parse(html.replace(/^<output>|<\/output>$/g, "").replace(/&quot;/g, '"')) as {
      checkout: CheckoutInfo;
      checkoutPrefilled: boolean;
    };
  }
  afterEach(() => vi.unstubAllGlobals());

  const expected = {
    ...EMPTY_CHECKOUT,
    fullName: "Yasmine El Amrani",
    phone: "06 12 34 56 78",
    address: "12 rue des Lilas, imm. 4",
    neighborhood: "Maârif",
  };

  it("enregistrement puis fermeture normale : prérempli à la réouverture", async () => {
    const disk = new Disk();
    const s1 = new BrowserSession(disk);
    expect(saveCheckout(delivery, s1.storage, s1.durable)).toBe(true);
    await settle();
    s1.quit();
    const { first, form } = await visit(new BrowserSession(disk));
    expect(first).toEqual({ checkout: expected, checkoutPrefilled: true });
    expect(form).toEqual(expected);
  });

  it("arrêt forcé juste après la confirmation (cas signalé) : coordonnées restaurées depuis la copie durable", async () => {
    const disk = new Disk();
    const s1 = new BrowserSession(disk);
    saveCheckout(delivery, s1.storage, s1.durable);
    await settle();
    s1.kill();
    expect(disk.local.size).toBe(0); // la cause : écriture localStorage jamais arrivée sur le disque

    const s2 = new BrowserSession(disk);
    const { first, restored, form } = await visit(s2);
    expect(first.checkoutPrefilled).toBe(false); // lecture synchrone : localStorage vide
    expect(restored).toEqual({ fullName: "Yasmine El Amrani", phone: "0612345678", address: "12 rue des Lilas, imm. 4", neighborhood: "Maârif" });
    expect(form).toEqual(expected);
    // localStorage est réécrit : la visite suivante est préremplie dès le premier rendu.
    s2.quit();
    const third = await visit(new BrowserSession(disk));
    expect(third.first).toEqual({ checkout: expected, checkoutPrefilled: true });
    expect(third.restored).toBeUndefined();
  });

  it("modification puis arrêt forcé : la nouvelle valeur l'emporte sur l'ancienne restée dans localStorage", async () => {
    const disk = new Disk();
    const s1 = new BrowserSession(disk);
    saveCheckout(delivery, s1.storage, s1.durable);
    await settle();
    s1.quit();
    const s2 = new BrowserSession(disk);
    saveCheckout({ ...delivery, fullName: "Sara B.", address: "5 bd Anfa" }, s2.storage, s2.durable);
    await settle();
    s2.kill();
    const { first, form } = await visit(new BrowserSession(disk));
    expect(first.checkout.fullName).toBe("Yasmine El Amrani"); // ancienne valeur sur le disque
    expect(form).toEqual({ ...expected, fullName: "Sara B.", address: "5 bd Anfa" });
  });

  it("« Effacer » puis arrêt forcé : les coordonnées ne réapparaissent pas", async () => {
    const disk = new Disk();
    const s1 = new BrowserSession(disk);
    saveCheckout(delivery, s1.storage, s1.durable);
    await settle();
    s1.quit();
    const s2 = new BrowserSession(disk);
    forgetSavedCheckout(s2.storage, s2.durable);
    await settle();
    s2.kill();
    expect(disk.local.size).toBe(1); // suppression localStorage perdue
    const s3 = new BrowserSession(disk);
    const { restored } = await visit(s3);
    expect(restored).toBeNull();
    expect(s3.storage.data.size).toBe(0);
    expect(JSON.stringify(disk.durable)).not.toMatch(/Yasmine|0612|Lilas/);
  });

  it("« Effacer » puis fermeture normale : formulaire vide, plus de préremplissage", async () => {
    const disk = new Disk();
    const s1 = new BrowserSession(disk);
    saveCheckout(delivery, s1.storage, s1.durable);
    await settle();
    s1.quit();
    const s2 = new BrowserSession(disk);
    forgetSavedCheckout(s2.storage, s2.durable); // « Effacer »
    await settle();
    s2.quit();
    const { first, restored } = await visit(new BrowserSession(disk));
    expect(first).toEqual({ checkout: EMPTY_CHECKOUT, checkoutPrefilled: false });
    expect(restored).toBeUndefined();
  });

  it("après « Effacer », nouvelle commande : nouvelles coordonnées mémorisées automatiquement, les anciennes ne reviennent pas", async () => {
    const disk = new Disk();
    const s1 = new BrowserSession(disk);
    saveCheckout(delivery, s1.storage, s1.durable);
    await settle();
    s1.quit();
    const s2 = new BrowserSession(disk);
    forgetSavedCheckout(s2.storage, s2.durable);
    // Nouvelle saisie en « à emporter » : l'ancienne adresse effacée n'est pas reprise.
    saveCheckout({ ...EMPTY_CHECKOUT, mode: "pickup", payment: "cash", fullName: "Sara B.", phone: "0700000000" }, s2.storage, s2.durable);
    await settle();
    s2.kill();
    const { form } = await visit(new BrowserSession(disk));
    expect(form).toEqual({ ...EMPTY_CHECKOUT, fullName: "Sara B.", phone: "07 00 00 00 00" });
  });

  it("mémorisation automatique : chaque commande envoyée enregistre les coordonnées, sans condition", () => {
    const cartSource = readFileSync(new URL("../src/cart/CartContext.tsx", import.meta.url), "utf8");
    expect(cartSource).toMatch(/const persistCheckout = useCallback\(\(\) => \{\s*saveCheckout\(checkout\);\s*\}, \[checkout\]\);/);
    const review = readFileSync(new URL("../src/components/OrderReview.tsx", import.meta.url), "utf8");
    const confirm = review.slice(review.indexOf("const confirm = () =>"));
    expect(confirm.indexOf("persistCheckout();")).toBeGreaterThan(confirm.indexOf("const url = whatsappOrderUrlWith"));
    expect(confirm.indexOf("persistCheckout();")).toBeLessThan(confirm.indexOf("window.open(url"));
  });

  it("panier vidé ou commande envoyée : les coordonnées mémorisées restent", async () => {
    const disk = new Disk();
    const s1 = new BrowserSession(disk);
    saveCheckout(delivery, s1.storage, s1.durable);
    await settle();
    // La réinitialisation du panier ne touche qu'à l'état en mémoire, jamais au stockage.
    const cartSource = readFileSync(new URL("../src/cart/CartContext.tsx", import.meta.url), "utf8");
    expect(cartSource).toMatch(/const clear = useCallback\(\(\) => setLines\(\[\]\), \[\]\);/);
    s1.quit();
    expect((await visit(new BrowserSession(disk))).form).toEqual(expected);
  });

  it("mémorisation antérieure à la copie durable : conservée et recopiée", async () => {
    const disk = new Disk();
    disk.local.set(SAVED_CHECKOUT_KEY, JSON.stringify({ v: 1, fullName: "Omar", phone: "0612345678", address: "1 rue X", neighborhood: "CIL" }));
    const s1 = new BrowserSession(disk);
    const { first, restored } = await visit(s1);
    expect(first.checkout.fullName).toBe("Omar");
    expect(restored).toBeUndefined();
    await settle();
    expect(disk.durable).toEqual({ v: 1, fullName: "Omar", phone: "0612345678", address: "1 rue X", neighborhood: "CIL" });
  });

  it("copie durable invalide : ignorée, localStorage fait foi", async () => {
    for (const bad of [{ v: 9, fullName: "X" }, "oops", [1], { v: 1, fullName: 3, phone: "x" }]) {
      const disk = new Disk();
      disk.durable = bad;
      disk.local.set(SAVED_CHECKOUT_KEY, JSON.stringify({ v: 1, fullName: "Omar" }));
      const { first, restored } = await visit(new BrowserSession(disk));
      expect(first.checkout.fullName, JSON.stringify(bad)).toBe("Omar");
      expect(restored, JSON.stringify(bad)).toBeUndefined();
    }
  });

  it("copie durable indisponible : comportement localStorage seul, sans erreur", async () => {
    const disk = new Disk();
    disk.durableAvailable = false;
    const s1 = new BrowserSession(disk);
    expect(saveCheckout(delivery, s1.storage, s1.durable)).toBe(true);
    await settle();
    s1.quit();
    const { first, restored } = await visit(new BrowserSession(disk));
    expect(first.checkout).toEqual(expected);
    expect(restored).toBeUndefined();
  });

  it("localStorage bloqué : la copie durable suffit à préremplir", async () => {
    const disk = new Disk();
    const s1 = new BrowserSession(disk);
    saveCheckout(delivery, failing, s1.durable);
    await settle();
    expect(await restoreSavedCheckout(failing, new BrowserSession(disk).durable)).toEqual({
      fullName: "Yasmine El Amrani",
      phone: "0612345678",
      address: "12 rue des Lilas, imm. 4",
      neighborhood: "Maârif",
    });
  });

  it("le client agit pendant la restauration : rien n'est écrit ni appliqué", async () => {
    const disk = new Disk();
    const s1 = new BrowserSession(disk);
    saveCheckout(delivery, s1.storage, s1.durable);
    await settle();
    s1.kill();
    const s2 = new BrowserSession(disk);
    expect(await restoreSavedCheckout(s2.storage, s2.durable, () => true)).toBeUndefined();
    expect(s2.storage.data.size).toBe(0);
  });

  it("le fournisseur n'applique la restauration que si le formulaire est intact", () => {
    const cartSource = readFileSync(new URL("../src/cart/CartContext.tsx", import.meta.url), "utf8");
    expect(cartSource).toMatch(/const stale = \(\) => !active \|\| touched\.current;/);
    for (const fn of ["setCheckout", "forgetCheckout"]) {
      const body = cartSource.slice(cartSource.indexOf(`const ${fn} = useCallback`)).split("}, [")[0];
      expect(body, fn).toContain("touched.current = true;");
    }
  });
});
