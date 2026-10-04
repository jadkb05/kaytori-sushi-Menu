import type { ReactNode } from "react";

/** Icônes au trait 24×24 (couleur héritée), décoratives. */
function Svg({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-[18px] w-[18px]"
      aria-hidden
      focusable="false"
    >
      {children}
    </svg>
  );
}

const ITEMS = [
  {
    title: "Livraison gratuite",
    text: "Livraison offerte",
    featured: true,
    icon: (
      <Svg>
        {/* Scooter de livraison avec coffre arrière */}
        <circle cx="6" cy="17" r="2.3" />
        <circle cx="18" cy="17" r="2.3" />
        <path d="M8.3 17h5.2l2.2-7.5" />
        <path d="M14.6 9.5h2.6" />
        <path d="M15.7 9.5 18 17" />
        <path d="M3.7 14.6A4.5 4.5 0 0 1 8 12h4.5" />
        <rect x="3.6" y="6.6" width="5.6" height="4" rx="0.6" />
      </Svg>
    ),
  },
  {
    title: "Commande rapide",
    text: "Simple & rapide",
    featured: false,
    icon: (
      <Svg>
        <circle cx="12" cy="13" r="7.5" />
        <path d="M12 9.5V13l2.3 1.6" />
        <path d="M10 3h4" />
      </Svg>
    ),
  },
  {
    title: "Préparé avec soin",
    text: "Fraîchement préparé",
    featured: false,
    icon: (
      <Svg>
        <path d="M5 19c0-8 5-13.5 14-14-.4 9-6 14-14 14Z" />
        <path d="M5 19c3-3.5 6-6 9.5-8" />
      </Svg>
    ),
  },
] as const;

/** Petite bande de réassurance (non sticky) entre le header et le sommaire. */
export function ReassuranceBand() {
  return (
    <section aria-label="Nos engagements" className="border-b border-kaytori-green/10 bg-kaytori-cream">
      <ul className="mx-auto grid max-w-5xl list-none grid-cols-3 px-1.5 py-2.5 sm:px-6 md:py-3">
        {ITEMS.map((item, i) => (
          <li
            key={item.title}
            className={`relative flex min-w-0 flex-col items-center px-1 text-center md:flex-row md:justify-center md:gap-3 md:text-left ${
              i > 0
                ? "before:absolute before:inset-y-1.5 before:left-0 before:w-px before:bg-gradient-to-b before:from-transparent before:via-kaytori-gold/40 before:to-transparent"
                : ""
            }`}
          >
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-kaytori-green text-kaytori-goldLight">
              {item.icon}
            </span>
            <span className="mt-1.5 block min-w-0 md:mt-0">
              <span
                className={`block whitespace-nowrap font-sans text-[0.72rem] leading-tight max-[374px]:text-[0.68rem] ${
                  item.featured ? "font-bold text-kaytori-green" : "font-semibold text-kaytori-green/85"
                }`}
              >
                {item.title}
              </span>
              <span className="mt-0.5 block whitespace-nowrap font-sans text-[0.66rem] leading-tight text-kaytori-muted max-[374px]:text-[0.62rem]">
                {item.text}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
