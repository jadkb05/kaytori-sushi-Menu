import type { SupabaseClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useState } from "react";
import { determineAdminAccess, type AdminAccess } from "../lib/auth";

/**
 * État d'accès à l'admin, recalculé à la connexion / déconnexion.
 * `client` null = Supabase non configuré.
 */
export function useAdminAuth(client: SupabaseClient | null): { access: AdminAccess; refresh: () => void } {
  const [access, setAccess] = useState<AdminAccess>(() =>
    client ? { status: "loading" } : { status: "unconfigured" },
  );

  const refresh = useCallback(() => {
    if (!client) return;
    void determineAdminAccess(client)
      .then(setAccess)
      .catch((e: unknown) => setAccess({ status: "error", message: e instanceof Error ? e.message : String(e) }));
  }, [client]);

  useEffect(() => {
    if (!client) return;
    refresh();
    const { data } = client.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        // Hors du callback : supabase-js déconseille d'appeler l'API pendant l'événement.
        setTimeout(refresh, 0);
      }
    });
    return () => data.subscription.unsubscribe();
  }, [client, refresh]);

  return { access, refresh };
}
