/**
 * Kaytôri Club : valeur des points (centimes entiers, aucune erreur flottante),
 * calcul des points à partir d'un ticket selon le barème et l'arrondi,
 * indicateurs calculés depuis les cartes, filtres, inscription au comptoir,
 * actions du responsable contre la VRAIE migration (PGlite), et rendu des pages.
 */
import type { PGlite } from "@electric-sql/pglite";
import { randomBytes, randomUUID } from "node:crypto";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ColumnChart, KpiCard, niceTicks } from "../src/admin/loyalty/components/club";
import { CLIENT_FILTERS, collectCards, filterCards, isRecentVisitor, summarizeCards } from "../src/admin/loyalty/lib/cardStats";
import { createCounterSignup } from "../src/admin/loyalty/lib/counterSignup";
import {
  CONVERSION_EXAMPLES,
  POINT_VALUE_CENTIMES,
  centimesToPoints,
  computeTicketPoints,
  formatCentimes,
  formatPoints,
  parseDirhams,
  parsePointsInput,
  parseTicketInput,
  pointsLabel,
  pointsToCentimes,
  pointsValueLabel,
} from "../src/admin/loyalty/lib/points";
import { fetchCard, fetchHistory, setCardStatus, updateSettings, type SearchItem, type StaffRpc } from "../src/admin/loyalty/lib/staffApi";
import { eventActor } from "../src/admin/loyalty/lib/staffFormat";
import { PointsPage } from "../src/admin/loyalty/pages/PointsPage";
import { RewardsPage } from "../src/admin/loyalty/pages/RewardsPage";
import { StaffContext, type StaffSpace } from "../src/admin/loyalty/StaffContext";
import { viewCard } from "../src/loyalty/lib/api";
import { createPgliteSupabase } from "./helpers/pgliteSupabase";
import { createMigratedDb } from "./helpers/supabaseTestDb";

const nb = (s: string) => s.replace(/\u00a0/g, " ");
const text = (html: string) =>
  nb(
    html
      .replace(/<[^>]+>/g, " ")
      .replace(/&#x27;/g, "'")
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " "),
  );

/* ------------------------------------------------------------------ points */

describe("valeur des points : 1 point = 0,20 DH, en centimes entiers", () => {
  it("conversions données par le restaurant, exactes", () => {
    expect(POINT_VALUE_CENTIMES).toBe(20);
    const expected: Record<number, string> = {
      1: "0,20 DH",
      5: "1 DH",
      50: "10 DH",
      100: "20 DH",
      250: "50 DH",
      500: "100 DH",
      1000: "200 DH",
    };
    for (const n of CONVERSION_EXAMPLES) expect(nb(pointsValueLabel(n)), String(n)).toBe(expected[n]);
    expect(pointsToCentimes(1000)).toBe(20000);
  });

  it("aucune approximation flottante, même sur de grands nombres", () => {
    expect(pointsToCentimes(3)).toBe(60); // 3 × 0,2 en flottant donne 0,6000000000000001
    expect(nb(pointsValueLabel(3))).toBe("0,60 DH");
    expect(nb(pointsValueLabel(1234567))).toBe("246 913,40 DH");
    expect(nb(formatCentimes(-60))).toBe("-0,60 DH");
    expect(() => pointsToCentimes(0.5)).toThrow(RangeError);
    expect(centimesToPoints(1240)).toEqual({ points: 62, remainderCentimes: 0 });
    expect(centimesToPoints(1250)).toEqual({ points: 62, remainderCentimes: 10 });
    expect(nb(formatPoints(85420))).toBe("85 420");
    expect(nb(pointsLabel(1))).toBe("1 point");
    expect(nb(pointsLabel(2))).toBe("2 points");
  });

  it("calcul des points d'un ticket selon le barème et l'arrondi", () => {
    expect(
      computeTicketPoints(18550, {
        earningPoints: 1,
        earningDirhams: 1,
        roundingRule: "floor",
        minTicketCentimes: 1000,
      }),
    ).toEqual({ status: "ok", points: 185, cappedByOrder: false });
    expect(
      computeTicketPoints(18550, {
        earningPoints: 1,
        earningDirhams: 1,
        roundingRule: "nearest",
        minTicketCentimes: 1000,
      }),
    ).toEqual({ status: "ok", points: 186, cappedByOrder: false });
    expect(
      computeTicketPoints(18510, {
        earningPoints: 1,
        earningDirhams: 1,
        roundingRule: "ceil",
        minTicketCentimes: 1000,
      }),
    ).toEqual({ status: "ok", points: 186, cappedByOrder: false });
    expect(
      computeTicketPoints(500, {
        earningPoints: 1,
        earningDirhams: 1,
        roundingRule: "floor",
        minTicketCentimes: 1000,
      }),
    ).toEqual({ status: "below_min", minTicketCentimes: 1000 });
    expect(
      computeTicketPoints(18500, {
        earningPoints: null,
        earningDirhams: null,
        roundingRule: "floor",
        minTicketCentimes: 1000,
      }),
    ).toEqual({ status: "unconfigured" });
  });

  it("saisie du personnel : entier positif, plafonné ; montant ticket validé", () => {
    expect(parsePointsInput(" 1 000 ")).toEqual({ points: 1000 });
    expect(parsePointsInput("12,5")).toHaveProperty("error");
    expect(parsePointsInput("0")).toHaveProperty("error");
    expect(parsePointsInput("-3")).toHaveProperty("error");
    expect(parsePointsInput("")).toHaveProperty("error");
    expect(parsePointsInput("1000001")).toHaveProperty("error");
    expect(parseDirhams("12,40")).toBe(1240);
    expect(parseDirhams("12.4 DH")).toBe(1240);
    expect(parseDirhams("1,234")).toBeNull();
    expect(parseTicketInput("185,50")).toEqual({ centimes: 18550 });
    expect(parseTicketInput("0")).toHaveProperty("error");
  });
});

