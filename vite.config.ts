import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

const VIRTUAL_DEV_STUB = "\0virtual:loyalty-dev-stub";

/**
 * En build de production (`vite build`), le banc d'essai local (`src/loyalty/dev/*` et PGlite)
 * est intégralement court-circuité avant la transformation des assets afin qu'aucun fichier
 * `postgres-*.wasm` (8 Mo) ni `postgres-*.data` (5,4 Mo) ne soit émis dans `dist/assets/`.
 */
function excludeLoyaltyDevBenchInBuild(): Plugin {
  let isBuild = false;
  return {
    name: "exclude-loyalty-dev-bench-in-build",
    enforce: "pre",
    configResolved(config) {
      isBuild = config.command === "build";
    },
    resolveId(id) {
      if (!isBuild) return null;
      if (id === "@electric-sql/pglite" || id.startsWith("@electric-sql/pglite/")) {
        return VIRTUAL_DEV_STUB;
      }
      if (/(?:^|\/)dev\/(?:localBackend|staffDemo|DevToolbar|StaffDevToolbar)(?:\.[jt]sx?)?$/.test(id)) {
        return VIRTUAL_DEV_STUB;
      }
      return null;
    },
    load(id) {
      if (id === VIRTUAL_DEV_STUB) {
        return [
          "export class PGlite {}",
          "export async function getLocalRpc() { throw new Error('Disabled in build'); }",
          "export async function getStaffDemoEnv() { throw new Error('Disabled in build'); }",
          "export default function DevStub() { return null; }",
        ].join("\n");
      }
      return null;
    },
  };
}

/**
 * Deux pages HTML : `/` (page d'accueil du restaurant) et `/menu` (menu digital, admin, fidélité).
 * En dev et en preview, mêmes réécritures que vercel.json : /menu, /admin… et /fidelite… servent
 * menu/index.html (sinon Vite servirait l'accueil pour ces chemins).
 */
const MENU_HTML_PATHS = /^\/(?:menu\/?|admin(?:\/.*)?|fidelite(?:\/.*)?)$/;

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
  plugins: [excludeLoyaltyDevBenchInBuild(), menuHtmlRewrites(), react()],
  build: {
    rollupOptions: {
      input: {
        home: "index.html",
        menu: "menu/index.html",
      },
    },
  },
  // Banc d'essai local de la fidélité (npm run dev:fidelite) : PGlite charge ses fichiers lui-même.
  optimizeDeps: { exclude: ["@electric-sql/pglite"] },
  server: {
    // Tunnels Cloudflare quick (`*.trycloudflare.com`) pour validation client.
    allowedHosts: [".trycloudflare.com"],
  },
});
