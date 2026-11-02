/**
 * Carte de fidélité côté client : logique pure (jeton, stockage, erreurs, réponses,
 * formulaire, progression en points, QR, routes) et contrat réel avec la migration (PGlite).
 */
import type { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizeMoroccanPhone } from "../src/cart/checkout";
import * as publicApi from "../src/loyalty/lib/api";
import {
  clientRedeemReward,
  fetchProgram,
  parsePublicCard,
  registerCard,
  viewCard,
  type LoyaltyRpc,
  type PublicCard,
} from "../src/loyalty/lib/api";
import {
  LoyaltyError,
  cardAdvice,
  classifyRpcError,
  endsPendingRegistration,
  registrationAdvice,
} from "../src/loyalty/lib/errors";
import { describePointsProgress, newlyGainedPoints } from "../src/loyalty/lib/progress";
import { formatPublicCode, isPublicCode, qrModules, qrOrigin, qrPath, scanUrl } from "../src/loyalty/lib/qr";
import { pendingFor, sendRegistration, submitRegistration } from "../src/loyalty/lib/registration";
import {
  INITIAL_SIGNUP,
  cleanFullName,
  confirmationSummary,
  signupReducer,
  validateFullName,
  validatePhone,
  type SignupState,
} from "../src/loyalty/lib/signupForm";
import {
  PENDING_TTL_MS,
  clearPending,
  forgetCard,
  readPending,
  readSavedToken,
  readSeen,
  savePending,
  saveSeen,
  saveToken,
  type StorageLike,
} from "../src/loyalty/lib/storage";
import { generateAccessToken, generateRequestId, isAccessToken, isRequestId } from "../src/loyalty/lib/token";
import { isLoyaltyPath, resolveLoyaltyRoute } from "../src/loyalty/routes";
import { createPgliteSupabase } from "./helpers/pgliteSupabase";
import { createMigratedDb } from "./helpers/supabaseTestDb";

function memoryStorage(initial: Record<string, string> = {}): StorageLike & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

const CARD: PublicCard = {
  fullName: "Salma Bennani",
  phoneMasked: "06 •• •• •• 78",
  publicCode: "9TN5D14KYZY2",
  status: "active",
  pointsBalance: 180,
  pointsEarnedTotal: 180,
  pointsSpentTotal: 0,
  pointValueCentimes: 20,
  earningPoints: 1,
  earningDirhams: 2,
  roundingRule: "floor",
  minTicketCentimes: 0,
  maxPointsPerOrder: null,
  maxPointsPerDay: null,
  termsSummary: null,
  rewardsRedeemed: 0,
  programActive: true,
  lastPointsAt: "2026-10-26T10:00:00Z",
  lastActivityAt: "2026-10-26T10:00:00Z",
  createdAt: "2026-10-26T10:00:00Z",
  rewards: [
    {
      id: "00000000-0000-4000-8000-000000000001",
      name: "Dessert Signature",
      description: "Mochi glacé artisanal",
      pointsCost: 150,
      conditions: "Sur place ou à emporter",
      imageUrl: null,
      sortOrder: 10,
      available: true,
      pointsMissing: 0,
    },
    {
      id: "00000000-0000-4000-8000-000000000002",
      name: "Assortiment 8 pièces",
      description: "Création du chef",
      pointsCost: 250,
      conditions: null,
      imageUrl: null,
      sortOrder: 20,
      available: false,
      pointsMissing: 70,
    },
  ],
  history: [],
};

/* ------------------------------------------------------------------ jeton et requête */

describe("jeton d'accès et identifiant de requête", () => {
  it("jeton : 32 octets du générateur cryptographique → 43 caractères base64url", () => {
    const spy = vi.spyOn(globalThis.crypto, "getRandomValues");
    const token = generateAccessToken();
    expect(spy).toHaveBeenCalledWith(expect.any(Uint8Array));
    expect((spy.mock.calls[0][0] as Uint8Array).length).toBe(32);
    spy.mockRestore();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(isAccessToken(token)).toBe(true);
    for (const bad of ["", "x", "a".repeat(42), "a".repeat(44), "a".repeat(42) + "=", null, 12]) {
      expect(isAccessToken(bad)).toBe(false);
    }
  });

  it("identifiant de requête : UUID v4 valide", () => {
    const id = generateRequestId();
    expect(isRequestId(id)).toBe(true);
  });
});

/* ------------------------------------------------------------------ stockage local */

