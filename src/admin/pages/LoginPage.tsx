import { useState, type FormEvent } from "react";
import { BrandLogo } from "../../components/BrandLogo";
import { CenteredCard, inputClass, primaryButtonClass } from "../components/ui";

/** Connexion email + mot de passe. La redirection suit l'état d'accès (useAdminAuth). */
export function LoginPage({ onSignIn }: { onSignIn: (email: string, password: string) => Promise<string | null> }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setPending(true);
    setError(null);
    const message = await onSignIn(email, password);
    setPending(false);
    if (message) setError(message);
  };

  return (
    <CenteredCard>
      <div className="mb-6 flex flex-col items-center text-center">
        <BrandLogo size={48} />
        <h1 className="mt-3 text-lg font-semibold text-stone-900">Espace administrateur</h1>
        <p className="mt-1 text-sm text-stone-500">Gestion du menu Kaytôri Sushi</p>
      </div>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div>
          <label htmlFor="admin-email" className="mb-1 block text-sm font-medium text-stone-700">
            Email
          </label>
          <input
            id="admin-email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="admin-password" className="mb-1 block text-sm font-medium text-stone-700">
            Mot de passe
          </label>
          <input
            id="admin-password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
          />
        </div>
        {error ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {error}
          </p>
        ) : null}
        <button type="submit" disabled={pending || !email || !password} className={primaryButtonClass}>
          {pending ? "Connexion…" : "Se connecter"}
        </button>
      </form>
    </CenteredCard>
  );
}
