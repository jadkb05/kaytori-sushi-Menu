/**
 * Build de PRODUCTION réel (vite build dans un dossier temporaire), y compris avec
 * VITE_LOYALTY_LOCAL_BACKEND=1 forcé : le banc d'essai (code de démonstration, compte fictif,
 * base PGlite, cartes de démonstration) n'y figure pas, aucun binaire wasm/data PGlite n'est émis,
 * et les appels du personnel ne vivent que dans le morceau chargé sur /admin/fidelite.
 */
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEMO_CARDS } from "../src/loyalty/dev/localBackend";
import { COUNTER_EMAIL, DEMO_MARKER, DEMO_PIN, OWNER_EMAIL } from "../src/loyalty/dev/staffDemo";

const root = new URL("..", import.meta.url).pathname;
let outDir = "";
let allAssets: string[] = [];
let chunks: { name: string; code: string }[] = [];

beforeAll(async () => {
  outDir = mkdtempSync(join(tmpdir(), "kaytori-bundle-"));
  const previous = { flag: process.env.VITE_LOYALTY_LOCAL_BACKEND, nodeEnv: process.env.NODE_ENV };
  process.env.VITE_LOYALTY_LOCAL_BACKEND = "1";
  process.env.NODE_ENV = "production";
  try {
    await build({ root, logLevel: "silent", mode: "production", build: { outDir, emptyOutDir: true, reportCompressedSize: false } });
  } finally {
    if (previous.flag === undefined) delete process.env.VITE_LOYALTY_LOCAL_BACKEND;
    else process.env.VITE_LOYALTY_LOCAL_BACKEND = previous.flag;
    process.env.NODE_ENV = previous.nodeEnv;
  }
  const assets = join(outDir, "assets");
  allAssets = readdirSync(assets);
  chunks = allAssets
    .filter((f) => f.endsWith(".js"))
    .map((f) => ({ name: f, code: readFileSync(join(assets, f), "utf8") }));
}, 180_000);

afterAll(() => {
  if (outDir) rmSync(outDir, { recursive: true, force: true });
});

const containing = (needle: string) => chunks.filter((c) => c.code.includes(needle)).map((c) => c.name);

describe("build de production : banc d'essai et PGlite absents", () => {
  it("le build contient bien l'espace du personnel (contrôle du contrôle), sans morceau du banc ni fichiers wasm/data", () => {
    expect(chunks.map((c) => c.name).filter((n) => /staffDemo|localBackend|DevToolbar|pointsBench/i.test(n))).toEqual([]);
    expect(allAssets.filter((f) => f.endsWith(".wasm") || f.endsWith(".data"))).toEqual([]);
    expect(chunks.length).toBeGreaterThan(3);
    expect(containing("loyalty_credit_ticket")).toHaveLength(1);
    expect(containing("loyalty_credit_ticket")[0]).toMatch(/^StaffLoyaltyApp-/);
  });

  it("ni code de démonstration, ni compte fictif, ni base locale, ni cartes de démonstration", () => {
    for (const needle of [DEMO_PIN, DEMO_MARKER, COUNTER_EMAIL, OWNER_EMAIL, "kaytori.dev.points.v1", "kaytori.loyalty.devProfile", "idb://kaytori-loyalty-dev", "Ouverture du banc d'essai local", "verifyDemoPin", "__kaytoriLoyaltyDev"]) {
      expect(containing(needle), needle).toEqual([]);
    }
    for (const demo of DEMO_CARDS) {
      expect(containing(demo.token), demo.label).toEqual([]);
      expect(containing(demo.phone), demo.label).toEqual([]);
    }
    expect(chunks.filter((c) => /new PGlite|electric-sql|postgres-[\w-]+\.wasm/.test(c.code)).map((c) => c.name)).toEqual([]);
  });

  it("aucune opération du personnel dans le menu public ni dans la carte du client", () => {
    const staffOnly = ["loyalty_credit_ticket", "loyalty_adjust_points", "loyalty_redeem_reward", "loyalty_revert_event", "loyalty_reissue_access", "loyalty_update_customer", "loyalty_search", "loyalty_card_detail", "loyalty_card_history"];
    for (const c of chunks.filter((c) => /^(index|LoyaltyApp|signupForm)-/.test(c.name))) {
      for (const fn of staffOnly) expect(c.code.includes(fn), `${c.name} : ${fn}`).toBe(false);
    }
  });
});
