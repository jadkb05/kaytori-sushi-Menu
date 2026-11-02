/**
 * Moteur de fidélité par points (migration réelle sur PostgreSQL en mémoire PGlite) :
 * appels RPC avec les rôles simulés anon / authenticated (auth.uid()), comme l'API Supabase.
 *
 * Couvre :
 *   - Normalisation du téléphone et nettoyage des noms
 *   - Inscription idempotente (solde initial : 0 point)
 *   - Consultation de la carte (solde, valeur en centimes, catalogue de récompenses, historique)
 *   - Attribution de points sur ticket (loyalty_credit_ticket : calcul exact, minimum, plafonds, confirmation rapprochée, refus si barème non configuré)
 *   - Ajustement manuel de points (loyalty_adjust_points : motif obligatoire, refus de solde négatif)
 *   - Catalogue de récompenses (loyalty_save_reward, loyalty_list_rewards, archivage sans suppression physique)
 *   - Échange de récompense par le personnel (loyalty_redeem_reward) et par le client (loyalty_client_redeem_reward)
 *   - Parcours rapide QR manager (loyalty_set_qr_pin, loyalty_qr_card_status, loyalty_qr_unlock avec limitation d'essais, loyalty_qr_credit_points, loyalty_qr_close_session)
 *   - Corrections en ajout seul (loyalty_revert_event) et réconciliation (loyalty_reconcile)
 *   - Permissions strictes par rôle et isolation vis-à-vis du CMS du menu
 */
import type { PGlite } from "@electric-sql/pglite";
import type { SupabaseClient } from "@supabase/supabase-js";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { normalizeMoroccanPhone } from "../src/cart/checkout";
import { createPgliteSupabase } from "./helpers/pgliteSupabase";
import { actAs, createPlatformDb, migrationFiles } from "./helpers/supabaseTestDb";

const ADMIN = { id: "11111111-1111-1111-1111-111111111111", email: "admin@kaytori.test" };
const MANAGER = { id: "22222222-2222-2222-2222-222222222222", email: "manager@kaytori.test" };
const STAFF_OWNER = { id: "33333333-3333-3333-3333-333333333333", email: "gerant@kaytori.test" };
const STRANGER = { id: "44444444-4444-4444-4444-444444444444", email: "inconnu@kaytori.test" };

type Res = { data: any; error: { message: string; code?: string } | null };

let db: PGlite | null = null;
afterEach(async () => {
  await db?.close();
  db = null;
});

async function createSupabaseLikeDb(): Promise<PGlite> {
  const d = await createPlatformDb();
  await d.exec(`
    alter default privileges in schema public grant all on tables to anon, authenticated;
    alter default privileges in schema public grant execute on functions to anon, authenticated;
    alter table auth.users add column email text;
  `);
  for (const f of migrationFiles()) {
    await d.exec(readFileSync(new URL(`../supabase/migrations/${f}`, import.meta.url), "utf8"));
  }
  return d;
}

type Clients = Record<"anon" | "admin" | "manager" | "staffOwner" | "stranger", SupabaseClient>;

async function setup({
  active = true,
  settings = { earning_points: 1, earning_dirhams: 2, rounding_rule: "floor", recent_credit_window_seconds: 120 },
}: {
  active?: boolean;
  settings?: Record<string, unknown>;
} = {}): Promise<Clients> {
  db = await createSupabaseLikeDb();
  await db.exec(`
    insert into auth.users (id, email) values
      ('${ADMIN.id}', '${ADMIN.email}'), ('${MANAGER.id}', '${MANAGER.email}'),
      ('${STAFF_OWNER.id}', '${STAFF_OWNER.email}'), ('${STRANGER.id}', '${STRANGER.email}');
    insert into public.admin_users (user_id) values ('${ADMIN.id}');
    insert into loyalty.staff (user_id, role) values ('${MANAGER.id}', 'manager'), ('${STAFF_OWNER.id}', 'owner');
  `);
  const c: Clients = {
    anon: createPgliteSupabase(db, null),
    admin: createPgliteSupabase(db, ADMIN),
    manager: createPgliteSupabase(db, MANAGER),
    staffOwner: createPgliteSupabase(db, STAFF_OWNER),
    stranger: createPgliteSupabase(db, STRANGER),
  };
  if (active || Object.keys(settings).length > 0) {
    ok(await c.admin.rpc("loyalty_update_settings", { p_changes: { is_active: active, ...settings } }));
  }
  return c;
}