/* ------------------------------------------------------------------ indicateurs */

const NOW = Date.parse("2026-10-26T12:00:00Z");
let n = 0;
const item = (over: Partial<SearchItem> = {}): SearchItem => ({
  cardId: `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`,
  publicCode: "9TN5D14KYZY2",
  fullName: `Client ${n}`,
  phoneMasked: "06 •• •• 00 01",
  pointsBalance: 80,
  pointsEarnedTotal: 100,
  pointsSpentTotal: 20,
  rewardsRedeemed: 1,
  status: "active",
  lastPointsAt: null,
  lastActivityAt: null,
  createdAt: "2026-10-01T10:00:00Z",
  ...over,
});

describe("indicateurs : uniquement ce que renvoient les cartes", () => {
  it("totaux, cartes récentes, points en circulation, répartition des soldes, dernier passage", () => {
    const items = [
      item({ lastPointsAt: "2026-10-25T10:00:00Z", pointsBalance: 40, pointsEarnedTotal: 40, pointsSpentTotal: 0, rewardsRedeemed: 0 }),
      item({ lastPointsAt: "2026-09-01T10:00:00Z", pointsBalance: 160, pointsEarnedTotal: 210, pointsSpentTotal: 50, rewardsRedeemed: 1 }),
      item({ status: "suspended", pointsBalance: 300, pointsEarnedTotal: 300, pointsSpentTotal: 0, rewardsRedeemed: 0 }),
      item({ lastPointsAt: "2026-10-20T10:00:00Z", pointsBalance: 0, pointsEarnedTotal: 0, pointsSpentTotal: 0, rewardsRedeemed: 0 }),
    ];
    const s = summarizeCards(items, NOW);
    expect(s).toMatchObject({
      total: 4,
      active: 3,
      suspended: 1,
      pointsInCirculation: 500,
      pointsEarnedTotal: 550,
      pointsSpentTotal: 50,
      rewardsRedeemedTotal: 1,
      cardsWithPoints: 3,
      recentVisitors: 2,
      neverVisited: 1,
    });
    expect(s.balanceBrackets.reduce((a, b) => a + b, 0)).toBe(3); // les suspendues ne comptent pas
    expect(s.lastVisitByWeek.reduce((a, w) => a + w.count, 0)).toBe(3);
    expect(s.lastVisitByWeek.at(-1)!.count).toBe(2);
    expect(isRecentVisitor({ lastPointsAt: "pas une date" }, NOW)).toBe(false);
  });

  it("filtres sur la liste affichée", () => {
    const items = [
      item({ lastPointsAt: "2026-10-25T10:00:00Z", pointsBalance: 20 }),
      item({ pointsBalance: 120 }),
      item({ status: "suspended", pointsBalance: 0 }),
    ];
    expect(CLIENT_FILTERS.map((f) => filterCards(items, f.id, NOW).length)).toEqual([3, 2, 1, 1]);
  });

  it("collecte paginée ; plafond signalé (complete = false), rien d'extrapolé", async () => {
    const all = Array.from({ length: 120 }, () => item());
    const calls: number[] = [];
    const rpc: StaffRpc = async (fn, args) => {
      expect(fn).toBe("loyalty_search");
      const offset = args.p_offset as number;
      calls.push(offset);
      const slice = all.slice(offset, offset + 50);
      return { data: { items: slice, limit: 50, offset, hasMore: offset + 50 < all.length }, error: null, status: 200 };
    };
    const full = await collectCards(rpc);
    expect(full).toMatchObject({ complete: true });
    expect(full.items).toHaveLength(120);
    expect(calls).toEqual([0, 50, 100]);
    const capped = await collectCards(rpc, { max: 60 });
    expect(capped).toMatchObject({ complete: false });
    expect(capped.items).toHaveLength(60);
  });
});

