import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { lineSubtotalDh } from "../cart/buildOrderMessage";
import { useCart } from "../cart/CartContext";
import { formatDhAmount } from "../cart/formatDh";
import { YUMLO_MENU, type YumloMenuItem } from "../data/yumloMenu";
import { dishImage, dishThumbs } from "../menu/menuDisplay";

type Props = {
  /** Retour au menu (flèche, Échap, « Ajouter des articles »). */
  onClose: () => void;
};

/** Plat d'une ligne panier, depuis les données du menu (id panier = `platId` ou `platId:variantId`). */
const DISH_BY_ID = new Map<string, YumloMenuItem>(YUMLO_MENU.map((it) => [it.id, it]));

function dishOf(cartLineId: string): YumloMenuItem | undefined {
  const sep = cartLineId.indexOf(":");
  return DISH_BY_ID.get(sep >= 0 ? cartLineId.slice(0, sep) : cartLineId);
}

/** « Nems — Crevettes » → produit « Nems », variante « Crevettes » (affichage uniquement). */
function splitName(name: string): { product: string; variant: string | null } {
  const i = name.indexOf(" — ");
  return i < 0 ? { product: name, variant: null } : { product: name.slice(0, i), variant: name.slice(i + 3) };
}

function Svg({ children, className = "h-5 w-5" }: { children: ReactNode; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
      focusable="false"
    >
      {children}
    </svg>
  );
}

const TrashIcon = ({ className }: { className?: string }) => (
  <Svg className={className}>
    <path d="M4 7h16" />
    <path d="M9.5 7V5.2c0-.7.5-1.2 1.2-1.2h2.6c.7 0 1.2.5 1.2 1.2V7" />
    <path d="M6.5 7l.8 11.3c.1 1 .9 1.7 1.9 1.7h5.6c1 0 1.8-.7 1.9-1.7L17.5 7" />
    <path d="M10.2 11v5.2M13.8 11v5.2" />
  </Svg>
);

