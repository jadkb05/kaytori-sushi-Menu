/**
 * Faux client Supabase adossé à PGlite : chaque requête s'exécute avec le rôle de l'utilisateur
 * simulé (anon, ou authenticated + auth.uid()), donc sous les VRAIES politiques RLS.
 * Couvre ce qu'utilise l'admin : auth.getSession, rpc, from().select().order().
 */
import type { PGlite } from "@electric-sql/pglite";
import type { SupabaseClient } from "@supabase/supabase-js";
import { actAs } from "./supabaseTestDb";

export type FakeUser = { id: string; email: string };

type Result<T> = { data: T | null; error: { message: string; code?: string } | null };

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
    rpc: (fn: string, args: Record<string, unknown> = {}): Promise<Result<unknown>> =>
      overrides.rpcError
        ? Promise.resolve({ data: null, error: { message: overrides.rpcError } })
        : asUser(async () => {
            // Paramètres nommés comme PostgREST ; objets/tableaux transmis en jsonb.
            const names = Object.keys(args);
            const values = names.map((n) => {
              const v = args[n];
              return v !== null && typeof v === "object" ? JSON.stringify(v) : v;
            });
            const params = names
              .map((n, i) => {
                const v = args[n];
                return `${n} => $${i + 1}${v !== null && typeof v === "object" ? "::jsonb" : ""}`;
              })
              .join(", ");
            try {
              const res = await db.query<{ r: unknown }>(`select public.${fn}(${params}) as r`, values);
              return { data: res.rows[0].r, error: null };
            } catch (e) {
              const err = e as Error & { code?: string };
              return { data: null, error: { message: err.message, code: err.code } };
            }
          }),
    from: (table: string) => ({
      select: (columns: string) => ({
        order: (column: string) => select(table, columns, column),
      }),
      // update(values).eq(col, val).select(cols) — la RLS filtre les lignes (0 ligne = refus).
      update: (values: Record<string, unknown>) => ({
        eq: (column: string, value: unknown) => ({
          select: (columns: string): Promise<Result<unknown[]>> =>
            asUser(async () => {
              const keys = Object.keys(values);
              const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(", ");
              try {
                const res = await db.query(
                  `update public.${table} set ${sets} where ${column} = $${keys.length + 1} returning ${columns}`,
                  [...keys.map((k) => values[k]), value],
                );
                return { data: res.rows, error: null };
              } catch (e) {
                return { data: null, error: { message: (e as Error).message } };
              }
            }),
        }),
      }),
    }),
    // Storage : un dépôt = une ligne storage.objects, insérée avec le rôle de l'utilisateur (RLS réelle).
    storage: {
      from: (bucket: string) => ({
        upload: (path: string, _file: Blob, _options?: unknown): Promise<Result<{ path: string }>> =>
          asUser(async () => {
            try {
              await db.query("insert into storage.objects (bucket_id, name) values ($1, $2)", [bucket, path]);
              return { data: { path }, error: null };
            } catch (e) {
              const err = e as Error & { code?: string };
              const message = err.code === "23505" ? "The resource already exists" : err.message;
              return { data: null, error: { message } };
            }
          }),
        getPublicUrl: (path: string) => ({
          data: { publicUrl: `https://test.supabase.co/storage/v1/object/public/${bucket}/${path}` },
        }),
      }),
    },
  };
  return fake as unknown as SupabaseClient;
}