/* ------------------------------------------------------------------ contrat réel */

describe("contrat avec la base : comptoir et responsable", () => {
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

  const OWNER = { id: "11111111-1111-1111-1111-111111111111", email: "admin@kaytori.test" };
  const COUNTER = { id: "22222222-2222-2222-2222-222222222222", email: "comptoir@kaytori.test" };
  const asRpc = (c: ReturnType<typeof createPgliteSupabase>): StaffRpc => (fn, args) =>
    c.rpc(fn, args) as unknown as Promise<{ data: unknown; error: { message: string; code?: string } | null }>;

  async function backend() {
    db = await createMigratedDb();
    await db.exec(`
      alter table auth.users add column email text;
      insert into auth.users (id, email) values ('${OWNER.id}', '${OWNER.email}'), ('${COUNTER.id}', '${COUNTER.email}');
      insert into public.admin_users (user_id) values ('${OWNER.id}');
      insert into loyalty.staff (user_id, role) values ('${COUNTER.id}', 'manager');
    `);
    const owner = asRpc(createPgliteSupabase(db, OWNER));
    await updateSettings(owner, { is_active: true, earning_points: 1, earning_dirhams: 1, recent_credit_window_seconds: 0 });
    return { owner, counter: asRpc(createPgliteSupabase(db, COUNTER)), anon: asRpc(createPgliteSupabase(db, null)) };
  }

  it("inscription au comptoir : carte réelle à 0 point, lien fonctionnel, aucun doublon après une réponse perdue", async () => {
    const { counter, anon } = await backend();
    let lose = true;
    const losing: StaffRpc = async (fn, args, signal) => {
      const res = await counter(fn, args, signal);
      if (lose && fn === "loyalty_register") {
        lose = false;
        return { data: null, error: { message: "FetchError: Failed to fetch", code: "" }, status: 0 };
      }
      return res;
    };
    const signup = createCounterSignup(losing, { newToken: () => randomBytes(32).toString("base64url") });
    await expect(
      signup.submit({ fullName: " Salma  Bennani ", phone: "+212 6 12 34 56 78" }, "https://commander.example"),
    ).rejects.toMatchObject({ kind: "network" });
    const done = await signup.submit({ fullName: "Salma Bennani", phone: "06 12 34 56 78" }, "https://commander.example");
    expect(done).toMatchObject({ replayed: true, card: { fullName: "Salma Bennani", pointsBalance: 0, pointsEarnedTotal: 0 } });
    expect((await db!.query<{ n: number }>("select count(*)::int as n from loyalty.cards")).rows).toEqual([{ n: 1 }]);
    const token = done.link.split("#")[1];
    expect((await viewCard(token, { rpc: anon })).fullName).toBe("Salma Bennani");
    const created = (await fetchHistory(counter, done.card.cardId)).items.at(-1)!;
    expect(created).toMatchObject({ kind: "card_created", actorRole: "public", actorEmail: COUNTER.email });
    expect(eventActor(created)).toBe(`le personnel au comptoir (${COUNTER.email})`);
    const other = createCounterSignup(counter);
    await expect(other.submit({ fullName: "Autre Personne", phone: "0612345678" }, "https://x.example")).rejects.toMatchObject({
      code: "KL003",
    });
  });

  it("suspension et réglages : réservés au responsable par la base, motif exigé", async () => {
    const { owner, counter } = await backend();
    const done = await createCounterSignup(counter).submit({ fullName: "Salma Bennani", phone: "0612345678" }, "https://x.example");
    const cardId = done.card.cardId;
    await expect(setCardStatus(counter, { cardId, status: "suspended", reason: "Test", requestId: randomUUID() })).rejects.toMatchObject({
      code: "42501",
    });
    await expect(setCardStatus(owner, { cardId, status: "suspended", reason: " ", requestId: randomUUID() })).rejects.toMatchObject({
      code: "KL010",
    });
    const r = await setCardStatus(owner, { cardId, status: "suspended", reason: "Fraude suspectée", requestId: randomUUID() });
    expect(r.card.status).toBe("suspended");
    expect((await fetchCard(counter, { cardId })).status).toBe("suspended");
    await expect(updateSettings(counter, { earning_points: 2, earning_dirhams: 1 })).rejects.toMatchObject({ code: "42501" });
    expect(await updateSettings(owner, { earning_points: 2, earning_dirhams: 1, min_ticket_centimes: 2000 })).toMatchObject({
      earningPoints: 2,
      earningDirhams: 1,
      minTicketCentimes: 2000,
    });
  });
});

