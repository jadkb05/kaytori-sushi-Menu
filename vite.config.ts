import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Deux pages HTML : `/` (page d'accueil du restaurant) et `/menu` (menu digital).
 * En dev et en preview, même réécriture que vercel.json : /menu sert menu/index.html
 * (sinon Vite servirait l'accueil pour ce chemin).
 */
const MENU_HTML_PATHS = /^\/menu\/?$/;

function menuHtmlRewrites(): Plugin {
  const rewrite = (req: { url?: string }, _res: unknown, next: () => void) => {
    const [pathname, query] = (req.url ?? "").split("?");
    if (MENU_HTML_PATHS.test(pathname)) req.url = `/menu/index.html${query ? `?${query}` : ""}`;
    next();
  };
  return {
    name: "menu-html-rewrites",
    configureServer(server) {
      server.middlewares.use(rewrite);
    },
    configurePreviewServer(server) {
      server.middlewares.use(rewrite);
    },
  };
}

export default defineConfig({
  plugins: [menuHtmlRewrites(), react()],
  build: {
    rollupOptions: {
      input: {
        home: "index.html",
        menu: "menu/index.html",
      },
    },
  },
  server: {
    // Tunnels Cloudflare quick (`*.trycloudflare.com`) pour validation client.
    allowedHosts: [".trycloudflare.com"],
  },
});
