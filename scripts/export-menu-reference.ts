/**
 * Fige la référence du menu public actuel (parité) :
 *   npm run menu:reference
 *
 * Écrit tests/fixtures/menu-reference.json (modèle de parité complet) et
 * tests/fixtures/whatsapp-reference.txt (message WhatsApp d'un panier type).
 * À relancer UNIQUEMENT après une modification volontaire du menu.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { buildWhatsappOrderMessage } from "../src/cart/buildOrderMessage";
import { getStaticMenu } from "../src/data/menuSource";
import { toParityModel } from "../src/data/menuParity";
import {
  FIXTURES_DIR,
  MENU_REFERENCE_FILE,
  WHATSAPP_REFERENCE_FILE,
  cartTotalDh,
  sampleCartLines,
} from "../tests/referenceCases";

const menu = getStaticMenu();
const model = toParityModel(menu);
const lines = sampleCartLines(menu);

mkdirSync(FIXTURES_DIR, { recursive: true });
writeFileSync(MENU_REFERENCE_FILE, JSON.stringify(model, null, 2) + "\n");
writeFileSync(WHATSAPP_REFERENCE_FILE, buildWhatsappOrderMessage(lines, cartTotalDh(lines)));

const variants = model.products.reduce((n, p) => n + p.variants.length, 0);
console.log(
  `Référence écrite : ${model.categories.length} catégories, ${model.products.length} plats, ${variants} variantes.`,
);
