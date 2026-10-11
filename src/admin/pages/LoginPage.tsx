import { useState, type FormEvent } from "react";
import { BrandLogo } from "../../components/BrandLogo";
import { AlertIcon } from "../components/icons";
import { CenteredCard, Spinner, inputClass, primaryButtonClass } from "../components/ui";

/** Connexion email + mot de passe. La redirection suit l'état d'accès (useAdminAuth). */
export function LoginPage({ onSignIn }: { onSignIn: (email: string, password: string) => Promise<string | null> }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    const message = await onSignIn(email, password);
    setPending(false);
    if (message) setError(message);
  };

  return (
    <CenteredCard>
      <div className="mb-7 flex flex-col items-center text-center">
        <BrandLogo size={56} className="shadow-admin-sm ring-4 ring-admin-tint" />
        <p className="mt-4 font-display text-[1.375rem] font-semibold text-admin-ink">Kaytôri Sushi</p>
        <h1 className="mt-1 text-sm font-medium text-admin-soft">Espace administrateur · gestion du menu</h1>
      </div>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div>
          <label htmlFor="admin-email" className="mb-1.5 block text-[13px] font-medium text-admin-ink">
            Email
          </label>
          <input
            id="admin-email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={`${inputClass} h-11`}
          />
        </div>
        <div>
          <label htmlFor="admin-password" className="mb-1.5 block text-[13px] font-medium text-admin-ink">
            Mot de passe
          </label>
          <input
            id="admin-password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={`${inputClass} h-11`}
          />
        </div>
        {error ? (
          <p className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50/80 px-3 py-2.5 text-sm text-red-800 motion-safe:animate-admin-in" role="alert">
            <AlertIcon className="mt-0.5 h-4 w-4 text-red-600" />
            {error}
          </p>
        ) : null}
        <button type="submit" disabled={pending || !email || !password} className={primaryButtonClass}>
          {pending ? <Spinner /> : null}
          {pending ? "Connexion…" : "Se connecter"}
        </button>
      </form>
    </CenteredCard>
  );
}
