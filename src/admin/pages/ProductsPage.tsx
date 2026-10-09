import type { SupabaseClient } from "@supabase/supabase-js";
import { useMemo, useState } from "react";
import { takeFlash } from "../lib/flash";
import { AdminLink } from "../components/AdminLink";
import { ErrorState, LoadingState, PageHeader, StatusBadge, inputClass } from "../components/ui";
import { useAdminMenuData } from "../hooks/AdminMenuData";
import { buildCategoryList, buildProductList, filterProducts, type AdminProduct } from "../lib/menuAdmin";
import { moveTarget, runProductMove, type MoveDirection, type MoveNotice } from "../lib/productOrder";
import { ADMIN_ROUTES, productEditPath } from "../lib/routes";

/** Mêmes boutons que la page Catégories. */
const smallButton =
  "rounded-md border border-stone-300 bg-white px-2.5 py-1 text-xs font-semibold text-stone-700 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-40";
const touchButton = "max-lg:min-h-[40px] max-lg:min-w-[40px] max-lg:px-3 max-lg:text-sm";

/**
 * Une ligne du tableau. Sous lg (téléphone, tablette < 1024 px), la même ligne s'affiche en carte (grille) :
 * ordre ↑ / position / ↓ en colonne à gauche (comme Catégories), photo ; nom, catégorie, prix + statut,
 * variantes ; « Modifier » à droite. Catégorie à ordre automatique : « Ordre automatique » en bas de carte.
 * Mêmes données et mêmes liens qu'au bureau.
 */
function ProductRow({ p, moveDisabled, onMove }: { p: AdminProduct; moveDisabled: boolean; onMove: (p: AdminProduct, d: MoveDirection) => void }) {
  return (
    <tr className="align-middle max-lg:grid max-lg:grid-cols-[2.75rem_3rem_minmax(0,1fr)_auto] max-lg:items-center max-lg:gap-x-3 max-lg:gap-y-1 max-lg:px-3 max-lg:py-3">
      <td
        className={`py-2.5 pl-4 pr-3 max-lg:p-0 ${
          p.manualOrder ? "max-lg:col-start-1 max-lg:row-span-4 max-lg:row-start-1 max-lg:self-start" : "max-lg:col-span-3 max-lg:col-start-2 max-lg:row-start-5"
        }`}
      >
        {p.manualOrder ? (
          <div className="flex items-center gap-1.5 max-lg:flex-col max-lg:gap-1">
            <span className="w-10 whitespace-nowrap tabular-nums text-stone-500 max-lg:order-2 max-lg:w-auto max-lg:text-center max-lg:font-semibold" title={`Position ${p.position} sur ${p.categoryTotal} dans ${p.categoryName}`}>
              {p.position}
              <span className="text-xs font-normal text-stone-400 max-lg:hidden">/{p.categoryTotal}</span>
            </span>
            <button
              type="button"
              className={`${smallButton} ${touchButton} max-lg:order-1`}
              disabled={moveDisabled || moveTarget(p, "up") === null}
              onClick={() => onMove(p, "up")}
              aria-label={`Monter ${p.name} (position ${p.position} sur ${p.categoryTotal} dans ${p.categoryName})`}
            >
              ↑
            </button>
            <button
              type="button"
              className={`${smallButton} ${touchButton} max-lg:order-3`}
              disabled={moveDisabled || moveTarget(p, "down") === null}
              onClick={() => onMove(p, "down")}
              aria-label={`Descendre ${p.name} (position ${p.position} sur ${p.categoryTotal} dans ${p.categoryName})`}
            >
              ↓
            </button>
          </div>
        ) : (
          <span className="whitespace-nowrap text-xs text-stone-500">Ordre automatique</span>
        )}
      </td>
      <td className="py-2.5 pl-3 pr-3 max-lg:col-start-2 max-lg:row-span-4 max-lg:row-start-1 max-lg:self-start max-lg:p-0">
        {p.imageUrl ? (
          <img src={p.imageUrl} alt="" width={48} height={48} loading="lazy" className="h-12 w-12 rounded-lg bg-[#0f1815] object-cover" />
        ) : (
          <span className="block h-12 w-12 rounded-lg bg-stone-200" aria-hidden />
        )}
      </td>
      <td className="px-3 py-2.5 max-lg:col-start-3 max-lg:row-start-1 max-lg:min-w-0 max-lg:break-words max-lg:p-0">
        <AdminLink href={productEditPath(p.id)} className="font-medium text-stone-900 hover:text-kaytori-green hover:underline">
          {p.name}
        </AdminLink>
        <p className="text-xs text-stone-400 max-lg:hidden">{p.id}</p>
      </td>
      <td className="px-3 py-2.5 text-stone-600 max-lg:col-start-3 max-lg:row-start-2 max-lg:min-w-0 max-lg:break-words max-lg:p-0 max-lg:text-xs">{p.categoryName}</td>
      <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-stone-900 max-lg:col-start-3 max-lg:row-start-3 max-lg:p-0">
        {p.variantCount > 0 ? <span className="text-stone-500">dès </span> : null}
        {p.displayPrice} DH
      </td>
      <td className={`px-3 py-2.5 text-stone-600 max-lg:col-span-2 max-lg:col-start-3 max-lg:row-start-4 max-lg:min-w-0 max-lg:p-0 max-lg:text-xs ${p.variantCount > 0 ? "" : "max-lg:hidden"}`}>
        {p.variantCount > 0 ? (
          <span title={p.variantLabels.join(", ")}>
            {p.variantCount} variante{p.variantCount > 1 ? "s" : ""}
            {/* Téléphone : pas de survol pour lire le title → libellés affichés. */}
            <span className="lg:hidden"> : {p.variantLabels.join(", ")}</span>
          </span>
        ) : (
          <span className="text-stone-400">—</span>
        )}
      </td>
      <td className="px-3 py-2.5 max-lg:col-start-4 max-lg:row-start-3 max-lg:justify-self-end max-lg:p-0">
        <StatusBadge active={p.visible} activeLabel="Visible" inactiveLabel={p.isActive ? "Catégorie masquée" : "Masqué"} />
      </td>
      <td className="py-2.5 pl-3 pr-4 text-right max-lg:col-start-4 max-lg:row-span-2 max-lg:row-start-1 max-lg:self-start max-lg:p-0">
        <AdminLink
          href={productEditPath(p.id)}
          className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-50 max-lg:inline-flex max-lg:min-h-[40px] max-lg:items-center max-lg:px-3.5"
          aria-label={`Modifier ${p.name}`}
        >
          Modifier
        </AdminLink>
      </td>
    </tr>
  );
}

