import { useId, type ReactNode } from "react";

/**
 * Éléments graphiques de la page d'accueil : motif seigaiha (vagues japonaises), séparateurs en
 * courbe avec filet doré, sur-titres japonais et icônes au trait. Purement décoratifs (aria-hidden).
 */

/**
 * Motif seigaiha (vagues en écailles) : chaque écaille masque celle du rang précédent, comme sur
 * les tissus japonais. Anneau extérieur doré, anneaux intérieurs beige, point d'or au centre.
 * `bg` doit être la couleur du fond de la section (les écailles en sont remplies).
 * `glow` ajoute un halo doré chaud dans un coin.
 */
export function Seigaiha({
  className = "",
  opacity = 1,
  bg = "#08291F",
  glow,
}: {
  className?: string;
  opacity?: number;
  bg?: string;
  glow?: "top-left" | "top-right" | "bottom-left" | "bottom-right";
}) {
  const id = useId().replace(/:/g, "");
  // Centres des écailles qui touchent une tuile 48×24 (rangs espacés de 12, décalés d'une demi-écaille),
  // dessinés de haut en bas pour que chaque rang recouvre le précédent.
  const centers: [number, number][] = [
    [24, -12],
    [0, 0],
    [48, 0],
    [24, 12],
    [0, 24],
    [48, 24],
    [24, 36],
  ];
  const glowAt = {
    "top-left": "0% 0%",
    "top-right": "100% 0%",
    "bottom-left": "0% 100%",
    "bottom-right": "100% 100%",
  } as const;
  return (
    <div aria-hidden className={`pointer-events-none absolute ${className}`} style={{ opacity }}>
      <svg width="100%" height="100%" className="absolute inset-0">
        <defs>
          <pattern id={`seigaiha-${id}`} width="48" height="24" patternUnits="userSpaceOnUse">
            {centers.map(([cx, cy]) => (
              <g key={`${cx}-${cy}`}>
                <circle cx={cx} cy={cy} r="23.5" fill={bg} stroke="#D9AD5B" strokeOpacity="0.34" strokeWidth="0.8" />
                <circle cx={cx} cy={cy} r="17.5" fill="none" stroke="#F5F0E6" strokeOpacity="0.13" strokeWidth="0.7" />
                <circle cx={cx} cy={cy} r="11.5" fill="none" stroke="#F5F0E6" strokeOpacity="0.1" strokeWidth="0.7" />
                <circle cx={cx} cy={cy} r="5.5" fill="none" stroke="#D9AD5B" strokeOpacity="0.22" strokeWidth="0.7" />
                <circle cx={cx} cy={cy} r="1.1" fill="#D9AD5B" fillOpacity="0.35" />
              </g>
            ))}
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#seigaiha-${id})`} />
      </svg>
      {glow && (
        <div
          className="absolute inset-0"
          style={{
            background: `radial-gradient(60% 70% at ${glowAt[glow]}, rgba(217,173,91,0.16), rgba(245,240,230,0.04) 45%, transparent 70%)`,
          }}
        />
      )}
    </div>
  );
}

/**
 * Séparateur en courbe : la couleur `fill` remplit le bas, un filet doré suit la courbe.
 * `shape="crest"` : bombé au centre (bas du hero) ; `shape="rise"` : monte vers la droite.
 */
export function WaveDivider({
  fillClass,
  shape,
  className = "",
  fillAbove = false,
}: {
  fillClass: string;
  shape: "crest" | "rise";
  className?: string;
  /** Remplit la zone au-dessus de la courbe (la section suivante montre son fond dessous). */
  fillAbove?: boolean;
}) {
  const curve = shape === "crest" ? "M0,92 C360,18 1080,18 1440,92" : "M0,112 C520,118 980,86 1440,8";
  return (
    <svg
      aria-hidden
      viewBox="0 0 1440 120"
      preserveAspectRatio="none"
      className={`pointer-events-none block h-[44px] w-full sm:h-[64px] lg:h-[96px] ${className}`}
    >
      <path d={fillAbove ? `${curve} L1440,0 L0,0 Z` : `${curve} L1440,120 L0,120 Z`} className={fillClass} />
      <path d={curve} fill="none" stroke="#D9AD5B" strokeWidth="1.2" vectorEffect="non-scaling-stroke" opacity="0.85" />
    </svg>
  );
}