describe("stockage sur l'appareil", () => {
  it("carte : gardée, relue, retirée ; valeur corrompue supprimée", () => {
    const s = memoryStorage();
    const token = generateAccessToken();
    expect(readSavedToken(s)).toBeNull();
    saveToken(token, s, 1);
    expect(readSavedToken(s)).toBe(token);
    saveSeen({ publicCode: "9TN5D14KYZY2", pointsBalance: 180 }, s);
    forgetCard(s);
    expect(readSavedToken(s)).toBeNull();
    expect(readSeen(s)).toBeNull();

    for (const corrupt of ["{pas du json", JSON.stringify({ token: "court" }), JSON.stringify(["x"]), JSON.stringify(null)]) {
      const bad = memoryStorage({ "kaytori.loyalty.card.v1": corrupt });
      expect(readSavedToken(bad)).toBeNull();
      expect(bad.data.has("kaytori.loyalty.card.v1")).toBe(false);
    }
  });

  it("dernier solde vu : valeurs invalides ignorées", () => {
    const s = memoryStorage({ "kaytori.loyalty.seen.v2": JSON.stringify({ publicCode: "X", pointsBalance: -1 }) });
    expect(readSeen(s)).toBeNull();
    saveSeen({ publicCode: "9TN5D14KYZY2", pointsBalance: 120 }, s);
    expect(readSeen(s)).toEqual({ publicCode: "9TN5D14KYZY2", pointsBalance: 120 });
  });

  it("inscription en cours : conservée 24 h au plus", () => {
    const s = memoryStorage();
    const pending = {
      token: generateAccessToken(),
      requestId: generateRequestId(),
      fullName: "Salma",
      phone: "0612345678",
      startedAt: 1000,
    };
    savePending(pending, s);
    expect(readPending(s, 1000 + 60_000)).toEqual(pending);
    expect(readPending(s, 1000 + PENDING_TTL_MS)).toBeNull();
    clearPending(s);
    expect(readPending(s, 1000)).toBeNull();
  });
});

/* ------------------------------------------------------------------ erreurs */

describe("erreurs → message et prochaine action", () => {
  it("classement : codes métier, service absent, réseau, délai, imprévu", () => {
    expect(classifyRpcError({ message: "x", code: "KL003" }, 400, false)).toMatchObject({
      kind: "business",
      code: "KL003",
    });
    expect(classifyRpcError({ message: "permission denied", code: "42501" }, 401, false).kind).toBe("unavailable");
    expect(classifyRpcError({ message: "FetchError: Failed to fetch", code: "" }, 0, false).kind).toBe("network");
    expect(classifyRpcError({ message: "AbortError: aborted", code: "" }, 0, true).kind).toBe("timeout");
  });

  it("inscription et carte : messages clairs", () => {
    expect(registrationAdvice(new LoyaltyError("business", "KL003")).action).toBe("recover");
    expect(endsPendingRegistration(new LoyaltyError("business", "KL003"))).toBe(true);
    expect(endsPendingRegistration(new LoyaltyError("network"))).toBe(false);
    expect(cardAdvice(new LoyaltyError("business", "KL005")).action).toBe("recover");
  });
});

/* ------------------------------------------------------------------ appels et réponses */

describe("appels publics : réponses vérifiées et isolation", () => {
  it("réponse malformée rejetée", () => {
    expect(parsePublicCard(CARD)).toEqual(CARD);
    for (const bad of [
      null,
      [],
      { ...CARD, pointsBalance: -1 },
      { ...CARD, pointValueCentimes: 0 },
      { ...CARD, status: "deleted" },
    ]) {
      expect(() => parsePublicCard(bad)).toThrow(LoyaltyError);
    }
  });

  it("aucun fichier de l'espace client n'appelle une fonction réservée à l'administration", () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const f of readdirSync(dir)) {
        const p = `${dir}/${f}`;
        if (statSync(p).isDirectory()) {
          if (f !== "dev") walk(p);
        } else files.push(p);
      }
    };
    walk(new URL("../src/loyalty", import.meta.url).pathname);
    const source = files.map((f) => readFileSync(f, "utf8")).join("\n");
    for (const staffFn of [
      "loyalty_credit_ticket",
      "loyalty_adjust_points",
      "loyalty_redeem_reward",
      "loyalty_revert_event",
      "loyalty_reissue_access",
      "loyalty_update_customer",
      "loyalty_set_card_status",
      "loyalty_update_settings",
      "loyalty_set_qr_pin",
      "loyalty_search",
      "loyalty_card_detail",
      "loyalty_card_history",
      "loyalty_reconcile",
    ]) {
      expect(source, staffFn).not.toContain(staffFn);
    }
    expect(source).not.toMatch(/service_role|SERVICE_ROLE/);
    expect(source).not.toMatch(/console\.(log|info|debug)/);
    expect(typeof publicApi.viewCard).toBe("function");
    expect(typeof publicApi.clientRedeemReward).toBe("function");
  });
});

