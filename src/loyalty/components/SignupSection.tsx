/**
 * Création de la carte : saisie → récapitulatif → envoi. Une seule demande à la fois ; une demande
 * interrompue (réseau) se reprend telle quelle, sans risque de seconde carte.
 */
import { useEffect, useReducer, useRef, useState, type ReactNode } from "react";
import { asLoyaltyError, registrationAdvice, type ErrorAdvice } from "../lib/errors";
import { pendingFor, sendRegistration, type RegistrationSuccess } from "../lib/registration";
import {
  INITIAL_SIGNUP,
  confirmationSummary,
  signupReducer,
  type SignupField,
  type SignupState,
} from "../lib/signupForm";
import { clearPending, type PendingRegistration } from "../lib/storage";
import { Notice, Spinner, focusRing, primaryButton, secondaryButton, textLink } from "./ui";

/** 16 px minimum : pas de zoom automatique d'iOS Safari au focus. */
const inputClass = `block min-h-[52px] w-full rounded-xl border bg-white px-4 text-[16px] text-kaytori-black placeholder:text-kaytori-muted/70 transition-colors focus:border-kaytori-green focus:outline-none focus:ring-2 focus:ring-kaytori-green/25`;

type Props = {
  /** Demande restée sans réponse sur cet appareil (reprise proposée). */
  resume: PendingRegistration | null;
  /** Une carte est déjà gardée sur cet appareil. */
  hasSavedCard: boolean;
  onCreated: (result: RegistrationSuccess) => void;
  /** Le programme vient d'être signalé fermé par la base. */
  onClosed: () => void;
  /** Ouvrir l'aide « carte perdue ». */
  recoveryHref: string;
  /** État initial (tests du rendu). */
  initialState?: SignupState;
};

