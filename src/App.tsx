import { Suspense, lazy } from "react";
import { isAdminPath } from "./admin/lib/routes";
import { CartProvider } from "./cart/CartContext";
import { MenuProvider } from "./menu/MenuProvider";
import { MenuPage } from "./pages/MenuPage";

/** Espace d'administration, téléchargé uniquement sur les chemins /admin. */
const AdminApp = lazy(() => import("./admin/AdminApp"));

/** Menu digital Kaytôri : toutes les URL (/, /menu…) ouvrent le menu ; /admin ouvre le CMS. */
export function App() {
  if (isAdminPath(window.location.pathname)) {
    return (
      <Suspense fallback={null}>
        <AdminApp />
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