/* ------------------------------------------------------------------ formulaire */

describe("formulaire : validation et étapes", () => {
  it("nom et téléphone validés proprement", () => {
    expect(cleanFullName("  Élodie   Ben-Ali  ")).toBe("Élodie Ben-Ali");
    expect(validateFullName("Élodie Ben-Ali")).toBeUndefined();
    expect(validateFullName("12")).toBeDefined();
    expect(validatePhone("06 12 34 56 78")).toBeUndefined();
    expect(validatePhone("05 22 00 00 00")).toBeDefined();
    expect(confirmationSummary({ fullName: " Salma  B ", phone: "+212612345678" })).toEqual({
      fullName: "Salma B",
      phone: "06 12 34 56 78",
    });
  });

  const typed = (fullName: string, phone: string): SignupState => ({
    ...INITIAL_SIGNUP,
    values: { fullName, phone },
  });

  it("transition vers le récapitulatif et soumission unique", () => {
    const confirm = signupReducer(typed("Salma Bennani", "0612345678"), { type: "review" });
    expect(confirm.step).toBe("confirm");
    const sending = signupReducer(confirm, { type: "submit" });
    expect(sending.step).toBe("submitting");
    expect(signupReducer(sending, { type: "submit" })).toBe(sending);
  });
});

/* ------------------------------------------------------------------ progression en points */

describe("progression en points et paliers de récompenses", () => {
  it("calcule la contre-valeur, les récompenses disponibles et le prochain palier", () => {
    const p0 = describePointsProgress({ ...CARD, pointsBalance: 0 });
    expect(p0.eligibleRewards).toHaveLength(0);
    expect(p0.nextReward?.reward.name).toBe("Dessert Signature");
    expect(p0.nextReward?.missingPoints).toBe(150);
    expect(p0.hint).toMatch(/cumuler vos premiers points/i);

    const p180 = describePointsProgress(CARD);
    expect(p180.eligibleRewards).toHaveLength(1);
    expect(p180.nextReward?.reward.name).toBe("Assortiment 8 pièces");
    expect(p180.nextReward?.missingPoints).toBe(70);
    expect(p180.valueLabel.replace(/\s/g, " ")).toBe("36 DH");

    expect(newlyGainedPoints({ publicCode: "AAAA", pointsBalance: 180 }, { publicCode: "AAAA", pointsBalance: 120 })).toBe(60);
    expect(newlyGainedPoints({ publicCode: "AAAA", pointsBalance: 180 }, null)).toBe(0);
  });
});

/* ------------------------------------------------------------------ QR et routes */

describe("QR code et routes", () => {
  it("URL du QR : code public uniquement", () => {
    expect(scanUrl("9TN5D14KYZY2", "https://commander.example")).toBe(
      "https://commander.example/fidelite/scan/9TN5D14KYZY2",
    );
    expect(isPublicCode("9TN5D14KYZY2")).toBe(true);
    expect(formatPublicCode("9TN5D14KYZY2")).toBe("9TN5 D14K YZY2");
    expect(qrOrigin({ VITE_LOYALTY_QR_ORIGIN: "https://kaytori.example/chemin" }, undefined)).toBe(
      "https://kaytori.example",
    );
    const modules = qrModules("https://commander.example/fidelite/scan/9TN5D14KYZY2");
    expect(modules.length).toBeGreaterThanOrEqual(25);
    expect(qrPath(modules)).toMatch(/^M0 0h7v1h-7z/);
  });

  it("routes /fidelite isolées", () => {
    for (const p of ["/fidelite", "/fidelite/", "/fidelite/carte", "/fidelite/scan/ABC"]) {
      expect(isLoyaltyPath(p), p).toBe(true);
    }
    expect(resolveLoyaltyRoute("/fidelite/scan/9TN5D14KYZY2")).toEqual({
      page: "scan",
      publicCode: "9TN5D14KYZY2",
    });
  });
});

