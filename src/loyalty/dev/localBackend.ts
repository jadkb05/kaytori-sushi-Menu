/**
 * BANC D'ESSAI LOCAL — développement uniquement (npm run dev:fidelite), jamais en production :
 * chargé seulement si import.meta.env.DEV et VITE_LOYALTY_LOCAL_BACKEND=1 (voir lib/api.ts).
 *
 * Les VRAIES migrations de supabase/migrations/ s'exécutent dans PGlite (PostgreSQL dans le
 * navigateur, données gardées dans IndexedDB « kaytori-loyalty-dev »). Les appels passent par les
 * mêmes fonctions SQL qu'en production, avec le rôle anon ou authenticated. Aucun accès réseau,
 * aucune donnée réelle.
 */
import { PGlite } from "@electric-sql/pglite";
import type { RpcResult } from "../lib/api";

const DB_NAME = "idb://kaytori-loyalty-dev";
const MANAGER = "22222222-2222-2222-2222-222222222222";
/** Compte fictif du comptoir (rôle manager) : utilisé par l'espace du personnel du banc local. */
const COUNTER = "33333333-3333-3333-3333-333333333333";
export const COUNTER_EMAIL = "comptoir@banc.local";
/** Second compte fictif (rôle owner) : actions réservées au responsable (réglages, suspension). */
export const OWNER_EMAIL = "responsable@banc.local";
export const DEMO_QR_PIN = "246810";

export type BenchProfile = "counter" | "owner";
const PROFILE_KEY = "kaytori.loyalty.devProfile";
export function benchProfile(): BenchProfile {
  return sessionStorage.getItem(PROFILE_KEY) === "owner" ? "owner" : "counter";
}
export function setBenchProfile(profile: BenchProfile): void {
  sessionStorage.setItem(PROFILE_KEY, profile);
}
export const benchEmail = () => (benchProfile() === "owner" ? OWNER_EMAIL : COUNTER_EMAIL);

