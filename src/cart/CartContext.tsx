import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { whatsappHref } from "../config/site";
import {
  isFormuleMidiAvailableAt,
  isFormuleMidiOffer,
} from "../data/formuleMidiAvailability";
import { useOptionalMenu } from "../menu/MenuProvider";
import { buildWhatsappOrderMessage, categoryLookupFromMenu, type CartLine } from "./buildOrderMessage";
import { EMPTY_CHECKOUT, type CheckoutDetails, type CheckoutInfo } from "./checkout";

function parseUnitPriceDh(priceMAD: string): number {
  const n = Number.parseFloat(priceMAD.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function productIdFromCartLineId(lineId: string): string {
  const sep = lineId.indexOf(":");
  return sep >= 0 ? lineId.slice(0, sep) : lineId;
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
  /** Lien WhatsApp du même message, complété des coordonnées client (récapitulatif final). */
  whatsappOrderUrlWith: (checkout: CheckoutDetails) => string;
  /** Coordonnées saisies : conservées en mémoire entre les étapes et les ouvertures du panier. */
  checkout: CheckoutInfo;
  setCheckout: (next: CheckoutInfo) => void;
};

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  /** Panier en mémoire uniquement : un rechargement de la page repart d'un panier vide. */
  const [lines, setLines] = useState<CartLine[]>([]);
  /** Coordonnées en mémoire uniquement (aucun stockage navigateur ni serveur). */
  const [checkout, setCheckout] = useState<CheckoutInfo>(EMPTY_CHECKOUT);

  /** Catégories du menu réellement chargé (Supabase ou statique) pour le message WhatsApp. */
  const menu = useOptionalMenu();
  const dishById = useMemo(() => new Map((menu?.items ?? []).map((it) => [it.id, it])), [menu]);

  const midiBlockedForLine = useCallback(
    (lineId: string) => {
      if (isFormuleMidiAvailableAt()) return false;
      const dish = dishById.get(productIdFromCartLineId(lineId));
      return Boolean(dish && isFormuleMidiOffer(dish));
    },
    [dishById],
  );

  const addItem = useCallback(
    (id: string, name: string, priceMAD: string) => {
      if (midiBlockedForLine(id)) return;
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
    },
    [midiBlockedForLine],
  );

  const increment = useCallback(
    (id: string) => {
      if (midiBlockedForLine(id)) return;
      setLines((prev) => prev.map((l) => (l.id === id ? { ...l, quantity: l.quantity + 1 } : l)));
    },
    [midiBlockedForLine],
  );

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

  const categories = useMemo(() => (menu ? categoryLookupFromMenu(menu.items) : undefined), [menu]);

  const { itemCount, totalDh, whatsappOrderUrl } = useMemo(() => {
    const itemCount = lines.reduce((s, l) => s + l.quantity, 0);
    const totalDh = lines.reduce((s, l) => s + l.unitPriceDh * l.quantity, 0);
    const whatsappOrderUrl =
      lines.length > 0 ? whatsappHref(buildWhatsappOrderMessage(lines, totalDh, categories)) : whatsappHref();
    return { itemCount, totalDh, whatsappOrderUrl };
  }, [lines, categories]);

  const whatsappOrderUrlWith = useCallback(
    (details: CheckoutDetails) => whatsappHref(buildWhatsappOrderMessage(lines, totalDh, categories, details)),
    [lines, totalDh, categories],
  );

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
      whatsappOrderUrlWith,
      checkout,
      setCheckout,
    }),
    [lines, itemCount, totalDh, addItem, increment, decrement, removeLine, clear, whatsappOrderUrl, whatsappOrderUrlWith, checkout],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart doit être utilisé dans CartProvider");
  return ctx;
}