const newToken = () => randomBytes(32).toString("base64url");
const rid = () => randomUUID();

function ok(res: Res) {
  if (res.error) throw new Error(`${res.error.code}: ${res.error.message}`);
  return res.data;
}

const register = (client: SupabaseClient, name: string, phone: string, token = newToken(), requestId = rid()) =>
  client.rpc("loyalty_register", {
    p_full_name: name,
    p_phone: phone,
    p_token: token,
    p_request_id: requestId,
  }) as unknown as Promise<Res>;

async function enroll(c: Clients, name = "Salma Bennani", phone = "06 12 34 56 78") {
  const token = newToken();
  const created = ok(await register(c.anon, name, phone, token));
  const detail = ok(await c.manager.rpc("loyalty_card_detail", { p_public_code: created.card.publicCode }));
  return { cardId: detail.cardId as string, publicCode: created.card.publicCode as string, token };
}

const creditTicket = (
  client: SupabaseClient,
  cardId: string,
  ticketCentimes = 20000,
  orderRef: string | null = "CMD-100",
  requestId = rid(),
  confirm = false,
) =>
  client.rpc("loyalty_credit_ticket", {
    p_card_id: cardId,
    p_ticket_centimes: ticketCentimes,
    p_order_ref: orderRef,
    p_request_id: requestId,
    p_confirm_recent: confirm,
  }) as unknown as Promise<Res>;

const adjustPoints = (
  client: SupabaseClient,
  cardId: string,
  delta: number,
  reason: string | null = "Geste commercial",
  requestId = rid(),
) =>
  client.rpc("loyalty_adjust_points", {
    p_card_id: cardId,
    p_delta: delta,
    p_reason: reason,
    p_request_id: requestId,
  }) as unknown as Promise<Res>;

const createReward = async (c: Clients, name = "Dessert Signature", pointsCost = 150) => {
  const res = ok(
    await c.admin.rpc("loyalty_save_reward", {
      p_reward: {
        name,
        description: "Mochi glacé artisanal",
        points_cost: pointsCost,
        conditions: "Sur place ou à emporter",
        is_active: true,
        sort_order: 10,
      },
      p_request_id: rid(),
    }),
  );
  return res.items.find((r: { name: string }) => r.name === name).id as string;
};

const redeem = (
  client: SupabaseClient,
  cardId: string,
  rewardId: string,
  requestId = rid(),
) =>
  client.rpc("loyalty_redeem_reward", {
    p_card_id: cardId,
    p_reward_id: rewardId,
    p_request_id: requestId,
  }) as unknown as Promise<Res>;

const revert = (
  client: SupabaseClient,
  eventId: string,
  reason: string | null = "Erreur de saisie",
  requestId = rid(),
) =>
  client.rpc("loyalty_revert_event", {
    p_event_id: eventId,
    p_reason: reason,
    p_request_id: requestId,
  }) as unknown as Promise<Res>;

async function query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  await actAs(db!, "owner");
  return (await db!.query<T>(sql, params)).rows;
}

async function reconcileOk(c: Clients) {
  expect(ok(await c.admin.rpc("loyalty_reconcile"))).toMatchObject({ ok: true, mismatches: [] });
}

/* ------------------------------------------------------------------ téléphone et nom */

