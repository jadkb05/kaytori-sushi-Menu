/**
 * Icônes de l'admin : SVG au trait (24 × 24, trait 1,75, couleur héritée via currentColor),
 * même style que src/components/Icons.tsx. Décoratives : le texte voisin (ou aria-label) porte le sens.
 */
import type { ReactNode } from "react";

type IconProps = { className?: string };

function Svg({ className = "h-4 w-4", children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
      aria-hidden
      focusable="false"
    >
      {children}
    </svg>
  );
}

export const FormulesIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="4" y="3.5" width="16" height="17" rx="2" />
    <path d="M8 8h8M8 12h8M8 16h5" />
  </Svg>
);

/** Couverture : cadre photo. */
export const CoverIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
    <circle cx="9" cy="10.5" r="1.75" />
    <path d="m7 16.5 3.2-3.5 2.3 2.2 3-3.7 3.5 4.9" />
  </Svg>
);

export const DashboardIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3.5" y="3.5" width="7" height="8" rx="1.5" />
    <rect x="13.5" y="3.5" width="7" height="5" rx="1.5" />
    <rect x="13.5" y="11.5" width="7" height="9" rx="1.5" />
    <rect x="3.5" y="14.5" width="7" height="6" rx="1.5" />
  </Svg>
);

/** Produits : bol (plat). */
export const ProductsIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3.5 11h17a8.5 8.5 0 0 1-17 0Z" />
    <path d="M9 19.5h6" />
    <path d="M9.5 7.5c0-1.5 1-2 1-3.5M13.5 7.5c0-1.5 1-2 1-3.5" />
  </Svg>
);

/** Catégories : couches. */
export const CategoriesIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m12 3.5 8.5 4.5-8.5 4.5L3.5 8 12 3.5Z" />
    <path d="m3.5 12 8.5 4.5 8.5-4.5" />
    <path d="m3.5 16 8.5 4.5 8.5-4.5" />
  </Svg>
);

export const VariantsIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="7" cy="7" r="3" />
    <circle cx="17" cy="7" r="3" />
    <circle cx="7" cy="17" r="3" />
    <path d="M17 14v6M14 17h6" />
  </Svg>
);

export const EyeIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
    <circle cx="12" cy="12" r="3" />
  </Svg>
);

export const EyeOffIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10.6 5.6A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-2.6 3.4M6.3 6.8A16.6 16.6 0 0 0 2.5 12S6 18.5 12 18.5a9 9 0 0 0 4.7-1.3" />
    <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    <path d="m3.5 3.5 17 17" />
  </Svg>
);

export const PencilIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M16.5 4.5a2.1 2.1 0 0 1 3 3L8 19l-4 1 1-4L16.5 4.5Z" />
    <path d="m14.5 6.5 3 3" />
  </Svg>
);

export const TrashIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 7h16" />
    <path d="M9.5 7V4.5h5V7" />
    <path d="m6 7 1 12.5a1.5 1.5 0 0 0 1.5 1.5h7a1.5 1.5 0 0 0 1.5-1.5L18 7" />
    <path d="M10 11v6M14 11v6" />
  </Svg>
);

export const ArrowUpIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 19V5M6 11l6-6 6 6" />
  </Svg>
);

export const ArrowDownIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 5v14M6 13l6 6 6-6" />
  </Svg>
);

export const ArrowLeftIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M19 12H5M11 6l-6 6 6 6" />
  </Svg>
);

export const ArrowRightIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Svg>
);

export const PlusIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);

/** Poignée de glisser-déposer (trois traits). */
export const GripIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 7h8M8 12h8M8 17h8" />
  </Svg>
);

export const SearchIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m20 20-4.4-4.4" />
  </Svg>
);

export const ExternalIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M14 4.5h5.5V10M19.5 4.5 11 13" />
    <path d="M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10" />
  </Svg>
);

export const LogoutIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9.5 20H5.5A1.5 1.5 0 0 1 4 18.5v-13A1.5 1.5 0 0 1 5.5 4h4" />
    <path d="M15 16.5 19.5 12 15 7.5M19.5 12H9" />
  </Svg>
);

export const CheckIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Svg>
);

export const AlertIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5v5M12 16h.01" />
  </Svg>
);

export const CloseIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Svg>
);