/** Vignette du plat (mêmes vignettes WebP que le menu, repli sur l'original). */
function LineThumb({ item }: { item: YumloMenuItem | undefined }) {
  const [failed, setFailed] = useState(false);
  if (!item) return <span className="h-16 w-16 shrink-0 rounded-xl bg-[#0f1815]" aria-hidden />;
  const original = dishImage(item);
  const thumbs = dishThumbs(original);
  const useThumb = thumbs !== null && !failed;
  return (
    <span className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-[#0f1815]">
      <img
        src={useThumb ? thumbs.small : original}
        onError={useThumb ? () => setFailed(true) : undefined}
        alt=""
        width={64}
        height={64}
        loading="lazy"
        decoding="async"
        className="h-full w-full object-cover"
      />
    </span>
  );
}

/**
 * Panier plein écran (étape avant WhatsApp) : articles avec photo, catégorie, variante, prix et
 * quantité ; total et « Confirmer la commande » en bas. Confirmer ouvre WhatsApp avec le message
 * existant puis vide le panier.
 */
export function OrderReview({ onClose }: Props) {
  const { lines, totalDh, whatsappOrderUrl, increment, decrement, removeLine, clear } = useCart();
  const [confirmClear, setConfirmClear] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const cancelClearRef = useRef<HTMLButtonElement>(null);
  const clearButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    titleRef.current?.focus({ preventScroll: true });
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    if (confirmClear) cancelClearRef.current?.focus();
  }, [confirmClear]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (confirmClear) {
          setConfirmClear(false);
          clearButtonRef.current?.focus();
        } else onClose();
        return;
      }
      if (e.key !== "Tab") return;
      // Le focus reste dans le panier (ou dans la confirmation si elle est ouverte).
      const scope = confirmClear
        ? dialogRef.current?.querySelector<HTMLElement>("[role=alertdialog]")
        : dialogRef.current;
      const items = Array.from(scope?.querySelectorAll<HTMLElement>("button") ?? []).filter(
        (b) => confirmClear || !b.closest("[role=alertdialog]"),
      );
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
    return () => window.removeEventListener("keydown", onKey);
  }, [confirmClear, onClose]);

  const confirm = () => {
    const url = whatsappOrderUrl; // message généré avant de vider le panier
    const win = window.open(url, "_blank");
    if (win) win.opener = null;
    else window.location.href = url;
    clear();
  };

  const qtyButton =
    "grid h-9 w-9 place-items-center rounded-full text-kaytori-green transition-colors hover:bg-kaytori-green/[0.08] active:bg-kaytori-green/[0.14]";

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
            <Svg>
              <path d="M15 5l-7 7 7 7" />
            </Svg>
          </button>
          <h2
            id="order-review-title"
            ref={titleRef}
            tabIndex={-1}
            className="min-w-0 flex-1 font-display text-[1.15rem] font-semibold leading-tight text-kaytori-cream outline-none"
          >
            Votre panier
          </h2>
          <button
            ref={clearButtonRef}
            type="button"
            onClick={() => setConfirmClear(true)}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-kaytori-cream/85 transition-colors hover:bg-white/10 hover:text-kaytori-cream active:bg-white/15"
            aria-label="Vider le panier"
            aria-haspopup="dialog"
          >
            <TrashIcon className="h-5 w-5" />
          </button>
        </div>
        <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-kaytori-gold/55 to-transparent" aria-hidden />
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
        <div className="mx-auto max-w-lg px-4 pb-6 pt-2 sm:px-6">
          <ul className="divide-y divide-kaytori-green/10">
            {lines.map((l) => {
              const { product, variant } = splitName(l.name);
              const dish = dishOf(l.id);
              return (
                <li key={l.id} className="flex items-center gap-3 py-3.5">
                  <LineThumb item={dish} />
                  <div className="min-w-0 flex-1">
                    {dish ? (
                      <p className="truncate font-sans text-[0.64rem] font-semibold uppercase leading-snug tracking-[0.12em] text-kaytori-green/75">
                        {dish.category}
                      </p>
                    ) : null}
                    <p className="font-sans text-[0.92rem] font-semibold leading-snug text-kaytori-black">
                      {product}
                    </p>
                    {variant ? (
                      <p className="font-sans text-[0.8rem] leading-snug text-kaytori-muted">{variant}</p>
                    ) : null}
                    <p className="mt-0.5 font-sans text-[0.9rem] font-semibold tabular-nums text-kaytori-black">
                      {formatDhAmount(lineSubtotalDh(l))} DH
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center rounded-full border border-kaytori-green/20 bg-white p-0.5">
                    {l.quantity === 1 ? (
                      <button
                        type="button"
                        onClick={() => removeLine(l.id)}
                        className={qtyButton}
                        aria-label={`Supprimer ${l.name} du panier`}
                      >
                        <TrashIcon className="h-[18px] w-[18px]" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => decrement(l.id)}
                        className={`${qtyButton} text-xl leading-none`}
                        aria-label={`Retirer une unité de ${l.name}`}
                      >
                        −
                      </button>
                    )}
                    <span className="min-w-[1.6rem] text-center font-sans text-[0.95rem] font-bold tabular-nums text-kaytori-black" aria-label={`Quantité : ${l.quantity}`}>
                      {l.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => increment(l.id)}
                      className={`${qtyButton} text-xl leading-none`}
                      aria-label={`Ajouter une unité de ${l.name}`}
                    >
                      +
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>

          <button
            type="button"
            onClick={onClose}
            className="mt-2 inline-flex min-h-[44px] items-center gap-2 rounded-full px-1 font-sans text-[0.88rem] font-semibold text-kaytori-green transition-colors hover:text-kaytori-greenMid"
          >
            <span className="grid h-6 w-6 place-items-center rounded-full border border-kaytori-green/40 text-base leading-none" aria-hidden>
              +
            </span>
            Ajouter des articles
          </button>
          <p className="mt-3 font-sans text-[0.75rem] text-kaytori-muted">
            La commande sera envoyée au restaurant via WhatsApp.
          </p>
        </div>
      </div>

      <div className="shrink-0 border-t border-kaytori-green/10 bg-white pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_24px_-14px_rgba(10,15,13,0.25)]">
        <div className="mx-auto flex max-w-lg items-center gap-3 px-4 sm:px-6">
          <div className="shrink-0 leading-tight">
            <p className="font-sans text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-kaytori-muted">Total</p>
            <p className="whitespace-nowrap font-display text-[1.3rem] font-semibold tabular-nums text-kaytori-black">
              {formatDhAmount(totalDh)} DH
            </p>
          </div>
          <button
            type="button"
            onClick={confirm}
            className="btn-shine inline-flex min-h-[52px] min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl bg-gold-shine px-3 text-[0.9rem] font-bold text-kaytori-black shadow-card transition-all hover:shadow-gold active:scale-[0.99]"
          >
            <span className="truncate">Confirmer la commande</span>
            <span aria-hidden>→</span>
          </button>
        </div>
      </div>

      {confirmClear ? (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-kaytori-black/45 px-6" onClick={() => setConfirmClear(false)}>
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="clear-cart-title"
            className="w-full max-w-xs rounded-2xl bg-kaytori-cream p-5 text-center shadow-lift"
            onClick={(e) => e.stopPropagation()}
          >
            <p id="clear-cart-title" className="font-display text-[1.15rem] font-semibold text-kaytori-black">
              Vider le panier ?
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                ref={cancelClearRef}
                type="button"
                onClick={() => {
                  setConfirmClear(false);
                  clearButtonRef.current?.focus();
                }}
                className="min-h-[44px] rounded-xl border border-kaytori-green/25 bg-white font-sans text-[0.88rem] font-semibold text-kaytori-black hover:bg-kaytori-cream"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmClear(false);
                  clear();
                }}
                className="min-h-[44px] rounded-xl bg-kaytori-green font-sans text-[0.88rem] font-semibold text-kaytori-cream hover:bg-kaytori-greenMid"
              >
                Vider
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>,
    document.body,
  );
}
