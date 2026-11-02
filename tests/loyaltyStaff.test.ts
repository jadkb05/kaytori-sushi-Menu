/**
 * Espace du personnel (/admin/fidelite…) :
 * logique pure (routes sans scan, idempotence, erreurs, mise en mots) et contrat RÉEL
 * avec la migration PostgreSQL (PGlite) : recherche, fiche, crédit ticket en points,
 * ajustement de points, récompenses, corrections, nouveau lien, modification client,
 * catalogue de récompenses et code secret QR.
 */
import type { PGlite } from "@electric-sql/pglite";
import { randomBytes, randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCardOperations, cardLink } from "../src/admin/loyalty/lib/cardOperations";
import { createIdempotentAction } from "../src/admin/loyalty/lib/idempotentAction";
import {
  fetchCard,
  fetchHistory,
  fetchStaffProgram,
  fetchStaffRole,
  fetchStaffStats,
  listRewards,
  parseCreditResult,
  parseHistoryEvent,
  parseReward,
  parseSearchPage,
  parseStaffCard,
  saveReward,
  searchCards,
  setQrPin,
  type StaffRpc,
} from "../src/admin/loyalty/lib/staffApi";
import { searchQueryProblem, staffAdvice } from "../src/admin/loyalty/lib/staffErrors";
import {
  customerWhatsappHref,
  eventActor,
  eventDetail,
  formatDateTime,
  isRevertible,
  maskPhone,
  staffPointsSummary,
} from "../src/admin/loyalty/lib/staffFormat";
import { isStaffLoyaltyPath, resolveStaffRoute, staffCardPath } from "../src/admin/loyalty/routes";
import { viewCard, type LoyaltyRpc } from "../src/loyalty/lib/api";
import { LoyaltyError } from "../src/loyalty/lib/errors";
import { createPgliteSupabase } from "./helpers/pgliteSupabase";
import { createMigratedDb } from "./helpers/supabaseTestDb";

const CARD_ID = "0b8f8a52-9f0e-4c56-9d55-3d1b8c0f4a10";
const staffCardJson = (over: Record<string, unknown> = {}) => ({
  cardId: CARD_ID,
  publicCode: "9TN5D14KYZY2",
  fullName: "Salma Bennani",
  phone: "06 12 34 56 78",
  status: "active",
  pointsBalance: 120,
  pointsEarnedTotal: 150,
  pointsSpentTotal: 30,
  rewardsRedeemed: 1,
  stampsTotal: 0,
  pointValueCentimes: 20,
  lastPointsAt: "2026-10-26T10:00:00Z",
  lastActivityAt: "2026-10-26T10:00:00Z",
  tokenVersion: 1,
  tokenIssuedAt: "2026-10-26T10:00:00Z",
  createdAt: "2026-10-26T10:00:00Z",
  ...over,
});

/* ------------------------------------------------------------------ routes */

describe("routes de l'espace du personnel", () => {
  it("reconnaît /admin/fidelite… et seulement lui", () => {
    expect(isStaffLoyaltyPath("/admin/fidelite")).toBe(true);
    expect(isStaffLoyaltyPath("/admin/fidelite/clients/")).toBe(true);
    expect(isStaffLoyaltyPath("/admin/fidelites")).toBe(false);
    expect(isStaffLoyaltyPath("/admin/products")).toBe(false);
    expect(isStaffLoyaltyPath("/fidelite")).toBe(false);
  });

  it("chemin → page ; /admin/fidelite/scan et chemins inconnus redirigent vers /admin/fidelite", () => {
    expect(resolveStaffRoute("/admin/fidelite/")).toEqual({ page: "home" });
    expect(resolveStaffRoute("/admin/fidelite/clients")).toEqual({ page: "clients" });
    expect(resolveStaffRoute(staffCardPath(CARD_ID))).toEqual({ page: "card", cardId: CARD_ID });
    expect(resolveStaffRoute("/admin/fidelite/clients/pas-un-uuid")).toEqual({ page: "redirect", to: "/admin/fidelite/clients" });
    expect(resolveStaffRoute("/admin/fidelite/recompenses")).toEqual({ page: "rewards" });
    expect(resolveStaffRoute("/admin/fidelite/points")).toEqual({ page: "points" });
    expect(resolveStaffRoute("/admin/fidelite/parametres")).toEqual({ page: "points" });
    expect(resolveStaffRoute("/admin/fidelite/scan")).toEqual({ page: "redirect", to: "/admin/fidelite" });
    expect(resolveStaffRoute("/admin/fidelite/scan/9TN5D14KYZY2")).toEqual({ page: "redirect", to: "/admin/fidelite" });
    expect(resolveStaffRoute("/admin/fidelite/autre")).toEqual({ page: "redirect", to: "/admin/fidelite" });
  });
});

