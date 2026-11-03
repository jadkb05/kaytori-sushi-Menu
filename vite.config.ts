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

/**
 * Page d'accueil : prépare l'ouverture du menu pendant que le client regarde la vitrine.
 * Au build, on connaît les fichiers (hachés) du menu : on les annonce dans index.html
 * (`<meta name="kaytori-menu-assets">`, lu par src/home/warmMenu.ts qui les télécharge en tâche de fond)
 * et on ajoute des règles de spéculation (Chrome/Android : /menu pré-rendu, ouverture quasi instantanée).
 */
function warmMenuFromHome(): Plugin {
  return {
    name: "warm-menu-from-home",
    apply: "build",
    transformIndexHtml: {
      order: "post",
      handler(html, ctx) {
        if (!ctx.bundle || ctx.path !== "/index.html") return html;
        const menuEntry = Object.values(ctx.bundle).find(
          (c) => c.type === "chunk" && c.isEntry && c.name === "menu",
        );
        if (!menuEntry || menuEntry.type !== "chunk") return html;
        const css = [...(menuEntry.viteMetadata?.importedCss ?? [])];
        const assets = [menuEntry.fileName, ...menuEntry.imports, ...css].map((f) => `/${f}`);
        const rules = {
          prefetch: [{ source: "list", urls: ["/menu"], eagerness: "eager" }],
          prerender: [{ source: "list", urls: ["/menu"], eagerness: "moderate" }],
        };
        return [
          { tag: "meta", attrs: { name: "kaytori-menu-assets", content: assets.join(",") }, injectTo: "head" },
          { tag: "script", attrs: { type: "speculationrules" }, children: JSON.stringify(rules), injectTo: "head" },
        ];
      },
    },
  };
}

export default defineConfig({
  plugins: [menuHtmlRewrites(), warmMenuFromHome(), react()],
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
