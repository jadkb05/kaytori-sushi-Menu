/**
 * Parité : base Supabase de production (tant qu'elle existe) ⇄ menu statique (src/data/menu.json).
 *
 *   VITE_SUPABASE_URL=… VITE_SUPABASE_ANON_KEY=… npm run menu:parity
 *
 * Lit les tables comme l'ancien site (clé publique, règles RLS : contenu actif uniquement),
 * reconstruit le menu avec l'ancien enchaînement (rowsToMenu → publishedFormules → replaceFormules),
 * les photos du bucket étant remplacées par leur copie /media/ (même chemin), puis compare :
 * catégories, plats, ordre, prix, descriptions, images, variantes, sections formules,
 * couvertures (ordre, formule liée) et réglage de défilement. Code de sortie 1 au moindre écart.
 * Aucune écriture : lecture seule.
 */
import { buildCoverSlides, PRODUCTION_COVER_AUTOPLAY, PRODUCTION_COVER_SLIDES } from "../src/data/coverBanners";
import { publishedFormules, replaceFormules, type FormuleProductRow, type FormuleSectionProbe } from "../src/data/formulesMenu";
import { FORMULES_CATEGORY_ID } from "../src/data/formulesPromos";
import { compareParityModels, toParityModel } from "../src/data/menuParity";
import { rowsToMenu, type CategoryRow, type VariantRow } from "../src/data/menuRows";
import { PRODUCTION_MENU } from "../src/data/productionMenu";

const url = process.env.VITE_SUPABASE_URL?.trim();
const key = process.env.VITE_SUPABASE_ANON_KEY?.trim();
if (!url || !key) {
  console.error("VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY requis (clé publique uniquement).");
  process.exit(2);
}

async function rows<T>(table: string, query: string): Promise<T[]> {
  const res = await fetch(`${url}/rest/v1/${table}?${query}`, { headers: { apikey: key!, Authorization: `Bearer ${key}` } });
  if (!res.ok) throw new Error(`${table} : HTTP ${res.status} ${await res.text()}`);
  return (await res.json()) as T[];
}

const STORAGE = "/storage/v1/object/public/menu-images/";
const toMedia = (u: string | null) => (u && u.includes(STORAGE) ? `/media/${u.split(STORAGE)[1].split("?")[0]}` : u);

const [categories, products, variants, sections, covers, settings] = await Promise.all([
  rows<CategoryRow>("categories", "select=id,name,sort_order,is_active,display_mode&order=sort_order"),
  rows<FormuleProductRow>(
    "products",
    "select=id,category_id,name,description,price,currency,image_url,thumb_small_url,thumb_large_url,sort_order,is_active,formule_section_id&order=sort_order",
  ),
  rows<VariantRow>("product_variants", "select=product_id,id,label,price,sort_order,is_active&order=sort_order"),
  rows<FormuleSectionProbe>("formule_sections", "select=id,name,description,sort_order,is_active&is_active=eq.true&order=sort_order"),
  rows<{ id: string; image_url: string; storage_path: string | null; sort_order: number; is_active: boolean; product_id: string | null }>(
    "cover_banners",
    "select=id,image_url,storage_path,sort_order,is_active,product_id&is_active=eq.true&order=sort_order,id",
  ),
  rows<{ cover_autoplay: boolean }>("site_settings", "select=cover_autoplay&id=eq.default"),
]);
const localProducts = products.map((p) => ({ ...p, image_url: toMedia(p.image_url) }));

// Ancien enchaînement du MenuProvider (source Supabase).
const base = rowsToMenu({ categories, products: localProducts, variants });
const category = categories.find((c) => c.id === FORMULES_CATEGORY_ID) ?? null;
const formules = publishedFormules(
  category,
  localProducts.filter((p) => p.category_id === FORMULES_CATEGORY_ID && p.is_active),
  sections,
);
if (formules === null) throw new Error("catégorie formules absente en production");
const live = replaceFormules(base, formules, sections);

const diffs = compareParityModels(toParityModel(live), toParityModel(PRODUCTION_MENU));
const sectionsLive = JSON.stringify([live.formuleSectionNames, live.formuleSectionDescriptions]);
const sectionsStatic = JSON.stringify([PRODUCTION_MENU.formuleSectionNames, PRODUCTION_MENU.formuleSectionDescriptions]);
if (sectionsLive !== sectionsStatic) diffs.push(`sections formules : attendu ${sectionsLive}, obtenu ${sectionsStatic}`);
for (const it of live.items) {
  const s = PRODUCTION_MENU.items.find((x) => x.id === it.id);
  if ((it.formuleSectionId ?? null) !== (s?.formuleSectionId ?? null)) diffs.push(`${it.id} · section formule différente`);
}

const liveCovers = buildCoverSlides({
  categories,
  products: localProducts,
  cover_banners: covers.map((c) => ({ ...c, image_url: toMedia(c.image_url)! })),
});
if (JSON.stringify(liveCovers) !== JSON.stringify(PRODUCTION_COVER_SLIDES)) {
  diffs.push(`couvertures : attendu ${JSON.stringify(liveCovers)}, obtenu ${JSON.stringify(PRODUCTION_COVER_SLIDES)}`);
}
const liveAutoplay = settings[0] ? settings[0].cover_autoplay !== false : true;
if (liveAutoplay !== PRODUCTION_COVER_AUTOPLAY) diffs.push(`défilement automatique : attendu ${liveAutoplay}, obtenu ${PRODUCTION_COVER_AUTOPLAY}`);

console.log(
  `Production : ${live.categories.length} catégories affichées, ${live.items.length} plats, ` +
    `${live.items.reduce((n, it) => n + (it.variants?.length ?? 0), 0)} variantes, ${liveCovers.length} couvertures, ` +
    `défilement ${liveAutoplay ? "activé" : "désactivé"}.`,
);
if (diffs.length > 0) {
  console.error(`${diffs.length} écart(s) :\n- ${diffs.join("\n- ")}`);
  process.exit(1);
}
console.log("Parité parfaite : 0 écart.");
