import { useMemo, useState } from "react";
import { takeFlash } from "../lib/flash";
import { AdminLink } from "../components/AdminLink";
import { ErrorState, LoadingState, PageHeader, StatusBadge, inputClass } from "../components/ui";
import { useAdminMenuData } from "../hooks/AdminMenuData";
import { buildCategoryList, buildProductList, filterProducts, type AdminProduct } from "../lib/menuAdmin";
import { ADMIN_ROUTES, productEditPath } from "../lib/routes";

function ProductRow({ p }: { p: AdminProduct }) {
  return (
    <tr className="align-middle">
      <td className="py-2.5 pl-4 pr-3">
        {p.imageUrl ? (
          <img src={p.imageUrl} alt="" width={48} height={48} loading="lazy" className="h-12 w-12 rounded-lg bg-[#0f1815] object-cover" />
        ) : (
          <span className="block h-12 w-12 rounded-lg bg-stone-200" aria-hidden />
        )}
      </td>
      <td className="px-3 py-2.5">
        <AdminLink href={productEditPath(p.id)} className="font-medium text-stone-900 hover:text-kaytori-green hover:underline">
          {p.name}
        </AdminLink>
        <p className="text-xs text-stone-400">{p.id}</p>
      </td>
      <td className="px-3 py-2.5 text-stone-600">{p.categoryName}</td>
      <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-stone-900">
        {p.variantCount > 0 ? <span className="text-stone-500">dès </span> : null}
        {p.displayPrice} DH
      </td>
      <td className="px-3 py-2.5 text-stone-600">
        {p.variantCount > 0 ? (
          <span title={p.variantLabels.join(", ")}>
            {p.variantCount} variante{p.variantCount > 1 ? "s" : ""}
          </span>
        ) : (
          <span className="text-stone-400">—</span>
        )}
      </td>
      <td className="px-3 py-2.5">
        <StatusBadge active={p.visible} activeLabel="Visible" inactiveLabel={p.isActive ? "Catégorie masquée" : "Masqué"} />
      </td>
      <td className="py-2.5 pl-3 pr-4 text-right">
        <AdminLink
          href={productEditPath(p.id)}
          className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-50"
          aria-label={`Modifier ${p.name}`}
        >
          Modifier
        </AdminLink>
      </td>
    </tr>
  );
}

/** Liste des produits (lecture seule) avec recherche et filtre par catégorie. */
export function ProductsPage() {
  const data = useAdminMenuData();
  const [flash] = useState(() => takeFlash());
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);

  const products = useMemo(() => (data.rows ? buildProductList(data.rows) : []), [data.rows]);
  const categories = useMemo(() => (data.rows ? buildCategoryList(data.rows) : []), [data.rows]);
  const shown = useMemo(() => filterProducts(products, { query, categoryId }), [products, query, categoryId]);

  return (
    <>
      <PageHeader
        title="Produits"
        description="Cliquez sur un produit pour le modifier."
        actions={
          <AdminLink href={ADMIN_ROUTES.productNew} className="rounded-lg bg-kaytori-green px-4 py-2 text-sm font-semibold text-white hover:bg-kaytori-greenDark">
            + Nouveau produit
          </AdminLink>
        }
      />
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
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-stone-200 bg-stone-50 text-xs font-medium uppercase tracking-wide text-stone-500">
                <tr>
                  <th scope="col" className="py-2.5 pl-4 pr-3">Photo</th>
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
              <tbody className="divide-y divide-stone-100">
                {shown.map((p) => (
                  <ProductRow key={p.id} p={p} />
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
