/**
 * Fenêtres de confirmation et formulaires modaux de la fiche client (administration de la fidélité).
 * Toutes les opérations passent par le backend (loyalty_credit_ticket, loyalty_redeem_reward,
 * loyalty_adjust_points, loyalty_revert_event, loyalty_reissue_access, loyalty_update_customer,
 * loyalty_set_card_status) avec idempotence et journalisation en ajout seul.
 */
import { useId, useState, type FormEvent, type ReactNode } from "react";
import { formatMoroccanPhoneDisplay, normalizeMoroccanPhone } from "../../../cart/checkout";
import { cleanFullName, validateFullName } from "../../../loyalty/lib/signupForm";
import { AdminLink } from "../../components/AdminLink";
import { CoinsIcon, GiftIcon, LinkIcon, WhatsappIcon } from "../../components/icons";
import {
  computeTicketPoints,
  formatCentimes,
  formatEarningRule,
  formatPoints,
  parsePointsInput,
  parseTicketInput,
  pointsLabel,
  pointsValueLabel,
} from "../lib/points";
import type { CardStatus, HistoryEvent, StaffCard, StaffProgram, StaffReward } from "../lib/staffApi";
import type { StaffAdvice } from "../lib/staffErrors";
import { EVENT_LABELS, customerWhatsappHref, formatDateTime, formatElapsed, maskPhone } from "../lib/staffFormat";
import { STAFF_ROUTES } from "../routes";
import {
  AdviceBox,
  BusyLabel,
  Pill,
  Sheet,
  dangerButton,
  fieldClass,
  greenButton,
  outlineButton,
  primaryButton,
  ring,
  stampButton,
} from "./staffUi";

const footerPrimary = "sm:w-auto sm:min-w-[11.5rem]";
const cancel = `${outlineButton} sm:w-auto`;
const box = "rounded-xl border border-admin-line bg-admin-canvas/60 px-4 py-3";
const label = "block text-[0.88rem] font-medium text-admin-ink";
const errorText = "min-h-[1.2rem] text-[0.82rem] font-medium text-admin-danger";

