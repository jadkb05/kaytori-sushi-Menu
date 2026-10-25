import { useRef, useState, type ReactNode } from "react";
import { lineSubtotalDh, type CartLine } from "../cart/buildOrderMessage";
import {
  DELIVERY_FEE_LABEL,
  PAYMENT_METHODS,
  formatMoroccanPhoneDisplay,
  mapsUrlFromCoords,
  paymentMethod,
  type CheckoutDetails,
  type CheckoutErrors,
  type CheckoutField,
  type CheckoutInfo,
  type FulfillmentMode,
} from "../cart/checkout";
import { formatDhAmount } from "../cart/formatDh";
import {
  approximateFixMessage,
  formatAccuracy,
  geoFailureMessage,
  isPreciseFix,
  preciseFixMessage,
  requestCurrentPosition,
} from "../cart/geolocation";
import { NeighborhoodSelect } from "./NeighborhoodSelect";

/** « Nems — Crevettes » → produit « Nems », variante « Crevettes » (affichage uniquement). */
export function splitName(name: string): { product: string; variant: string | null } {
  const i = name.indexOf(" — ");
  return i < 0 ? { product: name, variant: null } : { product: name.slice(0, i), variant: name.slice(i + 3) };
}

const MODES: { id: FulfillmentMode; title: string; text?: string }[] = [
  { id: "delivery", title: "Livraison", text: "Livraison offerte" },
  { id: "pickup", title: "À emporter" },
];

/** 16 px minimum : évite le zoom automatique d'iOS Safari au focus. */
const inputClass =
  "block w-full rounded-xl border bg-white px-3.5 py-3 font-sans text-[16px] leading-snug text-kaytori-black placeholder:text-kaytori-muted/70 transition-colors focus:border-kaytori-green focus:outline-none focus:ring-2 focus:ring-kaytori-green/20";

function Field({
  id,
  label,
  hint,
  error,
  required,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block font-sans text-[0.82rem] font-semibold text-kaytori-black">
        {label}
        {required ? (
          <span className="text-kaytori-green" aria-hidden>
            {" "}
            *
          </span>
        ) : (
          <span className="font-normal text-kaytori-muted"> (facultatif)</span>
        )}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 font-sans text-[0.78rem] font-medium text-red-700">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1.5 font-sans text-[0.75rem] text-kaytori-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h3 className="font-sans text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-kaytori-green/80">{children}</h3>
  );
}

