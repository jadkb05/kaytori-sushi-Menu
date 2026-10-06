/**
 * Navigation minimale de l'espace /admin (History API), sans bibliothèque de routing.
 */
import { useSyncExternalStore } from "react";

const NAVIGATE_EVENT = "admin:navigate";

export function navigate(to: string, { replace = false }: { replace?: boolean } = {}): void {
  if (window.location.pathname === to) return;
  if (replace) window.history.replaceState(null, "", to);
  else window.history.pushState(null, "", to);
  window.dispatchEvent(new Event(NAVIGATE_EVENT));
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener("popstate", onChange);
  window.addEventListener(NAVIGATE_EVENT, onChange);
  return () => {
    window.removeEventListener("popstate", onChange);
    window.removeEventListener(NAVIGATE_EVENT, onChange);
  };
}

/** Chemin courant (mis à jour par navigate() et par les boutons précédent/suivant). */
export function useAdminPath(): string {
  return useSyncExternalStore(
    subscribe,
    () => window.location.pathname,
    () => "/admin",
  );
}