export function cleanReason(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

export const reasonProblem = (raw: string): string | null => {
  const r = cleanReason(raw);
  return r.length < 3
    ? "Indiquez le motif en quelques mots (3 caractères au moins)."
    : r.length > 300
      ? "Motif trop long (300 caractères au plus)."
      : null;
};

type Common = { busy: boolean; advice: StaffAdvice | null; onClose: () => void };

/* ------------------------------------------------------------------ crédit rapproché */

export function RecentCreditSheet({
  seconds,
  busy,
  advice,
  onClose,
  onConfirm,
}: Common & { seconds: number; onConfirm: () => void }) {
  return (
    <Sheet
      title="Un crédit de points vient d'être enregistré"
      tone="warning"
      busy={busy}
      onClose={onClose}
      footer={
        <>
          <button type="button" data-autofocus onClick={onClose} disabled={busy} className={cancel}>
            Ne pas créditer
          </button>
          <button type="button" onClick={onConfirm} disabled={busy} className={`${stampButton} ${footerPrimary}`}>
            <BusyLabel busy={busy} idle="Confirmer ce second ticket" pending="Enregistrement…" />
          </button>
        </>
      }
    >
      <p>
        Des points ont déjà été attribués à cette carte {formatElapsed(seconds)}. Aucun point supplémentaire n&apos;a été
        ajouté pour l&apos;instant.
      </p>
      <p className="text-admin-muted">Confirmez uniquement s&apos;il s&apos;agit bien d&apos;une seconde commande distincte.</p>
      {advice ? <AdviceBox advice={advice} /> : null}
    </Sheet>
  );
}

/* ------------------------------------------------------------------ attribution par ticket */

export function CreditTicketSheet({
  card,
  program,
  busy,
  advice,
  onClose,
  onConfirm,
}: Common & {
  card: StaffCard;
  program: StaffProgram | null;
  onConfirm: (amountCentimes: number, orderRef: string | null) => void;
}) {
  const id = useId();
  const [ticketRaw, setTicketRaw] = useState("");
  const [orderRef, setOrderRef] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);

  const earningConfigured = Boolean(
    program && program.earningPoints && program.earningDirhams && program.earningPoints > 0 && program.earningDirhams > 0,
  );
  const parsedTicket = parseTicketInput(ticketRaw);
  const validAmountCentimes = "centimes" in parsedTicket ? parsedTicket.centimes : null;

  const minTicketCentimes = program?.minTicketCentimes ?? 0;
  const maxPointsPerOrder = program?.maxPointsPerOrder ?? null;
  const pointValueCentimes = program?.pointValueCentimes ?? card.pointValueCentimes;

  const previewResult =
    earningConfigured && validAmountCentimes !== null && program
      ? computeTicketPoints(validAmountCentimes, {
          earningPoints: program.earningPoints,
          earningDirhams: program.earningDirhams,
          roundingRule: program.roundingRule,
          minTicketCentimes,
          maxPointsPerOrder,
        })
      : null;
  const calculatedPoints = previewResult && previewResult.status === "ok" ? previewResult.points : null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!earningConfigured) return;
    if ("error" in parsedTicket) {
      setFieldError(parsedTicket.error);
      return;
    }
    if (minTicketCentimes > 0 && parsedTicket.centimes < minTicketCentimes) {
      setFieldError(`Le montant minimum éligible est de ${formatCentimes(minTicketCentimes)}.`);
      return;
    }
    if (calculatedPoints === null || calculatedPoints <= 0) {
      setFieldError("Ce montant ne génère aucun point selon le barème actuel.");
      return;
    }
    setFieldError(null);
    const cleanRef = orderRef.replace(/\s+/g, " ").trim();
    onConfirm(parsedTicket.centimes, cleanRef === "" ? null : cleanRef);
  };

  return (
    <Sheet
      title="Attribuer des points (ticket)"
      busy={busy}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={busy} className={cancel}>
            Annuler
          </button>
          <button
            type="submit"
            form={`${id}-form`}
            disabled={busy || !earningConfigured || calculatedPoints === null || calculatedPoints <= 0}
            className={`${primaryButton} ${footerPrimary}`}
          >
            <BusyLabel
              busy={busy}
              idle={
                calculatedPoints && calculatedPoints > 0
                  ? `Créditer +${formatPoints(calculatedPoints)} pts`
                  : "Créditer les points"
              }
              pending="Attribution…"
            />
          </button>
        </>
      }
    >
      <div className={`flex items-center justify-between gap-3 ${box}`}>
        <div>
          <p className="font-semibold text-admin-ink">{card.fullName}</p>
          <p className="text-[0.82rem] text-admin-muted">
            Solde actuel : <strong className="text-admin-ink">{pointsLabel(card.pointsBalance)}</strong> (
            {pointsValueLabel(card.pointsBalance, pointValueCentimes)})
          </p>
        </div>
        {program ? (
          <Pill tone="neutral">
            {formatEarningRule({
              earningPoints: program.earningPoints,
              earningDirhams: program.earningDirhams,
              roundingRule: program.roundingRule,
            })}
          </Pill>
        ) : null}
      </div>

      {!earningConfigured ? (
        <div role="alert" className="rounded-xl border border-admin-warn/30 bg-admin-warnSoft p-4 text-[0.88rem] text-admin-warn">
          <p className="font-semibold">Règle d&apos;attribution non configurée</p>
          <p className="mt-1 leading-snug">
            Définissez d&apos;abord le taux d&apos;attribution des points par dirham dépensé dans les paramètres du
            programme avant de créditer un ticket.
          </p>
          <AdminLink href={STAFF_ROUTES.points} onClick={onClose} className={`${outlineButton} mt-3 inline-flex`}>
            Configurer la règle d&apos;attribution
          </AdminLink>
        </div>
      ) : (
        <form id={`${id}-form`} onSubmit={submit} noValidate className="space-y-3.5">
          <div>
            <label htmlFor={`${id}-amount`} className={`${label} mb-1`}>
              Montant total du ticket TTC (en DH) <span className="text-admin-danger">*</span>
            </label>
            <div className="relative">
              <input
                id={`${id}-amount`}
                data-autofocus
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder="ex. 180 ou 245,50"
                value={ticketRaw}
                onChange={(e) => {
                  setTicketRaw(e.target.value);
                  setFieldError(null);
                }}
                aria-invalid={fieldError ? true : undefined}
                aria-describedby={`${id}-amount-error`}
                className={`${fieldClass} pr-12 text-[1.15rem] font-semibold tabular-nums`}
              />
              <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[0.85rem] font-semibold text-admin-muted">
                DH
              </span>
            </div>
            <p id={`${id}-amount-error`} className={`mt-1 ${errorText}`} aria-live="polite">
              {fieldError ?? (advice?.field === "ticket" ? advice.message : "")}
            </p>
          </div>

          <div>
            <label htmlFor={`${id}-order`} className={`${label} mb-1`}>
              Numéro de commande / référence ticket (facultatif)
            </label>
            <input
              id={`${id}-order`}
              type="text"
              maxLength={80}
              placeholder="ex. CMD-1042"
              value={orderRef}
              onChange={(e) => setOrderRef(e.target.value)}
              className={fieldClass}
            />
          </div>

          <div
            className="rounded-xl border border-admin-accent/20 bg-admin-accentSoft/60 px-4 py-3"
            aria-live="polite"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[0.84rem] font-medium text-admin-muted">Points calculés</span>
              <span className="text-[1.15rem] font-bold tabular-nums text-admin-accent">
                {calculatedPoints !== null && calculatedPoints > 0 ? `+${pointsLabel(calculatedPoints)}` : "0 point"}
              </span>
            </div>
            {calculatedPoints !== null && calculatedPoints > 0 ? (
              <p className="mt-1 text-[0.8rem] text-admin-muted">
                Contre-valeur : <strong>{pointsValueLabel(calculatedPoints, pointValueCentimes)}</strong> · Nouveau
                solde : <strong>{pointsLabel(card.pointsBalance + calculatedPoints)}</strong>
              </p>
            ) : minTicketCentimes > 0 ? (
              <p className="mt-1 text-[0.78rem] text-admin-muted">
                Ticket minimum éligible : {formatCentimes(minTicketCentimes)}.
              </p>
            ) : null}
          </div>
        </form>
      )}
      {advice && advice.field !== "ticket" ? <AdviceBox advice={advice} /> : null}
    </Sheet>
  );
}