/* ------------------------------------------------------------------ rendu */

const space = (over: Partial<StaffSpace> = {}): StaffSpace => ({
  mode: "account",
  rpc: async () => ({ data: null, error: null }),
  role: "owner",
  identity: "admin@kaytori.test",
  lock: () => {},
  program: {
    isActive: true,
    pointValueCentimes: 20,
    earningPoints: 1,
    earningDirhams: 1,
    roundingRule: "floor",
    minTicketCentimes: 1000,
    maxPointsPerOrder: 5000,
    maxPointsPerDay: null,
    termsSummary: "Conditions générales.",
    rewardLabel: null,
    rewards: [],
    activeRewardsCount: 4,
    rewardsCount: 4,
    role: "owner",
    recentCreditWindowSeconds: 120,
    signupLimitPerHour: 200,
    qrPinConfigured: true,
    qrPinUpdatedAt: "2026-10-01T10:00:00Z",
    qrSessionTtlSeconds: 300,
    updatedAt: "2026-10-01T10:00:00Z",
  },
  reloadProgram: () => {},
  cards: { status: "idle" },
  refreshCards: () => {},
  search: { query: "", page: null },
  setSearch: () => {},
  ...over,
});

describe("rendu des pages d'administration", () => {
  it("indicateur sans donnée : « Non disponible », jamais un zéro", () => {
    const t = text(renderToStaticMarkup(<KpiCard icon={null} label="Points" value={null} note="Donnée indisponible." />));
    expect(t).toContain("Non disponible");
    expect(t).not.toMatch(/\b0\b/);
  });

  it("page Paramètres & Points : barème, valeur du point, code secret QR et simulateur", () => {
    const t = text(
      renderToStaticMarkup(
        <StaffContext.Provider value={space()}>
          <PointsPage />
        </StaffContext.Provider>,
      ),
    );
    expect(t).toContain("Paramètres & Points");
    expect(t).toContain("1 point = 0,20 DH");
    expect(t).toContain("1 000 points");
    expect(t).toContain("200 DH");
    expect(t).toContain("Code secret du parcours rapide QR");
    expect(t).not.toContain("Simulation");
  });

  it("page Récompenses : affiche le catalogue des récompenses et l'action de création", () => {
    const t = text(
      renderToStaticMarkup(
        <StaffContext.Provider value={space()}>
          <RewardsPage />
        </StaffContext.Provider>,
      ),
    );
    expect(t).toContain("Catalogue des récompenses");
    expect(t).toContain("Nouvelle récompense");
    expect(t).toContain("Récompenses actives");
  });

  it("graphique : une série, valeurs dans un tableau pour les lecteurs d'écran ; graduations rondes", () => {
    const html = renderToStaticMarkup(
      <ColumnChart
        caption="Cartes par semaine"
        unit={(v) => `${v} cartes`}
        data={[
          { label: "Semaine 1", short: "S1", value: 3 },
          { label: "Semaine 2", short: "S2", value: 0 },
        ]}
      />,
    );
    expect(html).toContain("<table");
    expect(text(html)).toContain("Semaine 1 3 cartes");
    expect(html).toContain('aria-label="Semaine 2 : 0 cartes"');
    expect(niceTicks(7)).toEqual([0, 2, 4, 6, 8]);
    expect(niceTicks(1)).toEqual([0, 1]);
  });
});
