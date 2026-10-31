import { useMemo, type ReactNode } from "react";
import { AdminLink } from "../components/AdminLink";
import { ADMIN_LIST_PHOTO_WIDTH, AdminPhoto } from "../components/AdminPhoto";
import { ArrowRightIcon, CategoriesIcon, CheckIcon, EyeIcon, EyeOffIcon, ExternalIcon, PlusIcon, ProductsIcon, VariantsIcon } from "../components/icons";
import { ErrorState, LoadingState, PageHeader, StatCard, cardClass, focusRing } from "../components/ui";
import { useAdminMenuData } from "../hooks/AdminMenuData";
import { buildCategoryList, buildProductList, computeDashboardStats } from "../lib/menuAdmin";
import { ADMIN_ROUTES, productEditPath } from "../lib/routes";

/** Nombre d'éléments masqués listés avant « et N autres ». */
const HIDDEN_LIMIT = 6;

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? "s" : ""}`;

function todayLabel(): string {
  const label = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date());
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** Raccourci vers une page de l'admin : carte entière cliquable. */
function Shortcut({ href, icon, title, description, meta }: { href: string; icon: ReactNode; title: string; description: string; meta: string }) {
  return (
    <AdminLink
      href={href}
      className={`group flex gap-4 ${cardClass} p-4 transition-[border-color,box-shadow] duration-150 hover:border-admin-lineStrong hover:shadow-admin-md sm:flex-col sm:gap-0 sm:p-5 ${focusRing}`}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-admin-tint text-kaytori-green">{icon}</span>
        <ArrowRightIcon className="hidden h-5 w-5 text-admin-muted transition-[transform,color] duration-150 group-hover:text-kaytori-green motion-safe:group-hover:translate-x-0.5 sm:block" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-base font-semibold text-admin-ink sm:mt-4">{title}</p>
        <p className="mt-1 text-sm leading-relaxed text-admin-soft">{description}</p>
        <p className="mt-2 text-[13px] font-medium text-admin-muted sm:mt-4 sm:border-t sm:border-admin-line sm:pt-3">{meta}</p>
      </div>
    </AdminLink>
  );
}

const actionClass = `group flex items-center gap-3 ${cardClass} px-4 py-3.5 text-sm font-semibold text-admin-ink transition-[border-color,box-shadow] duration-150 hover:border-admin-lineStrong hover:shadow-admin-md ${focusRing}`;

export function DashboardPage() {
  const data = useAdminMenuData();
  const stats = useMemo(() => (data.rows ? computeDashboardStats(data.rows) : null), [data.rows]);
  const hidden = useMemo(() => {
    if (!data.rows) return null;
    return {
      categories: buildCategoryList(data.rows).filter((c) => !c.isActive),
      products: buildProductList(data.rows).filter((p) => !p.visible),
    };
  }, [data.rows]);
  const today = useMemo(todayLabel, []);

  const hiddenItems = hidden
    ? [
        ...hidden.categories.map((c) => ({
          key: `c:${c.id}`,
          href: ADMIN_ROUTES.categories,
          name: c.name,
          detail: `Catégorie masquée · ${plural(c.productCount, "produit")}`,
          image: null as string | null,
          isCategory: true,
        })),
        ...hidden.products.map((p) => ({
          key: `p:${p.id}`,
          href: productEditPath(p.id),
          name: p.name,
          detail: `${p.categoryName} · ${p.isActive ? "catégorie masquée" : "produit masqué"}`,
          image: p.imageUrl,
          isCategory: false,
        })),
      ]
    : [];

  return (
    <>
      <PageHeader
        eyebrow={
          <>
            Bonjour, M. Saad <span aria-hidden>👋</span>
          </>
        }
        title="Tableau de bord"
        description="Vue d'ensemble du menu Kaytôri Sushi : ce que voient vos clients et ce qui est masqué."
        actions={<p className="hidden rounded-full border border-admin-line bg-white px-3 py-1 text-[13px] font-medium text-admin-soft sm:block">{today}</p>}
      />
      {data.status === "loading" ? <LoadingState /> : null}
      {data.status === "error" ? <ErrorState message={data.error} onRetry={data.reload} /> : null}
      {stats && hidden ? (
        <div className="space-y-8">
          <section aria-label="Indicateurs" className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
            <StatCard
              label="Catégories actives"
              value={stats.activeCategories}
              hint={`sur ${stats.totalCategories} au total`}
              icon={<CategoriesIcon className="h-[18px] w-[18px]" />}
              ratio={stats.totalCategories ? stats.activeCategories / stats.totalCategories : 0}
            />
            <StatCard
              label="Produits visibles"
              value={stats.visibleProducts}
              hint={`sur ${stats.totalProducts} au total`}
              icon={<EyeIcon className="h-[18px] w-[18px]" />}
              ratio={stats.totalProducts ? stats.visibleProducts / stats.totalProducts : 0}
            />
            <StatCard
              label="Produits masqués"
              value={stats.hiddenProducts}
              hint="produit ou catégorie désactivé"
              icon={<EyeOffIcon className="h-[18px] w-[18px]" />}
              ratio={stats.totalProducts ? stats.hiddenProducts / stats.totalProducts : 0}
              tone="muted"
            />
            <StatCard
              label="Variantes"
              value={stats.activeVariants}
              hint={`actives, sur ${stats.totalVariants} au total`}
              icon={<VariantsIcon className="h-[18px] w-[18px]" />}
              ratio={stats.totalVariants ? stats.activeVariants / stats.totalVariants : 0}
            />
          </section>

          <div className="grid gap-x-6 gap-y-8 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <section aria-labelledby="dash-shortcuts">
              <h2 id="dash-shortcuts" className="mb-3 text-[0.9375rem] font-semibold text-admin-ink">
                Accès rapide
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <Shortcut
                  href={ADMIN_ROUTES.products}
                  icon={<ProductsIcon className="h-[22px] w-[22px]" />}
                  title="Produits"
                  description="Noms, prix, photos, variantes et ordre d'affichage dans chaque catégorie."
                  meta={`${plural(stats.totalProducts, "produit")} · ${plural(stats.totalVariants, "variante")}`}
                />
                <Shortcut
                  href={ADMIN_ROUTES.categories}
                  icon={<CategoriesIcon className="h-[22px] w-[22px]" />}
                  title="Catégories"
                  description="Ordre des sections du menu, renommage, affichage ou masquage."
                  meta={`${plural(stats.totalCategories, "catégorie")} · ${stats.activeCategories} active${stats.activeCategories > 1 ? "s" : ""}`}
                />
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <AdminLink href={ADMIN_ROUTES.productNew} className={actionClass}>
                  <span className="grid h-8 w-8 place-items-center rounded-lg bg-kaytori-green text-white">
                    <PlusIcon className="h-4 w-4" />
                  </span>
                  Nouveau produit
                  <ArrowRightIcon className="ml-auto h-4 w-4 text-admin-muted transition-[transform,color] group-hover:text-kaytori-green motion-safe:group-hover:translate-x-0.5" />
                </AdminLink>
                <a href="/menu" target="_blank" rel="noopener" className={actionClass}>
                  <span className="grid h-8 w-8 place-items-center rounded-lg bg-admin-canvas text-admin-soft">
                    <ExternalIcon className="h-4 w-4" />
                  </span>
                  Voir le menu public
                  <span className="sr-only"> (nouvel onglet)</span>
                  <ArrowRightIcon className="ml-auto h-4 w-4 text-admin-muted transition-[transform,color] group-hover:text-kaytori-green motion-safe:group-hover:translate-x-0.5" />
                </a>
              </div>
            </section>

            <section aria-labelledby="dash-hidden" className="min-w-0">
              <h2 id="dash-hidden" className="mb-3 flex items-center gap-2 text-[0.9375rem] font-semibold text-admin-ink">
                Masqués du menu
                <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-admin-soft ring-1 ring-inset ring-admin-line">{hiddenItems.length}</span>
              </h2>
              <div className={`${cardClass} overflow-hidden`}>
                {hiddenItems.length === 0 ? (
                  <div className="flex items-center gap-3 p-5 text-sm text-admin-soft">
                    <span className="grid h-8 w-8 place-items-center rounded-full bg-emerald-50 text-emerald-700">
                      <CheckIcon className="h-4 w-4" />
                    </span>
                    Tout le menu est visible par vos clients.
                  </div>
                ) : (
                  <>
                    <ul className="divide-y divide-admin-line">
                      {hiddenItems.slice(0, HIDDEN_LIMIT).map((item) => (
                        <li key={item.key}>
                          <AdminLink href={item.href} className={`group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-admin-subtle ${focusRing} focus-visible:ring-inset focus-visible:ring-offset-0`}>
                            {item.isCategory ? (
                              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-admin-canvas text-admin-soft">
                                <CategoriesIcon className="h-4 w-4" />
                              </span>
                            ) : item.image ? (
                              <AdminPhoto src={item.image} photoWidth={ADMIN_LIST_PHOTO_WIDTH} alt="" width={36} height={36} loading="lazy" className="h-9 w-9 shrink-0 rounded-lg bg-[#0f1815] object-cover opacity-80 grayscale-[35%]" />
                            ) : (
                              <span className="h-9 w-9 shrink-0 rounded-lg bg-admin-canvas" aria-hidden />
                            )}
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium text-admin-ink group-hover:text-kaytori-green">{item.name}</span>
                              <span className="block truncate text-xs text-admin-muted">{item.detail}</span>
                            </span>
                            <ArrowRightIcon className="h-4 w-4 shrink-0 text-admin-muted opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
                          </AdminLink>
                        </li>
                      ))}
                    </ul>
                    {hiddenItems.length > HIDDEN_LIMIT ? (
                      <p className="border-t border-admin-line bg-admin-subtle px-4 py-2.5 text-[13px] text-admin-muted">
                        {hiddenItems.length - HIDDEN_LIMIT > 1
                          ? `et ${hiddenItems.length - HIDDEN_LIMIT} autres éléments masqués`
                          : "et 1 autre élément masqué"}
                      </p>
                    ) : null}
                  </>
                )}
              </div>
            </section>
          </div>
        </div>
      ) : null}
    </>
  );
}