/* ------------------------------------------------------------------ échange de récompense */

export function RedeemRewardSheet({
  card,
  rewards,
  busy,
  advice,
  onClose,
  onConfirm,
}: Common & {
  card: StaffCard;
  rewards: readonly StaffReward[];
  onConfirm: (rewardId: string, reason: string | null) => void;
}) {
  const id = useId();
  const activeRewards = rewards.filter((r) => r.isActive && !r.archivedAt);
  const firstEligible = activeRewards.find((r) => card.pointsBalance >= r.pointsCost)?.id ?? activeRewards[0]?.id ?? "";
  const [selectedId, setSelectedId] = useState<string>(firstEligible);
  const [reason, setReason] = useState("");

  const selected = activeRewards.find((r) => r.id === selectedId) ?? null;
  const canRedeem = Boolean(selected && card.pointsBalance >= selected.pointsCost);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!selected || !canRedeem) return;
    const r = cleanReason(reason);
    onConfirm(selected.id, r === "" ? null : r);
  };

  return (
    <Sheet
      title="Échanger une récompense"
      busy={busy}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={busy} className={cancel}>
            Annuler
          </button>
          <button
            type="submit"
            form={`${id}-form`}
            disabled={busy || !canRedeem}
            className={`${primaryButton} ${footerPrimary}`}
          >
            <BusyLabel
              busy={busy}
              idle={selected ? `Échanger (−${formatPoints(selected.pointsCost)} pts)` : "Échanger la récompense"}
              pending="Validation…"
            />
          </button>
        </>
      }
    >
      <div className={`flex items-center justify-between gap-3 ${box}`}>
        <div>
          <p className="font-semibold text-admin-ink">{card.fullName}</p>
          <p className="text-[0.82rem] text-admin-muted">
            Solde disponible : <strong className="text-admin-ink">{pointsLabel(card.pointsBalance)}</strong> (
            {pointsValueLabel(card.pointsBalance, card.pointValueCentimes)})
          </p>
        </div>
        <GiftIcon className="h-5 w-5 text-admin-accent" />
      </div>

      {activeRewards.length === 0 ? (
        <div className="rounded-xl border border-dashed border-admin-lineStrong p-4 text-center text-[0.88rem] text-admin-muted">
          <p className="font-semibold text-admin-ink">Aucune récompense active au catalogue</p>
          <p className="mt-1">Activez ou créez une récompense dans la section Récompenses.</p>
          <AdminLink href={STAFF_ROUTES.rewards} onClick={onClose} className={`${outlineButton} mt-3 inline-flex`}>
            Gérer le catalogue
          </AdminLink>
        </div>
      ) : (
        <form id={`${id}-form`} onSubmit={submit} noValidate className="space-y-3">
          <fieldset className="space-y-2">
            <legend className={label}>Choisissez la récompense à remettre</legend>
            {activeRewards.map((r) => {
              const eligible = card.pointsBalance >= r.pointsCost;
              const checked = r.id === selectedId;
              const missing = Math.max(0, r.pointsCost - card.pointsBalance);
              return (
                <label
                  key={r.id}
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${
                    checked
                      ? "border-admin-accent bg-admin-accentSoft/40 ring-1 ring-admin-accent"
                      : eligible
                        ? "border-admin-line bg-white hover:bg-admin-canvas/60"
                        : "border-admin-line bg-admin-canvas/40 opacity-65"
                  }`}
                >
                  <input
                    type="radio"
                    name="reward"
                    value={r.id}
                    checked={checked}
                    onChange={() => setSelectedId(r.id)}
                    className="mt-1 h-4 w-4 accent-[#003024]"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold text-admin-ink">{r.name}</span>
                      <Pill tone={eligible ? "positive" : "muted"}>
                        {pointsLabel(r.pointsCost)} ({pointsValueLabel(r.pointsCost, card.pointValueCentimes)})
                      </Pill>
                    </div>
                    {r.description ? <p className="mt-0.5 text-[0.82rem] text-admin-muted">{r.description}</p> : null}
                    {r.conditions ? (
                      <p className="mt-0.5 text-[0.76rem] text-admin-soft">Conditions : {r.conditions}</p>
                    ) : null}
                    {!eligible ? (
                      <p className="mt-1 text-[0.78rem] font-medium text-admin-danger">
                        Solde insuffisant (manque {pointsLabel(missing)}).
                      </p>
                    ) : null}
                  </div>
                </label>
              );
            })}
          </fieldset>

          <div>
            <label htmlFor={`${id}-note`} className={`${label} mb-1`}>
              Note ou référence commande (facultatif)
            </label>
            <input
              id={`${id}-note`}
              type="text"
              maxLength={300}
              placeholder="ex. remis avec la commande CMD-1042"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className={fieldClass}
            />
          </div>
        </form>
      )}
      {advice ? <AdviceBox advice={advice} /> : null}
    </Sheet>
  );
}

/* ------------------------------------------------------------------ ajustement manuel de points */

export function AdjustPointsSheet({
  card,
  direction,
  busy,
  advice,
  onClose,
  onConfirm,
}: Common & {
  card: StaffCard;
  direction: "credit" | "debit";
  onConfirm: (delta: number, reason: string) => void;
}) {
  const id = useId();
  const [raw, setRaw] = useState("");
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<{ points?: string; reason?: string }>({});
  const parsed = parsePointsInput(raw);
  const points = "points" in parsed ? parsed.points : null;
  const credit = direction === "credit";
  const balance = card.pointsBalance;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next: { points?: string; reason?: string } = {};
    if ("error" in parsed) next.points = parsed.error;
    else if (!credit && parsed.points > balance)
      next.points = `Le solde disponible n'est que de ${pointsLabel(balance)}.`;
    next.reason = reasonProblem(reason) ?? undefined;
    setErrors(next);
    if (next.points || next.reason || points === null) return;
    onConfirm(credit ? points : -points, cleanReason(reason));
  };

  return (
    <Sheet
      title={credit ? "Ajouter des points (ajustement)" : "Retirer des points (correction)"}
      busy={busy}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={busy} className={cancel}>
            Annuler
          </button>
          <button
            type="submit"
            form={`${id}-form`}
            disabled={busy}
            className={`${credit ? primaryButton : dangerButton} ${footerPrimary}`}
          >
            <BusyLabel
              busy={busy}
              idle={
                points
                  ? `${credit ? "Ajouter" : "Retirer"} ${pointsLabel(points)}`
                  : credit
                    ? "Ajouter les points"
                    : "Retirer les points"
              }
              pending="Enregistrement…"
            />
          </button>
        </>
      }
    >
      <div className={`flex items-center gap-3 ${box}`}>
        <CoinsIcon className="h-5 w-5 text-admin-accent" />
        <div>
          <p className="font-semibold text-admin-ink">{card.fullName}</p>
          <p className="text-[0.82rem] text-admin-muted">
            Solde actuel : <strong className="text-admin-ink">{pointsLabel(balance)}</strong> (
            {pointsValueLabel(balance, card.pointValueCentimes)})
          </p>
        </div>
      </div>

      <form id={`${id}-form`} onSubmit={submit} noValidate className="space-y-3">
        <div>
          <label htmlFor={`${id}-points`} className={`${label} mb-1`}>
            Nombre de points à {credit ? "ajouter" : "retirer"}
          </label>
          <input
            id={`${id}-points`}
            data-autofocus
            inputMode="numeric"
            autoComplete="off"
            value={raw}
            onChange={(e) => {
              setRaw(e.target.value);
              setErrors((x) => ({ ...x, points: undefined }));
            }}
            aria-invalid={errors.points ? true : undefined}
            aria-describedby={`${id}-points-help`}
            className={`${fieldClass} text-[1.15rem] font-semibold tabular-nums`}
          />
          <p
            id={`${id}-points-help`}
            aria-live="polite"
            className={`mt-1 text-[0.82rem] ${errors.points ? "font-medium text-admin-danger" : "text-admin-muted"}`}
          >
            {errors.points ??
              (points
                ? `Contre-valeur : ${pointsValueLabel(points, card.pointValueCentimes)} · Solde après : ${pointsLabel(
                    credit ? balance + points : Math.max(0, balance - points),
                  )}`
                : `Nombre entier positif (1 point = ${formatCentimes(card.pointValueCentimes)}).`)}
          </p>
        </div>

        <div>
          <label htmlFor={`${id}-reason`} className={`${label} mb-1`}>
            Motif de l&apos;ajustement (obligatoire)
          </label>
          <input
            id={`${id}-reason`}
            value={reason}
            maxLength={300}
            onChange={(e) => {
              setReason(e.target.value);
              setErrors((x) => ({ ...x, reason: undefined }));
            }}
            placeholder={credit ? "ex. geste commercial ou ticket oublié" : "ex. correction d'erreur de saisie"}
            aria-invalid={errors.reason ? true : undefined}
            aria-describedby={`${id}-reason-error`}
            className={fieldClass}
          />
          <p id={`${id}-reason-error`} className={`mt-1 ${errorText}`} aria-live="polite">
            {errors.reason ?? (advice?.field === "reason" ? advice.message : "")}
          </p>
        </div>
      </form>
      {advice && advice.field !== "reason" ? <AdviceBox advice={advice} /> : null}
    </Sheet>
  );
}

/** Alias conservé pour compatibilité. */
export const PointsSheet = AdjustPointsSheet;

/* ------------------------------------------------------------------ correction d'opération */

const QUICK_REASONS: Record<"points" | "reward", string[]> = {
  points: ["Montant saisi deux fois", "Mauvais client", "Erreur de saisie du ticket"],
  reward: ["Récompense enregistrée à tort", "Mauvais client", "Annulation de la commande"],
};

function ReasonChips({
  options,
  value,
  onPick,
}: {
  options: readonly string[];
  value: string;
  onPick: (r: string) => void;
}) {
  return (
    <fieldset>
      <legend className="text-[0.84rem] font-medium text-admin-muted">Motifs fréquents</legend>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {options.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => onPick(r)}
            aria-pressed={cleanReason(value) === r}
            className={`min-h-[34px] rounded-full border px-3 py-1 text-[0.8rem] font-medium transition-colors ${ring} ${
              cleanReason(value) === r
                ? "border-admin-accent bg-admin-accentSoft text-admin-accent"
                : "border-admin-lineStrong bg-white text-admin-muted hover:bg-admin-canvas hover:text-admin-ink"
            }`}
          >
            {r}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export function RevertSheet({
  event,
  busy,
  advice,
  onClose,
  onConfirm,
}: Common & { event: HistoryEvent; onConfirm: (reason: string) => void }) {
  const id = useId();
  const [reason, setReason] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const category = event.kind === "reward_redeemed" ? "reward" : "points";
  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    const p = reasonProblem(reason);
    setProblem(p);
    if (!p) onConfirm(cleanReason(reason));
  };
  const fieldAdvice = advice?.field === "reason" ? advice : null;
  return (
    <Sheet
      title={category === "reward" ? "Annuler cet échange de récompense" : "Corriger cette opération"}
      busy={busy}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={busy} className={cancel}>
            Fermer
          </button>
          <button type="submit" form={`${id}-form`} disabled={busy} className={`${primaryButton} ${footerPrimary}`}>
            <BusyLabel busy={busy} idle="Enregistrer la correction" pending="Enregistrement…" />
          </button>
        </>
      }
    >
      <p className={box}>
        <span className="font-semibold text-admin-ink">{EVENT_LABELS[event.kind]}</span> ·{" "}
        <span className="text-admin-muted">{formatDateTime(event.createdAt)}</span>
      </p>
      <p className="text-[0.86rem] text-admin-muted">
        L&apos;opération d&apos;origine reste visible dans l&apos;historique pour l&apos;audit ; une écriture
        compensatoire liée est ajoutée et le solde de points est recalculé par la base.
      </p>
      <form id={`${id}-form`} onSubmit={submit} noValidate className="space-y-3">
        <ReasonChips
          options={QUICK_REASONS[category]}
          value={reason}
          onPick={(r) => {
            setReason(r);
            setProblem(null);
          }}
        />
        <div>
          <label htmlFor={`${id}-reason`} className={`${label} mb-1`}>
            Motif de la correction (obligatoire)
          </label>
          <textarea
            id={`${id}-reason`}
            data-autofocus
            rows={2}
            maxLength={300}
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              setProblem(null);
            }}
            aria-invalid={problem || fieldAdvice ? true : undefined}
            aria-describedby={`${id}-reason-error`}
            className={fieldClass}
          />
          <p id={`${id}-reason-error`} className={`mt-1 ${errorText}`} aria-live="polite">
            {problem ?? fieldAdvice?.message ?? ""}
          </p>
        </div>
      </form>
      {advice && !fieldAdvice ? <AdviceBox advice={advice} /> : null}
    </Sheet>
  );
}

/* ------------------------------------------------------------------ lien personnel de la carte */

export function CardLinkView({
  fullName,
  phone,
  link,
  intro,
}: {
  fullName: string;
  phone: string;
  link: string;
  intro: ReactNode;
}) {
  const id = useId();
  const [copied, setCopied] = useState<"ok" | "failed" | null>(null);
  const whatsapp = customerWhatsappHref(phone, link);
  return (
    <>
      <p className="text-admin-muted">{intro}</p>
      <div>
        <label htmlFor={`${id}-link`} className={`${label} mb-1`}>
          Lien personnel de la carte de {fullName}
        </label>
        <input
          id={`${id}-link`}
          readOnly
          value={link}
          onFocus={(e) => e.currentTarget.select()}
          className={`${fieldClass} font-mono text-[0.78rem]`}
        />
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        {whatsapp ? (
          <a
            href={whatsapp}
            target="_blank"
            rel="noopener noreferrer"
            data-autofocus
            className={`${greenButton} sm:flex-1`}
          >
            <WhatsappIcon className="h-4 w-4" />
            Préparer le message WhatsApp
            <span className="sr-only"> (nouvel onglet)</span>
          </a>
        ) : null}
        <button
          type="button"
          onClick={() => {
            if (!navigator.clipboard) return setCopied("failed");
            navigator.clipboard.writeText(link).then(
              () => setCopied("ok"),
              () => setCopied("failed"),
            );
          }}
          className={`${outlineButton} sm:flex-1`}
        >
          <LinkIcon className="h-4 w-4" />
          Copier le lien
        </button>
      </div>
      <p className="text-[0.8rem] text-admin-muted" aria-live="polite">
        {copied === "ok"
          ? "Lien copié. "
          : copied === "failed"
            ? "Copie impossible : sélectionnez le lien ci-dessus. "
            : ""}
        WhatsApp s&apos;ouvre avec le message prérempli. Ce lien personnel ne sera plus affiché après fermeture.
      </p>
    </>
  );
}

export function ReissueSheet({
  card,
  busy,
  advice,
  link,
  onClose,
  onConfirm,
}: Common & { card: StaffCard; link: string | null; onConfirm: (reason: string | null) => void }) {
  const id = useId();
  const [reason, setReason] = useState("");

  if (link) {
    return (
      <Sheet
        title="Nouveau lien créé"
        busy={false}
        onClose={onClose}
        footer={
          <button type="button" onClick={onClose} className={`${outlineButton} sm:w-auto`}>
            Terminé
          </button>
        }
      >
        <CardLinkView
          fullName={card.fullName}
          phone={card.phone}
          link={link}
          intro={`L'ancien lien de ${card.fullName} est révoqué. Envoyez ce nouveau lien au numéro de la carte (${maskPhone(card.phone)}).`}
        />
      </Sheet>
    );
  }

  return (
    <Sheet
      title="Émettre un nouveau lien d'accès ?"
      tone="warning"
      busy={busy}
      onClose={onClose}
      footer={
        <>
          <button type="button" data-autofocus onClick={onClose} disabled={busy} className={cancel}>
            Annuler
          </button>
          <button type="submit" form={`${id}-form`} disabled={busy} className={`${primaryButton} ${footerPrimary}`}>
            <BusyLabel busy={busy} idle="Créer le nouveau lien" pending="Création…" />
          </button>
        </>
      }
    >
      <ul className="list-disc space-y-1.5 pl-5 text-[0.88rem] text-admin-muted">
        <li>
          Vérifiez l&apos;identité du titulaire : <strong className="text-admin-ink">{card.fullName}</strong>, numéro{" "}
          {maskPhone(card.phone)}.
        </li>
        <li>L&apos;ancien lien d&apos;accès cessera immédiatement de fonctionner.</li>
        <li>Le solde de points ({pointsLabel(card.pointsBalance)}) et l&apos;historique sont intégralement conservés.</li>
      </ul>
      <form
        id={`${id}-form`}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          const r = cleanReason(reason);
          onConfirm(r === "" ? null : r);
        }}
        className="space-y-1.5"
      >
        <label htmlFor={`${id}-reason`} className={label}>
          Motif (facultatif)
        </label>
        <input
          id={`${id}-reason`}
          value={reason}
          maxLength={300}
          onChange={(e) => setReason(e.target.value)}
          placeholder="ex. changement de téléphone"
          className={fieldClass}
        />
      </form>
      {advice ? <AdviceBox advice={advice} /> : null}
    </Sheet>
  );
}