describe("normalisation du téléphone : SQL identique à normalizeMoroccanPhone", () => {
  const cases = [
    "0612345678",
    "06 12 34 56 78",
    "06.12.34.56.78",
    "06-12-34-56-78",
    "(06) 12 34 56 78",
    "+212612345678",
    "+212 6 12 34 56 78",
    "00212612345678",
    "00212 7 12 34 56 78",
    "212612345678",
    "212712345678",
    "0712345678",
    "\t06 12 34 56 78\n",
    "06 12 34 56 78",
    "06 12 34 56 78",
    "06 12 34 56 78",
    "﻿0612345678",
    "",
    "   ",
    "0512345678",
    "0812345678",
    "061234567",
    "06123456789",
    "+2120612345678",
    "+33612345678",
    "612345678",
    "06 12 34 56 7a",
    "２０６１２３４５６７８",
    "06/12/34/56/78",
    "+212 5 22 00 00 00",
  ];

  it("chaque cas donne le même résultat côté navigateur et côté base", async () => {
    db = await createSupabaseLikeDb();
    for (const raw of cases) {
      const [row] = await query<{ v: string | null }>("select loyalty.normalize_phone($1) as v", [raw]);
      expect(row.v, JSON.stringify(raw)).toBe(normalizeMoroccanPhone(raw));
    }
  });
});

describe("nom et recherche sans casse ni accents", () => {
  it("nettoie le nom, refuse les noms vides, trop longs, numériques ou avec caractères de contrôle", async () => {
    db = await createSupabaseLikeDb();
    const clean = async (raw: string) =>
      (await query<{ v: string | null }>("select loyalty.clean_name($1) as v", [raw]))[0].v;
    expect(await clean("  Salma   Bennani ")).toBe("Salma Bennani");
    expect(await clean("Élodie Lefèvre")).toBe("Élodie Lefèvre");
    expect(await clean("سلمى بناني")).toBe("سلمى بناني");
    for (const bad of ["", "  ", "A", "12345", "--", "a".repeat(81), "Sal\u0007ma"]) {
      expect(await clean(bad), JSON.stringify(bad)).toBeNull();
    }
    const fold = async (raw: string) => (await query<{ v: string }>("select loyalty.fold($1) as v", [raw]))[0].v;
    expect(await fold("ÉLODIE Ben-Ali")).toBe("elodie ben ali");
    expect(await fold("Cœur d’Ivoire")).toBe("coeur d ivoire");
  });
});

/* ------------------------------------------------------------------ inscription */

describe("inscription", () => {
  it("inscription valide : fiche + carte créées à 0 point, sans numéro complet ni jeton", async () => {
    const c = await setup();
    const token = newToken();
    const res = ok(await register(c.anon, "  Salma   Bennani ", "+212 6 12 34 56 78", token));
    expect(res).toMatchObject({
      status: "created",
      replayed: false,
      card: {
        fullName: "Salma Bennani",
        phoneMasked: "06 •• •• •• 78",
        pointsBalance: 0,
        pointsEarnedTotal: 0,
        pointsSpentTotal: 0,
        pointValueCentimes: 20,
        earningPoints: 1,
        earningDirhams: 2,
        rewardsRedeemed: 0,
        status: "active",
        programActive: true,
      },
    });
    expect(res.card.publicCode).toMatch(/^[0-9A-HJKMNP-TV-Z]{12}$/);
    const text = JSON.stringify(res);
    expect(text).not.toContain("0612345678");
    expect(text).not.toContain(token);
    const [card] = await query<{ id: string; token_hash: Buffer }>("select id, token_hash from loyalty.cards");
    expect(text).not.toContain(card.id);
    expect(Buffer.from(card.token_hash).toString("base64url")).not.toBe(token);
    expect(await query("select kind, actor_role from loyalty.events where card_id is not null")).toEqual([
      { kind: "card_created", actor_role: "public" },
    ]);
  });

  it("nom vide, téléphone invalide, demande invalide ou doublon : refusés", async () => {
    const c = await setup();
    expect((await register(c.anon, "   ", "0612345678")).error?.code).toBe("KL001");
    expect((await register(c.anon, "Salma", "0512345678")).error?.code).toBe("KL002");
    expect((await register(c.anon, "Salma", "0612345678", "trop-court")).error?.code).toBe("KL013");
    ok(await register(c.anon, "Salma Bennani", "0612345678"));
    expect((await register(c.anon, "Autre", "+212 6-12-34-56-78")).error?.code).toBe("KL003");
  });

  it("idempotence : même demande rejouée sans doublon", async () => {
    const c = await setup();
    const token = newToken();
    const requestId = rid();
    const first = ok(await register(c.anon, "Salma Bennani", "0612345678", token, requestId));
    const again = ok(await register(c.anon, "Salma Bennani", "06 12 34 56 78", token, requestId));
    expect(again).toMatchObject({ status: "created", replayed: true, card: { publicCode: first.card.publicCode } });
    expect((await register(c.anon, "Salma Bennani", "0698765432", token, requestId)).error?.code).toBe("KL011");
  });

  it("programme fermé : inscription refusée", async () => {
    const c = await setup({ active: false, settings: {} });
    expect((await register(c.anon, "Salma Bennani", "0612345678")).error?.code).toBe("KL004");
    expect(ok(await c.anon.rpc("loyalty_program"))).toMatchObject({
      isActive: false,
      pointValueCentimes: 20,
      role: null,
    });
  });
});

