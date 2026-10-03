import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { whatsappHref } from "../config/site";
import { buildWhatsappOrderMessage, type CartLine } from "./buildOrderMessage";

function parseUnitPriceDh(priceMAD: string): number {
  const n = Number.parseFloat(priceMAD.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

type CartContextValue = {
  lines: readonly CartLine[];
  itemCount: number;
  totalDh: number;
  addItem: (id: string, name: string, priceMAD: string) => void;
  increment: (id: string) => void;
  decrement: (id: string) => void;
  removeLine: (id: string) => void;
  clear: () => void;
  whatsappOrderUrl: string;
};

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  /** Panier en mémoire uniquement : un rechargement de la page repart d'un panier vide. */
  const [lines, setLines] = useState<CartLine[]>([]);

  const addItem = useCallback((id: string, name: string, priceMAD: string) => {
    const unit = parseUnitPriceDh(priceMAD);
    setLines((prev) => {
      const i = prev.findIndex((x) => x.id === id);
      if (i >= 0) {
        const next = [...prev];
        next[i] = { ...next[i], quantity: next[i].quantity + 1 };
        return next;
      }
      return [...prev, { id, name, unitPriceDh: unit, quantity: 1 }];
    });
  }, []);

  const increment = useCallback((id: string) => {
    setLines((prev) =>
      prev.map((l) => (l.id === id ? { ...l, quantity: l.quantity + 1 } : l)),
    );
  }, []);

  const decrement = useCallback((id: string) => {
    setLines((prev) =>
      prev
        .map((l) => (l.id === id ? { ...l, quantity: l.quantity - 1 } : l))
        .filter((l) => l.quantity > 0),
    );
  }, []);

  const removeLine = useCallback((id: string) => {
    setLines((prev) => prev.filter((l) => l.id !== id));
  }, []);

  const clear = useCallback(() => setLines([]), []);

  const { itemCount, totalDh, whatsappOrderUrl } = useMemo(() => {
    const itemCount = lines.reduce((s, l) => s + l.quantity, 0);
    const totalDh = lines.reduce((s, l) => s + l.unitPriceDh * l.quantity, 0);
    const whatsappOrderUrl =
      lines.length > 0 ? whatsappHref(buildWhatsappOrderMessage(lines, totalDh)) : whatsappHref();
    return { itemCount, totalDh, whatsappOrderUrl };
  }, [lines]);

  const value = useMemo<CartContextValue>(
    () => ({
      lines,
      itemCount,
      totalDh,
      addItem,
      increment,
      decrement,
      removeLine,
      clear,
      whatsappOrderUrl,
    }),
    [lines, itemCount, totalDh, addItem, increment, decrement, removeLine, clear, whatsappOrderUrl],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart doit être utilisé dans CartProvider");
  return ctx;
}
