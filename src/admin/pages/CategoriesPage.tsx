import { useMemo } from "react";
import { ErrorState, LoadingState, PageHeader, StatusBadge } from "../components/ui";
import { useAdminMenuData } from "../hooks/AdminMenuData";
import { DISPLAY_MODE_LABELS, buildCategoryList } from "../lib/menuAdmin";

/** Catégories dans l'ordre du menu (lecture seule). */
export function CategoriesPage() {
  const data = useAdminMenuData();
  const categories = useMemo(() => (data.rows ? buildCategoryList(data.rows) : []), [data.rows]);

  return (
    <>
      <PageHeader title="Catégories" description="Ordre d'affichage du menu public. Lecture seule pour le moment." />
      {data.status === "loading" ? <LoadingState /> : null}
      {data.status === "error" ? <ErrorState message={data.error} onRetry={data.reload} /> : null}
      {data.status === "ready" ? (
        <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-stone-200 bg-stone-50 text-xs font-medium uppercase tracking-wide text-stone-500">
              <tr>
                <th scope="col" className="py-2.5 pl-4 pr-3">Ordre</th>
                <th scope="col" className="px-3 py-2.5">Nom</th>
                <th scope="col" className="px-3 py-2.5">Produits</th>
                <th scope="col" className="px-3 py-2.5">Affichage</th>
                <th scope="col" className="py-2.5 pl-3 pr-4">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {categories.map((c) => (
                <tr key={c.id}>
                  <td className="py-2.5 pl-4 pr-3 tabular-nums text-stone-500">{c.sortOrder + 1}</td>
                  <td className="px-3 py-2.5 font-medium text-stone-900">{c.name}</td>
                  <td className="px-3 py-2.5 tabular-nums text-stone-600">
                    {c.visibleProductCount === c.productCount ? c.productCount : `${c.visibleProductCount} visibles / ${c.productCount}`}
                  </td>
                  <td className="px-3 py-2.5 text-stone-600">{DISPLAY_MODE_LABELS[c.displayMode]}</td>
                  <td className="py-2.5 pl-3 pr-4">
                    <StatusBadge active={c.isActive} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </>
  );
}
