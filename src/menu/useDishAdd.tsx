import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useCart } from "../cart/CartContext";
import type { YumloMenuItem } from "../data/yumloMenu";
import { formatPriceDH } from "./menuDisplay";

/**
 * Logique d'ajout au panier d'un plat :
 * - sans variante → ajout direct ;
 * - avec variantes → modale de choix, ligne panier `platId:variantId` / « Nom — Variante ».
 */
export function useDishAdd(item: YumloMenuItem) {
  const { addItem } = useCart();
  const variants = item.variants;
  const hasVariants = Boolean(variants && variants.length > 0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [modalVariantId, setModalVariantId] = useState(() => variants?.[0]?.id ?? "");
  const dialogRef = useRef<HTMLDivElement>(null);
  /** Élément qui a ouvert la modale : il retrouve le focus à la fermeture. */
  const openerRef = useRef<HTMLElement | null>(null);

  const openPicker = (e?: { currentTarget: EventTarget | null }) => {
    if (!hasVariants || !variants?.length) return;
    const fromEvent = e?.currentTarget;
    const active = document.activeElement;
    openerRef.current =
      fromEvent instanceof HTMLElement
        ? fromEvent
        : active instanceof HTMLElement && active !== document.body
          ? active
          : null;
    setModalVariantId(variants[0].id);
    setPickerOpen(true);
  };

  const selectedInModal =
    hasVariants && variants
      ? (variants.find((x) => x.id === modalVariantId) ?? variants[0])
      : null;

  useEffect(() => {
    if (!pickerOpen) return;
    /** Éléments atteignables au clavier : la variante cochée (groupe radio) puis les boutons. */
    const focusables = () =>
      Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>("input[type=radio]:checked, button") ?? [],
      );
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setPickerOpen(false);
        return;
      }
      if (e.key !== "Tab") return;
      // Le focus reste dans la modale.
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const inside = dialogRef.current?.contains(document.activeElement);
      if (e.shiftKey && (document.activeElement === first || !inside)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !inside)) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // À l'ouverture : focus sur la variante sélectionnée.
    focusables()[0]?.focus({ preventScroll: true });
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      // À la fermeture : le focus revient au plat qui a ouvert la modale.
      const opener = openerRef.current;
      if (opener && opener.isConnected) opener.focus({ preventScroll: true });
    };
  }, [pickerOpen]);

  const handleAdd = (e?: { currentTarget: EventTarget | null }) => {
    if (hasVariants) {
      openPicker(e);
      return;
    }
    addItem(item.id, item.name, item.priceMAD);
  };

  const confirmVariantAdd = () => {
    if (!hasVariants || !variants || !selectedInModal) return;
    addItem(
      `${item.id}:${selectedInModal.id}`,
      `${item.name} — ${selectedInModal.label}`,
      selectedInModal.priceMAD,
    );
    setPickerOpen(false);
  };

  const variantModal =
    pickerOpen &&
    hasVariants &&
    variants &&
    typeof document !== "undefined"
      ? createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-end justify-center bg-kaytori-black/50 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
            role="presentation"
            onClick={() => setPickerOpen(false)}
          >
            <div
              ref={dialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={`variant-title-${item.id}`}
              className="max-h-[min(92vh,640px)] w-full max-w-md overflow-y-auto rounded-t-2xl border border-kaytori-black/10 bg-[#faf8f4] shadow-lift sm:rounded-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="border-b border-kaytori-black/[0.06] bg-white/80 px-4 py-3 sm:px-5 sm:py-4">
                <h3
                  id={`variant-title-${item.id}`}
                  className="text-center font-display text-base font-semibold uppercase tracking-wide text-kaytori-black"
                >
                  {item.name}
                </h3>
                <p className="mt-1.5 text-center font-sans text-[0.78rem] leading-relaxed text-kaytori-muted">
                  {item.description}
                </p>
              </div>
              <fieldset className="border-0 px-4 py-4 sm:px-5">
                <legend className="mb-3 w-full text-center font-sans text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-kaytori-black/70">
                  Votre choix
                </legend>
                <div className="flex flex-col gap-2">
                  {variants.map((v) => {
                    const checked = v.id === modalVariantId;
                    return (
                      <label
                        key={v.id}
                        className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border px-3 py-3 font-sans text-[0.82rem] transition-colors ${
                          checked
                            ? "border-kaytori-green/45 bg-kaytori-green/[0.06] text-kaytori-black"
                            : "border-kaytori-black/10 bg-white hover:border-kaytori-gold/35"
                        }`}
                      >
                        <span className="flex min-w-0 flex-1 items-center gap-2.5">
                          <input
                            type="radio"
                            name={`variant-${item.id}`}
                            value={v.id}
                            checked={checked}
                            onChange={() => setModalVariantId(v.id)}
                            className="h-4 w-4 shrink-0 accent-kaytori-green"
                          />
                          <span className="font-medium">{v.label}</span>
                        </span>
                        <span className="shrink-0 tabular-nums font-semibold text-kaytori-black">
                          {formatPriceDH(v.priceMAD)} DH
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
              <div className="flex flex-col gap-2 border-t border-kaytori-black/[0.06] bg-[#f2ebe3]/90 px-4 py-4 sm:flex-row-reverse sm:px-5">
                <button
                  type="button"
                  onClick={confirmVariantAdd}
                  className="btn-shine min-h-[48px] flex-1 rounded-xl bg-gold-shine px-4 py-3 text-sm font-semibold text-kaytori-black shadow-card transition-all hover:-translate-y-0.5 hover:shadow-gold"
                >
                  Ajouter au panier
                </button>
                <button
                  type="button"
                  onClick={() => setPickerOpen(false)}
                  className="min-h-[48px] rounded-xl border border-kaytori-black/15 bg-white px-4 py-3 text-sm font-semibold text-kaytori-black/80 transition-colors hover:bg-kaytori-cream"
                >
                  Annuler
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  return { hasVariants, pickerOpen, selectedInModal, openPicker, handleAdd, variantModal };
}
