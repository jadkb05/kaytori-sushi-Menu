import { useEffect, useRef, useState } from "react";
import { useCart } from "./CartContext";

/**
 * Région aria-live invisible : annonce chaque ajout au panier aux lecteurs d'écran
 * (« Crevettes Dynamite ajouté, 2 articles »). Lecture seule du panier, aucun rendu visible.
 */
export function CartAnnouncer() {
  const { lines, itemCount } = useCart();
  const [message, setMessage] = useState("");
  /** Quantités au rendu précédent, pour retrouver la ligne qui vient d'augmenter. */
  const previous = useRef<Map<string, number>>(new Map(lines.map((l) => [l.id, l.quantity])));

  useEffect(() => {
    const added = lines.find((l) => l.quantity > (previous.current.get(l.id) ?? 0));
    previous.current = new Map(lines.map((l) => [l.id, l.quantity]));
    if (!added) return;
    setMessage(`${added.name} ajouté, ${itemCount} article${itemCount > 1 ? "s" : ""}`);
  }, [lines, itemCount]);

  return (
    <div className="sr-only" aria-live="polite" aria-atomic="true">
      {message}
    </div>
  );
}