/* ------------------------------------------------------------------ modification client */

export type CustomerChanges = { full_name?: string; phone?: string };

export function customerChanges(
  card: StaffCard,
  values: { fullName: string; phone: string },
): { changes: CustomerChanges; errors: { fullName?: string; phone?: string } } {
  const errors: { fullName?: string; phone?: string } = {};
  const changes: CustomerChanges = {};
  const name = cleanFullName(values.fullName);
  if (validateFullName(values.fullName))
    errors.fullName = "Indiquez le nom et prénom (2 à 80 caractères, avec des lettres).";
  else if (name !== card.fullName) changes.full_name = name;
  const phone = normalizeMoroccanPhone(values.phone);
  if (!phone) errors.phone = "Numéro invalide. Exemple : 06 12 34 56 78.";
  else if (phone !== normalizeMoroccanPhone(card.phone)) changes.phone = phone;
  return { changes, errors };
}

export function NamePhoneFields({
  idBase,
  fullName,
  phone,
  setFullName,
  setPhone,
  errorFor,
}: {
  idBase: string;
  fullName: string;
  phone: string;
  setFullName: (v: string) => void;
  setPhone: (v: string) => void;
  errorFor: (name: "fullName" | "phone") => string | undefined;
}) {
  return (
    <>
      {(
        [
          ["fullName", "Nom et prénom", fullName, setFullName, "name", "text"],
          ["phone", "Numéro de mobile", phone, setPhone, "tel", "tel"],
        ] as const
      ).map(([name, text, value, set, autoComplete, type]) => (
        <div key={name}>
          <label htmlFor={`${idBase}-${name}`} className={`${label} mb-1`}>
            {text}
          </label>
          <input
            id={`${idBase}-${name}`}
            data-autofocus={name === "fullName" ? true : undefined}
            type={type}
            inputMode={name === "phone" ? "tel" : undefined}
            autoComplete={autoComplete}
            value={value}
            onChange={(e) => set(e.target.value)}
            onBlur={
              name === "phone"
                ? () =>
                    setPhone(
                      normalizeMoroccanPhone(phone)
                        ? formatMoroccanPhoneDisplay(normalizeMoroccanPhone(phone)!)
                        : phone,
                    )
                : undefined
            }
            aria-invalid={errorFor(name) ? true : undefined}
            aria-describedby={`${idBase}-${name}-error`}
            className={fieldClass}
          />
          <p id={`${idBase}-${name}-error`} className={`mt-1 ${errorText}`} aria-live="polite">
            {errorFor(name) ?? ""}
          </p>
        </div>
      ))}
    </>
  );
}

