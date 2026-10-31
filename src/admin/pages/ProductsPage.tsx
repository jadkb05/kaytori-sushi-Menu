import type { SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useMemo, useState } from "react";
import { FORMULES_CATEGORY_ID } from "../../data/formulesPromos";
import { takeFlash } from "../lib/flash";
import { AdminLink } from "../components/AdminLink";
import { ADMIN_LIST_PHOTO_WIDTH, AdminPhoto } from "../components/AdminPhoto";
import { ArrowDownIcon, ArrowUpIcon, CategoriesIcon, CloseIcon, PencilIcon, PlusIcon, SearchIcon } from "../components/icons";
import { ErrorState, LoadingState, PageHeader, StatusBadge, Toast, buttonClass, cardClass, focusRing, inputClass, orderButton, touchButton, type ToastNotice } from "../components/ui";
import { useAdminMenuData } from "../hooks/AdminMenuData";
import { buildCategoryList, buildProductList, filterProducts, type AdminProduct } from "../lib/menuAdmin";
import { moveTarget, runProductMove, type MoveDirection } from "../lib/productOrder";
import { ADMIN_ROUTES, productEditPath } from "../lib/routes";

/**
 * Une ligne du tableau. Sous lg (téléphone, tablette < 1024 px), la même ligne s'affiche en carte (grille) :
 * ordre ↑ / position / ↓ en colonne à gauche (comme Catégories), photo ; nom, catégorie, prix + statut,
 * variantes ; « Modifier » à droite. Catégorie à ordre automatique : « Ordre automatique » en bas de carte.
 * Mêmes données et mêmes liens qu'au bureau.
 */
