import { CartProvider } from "./cart/CartContext";
import { MenuProvider } from "./menu/MenuProvider";
import { MenuPage } from "./pages/MenuPage";

/** Menu digital Kaytôri : toutes les URL (/, /menu…) ouvrent le menu. */
export function App() {
  return (
    <MenuProvider>
      <CartProvider>
        <MenuPage />
      </CartProvider>
    </MenuProvider>
  );
}
