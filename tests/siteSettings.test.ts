/**
 * Réglage « Défilement automatique des couvertures » : migration, RLS, RPC admin, lecture admin/public.
 */
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import {
  SITE_SETTINGS_MIGRATION_HINT,
  fetchSiteSettings,
  updateCoverAutoplay,
} from "../src/admin/lib/siteSettingsAdmin";
import { createPgliteSupabase } from "./helpers/pgliteSupabase";
import { actAs, createMigratedDb } from "./helpers/supabaseTestDb";

const ADMIN = { id: "11111111-1111-1111-1111-111111111111", email: "admin@kaytori.test" };
const MIGRATION = readFileSync(new URL("../supabase/migrations/20261025120000_site_settings.sql", import.meta.url), "utf8");
const PRODUCTION = readFileSync(new URL("../supabase/production/12_site_settings.sql", import.meta.url), "utf8");

let db: Awaited<ReturnType<typeof createMigratedDb>> | null = null;
afterEach(async () => {
  await db?.close();
  db = null;
});

async function withAdmin() {
  db = await createMigratedDb();
  await db.exec(`
    insert into auth.users (id) values ('${ADMIN.id}');
    insert into public.admin_users (user_id) values ('${ADMIN.id}');
  `);
  return { admin: createPgliteSupabase(db, ADMIN), anon: createPgliteSupabase(db, null) };
}

describe("site_settings (défilement automatique des couvertures)", () => {
  it("par défaut : activé (comportement actuel), lisible par le public", async () => {
    const { admin, anon } = await withAdmin();
    expect(await fetchSiteSettings(admin)).toEqual({ coverAutoplay: true });
    expect(await fetchSiteSettings(anon)).toEqual({ coverAutoplay: true });
  });

  it("désactivation puis réactivation par un admin : enregistrée durablement et journalisée", async () => {
    const { admin, anon } = await withAdmin();
    const off = await updateCoverAutoplay(admin, false);
    expect(off).toEqual({ ok: true, settings: { coverAutoplay: false } });
    // Relecture (équivalent d'un rechargement) côté public.
    expect(await fetchSiteSettings(anon)).toEqual({ coverAutoplay: false });

    const on = await updateCoverAutoplay(admin, true);
    expect(on).toEqual({ ok: true, settings: { coverAutoplay: true } });
    expect(await fetchSiteSettings(anon)).toEqual({ coverAutoplay: true });

    const audit = await db!.query<{ action: string; after: boolean }>(
      "select action, (payload -> 'after' ->> 'cover_autoplay')::boolean as after from public.audit_log where entity_type = 'site_settings' order by created_at",
    );
    expect(audit.rows).toEqual([
      { action: "site_settings.update", after: false },
      { action: "site_settings.update", after: true },
    ]);
  });

  it("refuse toute écriture sans droits admin (RPC et écriture directe)", async () => {
    const { anon } = await withAdmin();
    const res = await updateCoverAutoplay(anon, false);
    expect(res.ok).toBe(false);
    const direct = await anon.from("site_settings").update({ cover_autoplay: false }).eq("id", "default").select("id");
    expect(direct.data ?? []).toEqual([]);
    expect(await fetchSiteSettings(anon)).toEqual({ coverAutoplay: true });
  });

  it("refuse les réglages inconnus ou les valeurs non booléennes", async () => {
    const { admin } = await withAdmin();
    expect((await admin.rpc("admin_update_site_settings", { p_changes: { autre: true } })).error).toBeTruthy();
    expect((await admin.rpc("admin_update_site_settings", { p_changes: { cover_autoplay: "non" } })).error).toBeTruthy();
  });

  it("une seule ligne de réglages possible", async () => {
    db = await createMigratedDb();
    await expect(db.exec("insert into public.site_settings (id) values ('autre')")).rejects.toThrow();
  });

  it("table absente (migration 12 non appliquée) : null côté admin, message d'installation", async () => {
    const { admin } = await withAdmin();
    await actAs(db!, "owner");
    await db!.exec("drop table public.site_settings");
    expect(await fetchSiteSettings(admin)).toBeNull();
    expect(SITE_SETTINGS_MIGRATION_HINT).toContain("12_site_settings.sql");
  });

  it("script de production aligné sur la migration, dans une transaction", () => {
    expect(PRODUCTION).toContain(MIGRATION.trimEnd());
    expect(PRODUCTION).toMatch(/^begin;$/m);
    expect(PRODUCTION.trimEnd().endsWith("commit;")).toBe(true);
  });
});
