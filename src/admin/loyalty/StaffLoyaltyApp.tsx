/**
 * Espace fidélité du personnel (/admin/fidelite…), chargé à part (import dynamique dans AdminApp) :
 * ni données du menu, ni panier.
 *
 * Connexion unique :
 *   - en production : compte Supabase connecté, rôle de fidélité vérifié par la base ;
 *   - en banc d'essai local (npm run dev:fidelite) : base PGlite du navigateur, aucun appel à Supabase,
 *     accès direct sans second écran de code PIN ; ce chemin est retiré du build de production.
 */
import { Suspense, lazy, useCallback, useEffect, useState } from "react";
import { LOCAL_BACKEND } from "../../loyalty/lib/api";
import { navigate, useAdminPath } from "../hooks/useAdminPath";
import { AccountAccess } from "./access/AccountAccess";
import { DemoAccess, type GrantedAccess } from "./access/DemoAccess";
import { StaffLayout, sectionOf } from "./components/StaffLayout";
import { collectCards } from "./lib/cardStats";
import { fetchStaffProgram, type StaffProgram } from "./lib/staffApi";
import { PointsPage } from "./pages/PointsPage";
import { RewardsPage } from "./pages/RewardsPage";
import { StaffCardPage } from "./pages/StaffCardPage";
import { StaffHomePage } from "./pages/StaffHomePage";
import { StaffSearchPage } from "./pages/StaffSearchPage";
import { resolveStaffRoute } from "./routes";
import { StaffContext, type CardsState, type SearchMemory } from "./StaffContext";

/** Barre du banc d'essai (développement uniquement, retirée du build de production). */
const StaffDevToolbar = LOCAL_BACKEND ? lazy(() => import("../../loyalty/dev/StaffDevToolbar")) : null;

function useStaffDocument() {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = "Fidélité — Administration Kaytôri";
    const robots = document.createElement("meta");
    robots.name = "robots";
    robots.content = "noindex, nofollow";
    document.head.appendChild(robots);
    return () => {
      document.title = previousTitle;
      robots.remove();
    };
  }, []);
}

function StaffSpaceView({ access, mode }: { access: GrantedAccess; mode: "demo" | "account" }) {
  const path = useAdminPath();
  const route = resolveStaffRoute(path);
  const [program, setProgram] = useState<StaffProgram | null>(null);
  const [search, setSearch] = useState<SearchMemory>({ query: "", page: null });
  const [cards, setCards] = useState<CardsState>({ status: "idle" });

  const reloadProgram = useCallback(() => {
    void fetchStaffProgram(access.rpc)
      .then(setProgram)
      .catch(() => setProgram(null));
  }, [access.rpc]);
  useEffect(reloadProgram, [reloadProgram]);

  const refreshCards = useCallback(() => {
    setCards({ status: "loading" });
    collectCards(access.rpc)
      .then((data) => setCards({ status: "ready", data }))
      .catch((error) => setCards({ status: "error", error }));
  }, [access.rpc]);

  const redirectTo = route.page === "redirect" ? route.to : null;
  useEffect(() => {
    if (redirectTo) navigate(redirectTo, { replace: true });
  }, [redirectTo]);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [path]);

  return (
    <StaffContext.Provider value={{ ...access, mode, program, reloadProgram, cards, refreshCards, search, setSearch }}>
      <StaffLayout section={sectionOf(route)}>
        {route.page === "home" ? <StaffHomePage /> : null}
        {route.page === "clients" ? <StaffSearchPage /> : null}
        {route.page === "rewards" ? <RewardsPage /> : null}
        {route.page === "points" ? <PointsPage /> : null}
        {route.page === "card" ? <StaffCardPage key={route.cardId} cardId={route.cardId} /> : null}
      </StaffLayout>
    </StaffContext.Provider>
  );
}

export default function StaffLoyaltyApp() {
  useStaffDocument();
  if (LOCAL_BACKEND) {
    return (
      <>
        <DemoAccess>{(access) => <StaffSpaceView access={access} mode="demo" />}</DemoAccess>
        {StaffDevToolbar ? (
          <Suspense fallback={null}>
            <StaffDevToolbar />
          </Suspense>
        ) : null}
      </>
    );
  }
  return <AccountAccess>{(access) => <StaffSpaceView access={access} mode="account" />}</AccountAccess>;
}
