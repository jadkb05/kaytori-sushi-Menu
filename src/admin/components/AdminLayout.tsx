import type { ReactNode } from "react";
import { BrandLogo } from "../../components/BrandLogo";
import { ADMIN_ROUTES, type AdminContentPage } from "../lib/routes";
import { AdminLink } from "./AdminLink";

const NAV: { page: Exclude<AdminContentPage, "productEdit" | "productCreate">; href: string; label: string }[] = [
  { page: "dashboard", href: ADMIN_ROUTES.dashboard, label: "Tableau de bord" },
  { page: "products", href: ADMIN_ROUTES.products, label: "Produits" },
  { page: "categories", href: ADMIN_ROUTES.categories, label: "Catégories" },
];

/** Structure de l'admin : barre latérale (desktop) / barre de navigation (mobile) + contenu. */
export function AdminLayout({
  current,
  email,
  onSignOut,
  children,
}: {
  current: AdminContentPage;
  email: string;
  onSignOut: () => void;
  children: ReactNode;
}) {
  const navLink = (item: (typeof NAV)[number]) => {
    const active =
      item.page === current || ((current === "productEdit" || current === "productCreate") && item.page === "products");
    return (
      <AdminLink
        key={item.page}
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={`block whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium max-[359px]:px-2.5 ${
          active ? "bg-kaytori-green/10 text-kaytori-green" : "text-stone-600 hover:bg-stone-100 hover:text-stone-900"
        }`}
      >
        {item.label}
      </AdminLink>
    );
  };

  return (
    <div className="min-h-dvh bg-stone-50 font-sans text-stone-800 md:flex">
      <aside className="border-b border-stone-200 bg-white md:sticky md:top-0 md:flex md:h-dvh md:w-60 md:shrink-0 md:flex-col md:border-b-0 md:border-r">
        <div className="flex items-center gap-2.5 px-4 py-4 md:px-5 md:py-5">
          <BrandLogo size={32} />
          <div className="leading-tight">
            <p className="text-sm font-semibold text-stone-900">Kaytôri Sushi</p>
            <p className="text-xs text-stone-500">Gestion du menu</p>
          </div>
        </div>
        {/* Moins de 360 px : marges un peu réduites pour que les trois onglets tiennent sans être coupés. */}
        <nav aria-label="Administration" className="flex gap-1 overflow-x-auto px-3 pb-3 max-[359px]:gap-0.5 max-[359px]:px-2 md:flex-1 md:flex-col md:overflow-visible md:pb-0">
          {NAV.map(navLink)}
        </nav>
        <div className="hidden border-t border-stone-200 px-4 py-4 md:block">
          <p className="truncate text-xs text-stone-500" title={email}>
            {email}
          </p>
          <div className="mt-2 flex items-center justify-between gap-2">
            <a href="/menu" className="text-xs font-medium text-kaytori-green hover:underline">
              Voir le menu public
            </a>
            <button type="button" onClick={onSignOut} className="text-xs font-medium text-stone-600 hover:text-stone-900">
              Déconnexion
            </button>
          </div>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">
        <div className="mx-auto max-w-6xl">{children}</div>
        <div className="mt-8 flex items-center justify-between border-t border-stone-200 pt-4 text-xs md:hidden">
          <span className="truncate text-stone-500">{email}</span>
          <button type="button" onClick={onSignOut} className="font-medium text-stone-600">
            Déconnexion
          </button>
        </div>
      </main>
    </div>
  );
}
