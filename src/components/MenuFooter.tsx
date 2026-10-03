import { useCart } from "../cart/CartContext";
import { SITE } from "../config/site";
import { BrandLogo } from "./BrandLogo";

/** Petit motif doré : deux filets et un losange. */
function GoldMark({ className = "" }: { className?: string }) {
  return (
    <span className={`flex items-center justify-center gap-2 ${className}`} aria-hidden>
      <span className="h-px w-7 bg-gradient-to-r from-transparent to-kaytori-gold/70" />
      <span className="h-1.5 w-1.5 rotate-45 bg-kaytori-gold/80" />
      <span className="h-px w-7 bg-gradient-to-l from-transparent to-kaytori-gold/70" />
    </span>
  );
}

/** Footer de marque minimal : identité, signature éditoriale, copyright. */
export function MenuFooter() {
  const { itemCount } = useCart();

  return (
    <footer
      className={`relative bg-kaytori-black ${
        itemCount > 0 ? "pb-32" : "pb-[max(1.25rem,env(safe-area-inset-bottom))]"
      }`}
    >
      <div
        className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-kaytori-gold/40 to-transparent"
        aria-hidden
      />
      <div className="mx-auto max-w-5xl px-6 pt-8 md:pt-10">
        <div className="flex flex-col items-center text-center md:flex-row md:items-center md:justify-between md:text-left">
          {/* Identité */}
          <div className="flex flex-col items-center gap-2.5 md:flex-row md:gap-4">
            <BrandLogo size={42} className="ring-1 ring-kaytori-gold/30" />
            <div className="leading-none">
              <p className="font-display text-[1.25rem] font-semibold tracking-tight text-white">
                {SITE.nameAccent} Sushi
              </p>
              <p className="mt-1.5 font-sans text-[0.7rem] font-semibold uppercase tracking-[0.24em] text-kaytori-gold/90">
                Sushi · Wok · Thaï
              </p>
            </div>
          </div>

          <GoldMark className="my-5 md:hidden" />

          {/* Signature */}
          <figure className="md:flex md:items-center md:gap-6">
            <span
              className="hidden h-12 w-px bg-gradient-to-b from-transparent via-kaytori-gold/60 to-transparent md:block"
              aria-hidden
            />
            <blockquote className="max-w-[19rem] text-balance font-display text-[1rem] italic leading-snug text-kaytori-cream/85 md:max-w-sm md:text-[1.05rem]">
              «&nbsp;Chaque bouchée chez {SITE.nameAccent} est une histoire. Merci de la partager
              avec nous.&nbsp;»
            </blockquote>
          </figure>
        </div>

        <p className="mt-7 border-t border-white/[0.07] pt-4 text-center font-sans text-[0.75rem] tracking-wide text-white/40 md:mt-8">
          © {new Date().getFullYear()} {SITE.nameAccent} Sushi
        </p>
      </div>
    </footer>
  );
}
