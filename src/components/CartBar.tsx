import { useCallback, useEffect, useRef, useState } from "react";
import { useCart } from "../cart/CartContext";
import { formatDhAmount } from "../cart/formatDh";
import { lineSubtotalDh } from "../cart/buildOrderMessage";
import { CartIcon } from "./Icons";
import { OrderReview } from "./OrderReview";

export function CartBar() {
  const { lines, itemCount, totalDh, increment, decrement, removeLine, clear } = useCart();
  const [open, setOpen] = useState(false);
  /** Récapitulatif de commande (étape avant WhatsApp). */
  const [reviewOpen, setReviewOpen] = useState(false);
  const commandRef = useRef<HTMLButtonElement>(null);
  const closeReview = useCallback(() => {
    setReviewOpen(false);
    commandRef.current?.focus({ preventScroll: true });
  }, []);
  const editFromReview = useCallback(() => {
    setReviewOpen(false);
    setOpen(true);
  }, []);
  /** Incrémenté à chaque ajout : rejoue l'animation de la barre (feedback visuel uniquement). */
  const [bump, setBump] = useState(0);
  const prevCount = useRef(itemCount);
  /** Vrai quand la hausse de quantité vient du « + » du panneau : il ne doit pas se refermer. */
  const incrementFromPanel = useRef(false);

  useEffect(() => {
    if (itemCount > prevCount.current) {
      setBump((b) => b + 1);
      // Après un ajout depuis le menu, on reste sur le menu : seule la barre panier est visible.
      if (!incrementFromPanel.current) setOpen(false);
    }
    incrementFromPanel.current = false;
    prevCount.current = itemCount;
  }, [itemCount]);

  if (itemCount === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[45] flex flex-col items-stretch px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 max-md:px-2 sm:px-5">
      {open ? (
        <div className="pointer-events-auto mx-auto mb-2 w-full max-w-lg">
          <div className="max-h-[min(58vh,480px)] overflow-y-auto overscroll-y-contain rounded-2xl border border-kaytori-green/25 bg-gradient-to-br from-white/88 via-emerald-50/75 to-kaytori-green/[0.14] shadow-[0_-12px_48px_-8px_rgba(0,77,51,0.22)] backdrop-blur-xl backdrop-saturate-150">
            <div className="flex min-h-[52px] items-center justify-between border-b border-kaytori-green/15 bg-kaytori-green/[0.04] px-4 py-3">
              <p className="font-display text-base font-semibold text-kaytori-black">Panier</p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="min-h-[44px] min-w-[44px] rounded-xl px-3 text-sm font-semibold text-kaytori-muted hover:bg-kaytori-cream/80 hover:text-kaytori-black"
              >
                Fermer
              </button>
            </div>
            <ul className="divide-y divide-kaytori-green/10 px-1 py-1">
              {lines.map((l) => (
                <li key={l.id} className="flex items-center gap-2 py-3 pl-2 pr-1">
                  <div className="min-w-0 flex-1">
                    <p className="text-[0.86rem] font-semibold leading-snug text-kaytori-black">{l.name}</p>
                    <p className="mt-0.5 text-[0.74rem] text-kaytori-muted">
                      {formatDhAmount(l.unitPriceDh)} DH / unité
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5 rounded-xl border border-kaytori-black/10 bg-kaytori-cream/50 p-1">
                    <button
                      type="button"
                      onClick={() => decrement(l.id)}
                      className="grid min-h-[44px] min-w-[44px] place-items-center rounded-lg text-xl font-medium leading-none text-kaytori-black hover:bg-white active:bg-white"
                      aria-label={`Retirer une unité de ${l.name}`}
                    >
                      −
                    </button>
                    <span className="min-w-[1.5rem] px-0.5 text-center text-base font-bold tabular-nums text-kaytori-black">
                      {l.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        incrementFromPanel.current = true;
                        increment(l.id);
                      }}
                      className="grid min-h-[44px] min-w-[44px] place-items-center rounded-lg text-xl font-medium leading-none text-kaytori-black hover:bg-white active:bg-white"
                      aria-label={`Ajouter une unité de ${l.name}`}
                    >
                      +
                    </button>
                  </div>
                  <div className="w-[4.25rem] shrink-0 text-right">
                    <p className="text-[0.82rem] font-bold tabular-nums text-kaytori-black">
                      {formatDhAmount(lineSubtotalDh(l))}
                    </p>
                    <button
                      type="button"
                      onClick={() => removeLine(l.id)}
                      className="mt-1 min-h-[36px] text-[0.7rem] font-semibold text-kaytori-muted underline decoration-kaytori-muted/40 hover:text-kaytori-black"
                    >
                      Retirer
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            <div className="flex min-h-[52px] flex-wrap items-center justify-between gap-2 border-t border-kaytori-green/15 bg-kaytori-green/[0.04] px-4 py-3">
              <button
                type="button"
                onClick={() => {
                  clear();
                  setOpen(false);
                }}
                className="min-h-[44px] text-[0.78rem] font-semibold text-kaytori-muted hover:text-kaytori-black"
              >
                Vider le panier
              </button>
              <p className="text-sm font-semibold text-kaytori-black">
                Total <span className="font-bold tabular-nums">{formatDhAmount(totalDh)} DH</span>
              </p>
            </div>
          </div>
        </div>
      ) : null}

      <div
        key={bump}
        className={`pointer-events-auto mx-auto flex w-full max-w-lg items-center gap-2 rounded-2xl border border-kaytori-green/25 bg-gradient-to-br from-white/90 via-emerald-50/70 to-kaytori-green/[0.12] p-2 shadow-[0_-8px_36px_-6px_rgba(0,77,51,0.2)] backdrop-blur-xl backdrop-saturate-150 sm:p-2.5 ${
          bump > 0 ? "motion-safe:animate-cart-bump" : ""
        }`}
      >
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex min-h-[52px] min-w-0 flex-1 items-center gap-3 rounded-xl px-2 text-left active:bg-kaytori-cream/30"
        >
          <span className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full bg-kaytori-black text-kaytori-goldLight" aria-hidden>
            <CartIcon className="h-5 w-5" />
            <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-kaytori-green px-1 text-[0.65rem] font-bold tabular-nums text-white">
              {itemCount}
            </span>
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="whitespace-nowrap font-display text-lg font-semibold leading-tight tabular-nums text-kaytori-black max-[359px]:text-base">
              {formatDhAmount(totalDh)} DH
            </span>
            <span className="truncate text-[0.68rem] font-semibold uppercase tracking-wider text-kaytori-muted">
              {itemCount} article{itemCount > 1 ? "s" : ""} · {open ? "Réduire" : "Détail"}
            </span>
          </span>
        </button>
        <button
          ref={commandRef}
          type="button"
          onClick={() => setReviewOpen(true)}
          aria-haspopup="dialog"
          className="btn-shine inline-flex min-h-[52px] shrink-0 items-center justify-center gap-1.5 rounded-xl bg-gold-shine px-4 text-center text-[0.9rem] font-bold text-kaytori-black shadow-card transition-all hover:shadow-gold active:scale-[0.98] max-[359px]:px-3 sm:px-5"
        >
          Commander
          <span aria-hidden>›</span>
        </button>
      </div>
      {reviewOpen ? <OrderReview onClose={closeReview} onEdit={editFromReview} /> : null}
    </div>
  );
}
