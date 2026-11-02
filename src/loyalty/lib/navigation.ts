/**
 * Navigation de l'espace fidélité (History API, sans bibliothèque de routing),
 * même principe que src/admin/hooks/useAdminPath.ts.
 */
import { useSyncExternalStore } from "react";

const NAVIGATE_EVENT = "loyalty:navigate";

export function navigate(to: string, { replace = false }: { replace?: boolean } = {}): void {
  if (window.location.pathname + window.location.hash === to) return;
  if (replace) window.history.replaceState(null, "", to);
  else window.history.pushState(null, "", to);
  window.dispatchEvent(new Event(NAVIGATE_EVENT));
  window.scrollTo(0, 0);
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener("popstate", onChange);
  window.addEventListener(NAVIGATE_EVENT, onChange);
  return () => {
    window.removeEventListener("popstate", onChange);
    window.removeEventListener(NAVIGATE_EVENT, onChange);
  };
}

export function useLoyaltyPath(): string {
  return useSyncExternalStore(subscribe, () => window.location.pathname, () => "/fidelite");
}

/** Lien interne : navigation sans rechargement, mais vrai lien (nouvel onglet, clavier). */
export function onInternalLink(to: string) {
  return (e: { preventDefault: () => void; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; button: number }) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    navigate(to);
  };
}
