/**
 * Authentification admin (Supabase Auth, clé publishable uniquement).
 *
 * Être connecté ne suffit pas : les droits viennent de public.is_admin(), la fonction SQL
 * qui lit admin_users et sur laquelle reposent aussi toutes les politiques RLS d'écriture.
 * Même si l'interface se trompait, la base refuserait les écritures d'un non-admin.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type AdminAccess =
  | { status: "loading" }
  | { status: "unconfigured" }
  | { status: "signedOut" }
  | { status: "notAdmin"; email: string }
  | { status: "admin"; email: string }
  | { status: "error"; message: string };

/** Session courante + appartenance à admin_users (via la RPC is_admin). */
export async function determineAdminAccess(client: SupabaseClient): Promise<AdminAccess> {
  const { data, error } = await client.auth.getSession();
  if (error) return { status: "error", message: error.message };
  const session = data.session;
  if (!session) return { status: "signedOut" };

  const email = session.user.email ?? "";
  const res = await client.rpc("is_admin");
  if (res.error) return { status: "error", message: `Vérification des droits impossible : ${res.error.message}` };
  return res.data === true ? { status: "admin", email } : { status: "notAdmin", email };
}

/** Message d'erreur de connexion compréhensible par le restaurateur. */
export function signInErrorMessage(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) return "Email ou mot de passe incorrect.";
  if (m.includes("email not confirmed")) return "Adresse email non confirmée.";
  if (m.includes("rate limit") || m.includes("too many")) return "Trop de tentatives. Réessayez dans quelques minutes.";
  if (m.includes("fetch") || m.includes("network")) return "Connexion impossible. Vérifiez votre accès Internet.";
  return "Connexion impossible. Réessayez.";
}

/** Connexion email + mot de passe. Renvoie un message d'erreur, ou null en cas de succès. */
export async function signInAdmin(client: SupabaseClient, email: string, password: string): Promise<string | null> {
  const { error } = await client.auth.signInWithPassword({ email: email.trim(), password });
  return error ? signInErrorMessage(error.message) : null;
}

export async function signOutAdmin(client: SupabaseClient): Promise<void> {
  await client.auth.signOut();
}
