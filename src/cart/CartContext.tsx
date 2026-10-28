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
import { forgetSavedCheckout, prefilledCheckout, readSavedCheckout, saveCheckout } from "./savedCheckout";

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
  /** Coordonnées saisies : conservées en mémoire entre les étapes et les ouvertures du panier,
   * et sur l'appareil seulement si le client coche « Mémoriser mes informations… ». */
  checkout: CheckoutInfo;
  setCheckout: (next: CheckoutInfo) => void;
  /** Case « Mémoriser mes informations… » : cochée seulement si le client l'a déjà choisie. */
  rememberCheckout: boolean;
  /** Décocher efface immédiatement les coordonnées mémorisées sur l'appareil. */
  setRememberCheckout: (remember: boolean) => void;
  /** Le formulaire a été prérempli depuis l'appareil (indicateur discret). */
  checkoutPrefilled: boolean;
  /** « Effacer » : vide les champs préremplis et oublie les coordonnées mémorisées. */
  forgetCheckout: () => void;
  /** À l'envoi de la commande : mémorise les coordonnées si le client l'a demandé. */
  persistCheckout: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  /** Panier en mémoire uniquement : un rechargement de la page repart d'un panier vide. */
  const [lines, setLines] = useState<CartLine[]>([]);
  /**
   * Coordonnées en mémoire, préremplies une seule fois au chargement depuis l'appareil si le client
   * a choisi de les mémoriser : une saisie ou un champ effacé n'est jamais écrasé ensuite.
   */
  const [initial] = useState(() => {
    const saved = readSavedCheckout();
    return { checkout: prefilledCheckout(saved), remembered: saved !== null };
  });
  const [checkout, setCheckout] = useState<CheckoutInfo>(initial.checkout);
  const [rememberCheckout, setRemember] = useState(initial.remembered);
  const [checkoutPrefilled, setCheckoutPrefilled] = useState(initial.remembered);

  const setRememberCheckout = useCallback((remember: boolean) => {
    setRemember(remember);
    if (!remember) forgetSavedCheckout();
  }, []);

  const forgetCheckout = useCallback(() => {
    forgetSavedCheckout();
    setRemember(false);
    setCheckoutPrefilled(false);
    // Mode et paiement ne sont pas des coordonnées : le choix en cours est gardé.
    setCheckout((prev) => ({ ...EMPTY_CHECKOUT, mode: prev.mode, payment: prev.payment }));
  }, []);

  const persistCheckout = useCallback(() => {
    if (rememberCheckout) saveCheckout(checkout);
  }, [rememberCheckout, checkout]);

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
      rememberCheckout,
      setRememberCheckout,
      checkoutPrefilled,
      forgetCheckout,
      persistCheckout,
    }),
    [
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
      rememberCheckout,
      setRememberCheckout,
      checkoutPrefilled,
      forgetCheckout,
      persistCheckout,
    ],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart doit être utilisé dans CartProvider");
  return ctx;
}
