import type { SupabaseClient } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { MenuRows } from "../../data/menuRows";
import { fetchMenuRows } from "../../data/supabaseMenuSource";

export type AdminMenuDataState =
  | { status: "loading"; rows: null; error: null }
  | { status: "ready"; rows: MenuRows; error: null }
  | { status: "error"; rows: null; error: string };

type AdminMenuDataValue = AdminMenuDataState & { reload: () => void };

export const AdminMenuDataContext = createContext<AdminMenuDataValue | null>(null);

/**
 * Charge une seule fois les tables du menu (session admin : y compris les éléments masqués)
 * pour toutes les pages de l'admin. Monté uniquement après vérification des droits.
 */
export function AdminMenuDataProvider({ client, children }: { client: SupabaseClient; children: ReactNode }) {
  const [state, setState] = useState<AdminMenuDataState>({ status: "loading", rows: null, error: null });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading", rows: null, error: null });
    fetchMenuRows(client)
      .then((rows) => {
        if (!cancelled) setState({ status: "ready", rows, error: null });
      })
      .catch((e: unknown) => {
        if (!cancelled) setState({ status: "error", rows: null, error: e instanceof Error ? e.message : String(e) });
      });
    return () => {
      cancelled = true;
    };
  }, [client, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);

  return <AdminMenuDataContext.Provider value={{ ...state, reload }}>{children}</AdminMenuDataContext.Provider>;
}

export function useAdminMenuData(): AdminMenuDataValue {
  const value = useContext(AdminMenuDataContext);
  if (!value) throw new Error("useAdminMenuData doit être utilisé dans AdminMenuDataProvider");
  return value;
}