function ProductRow({
  p,
  moveDisabled,
  state,
  onMove,
}: {
  p: AdminProduct;
  moveDisabled: boolean;
  /** « moving » : déplacement en cours ; « moved » : vient d'être déplacé (surlignage bref). */
  state: "idle" | "moving" | "moved";
  onMove: (p: AdminProduct, d: MoveDirection) => void;
}) {
  return (
    <tr
      aria-busy={state === "moving" || undefined}
      className={`align-middle transition-colors duration-500 max-lg:grid max-lg:grid-cols-[2.75rem_3rem_minmax(0,1fr)_auto] max-lg:items-center max-lg:gap-x-3 max-lg:gap-y-1 max-lg:px-3 max-lg:py-3.5 sm:max-lg:px-4 ${
        state === "moved" ? "bg-admin-tint/70" : state === "moving" ? "bg-admin-subtle" : "lg:hover:bg-admin-subtle/70"
      }`}
    >
      <td
        className={`py-3 pl-5 pr-3 max-lg:p-0 ${
          p.manualOrder ? "max-lg:col-start-1 max-lg:row-span-5 max-lg:row-start-1 max-lg:self-start" : "max-lg:col-span-3 max-lg:col-start-2 max-lg:row-start-6"
        }`}
      >
        {p.manualOrder ? (
          <div className="flex items-center gap-1.5 max-lg:flex-col max-lg:gap-1">
            <span
              className="w-10 whitespace-nowrap text-[13px] font-medium tabular-nums text-admin-ink max-lg:order-2 max-lg:w-auto max-lg:text-center max-lg:text-sm max-lg:font-semibold"
              title={`Position ${p.position} sur ${p.categoryTotal} dans ${p.categoryName}`}
            >
              {p.position}
              <span className="text-xs font-normal text-admin-muted max-lg:hidden">/{p.categoryTotal}</span>
            </span>
            <button
              type="button"
              className={`${orderButton} ${touchButton} max-lg:order-1`}
              disabled={moveDisabled || moveTarget(p, "up") === null}
              onClick={() => onMove(p, "up")}
              aria-label={`Monter ${p.name} (position ${p.position} sur ${p.categoryTotal} dans ${p.categoryName})`}
            >
              <ArrowUpIcon className="h-3.5 w-3.5 max-lg:h-4 max-lg:w-4" />
            </button>
            <button
              type="button"
              className={`${orderButton} ${touchButton} max-lg:order-3`}
              disabled={moveDisabled || moveTarget(p, "down") === null}
              onClick={() => onMove(p, "down")}
              aria-label={`Descendre ${p.name} (position ${p.position} sur ${p.categoryTotal} dans ${p.categoryName})`}
            >
              <ArrowDownIcon className="h-3.5 w-3.5 max-lg:h-4 max-lg:w-4" />
            </button>
          </div>
        ) : (
          <span className="inline-flex whitespace-nowrap rounded-md bg-admin-canvas px-2 py-0.5 text-xs font-medium text-admin-soft">Ordre automatique</span>
        )}
      </td>
      <td className="py-3 pl-3 pr-3 max-lg:col-start-2 max-lg:row-span-5 max-lg:row-start-1 max-lg:self-start max-lg:p-0">
        {p.imageUrl ? (
          <AdminPhoto
            src={p.imageUrl}
            photoWidth={ADMIN_LIST_PHOTO_WIDTH}
            alt=""
            width={48}
            height={48}
            loading="lazy"
            className={`h-12 w-12 rounded-lg bg-[#0f1815] object-cover ring-1 ring-black/5 ${p.visible ? "" : "opacity-60 grayscale-[40%]"}`}
          />
        ) : (
          <span className="block h-12 w-12 rounded-lg bg-admin-canvas ring-1 ring-inset ring-admin-line" aria-hidden />
        )}
      </td>
      <td className="px-3 py-3 max-lg:col-start-3 max-lg:row-start-1 max-lg:min-w-0 max-lg:break-words max-lg:p-0">
        <AdminLink
          href={productEditPath(p.id)}
          className={`rounded-sm font-semibold text-admin-ink transition-colors hover:text-kaytori-green ${focusRing}`}
        >
          {p.name}
        </AdminLink>
        <p className="mt-0.5 font-mono text-[11px] text-admin-muted max-xl:hidden">{p.id}</p>
        {/* 1024–1279 px : colonnes Catégorie et Variantes repliées sous le nom et le prix. */}
        <p className="mt-0.5 hidden text-xs text-admin-muted lg:max-xl:block">{p.categoryName}</p>
      </td>
      <td className="px-3 py-3 text-admin-soft lg:max-xl:hidden max-lg:col-start-3 max-lg:row-start-2 max-lg:min-w-0 max-lg:break-words max-lg:p-0 max-lg:text-xs">{p.categoryName}</td>
      <td className="whitespace-nowrap px-3 py-3 font-medium tabular-nums text-admin-ink max-lg:col-start-3 max-lg:row-start-3 max-lg:p-0">
        {p.variantCount > 0 ? <span className="font-normal text-admin-muted">dès </span> : null}
        {p.displayPrice} DH
        {p.variantCount > 0 ? (
          <span className="mt-0.5 hidden text-xs font-normal text-admin-muted lg:max-xl:block" title={p.variantLabels.join(", ")}>
            {p.variantCount} variante{p.variantCount > 1 ? "s" : ""}
          </span>
        ) : null}
      </td>
      <td className={`px-3 py-3 text-admin-soft lg:max-xl:hidden max-lg:col-span-2 max-lg:col-start-3 max-lg:row-start-4 max-lg:min-w-0 max-lg:p-0 max-lg:text-xs ${p.variantCount > 0 ? "" : "max-lg:hidden"}`}>
        {p.variantCount > 0 ? (
          <span title={p.variantLabels.join(", ")}>
            <span className="whitespace-nowrap rounded-md bg-admin-canvas px-1.5 py-0.5 font-medium text-admin-ink max-lg:bg-transparent max-lg:p-0 max-lg:text-admin-soft">
              {p.variantCount} variante{p.variantCount > 1 ? "s" : ""}
            </span>
            {/* Téléphone : pas de survol pour lire le title → libellés affichés. */}
            <span className="lg:hidden"> : {p.variantLabels.join(", ")}</span>
          </span>
        ) : (
          <span className="text-admin-muted">—</span>
        )}
      </td>
      <td className="px-3 py-3 max-lg:col-span-2 max-lg:col-start-3 max-lg:row-start-5 max-lg:p-0 max-lg:pt-1">
        <StatusBadge active={p.visible} activeLabel="Visible" inactiveLabel={p.isActive ? "Catégorie masquée" : "Masqué"} />
      </td>
      <td className="py-3 pl-3 pr-5 text-right max-lg:col-start-4 max-lg:row-span-3 max-lg:row-start-1 max-lg:self-start max-lg:p-0">
        <AdminLink href={productEditPath(p.id)} className={`${buttonClass("secondary", "sm")} max-lg:h-10 max-lg:px-3.5 max-[399px]:w-10 max-[399px]:px-0`} aria-label={`Modifier ${p.name}`}>
          <PencilIcon className="h-3.5 w-3.5 max-[399px]:h-4 max-[399px]:w-4" />
          <span className="max-[399px]:sr-only">Modifier</span>
        </AdminLink>
      </td>
    </tr>
  );
}

