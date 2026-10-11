/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Outfit"', "system-ui", "sans-serif"],
        display: ['"Playfair Display"', "Georgia", "serif"],
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
          muted: "#5c6b66",
          line: "rgba(0, 77, 51, 0.14)",
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
        "admin-xs": "0 1px 2px rgba(24, 33, 29, 0.05)",
        "admin-sm": "0 1px 3px rgba(24, 33, 29, 0.06), 0 1px 2px rgba(24, 33, 29, 0.04)",
        "admin-md": "0 6px 16px -4px rgba(24, 33, 29, 0.10), 0 2px 4px -2px rgba(24, 33, 29, 0.05)",
        "admin-lg": "0 24px 48px -12px rgba(16, 24, 20, 0.28)",
      },
      backgroundImage: {
        "gold-shine":
          "linear-gradient(135deg, #f8efd8 0%, #e5cf73 38%, #d4af37 62%, #a88432 100%)",
        "green-deep": "linear-gradient(160deg, #004d33 0%, #001910 100%)",
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
      },
    },
  },
  plugins: [],
};
