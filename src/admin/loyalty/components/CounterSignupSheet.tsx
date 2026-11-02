/**
 * Inscrire un client présent au comptoir : nom, mobile, accord du client.
 * Crée la carte via loyalty_register (solde initial : 0 point) et affiche le lien personnel.
 */
import { useId, useMemo, useState, type FormEvent } from "react";
import { normalizeMoroccanPhone } from "../../../cart/checkout";
import { qrOrigin } from "../../../loyalty/lib/qr";
import { validateFullName } from "../../../loyalty/lib/signupForm";
import { navigate } from "../../hooks/useAdminPath";
import { createCounterSignup, type CounterSignupResult } from "../lib/counterSignup";
import { staffAdvice, type StaffAdvice } from "../lib/staffErrors";
import { staffCardPath } from "../routes";
import { useStaff } from "../StaffContext";
import { CardLinkView, NamePhoneFields } from "./CardSheets";
import { AdviceBox, BusyLabel, Sheet, outlineButton, primaryButton } from "./staffUi";

export function CounterSignupSheet({ onClose }: { onClose: (created: boolean) => void }) {
  const { rpc } = useStaff();
  const id = useId();
  const signup = useMemo(() => createCounterSignup(rpc), [rpc]);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<{ fullName?: string; phone?: string; consent?: string }>({});
  const [busy, setBusy] = useState(false);
  const [advice, setAdvice] = useState<StaffAdvice | null>(null);
  const [done, setDone] = useState<CounterSignupResult | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const next = {
      fullName: validateFullName(fullName)
        ? "Indiquez le nom et prénom (2 à 80 caractères, avec des lettres)."
        : undefined,
      phone: normalizeMoroccanPhone(phone) ? undefined : "Numéro invalide. Exemple : 06 12 34 56 78.",
      consent: consent ? undefined : "Le client doit avoir donné son accord.",
    };
    setErrors(next);
    if (next.fullName || next.phone || next.consent) return;
    setBusy(true);
    setAdvice(null);
    try {
      setDone(await signup.submit({ fullName, phone }, qrOrigin()));
    } catch (err) {
      const a = staffAdvice(err);
      if (a.field === "fullName" || a.field === "phone") setErrors({ [a.field]: a.message });
      else setAdvice(a);
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <Sheet
        title={done.replayed ? "Carte déjà créée" : "Carte créée"}
        busy={false}
        onClose={() => onClose(true)}
        footer={
          <>
            <button type="button" onClick={() => onClose(true)} className={`${outlineButton} sm:w-auto`}>
              Fermer
            </button>
            <button
              type="button"
              onClick={() => {
                onClose(true);
                navigate(staffCardPath(done.card.cardId));
              }}
              className={`${primaryButton} sm:w-auto`}
            >
              Ouvrir la fiche client
            </button>
          </>
        }
      >
        <CardLinkView
          fullName={done.card.fullName}
          phone={done.card.phone}
          link={done.link}
          intro={
            done.replayed
              ? "La réponse précédente s'était perdue : la carte existait déjà, aucune seconde carte n'a été créée."
              : `La carte Kaytôri Club de ${done.card.fullName} est créée (solde initial : 0 point). Remettez-lui son lien personnel.`
          }
        />
      </Sheet>
    );
  }

  return (
    <Sheet
      title="Inscrire un client au comptoir"
      busy={busy}
      onClose={() => onClose(false)}
      footer={
        <>
          <button type="button" onClick={() => onClose(false)} disabled={busy} className={`${outlineButton} sm:w-auto`}>
            Annuler
          </button>
          <button
            type="submit"
            form={`${id}-form`}
            disabled={busy}
            className={`${primaryButton} sm:w-auto sm:min-w-[11.5rem]`}
          >
            <BusyLabel busy={busy} idle="Créer la carte" pending="Création…" />
          </button>
        </>
      }
    >
      <form id={`${id}-form`} onSubmit={submit} noValidate className="space-y-3">
        <NamePhoneFields
          idBase={id}
          fullName={fullName}
          phone={phone}
          setFullName={(v) => {
            setFullName(v);
            setErrors((x) => ({ ...x, fullName: undefined }));
          }}
          setPhone={(v) => {
            setPhone(v);
            setErrors((x) => ({ ...x, phone: undefined }));
          }}
          errorFor={(n) => errors[n]}
        />
        <label className="flex min-h-[44px] cursor-pointer items-start gap-3 text-[0.88rem] text-admin-ink">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => {
              setConsent(e.target.checked);
              setErrors((x) => ({ ...x, consent: undefined }));
            }}
            aria-invalid={errors.consent ? true : undefined}
            aria-describedby={`${id}-consent-error`}
            className="mt-0.5 h-4 w-4 shrink-0 accent-[#003024]"
          />
          <span>
            Le client est présent et accepte que son nom et son numéro soient enregistrés pour sa carte Kaytôri Club.
          </span>
        </label>
        <p id={`${id}-consent-error`} className="min-h-[1.2rem] text-[0.82rem] font-medium text-admin-danger" aria-live="polite">
          {errors.consent ?? ""}
        </p>
      </form>
      {advice ? <AdviceBox advice={advice} /> : null}
    </Sheet>
  );
}