export function EditCustomerSheet({
  card,
  busy,
  advice,
  onClose,
  onConfirm,
}: Common & { card: StaffCard; onConfirm: (changes: CustomerChanges, reason: string) => void }) {
  const id = useId();
  const [fullName, setFullName] = useState(card.fullName);
  const [phone, setPhone] = useState(card.phone);
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<{ fullName?: string; phone?: string; reason?: string; none?: string }>({});
  const phoneChanged = normalizeMoroccanPhone(phone) !== normalizeMoroccanPhone(card.phone);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const result = customerChanges(card, { fullName, phone });
    const reasonError = reasonProblem(reason) ?? undefined;
    const none =
      Object.keys(result.changes).length === 0 && !result.errors.fullName && !result.errors.phone
        ? "Aucune modification à enregistrer."
        : undefined;
    setErrors({ ...result.errors, reason: reasonError, none });
    if (result.errors.fullName || result.errors.phone || reasonError || none) return;
    onConfirm(result.changes, cleanReason(reason));
  };

  const fieldError = (name: "fullName" | "phone" | "reason") =>
    errors[name] ?? (advice?.field === name ? advice.message : undefined);

  return (
    <Sheet
      title="Modifier les coordonnées du client"
      busy={busy}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={busy} className={cancel}>
            Annuler
          </button>
          <button type="submit" form={`${id}-form`} disabled={busy} className={`${primaryButton} ${footerPrimary}`}>
            <BusyLabel busy={busy} idle="Enregistrer" pending="Enregistrement…" />
          </button>
        </>
      }
    >
      <form id={`${id}-form`} onSubmit={submit} noValidate className="space-y-3">
        <NamePhoneFields
          idBase={id}
          fullName={fullName}
          phone={phone}
          setFullName={setFullName}
          setPhone={setPhone}
          errorFor={fieldError}
        />
        {phoneChanged ? (
          <p className="rounded-xl border border-admin-warn/30 bg-admin-warnSoft px-3.5 py-2.5 text-[0.84rem] leading-snug text-admin-warn">
            Changer le numéro rattache cette carte et son solde de points à ce nouveau numéro. Effectuez ce changement
            uniquement après vérification auprès du titulaire.
          </p>
        ) : null}
        <div>
          <label htmlFor={`${id}-reason`} className={`${label} mb-1`}>
            Motif (obligatoire)
          </label>
          <input
            id={`${id}-reason`}
            value={reason}
            maxLength={300}
            onChange={(e) => setReason(e.target.value)}
            placeholder="ex. correction d'une faute de frappe à l'inscription"
            aria-invalid={fieldError("reason") ? true : undefined}
            aria-describedby={`${id}-reason-error`}
            className={fieldClass}
          />
          <p id={`${id}-reason-error`} className={`mt-1 ${errorText}`} aria-live="polite">
            {fieldError("reason") ?? errors.none ?? ""}
          </p>
        </div>
      </form>
      {advice && !advice.field ? <AdviceBox advice={advice} /> : null}
    </Sheet>
  );
}