/* ------------------------------------------------------------------ idempotence */

describe("envoi unique et nouvel essai", () => {
  const network = () => new LoyaltyError("network");

  it("double clic : un seul envoi, la même promesse", async () => {
    const action = createIdempotentAction<string>(() => "id-1");
    let sends = 0;
    let release!: () => void;
    const send = () => {
      sends += 1;
      return new Promise<string>((r) => (release = () => r("ok")));
    };
    const a = action.run(send);
    const b = action.run(send);
    expect(a).toBe(b);
    expect(action.busy()).toBe(true);
    release();
    await expect(a).resolves.toBe("ok");
    expect(sends).toBe(1);
    expect(action.busy()).toBe(false);
  });

  it("réponse perdue : même identifiant au nouvel essai ; après une réponse : identifiant neuf", async () => {
    let n = 0;
    const action = createIdempotentAction<string>(() => `id-${++n}`);
    const ids: string[] = [];
    await expect(action.run(async (id) => (ids.push(id), Promise.reject(network())))).rejects.toBeInstanceOf(LoyaltyError);
    expect(action.pendingRequestId()).toBe("id-1");
    await action.run(async (id) => (ids.push(id), "ok"));
    await action.run(async (id) => (ids.push(id), "ok"));
    expect(ids).toEqual(["id-1", "id-1", "id-2"]);
  });

  it("refus métier : la demande n'est pas gardée", async () => {
    let n = 0;
    const action = createIdempotentAction<string>(() => `id-${++n}`);
    await expect(action.run(() => Promise.reject(new LoyaltyError("business", "KL007")))).rejects.toMatchObject({ code: "KL007" });
    expect(action.pendingRequestId()).toBeNull();
  });
});

/* ------------------------------------------------------------------ erreurs et saisie */