const migrations = import.meta.glob("../../../supabase/migrations/*.sql", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

const PLATFORM_STUB = `
  create role anon nologin;
  create role authenticated nologin;
  grant usage on schema public to anon, authenticated;
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  create schema storage;
  create table storage.buckets (id text primary key, name text not null, public boolean not null default false,
    file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets (id),
    name text not null, owner uuid, unique (bucket_id, name));
  alter table storage.objects enable row level security;
  grant usage on schema storage to anon, authenticated;
`;

/** Cartes de démonstration (fictives) : chaque état du programme par points. */
export const DEMO_CARDS = [
  { label: "Nouvelle carte (0 pt)", name: "Nadia El Amrani", phone: "0611000001", ticketCentimes: 0 },
  { label: "Solde 140 pts (28 DH)", name: "Youssef Benali", phone: "0611000002", ticketCentimes: 14000, orderRef: "CMD-104" },
  { label: "Solde 280 pts (56 DH)", name: "Rim Alaoui-Lefèvre", phone: "0611000006", ticketCentimes: 28000, orderRef: "CMD-218" },
  { label: "Solde 520 pts (104 DH)", name: "Salma Bennani", phone: "0611000003", ticketCentimes: 52000, orderRef: "CMD-309" },
  { label: "Solde 1 150 pts (230 DH)", name: "Mehdi Tazi", phone: "0611000004", ticketCentimes: 115000, orderRef: "CMD-412" },
  { label: "Suspendue (90 pts)", name: "Inès Chraïbi", phone: "0611000005", ticketCentimes: 9000, suspend: true },
].map((c, i) => ({ ...c, token: `devCarteDemo${i}`.padEnd(43, "x") }));

export const DEMO_REWARDS = [
  {
    name: "Duo Gyoza Poulet (4 pcs)",
    description: "4 raviolis japonais grillés au poulet et légumes, sauce ponzu maison.",
    pointsCost: 150,
    conditions: "Valable sur place ou à emporter sur présentation de la carte.",
    sortOrder: 1,
  },
  {
    name: "California Roll Signature (8 pcs)",
    description: "Rouleau signature au saumon frais, avocat et sésame torréfié.",
    pointsCost: 250,
    conditions: "Valable sur toute commande, hors formule midi.",
    sortOrder: 2,
  },
  {
    name: "Assortiment Kaytôri 18 pièces",
    description: "Sélection du chef : 6 Californias, 6 Makis saumon, 4 Nigiris saumon, 2 Sashimis.",
    pointsCost: 500,
    conditions: "Sur présentation du code d'échange au comptoir.",
    sortOrder: 3,
  },
  {
    name: "Plateau Prestige 32 pièces",
    description: "Grand plateau à partager avec créations signatures du chef et accompagnements.",
    pointsCost: 1000,
    conditions: "Un échange par commande.",
    sortOrder: 4,
  },
];

export type NetworkMode = "normal" | "offline" | "lostResponse" | "slow";
const MODE_KEY = "kaytori.loyalty.devNetwork";

export function networkMode(): NetworkMode {
  const v = sessionStorage.getItem(MODE_KEY);
  return v === "offline" || v === "lostResponse" || v === "slow" ? v : "normal";
}
export function setNetworkMode(mode: NetworkMode): void {
  sessionStorage.setItem(MODE_KEY, mode);
}

let dbPromise: Promise<PGlite> | null = null;
let queue: Promise<unknown> = Promise.resolve();

function serial<T>(fn: (db: PGlite) => Promise<T>): Promise<T> {
  const run = queue.then(async () => fn(await database()));
  queue = run.catch(() => {});
  return run;
}

async function call(db: PGlite, who: "anon" | string, fn: string, args: Record<string, unknown>): Promise<RpcResult> {
  const names = Object.keys(args);
  const params = names.map((n, i) => `${n} => $${i + 1}${args[n] !== null && typeof args[n] === "object" ? "::jsonb" : ""}`).join(", ");
  const values = names.map((n) => (args[n] !== null && typeof args[n] === "object" ? JSON.stringify(args[n]) : args[n]));
  await db.exec(who === "anon" ? "set role anon; select set_config('request.jwt.claim.sub', '', false);" : `set role authenticated; select set_config('request.jwt.claim.sub', '${who}', false);`);
  try {
    const res = await db.query<{ r: unknown }>(`select public.${fn}(${params}) as r`, values);
    return { data: res.rows[0].r, error: null, status: 200 };
  } catch (e) {
    const err = e as Error & { code?: string };
    return { data: null, error: { message: err.message, code: err.code }, status: 400 };
  } finally {
    await db.exec("reset role; select set_config('request.jwt.claim.sub', '', false);");
  }
}

async function ok(db: PGlite, who: string, fn: string, args: Record<string, unknown>): Promise<unknown> {
  const res = await call(db, who, fn, args);
  if (res.error) throw new Error(`${fn} : ${res.error.code} ${res.error.message}`);
  return res.data;
}

async function database(): Promise<PGlite> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = new PGlite(DB_NAME);
      const installed = await db.query<{ has_ns: boolean; has_rewards: boolean }>(
        "select to_regnamespace('loyalty') is not null as has_ns, to_regclass('loyalty.rewards') is not null as has_rewards",
      );
      if (!installed.rows[0].has_ns || !installed.rows[0].has_rewards) {
        await db.exec("begin");
        try {
          if (installed.rows[0].has_ns) {
            await db.exec("drop schema loyalty cascade;");
          }
          await install(db, installed.rows[0].has_ns);
          await db.exec("commit");
        } catch (e) {
          await db.exec("rollback");
          throw e;
        }
      }
      await db.exec(`insert into auth.users (id, email) values ('${COUNTER}', '${COUNTER_EMAIL}') on conflict do nothing;
                     insert into loyalty.staff (user_id, role) values ('${COUNTER}', 'manager') on conflict do nothing;
                     update auth.users set email = '${OWNER_EMAIL}' where id = '${MANAGER}';`);
      return db;
    })();
  }
  return dbPromise;
}

