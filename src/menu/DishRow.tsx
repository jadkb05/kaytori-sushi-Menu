import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useCart } from "../cart/CartContext";
import type { YumloMenuItem } from "../data/yumloMenu";
import { dishImage, dishThumbs, formatPriceDH, lowestPriceMAD } from "./menuDisplay";
import { useDishAdd } from "./useDishAdd";

/** Description compacte (2 lignes). « Voir plus » seulement si le texte dépasse. */
function DishDescription({ text }: { text: string }) {
  const fullRef = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);

  useLayoutEffect(() => {
    const el = fullRef.current;
    if (!el) return;
    const measure = () => {
      const node = fullRef.current;
      if (!node) return;
      const lineHeight = parseFloat(getComputedStyle(node).lineHeight);
      if (!Number.isFinite(lineHeight) || lineHeight <= 0) return;
      setOverflows(node.scrollHeight > lineHeight * 2 + 1);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [text]);

  return (
    <div className="relative mt-0.5">
      <p
        ref={fullRef}
        aria-hidden
        className="pointer-events-none invisible absolute inset-x-0 top-0 font-sans text-[0.76rem] leading-snug"
      >
        {text}
      </p>
      <p
        className={`font-sans text-[0.76rem] leading-snug text-kaytori-muted ${expanded ? "" : "line-clamp-2"}`}
      >
        {text}
      </p>
      {overflows ? (
        <button
          type="button"
          className="mt-0.5 inline-flex min-h-6 items-center font-sans text-[0.68rem] font-semibold leading-none text-kaytori-green underline decoration-kaytori-green/35 underline-offset-2"
          aria-expanded={expanded}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setExpanded((open) => !open);
          }}
        >
          {expanded ? "Voir moins" : "Voir plus"}
        </button>
      ) : null}
    </div>
  );
}

/** Carte plat compacte pour /menu — vignette, nom, description, prix, bouton +. */
export function DishRow({ item }: { item: YumloMenuItem }) {
  const { hasVariants, pickerOpen, openPicker, handleAdd, variantModal } = useDishAdd(item);
  const { lines } = useCart();
  const original = dishImage(item);
  const thumbs = dishThumbs(original);
  /** Vignette absente ou en erreur → retour à l'image d'origine. */
  const [thumbFailed, setThumbFailed] = useState(false);
  const useThumb = thumbs !== null && !thumbFailed;

  /** Quantité déjà au panier pour ce plat (toutes variantes confondues) — lecture seule. */
  const inCart = useMemo(
    () =>
      lines.reduce(
        (n, l) => (l.id === item.id || l.id.startsWith(`${item.id}:`) ? n + l.quantity : n),
        0,
      ),
    [lines, item.id],
  );

  const photo = (
    <div className="h-[90px] w-[90px] overflow-hidden rounded-xl bg-[#0f1815] min-[375px]:h-[104px] min-[375px]:w-[104px] md:h-[120px] md:w-[120px]">
      <img
        src={useThumb ? thumbs.small : original}
        srcSet={useThumb ? `${thumbs.small} 224w, ${thumbs.large} 336w` : undefined}
        sizes={useThumb ? "(min-width: 768px) 120px, (min-width: 375px) 104px, 90px" : undefined}
        onError={useThumb ? () => setThumbFailed(true) : undefined}
        alt=""
        width={104}
        height={104}
        loading="lazy"
        decoding="async"
        className="h-full w-full object-cover object-center"
      />
    </div>
  );

  const media = (
    <div className="relative shrink-0">
      {hasVariants ? (
        <button
          type="button"
          tabIndex={-1}
          aria-hidden
          onClick={openPicker}
          className="block rounded-xl outline-none"
        >
          {photo}
        </button>
      ) : (
        photo
      )}
      {inCart > 0 ? (
        <span
          key={inCart}
          className="absolute -right-1.5 -top-1.5 grid h-6 min-w-6 place-items-center rounded-full border-2 border-white bg-kaytori-green px-1 font-sans text-[0.7rem] font-bold tabular-nums text-white shadow-sm motion-safe:animate-badge-pop"
          aria-label={`${inCart} au panier`}
        >
          {inCart}
        </span>
      ) : null}
    </div>
  );

  const title = (
    <h3 className="font-display text-[0.95rem] font-semibold leading-snug tracking-tight text-kaytori-black">
      {item.name}
    </h3>
  );

  const body = (
    <div className="flex w-full items-center gap-3">
      {media}

      <div className="min-w-0 flex-1 py-0.5">
        {hasVariants ? (
          <button
            type="button"
            onClick={openPicker}
            className="block w-full bg-transparent text-left outline-none focus-visible:ring-2 focus-visible:ring-kaytori-green/40"
            aria-haspopup="dialog"
            aria-expanded={pickerOpen}
            aria-label={`Choisir une option pour ${item.name}`}
          >
            {title}
          </button>
        ) : (
          title
        )}
        {item.description ? <DishDescription text={item.description} /> : null}
        {hasVariants ? (
          <p className="mt-1 font-sans text-[0.64rem] font-semibold uppercase tracking-[0.08em] text-kaytori-green/85">
            {item.variants?.length} choix
          </p>
        ) : null}
      </div>
    </div>
  );

  const priceBlock = (
    <span className="flex w-full flex-1 flex-col items-center justify-center bg-gold-shine px-1.5 py-1.5 text-kaytori-black">
      <span className="font-sans text-[0.98rem] font-bold leading-tight tabular-nums">
        {formatPriceDH(lowestPriceMAD(item))}
      </span>
      <span className="font-sans text-[0.56rem] font-semibold uppercase leading-none tracking-[0.12em] text-kaytori-black/60">
        DH
      </span>
    </span>
  );
  const plusClass =
    "grid min-h-[44px] place-items-center bg-[#fffcf9] text-2xl font-light leading-none text-kaytori-green";

  return (
    <li className="touch-manipulation">
      <article className="flex items-stretch overflow-hidden rounded-2xl border border-kaytori-black/[0.06] bg-white shadow-[0_1px_2px_rgba(10,15,13,0.04),0_6px_18px_-12px_rgba(10,15,13,0.1)]">
        <div className="flex min-w-0 flex-1 items-center p-2.5">{body}</div>

        {hasVariants ? (
          <div className="flex w-[4.75rem] shrink-0 flex-col border-l border-kaytori-black/[0.05]">
            {priceBlock}
            <button
              type="button"
              onClick={handleAdd}
              className={`${plusClass} border-t border-kaytori-black/[0.06] transition-colors active:bg-kaytori-cream/70`}
              aria-label={`Choisir une option pour ${item.name}`}
            >
              +
            </button>
          </div>
        ) : (
          /* Plat simple : prix et « + » forment une seule zone tactile (même action que « + »). */
          <button
            type="button"
            onClick={handleAdd}
            className="group/add flex w-[4.75rem] shrink-0 flex-col border-l border-kaytori-black/[0.05] text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-kaytori-green/50"
            aria-label={`Ajouter ${item.name} au panier`}
          >
            {priceBlock}
            <span
              className={`${plusClass} w-full border-t border-kaytori-black/[0.06] transition-colors group-active/add:bg-kaytori-cream/70`}
              aria-hidden
            >
              +
            </span>
          </button>
        )}
      </article>
      {variantModal}
    </li>
  );
}
