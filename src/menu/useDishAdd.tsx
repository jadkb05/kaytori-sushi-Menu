import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useCart } from "../cart/CartContext";
import { formatDhAmount } from "../cart/formatDh";
import { PRODUCT_CUSTOMIZATIONS, customizedCartLine } from "../data/productOptions";
import type { YumloMenuItem } from "../data/yumloMenu";
import { formatPriceDH, getDisplayProductName } from "./menuDisplay";

/**
 * Logique d'ajout au panier d'un plat :
 * - sans variante → ajout direct ;
 * - avec variantes → modale de choix avec prix final par variante, quantité (− 1 +, minimum 1) et
 *   bouton « Ajouter N pour X DH » ; ligne panier `platId:variantId` / « Nom — Variante » ;
 * - plat personnalisé (PRODUCT_CUSTOMIZATIONS) → en plus, options requises et aucune
 *   présélection ; ligne « Nom — Variante — Sauce : X ».
 */
export function useDishAdd(item: YumloMenuItem) {
  const { addItem } = useCart();
  const variants = item.variants;
  const hasVariants = Boolean(variants && variants.length > 0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const custom = PRODUCT_CUSTOMIZATIONS[item.id];
  const [modalVariantId, setModalVariantId] = useState(() => (custom ? "" : (variants?.[0]?.id ?? "")));
  /** Plat personnalisé : option choisie par section (id de section → id d'option). */
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const [quantity, setQuantity] = useState(1);
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
    setModalVariantId(custom ? "" : variants[0].id);
    setChosen({});
    setQuantity(1);
    setPickerOpen(true);
  };

  const selectedInModal =
    hasVariants && variants
      ? (variants.find((x) => x.id === modalVariantId) ?? (custom ? null : variants[0]))
      : null;
  /** Plat personnalisé : ajout possible seulement avec une variante et une option par section. */
  const customReady = Boolean(custom && selectedInModal && custom.groups.every((g) => chosen[g.id]));

  useEffect(() => {
    if (!pickerOpen) return;
    /**
     * Éléments atteignables au clavier : un radio par groupe (le coché, sinon le premier) et les
     * boutons actifs.
     */
    const focusables = () => {
      const root = dialogRef.current;
      if (!root) return [];
      return Array.from(root.querySelectorAll<HTMLElement>("input[type=radio], button")).filter((el) => {
        if (el instanceof HTMLButtonElement) return !el.disabled;
        const radio = el as HTMLInputElement;
        if (radio.checked) return true;
        const group = Array.from(root.querySelectorAll<HTMLInputElement>("input[type=radio]")).filter(
          (r) => r.name === radio.name,
        );
        return group[0] === radio && !group.some((r) => r.checked);
      });
    };
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
    if (custom) {
      if (!customReady) return;
      const line = customizedCartLine(item, selectedInModal, custom, chosen);
      for (let i = 0; i < quantity; i += 1) addItem(line.id, line.name, selectedInModal.priceMAD);
      setPickerOpen(false);
      return;
    }
    for (let i = 0; i < quantity; i += 1) {
      addItem(`${item.id}:${selectedInModal.id}`, `${item.name} — ${selectedInModal.label}`, selectedInModal.priceMAD);
    }
    setPickerOpen(false);
  };

  /**
   * Prix unitaire du bouton : celui de la variante choisie (prix final enregistré), sinon le plus bas
   * tant qu'aucune variante n'est choisie (plat personnalisé, bouton alors désactivé).
   */
  const unitPriceDh = selectedInModal
    ? Number.parseFloat(selectedInModal.priceMAD)
    : variants?.length
      ? Math.min(...variants.map((v) => Number.parseFloat(v.priceMAD)))
      : 0;
  const canAdd = custom ? customReady : Boolean(selectedInModal);

  /** Section à choix unique et obligatoire (« Requis »), sans présélection. */
  const requiredSection = (
    key: string,
    title: string,
    options: readonly { id: string; label: string; description?: string; extra?: string }[],
    selectedId: string | undefined,
    onSelect: (id: string) => void,
  ) => (
    <fieldset key={key} className="border-0 px-4 pt-5 sm:px-5">
      {/* Légende flottante : rendue comme un titre normal, sans l'espacement propre aux <legend>. */}
      <legend className="float-left flex w-full items-start justify-between gap-3">
        <span>
          <span className="block font-display text-[0.98rem] font-semibold text-kaytori-black">{title}</span>
          <span className="block font-sans text-[0.74rem] text-kaytori-muted">Choisissez 1 produit</span>
        </span>
        <span className="mt-0.5 shrink-0 rounded-full bg-kaytori-black/[0.07] px-2 py-0.5 font-sans text-[0.64rem] font-semibold uppercase tracking-[0.08em] text-kaytori-black/70">
          Requis
        </span>
      </legend>
      <div className="clear-both flex flex-col gap-2 pt-3">
        {options.map((o) => {
          const checked = o.id === selectedId;
          return (
            <label
              key={o.id}
              className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border px-3 py-3 font-sans text-[0.82rem] transition-colors ${
                checked
                  ? "border-kaytori-green/45 bg-kaytori-green/[0.06] text-kaytori-black"
                  : "border-kaytori-black/10 bg-white hover:border-kaytori-gold/35"
              }`}
            >
              <span className="flex min-w-0 flex-1 items-center gap-2.5">
                <input
                  type="radio"
                  name={`${key}-${item.id}`}
                  value={o.id}
                  checked={checked}
                  onChange={() => onSelect(o.id)}
                  className="h-4 w-4 shrink-0 accent-kaytori-green"
                />
                <span className="min-w-0">
                  <span className="block font-medium">{o.label}</span>
                  {o.description ? (
                    <span className="block text-[0.74rem] leading-snug text-kaytori-muted">{o.description}</span>
                  ) : null}
                </span>
              </span>
              {o.extra ? (
                <span className="shrink-0 tabular-nums font-semibold text-kaytori-black">{o.extra}</span>
              ) : null}
            </label>
          );
        })}
      </div>
    </fieldset>
  );

  const qtyButton =
    "grid h-10 w-10 place-items-center rounded-full border border-kaytori-black/15 bg-white text-xl leading-none text-kaytori-green transition-colors disabled:opacity-35";

  const customBody =
    custom && variants ? (
      <>
        {requiredSection(
          "variant",
          custom.variantTitle,
          variants.map((v) => ({
            id: v.id,
            label: `${custom.variantTitle} ${v.label}`,
            extra: `${formatPriceDH(v.priceMAD)} DH`,
          })),
          modalVariantId || undefined,
          setModalVariantId,
        )}
        {custom.groups.map((g) =>
          requiredSection(g.id, g.title, g.options, chosen[g.id], (id) => setChosen((c) => ({ ...c, [g.id]: id }))),
        )}
      </>
    ) : null;

  /** Quantité commune à tous les plats à variantes : − 1 +, minimum 1. */
  const quantityRow = (
    <div className="flex items-center justify-center gap-5 px-4 py-5 sm:px-5">
      <button
        type="button"
        onClick={() => setQuantity((q) => Math.max(1, q - 1))}
        disabled={quantity <= 1}
        className={qtyButton}
        aria-label="Retirer une unité"
      >
        −
      </button>
      <span className="min-w-6 text-center font-sans text-base font-semibold tabular-nums" aria-live="polite">
        {quantity}
      </span>
      <button
        type="button"
        onClick={() => setQuantity((q) => q + 1)}
        className={qtyButton}
        aria-label="Ajouter une unité"
      >
        +
      </button>
    </div>
  );

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
                  {getDisplayProductName(item, item.category)}
                </h3>
                <p className="mt-1.5 text-center font-sans text-[0.78rem] leading-relaxed text-kaytori-muted">
                  {item.description}
                </p>
              </div>
              {custom ? customBody : (
                <fieldset className="border-0 px-4 pt-5 sm:px-5">
                  {/* Légende flottante, comme les sections du Wok : pas d'espacement propre aux <legend>. */}
                  <legend className="float-left w-full text-center font-sans text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-kaytori-black/70">
                    Votre choix
                  </legend>
                  <div className="clear-both flex flex-col gap-2 pt-3">
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
              )}
              {quantityRow}
              <div className="flex flex-col gap-2 border-t border-kaytori-black/[0.06] bg-[#f2ebe3]/90 px-4 py-4 sm:flex-row-reverse sm:px-5">
                <button
                  type="button"
                  onClick={confirmVariantAdd}
                  disabled={!canAdd}
                  className="btn-shine min-h-[48px] flex-1 rounded-xl bg-gold-shine px-4 py-3 text-sm font-semibold tabular-nums text-kaytori-black shadow-card transition-all enabled:hover:-translate-y-0.5 enabled:hover:shadow-gold disabled:cursor-not-allowed disabled:opacity-45"
                >
                  Ajouter {quantity} pour {formatDhAmount(unitPriceDh * quantity)} DH
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
