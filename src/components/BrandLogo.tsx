import { SITE } from "../config/site";

type BrandLogoProps = {
  className?: string;
  size?: number;
};

/** Logo Kaytori — cercle vert / glyphe. Masque circulaire sur le conteneur (ombre & clip cohérents). */
export function BrandLogo({ className = "", size = 44 }: BrandLogoProps) {
  return (
    <span
      className={`inline-flex shrink-0 overflow-hidden rounded-full ${className}`}
      style={{ width: size, height: size }}
    >
      <img
        src={SITE.logoUrl}
        alt=""
        width={size}
        height={size}
        decoding="async"
        className="block h-full w-full object-cover object-center"
        aria-hidden
      />
    </span>
  );
}