/** Plateforme simulée, vraies migrations, réglages, récompenses et cartes de démonstration. */
async function install(db: PGlite, hadPlatform = false): Promise<void> {
  if (!hadPlatform) {
    await db.exec(PLATFORM_STUB);
    for (const name of Object.keys(migrations).sort()) await db.exec(migrations[name]);
  } else {
    const loyaltyMig = Object.keys(migrations).find((k) => k.endsWith("_loyalty.sql"));
    if (loyaltyMig) await db.exec(migrations[loyaltyMig]);
  }
  await db.exec(`insert into auth.users (id, email) values ('${MANAGER}', 'manager@local.test') on conflict do nothing;
                 insert into loyalty.staff (user_id, role) values ('${MANAGER}', 'owner') on conflict do nothing;`);
  await ok(db, MANAGER, "loyalty_update_settings", {
    p_changes: {
      is_active: true,
      point_value_centimes: 20,
      earning_points: 1,
      earning_dirhams: 1,
      rounding_rule: "floor",
      min_ticket_centimes: 0,
      recent_credit_window_seconds: 0,
      terms_summary: "1 point gagné par dirham dépensé. 1 point équivaut à 0,20 DH sur le catalogue de récompenses Kaytôri Club.",
    },
  });
  await ok(db, MANAGER, "loyalty_set_qr_pin", {
    p_pin: DEMO_QR_PIN,
  });

  for (const reward of DEMO_REWARDS) {
    await ok(db, MANAGER, "loyalty_save_reward", {
      p_reward: {
        name: reward.name,
        description: reward.description,
        points_cost: reward.pointsCost,
        conditions: reward.conditions,
        is_active: true,
        sort_order: reward.sortOrder,
      },
      p_request_id: crypto.randomUUID(),
    });
  }

  for (const demo of DEMO_CARDS) {
    const created = (await ok(db, "anon", "loyalty_register", {
      p_full_name: demo.name,
      p_phone: demo.phone,
      p_token: demo.token,
      p_request_id: crypto.randomUUID(),
    })) as { card: { publicCode: string } };
    const id = await cardId(db, created.card.publicCode);
    if (demo.ticketCentimes > 0) {
      await ok(db, MANAGER, "loyalty_credit_ticket", {
        p_card_id: id,
        p_ticket_centimes: demo.ticketCentimes,
        p_order_ref: demo.orderRef ?? null,
        p_request_id: crypto.randomUUID(),
        p_confirm_recent: true,
      });
    }
    if (demo.suspend) {
      await ok(db, MANAGER, "loyalty_set_card_status", {
        p_card_id: id,
        p_status: "suspended",
        p_reason: "Démonstration",
        p_request_id: crypto.randomUUID(),
      });
    }
  }
}

async function cardId(db: PGlite, publicCode: string): Promise<string> {
  return ((await ok(db, MANAGER, "loyalty_card_detail", { p_public_code: publicCode })) as { cardId: string }).cardId;
}

/** Base locale prête (premier lancement : migrations et cartes de démonstration). */
export async function ready(): Promise<void> {
  await database();
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Appel public (rôle anon), avec un réseau simulé réglable depuis la barre de développement. */
export async function localRpc(fn: string, args: Record<string, unknown>): Promise<RpcResult> {
  const mode = networkMode();
  await wait(mode === "slow" ? 2500 : 120);
  const lost = { data: null, error: { message: "FetchError: Failed to fetch", code: "" }, status: 0 };
  if (mode === "offline") return lost;
  const res = await serial((db) => call(db, "anon", fn, args));
  return mode === "lostResponse" ? lost : res;
}

/**
 * Appel du PERSONNEL (rôle authenticated, compte fictif du comptoir ou du responsable) :
 * mêmes fonctions SQL et mêmes contrôles de droits qu'en production.
 */
export async function staffRpc(fn: string, args: Record<string, unknown>): Promise<RpcResult> {
  const mode = networkMode();
  await wait(mode === "slow" ? 2500 : 100);
  const lost = { data: null, error: { message: "FetchError: Failed to fetch", code: "" }, status: 0 };
  if (mode === "offline") return lost;
  const res = await serial((db) => call(db, benchProfile() === "owner" ? MANAGER : COUNTER, fn, args));
  return mode === "lostResponse" ? lost : res;
}

/* ------------------------------------------------------------------ outils de la barre de dév */

export function devCreditPoints(publicCode: string, ticketCentimes = 15000): Promise<unknown> {
  return serial(async (db) =>
    ok(db, MANAGER, "loyalty_credit_ticket", {
      p_card_id: await cardId(db, publicCode),
      p_ticket_centimes: ticketCentimes,
      p_order_ref: "DEV-150",
      p_request_id: crypto.randomUUID(),
      p_confirm_recent: true,
    }),
  );
}

export function devSetProgram(changes: Record<string, unknown>): Promise<unknown> {
  return serial((db) => ok(db, MANAGER, "loyalty_update_settings", { p_changes: changes }));
}

export function devProgram(): Promise<unknown> {
  return serial((db) => ok(db, MANAGER, "loyalty_program", {}));
}

export async function devReset(): Promise<void> {
  const db = await database();
  await db.close();
  dbPromise = null;
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase("/pglite/kaytori-loyalty-dev");
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });
}

/** Même instance pour les scripts de vérification du navigateur (développement uniquement). */
(globalThis as Record<string, unknown>).__kaytoriLoyaltyDev = { localRpc, staffRpc, devCreditPoints, devSetProgram };
