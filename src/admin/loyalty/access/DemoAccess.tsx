/**
 * Accès du BANC D'ESSAI LOCAL (npm run dev:fidelite) : entrée directe avec le profil du banc local,
 * sans second écran de code PIN (conformément à l'authentification unique de l'administration).
 * N'est rendu que si LOCAL_BACKEND (voir StaffLoyaltyApp) ; le module du banc local
 * et la base PGlite sont chargés à la demande et absents du build de production.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { LOCAL_BACKEND } from "../../../loyalty/lib/api";
import { CenteredCard, LoadingState } from "../../components/ui";
import { navigate } from "../../hooks/useAdminPath";
import { fetchStaffRole, type StaffRole, type StaffRpc } from "../lib/staffApi";

type DemoModule = typeof import("../../../loyalty/dev/staffDemo");
const loadDemo = LOCAL_BACKEND ? () => import("../../../loyalty/dev/staffDemo") : null;

export type GrantedAccess = {
  rpc: StaffRpc;
  role: StaffRole;
  identity: string;
  lock: () => void;
};

type State =
  | { status: "loading" }
  | { status: "ready"; role: StaffRole }
  | { status: "error"; message: string };

export function DemoAccess({ children }: { children: (access: GrantedAccess) => ReactNode }) {
  const [demo, setDemo] = useState<DemoModule | null>(null);
  const [state, setState] = useState<State>({ status: "loading" });

  const rpc = useMemo<StaffRpc | null>(() => {
    if (!demo) return null;
    return async (fn, args) => demo.staffRpc(fn, args);
  }, [demo]);

  const enter = useCallback(async (r: StaffRpc) => {
    try {
      const role = await fetchStaffRole(r);
      if (!role) throw new Error("rôle absent");
      setState({ status: "ready", role });
    } catch (e) {
      setState({ status: "error", message: e instanceof Error ? e.message : "Session locale indisponible" });
    }
  }, []);

  useEffect(() => {
    if (!loadDemo) {
      setState({ status: "error", message: "Environnement local indisponible." });
      return;
    }
    let alive = true;
    void loadDemo().then((m) => {
      if (alive) setDemo(m);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!rpc || state.status !== "loading") return;
    void enter(rpc);
  }, [rpc, state.status, enter]);

  if (state.status === "error") {
    return (
      <CenteredCard>
        <h1 className="text-lg font-semibold text-admin-ink">Session indisponible</h1>
        <p className="mt-2 text-sm text-admin-soft">{state.message}</p>
      </CenteredCard>
    );
  }
  if (state.status !== "ready" || !rpc || !demo) {
    return (
      <CenteredCard>
        <LoadingState label="Vérification de l'accès…" />
      </CenteredCard>
    );
  }
  return (
    <>
      {children({
        rpc,
        role: state.role,
        identity: demo.benchEmail(),
        lock: () => navigate("/admin"),
      })}
    </>
  );
}
