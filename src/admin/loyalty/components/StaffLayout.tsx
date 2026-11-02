/**
 * Structure de l'administration de la fidélité (/admin/fidelite…) :
 * interface sobre, claire et opérationnelle sur fond clair (admin-canvas),
 * alignée avec l'administration générale (/admin).
 *
 * Navigation à 4 sections : Tableau de bord, Clients, Récompenses, Paramètres.
 * La section « Scanner une carte » a été supprimée : le scan QR se fait directement
 * avec l'appareil photo du téléphone du manager sur /fidelite/scan/:code.
 */
import type { ReactNode } from "react";
import { BrandLogo } from "../../../components/BrandLogo";
import { AdminLink } from "../../components/AdminLink";
import { CoinsIcon, ExternalIcon, GiftIcon, HomeIcon, LogoutIcon, UsersIcon } from "../../components/icons";
import { ADMIN_ROUTES } from "../../lib/routes";
import { STAFF_ROUTES, type StaffRoute } from "../routes";
import { useStaff } from "../StaffContext";
import { ring } from "./staffUi";

export type Section = "home" | "clients" | "rewards" | "points";

export const STAFF_NAV: { id: Section; href: string; label: string; short: string; icon: typeof UsersIcon }[] = [
  { id: "home", href: STAFF_ROUTES.home, label: "Tableau de bord", short: "Accueil", icon: HomeIcon },
  { id: "clients", href: STAFF_ROUTES.clients, label: "Clients", short: "Clients", icon: UsersIcon },
  { id: "rewards", href: STAFF_ROUTES.rewards, label: "Récompenses", short: "Récompenses", icon: GiftIcon },
  { id: "points", href: STAFF_ROUTES.points, label: "Paramètres & Points", short: "Paramètres", icon: CoinsIcon },
];

const NAV = STAFF_NAV;

export function sectionOf(route: StaffRoute): Section | null {
  switch (route.page) {
    case "home":
    case "clients":
    case "rewards":
    case "points":
      return route.page;
    case "card":
      return "clients";
    default:
      return null;
  }
}

function BrandHeader({ compact = false }: { compact?: boolean }) {
  return (
    <span className="min-w-0 leading-tight">
      <span className={`block font-semibold tracking-tight text-admin-ink ${compact ? "text-[0.95rem]" : "text-[1.05rem]"}`}>
        Kaytôri Club
      </span>
      <span className="block text-[0.72rem] font-medium text-admin-muted">Administration fidélité</span>
    </span>
  );
}

