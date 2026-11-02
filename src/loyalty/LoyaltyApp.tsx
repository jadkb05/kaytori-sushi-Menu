/**
 * Espace « Kaytôri Club » (/fidelite…), chargé séparément du menu (import dynamique dans
 * App.tsx) : ni données des produits, ni panier, ni parcours de commande.
 */
import { Suspense, lazy, useEffect, useState } from "react";
import { LoyaltyErrorBoundary } from "./components/LoyaltyErrorBoundary";
import { LOCAL_BACKEND } from "./lib/api";
import { navigate, useLoyaltyPath } from "./lib/navigation";
import { readSavedToken } from "./lib/storage";
import { CardPage } from "./pages/CardPage";
import { HomePage } from "./pages/HomePage";
import { ScanPage } from "./pages/ScanPage";
import { resolveLoyaltyRoute, type LoyaltyRoute } from "./routes";

/** Banc d'essai local uniquement (retiré du build de production). */
const DevToolbar = LOCAL_BACKEND ? lazy(() => import("./dev/DevToolbar")) : null;

const TITLES = {
  home: "Kaytôri Club — Programme de fidélité par points | Kaytôri Sushi Casablanca",
  card: "Ma carte Kaytôri Club — Kaytôri Sushi",
  scan: "Validation des points — Kaytôri Club",
} as const;

function setMeta(name: string, content: string): () => void {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  const created = !el;
  const previous = el?.content ?? null;
  if (!el) {
    el = document.createElement("meta");
    el.name = name;
    document.head.appendChild(el);
  }
  el.content = content;
  return () => {
    if (created) el?.remove();
    else if (el && previous !== null) el.content = previous;
  };
}

function useLoyaltyDocument(route: LoyaltyRoute) {
  const page = route.page === "redirect" ? "home" : route.page;
  useEffect(() => {
    const previousTitle = document.title;
    document.title = TITLES[page];
    const restore = [
      setMeta("referrer", "no-referrer"),
      page === "home"
        ? setMeta(
            "description",
            "Kaytôri Club à Casablanca : cumulez des points à chaque commande (1 point = 0,20 DH) et échangez-les contre nos récompenses. Sans application.",
          )
        : setMeta("robots", "noindex, nofollow"),
    ];
    return () => {
      document.title = previousTitle;
      restore.forEach((r) => r());
    };
  }, [page]);
}

export default function LoyaltyApp() {
  const path = useLoyaltyPath();
  const route = resolveLoyaltyRoute(path);
  const [hasSavedCard] = useState(() => readSavedToken() !== null);
  useLoyaltyDocument(route);

  const [linkOpen, setLinkOpen] = useState(0);
  useEffect(() => {
    const onHash = () => {
      if (window.location.hash.length > 1) setLinkOpen((n) => n + 1);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const redirectTo = route.page === "redirect" ? route.to : null;
  useEffect(() => {
    if (redirectTo) navigate(redirectTo, { replace: true });
  }, [redirectTo]);

  const page =
    route.page === "card" ? (
      <CardPage key={`${path}:${linkOpen}`} />
    ) : route.page === "scan" ? (
      <ScanPage publicCode={route.publicCode} hasSavedCard={hasSavedCard} />
    ) : (
      <HomePage key={path} />
    );
  return (
    <>
      <LoyaltyErrorBoundary key={path}>{page}</LoyaltyErrorBoundary>
      {DevToolbar ? (
        <Suspense fallback={null}>
          <DevToolbar />
        </Suspense>
      ) : null}
    </>
  );
}