export function SignupSection({ resume, hasSavedCard, onCreated, onClosed, recoveryHref, initialState }: Props) {
  const [state, dispatch] = useReducer(signupReducer, initialState ?? (resume ? { ...INITIAL_SIGNUP, step: "confirm", values: { fullName: resume.fullName, phone: resume.phone } } : INITIAL_SIGNUP));
  const [resuming, setResuming] = useState(resume !== null);
  const inFlight = useRef(false);
  const fields = { fullName: useRef<HTMLInputElement>(null), phone: useRef<HTMLInputElement>(null) };
  const confirmHeading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (state.focus) fields[state.focus].current?.focus();
  }, [state.focus, state.step]);

  // Récapitulatif (après « Continuer », ou demande interrompue à reprendre) : amené à l'écran et annoncé.
  useEffect(() => {
    if (state.step === "confirm") {
      confirmHeading.current?.focus({ preventScroll: true });
      confirmHeading.current?.scrollIntoView({ block: "start", behavior: "smooth" });
    }
  }, [state.step]);

  const submit = async () => {
    if (inFlight.current || state.step !== "confirm") return;
    inFlight.current = true;
    dispatch({ type: "submit" });
    try {
      const result = await sendRegistration(pendingFor(state.values));
      setResuming(false);
      onCreated(result);
    } catch (e) {
      const advice = registrationAdvice(asLoyaltyError(e));
      if (advice.action === "home") onClosed();
      dispatch({ type: "failed", advice });
    } finally {
      inFlight.current = false;
    }
  };

  const abandon = () => {
    clearPending();
    setResuming(false);
    dispatch({ type: "edit" });
  };

  if (state.step === "form") {
    return (
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          dispatch({ type: "review" });
        }}
        className="space-y-5"
        aria-labelledby="fidelite-creer"
      >
        <h2 id="fidelite-creer" className="font-display text-[1.45rem] font-semibold">
          Créer ma carte
        </h2>
        {state.failure ? <FailureNotice advice={state.failure} recoveryHref={recoveryHref} /> : null}
        <Field state={state} field="fullName" label="Nom et prénom" hint="Tel qu'on vous appelle au comptoir.">
          <input
            ref={fields.fullName}
            id="fidelite-fullName"
            name="name"
            type="text"
            autoComplete="name"
            autoCapitalize="words"
            enterKeyHint="next"
            maxLength={120}
            value={state.values.fullName}
            onChange={(e) => dispatch({ type: "change", field: "fullName", value: e.target.value })}
            onBlur={() => dispatch({ type: "blur", field: "fullName" })}
            aria-invalid={state.errors.fullName ? true : undefined}
            aria-describedby={state.errors.fullName ? "fidelite-fullName-error" : "fidelite-fullName-hint"}
            className={`${inputClass} ${state.errors.fullName ? "border-red-400" : "border-kaytori-black/15"}`}
          />
        </Field>
        <Field state={state} field="phone" label="Numéro de mobile" hint="Exemple : 06 12 34 56 78. Il sert à retrouver votre carte.">
          <input
            ref={fields.phone}
            id="fidelite-phone"
            name="tel"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            enterKeyHint="done"
            maxLength={24}
            placeholder="06 12 34 56 78"
            value={state.values.phone}
            onChange={(e) => dispatch({ type: "change", field: "phone", value: e.target.value })}
            onBlur={() => dispatch({ type: "blur", field: "phone" })}
            aria-invalid={state.errors.phone ? true : undefined}
            aria-describedby={state.errors.phone ? "fidelite-phone-error" : "fidelite-phone-hint"}
            className={`${inputClass} ${state.errors.phone ? "border-red-400" : "border-kaytori-black/15"}`}
          />
        </Field>
        <button type="submit" className={primaryButton}>
          Continuer
        </button>
      </form>
    );
  }

  const summary = confirmationSummary(state.values);
  const submitting = state.step === "submitting";
  return (
    <section aria-labelledby="fidelite-confirmer" className="space-y-5">
      <h2 id="fidelite-confirmer" ref={confirmHeading} tabIndex={-1} className="scroll-mt-24 font-display text-[1.45rem] font-semibold outline-none">
        Vos informations sont-elles exactes ?
      </h2>
      {resuming && !state.failure ? (
        <Notice tone="warning" title="Une demande n'a pas reçu de réponse" role="status">
          Votre précédente création de carte a été interrompue. Confirmez pour la reprendre : si la carte existe déjà, vous
          la retrouverez, sans doublon.
        </Notice>
      ) : null}
      <dl className="divide-y divide-kaytori-black/[0.07] rounded-2xl border border-kaytori-black/[0.08] bg-white">
        <div className="px-5 py-4">
          <dt className="text-[0.85rem] text-kaytori-muted">Nom et prénom</dt>
          <dd className="mt-0.5 break-words text-[1.1rem] font-semibold">{summary.fullName}</dd>
        </div>
        <div className="px-5 py-4">
          <dt className="text-[0.85rem] text-kaytori-muted">Numéro de mobile</dt>
          <dd className="mt-0.5 text-[1.1rem] font-semibold tabular-nums">{summary.phone}</dd>
        </div>
      </dl>
      <p className="text-[0.92rem] leading-relaxed text-kaytori-black/75">
        Le numéro sert à retrouver votre carte : vérifiez-le bien, c'est à lui que le restaurant enverra un nouveau lien si
        besoin.
        {hasSavedCard ? " Une carte est déjà gardée sur ce téléphone : la nouvelle la remplacera ici (l'ancienne reste valable)." : ""}
      </p>
      {state.failure ? <FailureNotice advice={state.failure} recoveryHref={recoveryHref} /> : null}
      <div className="flex flex-col gap-3" aria-live="polite">
        <button type="button" onClick={submit} disabled={submitting} aria-busy={submitting} className={primaryButton}>
          {submitting ? <Spinner /> : null}
          {submitting ? "Création de votre carte…" : state.failure?.action === "retry" || state.failure?.action === "wait" ? "Réessayer" : "Confirmer et créer ma carte"}
        </button>
        {resuming ? (
          <button type="button" onClick={abandon} disabled={submitting} className={secondaryButton}>
            Abandonner cette demande
          </button>
        ) : (
          <button type="button" onClick={() => dispatch({ type: "edit" })} disabled={submitting} className={secondaryButton}>
            Modifier mes informations
          </button>
        )}
      </div>
    </section>
  );
}

function Field({ state, field, label, hint, children }: { state: SignupState; field: SignupField; label: string; hint: string; children: ReactNode }) {
  const error = state.errors[field];
  return (
    <div>
      <label htmlFor={`fidelite-${field}`} className="mb-1.5 block text-[0.95rem] font-semibold">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`fidelite-${field}-error`} className="mt-1.5 text-[0.88rem] font-medium text-red-700">
          {error}
        </p>
      ) : (
        <p id={`fidelite-${field}-hint`} className="mt-1.5 text-[0.85rem] text-kaytori-muted">
          {hint}
        </p>
      )}
    </div>
  );
}

function FailureNotice({ advice, recoveryHref }: { advice: ErrorAdvice; recoveryHref: string }) {
  return (
    <Notice tone={advice.action === "retry" || advice.action === "wait" ? "warning" : "error"} title={advice.title} role="alert">
      {advice.message}
      {advice.action === "recover" ? (
        <>
          {" "}
          <a href={recoveryHref} className={`${textLink} ${focusRing}`}>
            Comment retrouver ma carte
          </a>
        </>
      ) : null}
    </Notice>
  );
}