/** Option à choix unique (radio masqué) : grande zone tactile, état sélectionné vert. */
function ChoiceCard({
  name,
  value,
  id,
  title,
  text,
  checked,
  invalid,
  onSelect,
}: {
  name: string;
  value: string;
  id?: string;
  title: string;
  text?: string;
  checked: boolean;
  invalid?: boolean;
  onSelect: () => void;
}) {
  return (
    <label
      className={`relative flex min-h-[64px] cursor-pointer flex-col justify-center rounded-xl border px-3.5 py-2.5 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-kaytori-green/30 ${
        checked
          ? "border-kaytori-green bg-kaytori-green/[0.06]"
          : invalid
            ? "border-red-600/70 bg-white"
            : "border-kaytori-green/20 bg-white"
      }`}
    >
      <input id={id} type="radio" name={name} value={value} checked={checked} onChange={onSelect} className="sr-only" />
      <span className="flex items-center gap-2 font-sans text-[0.92rem] font-semibold text-kaytori-black">
        <span
          className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border-2 ${
            checked ? "border-kaytori-green" : "border-kaytori-green/35"
          }`}
          aria-hidden
        >
          {checked ? <span className="h-1.5 w-1.5 rounded-full bg-kaytori-green" /> : null}
        </span>
        {title}
      </span>
      {text ? <span className="mt-0.5 pl-6 font-sans text-[0.74rem] text-kaytori-muted">{text}</span> : null}
    </label>
  );
}

type FormProps = {
  formId: string;
  value: CheckoutInfo;
  onChange: (next: CheckoutInfo) => void;
  /** Erreurs affichées (après une première tentative de validation). */
  errors: CheckoutErrors;
  onSubmit: () => void;
};

/** Étape « Vos coordonnées » : mode, identité, adresse si livraison, paiement, téléphone. */
export function CheckoutForm({ formId, value, onChange, errors, onSubmit }: FormProps) {
  const [locating, setLocating] = useState(false);
  const [locateStatus, setLocateStatus] = useState<{ ok: boolean; text: string } | null>(null);
  /** Garde synchrone contre le double tap (`disabled` n'agit qu'au rendu suivant). */
  const locatingRef = useRef(false);
  /** Dernière valeur du formulaire : la position arrive après coup, sans écraser une saisie faite entre-temps. */
  const latest = useRef(value);
  latest.current = value;

  const set = (field: CheckoutField) => (e: { target: { value: string } }) => {
    if (field === "locationUrl") setLocateStatus(null);
    onChange({ ...value, [field]: e.target.value });
  };

  const a11y = (id: CheckoutField, hint = false) => ({
    id: `checkout-${id}`,
    "aria-invalid": errors[id] ? true : undefined,
    "aria-describedby": errors[id] ? `checkout-${id}-error` : hint ? `checkout-${id}-hint` : undefined,
    className: `${inputClass} ${errors[id] ? "border-red-600/70" : "border-kaytori-green/20"}`,
  });

  /** Position GPS à la demande (autorisation demandée par le navigateur au clic uniquement). */
  const locate = () => {
    if (locatingRef.current) return;
    locatingRef.current = true;
    setLocating(true);
    setLocateStatus(null);
    const done = () => {
      locatingRef.current = false;
      setLocating(false);
    };
    requestCurrentPosition(
      { geolocation: navigator.geolocation, isSecureContext: window.isSecureContext },
      (fix) => {
        done();
        // Diagnostic : précision seulement, jamais les coordonnées.
        console.info("[Kaytôri] géolocalisation : précision", formatAccuracy(fix.accuracy));
        // Position approximative : non ajoutée, pour ne pas la présenter comme exacte au restaurant.
        if (!isPreciseFix(fix)) {
          setLocateStatus({ ok: false, text: approximateFixMessage(fix) });
          return;
        }
        latest.current = { ...latest.current, locationUrl: mapsUrlFromCoords(fix.latitude, fix.longitude) };
        onChange(latest.current);
        setLocateStatus({ ok: true, text: preciseFixMessage(fix) });
      },
      (failure, detail) => {
        done();
        console.warn("[Kaytôri] géolocalisation :", failure, detail ?? "");
        setLocateStatus({ ok: false, text: geoFailureMessage(failure) });
      },
    );
  };

  return (
    <form id={formId} noValidate onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }} className="space-y-6">
      <fieldset>
        <legend className="mb-3">
          <SectionTitle>Livraison ou à emporter</SectionTitle>
        </legend>
        <div className="grid grid-cols-2 gap-2.5">
          {MODES.map((m) => (
            <ChoiceCard
              key={m.id}
              name="checkout-mode"
              value={m.id}
              title={m.title}
              text={m.text}
              checked={value.mode === m.id}
              onSelect={() => onChange({ ...value, mode: m.id })}
            />
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="mb-1.5">
          <SectionTitle>Vos informations</SectionTitle>
        </legend>
        <Field id="checkout-fullName" label="Nom et prénom" required error={errors.fullName}>
          <input
            {...a11y("fullName")}
            type="text"
            autoComplete="name"
            autoCapitalize="words"
            placeholder="Prénom et nom"
            value={value.fullName}
            onChange={set("fullName")}
          />
        </Field>

        {value.mode === "delivery" ? (
          <>
            <Field id="checkout-address" label="Adresse complète" required error={errors.address}>
              <input
                {...a11y("address")}
                type="text"
                autoComplete="street-address"
                placeholder="Rue, numéro, immeuble, étage…"
                value={value.address}
                onChange={set("address")}
              />
            </Field>
            <Field id="checkout-neighborhood" label="Quartier" required error={errors.neighborhood}>
              <NeighborhoodSelect
                id="checkout-neighborhood"
                value={value.neighborhood}
                onChange={(neighborhood) => onChange({ ...value, neighborhood })}
                invalid={Boolean(errors.neighborhood)}
                describedBy={errors.neighborhood ? "checkout-neighborhood-error" : undefined}
              />
            </Field>
            <Field
              id="checkout-locationUrl"
              label="Localisation"
              hint="Lien Google Maps ou votre position actuelle."
              error={errors.locationUrl}
            >
              <input
                {...a11y("locationUrl", true)}
                type="url"
                inputMode="url"
                autoComplete="off"
                placeholder="https://maps.app.goo.gl/…"
                value={value.locationUrl}
                onChange={set("locationUrl")}
              />
              <button
                type="button"
                onClick={locate}
                disabled={locating}
                aria-busy={locating}
                className="mt-2 inline-flex min-h-[44px] items-center gap-2 rounded-full border border-kaytori-green/30 bg-white px-4 font-sans text-[0.84rem] font-semibold text-kaytori-green transition-colors hover:bg-kaytori-green/[0.06] disabled:opacity-60"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]" aria-hidden focusable="false">
                  <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" />
                  <circle cx="12" cy="10" r="2.3" />
                </svg>
                {locating ? "Localisation…" : "Utiliser ma position actuelle"}
              </button>
              <p
                role="status"
                aria-live="polite"
                className={`font-sans text-[0.78rem] font-medium ${locateStatus ? "mt-1.5" : ""} ${
                  locateStatus?.ok ? "text-kaytori-green" : "text-red-700"
                }`}
              >
                {locateStatus ? `${locateStatus.ok ? "✓ " : ""}${locateStatus.text}` : null}
              </p>
            </Field>
          </>
        ) : (
          <p className="rounded-xl border border-kaytori-green/15 bg-white/70 px-4 py-3 font-sans text-[0.84rem] leading-relaxed text-kaytori-muted">
            Commande à retirer au restaurant. Le restaurant vous confirmera l'heure de retrait sur WhatsApp.
          </p>
        )}

        <fieldset aria-describedby={errors.payment ? "checkout-payment-error" : undefined}>
          <legend className="mb-3">
            <SectionTitle>
              Mode de paiement
              <span className="text-kaytori-green" aria-hidden>
                {" "}
                *
              </span>
            </SectionTitle>
          </legend>
          <div className="grid grid-cols-2 gap-2.5">
            {PAYMENT_METHODS.map((p, i) => (
              <ChoiceCard
                key={p.id}
                id={i === 0 ? "checkout-payment" : undefined}
                name="checkout-payment"
                value={p.id}
                title={p.label}
                checked={value.payment === p.id}
                invalid={Boolean(errors.payment)}
                onSelect={() => onChange({ ...value, payment: p.id })}
              />
            ))}
          </div>
          {errors.payment ? (
            <p id="checkout-payment-error" className="mt-1.5 font-sans text-[0.78rem] font-medium text-red-700">
              {errors.payment}
            </p>
          ) : null}
        </fieldset>

        <Field id="checkout-phone" label="Numéro de téléphone" required error={errors.phone}>
          <input
            {...a11y("phone")}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="06 12 34 56 78"
            value={value.phone}
            onChange={set("phone")}
          />
        </Field>
      </fieldset>

      <p className="font-sans text-[0.74rem] text-kaytori-muted">
        <span className="text-kaytori-green" aria-hidden>
          *
        </span>{" "}
        Champs obligatoires.
      </p>
    </form>
  );
}

function EditButton({ onClick, label, children }: { onClick: () => void; label: string; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="-my-2 inline-flex min-h-[44px] items-center rounded-full px-2 font-sans text-[0.8rem] font-semibold text-kaytori-green underline decoration-kaytori-green/30 underline-offset-2 hover:text-kaytori-greenMid"
    >
      {children}
    </button>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(6.75rem,8.25rem)_minmax(0,1fr)] gap-2 py-1.5">
      <dt className="font-sans text-[0.78rem] leading-snug text-kaytori-muted">{label}</dt>
      <dd className="break-words font-sans text-[0.86rem] font-medium leading-snug text-kaytori-black [overflow-wrap:anywhere]">
        {children}
      </dd>
    </div>
  );
}

type RecapProps = {
  lines: readonly CartLine[];
  totalDh: number;
  details: CheckoutDetails;
  onEditDetails: () => void;
  onEditCart: () => void;
};

/** Étape « Récapitulatif » : données réelles du panier et des coordonnées, avant WhatsApp. */
export function OrderRecap({ lines, totalDh, details, onEditDetails, onEditCart }: RecapProps) {
  const card = "rounded-2xl border border-kaytori-green/15 bg-white px-4 py-3.5 shadow-card";
  const delivery = details.mode === "delivery";
  return (
    <div className="space-y-3.5">
      <section className={card} aria-labelledby="recap-details">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <h3 id="recap-details" className="font-display text-[1.02rem] font-semibold text-kaytori-black">
            Vos informations
          </h3>
          <EditButton onClick={onEditDetails} label="Modifier mes informations">
            Modifier
          </EditButton>
        </div>
        <dl>
          <Row label="Livraison ou à emporter">
            {delivery ? "Livraison" : "À emporter (retrait au restaurant)"}
          </Row>
          <Row label="Nom et prénom">{details.fullName}</Row>
          {details.address ? <Row label="Adresse complète">{details.address}</Row> : null}
          {details.neighborhood ? <Row label="Quartier">{details.neighborhood}</Row> : null}
          {details.locationUrl ? (
            <Row label="Localisation">
              <a
                href={details.locationUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-kaytori-green underline decoration-kaytori-green/30 underline-offset-2"
              >
                {details.locationUrl}
              </a>
            </Row>
          ) : null}
          {details.payment ? <Row label="Mode de paiement">{paymentMethod(details.payment).label}</Row> : null}
          <Row label="Téléphone">{formatMoroccanPhoneDisplay(details.phone)}</Row>
        </dl>
        {details.payment ? (
          <p className="mt-1.5 font-sans text-[0.76rem] text-kaytori-muted">
            À régler {delivery ? "à la livraison" : "au retrait"}.
          </p>
        ) : null}
      </section>

      <section className={card} aria-labelledby="recap-order">
        <div className="mb-1 flex items-center justify-between gap-2">
          <h3 id="recap-order" className="font-display text-[1.02rem] font-semibold text-kaytori-black">
            Commande
          </h3>
          <EditButton onClick={onEditCart} label="Modifier le panier">
            Modifier
          </EditButton>
        </div>
        <ul className="divide-y divide-kaytori-green/10">
          {lines.map((l) => {
            const { product, variant } = splitName(l.name);
            return (
              <li key={l.id} className="flex items-start justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="font-sans text-[0.88rem] font-semibold leading-snug text-kaytori-black">{product}</p>
                  {variant ? <p className="font-sans text-[0.78rem] leading-snug text-kaytori-muted">{variant}</p> : null}
                  <p className="mt-0.5 font-sans text-[0.78rem] tabular-nums text-kaytori-muted">
                    {l.quantity} × {formatDhAmount(l.unitPriceDh)} DH
                  </p>
                </div>
                <p className="shrink-0 whitespace-nowrap font-sans text-[0.88rem] font-semibold tabular-nums text-kaytori-black">
                  {formatDhAmount(lineSubtotalDh(l))} DH
                </p>
              </li>
            );
          })}
        </ul>
        <dl className="mt-1 space-y-1 border-t border-kaytori-green/15 pt-3 font-sans text-[0.86rem]">
          <div className="flex justify-between gap-3">
            <dt className="text-kaytori-muted">Sous-total</dt>
            <dd className="tabular-nums text-kaytori-black">{formatDhAmount(totalDh)} DH</dd>
          </div>
          {delivery ? (
            <div className="flex justify-between gap-3">
              <dt className="text-kaytori-muted">Livraison</dt>
              <dd className="font-semibold text-kaytori-green">{DELIVERY_FEE_LABEL[0].toUpperCase() + DELIVERY_FEE_LABEL.slice(1)}</dd>
            </div>
          ) : null}
          <div className="flex justify-between gap-3 pt-1">
            <dt className="font-semibold text-kaytori-black">Total</dt>
            <dd className="font-display text-[1.1rem] font-semibold tabular-nums text-kaytori-black">{formatDhAmount(totalDh)} DH</dd>
          </div>
        </dl>
      </section>

      <p className="px-1 font-sans text-[0.75rem] leading-relaxed text-kaytori-muted">
        En confirmant, WhatsApp s'ouvre avec ce récapitulatif prêt à envoyer au restaurant.
      </p>
    </div>
  );
}
