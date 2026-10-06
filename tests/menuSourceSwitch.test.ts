/**
 * Phase 2 CMS : choix de la source (VITE_MENU_SOURCE), chargement via loadMenu() / getMenu(),
 * repli statique, et parité du menu servi à l'UI quelle que soit la source.
 */
import { readFileSync } from "node:fs";
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { buildWhatsappOrderMessage } from "../src/cart/buildOrderMessage";
import { compareParityModels, toParityModel, type MenuParityModel } from "../src/data/menuParity";
import { rowsToMenu } from "../src/data/menuRows";
import {
  ACTIVE_MENU_SOURCE,
  getInitialMenu,
  getMenu,
  getStaticMenu,
  lazySupabaseMenuSource,
  loadMenu,
  MENU_LOAD_TIMEOUT_MS,
  menuSourceFor,
  resolveMenuSourceId,
  staticMenuSource,
  type MenuLoadResult,
  type MenuSnapshot,
  type MenuSource,
} from "../src/data/menuSource";
import { YUMLO_CATEGORIES, YUMLO_MENU } from "../src/data/yumloMenu";
import { createMigratedDb, readMenuRows, runSeed } from "./helpers/supabaseTestDb";
import { MENU_REFERENCE_FILE, WHATSAPP_REFERENCE_FILE, cartTotalDh, sampleCartLines } from "./referenceCases";

const reference = JSON.parse(readFileSync(MENU_REFERENCE_FILE, "utf8")) as MenuParityModel;

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("choix de la source (VITE_MENU_SOURCE)", () => {
  it("absente, vide ou « static » → static", () => {
    expect(resolveMenuSourceId({})).toBe("static");
    expect(resolveMenuSourceId({ VITE_MENU_SOURCE: "" })).toBe("static");
    expect(resolveMenuSourceId({ VITE_MENU_SOURCE: "static" })).toBe("static");
  });

  it("« supabase » (casse et espaces tolérés) → supabase", () => {
    expect(resolveMenuSourceId({ VITE_MENU_SOURCE: "supabase" })).toBe("supabase");
    expect(resolveMenuSourceId({ VITE_MENU_SOURCE: "  Supabase " })).toBe("supabase");
  });

  it("valeur invalide → static", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(resolveMenuSourceId({ VITE_MENU_SOURCE: "firebase" })).toBe("static");
    expect(resolveMenuSourceId({ VITE_MENU_SOURCE: 1 })).toBe("static");
  });

  it("sources correspondantes et source par défaut = static", () => {
    expect(menuSourceFor("static")).toBe(staticMenuSource);
    expect(menuSourceFor("supabase")).toBe(lazySupabaseMenuSource);
    expect(ACTIVE_MENU_SOURCE.id).toBe("static");
  });
});

describe("source statique", () => {
  it("disponible immédiatement, mêmes objets que yumloMenu.ts", async () => {
    expect(getInitialMenu(staticMenuSource)).toBe(getStaticMenu());
    const result = await loadMenu(staticMenuSource);
    expect(result).toEqual({ menu: getStaticMenu(), sourceId: "static", fallbackReason: null });
    expect(result.menu.items).toBe(YUMLO_MENU);
    expect(result.menu.categories).toBe(YUMLO_CATEGORIES);
    expect(await getMenu()).toBe(getStaticMenu());
  });

  it("source distante : pas de menu immédiat (chargement asynchrone)", () => {
    expect(getInitialMenu(lazySupabaseMenuSource)).toBeNull();
  });
});