/* ------------------------------------------------------------------ suspension / réactivation */

export function StatusSheet({
  card,
  busy,
  advice,
  onClose,
  onConfirm,
}: Common & { card: StaffCard; onConfirm: (status: CardStatus, reason: string) => void }) {
  const id = useId();
  const [reason, setReason] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const next: CardStatus = card.status === "active" ? "suspended" : "active";
  return (
    <Sheet
      title={next === "suspended" ? "Suspendre cette carte ?" : "Réactiver cette carte ?"}
      tone="warning"
      busy={busy}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={busy} className={cancel}>
            Annuler
          </button>
          <button
            type="submit"
            form={`${id}-form`}
            disabled={busy}
            className={`${next === "suspended" ? dangerButton : primaryButton} ${footerPrimary}`}
          >
            <BusyLabel
              busy={busy}
              idle={next === "suspended" ? "Suspendre la carte" : "Réactiver la carte"}
              pending="Enregistrement…"
            />
          </button>
        </>
      }
    >
      <p className="text-admin-muted">
        {next === "suspended"
          ? `Tant qu'elle est suspendue, la carte de ${card.fullName} ne peut ni recevoir de points ni échanger de récompense. Son solde (${pointsLabel(card.pointsBalance)}) est conservé.`
          : `La carte de ${card.fullName} pourra de nouveau cumuler des points et échanger des récompenses.`}
      </p>
      <form
        id={`${id}-form`}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          const p = reasonProblem(reason);
          setProblem(p);
          if (!p) onConfirm(next, cleanReason(reason));
        }}
        className="space-y-1.5"
      >
        <label htmlFor={`${id}-reason`} className={label}>
          Motif (obligatoire)
        </label>
        <input
          id={`${id}-reason`}
          data-autofocus
          value={reason}
          maxLength={300}
          onChange={(e) => {
            setReason(e.target.value);
            setProblem(null);
          }}
          aria-invalid={problem ? true : undefined}
          aria-describedby={`${id}-reason-error`}
          className={fieldClass}
        />
        <p id={`${id}-reason-error`} className={errorText} aria-live="polite">
          {problem ?? (advice?.field === "reason" ? advice.message : "")}
        </p>
      </form>
      {advice && advice.field !== "reason" ? <AdviceBox advice={advice} /> : null}
    </Sheet>
  );
}
