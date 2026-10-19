import type { ReactNode } from "react";
import { BrandLogo } from "../../components/BrandLogo";
import { ADMIN_ROUTES, type AdminContentPage } from "../lib/routes";
import { AdminLink } from "./AdminLink";
import { CategoriesIcon, DashboardIcon, ExternalIcon, FormulesIcon, LogoutIcon, ProductsIcon } from "./icons";
import { focusRing } from "./ui";

const NAV: { page: Exclude<AdminContentPage, "productEdit" | "productCreate" | "formuleEdit" | "formuleCreate">; href: string; label: string; icon: typeof DashboardIcon }[] = [
  { page: "dashboard", href: ADMIN_ROUTES.dashboard, label: "Tableau de bord", icon: DashboardIcon },
  { page: "products", href: ADMIN_ROUTES.products, label: "Produits", icon: ProductsIcon },
  { page: "formules", href: ADMIN_ROUTES.formules, label: "Formules", icon: FormulesIcon },
  { page: "categories", href: ADMIN_ROUTES.categories, label: "Catégories", icon: CategoriesIcon },
];

/**
 * Structure de l'admin.
 * Ordinateur (≥ 1024 px) : barre latérale fixe (marque, navigation, menu public, compte).
 * Téléphone et tablette : bandeau (marque, menu public, déconnexion) + barre d'onglets en bas d'écran,
 * à portée de pouce, au-dessus de la zone de sécurité de l'iPhone.
 */
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
  const isActive = (item: (typeof NAV)[number]) =>
    item.page === current ||
    ((current === "productEdit" || current === "productCreate") && item.page === "products") ||
    ((current === "formuleEdit" || current === "formuleCreate") && item.page === "formules");
  const initial = (email.trim()[0] ?? "A").toUpperCase();

  return (
    <div className="min-h-dvh bg-admin-canvas font-sans text-admin-ink antialiased lg:flex">
      {/* ------------------------------------------------ barre latérale (ordinateur) */}
      <aside className="hidden border-r border-admin-line bg-white lg:sticky lg:top-0 lg:flex lg:h-dvh lg:w-64 lg:shrink-0 lg:flex-col">
        <div className="flex h-[4.5rem] items-center gap-3 border-b border-admin-line px-5">
          <BrandLogo size={36} className="ring-1 ring-admin-line" />
          <div className="min-w-0 leading-tight">
            <p className="truncate font-display text-[1.0625rem] font-semibold text-admin-ink">Kaytôri Sushi</p>
            <p className="mt-0.5 text-xs text-admin-muted">Administration du menu</p>
          </div>
        </div>
        <nav aria-label="Administration" className="flex-1 overflow-y-auto px-3 py-5">
          <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-admin-muted">Gestion</p>
          <ul className="space-y-0.5">
            {NAV.map((item) => {
              const active = isActive(item);
              const Icon = item.icon;
              return (
                <li key={item.page}>
                  <AdminLink
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`group relative flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors duration-150 ${focusRing} ${
                      active ? "bg-admin-tint text-kaytori-green" : "text-admin-soft hover:bg-admin-canvas hover:text-admin-ink"
                    }`}
                  >
                    {active ? <span className="absolute -left-3 top-2 h-6 w-[3px] rounded-r-full bg-kaytori-green" aria-hidden /> : null}
                    <Icon className={`h-[18px] w-[18px] ${active ? "text-kaytori-green" : "text-admin-muted group-hover:text-admin-soft"}`} />
                    {item.label}
                  </AdminLink>
                </li>
              );
            })}
          </ul>
          <p className="mt-7 px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-admin-muted">Site</p>
          <a
            href="/menu"
            target="_blank"
            rel="noopener"
            className={`group flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium text-admin-soft transition-colors hover:bg-admin-canvas hover:text-admin-ink ${focusRing}`}
          >
            <ExternalIcon className="h-[18px] w-[18px] text-admin-muted group-hover:text-admin-soft" />
            Voir le menu public
            <span className="sr-only"> (nouvel onglet)</span>
          </a>
        </nav>
        <div className="border-t border-admin-line p-3">
          <div className="flex items-center gap-3 rounded-lg px-2 py-2">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-admin-tint text-sm font-semibold text-kaytori-green" aria-hidden>
              {initial}
            </span>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-[13px] font-medium text-admin-ink" title={email}>
                {email}
              </p>
              <p className="mt-0.5 text-xs text-admin-muted">Administrateur</p>
            </div>
            <button
              type="button"
              onClick={onSignOut}
              title="Déconnexion"
              aria-label="Déconnexion"
              className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg text-admin-muted transition-colors hover:bg-admin-canvas hover:text-admin-ink ${focusRing}`}
            >
              <LogoutIcon className="h-[18px] w-[18px]" />
            </button>
          </div>
        </div>
      </aside>

      {/* ------------------------------------------------ bandeau (téléphone, tablette) */}
      <header className="flex h-14 items-center justify-between gap-3 border-b border-admin-line bg-white px-4 sm:px-6 lg:hidden">
        <div className="flex min-w-0 items-center gap-2.5">
          <BrandLogo size={30} className="ring-1 ring-admin-line" />
          <p className="truncate font-display text-base font-semibold">Kaytôri Sushi</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <a
            href="/menu"
            target="_blank"
            rel="noopener"
            title="Voir le menu public"
            aria-label="Voir le menu public (nouvel onglet)"
            className={`grid h-10 w-10 place-items-center rounded-lg text-admin-soft hover:bg-admin-canvas ${focusRing}`}
          >
            <ExternalIcon className="h-5 w-5" />
          </a>
          <button
            type="button"
            onClick={onSignOut}
            title="Déconnexion"
            aria-label="Déconnexion"
            className={`grid h-10 w-10 place-items-center rounded-lg text-admin-soft hover:bg-admin-canvas ${focusRing}`}
          >
            <LogoutIcon className="h-5 w-5" />
          </button>
        </div>
      </header>

      <main className="min-w-0 flex-1 px-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] pt-6 sm:px-6 lg:px-8 lg:pb-12 lg:pt-10 xl:px-10">
        <div key={current} className="mx-auto max-w-[76rem] motion-safe:animate-admin-in">
          {children}
        </div>
        <p className="mx-auto mt-10 max-w-[76rem] truncate border-t border-admin-line pt-4 text-xs text-admin-muted lg:hidden">
          Connecté : {email}
        </p>
      </main>

      {/* ------------------------------------------------ onglets (téléphone, tablette) */}
      <nav
        aria-label="Administration"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-admin-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur supports-[backdrop-filter]:bg-white/85 lg:hidden"
      >
        <ul className="mx-auto grid h-16 max-w-lg grid-cols-4">
          {NAV.map((item) => {
            const active = isActive(item);
            const Icon = item.icon;
            return (
              <li key={item.page} className="min-w-0">
                <AdminLink
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex h-full flex-col items-center justify-center gap-1 px-1 text-[11px] font-medium leading-none transition-colors ${focusRing} focus-visible:ring-inset focus-visible:ring-offset-0 ${
                    active ? "text-kaytori-green" : "text-admin-muted hover:text-admin-ink"
                  }`}
                >
                  <span className={`grid h-7 w-12 place-items-center rounded-full transition-colors ${active ? "bg-admin-tint" : ""}`}>
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="max-w-full truncate">{item.label}</span>
                </AdminLink>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