/** Liste des produits : recherche, filtre par catégorie et ordre dans chaque catégorie (↑ / ↓). */
export function ProductsPage({ client }: { client: SupabaseClient }) {
  const data = useAdminMenuData();
  const [flash] = useState(() => takeFlash());
  const [notice, setNotice] = useState<MoveNotice>({});
  /** Produit en cours de déplacement : toutes les flèches sont désactivées jusqu'au rechargement. */
  const [moving, setMoving] = useState<AdminProduct | null>(null);
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);

  const products = useMemo(() => (data.rows ? buildProductList(data.rows) : []), [data.rows]);
  const categories = useMemo(() => (data.rows ? buildCategoryList(data.rows) : []), [data.rows]);
  const shown = useMemo(() => filterProducts(products, { query, categoryId }), [products, query, categoryId]);

  const move = async (p: AdminProduct, direction: MoveDirection) => {
    if (moving) return;
    setMoving(p);
    setNotice({});
    setNotice(await runProductMove(client, p, direction, data.refresh));
    setMoving(null);
  };

  return (
    <>
      <PageHeader
        title="Produits"
        description="Cliquez sur un produit pour le modifier. Flèches ↑ / ↓ : ordre dans sa catégorie (produits masqués compris)."
        actions={
          <AdminLink href={ADMIN_ROUTES.productNew} className="rounded-lg bg-kaytori-green px-4 py-2 text-sm font-semibold text-white hover:bg-kaytori-greenDark">
            + Nouveau produit
          </AdminLink>
        }
      />
      {moving ? (
        <p className="mb-4 rounded-lg bg-stone-100 px-4 py-3 text-sm text-stone-700" role="status">
          Déplacement de « {moving.name} »…
        </p>
      ) : null}
      {notice.success ? (
        <p className="mb-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800" role="status">
          {notice.success}
        </p>
      ) : null}
      {notice.error ? (
        <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
          {notice.error}
        </p>
      ) : null}
      {flash ? (
        <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800" role="status">
          {flash}
        </p>
      ) : null}
      {data.status === "loading" ? <LoadingState /> : null}
      {data.status === "error" ? <ErrorState message={data.error} onRetry={data.reload} /> : null}
      {data.status === "ready" ? (
        <>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher un produit…"
              aria-label="Rechercher un produit"
              className={`${inputClass} sm:max-w-xs`}
            />
            <select
              value={categoryId ?? ""}
              onChange={(e) => setCategoryId(e.target.value || null)}
              aria-label="Filtrer par catégorie"
              className={`${inputClass} sm:max-w-xs`}
            >
              <option value="">Toutes les catégories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.productCount})
                </option>
              ))}
            </select>
            <p className="text-sm text-stone-500 sm:ml-auto" aria-live="polite">
              {shown.length} produit{shown.length > 1 ? "s" : ""}
            </p>
          </div>
          <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
            {/* Téléphone et tablette (< 1024 px) : tableau affiché en liste de cartes (même balisage, en-têtes masqués). */}
            <table className="min-w-full text-left text-sm max-lg:block">
              <thead className="border-b border-stone-200 bg-stone-50 text-xs font-medium uppercase tracking-wide text-stone-500 max-lg:hidden">
                <tr>
                  <th scope="col" className="py-2.5 pl-4 pr-3">Ordre</th>
                  <th scope="col" className="py-2.5 pl-3 pr-3">Photo</th>
                  <th scope="col" className="px-3 py-2.5">Nom</th>
                  <th scope="col" className="px-3 py-2.5">Catégorie</th>
                  <th scope="col" className="px-3 py-2.5">Prix</th>
                  <th scope="col" className="px-3 py-2.5">Variantes</th>
                  <th scope="col" className="px-3 py-2.5">Statut</th>
                  <th scope="col" className="py-2.5 pl-3 pr-4">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 max-lg:block">
                {shown.map((p) => (
                  <ProductRow key={p.id} p={p} moveDisabled={moving !== null} onMove={move} />
                ))}
              </tbody>
            </table>
            {shown.length === 0 ? <p className="p-6 text-center text-sm text-stone-500">Aucun produit trouvé.</p> : null}
          </div>
        </>
      ) : null}
    </>
  );
}
