import { CartProvider } from "./cart/CartContext";
import { MenuPage } from "./pages/MenuPage";

/** Menu digital Kaytôri : toutes les URL (/, /menu…) ouvrent le menu. */
export function App() {
  return (
    <CartProvider>
      <MenuPage />
    </CartProvider>
  );
}
