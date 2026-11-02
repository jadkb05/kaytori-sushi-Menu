import { Suspense, lazy } from "react";
import { isAdminPath } from "./admin/lib/routes";
import { CartProvider } from "./cart/CartContext";
import { isLoyaltyPath } from "./loyalty/routes";
import { MenuProvider } from "./menu/MenuProvider";
import { MenuPage } from "./pages/MenuPage";

/** Espace d'administration, téléchargé uniquement sur les chemins /admin. */
const AdminApp = lazy(() => import("./admin/AdminApp"));
/** Carte de fidélité, téléchargée uniquement sur les chemins /fidelite (sans menu ni panier). */
const LoyaltyApp = lazy(() => import("./loyalty/LoyaltyApp"));

/**
 * Menu digital Kaytôri (menu/index.html) : /menu ouvre le menu ; /admin le CMS ; /fidelite la carte de fidélité.
 * La page d'accueil (/) a sa propre entrée : src/home/main.tsx.
 */
export function App() {
  if (isAdminPath(window.location.pathname)) {
    return (
      <Suspense fallback={null}>
        <AdminApp />
      </Suspense>
    );
  }
  if (isLoyaltyPath(window.location.pathname)) {
    return (
      <Suspense fallback={<div className="min-h-dvh bg-kaytori-page" />}>
        <LoyaltyApp />
      </Suspense>
    );
  }
  return (
    <MenuProvider>
      <CartProvider>
        <MenuPage />
      </CartProvider>
    </MenuProvider>
  );
}
