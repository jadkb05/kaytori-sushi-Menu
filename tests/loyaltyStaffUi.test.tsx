/**
 * Écrans de l'espace du personnel (rendu statique) :
 * fiche client en points, bandeau de résultat, historique et corrections, listes et tableaux,
 * état du programme, navigation sobre sans "Scanner une carte", et page QR manager (/fidelite/scan/:code).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CardHero } from "../src/admin/loyalty/components/CardHero";
import { customerChanges, reasonProblem } from "../src/admin/loyalty/components/CardSheets";
import { CardRow, ClientsTable } from "../src/admin/loyalty/components/CardRow";
import { HistoryList } from "../src/admin/loyalty/components/HistoryList";
import { STAFF_NAV } from "../src/admin/loyalty/components/StaffLayout";
import type { HistoryEvent, StaffCard, StaffProgram } from "../src/admin/loyalty/lib/staffApi";
import { ResultBanner } from "../src/admin/loyalty/pages/StaffCardPage";
import { ProgramNotice } from "../src/admin/loyalty/pages/StaffHomePage";
import { cleanPublicCode, QrPinStep, QrTicketFormStep, QrSuccessStep } from "../src/loyalty/pages/ScanPage";

const noop = () => {};
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ");

const card = (over: Partial<StaffCard> = {}): StaffCard => ({
  cardId: "0b8f8a52-9f0e-4c56-9d55-3d1b8c0f4a10",
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
  lastPointsAt: "2026-10-26T12:00:00Z",
  lastActivityAt: "2026-10-26T12:00:00Z",
  tokenVersion: 1,
  tokenIssuedAt: "2026-10-01T12:00:00Z",
  createdAt: "2026-10-01T12:00:00Z",
  ...over,
});

const defaultStaffProgram = (over: Partial<StaffProgram> = {}): StaffProgram => ({
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
  role: "manager",
  recentCreditWindowSeconds: 120,
  signupLimitPerHour: 200,
  qrPinConfigured: true,
  qrPinUpdatedAt: "2026-10-01T12:00:00Z",
  qrSessionTtlSeconds: 300,
  updatedAt: "2026-10-01T12:00:00Z",
  ...over,
});

let seq = 100;
const ev = (over: Partial<HistoryEvent>): HistoryEvent => ({
  eventId: `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`,
  seq: seq--,
  kind: "points_credited",
  pointsDelta: 120,
  pointsBalanceAfter: 120,
  ticketAmountCentimes: 12000,
  orderRef: "CMD-101",
  rewardId: null,
  rewardName: null,
  redemptionCode: null,
  createdAt: "2026-10-26T12:00:00Z",
  actorRole: "manager",
  actorEmail: "comptoir@kaytori.test",
  reason: null,
  revertsEventId: null,
  relatedEventId: null,
  revertedByEventId: null,
  stampsTotalAfter: null,
  rewardsRedeemedAfter: null,
  details: {},
  ...over,
});

describe("navigation de l'administration fidélité", () => {
  it("contient 4 rubriques claires et ne contient plus « Scanner une carte »", () => {
    const labels = STAFF_NAV.map((n) => n.label);
    expect(labels).toEqual(["Tableau de bord", "Clients", "Récompenses", "Paramètres & Points"]);
    expect(STAFF_NAV.some((n) => /scan/i.test(n.href) || /scan/i.test(n.label))).toBe(false);
  });
});

describe("fiche client : en-tête", () => {
  it("solde de points, valeur en DH et cumul tels que renvoyés par la base ; numéro masqué par défaut", () => {
    const t = text(renderToStaticMarkup(<CardHero card={card()} />));
    expect(t).toContain("Salma Bennani");
    expect(t).toContain("120 points");
    expect(t).toContain("24 DH");
    expect(t).toContain("150 points");
    expect(t).toContain("30 points");
    expect(t).toContain("06 •• •• •• 78");
    expect(t).not.toContain("06 12 34 56 78");
    expect(t).toContain("9TN5 D14K YZY2");
    expect(t).not.toMatch(/tampon|cerisier/i);
  });

  it("carte à 0 point ou suspendue : états affichés clairement", () => {
    const empty = text(
      renderToStaticMarkup(<CardHero card={card({ pointsBalance: 0, pointsEarnedTotal: 0, pointsSpentTotal: 0 })} />),
    );
    expect(empty).toContain("0 point");
    expect(empty).toContain("Aucun point cumulé pour l'instant.");
    expect(text(renderToStaticMarkup(<CardHero card={card({ status: "suspended" })} />))).toContain("Carte suspendue");
  });

  it("bandeau de résultat : points crédités, annulation proposée", () => {
    const t = text(
      renderToStaticMarkup(
        <ResultBanner
          banner={{
            tone: "points",
            title: "+120 pts crédités",
            message: "Nouveau solde : 120 pts (24 DH).",
            undo: { eventId: "x", kind: "points_credited", label: "Annuler ce crédit" },
          }}
          disabled={false}
          onUndo={noop}
          onDismiss={noop}
        />,
      ),
    );
    expect(t).toContain("+120 pts crédités");
    expect(t).toContain("Annuler ce crédit");
  });
});

describe("historique", () => {
  it("vide : message neutre", () => {
    expect(text(renderToStaticMarkup(<HistoryList items={[]} onRevert={noop} disabled={false} />))).toContain(
      "Aucune opération enregistrée.",
    );
  });

  it("avec corrections : original conservé et marqué, correction liée, « Corriger » seulement si possible", () => {
    const cred = ev({ kind: "points_credited", pointsDelta: 100, pointsBalanceAfter: 100 });
    const correction = ev({
      kind: "points_reverted",
      pointsDelta: -100,
      pointsBalanceAfter: 0,
      revertsEventId: cred.eventId,
      reason: "Ticket saisi deux fois",
    });
    cred.revertedByEventId = correction.eventId;
    const other = ev({ kind: "points_credited", pointsDelta: 80, pointsBalanceAfter: 80 });
    const redeemed = ev({
      kind: "reward_redeemed",
      pointsDelta: -50,
      pointsBalanceAfter: 30,
      rewardName: "Boisson fraîche offerte",
      redemptionCode: "KR-123456",
    });
    const created = ev({
      kind: "card_created",
      pointsDelta: 0,
      pointsBalanceAfter: 0,
      actorRole: "public",
      actorEmail: null,
    });
    const reissued = ev({
      kind: "access_reissued",
      pointsDelta: 0,
      pointsBalanceAfter: 30,
      actorEmail: null,
      actorRole: "owner",
      details: { tokenVersion: 2 },
    });
    const items = [reissued, redeemed, other, correction, cred, created];
    const html = renderToStaticMarkup(
      <HistoryList items={items} onRevert={noop} disabled={false} now={new Date("2026-10-26T20:00:00Z")} />,
    );
    const t = text(html);
    expect(t).toContain("Opération de points annulée (correction)");
    expect(t).toContain("Motif : Ticket saisi deux fois");
    expect(t).toContain("Corrige : points crédités (ticket)");
    expect(t).toContain("Corrigée");
    expect(html).toContain(`href="#operation-${correction.eventId}"`);
    expect(t).toContain("par le client");
    expect(t).toContain("par un responsable");
    expect(t).toContain("lien n° 2");
    expect(t.match(/Corriger/g)).toHaveLength(2);
  });
});

describe("listes et accueil", () => {
  it("ligne de recherche et tableau : nom, numéro masqué, solde de points, valeur DH, suspension", () => {
    const item = {
      cardId: card().cardId,
      publicCode: "9TN5D14KYZY2",
      fullName: "Salma Bennani",
      phoneMasked: "06 •• •• 56 78",
      pointsBalance: 120,
      pointsEarnedTotal: 150,
      pointsSpentTotal: 30,
      rewardsRedeemed: 1,
      status: "suspended" as const,
      lastPointsAt: null,
      lastActivityAt: null,
      createdAt: "2026-10-01T12:00:00Z",
    };
    const rowText = text(
      renderToStaticMarkup(
        <ul>
          <CardRow item={item} pointValueCentimes={20} />
        </ul>,
      ),
    );
    expect(rowText).toContain("06 •• •• 56 78");
    expect(rowText).toContain("120 points");
    expect(rowText).toContain("24 DH");
    expect(rowText).toContain("Suspendue");

    const tableText = text(renderToStaticMarkup(<ClientsTable items={[item]} pointValueCentimes={20} />));
    expect(tableText).toContain("Salma Bennani");
    expect(tableText).toContain("120 points");
  });

  it("programme : fermé ou barème non configuré signalés ; ouvert et complet : rien", () => {
    const closed = text(
      renderToStaticMarkup(
        <ProgramNotice
          program={defaultStaffProgram({
            isActive: false,
            earningPoints: null,
            earningDirhams: null,
          })}
        />,
      ),
    );
    expect(closed).toContain("Programme fermé");
    expect(closed).toContain("taux d'attribution des points par dirham dépensé n'est pas encore configuré");
    expect(renderToStaticMarkup(<ProgramNotice program={defaultStaffProgram()} />)).toBe("");
  });
});

describe("saisies du personnel", () => {
  it("code saisi à la main : nettoyé comme par la base", () => {
    expect(cleanPublicCode(" 9tn5-d14k yzy2 ")).toBe("9TN5D14KYZY2");
    expect(cleanPublicCode("OIL")).toBe("011");
  });

  it("modification : seuls les champs changés sont envoyés ; numéro normalisé ; motif exigé", () => {
    const c = card();
    expect(customerChanges(c, { fullName: " Salma  Bennani ", phone: "+212 6 12 34 56 78" })).toEqual({
      changes: {},
      errors: {},
    });
    expect(customerChanges(c, { fullName: "Salma Tazi", phone: "06 12 34 56 78" }).changes).toEqual({
      full_name: "Salma Tazi",
    });
    expect(customerChanges(c, { fullName: "Salma Bennani", phone: "0611223344" }).changes).toEqual({
      phone: "0611223344",
    });
    expect(customerChanges(c, { fullName: "1", phone: "0512" }).errors).toMatchObject({
      fullName: expect.any(String),
      phone: expect.any(String),
    });
    expect(reasonProblem("  ")).not.toBeNull();
    expect(reasonProblem("Erreur")).toBeNull();
  });
});

describe("parcours QR manager (/fidelite/scan/:code) : étapes visuelles", () => {
  it("étape 1 (PIN), étape 2 (formulaire ticket) sans numéro de téléphone, étape 3 (confirmation)", () => {
    const pinHtml = renderToStaticMarkup(
      <QrPinStep
        publicCode="9TN5D14KYZY2"
        initialLockSeconds={0}
        hasSavedCard={false}
        onUnlocked={noop}
        onBlocked={noop}
      />,
    );
    expect(pinHtml).toContain('type="password"');
    expect(text(pinHtml)).toContain("Code secret du manager");

    const unlockedCard = {
      publicCode: "9TN5D14KYZY2",
      fullName: "Salma Bennani",
      status: "active" as const,
      pointsBalance: 120,
      pointValueCentimes: 20,
    };
    const program = {
      pointValueCentimes: 20,
      earningPoints: 1,
      earningDirhams: 1,
      roundingRule: "floor" as const,
      minTicketCentimes: 1000,
      maxPointsPerOrder: 5000,
      maxPointsPerDay: null,
    };

    const formHtml = renderToStaticMarkup(
      <QrTicketFormStep
        publicCode="9TN5D14KYZY2"
        sessionToken="tok"
        card={unlockedCard}
        program={program}
        onSessionExpired={noop}
        onSuccess={noop}
        onCancel={noop}
      />,
    );
    const formText = text(formHtml);
    expect(formText).toContain("Salma Bennani");
    expect(formText).toContain("120 pts");
    expect(formText).toContain("Montant total du ticket (DH)");
    expect(formText).not.toMatch(/06 12|06 ••/);

    const successHtml = renderToStaticMarkup(
      <QrSuccessStep
        result={{
          status: "ok",
          replayed: false,
          eventId: "ev1",
          pointsAdded: 185,
          newBalance: 305,
          pointValueCentimes: 20,
          ticketCentimes: 18500,
          orderRef: "CMD-77",
          card: {
            ...unlockedCard,
            pointsBalance: 305,
          },
        }}
        onFinish={noop}
      />,
    );
    const successText = text(successHtml);
    expect(successText).toContain("+185 points");
    expect(successText).toContain("305 points");
    expect(successText).toContain("Terminer");
  });
});

describe("code livré de l'espace du personnel", () => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const f of readdirSync(dir)) {
      const p = `${dir}/${f}`;
      if (statSync(p).isDirectory()) walk(p);
      else files.push(p);
    }
  };
  walk(new URL("../src/admin/loyalty", import.meta.url).pathname);
  const sources = files.map((f) => ({ f, code: readFileSync(f, "utf8") }));

  it("pas de journalisation, pas de clé de service, pas de code en dur, pas de second client Supabase", () => {
    for (const { f, code } of sources) {
      expect(code, f).not.toMatch(/console\.(log|info|debug)/);
      expect(code, f).not.toMatch(/service_role|SERVICE_ROLE|createClient\(/);
      expect(code, f).not.toContain("802461");
      expect(code, f).not.toMatch(/localStorage/);
    }
  });

  it("le banc d'essai n'est atteint que derrière LOCAL_BACKEND ; Supabase seulement dans l'accès par compte", () => {
    const devImport = /(from\s+"[^"]*loyalty\/dev\/|import\("[^"]*loyalty\/dev\/)/;
    const importsDev = sources.filter(({ code }) => devImport.test(code)).map(({ f }) => f.split("/src/")[1]);
    expect(importsDev.sort()).toEqual(["admin/loyalty/StaffLoyaltyApp.tsx", "admin/loyalty/access/DemoAccess.tsx"]);
    for (const { f, code } of sources.filter(({ code }) => devImport.test(code))) {
      for (const line of code.split("\n").filter((l) => /import\(".*loyalty\/dev\//.test(l) && !/^type /.test(l))) {
        expect(line, f).toMatch(/LOCAL_BACKEND \?/);
      }
    }
    expect(sources.filter(({ code }) => code.includes("getSupabaseClient")).map(({ f }) => f.split("/src/")[1])).toEqual([
      "admin/loyalty/access/AccountAccess.tsx",
    ]);
  });
});
