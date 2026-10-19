import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { keepFormulePoster, validateFormuleForm, hasFormuleErrors } from "../src/admin/lib/formuleAdmin";
import { FORMULES_CATEGORY_ID, FORMULES_PROMOS_CATEGORY, FORMULES_PROMOS_ITEMS } from "../src/data/formulesPromos";
import { publishedFormules, replaceFormules } from "../src/data/formulesMenu";
import type { MenuRows, ProductRow } from "../src/data/menuRows";
import { getStaticMenu } from "../src/data/menuSource";
import { ADMIN_ROUTES, resolveAdminRoute } from "../src/admin/lib/routes";
import { createMigratedDb, readMenuRows, runSeed } from "./helpers/supabaseTestDb";

const rowsWithCategory = (extra: ProductRow[] = []): MenuRows => ({
  categories: [
    { id: FORMULES_CATEGORY_ID, name: FORMULES_PROMOS_CATEGORY, sort_order: 0, is_active: true, display_mode: "list" },
  ],
  products: extra,
  variants: [],
});

describe("formules : validation", () => {
  const base = { name: "Zen Box", price: "109,00", isActive: true, position: "1" };
  const photo = { type: "image/jpeg", size: 1200 };

  it("refuse un nom vide, un prix négatif ou nul, et une affiche absente à la création", () => {
    const rows = rowsWithCategory();
    expect(validateFormuleForm({ ...base, name: "  " }, rows, photo, "create").name).toMatch(/nom/i);
    expect(validateFormuleForm({ ...base, price: "-5" }, rows, photo, "create").price).toMatch(/positif/i);
    expect(validateFormuleForm({ ...base, price: "0" }, rows, photo, "create").price).toMatch(/positif/i);
    expect(validateFormuleForm(base, rows, null, "create").photo).toMatch(/obligatoire/i);
    expect(hasFormuleErrors(validateFormuleForm(base, rows, photo, "create"))).toBe(false);
  });

  it("en modification, l'affiche existante suffit", () => {
    const rows = rowsWithCategory([
      {
        id: "formule-zen-box",
        category_id: FORMULES_CATEGORY_ID,
        name: "Zen Box",
        description: "16 pièces",
        price: "109.00",
        currency: "MAD",
        image_url: "/formules/zen-box.jpeg",
        thumb_small_url: null,
        thumb_large_url: null,
        sort_order: 1,
        is_active: true,
      },
    ]);
    expect(hasFormuleErrors(validateFormuleForm({ ...base, price: "119" }, rows, null, "edit"))).toBe(false);
  });

  it("le téléversement des affiches ne transforme pas le fichier", async () => {
    const file = new File([new Uint8Array([1, 2, 3, 4])], "affiche.jpg", { type: "image/jpeg" });
    const result = await keepFormulePoster(file);
    expect(result.ok && result.transformed).toBe(false);
    if (result.ok) expect(result.file).toBe(file);
  });
});

describe("formules : menu public", () => {
  it("remplace seulement la catégorie Formules et garde les autres plats", () => {
    const menu = getStaticMenu();
    const next = replaceFormules(menu, [
      {
        id: "formule-duo",
        category: FORMULES_PROMOS_CATEGORY,
        name: "Formule Duo",
        description: "Pour deux personnes",
        priceMAD: "280.00",
        currency: "MAD",
        image: "/formules/formule-duo.jpeg",
      },
    ]);
    expect(next.items.filter((it) => it.category === FORMULES_PROMOS_CATEGORY).map((it) => it.id)).toEqual(["formule-duo"]);
    expect(next.items.find((it) => it.id === "formule-duo")?.priceMAD).toBe("280.00");
    const classic = menu.items.filter((it) => it.category !== FORMULES_PROMOS_CATEGORY);
    expect(next.items.filter((it) => it.category !== FORMULES_PROMOS_CATEGORY)).toEqual(classic);
  });

  it("une formule désactivée n'est pas publiée ; une catégorie absente laisse le statique", () => {
    const product = {
      id: "formule-duo",
      category_id: FORMULES_CATEGORY_ID,
      name: "Formule Duo",
      description: "",
      price: "279.00",
      currency: "MAD",
      image_url: "/formules/formule-duo.jpeg",
      thumb_small_url: null,
      thumb_large_url: null,
      sort_order: 1,
      is_active: false,
    };
    expect(publishedFormules({ id: FORMULES_CATEGORY_ID, is_active: true }, [product])).toEqual([]);
    expect(publishedFormules(null, [product])).toBeNull();
    expect(publishedFormules({ id: FORMULES_CATEGORY_ID, is_active: false }, [{ ...product, is_active: true }])).toEqual([]);
  });
});

describe("formules : accès admin", () => {
  const admin = { status: "admin" as const, email: "a@kaytori.test" };

  it("réserve les routes aux administrateurs", () => {
    expect(resolveAdminRoute(ADMIN_ROUTES.formules, admin)).toEqual({ kind: "page", page: "formules" });
    expect(resolveAdminRoute(ADMIN_ROUTES.formuleNew, admin)).toEqual({ kind: "page", page: "formuleCreate" });
    expect(resolveAdminRoute("/admin/formules/formule-duo", admin)).toEqual({
      kind: "page",
      page: "formuleEdit",
      productId: "formule-duo",
    });
    expect(resolveAdminRoute(ADMIN_ROUTES.formules, { status: "signedOut" })).toEqual({
      kind: "redirect",
      to: ADMIN_ROUTES.login,
    });
    expect(resolveAdminRoute(ADMIN_ROUTES.formuleNew, { status: "notAdmin", email: "x" })).toEqual({
      kind: "page",
      page: "denied",
    });
  });
});

describe("script Supabase des formules existantes", () => {
  const sql = readFileSync(new URL("../supabase/production/07_formules_promos.sql", import.meta.url), "utf8");

  it("reprend chaque formule actuelle une seule fois, sans écraser en cas de conflit", () => {
    expect(sql).toContain("on conflict (id) do nothing");
    expect(sql).not.toMatch(/\bdelete\b|\bdrop\b|\btruncate\b/i);
    for (const item of FORMULES_PROMOS_ITEMS) {
      const hits = sql.split(`'${item.id}'`).length - 1;
      expect(hits, item.id).toBe(1);
      expect(sql).toContain(item.priceMAD);
    }
  });

  it("insère les 12 formules sans dupliquer ni toucher au reste du catalogue", async () => {
    const db = await createMigratedDb();
    await runSeed(db);
    const before = await readMenuRows(db);
    await db.exec(sql);
    await db.exec(sql);
    const after = await readMenuRows(db);
    const formules = after.products.filter((p) => p.category_id === FORMULES_CATEGORY_ID);
    expect(formules.map((p) => p.id)).toEqual(FORMULES_PROMOS_ITEMS.map((it) => it.id));
    expect(formules.map((p) => Number(p.price).toFixed(2))).toEqual(FORMULES_PROMOS_ITEMS.map((it) => it.priceMAD));
    expect(after.products.filter((p) => p.category_id !== FORMULES_CATEGORY_ID)).toEqual(
      before.products.filter((p) => p.category_id !== FORMULES_CATEGORY_ID),
    );
    await db.close();
  });
});
