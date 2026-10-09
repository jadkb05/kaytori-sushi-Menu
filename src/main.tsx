import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { isAdminPath } from "./admin/lib/routes";
import "./index.css";

/**
 * Menu public : chaque chargement, y compris « Actualiser », repart comme une première visite —
 * haut de page et zoom normal. Sans cela, Safari (iOS) et le navigateur intégré d'Instagram
 * restaurent la position et le zoom précédents.
 */
function startLikeFirstVisit() {
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  window.scrollTo(0, 0);
  // Zoom ramené à 1 : maximum-scale=1 le temps du chargement, puis réglage d'origine rétabli
  // (le zoom au pincement reste ensuite possible).
  const viewport = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  if (!viewport) return;
  const original = viewport.content;
  viewport.content = `${original}, maximum-scale=1`;
  window.setTimeout(() => {
    viewport.content = original;
  }, 500);
}

if (!isAdminPath(window.location.pathname)) startLikeFirstVisit();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
