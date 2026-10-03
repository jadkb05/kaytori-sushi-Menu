import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { lineSubtotalDh } from "../cart/buildOrderMessage";
import { useCart } from "../cart/CartContext";
import { formatDhAmount } from "../cart/formatDh";
import { YUMLO_MENU } from "../data/yumloMenu";

type Props = {
  /** Retour au menu sans rien changer. */
  onClose: () => void;
  /** Retour au menu avec le détail du panier ouvert. */
  onEdit: () => void;
};

/** Catégorie d'un plat, depuis les données du menu (id panier = `platId` ou `platId:variantId`). */
const CATEGORY_BY_DISH_ID = new Map<string, string>(YUMLO_MENU.map((it) => [it.id, it.category]));

function categoryOf(cartLineId: string): string | undefined {
  const sep = cartLineId.indexOf(":");
  return CATEGORY_BY_DISH_ID.get(sep >= 0 ? cartLineId.slice(0, sep) : cartLineId);
}

/** « Nems — Crevettes » → produit « Nems », variante « Crevettes » (affichage uniquement). */
function splitName(name: string): { product: string; variant: string | null } {
  const i = name.indexOf(" — ");
  return i < 0 ? { product: name, variant: null } : { product: name.slice(0, i), variant: name.slice(i + 3) };
}

/**
 * Récapitulatif de commande (étape avant WhatsApp) : produits, variantes, quantités, total.
 * « Confirmer » ouvre WhatsApp avec le message existant puis vide le panier.
 */
export function OrderReview({ onClose, onEdit }: Props) {
  const { lines, itemCount, totalDh, whatsappOrderUrl, clear } = useCart();
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    titleRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      // Le focus reste dans le récapitulatif.
      const items = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>("button") ?? []);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === titleRef.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const confirm = () => {
    const url = whatsappOrderUrl; // message généré avant de vider le panier
    const win = window.open(url, "_blank");
    if (win) win.opener = null;
    else window.location.href = url;
    clear();
  };

  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="order-review-title"
      className="fixed inset-0 z-[70] flex flex-col bg-kaytori-cream"
    >
      <header className="relative shrink-0 bg-[#0c1712]">
        <div className="mx-auto flex h-14 max-w-lg items-center gap-1 px-1.5 sm:px-3">
          <button
            type="button"
            onClick={onClose}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-kaytori-cream transition-colors hover:bg-white/10 active:bg-white/15"
            aria-label="Retour au menu"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden focusable="false">
              <path d="M15 5l-7 7 7 7" />
            </svg>
          </button>
          <h2
            id="order-review-title"
            ref={titleRef}
            tabIndex={-1}
            className="min-w-0 font-display text-[1.08rem] font-semibold leading-tight text-kaytori-cream outline-none"
          >
            Récapitulatif de votre commande
          </h2>
        </div>
        <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-kaytori-gold/55 to-transparent" aria-hidden />
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
        <div className="mx-auto max-w-lg px-4 pb-6 pt-5 sm:px-6">
          <p className="font-sans text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-kaytori-muted">
            {itemCount} article{itemCount > 1 ? "s" : ""}
          </p>
          <ul className="mt-2 divide-y divide-kaytori-green/10">
            {lines.map((l) => {
              const { product, variant } = splitName(l.name);
              const category = categoryOf(l.id);
              return (
                <li key={l.id} className="py-3.5">
                  {category ? (
                    <p className="pl-11 font-sans text-[0.66rem] font-semibold uppercase leading-snug tracking-[0.14em] text-kaytori-green/75">
                      {category}
                    </p>
                  ) : null}
                  <div className={`flex items-start gap-3 ${category ? "mt-1" : ""}`}>
                    <span className="w-8 shrink-0 pt-px font-sans text-[0.95rem] font-semibold tabular-nums text-kaytori-green">
                      {l.quantity}×
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-sans text-[0.95rem] font-semibold leading-snug text-kaytori-black">
                        {product}
                      </span>
                      {variant ? (
                        <span className="mt-0.5 block font-sans text-[0.82rem] leading-snug text-kaytori-muted">
                          {variant}
                        </span>
                      ) : null}
                    </span>
                    <span className="shrink-0 whitespace-nowrap pt-px font-sans text-[0.95rem] font-semibold tabular-nums text-kaytori-black">
                      {formatDhAmount(lineSubtotalDh(l))} DH
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="mt-1 flex items-baseline justify-between border-t-2 border-kaytori-gold/40 pt-4">
            <span className="font-sans text-[0.95rem] font-semibold text-kaytori-black">Total</span>
            <span className="font-display text-[1.6rem] font-semibold tabular-nums text-kaytori-black">
              {formatDhAmount(totalDh)} DH
            </span>
          </div>
        </div>
      </div>

      <div className="shrink-0 border-t border-kaytori-green/10 bg-white/80 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
        <div className="mx-auto flex max-w-lg flex-col gap-1 px-4 sm:px-6">
          <button
            type="button"
            onClick={confirm}
            className="btn-shine min-h-[52px] w-full rounded-xl bg-gold-shine px-4 text-[0.95rem] font-bold text-kaytori-black shadow-card transition-all hover:shadow-gold active:scale-[0.99]"
          >
            Confirmer la commande
          </button>
          <button
            type="button"
            onClick={onEdit}
            className="min-h-[44px] w-full rounded-xl font-sans text-[0.86rem] font-semibold text-kaytori-green transition-colors hover:bg-kaytori-green/[0.05]"
          >
            Modifier le panier
          </button>
          <p className="pb-1 text-center font-sans text-[0.75rem] text-kaytori-muted">
            La commande sera envoyée au restaurant via WhatsApp.
          </p>
        </div>
      </div>
    </div>,
    document.body,
  );
}