/* ------------------------------------------------------------------ attribution sur ticket */

describe("attribution de points à partir d'un ticket (loyalty_credit_ticket)", () => {
  it("calcule les points selon le barème (1 pt / 2 DH), trace le montant et la référence, met à jour le solde", async () => {
    const c = await setup();
    const { cardId, token } = await enroll(c);
    // 185,50 DH = 18550 centimes -> floor(18550 / 200) = 92 points
    const res = ok(await creditTicket(c.manager, cardId, 18550, "CMD-402"));
    expect(res).toMatchObject({
      status: "ok",
      replayed: false,
      pointsAdded: 92,
      ticketCentimes: 18550,
      card: {
        pointsBalance: 92,
        pointsEarnedTotal: 92,
        pointsSpentTotal: 0,
      },
    });
    const view = ok(await c.anon.rpc("loyalty_card_view", { p_token: token }));
    expect(view.pointsBalance).toBe(92);
    expect(view.history[0]).toMatchObject({
      kind: "points_credited",
      pointsDelta: 92,
      ticketAmountCentimes: 18550,
      orderRef: "CMD-402",
    });
    await reconcileOk(c);
  });

  it("refuse l'attribution si le taux d'attribution n'est pas configuré (KL016)", async () => {
    const c = await setup({
      active: true,
      settings: { earning_points: null, earning_dirhams: null },
    });
    const { cardId } = await enroll(c);
    expect((await creditTicket(c.manager, cardId, 20000)).error?.code).toBe("KL016");
  });

  it("vérifie le ticket minimum, les plafonds par commande et par jour, et l'idempotence", async () => {
    const c = await setup({
      active: true,
      settings: {
        earning_points: 1,
        earning_dirhams: 1,
        rounding_rule: "floor",
        min_ticket_centimes: 5000,
        max_points_per_order: 200,
        max_points_per_day: 300,
        recent_credit_window_seconds: 0,
      },
    });
    const { cardId } = await enroll(c);
    // Sous le minimum de 50 DH -> KL014
    expect((await creditTicket(c.manager, cardId, 4000)).error?.code).toBe("KL014");
    // 250 DH plafonné à 200 pts par commande
    const req1 = rid();
    const first = ok(await creditTicket(c.manager, cardId, 25000, "CMD-1", req1));
    expect(first.pointsAdded).toBe(200);
    // Rejeu idempotent
    expect(ok(await creditTicket(c.manager, cardId, 25000, "CMD-1", req1))).toMatchObject({
      replayed: true,
      pointsAdded: 200,
      card: { pointsBalance: 200 },
    });
    // Dépassement du plafond journalier (200 + 150 > 300) -> KL014
    expect((await creditTicket(c.manager, cardId, 15000, "CMD-2")).error?.code).toBe("KL014");
    await reconcileOk(c);
  });

  it("demande confirmation pour deux crédits rapprochés dans la fenêtre configurée", async () => {
    const c = await setup({
      active: true,
      settings: { earning_points: 1, earning_dirhams: 2, recent_credit_window_seconds: 120 },
    });
    const { cardId } = await enroll(c);
    ok(await creditTicket(c.manager, cardId, 10000, "CMD-1"));
    const second = ok(await creditTicket(c.manager, cardId, 10000, "CMD-2"));
    expect(second).toMatchObject({ status: "confirm_recent", eventId: null, card: { pointsBalance: 50 } });
    expect(ok(await creditTicket(c.manager, cardId, 10000, "CMD-2", rid(), true))).toMatchObject({
      status: "ok",
      pointsAdded: 50,
      card: { pointsBalance: 100 },
    });
    await reconcileOk(c);
  });
});

