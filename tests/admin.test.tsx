/**
 * Phase 3A : espace /admin (lecture seule) — routes protégées, accès via admin_users (RPC is_admin),
 * statistiques, produits et catégories lus depuis la base (RLS réelle, PostgreSQL en mémoire).
 */
import type { PGlite } from "@electric-sql/pglite";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AdminLayout } from "../src/admin/components/AdminLayout";
import { AdminMenuDataContext } from "../src/admin/hooks/AdminMenuData";
import { determineAdminAccess, signInErrorMessage, type AdminAccess } from "../src/admin/lib/auth";
import {
  buildCategoryList,
  buildProductList,
  computeDashboardStats,
  filterProducts,
} from "../src/admin/lib/menuAdmin";
import { ADMIN_ROUTES, isAdminPath, resolveAdminRoute } from "../src/admin/lib/routes";
import { AccessDeniedPage } from "../src/admin/pages/AccessPages";
import { CategoriesPage } from "../src/admin/pages/CategoriesPage";
import { DashboardPage } from "../src/admin/pages/DashboardPage";
import { LoginPage } from "../src/admin/pages/LoginPage";
import { ProductsPage } from "../src/admin/pages/ProductsPage";
import type { MenuRows } from "../src/data/menuRows";
import { fetchMenuRows } from "../src/data/supabaseMenuSource";
import { YUMLO_CATEGORIES, YUMLO_MENU } from "../src/data/yumloMenu";
import { createPgliteSupabase } from "./helpers/pgliteSupabase";
import { createMigratedDb, runSeed } from "./helpers/supabaseTestDb";

const ADMIN = { id: "11111111-1111-1111-1111-111111111111", email: "admin@kaytori.test" };
const USER = { id: "22222222-2222-2222-2222-222222222222", email: "client@kaytori.test" };

let db: PGlite;
beforeAll(async () => {
  db = await createMigratedDb();
  await runSeed(db);
  await db.exec(`insert into auth.users (id) values ('${ADMIN.id}'), ('${USER.id}');
                 insert into public.admin_users (user_id) values ('${ADMIN.id}');`);
});
afterAll(() => db.close());

describe("routes /admin", () => {
  it("détecte les chemins de l'admin sans toucher au menu public", () => {
    for (const p of ["/admin", "/admin/", "/admin/login", "/admin/products", "/admin/categories/"]) {
      expect(isAdminPath(p), p).toBe(true);
    }
    for (const p of ["/", "/menu", "/menu/", "/administration", "/admins"]) expect(isAdminPath(p), p).toBe(false);
  });

  it("non connecté : toute page protégée redirige vers /admin/login", () => {
    const access: AdminAccess = { status: "signedOut" };
    for (const p of ["/admin", "/admin/products", "/admin/categories", "/admin/inconnu"]) {
      expect(resolveAdminRoute(p, access)).toEqual({ kind: "redirect", to: ADMIN_ROUTES.login });
    }
    expect(resolveAdminRoute("/admin/login", access)).toEqual({ kind: "page", page: "login" });
  });

  it("connecté sans droits : accès refusé partout", () => {
    const access: AdminAccess = { status: "notAdmin", email: USER.email };
    for (const p of ["/admin", "/admin/products", "/admin/categories", "/admin/login"]) {
      expect(resolveAdminRoute(p, access)).toEqual({ kind: "page", page: "denied" });
    }
  });

  it("admin : pages accessibles, /admin/login et chemins inconnus → tableau de bord", () => {
    const access: AdminAccess = { status: "admin", email: ADMIN.email };
    expect(resolveAdminRoute("/admin", access)).toEqual({ kind: "page", page: "dashboard" });
    expect(resolveAdminRoute("/admin/products/", access)).toEqual({ kind: "page", page: "products" });
    expect(resolveAdminRoute("/admin/categories", access)).toEqual({ kind: "page", page: "categories" });
    expect(resolveAdminRoute("/admin/login", access)).toEqual({ kind: "redirect", to: ADMIN_ROUTES.dashboard });
    expect(resolveAdminRoute("/admin/inconnu", access)).toEqual({ kind: "redirect", to: ADMIN_ROUTES.dashboard });
  });

  it("vérification en cours, Supabase absent, erreur", () => {
    expect(resolveAdminRoute("/admin", { status: "loading" })).toEqual({ kind: "loading" });
    expect(resolveAdminRoute("/admin", { status: "unconfigured" })).toEqual({ kind: "page", page: "unconfigured" });
    expect(resolveAdminRoute("/admin", { status: "error", message: "x" })).toEqual({ kind: "page", page: "error" });
  });
});

