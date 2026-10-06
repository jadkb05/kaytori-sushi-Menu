/**
 * Faux client Supabase adossé à PGlite : chaque requête s'exécute avec le rôle de l'utilisateur
 * simulé (anon, ou authenticated + auth.uid()), donc sous les VRAIES politiques RLS.
 * Couvre ce qu'utilise l'admin : auth.getSession, rpc, from().select().order().
 */
import type { PGlite } from "@electric-sql/pglite";
import type { SupabaseClient } from "@supabase/supabase-js";
import { actAs } from "./supabaseTestDb";

export type FakeUser = { id: string; email: string };

type Result<T> = { data: T | null; error: { message: string } | null };

export function createPgliteSupabase(
  db: PGlite,
  user: FakeUser | null,
  overrides: { rpcError?: string; sessionError?: string } = {},
): SupabaseClient {
  // Les requêtes sont sérialisées : le changement de rôle ne doit pas se mélanger entre requêtes.
  let queue: Promise<unknown> = Promise.resolve();
  const asUser = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = queue.then(async () => {
      await actAs(db, user ? { userId: user.id } : "anon");
      try {
        return await fn();
      } finally {
        await actAs(db, "owner");
      }
    });
    queue = run.catch(() => {});
    return run;
  };

  const select = (table: string, columns: string, orderBy: string): Promise<Result<unknown[]>> =>
    asUser(async () => {
      try {
        const res = await db.query(`select ${columns} from public.${table} order by ${orderBy}`);
        return { data: res.rows, error: null };
      } catch (e) {
        return { data: null, error: { message: (e as Error).message } };
      }
    });

  const fake = {
    auth: {
      getSession: async () =>
        overrides.sessionError
          ? { data: { session: null }, error: { message: overrides.sessionError } }
          : { data: { session: user ? { user: { id: user.id, email: user.email } } : null }, error: null },
    },
    rpc: (fn: string): Promise<Result<unknown>> =>
      overrides.rpcError
        ? Promise.resolve({ data: null, error: { message: overrides.rpcError } })
        : asUser(async () => {
            const res = await db.query<{ r: unknown }>(`select public.${fn}() as r`);
            return { data: res.rows[0].r, error: null };
          }),
    from: (table: string) => ({
      select: (columns: string) => ({
        order: (column: string) => select(table, columns, column),
      }),
    }),
  };
  return fake as unknown as SupabaseClient;
}