/** Sur-titre : mot japonais doré entre deux filets (décoratif, lu en japonais si annoncé). */
export function Eyebrow({ children, align = "center", tone = "light" }: { children: ReactNode; align?: "center" | "start"; tone?: "light" | "dark" }) {
  const color = tone === "light" ? "text-[#8A6420]" : "text-home-lantern";
  return (
    <p
      aria-hidden
      lang="ja"
      className={`flex items-center gap-4 font-mincho text-[0.95rem] tracking-[0.3em] sm:text-[1.05rem] ${color} ${
        align === "center" ? "justify-center" : "justify-start"
      }`}
    >
      <span className="h-px w-10 bg-current opacity-80 sm:w-16" />
      <span>{children}</span>
      <span className="h-px w-10 bg-current opacity-80 sm:w-16" />
    </p>
  );
}

const iconProps = {
  width: 40,
  height: 40,
  viewBox: "0 0 40 40",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.3,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export function LeafIcon({ className = "" }: { className?: string }) {
  return (
    <svg {...iconProps} className={className}>
      <path d="M8 32C8 18 17 8 33 7c0 16-9 26-22 26-1.2 0-2.2-.4-3-1Z" />
      <path d="M8 32 24 16" />
    </svg>
  );
}

export function ChefHatIcon({ className = "" }: { className?: string }) {
  return (
    <svg {...iconProps} className={className}>
      <path d="M12 24c-3.3 0-6-2.6-6-6 0-3.2 2.6-5.8 5.8-6C13 8.5 16.2 6 20 6s7 2.5 8.2 6c3.2.2 5.8 2.8 5.8 6 0 3.4-2.7 6-6 6" />
      <path d="M12 21v12h16V21" />
      <path d="M12 28h16" />
    </svg>
  );
}

export function ScooterIcon({ className = "" }: { className?: string }) {
  return (
    <svg {...iconProps} className={className}>
      <circle cx="10" cy="29" r="4" />
      <circle cx="31" cy="29" r="4" />
      <path d="M14 29h11l4-10h-5" />
      <path d="M6 23h12v-6H8" />
      <path d="M26 12h3l2 7 4 6" />
    </svg>
  );
}

export function BagIcon({ className = "" }: { className?: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}>
      <path d="M4.5 6.5h11l-.8 10.5h-9.4L4.5 6.5Z" />
      <path d="M7.5 8.5V5.5a2.5 2.5 0 0 1 5 0v3" />
    </svg>
  );
}

export function ArrowIcon({ className = "" }: { className?: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}>
      <path d="M4 10h12M11 5l5 5-5 5" />
    </svg>
  );
}

/** Première version du motif : cercles concentriques en filets dorés uniquement (sans beige). */
export function SeigaihaLines({ className = "", opacity = 0.16 }: { className?: string; opacity?: number }) {
  const id = useId().replace(/:/g, "");
  const arcs = (cx: number, cy: number) =>
    [24, 17, 10, 3].map((r) => <circle key={`${cx}-${cy}-${r}`} cx={cx} cy={cy} r={r} />);
  return (
    <svg aria-hidden className={`pointer-events-none absolute ${className}`} width="100%" height="100%">
      <defs>
        <pattern id={`seigaiha-lines-${id}`} width="48" height="24" patternUnits="userSpaceOnUse">
          <g fill="none" stroke="#D9AD5B" strokeWidth="0.9">
            {arcs(0, 12)}
            {arcs(48, 12)}
            {arcs(24, 24)}
          </g>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#seigaiha-lines-${id})`} opacity={opacity} />
    </svg>
  );
}
