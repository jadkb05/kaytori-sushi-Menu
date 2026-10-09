/**
 * Espace /admin (CMS du menu) — chargé séparément du menu public (import dynamique dans App.tsx).
 *
 *   /admin/login        connexion
 *   /admin              tableau de bord
 *   /admin/products     produits
 *   /admin/products/new création d'un produit
 *   /admin/products/:id édition d'un produit existant
 *   /admin/categories   catégories (lecture seule)
 */
import { useEffect, useMemo } from "react";
import { getSupabaseClient } from "../lib/supabase/client";
import { AdminLayout } from "./components/AdminLayout";
import { CenteredCard, LoadingState } from "./components/ui";
import { AdminMenuDataProvider } from "./hooks/AdminMenuData";
import { useAdminAuth } from "./hooks/useAdminAuth";
import { navigate, useAdminPath } from "./hooks/useAdminPath";
import { signInAdmin, signOutAdmin } from "./lib/auth";
import { resolveAdminRoute } from "./lib/routes";
import { AccessDeniedPage, AccessErrorPage, UnconfiguredPage } from "./pages/AccessPages";
import { CategoriesPage } from "./pages/CategoriesPage";
import { DashboardPage } from "./pages/DashboardPage";
import { LoginPage } from "./pages/LoginPage";
import { ProductCreatePage } from "./pages/ProductCreatePage";
import { ProductEditPage } from "./pages/ProductEditPage";
import { ProductsPage } from "./pages/ProductsPage";

/** Titre de l'onglet et exclusion des moteurs de recherche, le temps de la visite de l'admin. */
function useAdminDocument() {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = "Administration — Kaytôri Sushi";
    const robots = document.createElement("meta");
    robots.name = "robots";
    robots.content = "noindex, nofollow";
    document.head.appendChild(robots);
    return () => {
      document.title = previousTitle;
      robots.remove();
    };
  }, []);
}

export default function AdminApp() {
  useAdminDocument();
  const client = useMemo(() => getSupabaseClient(), []);
  const { access, refresh } = useAdminAuth(client);
  const path = useAdminPath();
  const decision = resolveAdminRoute(path, access);
  const redirectTo = decision.kind === "redirect" ? decision.to : null;

  useEffect(() => {
    if (redirectTo) navigate(redirectTo, { replace: true });
  }, [redirectTo]);

  const signOut = () => {
    if (client) void signOutAdmin(client);
  };

  if (decision.kind !== "page") {
    return (
      <CenteredCard>
        <LoadingState label="Vérification de l'accès…" />
      </CenteredCard>
    );
  }

  switch (decision.page) {
    case "unconfigured":
      return <UnconfiguredPage />;
    case "error":
      return <AccessErrorPage message={access.status === "error" ? access.message : ""} onRetry={refresh} />;
    case "login":
      return <LoginPage onSignIn={(email, password) => signInAdmin(client!, email, password)} />;
    case "denied":
      return <AccessDeniedPage email={access.status === "notAdmin" ? access.email : ""} onSignOut={signOut} />;
    default:
      return (
        <AdminMenuDataProvider client={client!}>
          <AdminLayout current={decision.page} email={access.status === "admin" ? access.email : ""} onSignOut={signOut}>
            {decision.page === "dashboard" ? <DashboardPage /> : null}
            {decision.page === "products" ? <ProductsPage client={client!} /> : null}
            {decision.page === "categories" ? <CategoriesPage client={client!} /> : null}
            {decision.page === "productCreate" ? <ProductCreatePage client={client!} /> : null}
            {decision.page === "productEdit" && decision.productId ? (
              <ProductEditPage productId={decision.productId} client={client!} />
            ) : null}
          </AdminLayout>
        </AdminMenuDataProvider>
      );
  }
}