/* ------------------------------------------------------------------ ajustement manuel */

describe("ajustement manuel de points (loyalty_adjust_points)", () => {
  it("exige un motif, interdit tout solde négatif et trace l'ajustement", async () => {
    const c = await setup();
    const { cardId } = await enroll(c);
    expect((await adjustPoints(c.manager, cardId, 100, " ")).error?.code).toBe("KL010");
    ok(await adjustPoints(c.manager, cardId, 100, "Geste commercial bienvenue"));
    expect((await adjustPoints(c.manager, cardId, -120, "Correction")).error?.code).toBe("KL007");
    const debited = ok(await adjustPoints(c.manager, cardId, -40, "Régularisation ticket"));
    expect(debited.card.pointsBalance).toBe(60);
    await reconcileOk(c);
  });
});

/* ------------------------------------------------------------------ catalogue & échanges */

describe("catalogue de récompenses et échanges (staff & client)", () => {
  it("crée, modifie, désactive et échange une récompense de manière atomique sans solde négatif", async () => {
    const c = await setup();
    const { cardId, token } = await enroll(c);
    const rewardId = await createReward(c, "Mochi Signature", 120);

    // Solde insuffisant (0 < 120) -> KL007
    expect((await redeem(c.manager, cardId, rewardId)).error?.code).toBe("KL007");

    // Crédit de 300 pts (ticket de 600 DH)
    ok(await creditTicket(c.manager, cardId, 60000, "CMD-99", rid(), true));

    // Échange par le manager (300 - 120 = 180 pts)
    const staffRedeem = ok(await redeem(c.manager, cardId, rewardId, rid()));
    expect(staffRedeem).toMatchObject({
      status: "ok",
      rewardId,
      rewardName: "Mochi Signature",
      pointsCost: 120,
      card: { pointsBalance: 180, pointsSpentTotal: 120, rewardsRedeemed: 1 },
    });
    expect(staffRedeem.redemptionCode).toMatch(/^KR-[0-9A-Z]{6}$/);

    // Échange par le client depuis son espace (180 - 120 = 60 pts)
    const clientRedeem = ok(
      await c.anon.rpc("loyalty_client_redeem_reward", {
        p_token: token,
        p_reward_id: rewardId,
        p_request_id: rid(),
      }),
    );
    expect(clientRedeem).toMatchObject({
      status: "ok",
      redemption: { rewardId, pointsCost: 120 },
      card: { pointsBalance: 60, pointsSpentTotal: 240, rewardsRedeemed: 2 },
    });
    expect(clientRedeem.redemption.redemptionCode).toMatch(/^KR-[0-9A-Z]{6}$/);

    // Troisième échange impossible (60 < 120) -> KL007
    expect(
      (
        await c.anon.rpc("loyalty_client_redeem_reward", {
          p_token: token,
          p_reward_id: rewardId,
          p_request_id: rid(),
        })
      ).error?.code,
    ).toBe("KL007");

    // Le compteur d'échanges sur la récompense vaut 2
    const list = ok(await c.manager.rpc("loyalty_list_rewards"));
    expect(list.items.find((r: { id: string }) => r.id === rewardId)?.redeemedCount).toBe(2);

    // Suppression physique interdite par trigger
    await expect(query("delete from loyalty.rewards where id = $1", [rewardId])).rejects.toThrow(/historique conservé/);
    await reconcileOk(c);
  });
});

