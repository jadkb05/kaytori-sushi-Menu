/**
 * Prépare le menu (/menu) pendant que le client regarde la vitrine : une fois la page d'accueil
 * chargée et le navigateur au repos, ses fichiers (annoncés au build dans
 * `<meta name="kaytori-menu-assets">`, cf. vite.config.ts) sont téléchargés en basse priorité.
 * Ils sont en cache longue durée : au clic sur « Commander », le menu s'ouvre sans les retélécharger.
 * Rien n'est fait en mode économie de données ni en développement (pas de balise).
 */
export function warmMenu(): void {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="kaytori-menu-assets"]');
  if (!meta?.content) return;
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  if (connection?.saveData) return;

  const urls = ["/menu", ...meta.content.split(",").filter(Boolean)];
  const run = () => {
    for (const url of urls) {
      fetch(url, { priority: "low", credentials: "same-origin" } as RequestInit).catch(() => {
        /* simple préchargement : un échec ne change rien pour le client */
      });
    }
  };
  const whenIdle = () => {
    if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(run, { timeout: 3000 });
    else setTimeout(run, 1200);
  };

  if (document.readyState === "complete") whenIdle();
  else window.addEventListener("load", whenIdle, { once: true });
}