describe("authentification et admin_users (RPC is_admin, RLS réelle)", () => {
  it("sans session → non connecté → redirection vers /admin/login", async () => {
    const access = await determineAdminAccess(createPgliteSupabase(db, null));
    expect(access).toEqual({ status: "signedOut" });
    expect(resolveAdminRoute("/admin", access)).toEqual({ kind: "redirect", to: ADMIN_ROUTES.login });
  });

  it("connecté mais absent de admin_users → accès refusé", async () => {
    const access = await determineAdminAccess(createPgliteSupabase(db, USER));
    expect(access).toEqual({ status: "notAdmin", email: USER.email });
    expect(resolveAdminRoute("/admin", access)).toEqual({ kind: "page", page: "denied" });
  });

  it("présent dans admin_users → tableau de bord accessible", async () => {
    const access = await determineAdminAccess(createPgliteSupabase(db, ADMIN));
    expect(access).toEqual({ status: "admin", email: ADMIN.email });
    expect(resolveAdminRoute("/admin", access)).toEqual({ kind: "page", page: "dashboard" });
  });

  it("erreur de session ou de vérification des droits → jamais d'accès admin", async () => {
    expect(await determineAdminAccess(createPgliteSupabase(db, ADMIN, { sessionError: "réseau" }))).toEqual({
      status: "error",
      message: "réseau",
    });
    const access = await determineAdminAccess(createPgliteSupabase(db, ADMIN, { rpcError: "timeout" }));
    expect(access.status).toBe("error");
  });

  it("messages de connexion compréhensibles", () => {
    expect(signInErrorMessage("Invalid login credentials")).toBe("Email ou mot de passe incorrect.");
    expect(signInErrorMessage("Failed to fetch")).toBe("Connexion impossible. Vérifiez votre accès Internet.");
    expect(signInErrorMessage("autre")).toBe("Connexion impossible. Réessayez.");
  });
});

