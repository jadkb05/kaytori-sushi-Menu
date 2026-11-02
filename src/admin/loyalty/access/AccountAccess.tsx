/**
 * Accès RÉEL (hors banc local) : authentification principale de l'administration (compte Supabase
 * connecté), rôle de fidélité lu dans la base (loyalty_my_role : admin du site = owner, ou ligne
 * loyalty.staff). Chaque opération est de nouveau contrôlée par la base (loyalty.require_staff).
 *
 * Aucun second écran de code PIN : l'accès est direct dès que le compte autorisé est connecté.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { getSupabaseClient } from "../../../lib/supabase/client";
import { CenteredCard, LoadingState, primaryButtonClass } from "../../components/ui";
import { signInAdmin, signOutAdmin } from "../../lib/auth";
import { LoginPage } from "../../pages/LoginPage";
import { UnconfiguredPage } from "../../pages/AccessPages";
import { fetchStaffRole, type StaffRole, type StaffRpc } from "../lib/staffApi";
import { staffAdvice } from "../lib/staffErrors";
import type { GrantedAccess } from "./DemoAccess";

type State =
  | { status: "loading" }
  | { status: "signedOut" }
  | { status: "denied"; email: string }
  | { status: "ready"; email: string; role: StaffRole }
  | { status: "error"; message: string };

function clientRpc(client: SupabaseClient): StaffRpc {
  return (fn, args, signal) => client.rpc(fn, args).abortSignal(signal);
}

export function AccountAccess({ children }: { children: (access: GrantedAccess) => ReactNode }) {
  const client = useMemo(() => getSupabaseClient(), []);
  const rpc = useMemo(() => (client ? clientRpc(client) : null), [client]);
  const [state, setState] = useState<State>({ status: "loading" });

  const refresh = useCallback(async () => {
    if (!client || !rpc) return;
    const { data, error } = await client.auth.getSession();
    if (error) return setState({ status: "error", message: "Vérification de la session impossible. Réessayez." });
    if (!data.session) return setState({ status: "signedOut" });
    const email = data.session.user.email ?? "";
    try {
      const role = await fetchStaffRole(rpc);
      setState(role ? { status: "ready", email, role } : { status: "denied", email });
    } catch (e) {
      setState({ status: "error", message: staffAdvice(e).message });
    }
  }, [client, rpc]);

  useEffect(() => {
    if (!client) return;
    void refresh();
    const { data } = client.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") setTimeout(() => void refresh(), 0);
    });
    return () => data.subscription.unsubscribe();
  }, [client, refresh]);

  if (!client || !rpc) return <UnconfiguredPage />;
  const signOut = () => void signOutAdmin(client);

  switch (state.status) {
    case "loading":
      return (
        <CenteredCard>
          <LoadingState label="Vérification de l'accès…" />
        </CenteredCard>
      );
    case "signedOut":
      return (
        <LoginPage
          subtitle="Administration · Kaytôri Club"
          onSignIn={(email, password) => signInAdmin(client, email, password)}
        />
      );
    case "denied":
      return (
        <CenteredCard>
          <h1 className="text-lg font-semibold text-admin-ink">Accès refusé</h1>
          <p className="mt-2 text-sm leading-relaxed text-admin-soft">
            Le compte <span className="font-medium text-admin-ink">{state.email || "connecté"}</span> n&apos;a pas les
            droits de gestion de la fidélité.
          </p>
          <button type="button" onClick={signOut} className={`${primaryButtonClass} mt-6`}>
            Se déconnecter
          </button>
        </CenteredCard>
      );
    case "error":
      return (
        <CenteredCard>
          <h1 className="text-lg font-semibold text-admin-ink">Vérification impossible</h1>
          <p className="mt-2 text-sm leading-relaxed text-admin-soft">{state.message}</p>
          <button type="button" onClick={() => void refresh()} className={`${primaryButtonClass} mt-6`}>
            Réessayer
          </button>
        </CenteredCard>
      );
    case "ready":
      return <>{children({ rpc, role: state.role, identity: state.email, lock: signOut })}</>;
  }
}
