/** Écrans d'accès : refusé, Supabase non configuré, erreur de vérification. */
import { CenteredCard, primaryButtonClass } from "../components/ui";

export function AccessDeniedPage({ email, onSignOut }: { email: string; onSignOut: () => void }) {
  return (
    <CenteredCard>
      <h1 className="text-lg font-semibold text-stone-900">Accès refusé</h1>
      <p className="mt-2 text-sm text-stone-600">
        Le compte <span className="font-medium text-stone-900">{email || "connecté"}</span> n'a pas les droits
        administrateur pour gérer le menu.
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
      <h1 className="text-lg font-semibold text-stone-900">Administration indisponible</h1>
      <p className="mt-2 text-sm text-stone-600">
        Supabase n'est pas configuré pour ce site (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).
      </p>
    </CenteredCard>
  );
}

export function AccessErrorPage({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <CenteredCard>
      <h1 className="text-lg font-semibold text-stone-900">Vérification impossible</h1>
      <p className="mt-2 text-sm text-stone-600">{message}</p>
      <button type="button" onClick={onRetry} className={`${primaryButtonClass} mt-6`}>
        Réessayer
      </button>
    </CenteredCard>
  );
}
