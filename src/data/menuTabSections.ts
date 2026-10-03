import type { YumloMenuItem } from "./yumloMenu";

/** Ordre d’affichage des sous-blocs dans la section Plats Thaï (hors bentos — catégorie dédiée). */
const PLATS_THAI_SECTION_ORDER = [
  "Bœuf bulgogi",
  "Red curry thaï",
  "Ananas aigre doux",
  "Korean chicken",
  "Saté",
  "Autres",
] as const;

function platsThaiSection(name: string): string {
  if (/bulgogi/i.test(name)) return "Bœuf bulgogi";
  if (/red\s*curry/i.test(name)) return "Red curry thaï";
  if (/ananas/i.test(name)) return "Ananas aigre doux";
  if (/corean|korean/i.test(name)) return "Korean chicken";
  if (/sat[ée]/i.test(name)) return "Saté";
  return "Autres";
}

/** Tri des assortiments : regroupement par format (pcs), aligné brochure client. */
function assortimentSortKey(name: string): number {
  if (/extasy\s*40/i.test(name)) return 36;
  const m = name.match(/(\d+)\s*pcs/i);
  if (!m) return 999;
  const n = parseInt(m[1], 10);
  if (n === 44) return 48;
  return n;
}

function assortimentSectionTitle(name: string): string {
  if (/extasy\s*40/i.test(name)) return "Assortiments 36 pcs";
  const m = name.match(/(\d+)\s*pcs/i);
  if (!m) return "Assortiments";
  const n = parseInt(m[1], 10);
  if (n === 44 || n === 48) return "Assortiments 48 pcs";
  return `Assortiments ${m[1]} pcs`;
}

export type MenuSectionGroup = { title: string; items: YumloMenuItem[] };

/**
 * Découpe les plats d’un onglet en sous-sections (titres + cartes).
 * Utilisé pour Assortiments (16 / 24 / … pcs) et Plats Thaï (currys, bulgogi, etc.).
 */
export function groupItemsForMenuTab(category: string, items: YumloMenuItem[]): MenuSectionGroup[] {
  if (items.length === 0) return [];

  if (category === "Plats Thaï") {
    const sorted = [...items].sort((a, b) => {
      const sa = platsThaiSection(a.name);
      const sb = platsThaiSection(b.name);
      const ia = PLATS_THAI_SECTION_ORDER.indexOf(sa as (typeof PLATS_THAI_SECTION_ORDER)[number]);
      const ib = PLATS_THAI_SECTION_ORDER.indexOf(sb as (typeof PLATS_THAI_SECTION_ORDER)[number]);
      const ra = ia === -1 ? 99 : ia;
      const rb = ib === -1 ? 99 : ib;
      if (ra !== rb) return ra - rb;
      return a.name.localeCompare(b.name, "fr");
    });
    const groups: MenuSectionGroup[] = [];
    let currentTitle = "";
    for (const it of sorted) {
      const t = platsThaiSection(it.name);
      if (groups.length === 0 || t !== currentTitle) {
        currentTitle = t;
        groups.push({ title: t, items: [it] });
      } else {
        groups[groups.length - 1].items.push(it);
      }
    }
    return groups;
  }

  if (category === "Assortiments") {
    const sorted = [...items].sort((a, b) => {
      const ka = assortimentSortKey(a.name);
      const kb = assortimentSortKey(b.name);
      if (ka !== kb) return ka - kb;
      return a.name.localeCompare(b.name, "fr");
    });
    const groups: MenuSectionGroup[] = [];
    let currentTitle = "";
    for (const it of sorted) {
      const t = assortimentSectionTitle(it.name);
      if (groups.length === 0 || t !== currentTitle) {
        currentTitle = t;
        groups.push({ title: t, items: [it] });
      } else {
        groups[groups.length - 1].items.push(it);
      }
    }
    return groups;
  }

  return [{ title: "", items }];
}