/** Liste des produits : recherche, filtre par catégorie et ordre dans chaque catégorie (↑ / ↓). */
export function ProductsPage({ client }: { client: SupabaseClient }) {
  const data = useAdminMenuData();
  const [toast, setToast] = useState<ToastNotice>(() => {
    const flash = takeFlash();
    return flash ? { tone: "success", message: flash } : null;
  });
  /** Produit en cours de déplacement : toutes les flèches sont désactivées jusqu'au rechargement. */
  const [moving, setMoving] = useState<AdminProduct | null>(null);
  /** Produit qui vient d'être déplacé : surligné un instant pour le retrouver dans la liste. */
  const [moved, setMoved] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  /** Recherche par nom de catégorie (indépendante de la recherche par nom de produit). */
  const [categoryQuery, setCategoryQuery] = useState("");

  const products = useMemo(
    () => (data.rows ? buildProductList(data.rows).filter((p) => p.categoryId !== FORMULES_CATEGORY_ID) : []),
    [data.rows],
  );
  const categories = useMemo(
    () => (data.rows ? buildCategoryList(data.rows).filter((c) => c.id !== FORMULES_CATEGORY_ID) : []),
    [data.rows],
  );
  const shown = useMemo(
    () => filterProducts(products, { query, categoryId, categoryQuery }),
    [products, query, categoryId, categoryQuery],
  );

  useEffect(() => {
    if (!moved) return;
    const id = window.setTimeout(() => setMoved(null), 1800);
    return () => window.clearTimeout(id);
  }, [moved]);

  const move = async (p: AdminProduct, direction: MoveDirection) => {
    if (moving) return;
    setMoving(p);
    setMoved(null);
    setToast({ tone: "pending", message: `Déplacement de « ${p.name} »…` });
    const notice = await runProductMove(client, p, direction, data.refresh);
    setMoving(null);
    if (notice.success) setMoved(p.id);
    setToast(notice.error ? { tone: "error", message: notice.error } : notice.success ? { tone: "success", message: notice.success } : null);
  };

  return (
    <>
      <PageHeader
        title="Produits"
        description="Cliquez sur un produit pour le modifier. Flèches ↑ / ↓ : ordre dans sa catégorie (produits masqués compris)."
        actions={
          <AdminLink href={ADMIN_ROUTES.productNew} className={buttonClass("primary")}>
            <PlusIcon className="h-4 w-4" />
            Nouveau produit
          </AdminLink>
        }
      />
      {data.status === "loading" ? <LoadingState /> : null}
      {data.status === "error" ? <ErrorState message={data.error} onRetry={data.reload} /> : null}
      {data.status === "ready" ? (
        <>
          <div className="mb-4 grid items-center gap-3 sm:grid-cols-2 xl:grid-cols-[18rem_16rem_16rem_minmax(0,1fr)]">
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-admin-muted" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Rechercher un produit…"
                aria-label="Rechercher un produit"
                className={`${inputClass} h-10 pl-9`}
              />
            </div>
            <div className="relative">
              <CategoriesIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-admin-muted" />
              <input
                type="search"
                value={categoryQuery}
                onChange={(e) => setCategoryQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setCategoryQuery("");
                }}
                placeholder="Rechercher une catégorie…"
                aria-label="Rechercher par catégorie"
                className={`${inputClass} h-10 pl-9 ${categoryQuery ? "pr-10" : ""} [&::-webkit-search-cancel-button]:appearance-none`}
              />
              {categoryQuery ? (
                <button
                  type="button"
                  onClick={() => setCategoryQuery("")}
                  aria-label="Effacer la recherche par catégorie"
                  title="Effacer"
                  className={`absolute right-1.5 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md text-admin-muted transition-colors hover:bg-admin-canvas hover:text-admin-ink ${focusRing}`}
                >
                  <CloseIcon className="h-4 w-4" />
                </button>
              ) : null}
            </div>
            <select
              value={categoryId ?? ""}
              onChange={(e) => setCategoryId(e.target.value || null)}
              aria-label="Filtrer par catégorie"
              className={`${inputClass} h-10`}
            >
              <option value="">Toutes les catégories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.productCount})
                </option>
              ))}
            </select>
            <p className="text-sm font-medium text-admin-soft sm:text-right" aria-live="polite">
              {shown.length} produit{shown.length > 1 ? "s" : ""}
            </p>
          </div>
          <div className={`${cardClass} relative overflow-x-auto`}>
            {/* Téléphone et tablette (< 1024 px) : tableau affiché en liste de cartes (même balisage, en-têtes masqués). */}
            <table className="min-w-full text-left text-sm max-lg:block lg:max-xl:[&_td]:px-2 lg:max-xl:[&_th]:px-2">
              <thead className="border-b border-admin-line bg-admin-subtle text-[11px] font-semibold uppercase tracking-[0.06em] text-admin-muted max-lg:hidden">
                <tr>
                  <th scope="col" className="py-3 pl-5 pr-3">Ordre</th>
                  <th scope="col" className="py-3 pl-3 pr-3">Photo</th>
                  <th scope="col" className="px-3 py-3">Nom</th>
                  <th scope="col" className="px-3 py-3 lg:max-xl:hidden">Catégorie</th>
                  <th scope="col" className="px-3 py-3">Prix</th>
                  <th scope="col" className="px-3 py-3 lg:max-xl:hidden">Variantes</th>
                  <th scope="col" className="px-3 py-3">Statut</th>
                  <th scope="col" className="py-3 pl-3 pr-5">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-admin-line max-lg:block">
                {shown.map((p) => (
                  <ProductRow
                    key={p.id}
                    p={p}
                    moveDisabled={moving !== null}
                    state={moving?.id === p.id ? "moving" : moved === p.id ? "moved" : "idle"}
                    onMove={move}
                  />
                ))}
              </tbody>
            </table>
            {shown.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <SearchIcon className="mx-auto h-6 w-6 text-admin-muted" />
                <p className="mt-3 text-sm font-medium text-admin-ink">Aucun produit trouvé.</p>
                <p className="mt-1 text-sm text-admin-muted">Essayez un autre mot ou une autre catégorie.</p>
              </div>
            ) : null}
          </div>
        </>
      ) : null}
      <Toast notice={toast} onDismiss={() => setToast(null)} />
    </>
  );
}
