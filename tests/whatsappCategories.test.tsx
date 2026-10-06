/**
 * WhatsApp dynamique : la catégorie de chaque ligne vient du menu réellement chargé (Supabase ou
 * statique), avec repli sur le menu statique ; le format du message est strictement inchangé.
 * PostgreSQL en mémoire, RLS réelle ; la base est restaurée exactement après chaque test.
 */
import type { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { uploadProductPhoto } from "../src/admin/lib/productPhoto";
import { createProduct, type NewProductForm } from "../src/admin/lib/productCreate";
import { loadCatalogEdit, saveCatalogProduct } from "../src/admin/lib/productSave";
import { buildWhatsappOrderMessage, categoryLookupFromMenu, type CartLine } from "../src/cart/buildOrderMessage";
import { CartProvider, useCart } from "../src/cart/CartContext";
import { rowsToMenu } from "../src/data/menuRows";
import { getStaticMenu, staticMenuSource, type MenuSnapshot } from "../src/data/menuSource";
import { fetchMenuRows } from "../src/data/supabaseMenuSource";
import { YUMLO_MENU } from "../src/data/yumloMenu";
import { MenuProvider, useOptionalMenu } from "../src/menu/MenuProvider";
import { createPgliteSupabase } from "./helpers/pgliteSupabase";
import { createMigratedDb, readMenuRows, runSeed } from "./helpers/supabaseTestDb";
import { WHATSAPP_REFERENCE_FILE, cartTotalDh, sampleCartLines } from "./referenceCases";

const ADMIN = { id: "11111111-1111-1111-1111-111111111111", email: "admin@kaytori.test" };
const NEW_ID = "abcdef0123";
const SALADE = YUMLO_MENU.find((it) => it.category === "Salades")!;
const RIZ = YUMLO_MENU.find((it) => it.name === "Riz Cantonais")!;
const reference = readFileSync(WHATSAPP_REFERENCE_FILE, "utf8");
const jpeg = () => new File(["photo"], "photo.jpg", { type: "image/jpeg" });

let db: PGlite;
let seedDump: string;
const admin = () => createPgliteSupabase(db, ADMIN);
const publicMenu = async () => rowsToMenu(await fetchMenuRows(createPgliteSupabase(db, null)));
const line = (id: string, name: string, unitPriceDh: number, quantity = 1): CartLine => ({ id, name, unitPriceDh, quantity });

/** Message construit comme le fait CartContext : catégories du menu chargé. */
const messageFor = (menu: MenuSnapshot, lines: CartLine[]) =>
  buildWhatsappOrderMessage(lines, cartTotalDh(lines), categoryLookupFromMenu(menu.items));

beforeAll(async () => {
  db = await createMigratedDb();
  await runSeed(db);
  await db.exec(`insert into auth.users (id) values ('${ADMIN.id}');
                 insert into public.admin_users (user_id) values ('${ADMIN.id}');`);
  seedDump = JSON.stringify(await readMenuRows(db));
});
afterEach(async () => {
  await db.exec(`delete from public.products where id = '${NEW_ID}'; delete from storage.objects;`);
  await runSeed(db);
  expect(JSON.stringify(await readMenuRows(db)), "données restaurées exactement").toBe(seedDump);
});
afterAll(() => db.close());

describe("format inchangé (référence validée)", () => {
  it("sans source de catégories : identique octet par octet à la référence", () => {
    const lines = sampleCartLines(getStaticMenu());
    expect(buildWhatsappOrderMessage(lines, cartTotalDh(lines))).toBe(reference);
  });

  it("menu statique chargé : identique à la référence", () => {
    expect(messageFor(getStaticMenu(), sampleCartLines(getStaticMenu()))).toBe(reference);
  });

  it("menu Supabase (seed) chargé : identique à la référence", async () => {
    const menu = await publicMenu();
    expect(messageFor(menu, sampleCartLines(menu))).toBe(reference);
  });
});

describe("catégories du menu chargé", () => {
  it("produit statique : catégorie du menu", async () => {
    const menu = await publicMenu();
    const msg = messageFor(menu, [line(SALADE.id, SALADE.name, 59)]);
    expect(msg).toContain(`• 1× [Salades] ${SALADE.name} — 59,00 DH`);
  });

  it("produit créé dans le CMS : catégorie connue (absente du menu statique)", async () => {
    const rows = await fetchMenuRows(admin());
    const form: NewProductForm = {
      name: "Salade CMS",
      description: "",
      categoryId: "salades",
      price: "61",
      isActive: true,
      position: "1",
      variants: [],
    };
    expect((await createProduct(admin(), form, rows, jpeg(), uploadProductPhoto, NEW_ID)).ok).toBe(true);
    const lines = [line(NEW_ID, "Salade CMS", 61)];
    expect(messageFor(await publicMenu(), lines)).toContain("• 1× [Salades] Salade CMS — 61,00 DH");
    // Sans le menu chargé, l'ancien comportement n'avait pas de catégorie pour ce produit.
    expect(buildWhatsappOrderMessage(lines, 61)).toContain("• 1× Salade CMS — 61,00 DH");
  });

  it("produit déplacé dans une autre catégorie : nouvelle catégorie", async () => {
    const data = loadCatalogEdit(await fetchMenuRows(admin()), SALADE.id)!;
    const res = await saveCatalogProduct(admin(), data, { ...data.form, categoryId: "california-roll", position: "1" }, null, uploadProductPhoto);
    expect(res.ok).toBe(true);
    const lines = [line(SALADE.id, SALADE.name, 59)];
    expect(messageFor(await publicMenu(), lines)).toContain(`• 1× [California Roll] ${SALADE.name} — 59,00 DH`);
    expect(buildWhatsappOrderMessage(lines, 59)).toContain(`• 1× [Salades] ${SALADE.name} — 59,00 DH`);
  });

  it("produit à variante : catégorie retrouvée via l'id de base (`platId:variantId`)", async () => {
    const v = RIZ.variants![1];
    const msg = messageFor(await publicMenu(), [line(`${RIZ.id}:${v.id}`, `${RIZ.name} — ${v.label}`, 54, 2)]);
    expect(msg).toContain(`• 2× [Wok & Thaï] ${RIZ.name} — ${v.label} — 108,00 DH`);
  });

  it("plusieurs produits : ordre, sous-totaux, total et gabarit inchangés", async () => {
    const v = RIZ.variants![0];
    const lines = [line(SALADE.id, SALADE.name, 59, 1), line(`${RIZ.id}:${v.id}`, `${RIZ.name} — ${v.label}`, 54, 2)];
    expect(messageFor(await publicMenu(), lines)).toBe(
      [
        "Bonjour Kaytôri,",
        "",
        "Nouvelle commande depuis le site :",
        "",
        `• 1× [Salades] ${SALADE.name} — 59,00 DH\n\n• 2× [Wok & Thaï] ${RIZ.name} — ${v.label} — 108,00 DH`,
        "",
        "━".repeat(16),
        "Total : 167,00 DH",
        "━".repeat(16),
        "",
        "Merci pour votre commande et à très bientôt 🙂",
      ].join("\n"),
    );
  });

  it("repli : produit inconnu du menu chargé → catégorie statique ; inconnu partout → sans étiquette", () => {
    const partial: MenuSnapshot = { categories: [], items: [] };
    expect(messageFor(partial, [line(SALADE.id, SALADE.name, 59)])).toContain(`• 1× [Salades] ${SALADE.name}`);
    expect(messageFor(partial, [line("zzz", "Mystère", 10)])).toContain("• 1× Mystère — 10,00 DH");
  });
});

describe("branchement panier ↔ menu chargé", () => {
  function Probe() {
    const menu = useOptionalMenu();
    const { whatsappOrderUrl } = useCart();
    return <p data-items={menu?.items.length ?? "none"}>{whatsappOrderUrl}</p>;
  }

  it("useOptionalMenu : menu dans MenuProvider, null en dehors (le panier fonctionne sans menu)", () => {
    const inside = renderToStaticMarkup(
      <MenuProvider source={staticMenuSource}>
        <CartProvider>
          <Probe />
        </CartProvider>
      </MenuProvider>,
    );
    expect(inside).toContain(`data-items="${YUMLO_MENU.length}"`);
    const outside = renderToStaticMarkup(
      <CartProvider>
        <Probe />
      </CartProvider>,
    );
    expect(outside).toContain('data-items="none"');
  });
});
