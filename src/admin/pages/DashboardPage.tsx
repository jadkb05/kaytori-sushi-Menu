import { useMemo } from "react";
import { AdminLink } from "../components/AdminLink";
import { ErrorState, LoadingState, PageHeader, StatCard } from "../components/ui";
import { useAdminMenuData } from "../hooks/AdminMenuData";
import { computeDashboardStats } from "../lib/menuAdmin";
import { ADMIN_ROUTES } from "../lib/routes";

export function DashboardPage() {
  const data = useAdminMenuData();
  const stats = useMemo(() => (data.rows ? computeDashboardStats(data.rows) : null), [data.rows]);

  return (
    <>
      <PageHeader title="Tableau de bord" description="Vue d'ensemble du contenu du menu." />
      {data.status === "loading" ? <LoadingState /> : null}
      {data.status === "error" ? <ErrorState message={data.error} onRetry={data.reload} /> : null}
      {stats ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Catégories actives" value={stats.activeCategories} hint={`sur ${stats.totalCategories} au total`} />
            <StatCard label="Produits visibles" value={stats.visibleProducts} hint={`sur ${stats.totalProducts} au total`} />
            <StatCard label="Produits masqués" value={stats.hiddenProducts} hint="produit ou catégorie désactivé" />
            <StatCard label="Variantes" value={stats.activeVariants} hint={`actives, sur ${stats.totalVariants} au total`} />
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <AdminLink href={ADMIN_ROUTES.products} className="rounded-xl border border-stone-200 bg-white p-5 hover:border-stone-300">
              <p className="font-medium text-stone-900">Produits</p>
              <p className="mt-1 text-sm text-stone-500">Consulter les produits, prix, photos et variantes.</p>
            </AdminLink>
            <AdminLink href={ADMIN_ROUTES.categories} className="rounded-xl border border-stone-200 bg-white p-5 hover:border-stone-300">
              <p className="font-medium text-stone-900">Catégories</p>
              <p className="mt-1 text-sm text-stone-500">Consulter l'ordre et le contenu des catégories.</p>
            </AdminLink>
          </div>
        </>
      ) : null}
    </>
  );
}