describe("erreurs et recherche : messages exploitables", () => {
  it("chaque refus de la base donne une explication et la suite", () => {
    expect(staffAdvice(new LoyaltyError("network"))).toMatchObject({ action: "retry" });
    expect(staffAdvice(new LoyaltyError("unavailable", "42501")).title).toBe("Accès refusé");
    expect(staffAdvice(new LoyaltyError("business", "KL009")).message).toMatch(/points ont déjà été utilisés/i);
    expect(staffAdvice(new LoyaltyError("business", "KL010"))).toMatchObject({ field: "reason" });
    expect(staffAdvice(new LoyaltyError("business", "KL006")).title).toBe("Carte suspendue");
    expect(staffAdvice(new LoyaltyError("business", "KL004")).message).toMatch(/récompenses déjà gagnées restent utilisables/);
    expect(staffAdvice(new Error("boom")).action).toBe("reload");
    for (const code of ["KL001", "KL002", "KL003", "KL005", "KL007", "KL008", "KL011", "KL012", "KL013", "KL014", "KL015", "KL016"]) {
      expect(staffAdvice(new LoyaltyError("business", code)).title, code).not.toBe("Opération non aboutie");
    }
  });

  it("pré-contrôle de la recherche aligné sur loyalty_search", () => {
    expect(searchQueryProblem("")).toBeNull();
    expect(searchQueryProblem("06")).toBe("Saisissez au moins 3 chiffres du numéro.");
    expect(searchQueryProblem("+21")).toBe("Saisissez au moins 3 chiffres du numéro.");
    expect(searchQueryProblem("061")).toBeNull();
    expect(searchQueryProblem("é")).toBe("Saisissez au moins 2 lettres du nom.");
    expect(searchQueryProblem("Sa")).toBeNull();
    expect(searchQueryProblem("x".repeat(81))).toBe("Recherche trop longue.");
  });

  it("réponses malformées : refusées avant usage", () => {
    expect(() => parseStaffCard({ ...staffCardJson(), pointsBalance: -1 })).toThrow(LoyaltyError);
    expect(() => parseStaffCard({ ...staffCardJson(), cardId: "1" })).toThrow(/fiche/);
    expect(() => parseSearchPage({ items: [{ fullName: "X" }], limit: 20, offset: 0, hasMore: false })).toThrow(/recherche/);
    expect(() => parseSearchPage(null)).toThrow(LoyaltyError);
    expect(() => parseCreditResult({ status: "ok", replayed: false, eventId: null, pointsAdded: 10, card: staffCardJson() })).toThrow();
    expect(() => parseHistoryEvent({ eventId: CARD_ID, seq: 1, kind: "unknown_kind" })).toThrow(/historique/);
    expect(() => parseReward({ id: CARD_ID, name: "X", pointsCost: 0 })).toThrow(/récompense/);
    const item = parseSearchPage({
      items: [
        {
          cardId: CARD_ID,
          publicCode: "9TN5D14KYZY2",
          fullName: "Salma",
          phoneMasked: "06 •• •• 56 78",
          pointsBalance: 120,
          pointsEarnedTotal: 120,
          pointsSpentTotal: 0,
          rewardsRedeemed: 0,
          status: "active",
          lastPointsAt: null,
          lastActivityAt: null,
          createdAt: "2026-10-26T10:00:00Z",
          phone: "0612345678",
        },
      ],
      limit: 20,
      offset: 0,
      hasMore: false,
    }).items[0];
    expect(JSON.stringify(item)).not.toContain("0612345678");
  });
});