export function StaffLayout({ section, children }: { section: Section | null; children: ReactNode }) {
  const { mode, role, identity, lock } = useStaff();
  const demo = mode === "demo";
  const roleLabel = role === "owner" ? "Responsable" : "Manager";

  return (
    <div className="min-h-dvh bg-admin-canvas font-sans text-admin-ink antialiased lg:flex">
      {/* ------------------------------------------------ barre latérale (ordinateur ≥ 1024px) */}
      <aside className="hidden border-r border-admin-line bg-white lg:sticky lg:top-0 lg:flex lg:h-dvh lg:w-64 lg:shrink-0 lg:flex-col">
        <div className="border-b border-admin-line px-4 py-4">
          <AdminLink href={STAFF_ROUTES.home} className={`flex items-center gap-3 rounded-xl p-1 ${ring}`}>
            <BrandLogo size={40} className="ring-1 ring-admin-lineStrong" />
            <BrandHeader />
          </AdminLink>
        </div>

        <nav aria-label="Administration fidélité" className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {NAV.map((item) => {
            const active = item.id === section;
            const Icon = item.icon;
            return (
              <AdminLink
                key={item.id}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-[42px] items-center gap-3 rounded-xl px-3.5 text-[0.9rem] font-medium transition-colors ${ring} ${
                  active
                    ? "bg-admin-accent text-white shadow-admin-xs"
                    : "text-admin-muted hover:bg-admin-canvas hover:text-admin-ink"
                }`}
              >
                <Icon className={`h-[18px] w-[18px] shrink-0 ${active ? "text-white" : "text-admin-soft"}`} />
                {item.label}
              </AdminLink>
            );
          })}
        </nav>

        <div className="space-y-2 border-t border-admin-line p-3">
          {role === "owner" ? (
            <AdminLink
              href={ADMIN_ROUTES.dashboard}
              className={`flex min-h-[40px] items-center gap-2.5 rounded-xl px-3 text-[0.86rem] font-medium text-admin-muted hover:bg-admin-canvas hover:text-admin-ink ${ring}`}
            >
              <ExternalIcon className="h-4 w-4 text-admin-soft" />
              Gestion du menu
            </AdminLink>
          ) : null}
          <div className="flex items-center gap-2.5 rounded-xl border border-admin-line bg-admin-canvas/60 px-3 py-2">
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-[0.82rem] font-medium text-admin-ink" title={identity}>
                {identity}
              </p>
              <p className="mt-0.5 text-[0.72rem] text-admin-muted">
                {roleLabel}
                {demo ? " · banc local" : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={lock}
              aria-label="Déconnexion"
              title="Déconnexion"
              className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg text-admin-muted hover:bg-white hover:text-admin-ink ${ring}`}
            >
              <LogoutIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* ------------------------------------------------ en-tête mobile & tablette */}
        <header className="sticky top-0 z-30 border-b border-admin-line bg-white/95 backdrop-blur lg:hidden">
          <div className="flex h-14 items-center gap-3 px-4">
            <AdminLink href={STAFF_ROUTES.home} className={`flex min-w-0 items-center gap-2.5 rounded-lg ${ring}`}>
              <BrandLogo size={34} className="ring-1 ring-admin-lineStrong" />
              <BrandHeader compact />
            </AdminLink>
            <div className="ml-auto flex items-center gap-1.5">
              {role === "owner" ? (
                <AdminLink
                  href={ADMIN_ROUTES.dashboard}
                  className={`hidden items-center gap-1.5 rounded-lg border border-admin-line px-2.5 py-1.5 text-[0.78rem] font-medium text-admin-muted hover:bg-admin-canvas sm:inline-flex ${ring}`}
                >
                  <ExternalIcon className="h-3.5 w-3.5" />
                  Menu
                </AdminLink>
              ) : null}
              <span className="rounded-full bg-admin-accentSoft px-2.5 py-1 text-[0.74rem] font-semibold text-admin-accent">
                {roleLabel}
              </span>
              <button
                type="button"
                onClick={lock}
                aria-label="Déconnexion"
                title="Déconnexion"
                className={`grid h-9 w-9 place-items-center rounded-lg text-admin-muted hover:bg-admin-canvas hover:text-admin-ink ${ring}`}
              >
                <LogoutIcon className="h-4 w-4" />
              </button>
            </div>
          </div>
        </header>

        {demo ? (
          <div className="mx-4 mt-3 rounded-xl border border-admin-warn/25 bg-admin-warnSoft px-3.5 py-2 text-[0.8rem] text-admin-warn sm:mx-6 lg:mx-8 lg:mt-5">
            Environnement de test local (PGlite) : données enregistrées dans ce navigateur uniquement.
          </div>
        ) : null}

        <main
          id="contenu-principal"
          className="mx-auto w-full max-w-7xl flex-1 px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-5 sm:px-6 lg:px-8 lg:pb-12 lg:pt-7"
        >
          {children}
        </main>
      </div>

      {/* ------------------------------------------------ barre d'onglets basse (mobile & tablette) */}
      <nav
        aria-label="Administration fidélité"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-admin-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      >
        <ul className="mx-auto grid h-16 max-w-xl grid-cols-4">
          {NAV.map((item) => {
            const active = item.id === section;
            const Icon = item.icon;
            return (
              <li key={item.id} className="min-w-0">
                <AdminLink
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex h-full flex-col items-center justify-center gap-1 px-1 text-[0.7rem] font-medium leading-none ${ring} ${
                    active ? "text-admin-accent" : "text-admin-muted hover:text-admin-ink"
                  }`}
                >
                  <span
                    className={`grid h-7 w-11 place-items-center rounded-full ${
                      active ? "bg-admin-accentSoft text-admin-accent" : ""
                    }`}
                  >
                    <Icon className="h-[18px] w-[18px]" />
                  </span>
                  <span className="max-w-full truncate">{item.short}</span>
                </AdminLink>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
