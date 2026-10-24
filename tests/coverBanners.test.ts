/**
 * Photos de couverture : ordre public, seed migration, RPC admin (PGlite).
 */
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import {
  COVER_BANNERS_MIGRATION_HINT,
  coverBannerPosition,
  coverMoveTarget,
  coverStoragePath,
  newCoverBannerId,
  orderedCoverBanners,
  reorderCoverBanners,
  type CoverBannerRow,
} from "../src/admin/lib/coverBannerAdmin";
import { ADMIN_ROUTES, resolveAdminRoute } from "../src/admin/lib/routes";
import { activeCoverSlides, FALLBACK_COVER_SLIDE } from "../src/data/coverBanners";
import { createPgliteSupabase } from "./helpers/pgliteSupabase";
import { createMigratedDb } from "./helpers/supabaseTestDb";

const ADMIN = { id: "11111111-1111-1111-1111-111111111111", email: "admin@kaytori.test" };
const COVER_MIGRATION = readFileSync(
  new URL("../supabase/migrations/20261024200000_cover_banners.sql", import.meta.url),
  "utf8",
);

let db: Awaited<ReturnType<typeof createMigratedDb>> | null = null;
afterEach(async () => {
  await db?.close();
  db = null;
});

function row(partial: Partial<CoverBannerRow> & Pick<CoverBannerRow, "id">): CoverBannerRow {
  return {
    image_url: `/x/${partial.id}.jpg`,
    storage_path: null,
    sort_order: 0,
    is_active: true,
    ...partial,
  };
}

describe("coverBanners (helpers)", () => {
  it("ordonne et filtre les actives pour le carrousel public", () => {
    const slides = activeCoverSlides([
      { id: "b", image_url: "/b.jpg", is_active: true, sort_order: 2 },
      { id: "a", image_url: "/a.jpg", is_active: false, sort_order: 0 },
      { id: "c", image_url: "/c.jpg", is_active: true, sort_order: 1 },
    ]);
    expect(slides.map((s) => s.id)).toEqual(["c", "b"]);
    expect(FALLBACK_COVER_SLIDE.imageUrl).toContain("kaytori-makis");
  });

  it("positions et déplacement", () => {
    const banners = [row({ id: "a", sort_order: 0 }), row({ id: "b", sort_order: 1 }), row({ id: "c", sort_order: 2 })];
    expect(orderedCoverBanners(banners).map((b) => b.id)).toEqual(["a", "b", "c"]);
    expect(coverBannerPosition(banners, "b")).toBe(2);
    expect(coverMoveTarget(1, 3, "up")).toBeNull();
    expect(coverMoveTarget(1, 3, "down")).toBe(2);
    expect(coverMoveTarget(3, 3, "down")).toBeNull();
  });

  it("réordonne par indices et réécrit sort_order (glisser-déposer)", () => {
    const banners = [row({ id: "a", sort_order: 0 }), row({ id: "b", sort_order: 1 }), row({ id: "c", sort_order: 2 })];
    const moved = reorderCoverBanners(banners, 2, 0);
    expect(moved.map((b) => b.id)).toEqual(["c", "a", "b"]);
    expect(moved.map((b) => b.sort_order)).toEqual([0, 1, 2]);
    expect(reorderCoverBanners(banners, 1, 1).map((b) => b.id)).toEqual(["a", "b", "c"]);
    expect(reorderCoverBanners(banners, -1, 0).map((b) => b.id)).toEqual(["a", "b", "c"]);
  });

  it("chemins Storage cover/ et ids uniques", () => {
    const hash = "a".repeat(64);
    expect(coverStoragePath("cover-ab12", hash, "image/jpeg")).toBe(`cover/cover-ab12/${"a".repeat(32)}.jpg`);
    const id = newCoverBannerId([row({ id: "cover-default" })]);
    expect(id).toMatch(/^cover-[a-z0-9]+$/);
    expect(id).not.toBe("cover-default");
  });

  it("route admin /admin/cover", () => {
    expect(resolveAdminRoute(ADMIN_ROUTES.cover, { status: "admin", email: "a@b.c" })).toEqual({
      kind: "page",
      page: "cover",
    });
    expect(resolveAdminRoute(ADMIN_ROUTES.cover, { status: "signedOut" })).toEqual({
      kind: "redirect",
      to: ADMIN_ROUTES.login,
    });
  });
});

describe("cover_banners (migration + RPC)", () => {
  it("seed, create, reorder, deactivate, delete", async () => {
    db = await createMigratedDb();
    const seeded = await db.query<{ id: string; image_url: string; sort_order: number; is_active: boolean }>(
      "select id, image_url, sort_order, is_active from public.cover_banners order by sort_order, id",
    );
    expect(seeded.rows).toEqual([
      {
        id: "cover-default",
        image_url: "/banner/kaytori-makis-1280.webp",
        sort_order: 0,
        is_active: true,
      },
    ]);

    await db.exec(`
      insert into auth.users (id) values ('${ADMIN.id}');
      insert into public.admin_users (user_id) values ('${ADMIN.id}');
    `);
    const admin = createPgliteSupabase(db, ADMIN);

    const created = await admin.rpc("admin_create_cover_banner", {
      p_id: "cover-ref-1",
      p_image_url: "https://example.test/1.jpg",
      p_storage_path: "cover/cover-ref-1/abc.jpg",
      p_is_active: true,
      p_position: 1,
    });
    expect(created.error).toBeNull();

    const order1 = await db.query<{ id: string }>("select id from public.cover_banners order by sort_order, id");
    expect(order1.rows.map((r) => r.id)).toEqual(["cover-ref-1", "cover-default"]);

    const updated = await admin.rpc("admin_update_cover_banner", {
      p_banner_id: "cover-default",
      p_changes: { is_active: false },
      p_position: null,
    });
    expect(updated.error).toBeNull();

    const active = await db.query<{ id: string }>(
      "select id from public.cover_banners where is_active order by sort_order, id",
    );
    expect(active.rows.map((r) => r.id)).toEqual(["cover-ref-1"]);

    const first = await admin.rpc("admin_update_cover_banner", {
      p_banner_id: "cover-default",
      p_changes: { is_active: true },
      p_position: 1,
    });
    expect(first.error).toBeNull();
    const order2 = await db.query<{ id: string }>("select id from public.cover_banners order by sort_order, id");
    expect(order2.rows.map((r) => r.id)).toEqual(["cover-default", "cover-ref-1"]);

    const deleted = await admin.rpc("admin_delete_cover_banner", { p_banner_id: "cover-ref-1" });
    expect(deleted.error).toBeNull();
    const left = await db.query<{ id: string }>("select id from public.cover_banners");
    expect(left.rows.map((r) => r.id)).toEqual(["cover-default"]);

    expect(COVER_BANNERS_MIGRATION_HINT).toContain("10_cover_banners.sql");
    expect(COVER_MIGRATION).toContain("create table public.cover_banners");
  });

  it("refuse les RPC sans droits admin", async () => {
    db = await createMigratedDb();
    const anon = createPgliteSupabase(db, null);
    const res = await anon.rpc("admin_create_cover_banner", {
      p_id: "cover-x",
      p_image_url: "/x.jpg",
      p_storage_path: null,
      p_is_active: true,
      p_position: null,
    });
    expect(res.error).toBeTruthy();
  });
});