describe("mise en mots", () => {
  it("résumé des points, numéro masqué, dates de Casablanca", () => {
    const s = staffPointsSummary({ pointsBalance: 120, pointsEarnedTotal: 150, pointsSpentTotal: 30, pointValueCentimes: 20 });
    expect(s.balanceText.replace(/\u00a0/g, " ")).toBe("120 points");
    expect(s.valueText.replace(/\u00a0/g, " ")).toBe("24 DH");
    expect(s.hasPoints).toBe(true);
    expect(staffPointsSummary({ pointsBalance: 0, pointsEarnedTotal: 0, pointsSpentTotal: 0, pointValueCentimes: 20 }).hint).toBe(
      "Aucun point cumulé pour l'instant.",
    );
    expect(maskPhone("06 12 34 56 78")).toBe("06 •• •• •• 78");
    expect(formatDateTime("2026-10-26T13:05:00Z", new Date("2026-10-26T20:00:00Z"))).toMatch(/^aujourd'hui à 1[34]:05$/);
    expect(formatDateTime("2026-10-25T13:05:00Z", new Date("2026-10-26T20:00:00Z"))).toMatch(/^hier à 1[34]:05$/);
    expect(formatDateTime("pas une date")).toBe("date inconnue");
  });

  it("WhatsApp : message prérempli vers le numéro du client, lien encodé ; rien n'est envoyé", () => {
    const link = cardLink("https://commander.example", "A".repeat(43));
    const href = customerWhatsappHref("06 12 34 56 78", link)!;
    expect(href.startsWith("https://api.whatsapp.com/send?phone=212612345678&text=")).toBe(true);
    const text = new URL(href).searchParams.get("text")!;
    expect(text).toContain("Conservez-le et évitez de le partager.");
    expect(text).toContain(`https://commander.example/fidelite/carte#${"A".repeat(43)}`);
    expect(customerWhatsappHref("05 22 00 00 00", link)).toBeNull();
  });
});

/* ------------------------------------------------------------------ contrat réel (PGlite) */

describe("contrat avec la base (migration réelle, compte du personnel)", () => {
  let db: PGlite | null = null;
  const fetchCalls: unknown[] = [];
  beforeEach(() => {
    vi.stubGlobal("fetch", (...args: unknown[]) => {
      fetchCalls.push(args);
      throw new Error("réseau interdit pendant les tests");
    });
  });
  afterEach(async () => {
    vi.unstubAllGlobals();
    expect(fetchCalls).toEqual([]);
    await db?.close();
    db = null;
  });

  const ADMIN = { id: "11111111-1111-1111-1111-111111111111", email: "admin@kaytori.test" };
  const MANAGER = { id: "22222222-2222-2222-2222-222222222222", email: "comptoir@kaytori.test" };
  const STRANGER = { id: "44444444-4444-4444-4444-444444444444", email: "inconnu@kaytori.test" };

  const asRpc = (client: ReturnType<typeof createPgliteSupabase>): StaffRpc => (fn, args) =>
    client.rpc(fn, args) as unknown as Promise<{ data: unknown; error: { message: string; code?: string } | null }>;

  async function backend(settings: Record<string, unknown> = {}) {
    db = await createMigratedDb();
    await db.exec(`
      alter table auth.users add column email text;
      insert into auth.users (id, email) values ('${ADMIN.id}', '${ADMIN.email}'), ('${MANAGER.id}', '${MANAGER.email}'), ('${STRANGER.id}', '${STRANGER.email}');
      insert into public.admin_users (user_id) values ('${ADMIN.id}');
      insert into loyalty.staff (user_id, role) values ('${MANAGER.id}', 'manager');
    `);
    const admin = createPgliteSupabase(db, ADMIN);
    await admin.rpc("loyalty_update_settings", {
      p_changes: {
        is_active: true,
        earning_points: 1,
        earning_dirhams: 1,
        rounding_rule: "floor",
        min_ticket_centimes: 1000,
        recent_credit_window_seconds: 0,
        ...settings,
      },
    });
    const adminRpc = asRpc(admin);
    await saveReward(adminRpc, {
      name: "Boisson fraîche offerte",
      description: "Thé glacé maison",
      pointsCost: 50,
      conditions: "Sur place ou à emporter",
      isActive: true,
      sortOrder: 10,
    });
    const anon = createPgliteSupabase(db, null);
    const publicRpc: LoyaltyRpc = asRpc(anon);
    const register = async (name: string, phone: string) => {
      const token = randomBytes(32).toString("base64url");
      const res = await anon.rpc("loyalty_register", {
        p_full_name: name,
        p_phone: phone,
        p_token: token,
        p_request_id: randomUUID(),
      });
      expect(res.error).toBeNull();
      const card = await fetchCard(adminRpc, {
        publicCode: (res.data as { card: { publicCode: string } }).card.publicCode,
      });
      return { token, card };
    };
    return {
      rpc: asRpc(createPgliteSupabase(db, MANAGER)),
      adminRpc,
      stranger: asRpc(createPgliteSupabase(db, STRANGER)),
      anonRpc: asRpc(anon),
      publicRpc,
      admin,
      register,
    };
  }

  const count = async (sql: string) => (await db!.query<{ n: number }>(sql)).rows[0].n;

  it("rôles : manager reconnu ; compte sans droit et public : refusés par la base", async () => {
    const { rpc, stranger, anonRpc } = await backend();
    expect(await fetchStaffRole(rpc)).toBe("manager");
    expect(await fetchStaffRole(stranger)).toBeNull();
    expect((await fetchStaffProgram(rpc)).recentCreditWindowSeconds).toBe(0);
    await expect(searchCards(stranger, "")).rejects.toMatchObject({ code: "42501" });
    await expect(searchCards(anonRpc, "")).rejects.toMatchObject({ code: "42501" });
    expect(staffAdvice(await searchCards(stranger, "").catch((e) => e)).title).toBe("Accès refusé");
  });

  it("recherche par nom, par numéro, aucun résultat, plusieurs pages ; numéros masqués", async () => {
    const { rpc, register } = await backend();
    await register("Salma Bennani", "0612345678");
    await register("Salim Alaoui", "0698765432");
    for (let i = 0; i < 4; i += 1) await register(`Client Fictif ${String.fromCharCode(65 + i)}`, `06110000${10 + i}`);
    expect((await searchCards(rpc, "bennani")).items.map((i) => i.fullName)).toEqual(["Salma Bennani"]);
    expect((await searchCards(rpc, "SAL")).items.map((i) => i.fullName).sort()).toEqual(["Salim Alaoui", "Salma Bennani"]);
    const byPhone = await searchCards(rpc, "06 98 76");
    expect(byPhone.items.map((i) => i.fullName)).toEqual(["Salim Alaoui"]);
    expect(byPhone.items[0].phoneMasked).toBe("06 •• •• 54 32");
    expect((await searchCards(rpc, "zzz")).items).toEqual([]);
    const first = await searchCards(rpc, "fictif", { limit: 3 });
    expect(first).toMatchObject({ hasMore: true });
    expect(first.items).toHaveLength(3);
    const next = await searchCards(rpc, "fictif", { limit: 3, offset: 3 });
    expect(next).toMatchObject({ hasMore: false });
    expect(next.items).toHaveLength(1);
    await expect(searchCards(rpc, "06")).rejects.toMatchObject({ code: "KL013" });
    expect(JSON.stringify(await searchCards(rpc, ""))).not.toMatch(/0612345678|12 34 56/);
  });

  it("QR : le code public ouvre la fiche pour le personnel, jamais le jeton ; il n'ouvre rien au public", async () => {
    const { rpc, register, publicRpc } = await backend();
    const { token, card } = await register("Salma Bennani", "0612345678");
    const viaCode = await fetchCard(rpc, { publicCode: card.publicCode.toLowerCase().replace(/(.{4})/g, "$1 ") });
    expect(viaCode.cardId).toBe(card.cardId);
    expect(JSON.stringify(viaCode)).not.toContain(token);
    expect(JSON.stringify(await fetchHistory(rpc, card.cardId))).not.toContain(token);
    await expect(fetchCard(rpc, { publicCode: "ZZZZZZZZZZZZ" })).rejects.toMatchObject({ code: "KL005" });
    await expect(viewCard(card.publicCode, { rpc: publicRpc })).rejects.toMatchObject({ code: "KL005" });
  });

  it("crédit ticket : double clic = un seul crédit ; réponse perdue puis nouvel essai = aucun doublon", async () => {
    const { rpc, register } = await backend();
    const { card } = await register("Salma Bennani", "0612345678");
    const ops = createCardOperations(rpc, card.cardId);
    const [a, b] = await Promise.all([
      ops.creditTicket({ ticketCentimes: 12000, orderRef: "CMD-101" }),
      ops.creditTicket({ ticketCentimes: 12000, orderRef: "CMD-101" }),
    ]);
    expect(a).toBe(b);
    expect(a).toMatchObject({ status: "ok", replayed: false, pointsAdded: 120, card: { pointsBalance: 120 } });

    let lose = true;
    const losing: StaffRpc = async (fn, args, signal) => {
      const res = await rpc(fn, args, signal);
      if (lose) {
        lose = false;
        return { data: null, error: { message: "FetchError: Failed to fetch", code: "" }, status: 0 };
      }
      return res;
    };
    const flaky = createCardOperations(losing, card.cardId);
    await expect(flaky.creditTicket({ ticketCentimes: 8000, orderRef: "CMD-102" })).rejects.toMatchObject({ kind: "network" });
    const retried = await flaky.creditTicket({ ticketCentimes: 8000, orderRef: "CMD-102" });
    expect(retried).toMatchObject({ status: "ok", replayed: true, pointsAdded: 80, card: { pointsBalance: 200 } });
    expect(await count("select count(*)::int as n from loyalty.events where kind = 'points_credited'")).toBe(2);
  });

  it("crédit rapproché : rien n'est enregistré sans la confirmation demandée par la base", async () => {
    const { rpc, register } = await backend({ recent_credit_window_seconds: 120 });
    const { card } = await register("Salma Bennani", "0612345678");
    const ops = createCardOperations(rpc, card.cardId);
    await ops.creditTicket({ ticketCentimes: 10000 });
    const second = await ops.creditTicket({ ticketCentimes: 10000 });
    expect(second).toMatchObject({ status: "confirm_recent", card: { pointsBalance: 100 } });
    expect(await count("select count(*)::int as n from loyalty.events where kind = 'points_credited'")).toBe(1);
    expect(await ops.creditTicket({ ticketCentimes: 10000, confirmRecent: true })).toMatchObject({
      status: "ok",
      card: { pointsBalance: 200 },
    });
  });

  it("récompense : échange déduit les points ; solde insuffisant → refus KL007", async () => {
    const { rpc, register } = await backend();
    const { card } = await register("Salma Bennani", "0612345678");
    const ops = createCardOperations(rpc, card.cardId);
    const rewards = await listRewards(rpc);
    const boisson = rewards.find((r) => r.pointsCost === 50)!;

    await expect(ops.redeem(boisson.id)).rejects.toMatchObject({ code: "KL007" });
    await ops.creditTicket({ ticketCentimes: 6000 }); // 60 pts
    const [a, b] = await Promise.all([ops.redeem(boisson.id), ops.redeem(boisson.id)]);
    expect(a).toBe(b);
    expect(a.card).toMatchObject({ pointsBalance: 10, pointsSpentTotal: 50 });
    await expect(ops.redeem(boisson.id)).rejects.toMatchObject({ code: "KL007" });
    expect(await count("select count(*)::int as n from loyalty.events where kind = 'reward_redeemed'")).toBe(1);
  });

  it("corrections : motif exigé, une seule fois, refus si solde deviendrait négatif, historique complet et lié", async () => {
    const { rpc, register } = await backend();
    const { card } = await register("Salma Bennani", "0612345678");
    const ops = createCardOperations(rpc, card.cardId);
    const rewards = await listRewards(rpc);
    const boisson = rewards.find((r) => r.pointsCost === 50)!;

    const cred = (await ops.creditTicket({ ticketCentimes: 6000, orderRef: "CMD-500" })) as { eventId: string };
    const redeemed = await ops.redeem(boisson.id);

    await expect(ops.revert(cred.eventId, " ")).rejects.toMatchObject({ code: "KL010" });
    // Solde actuel = 10 pts, annuler +60 pts rendrait le solde à -50 -> KL009
    await expect(ops.revert(cred.eventId, "Ajouté deux fois")).rejects.toMatchObject({ code: "KL009" });

    const undoRedeem = await ops.revert(redeemed.eventId!, "Récompense enregistrée à tort");
    expect(undoRedeem.card).toMatchObject({ pointsBalance: 60, pointsSpentTotal: 0 });

    const undoCredit = await ops.revert(cred.eventId, "Ajouté deux fois");
    expect(undoCredit.card).toMatchObject({ pointsBalance: 0, pointsEarnedTotal: 0 });
    await expect(ops.revert(cred.eventId, "Encore")).rejects.toMatchObject({ code: "KL008" });

    const history = (await fetchHistory(rpc, card.cardId, { limit: 50 })).items;
    const original = history.find((e) => e.eventId === cred.eventId)!;
    expect(isRevertible(original)).toBe(false);
    const correction = history.find((e) => e.revertsEventId === cred.eventId)!;
    expect(correction).toMatchObject({ kind: "points_reverted", reason: "Ajouté deux fois", actorEmail: MANAGER.email });
    expect(original.revertedByEventId).toBe(correction.eventId);
    expect(eventActor(correction)).toBe(MANAGER.email);
    expect(history.at(-1)).toMatchObject({ kind: "card_created", actorRole: "public" });
    expect(eventActor(history.at(-1)!)).toBe("le client");
  });

  it("catalogue de récompenses, code secret QR et indicateurs : CRUD complet par le responsable", async () => {
    const { adminRpc, rpc } = await backend();
    const items = await saveReward(adminRpc, {
      name: "Gyoza poulet (6 pcs)",
      description: "Croustillants",
      pointsCost: 110,
      conditions: "Sur place",
      isActive: true,
      sortOrder: 15,
    });
    const created = items.find((r) => r.name === "Gyoza poulet (6 pcs)")!;
    expect(created.name).toBe("Gyoza poulet (6 pcs)");
    expect(created.pointsCost).toBe(110);

    await setQrPin(adminRpc, "908172");
    const prog = await fetchStaffProgram(rpc);
    expect(prog.qrPinConfigured).toBe(true);

    const stats = await fetchStaffStats(rpc);
    expect(stats.activeRewardsCount).toBeGreaterThanOrEqual(2);
  });

  it("nouveau lien : l'ancien cesse de fonctionner, le nouveau ouvre la carte ; réponse perdue → même jeton rejoué", async () => {
    const { rpc, register, publicRpc } = await backend();
    const { token: oldToken, card } = await register("Salma Bennani", "0612345678");
    let lose = true;
    const losing: StaffRpc = async (fn, args, signal) => {
      const res = await rpc(fn, args, signal);
      if (lose) {
        lose = false;
        return { data: null, error: { message: "FetchError: Failed to fetch", code: "" }, status: 0 };
      }
      return res;
    };
    const ops = createCardOperations(losing, card.cardId, { newToken: () => randomBytes(32).toString("base64url") });
    await expect(ops.reissue("Nouveau téléphone", "https://commander.example")).rejects.toMatchObject({ kind: "network" });
    const done = await ops.reissue("Nouveau téléphone", "https://commander.example");
    expect(done.replayed).toBe(true);
    expect(done.card.tokenVersion).toBe(2);
    const newToken = done.link.split("#")[1];
    expect(done.link.startsWith("https://commander.example/fidelite/carte#")).toBe(true);
    await expect(viewCard(oldToken, { rpc: publicRpc })).rejects.toMatchObject({ code: "KL005" });
    expect((await viewCard(newToken, { rpc: publicRpc })).fullName).toBe("Salma Bennani");
    const history = (await fetchHistory(rpc, card.cardId)).items;
    expect(history.filter((e) => e.kind === "access_reissued")).toHaveLength(1);
    expect(eventDetail(history[0])).toBe("lien n° 2 ; les liens précédents ne fonctionnent plus");
    expect(JSON.stringify(history)).not.toContain(newToken);
  });

  it("modification : motif exigé, doublon refusé, avant / après tracé avec numéros masqués", async () => {
    const { rpc, register } = await backend();
    const { card } = await register("Salma Bennani", "0612345678");
    await register("Autre Client", "0698765432");
    const ops = createCardOperations(rpc, card.cardId);
    await expect(ops.update({ full_name: "Salma B." }, "")).rejects.toMatchObject({ code: "KL010" });
    await expect(ops.update({ phone: "06 98 76 54 32" }, "Erreur de saisie")).rejects.toMatchObject({ code: "KL003" });
    const updated = await ops.update(
      { full_name: "Salma Bennani-Tazi", phone: "0611223344" },
      "Erreur de saisie à l'inscription",
    );
    expect(updated.card).toMatchObject({ fullName: "Salma Bennani-Tazi", phone: "06 11 22 33 44" });
    expect((await ops.update({ full_name: "Salma Bennani-Tazi" }, "Rien")).status).toBe("unchanged");
    const event = (await fetchHistory(rpc, card.cardId)).items.find((e) => e.kind === "customer_updated")!;
    expect(eventDetail(event)).toBe(
      "nom : Salma Bennani → Salma Bennani-Tazi ; numéro : 06 •• •• •• 78 → 06 •• •• •• 44",
    );
  });

  it("carte suspendue : crédit ticket et récompense refusés par la base", async () => {
    const { rpc, register, admin } = await backend();
    const { card } = await register("Salma Bennani", "0612345678");
    const rewards = await listRewards(rpc);
    await admin.rpc("loyalty_set_card_status", {
      p_card_id: card.cardId,
      p_status: "suspended",
      p_reason: "Démonstration",
      p_request_id: randomUUID(),
    });
    const ops = createCardOperations(rpc, card.cardId);
    expect((await fetchCard(rpc, { cardId: card.cardId })).status).toBe("suspended");
    await expect(ops.creditTicket({ ticketCentimes: 10000 })).rejects.toMatchObject({ code: "KL006" });
    await expect(ops.redeem(rewards[0].id)).rejects.toMatchObject({ code: "KL006" });
  });
});