describe("source Supabase (base PostgreSQL en mémoire, migration + seed réels)", () => {
  let db: PGlite;
  let supabaseLike: MenuSource;

  beforeAll(async () => {
    db = await createMigratedDb();
    await runSeed(db);
    // Même conversion que supabaseMenuSource (rowsToMenu), sur les vraies tables.
    supabaseLike = { id: "supabase", load: async () => rowsToMenu(await readMenuRows(db)) };
  });
  afterAll(() => db.close());

  it("loadMenu() sert le menu Supabase, identique au statique champ par champ", async () => {
    const result = await loadMenu(supabaseLike);
    expect(result.sourceId).toBe("supabase");
    expect(result.fallbackReason).toBeNull();
    expect(result.menu.categories).toEqual([...YUMLO_CATEGORIES]);
    expect(result.menu.items).toEqual([...YUMLO_MENU]);
  });

  it("parité : toParityModel(static) === toParityModel(supabase) (ordre, prix, images, vignettes, variantes, sous-sections)", async () => {
    const { menu } = await loadMenu(supabaseLike);
    const fromSupabase = toParityModel(menu);
    expect(compareParityModels(toParityModel(getStaticMenu()), fromSupabase)).toEqual([]);
    expect(fromSupabase).toEqual(reference);
    expect(fromSupabase.categories).toHaveLength(31);
    expect(fromSupabase.products).toHaveLength(214);
    expect(fromSupabase.products.reduce((n, p) => n + p.variants.length, 0)).toBe(67);
    expect(fromSupabase.products.filter((p) => p.section).length).toBe(21);
  });

  it("panier et WhatsApp : même message depuis le menu Supabase", async () => {
    const { menu } = await loadMenu(supabaseLike);
    const lines = sampleCartLines(menu);
    expect(lines).toEqual(sampleCartLines(getStaticMenu()));
    expect(buildWhatsappOrderMessage(lines, cartTotalDh(lines))).toBe(
      readFileSync(WHATSAPP_REFERENCE_FILE, "utf8"),
    );
  });
});

describe("repli statique (fallback)", () => {
  const failing = (load: () => Promise<MenuSnapshot>): MenuSource => ({ id: "supabase", load });

  // Préchargement du module Supabase (import dynamique de lazySupabaseMenuSource) : son premier
  // chargement à froid peut dépasser 5 s quand les autres fichiers de tests tournent en parallèle.
  // Le test « non configuré » mesure ensuite uniquement le repli, pas la compilation du module.
  beforeAll(async () => {
    await import("../src/data/supabaseMenuSource");
  }, 30_000);

  it("erreur de la source → menu statique + raison + avertissement", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await loadMenu(failing(async () => Promise.reject(new Error("réseau indisponible"))));
    expect(result.menu).toBe(getStaticMenu());
    expect(result.sourceId).toBe("static");
    expect(result.fallbackReason).toBe("réseau indisponible");
    expect(warn).toHaveBeenCalledOnce();
    expect(String(warn.mock.calls[0][0])).toContain("repli sur le menu statique");
  });

  it("délai dépassé → menu statique", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await loadMenu(failing(() => new Promise<MenuSnapshot>(() => {})), 30);
    expect(result.menu).toBe(getStaticMenu());
    expect(result.fallbackReason).toContain("délai");
  });

  it("délai par défaut de 3 s : repli statique à 3 000 ms, pas avant", async () => {
    vi.useFakeTimers();
    try {
      vi.spyOn(console, "warn").mockImplementation(() => {});
      expect(MENU_LOAD_TIMEOUT_MS).toBe(3000);
      let settled: MenuLoadResult | null = null;
      void loadMenu(failing(() => new Promise<MenuSnapshot>(() => {}))).then((r) => {
        settled = r;
      });
      await vi.advanceTimersByTimeAsync(2999);
      expect(settled).toBeNull();
      await vi.advanceTimersByTimeAsync(1);
      expect(settled).not.toBeNull();
      expect(settled!.menu).toBe(getStaticMenu());
      expect(settled!.fallbackReason).toBe("délai de 3000 ms dépassé");
    } finally {
      vi.useRealTimers();
    }
  });

  it("menu vide (ex. RLS mal configurée) → menu statique", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await loadMenu(failing(async () => ({ categories: [], items: [] })));
    expect(result.menu).toBe(getStaticMenu());
    expect(result.fallbackReason).toContain("menu vide");
  });

  it("Supabase demandé mais non configuré → menu statique", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubEnv("VITE_SUPABASE_URL", "");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "");
    const result = await loadMenu(lazySupabaseMenuSource);
    expect(result.menu).toBe(getStaticMenu());
    expect(result.sourceId).toBe("static");
    expect(result.fallbackReason).toContain("Supabase non configuré");
  });
});
