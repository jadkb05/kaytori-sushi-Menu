/** Écrans d'accès : refusé, Supabase non configuré, erreur de vérification. */
import { AdminLink } from "../components/AdminLink";
import { CenteredCard, primaryButtonClass } from "../components/ui";
import { STAFF_ROUTES } from "../loyalty/routes";

export function AccessDeniedPage({ email, onSignOut }: { email: string; onSignOut: () => void }) {
  return (
    <CenteredCard>
      <h1 className="text-lg font-semibold text-admin-ink">Accès refusé</h1>
      <p className="mt-2 text-sm leading-relaxed text-admin-soft">
        Le compte <span className="font-medium text-admin-ink">{email || "connecté"}</span> n'a pas les droits
        administrateur pour gérer le menu.
      </p>
      <p className="mt-3 text-sm leading-relaxed text-admin-soft">
        Membre du personnel de fidélité ?{" "}
        <AdminLink href={STAFF_ROUTES.home} className="font-medium text-kaytori-green underline underline-offset-2">
          Ouvrir l'espace fidélité
        </AdminLink>
      </p>
      <button type="button" onClick={onSignOut} className={`${primaryButtonClass} mt-6`}>
        Se déconnecter
      </button>
    </CenteredCard>
  );
}

export function UnconfiguredPage() {
  return (
    <CenteredCard>
      <h1 className="text-lg font-semibold text-admin-ink">Administration indisponible</h1>
      <p className="mt-2 text-sm leading-relaxed text-admin-soft">
        Supabase n'est pas configuré pour ce site (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).
      </p>
    </CenteredCard>
  );
}

export function AccessErrorPage({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <CenteredCard>
      <h1 className="text-lg font-semibold text-admin-ink">Vérification impossible</h1>
      <p className="mt-2 text-sm leading-relaxed text-admin-soft">{message}</p>
      <button type="button" onClick={onRetry} className={`${primaryButtonClass} mt-6`}>
        Réessayer
      </button>
    </CenteredCard>
  );
}
