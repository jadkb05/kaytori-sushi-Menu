/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Outfit"', "system-ui", "sans-serif"],
        display: ['"Playfair Display"', "Georgia", "serif"],
        /** Écriture manuscrite fine : mot d'accueil du menu uniquement. */
        script: ['"Parisienne"', '"Playfair Display"', "Georgia", "serif"],
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
      },
    },
  },
  plugins: [],
};
