import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useCart } from "../cart/CartContext";
import type { YumloMenuItem } from "../data/yumloMenu";
import { dishImage, dishThumbs, formatPriceDH, getDisplayProductName, lowestPriceMAD } from "./menuDisplay";
import { dishAnchorId } from "./menuSearch";
import { useDishAdd } from "./useDishAdd";

/** Description compacte (2 lignes). « Voir plus » seulement si le texte dépasse. */
/** Badge vert très pâle (type de produit, nombre de choix). */
const TAG =
  "inline-flex rounded-md bg-kaytori-sage px-2 py-1 font-sans text-[0.7rem] font-medium leading-none text-kaytori-green";

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
        className={`font-sans text-[0.76rem] leading-snug text-[#6b6a5f] ${expanded ? "" : "line-clamp-2"}`}
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

/**
 * Description très courte (« Saumon », « Crevettes ») : affichée en badge, comme un type de produit.
 * Au-delà de 3 mots, ou avec ponctuation / chiffres, c'est une vraie description (texte).
 */
function isTagDescription(text: string): boolean {
  const t = text.trim();
  return t.length > 0 && t.length <= 24 && t.split(/\s+/).length <= 3 && !/[\d.,:;!?()—–-]/.test(t);
}

/** Affichage seulement : « 5 pcs » ne se coupe pas en fin de ligne. */
function keepQuantityTogether(name: string): string {
  return name.replace(/(\d+)\s+(pcs?|pièces?)\b/gi, "$1\u00a0$2");
}

/**
 * Carte plat compacte pour /menu — vignette, nom, description, prix, bouton +.
 * `highlighted` : brève mise en évidence quand la recherche mène à ce plat.
 */
export function DishRow({ item, highlighted = false }: { item: YumloMenuItem; highlighted?: boolean }) {
  const { hasVariants, pickerOpen, openPicker, handleAdd, variantModal } = useDishAdd(item);
  const { lines } = useCart();
  /** Nom affiché sous le titre de catégorie (le panier garde le nom complet). */
  const displayName = getDisplayProductName(item, item.category);
  const tagDescription = isTagDescription(item.description);
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
    <div className="h-[84px] w-[84px] overflow-hidden rounded-[0.9rem] bg-[#0f1815] min-[375px]:h-[96px] min-[375px]:w-[96px] md:h-[112px] md:w-[112px]">
      <img
        src={useThumb ? thumbs.small : original}
        srcSet={useThumb ? `${thumbs.small} 224w, ${thumbs.large} 336w` : undefined}
        sizes={useThumb ? "(min-width: 768px) 112px, (min-width: 375px) 96px, 84px" : undefined}
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
          className="block rounded-[0.9rem] outline-none"
        >
          {photo}
        </button>
      ) : (
        photo
      )}
      {inCart > 0 ? (
        <span
          key={inCart}
          className="absolute -right-1.5 -top-1.5 grid h-6 min-w-6 place-items-center rounded-full border-2 border-kaytori-ivory bg-kaytori-greenDark px-1 font-sans text-[0.7rem] font-bold tabular-nums text-kaytori-goldLight shadow-sm motion-safe:animate-badge-pop"
          aria-label={`${inCart} au panier`}
        >
          {inCart}
        </span>
      ) : null}
    </div>
  );

  const title = (
    <h3 className="font-display text-[1rem] font-bold leading-[1.22] tracking-[-0.01em] text-kaytori-black [overflow-wrap:anywhere] [text-wrap:balance] md:text-[1.06rem]">
      {keepQuantityTogether(displayName)}
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
            aria-label={`Choisir une option pour ${displayName}`}
          >
            {title}
          </button>
        ) : (
          title
        )}
        {item.description && !tagDescription ? <DishDescription text={item.description} /> : null}
        {tagDescription || hasVariants ? (
          <p className="mt-2 flex flex-wrap gap-1.5">
            {tagDescription ? <span className={TAG}>{item.description.trim()}</span> : null}
            {hasVariants ? <span className={TAG}>{item.variants?.length} choix</span> : null}
          </p>
        ) : null}
      </div>
    </div>
  );

  const priceBlock = (
    <span className="flex w-full flex-1 flex-col items-center justify-center rounded-bl-[1.25rem] rounded-tr-[1.25rem] bg-gold-price px-1 pb-2 pt-2.5 text-kaytori-black">
      <span className="whitespace-nowrap font-display text-[1.14rem] font-bold leading-none tracking-[-0.01em] lining-nums tabular-nums min-[375px]:text-[1.22rem]">
        {formatPriceDH(lowestPriceMAD(item))}
      </span>
      <span className="mt-1 font-sans text-[0.62rem] font-medium uppercase leading-none tracking-[0.14em] text-kaytori-black/65">
        DH
      </span>
    </span>
  );
  /** Bouton « + » : rond, du même vert que les fonds de photos. */
  const plus = (
    <span
      className="grid h-8 w-8 place-items-center rounded-full bg-kaytori-photoGreen text-kaytori-goldLight shadow-[0_6px_14px_-8px_rgba(31,81,51,0.8)] transition-transform group-active/add:scale-95"
      aria-hidden
    >
      <svg viewBox="0 0 20 20" className="h-[15px] w-[15px]">
        <path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" fill="none" />
      </svg>
    </span>
  );
  const sideClass =
    "group/add relative z-[1] flex w-[5rem] shrink-0 flex-col items-center outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-kaytori-green/50 min-[375px]:w-[5.4rem]";

  return (
    <li id={dishAnchorId(item.id)} className="touch-manipulation">
      <article
        className={`relative isolate flex items-stretch overflow-hidden rounded-[1.25rem] bg-kaytori-ivory shadow-dish transition-[box-shadow] duration-500 motion-reduce:transition-none ${
          highlighted ? "ring-2 ring-kaytori-gold/80" : ""
        }`}
      >
        <div className="relative z-[1] flex min-w-0 flex-1 items-center py-2.5 pl-2.5 pr-2">{body}</div>

        {hasVariants ? (
          <div className={sideClass}>
            {priceBlock}
            <button
              type="button"
              onClick={handleAdd}
              className="group/add grid place-items-center px-2 py-2 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-kaytori-green/50"
              aria-label={`Choisir une option pour ${displayName}`}
            >
              {plus}
            </button>
          </div>
        ) : (
          /* Plat simple : prix et « + » forment une seule zone tactile (même action que « + »). */
          <button
            type="button"
            onClick={handleAdd}
            className={`${sideClass} text-left`}
            aria-label={`Ajouter ${displayName} au panier`}
          >
            {priceBlock}
            <span className="grid place-items-center px-2 py-2">{plus}</span>
          </button>
        )}
      </article>
      {variantModal}
    </li>
  );
}