/* ------------------------------------------------------------------ contrat réel (PGlite) */

describe("contrat avec la base (migration réelle, rôle public)", () => {
  let db: PGlite | null = null;
  afterEach(async () => {
    await db?.close();
    db = null;
  });

  const ADMIN = { id: "11111111-1111-1111-1111-111111111111", email: "admin@kaytori.test" };

  async function backend({ open = true } = {}) {
    db = await createMigratedDb();
    await db.exec(
      `insert into auth.users (id) values ('${ADMIN.id}'); insert into public.admin_users (user_id) values ('${ADMIN.id}');`,
    );
    const admin = createPgliteSupabase(db, ADMIN);
    if (open) {
      await admin.rpc("loyalty_update_settings", {
        p_changes: { is_active: true, earning_points: 1, earning_dirhams: 2 },
      });
    }
    const anon = createPgliteSupabase(db, null);
    const rpc: LoyaltyRpc = (fn, args) =>
      anon.rpc(fn, args) as unknown as Promise<{
        data: unknown;
        error: { message: string; code?: string } | null;
      }>;
    return { admin, anon, rpc };
  }

  it("programme fermé : lu tel quel, inscription refusée", async () => {
    const { rpc } = await backend({ open: false });
    expect(await fetchProgram({ rpc })).toMatchObject({
      isActive: false,
      pointValueCentimes: 20,
      rewards: [],
    });
    const storage = memoryStorage();
    await expect(
      submitRegistration({ fullName: "Salma Bennani", phone: "0612345678" }, { rpc, storage }),
    ).rejects.toMatchObject({ code: "KL004" });
  });

  it("création, consultation et échange de récompense par le client", async () => {
    const { admin, rpc } = await backend();
    const rewardRes = await admin.rpc("loyalty_save_reward", {
      p_reward: { name: "Mochi Glacé", points_cost: 100, is_active: true, sort_order: 10 },
      p_request_id: generateRequestId(),
    });
    const rewardId = (rewardRes.data as { items: { id: string; name: string }[] }).items.find(
      (r) => r.name === "Mochi Glacé",
    )!.id;

    const storage = memoryStorage();
    const created = await submitRegistration(
      { fullName: "  Élodie  Ben-Ali ", phone: "+212 6 98 76 54 32" },
      { rpc, storage },
    );
    expect(created.card).toMatchObject({
      fullName: "Élodie Ben-Ali",
      phoneMasked: "06 •• •• •• 32",
      pointsBalance: 0,
      pointValueCentimes: 20,
    });

    // Crédit de 150 points (ticket de 300 DH) par l'admin
    const detail = await admin.rpc("loyalty_card_detail", { p_public_code: created.card.publicCode });
    const cardId = (detail.data as { cardId: string }).cardId;
    await admin.rpc("loyalty_credit_ticket", {
      p_card_id: cardId,
      p_ticket_centimes: 30000,
      p_order_ref: "CMD-77",
      p_request_id: generateRequestId(),
      p_confirm_recent: true,
    });

    // Échange par la cliente depuis son espace
    const redeemed = await clientRedeemReward(
      { token: created.token, rewardId, requestId: generateRequestId() },
      { rpc },
    );
    expect(redeemed.redemption.redemptionCode).toMatch(/^KR-[0-9A-Z]{6}$/);
    expect(redeemed.card.pointsBalance).toBe(50);

    const view = await viewCard(created.token, { rpc });
    expect(view.pointsBalance).toBe(50);
    expect(view.history.map((h) => h.kind)).toEqual(["reward_redeemed", "points_credited", "card_created"]);
  });

  it("réponse perdue après une création réussie : la reprise retrouve la même carte", async () => {
    const { rpc } = await backend();
    const storage = memoryStorage();
    const losing: LoyaltyRpc = async (fn, args, signal) => {
      await rpc(fn, args, signal);
      return { data: null, error: { message: "FetchError: Failed to fetch", code: "" }, status: 0 };
    };
    await expect(
      submitRegistration({ fullName: "Salma Bennani", phone: "0612345678" }, { rpc: losing, storage }),
    ).rejects.toMatchObject({ kind: "network" });
    const pending = readPending(storage)!;
    const resumed = await sendRegistration(pending, { rpc, storage });
    expect(resumed).toMatchObject({ replayed: true, token: pending.token });
  });
});