/* ------------------------------------------------------------------ parcours rapide QR */

describe("parcours rapide QR manager (/fidelite/scan/:code)", () => {
  it("vérifie le code secret côté serveur, limite les essais, crédite les points et ferme la session", async () => {
    const c = await setup({
      active: true,
      settings: { earning_points: 1, earning_dirhams: 2, recent_credit_window_seconds: 0 },
    });
    const { publicCode, token } = await enroll(c, "Karim Tazi", "0611223344");

    // Tant que le PIN n'est pas configuré -> status = unconfigured_pin, unlock -> KL016
    expect(ok(await c.anon.rpc("loyalty_qr_card_status", { p_public_code: publicCode }))).toMatchObject({
      status: "unconfigured_pin",
      publicCode,
    });
    expect((await c.anon.rpc("loyalty_qr_unlock", { p_public_code: publicCode, p_pin: "802461" })).error?.code).toBe(
      "KL016",
    );

    // Configuration du code secret par l'owner
    ok(await c.admin.rpc("loyalty_set_qr_pin", { p_pin: "802461" }));

    // 4 essais erronés libres (status: invalid_pin), le 5e déclenche le verrouillage temporaire (status: locked)
    for (let i = 1; i <= 4; i++) {
      expect(ok(await c.anon.rpc("loyalty_qr_unlock", { p_public_code: publicCode, p_pin: "000000" }))).toMatchObject({
        status: "invalid_pin",
        attemptsRemaining: 5 - i,
      });
    }
    expect(ok(await c.anon.rpc("loyalty_qr_unlock", { p_public_code: publicCode, p_pin: "000000" }))).toMatchObject({
      status: "locked",
      attemptsRemaining: 0,
    });
    // Même le bon code est refusé tant que le verrouillage est actif
    expect(ok(await c.anon.rpc("loyalty_qr_unlock", { p_public_code: publicCode, p_pin: "802461" }))).toMatchObject({
      status: "locked",
    });

    // Réinitialisation du verrou en mettant à jour le PIN
    ok(await c.admin.rpc("loyalty_set_qr_pin", { p_pin: "802461" }));

    // Déverrouillage réussi : renvoie un jeton de session temporaire et les infos minimales (sans téléphone)
    const unlocked = ok(await c.anon.rpc("loyalty_qr_unlock", { p_public_code: publicCode, p_pin: "802461" }));
    expect(unlocked.card).toMatchObject({
      publicCode,
      fullName: "Karim Tazi",
      status: "active",
      pointsBalance: 0,
    });
    expect(JSON.stringify(unlocked)).not.toContain("0611223344");
    expect(unlocked.sessionToken).toMatch(/^[A-Za-z0-9+/=_-]{32,}$/);

    // Attribution de points via le jeton de session QR (ticket de 240 DH = 24000 centimes -> 120 points)
    const reqId = rid();
    const credited = ok(
      await c.anon.rpc("loyalty_qr_credit_points", {
        p_session_token: unlocked.sessionToken,
        p_public_code: publicCode,
        p_ticket_centimes: 24000,
        p_order_ref: "QR-55",
        p_request_id: reqId,
      }),
    );
    expect(credited).toMatchObject({
      status: "ok",
      replayed: false,
      pointsAdded: 120,
      newBalance: 120,
      ticketCentimes: 24000,
      orderRef: "QR-55",
    });

    // Fermeture de la session QR : le jeton ne peut plus servir pour une nouvelle requête
    ok(await c.anon.rpc("loyalty_qr_close_session", { p_session_token: unlocked.sessionToken }));
    expect(
      (
        await c.anon.rpc("loyalty_qr_credit_points", {
          p_session_token: unlocked.sessionToken,
          p_public_code: publicCode,
          p_ticket_centimes: 10000,
          p_order_ref: null,
          p_request_id: rid(),
        })
      ).error?.code,
    ).toBe("KL015");

    // Le client voit immédiatement son nouveau solde
    expect(ok(await c.anon.rpc("loyalty_card_view", { p_token: token })).pointsBalance).toBe(120);
    await reconcileOk(c);
  });
});