export const UploadIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 15V4.5M7.5 9 12 4.5 16.5 9" />
    <path d="M4.5 15v3.5A1.5 1.5 0 0 0 6 20h12a1.5 1.5 0 0 0 1.5-1.5V15" />
  </Svg>
);

export const CropIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6.5 3v14a.5.5 0 0 0 .5.5h14" />
    <path d="M3 6.5h14a.5.5 0 0 1 .5.5v14" />
  </Svg>
);

export const ImageIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
    <circle cx="9" cy="10" r="1.75" />
    <path d="m20.5 16-4.5-4.5L7 19.5" />
  </Svg>
);

/* ------------------------------------------------------------------ espace fidélité */

export const LockIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="5" y="10.5" width="14" height="9.5" rx="2" />
    <path d="M8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3" />
  </Svg>
);

export const QrIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="4" y="4" width="6" height="6" rx="1" />
    <rect x="14" y="4" width="6" height="6" rx="1" />
    <rect x="4" y="14" width="6" height="6" rx="1" />
    <path d="M14 14h2.5v2.5H14zM17.5 17.5H20V20h-2.5zM20 14v1.5M14 20h1.5" />
  </Svg>
);

export const GiftIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="4" y="9" width="16" height="4" rx="1" />
    <path d="M5.5 13v6.5h13V13M12 9v10.5" />
    <path d="M12 9c-1.5-3.5-5-4-5-1.5C7 9 12 9 12 9Zm0 0c1.5-3.5 5-4 5-1.5C17 9 12 9 12 9Z" />
  </Svg>
);

export const LinkIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
    <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
  </Svg>
);

export const UndoIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 8 5 12l4 4" />
    <path d="M5 12h9a5 5 0 0 1 0 10h-2" />
  </Svg>
);

/** Fleur de cerisier à cinq pétales : un tampon. */
export const BlossomIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 12c-1.8-2.2-1.8-5.2 0-7.5 1.8 2.3 1.8 5.3 0 7.5Zm0 0c2.6-1 5.5-.2 7.2 2.1-2.6 1.1-5.5.3-7.2-2.1Zm0 0c.2 2.8-1.5 5.3-4.3 6.2-.2-2.8 1.5-5.3 4.3-6.2Zm0 0c2.8.9 4.5 3.4 4.3 6.2-2.8-.9-4.5-3.4-4.3-6.2Zm0 0c-1.7 2.4-4.6 3.2-7.2 2.1 1.7-2.3 4.6-3.1 7.2-2.1Z" />
  </Svg>
);

export const WhatsappIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4.5 19.5 5.6 16a8 8 0 1 1 2.6 2.6Z" />
    <path d="M9.5 9.5c0 2.5 2.5 5 5 5l1-1.5-1.8-.9-.8.8c-.9-.4-1.6-1.1-2-2l.8-.8-.9-1.8Z" />
  </Svg>
);

export const UsersIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="9" cy="8.5" r="3.25" />
    <path d="M3.5 19.5c.6-3.1 2.8-5 5.5-5s4.9 1.9 5.5 5" />
    <circle cx="16.75" cy="9.25" r="2.5" />
    <path d="M16.5 14.5c2.1.1 3.6 1.7 4 4.25" />
  </Svg>
);

/** Pile de pièces : les points. */
export const CoinsIcon = (p: IconProps) => (
  <Svg {...p}>
    <ellipse cx="12" cy="6.5" rx="6.5" ry="2.5" />
    <path d="M5.5 6.5v4c0 1.4 2.9 2.5 6.5 2.5s6.5-1.1 6.5-2.5v-4" />
    <path d="M5.5 10.5v4c0 1.4 2.9 2.5 6.5 2.5s6.5-1.1 6.5-2.5v-4" />
    <path d="M5.5 14.5v3c0 1.4 2.9 2.5 6.5 2.5s6.5-1.1 6.5-2.5v-3" />
  </Svg>
);

export const ChartIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 19.5V13M10 19.5V9M15 19.5V11.5M20 19.5V5.5" />
  </Svg>
);

export const HomeIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 10.5 12 4l8 6.5" />
    <path d="M6 9v10.5h4.5V14h3v5.5H18V9" />
  </Svg>
);

export const SparkleIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m12 3 1.9 5.8a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 12l5.8-1.9a2 2 0 0 0 1.3-1.3L12 3Z" />
  </Svg>
);