describe("données de l'admin (lues depuis la base)", () => {
  it("statistiques du tableau de bord : 31 catégories, 214 produits, 67 variantes", async () => {
    const rows = await fetchMenuRows(createPgliteSupabase(db, ADMIN));
    expect(computeDashboardStats(rows)).toEqual({
      activeCategories: 31,
      totalCategories: 31,
      visibleProducts: 214,
      hiddenProducts: 0,
      totalProducts: 214,
      activeVariants: 67,
      totalVariants: 67,
    });
  });

  it("éléments masqués : visibles par l'admin (comptés comme masqués), invisibles pour un non-admin", async () => {
    const product = YUMLO_MENU.find((it) => it.category === "Sushi Fusion")!;
    await db.exec(`update public.products set is_active = false where id = '${product.id}';
                   update public.categories set is_active = false where id = 'desserts';`);
    try {
      const adminRows = await fetchMenuRows(createPgliteSupabase(db, ADMIN));
      const userRows = await fetchMenuRows(createPgliteSupabase(db, USER));
      const desserts = YUMLO_MENU.filter((it) => it.category === "Desserts").length;
      expect(computeDashboardStats(adminRows)).toMatchObject({
        activeCategories: 30,
        totalCategories: 31,
        totalProducts: 214,
        hiddenProducts: 1 + desserts,
        visibleProducts: 214 - 1 - desserts,
      });
      expect(userRows.products).toHaveLength(214 - 1 - desserts);
      expect(userRows.categories).toHaveLength(30);
      const listed = buildProductList(adminRows).find((p) => p.id === product.id)!;
      expect(listed).toMatchObject({ isActive: false, visible: false });
    } finally {
      await db.exec(`update public.products set is_active = true where id = '${product.id}';
                     update public.categories set is_active = true where id = 'desserts';`);
    }
  });

  it("produits : 214, dans l'ordre du menu, avec photo, catégorie, prix et variantes", async () => {
    const rows = await fetchMenuRows(createPgliteSupabase(db, ADMIN));
    const products = buildProductList(rows);
    expect(products).toHaveLength(214);
    const expectedOrder = YUMLO_CATEGORIES.flatMap((c) => YUMLO_MENU.filter((it) => it.category === c).map((it) => it.id));
    expect(products.map((p) => p.id)).toEqual(expectedOrder);
    expect(products.filter((p) => p.variantCount > 0)).toHaveLength(19);
    for (const p of products) {
      const it = YUMLO_MENU.find((x) => x.id === p.id)!;
      expect(p.name).toBe(it.name);
      expect(p.categoryName).toBe(it.category);
      expect(p.price).toBe(it.priceMAD.replace(".", ","));
      expect(p.imageUrl).toMatch(/^\/menu-thumbs\/.+-224\.webp$/);
      expect(p.variantCount).toBe(it.variants?.length ?? 0);
    }
    const redCurry = products.find((p) => p.name === "Red Curry Thaï")!;
    expect(redCurry).toMatchObject({ price: "64,00", displayPrice: "69,00", variantCount: 4 });
  });

  it("recherche (sans accents) et filtre par catégorie", async () => {
    const products = buildProductList(await fetchMenuRows(createPgliteSupabase(db, ADMIN)));
    expect(filterProducts(products, { query: "bento", categoryId: null })).toHaveLength(8);
    expect(filterProducts(products, { query: "", categoryId: "bentos" })).toHaveLength(8);
    expect(filterProducts(products, { query: "thai", categoryId: null })).toEqual(
      filterProducts(products, { query: "Thaï", categoryId: null }),
    );
    expect(filterProducts(products, { query: "saumon", categoryId: "plats-thai" }).map((p) => p.name)).toEqual([
      "Pavé de Saumon",
    ]);
    expect(filterProducts(products, { query: "introuvable", categoryId: null })).toHaveLength(0);
  });

  it("catégories : 31, dans l'ordre, avec nombre de produits et mode d'affichage", async () => {
    const categories = buildCategoryList(await fetchMenuRows(createPgliteSupabase(db, ADMIN)));
    expect(categories.map((c) => c.name)).toEqual([...YUMLO_CATEGORIES]);
    expect(categories.reduce((n, c) => n + c.productCount, 0)).toBe(214);
    expect(categories.find((c) => c.name === "Plats Thaï")).toMatchObject({
      productCount: 11,
      visibleProductCount: 11,
      displayMode: "list",
      isActive: true,
    });
  });
});

describe("rendu des pages (sans navigateur)", () => {
  let rows: MenuRows;
  beforeAll(async () => {
    rows = await fetchMenuRows(createPgliteSupabase(db, ADMIN));
  });
  const withData = (node: JSX.Element) =>
    renderToStaticMarkup(
      <AdminMenuDataContext.Provider value={{ status: "ready", rows, error: null, reload: () => {} }}>
        {node}
      </AdminMenuDataContext.Provider>,
    );

  it("tableau de bord, produits, catégories", () => {
    const dashboard = withData(<DashboardPage />);
    expect(dashboard).toContain("Catégories actives");
    expect(dashboard).toContain(">214<");
    const products = withData(<ProductsPage client={createPgliteSupabase(db, ADMIN)} />);
    expect(products).toContain("214 produits");
    expect(products).toContain("Red Curry Thaï");
    expect((products.match(/<tr/g) ?? []).length).toBe(215);
    const categories = withData(<CategoriesPage client={createPgliteSupabase(db, ADMIN)} />);
    expect(categories).toContain("Plats Thaï");
    expect((categories.match(/<tr/g) ?? []).length).toBe(32);
  });

  it("connexion, accès refusé, mise en page", () => {
    expect(renderToStaticMarkup(<LoginPage onSignIn={async () => null} />)).toContain("Se connecter");
    expect(renderToStaticMarkup(<AccessDeniedPage email={USER.email} onSignOut={() => {}} />)).toContain(USER.email);
    const layout = renderToStaticMarkup(
      <AdminLayout current="products" email={ADMIN.email} onSignOut={() => {}}>
        contenu
      </AdminLayout>,
    );
    expect(layout).toContain('aria-current="page"');
    expect(layout).toContain(ADMIN_ROUTES.categories);
  });
});