/* ------------------------------------------------------------------ corrections et audit */

describe("corrections et intégrité du journal", () => {
  it("corrige un crédit de points ou un échange de récompense, mais bloque si les points ont déjà été dépensés", async () => {
    const c = await setup({
      active: true,
      settings: { earning_points: 1, earning_dirhams: 1, recent_credit_window_seconds: 0 },
    });
    const { cardId } = await enroll(c);
    const rewardId = await createReward(c, "California Roll", 100);

    const credit = ok(await creditTicket(c.manager, cardId, 12000, "CMD-1")); // +120 pts
    const used = ok(await redeem(c.manager, cardId, rewardId)); // -100 pts -> reste 20 pts

    // Impossible d'annuler le crédit de 120 pts tant que l'échange de 100 pts n'est pas annulé (20 - 120 < 0 -> KL009)
    expect((await revert(c.manager, credit.eventId, "Erreur de ticket")).error?.code).toBe("KL009");

    // Annulation de l'échange -> solde remonte à 120 pts
    const revertedRedeem = ok(await revert(c.manager, used.eventId, "Récompense annulée"));
    expect(revertedRedeem.card).toMatchObject({ pointsBalance: 120, rewardsRedeemed: 0 });

    // Annulation du crédit -> solde revient à 0 pt
    const revertedCredit = ok(await revert(c.manager, credit.eventId, "Ticket annulé"));
    expect(revertedCredit.card).toMatchObject({ pointsBalance: 0, pointsEarnedTotal: 0 });

    await reconcileOk(c);
  });

  it("journal en ajout seul : ni modification ni suppression", async () => {
    const c = await setup();
    const { cardId } = await enroll(c);
    ok(await creditTicket(c.manager, cardId, 10000, "CMD-1"));
    await expect(query("update loyalty.events set reason = 'falsifié'")).rejects.toThrow(/historique conservé/);
    await expect(query("delete from loyalty.events")).rejects.toThrow(/historique conservé/);
    await expect(query("delete from loyalty.customers")).rejects.toThrow(/historique conservé/);
  });
});

/* ------------------------------------------------------------------ permissions */

describe("permissions par rôle", () => {
  it("anon ne peut exécuter que les 9 fonctions publiques et QR autorisées ; toutes les 25 fonctions sont SECURITY DEFINER", async () => {
    await setup();
    const rows = await query<{
      proname: string;
      anon: boolean;
      authenticated: boolean;
      definer: boolean;
      config: string[];
    }>(`
      select p.proname, has_function_privilege('anon', p.oid, 'execute') as anon,
             has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
             p.prosecdef as definer, p.proconfig as config
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname like 'loyalty\\_%' order by 1`);
    expect(rows).toHaveLength(25);
    expect(rows.filter((r) => r.anon).map((r) => r.proname)).toEqual([
      "loyalty_card_view",
      "loyalty_client_redeem_reward",
      "loyalty_my_role",
      "loyalty_program",
      "loyalty_qr_card_status",
      "loyalty_qr_close_session",
      "loyalty_qr_credit_points",
      "loyalty_qr_unlock",
      "loyalty_register",
    ]);
    expect(rows.every((r) => r.authenticated && r.definer && r.config.includes('search_path=""'))).toBe(true);
  });

  it("aucun accès direct aux tables de fidélité", async () => {
    const c = await setup();
    await enroll(c);
    for (const who of ["anon", { userId: STRANGER.id }, { userId: MANAGER.id }, { userId: ADMIN.id }] as const) {
      await actAs(db!, who);
      await expect(db!.query("select * from loyalty.cards")).rejects.toThrow(/permission denied/);
      await expect(db!.query("select * from loyalty.rewards")).rejects.toThrow(/permission denied/);
      await expect(db!.query("select * from loyalty.qr_sessions")).rejects.toThrow(/permission denied/);
    }
  });
});
