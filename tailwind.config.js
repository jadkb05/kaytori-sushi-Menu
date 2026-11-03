/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./menu/index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Outfit"', "system-ui", "sans-serif"],
        display: ['"Playfair Display"', "Georgia", "serif"],
        /** Page d'accueil (/) uniquement : mincho japonais pour les titres éditoriaux. */
        mincho: ['"Shippori Mincho"', "Georgia", "serif"],
      },
      colors: {
        kaytori: {
          black: "#0a0f0d",
          /** Vert proche du branding Instagram Kaytori */
          green: "#004d33",
          greenDark: "#003024",
          greenMid: "#006848",
          greenSoft: "#0d8f63",
          gold: "#d4af37",
          goldLight: "#e8d89f",
          cream: "#F5F1EA",
          creamDark: "#EDE8DF",
          /** Carte plat : fond de page crème chaud, carte ivoire, badge vert très pâle. */
          page: "#F6F1E6",
          ivory: "#FCF9F2",
          sage: "#E5EEE6",
          /** Vert des fonds de photos de plats (médiane mesurée sur les vignettes) : bouton « + ». */
          photoGreen: "#1F5133",
          muted: "#5c6b66",
          line: "rgba(0, 77, 51, 0.14)",
        },
        /**
         * Kaytôri Club (espace fidélité du personnel, /admin/fidelite) : nuit verte, panneaux,
         * filets dorés. Texte : kaytori-cream ; or : kaytori-gold / goldLight.
         */
        club: {
          night: "#04170f",
          deep: "#003024",
          panel: "#0a2a1f",
          raised: "#0f3527",
          line: "rgba(212, 175, 55, 0.34)",
          lineSoft: "rgba(212, 175, 55, 0.16)",
          muted: "#a9b9af",
          positive: "#7fd4a6",
          danger: "#ff9d8f",
        },
        /**
         * Page d'accueil (/) : couleurs prises dans la salle — velours des banquettes, lanternes,
         * papier washi ; « leaf » = fond exact des photos de plats du menu (fusion sans bord).
         */
        home: {
          /** Crème ivoire des sections claires. */
          washi: "#F5F0E6",
          paper: "#EBE3D3",
          /** Encre vert-noir des titres sur crème. */
          ink: "#0B2219",
          soft: "#4E5C55",
          velvet: "#0F3B2C",
          /** Vert profond : header, sections sombres. */
          night: "#08291F",
          /** Noir chaud, pour les contrastes (infos, pied de page). */
          deep: "#0D1511",
          leaf: "#215134",
          /** Or champagne. */
          lantern: "#D9AD5B",
          lanternSoft: "#EED6A4",
          /** Filet doré des photos (classe .photo-frame). */
          frame: "#D9AD5B",
        },
        /** Espace /admin uniquement : fond ivoire, surfaces, encres et teinte de marque. */
        admin: {
          canvas: "#F6F4EF",
          subtle: "#FAF8F4",
          line: "#E7E2D8",
          lineStrong: "#D5CFC2",
          ink: "#18211D",
          soft: "#55605B",
          muted: "#87908B",
          tint: "#E9F1ED",
          tintStrong: "#D3E4DA",
        },
      },
      transitionTimingFunction: {
        bounce: "cubic-bezier(0.34, 1.56, 0.64, 1)",
        smooth: "cubic-bezier(0.22, 1, 0.36, 1)",
      },
      boxShadow: {
        gold: "0 14px 40px rgba(212, 175, 55, 0.36)",
        green: "0 14px 36px rgba(0, 77, 51, 0.32)",
        lift: "0 24px 48px rgba(10, 15, 13, 0.12)",
        card: "0 4px 24px rgba(10, 15, 13, 0.06)",
        dish: "0 0 0 1px rgba(120, 95, 45, 0.07), 0 1px 2px rgba(60, 45, 20, 0.05), 0 10px 24px -14px rgba(60, 45, 20, 0.24)",
        "admin-xs": "0 1px 2px rgba(24, 33, 29, 0.05)",
        "admin-sm": "0 1px 3px rgba(24, 33, 29, 0.06), 0 1px 2px rgba(24, 33, 29, 0.04)",
        "admin-md": "0 6px 16px -4px rgba(24, 33, 29, 0.10), 0 2px 4px -2px rgba(24, 33, 29, 0.05)",
        "admin-lg": "0 24px 48px -12px rgba(16, 24, 20, 0.28)",
      },
      backgroundImage: {
        "gold-shine":
          "linear-gradient(135deg, #f8efd8 0%, #e5cf73 38%, #d4af37 62%, #a88432 100%)",
        /** Bloc prix des cartes plats : transition dorée sobre. */
        "gold-price": "linear-gradient(160deg, #f6e8bd 0%, #ead18a 45%, #ddbb5e 100%)",
        "green-deep": "linear-gradient(160deg, #004d33 0%, #001910 100%)",
        /** Club : lueur verte en haut de page sur fond nuit. */
        "club-page": "radial-gradient(120% 55% at 50% -12%, rgba(0, 104, 72, 0.55) 0%, rgba(0, 48, 36, 0) 62%), linear-gradient(180deg, #022419 0%, #04170f 100%)",
        /** Club : reflet discret en haut des panneaux. */
        "club-sheen": "linear-gradient(180deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0) 45%)",
        /** Motif seigaiha (vagues japonaises), filet doré très léger, tuile de 40 × 20 px. */
        seigaiha: "url(\"data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='40' height='20' viewBox='0 0 40 20'><path fill='none' stroke='%23d4af37' stroke-opacity='.16' stroke-width='.8' d='M1 20a19 19 0 0 1 38 0M7 20a13 13 0 0 1 26 0M13 20a7 7 0 0 1 14 0M-19 10a19 19 0 0 1 38 0M-13 10a13 13 0 0 1 26 0M-7 10a7 7 0 0 1 14 0M21 10a19 19 0 0 1 38 0M27 10a13 13 0 0 1 26 0M33 10a7 7 0 0 1 14 0M1 0a19 19 0 0 1 38 0M7 0a13 13 0 0 1 26 0M13 0a7 7 0 0 1 14 0'/></svg>\")",
      },
      animation: {
        "fade-up": "fade-up 0.85s var(--ease-smooth, cubic-bezier(0.22,1,0.36,1)) forwards",
        "fade-in": "fade-in 1s ease forwards",
        scrollhint: "scrollhint 2.2s ease-in-out infinite",
        "badge-pop": "badge-pop 0.32s cubic-bezier(0.34, 1.56, 0.64, 1)",
        "cart-bump": "cart-bump 0.45s cubic-bezier(0.34, 1.56, 0.64, 1)",
        /** backwards : aucun transform conservé après l'animation (sinon les éléments fixed descendants seraient décalés). */
        "admin-in": "admin-in 0.18s cubic-bezier(0.22, 1, 0.36, 1) backwards",
        "admin-pop": "admin-pop 0.18s cubic-bezier(0.22, 1, 0.36, 1) both",
        "admin-fade": "fade-in 0.15s ease-out both",
        /** Accueil : entrée unique du hero (texte puis photo), désactivée si mouvement réduit. */
        "hero-rise": "hero-rise 0.9s cubic-bezier(0.22, 1, 0.36, 1) both",
        "hero-settle": "hero-settle 1.6s cubic-bezier(0.22, 1, 0.36, 1) both",
        /** Fidélité : éclosion d'une fleur nouvellement gagnée (une fois, jamais en boucle). */
        "loyalty-bloom": "loyalty-bloom 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) both",
      },
      keyframes: {
        "fade-up": {
          from: { opacity: "0", transform: "translateY(28px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        scrollhint: {
          "0%, 100%": { transform: "translateY(0)", opacity: "0.45" },
          "50%": { transform: "translateY(6px)", opacity: "1" },
        },
        "badge-pop": {
          "0%": { transform: "scale(0.4)" },
          "100%": { transform: "scale(1)" },
        },
        "cart-bump": {
          "0%, 100%": { transform: "scale(1)" },
          "40%": { transform: "scale(1.04)" },
        },
        "admin-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "admin-pop": {
          from: { opacity: "0", transform: "translateY(6px) scale(0.98)" },
          to: { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        "hero-rise": {
          from: { opacity: "0", transform: "translateY(18px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "hero-settle": {
          from: { opacity: "0.6", transform: "scale(1.04)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        "loyalty-bloom": {
          from: { opacity: "0.15", transform: "scale(0.35) rotate(-40deg)" },
          to: { opacity: "1", transform: "scale(1) rotate(0deg)" },
        },
      },
    },
  },
  plugins: [],
};
