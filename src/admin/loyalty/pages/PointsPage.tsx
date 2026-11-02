/**
 * Paramètres du programme et conversion des points (/admin/fidelite/points).
 * Permet aux responsables autorisés de configurer :
 *   - l'ouverture ou la fermeture du programme ;
 *   - la valeur d'un point en centimes (par défaut 1 point = 0,20 DH = 20 centimes), avec confirmation
 *     explicite affichant l'ancienne et la nouvelle valeur sans modifier rétroactivement les soldes acquis ;
 *   - la règle d'attribution des points par dirham dépensé sur ticket (taux, arrondi, minimum, plafonds) ;
 *   - le code secret du parcours rapide QR (/fidelite/scan/:code), haché côté serveur ;
 *   - la table de conversion et le calculateur précis en centimes entiers.
 */
import { useEffect, useId, useState, type FormEvent } from "react";
import { CoinsIcon, LockIcon, PencilIcon, QrIcon } from "../../components/icons";
import { ClubPanel, KpiCard, PageHeader } from "../components/club";
import {
  AdviceBox,
  BusyLabel,
  Pill,
  Sheet,
  fieldClass,
  outlineButton,
  primaryButton,
} from "../components/staffUi";
import {
  CONVERSION_EXAMPLES,
  POINT_VALUE_CENTIMES,
  centimesToPoints,
  computeTicketPoints,
  formatCentimes,
  formatEarningRule,
  formatPoints,
  parseDirhams,
  parsePointsInput,
  pointsLabel,
  pointsValueLabel,
} from "../lib/points";
import {
  fetchStaffStats,
  setQrPin,
  updateSettings,
  type RoundingRule,
  type SettingsChanges,
  type StaffProgram,
  type StaffStats,
} from "../lib/staffApi";
import { staffAdvice, type StaffAdvice } from "../lib/staffErrors";
import { formatDateTime } from "../lib/staffFormat";
import { useStaff } from "../StaffContext";

export { CONVERSION_EXAMPLES, parseDirhams };

type ModalState = "toggle" | "value" | "earning" | "qrpin" | null;

export function PointsPage() {
  const { rpc, role, program, reloadProgram } = useStaff();
  const id = useId();
  const owner = role === "owner";
  const [stats, setStats] = useState<StaffStats | null>(null);
  const [modal, setModal] = useState<ModalState>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [pts, setPts] = useState("250");
  const [dh, setDh] = useState("50");

  const pointValueCentimes = program?.pointValueCentimes ?? POINT_VALUE_CENTIMES;

  useEffect(() => {
    reloadProgram();
    void fetchStaffStats(rpc)
      .then(setStats)
      .catch(() => setStats(null));
  }, [rpc, reloadProgram]);

  const ptsParsed = parsePointsInput(pts);
  const dhCentimes = parseDirhams(dh);
  const dhPoints = dhCentimes === null ? null : centimesToPoints(dhCentimes, pointValueCentimes);
  const ticketPreview =
    dhCentimes !== null && program
      ? computeTicketPoints(dhCentimes, {
          earningPoints: program.earningPoints,
          earningDirhams: program.earningDirhams,
          roundingRule: program.roundingRule,
          minTicketCentimes: program.minTicketCentimes,
          maxPointsPerOrder: program.maxPointsPerOrder,
        })
      : null;
  const ticketPreviewPoints = ticketPreview && ticketPreview.status === "ok" ? ticketPreview.points : null;

  const onSaved = (msg: string) => {
    setModal(null);
    setBanner(msg);
    reloadProgram();
    void fetchStaffStats(rpc)
      .then(setStats)
      .catch(() => {});
  };

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<CoinsIcon className="h-5 w-5" />}
        title="Paramètres & Points"
        subtitle={`1 point = ${formatCentimes(pointValueCentimes)}. Configurez la valeur du point, le barème d'attribution sur ticket et le code secret du parcours QR.`}
      />

      {banner ? (
        <div
          role="status"
          className="flex items-center justify-between gap-3 rounded-xl border border-admin-success/30 bg-admin-successSoft px-4 py-3 text-[0.88rem] font-medium text-admin-success"
        >
          <span>{banner}</span>
          <button
            type="button"
            onClick={() => setBanner(null)}
            className="rounded px-2 py-0.5 text-[0.78rem] font-semibold hover:bg-admin-success/10"
          >
            Fermer
          </button>
        </div>
      ) : null}

      {/* Indicateurs globaux de points */}
      <section aria-label="Indicateurs des points" className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <KpiCard
          icon={<CoinsIcon className="h-5 w-5" />}
          label="Valeur d'un point"
          value={formatCentimes(pointValueCentimes)}
          note={`5 points = ${pointsValueLabel(5, pointValueCentimes)} · 50 points = ${pointsValueLabel(50, pointValueCentimes)}`}
        />
        <KpiCard
          icon={<CoinsIcon className="h-5 w-5" />}
          label="Barème sur ticket"
          value={
            program
              ? program.earningPoints && program.earningDirhams
                ? `${program.earningPoints} pt / ${program.earningDirhams} DH`
                : "À définir"
              : "…"
          }
          note={
            program
              ? formatEarningRule({
                  earningPoints: program.earningPoints,
                  earningDirhams: program.earningDirhams,
                  roundingRule: program.roundingRule,
                })
              : undefined
          }
        />
        <KpiCard
          icon={<CoinsIcon className="h-5 w-5" />}
          label="Points en circulation"
          value={stats ? formatPoints(stats.pointsInCirculation) : null}
          note={
            stats
              ? `Contre-valeur : ${pointsValueLabel(stats.pointsInCirculation, pointValueCentimes)}`
              : "Solde cumulé des membres"
          }
        />
        <KpiCard
          icon={<QrIcon className="h-5 w-5" />}
          label="Code secret scan QR"
          value={program ? (program.qrPinConfigured ? "Configuré" : "Non défini") : "…"}
          note={
            program?.qrPinUpdatedAt
              ? `Mis à jour ${formatDateTime(program.qrPinUpdatedAt)}`
              : "Vérifié côté serveur sur /fidelite/scan/:code"
          }
        />
      </section>

      {/* Configuration métier : Programme, Valeur du point, Barème ticket, Code QR */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ClubPanel
          title="Règles d'attribution des points"
          icon={<CoinsIcon className="h-4 w-4" />}
          action={
            owner && program ? (
              <button type="button" onClick={() => setModal("earning")} className={outlineButton}>
                <PencilIcon className="h-4 w-4" />
                Configurer le barème
              </button>
            ) : undefined
          }
        >
          {program ? (
            <dl className="divide-y divide-admin-line text-[0.86rem]">
              <div className="flex items-center justify-between gap-3 py-2.5 first:pt-0">
                <dt className="text-admin-muted">État du programme</dt>
                <dd className="flex items-center gap-2">
                  <Pill tone={program.isActive ? "positive" : "warning"}>
                    {program.isActive ? "Ouvert" : "Fermé"}
                  </Pill>
                  {owner ? (
                    <button
                      type="button"
                      onClick={() => setModal("toggle")}
                      className="text-[0.8rem] font-semibold text-admin-accent underline underline-offset-2"
                    >
                      {program.isActive ? "Fermer" : "Ouvrir"}
                    </button>
                  ) : null}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3 py-2.5">
                <dt className="text-admin-muted">Taux d&apos;attribution</dt>
                <dd className="text-right font-semibold text-admin-ink">
                  {formatEarningRule({
                    earningPoints: program.earningPoints,
                    earningDirhams: program.earningDirhams,
                    roundingRule: program.roundingRule,
                  })}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3 py-2.5">
                <dt className="text-admin-muted">Ticket minimum éligible</dt>
                <dd className="font-semibold text-admin-ink">
                  {program.minTicketCentimes > 0 ? formatCentimes(program.minTicketCentimes) : "Aucun minimum"}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3 py-2.5">
                <dt className="text-admin-muted">Plafonds de sécurité</dt>
                <dd className="text-right font-medium text-admin-ink">
                  {program.maxPointsPerOrder ? `${formatPoints(program.maxPointsPerOrder)} pts/ticket` : "Sans limite/ticket"}
                  {" · "}
                  {program.maxPointsPerDay ? `${formatPoints(program.maxPointsPerDay)} pts/jour` : "Sans limite/jour"}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3 py-2.5 last:pb-0">
                <dt className="text-admin-muted">Délai de confirmation (crédit rapproché)</dt>
                <dd className="font-medium text-admin-ink">
                  {program.recentCreditWindowSeconds > 0
                    ? `${program.recentCreditWindowSeconds} secondes`
                    : "Désactivé"}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="text-[0.86rem] text-admin-muted">
              Connectez un compte autorisé pour consulter et modifier les paramètres actifs sur le serveur.
            </p>
          )}
          {!owner ? (
            <p className="mt-3 text-[0.78rem] text-admin-muted">
              Seul un responsable peut modifier le barème d&apos;attribution et ouvrir ou fermer le programme.
            </p>
          ) : null}
        </ClubPanel>

        <div className="space-y-4">
          <ClubPanel
            title="Valeur monétaire d'un point"
            icon={<CoinsIcon className="h-4 w-4" />}
            action={
              owner && program ? (
                <button type="button" onClick={() => setModal("value")} className={outlineButton}>
                  <PencilIcon className="h-4 w-4" />
                  Modifier la valeur
                </button>
              ) : undefined
            }
          >
            <p className="text-[0.86rem] leading-relaxed text-admin-muted">
              La valeur commerciale de référence est de{" "}
              <strong className="text-admin-ink">1 point = {formatCentimes(pointValueCentimes)}</strong> (calculée en
              centimes entiers, sans virgule flottante). Modifier cette valeur met à jour l&apos;équivalence en dirhams
              sans modifier rétroactivement le nombre de points déjà acquis par les clients.
            </p>
          </ClubPanel>

          <ClubPanel
            title="Code secret du parcours rapide QR"
            icon={<LockIcon className="h-4 w-4" />}
            action={
              owner && program ? (
                <button type="button" onClick={() => setModal("qrpin")} className={primaryButton}>
                  <LockIcon className="h-4 w-4" />
                  {program.qrPinConfigured ? "Changer le code QR" : "Définir le code QR"}
                </button>
              ) : undefined
            }
          >
            <p className="text-[0.86rem] leading-relaxed text-admin-muted">
              Ce code secret (4 à 12 chiffres) est demandé uniquement lorsque le manager scanne le QR code d&apos;un
              client avec son téléphone (<code className="rounded bg-admin-canvas px-1.5 py-0.5 text-[0.8rem] text-admin-ink">/fidelite/scan/:code</code>). Il est salé et haché côté serveur (SHA-256) avec limitation des tentatives.
            </p>
          </ClubPanel>
        </div>
      </div>

      {/* Table de conversion et calculateur */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ClubPanel title="Table de conversion de référence" icon={<CoinsIcon className="h-4 w-4" />}>
          <table className="w-full text-[0.9rem]">
            <caption className="sr-only">Valeur des points en dirhams</caption>
            <thead>
              <tr className="border-b border-admin-line text-left text-[0.76rem] uppercase tracking-wider text-admin-muted">
                <th scope="col" className="pb-2.5 font-semibold">
                  Points
                </th>
                <th scope="col" className="pb-2.5 text-right font-semibold">
                  Contre-valeur (DH)
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-admin-line">
              {CONVERSION_EXAMPLES.map((n) => (
                <tr key={n}>
                  <td className="py-2.5 font-medium tabular-nums text-admin-ink">{pointsLabel(n)}</td>
                  <td className="py-2.5 text-right font-bold tabular-nums text-admin-accent">
                    {pointsValueLabel(n, pointValueCentimes)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ClubPanel>

        <ClubPanel title="Calculateur de conversion & simulation ticket" icon={<CoinsIcon className="h-4 w-4" />}>
          <div className="space-y-4">
            <div>
              <label htmlFor={`${id}-pts`} className="mb-1 block text-[0.86rem] font-medium text-admin-ink">
                Nombre de points → Valeur en dirhams
              </label>
              <input
                id={`${id}-pts`}
                inputMode="numeric"
                value={pts}
                onChange={(e) => setPts(e.target.value)}
                className={`${fieldClass} tabular-nums`}
                aria-describedby={`${id}-pts-out`}
              />
              <p id={`${id}-pts-out`} aria-live="polite" className="mt-1.5 text-[0.88rem] text-admin-muted">
                {"points" in ptsParsed ? (
                  <>
                    Contre-valeur :{" "}
                    <strong className="text-[1rem] font-bold text-admin-accent">
                      {pointsValueLabel(ptsParsed.points, pointValueCentimes)}
                    </strong>
                  </>
                ) : (
                  <span className="font-medium text-admin-danger">{ptsParsed.error}</span>
                )}
              </p>
            </div>

            <div className="border-t border-admin-line pt-3.5">
              <label htmlFor={`${id}-dh`} className="mb-1 block text-[0.86rem] font-medium text-admin-ink">
                Montant en dirhams (DH) → Équivalence & Points gagnés sur ticket
              </label>
              <input
                id={`${id}-dh`}
                inputMode="decimal"
                value={dh}
                onChange={(e) => setDh(e.target.value)}
                className={`${fieldClass} tabular-nums`}
                aria-describedby={`${id}-dh-out`}
              />
              <div id={`${id}-dh-out`} aria-live="polite" className="mt-1.5 space-y-1 text-[0.86rem] text-admin-muted">
                {dhPoints && dhCentimes !== null ? (
                  <>
                    <p>
                      Équivalence monétaire : {formatCentimes(dhCentimes)} ={" "}
                      <strong className="font-semibold text-admin-ink">{pointsLabel(dhPoints.points)}</strong>
                      {dhPoints.remainderCentimes ? (
                        <span className="text-admin-soft">
                          {" "}
                          (reste {formatCentimes(dhPoints.remainderCentimes)})
                        </span>
                      ) : null}
                    </p>
                    {ticketPreviewPoints !== null ? (
                      <p>
                        Points gagnés pour un ticket de {formatCentimes(dhCentimes)} :{" "}
                        <strong className="font-bold text-admin-accent">+{pointsLabel(ticketPreviewPoints)}</strong>
                      </p>
                    ) : null}
                  </>
                ) : (
                  <p className="font-medium text-admin-danger">Montant invalide, par exemple 120 ou 245,50.</p>
                )}
              </div>
            </div>
          </div>
        </ClubPanel>
      </div>

      {/* Modales de configuration */}
      {modal === "toggle" && program ? (
        <ToggleProgramSheet
          program={program}
          rpc={rpc}
          onClose={() => setModal(null)}
          onSaved={() => onSaved(program.isActive ? "Le programme a été fermé." : "Le programme est maintenant ouvert.")}
        />
      ) : null}

      {modal === "value" && program ? (
        <PointValueSheet
          program={program}
          rpc={rpc}
          onClose={() => setModal(null)}
          onSaved={(newVal) => onSaved(`Valeur d'un point mise à jour : 1 point = ${formatCentimes(newVal)}.`)}
        />
      ) : null}

      {modal === "earning" && program ? (
        <EarningRuleSheet
          program={program}
          rpc={rpc}
          onClose={() => setModal(null)}
          onSaved={() => onSaved("Règle d'attribution des points enregistrée.")}
        />
      ) : null}

      {modal === "qrpin" && program ? (
        <QrPinSheet
          program={program}
          rpc={rpc}
          onClose={() => setModal(null)}
          onSaved={() => onSaved("Le code secret du parcours rapide QR a été mis à jour.")}
        />
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ modale ouverture / fermeture */

function ToggleProgramSheet({
  program,
  rpc,
  onClose,
  onSaved,
}: {
  program: StaffProgram;
  rpc: ReturnType<typeof useStaff>["rpc"];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [advice, setAdvice] = useState<StaffAdvice | null>(null);
  const opening = !program.isActive;

  const confirm = async () => {
    setBusy(true);
    setAdvice(null);
    try {
      await updateSettings(rpc, { is_active: opening }, opening ? "Ouverture du programme" : "Fermeture du programme");
      onSaved();
    } catch (e) {
      setAdvice(staffAdvice(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      title={opening ? "Ouvrir le programme Kaytôri Club ?" : "Fermer le programme Kaytôri Club ?"}
      tone="warning"
      busy={busy}
      onClose={onClose}
      footer={
        <>
          <button type="button" data-autofocus onClick={onClose} disabled={busy} className={`${outlineButton} sm:w-auto`}>
            Annuler
          </button>
          <button type="button" onClick={() => void confirm()} disabled={busy} className={`${primaryButton} sm:w-auto`}>
            <BusyLabel
              busy={busy}
              idle={opening ? "Ouvrir le programme" : "Fermer le programme"}
              pending="Enregistrement…"
            />
          </button>
        </>
      }
    >
      <p className="text-admin-muted">
        {opening
          ? "Les clients pourront s'inscrire et le personnel pourra attribuer des points sur présentation des tickets."
          : "Aucune nouvelle inscription ni attribution de points sur ticket ne sera possible tant que le programme est fermé. Les soldes de points existants restent consultables et échangeables."}
      </p>
      {advice ? <AdviceBox advice={advice} /> : null}
    </Sheet>
  );
}

/* ------------------------------------------------------------------ modale valeur d'un point */

function PointValueSheet({
  program,
  rpc,
  onClose,
  onSaved,
}: {
  program: StaffProgram;
  rpc: ReturnType<typeof useStaff>["rpc"];
  onClose: () => void;
  onSaved: (newCentimes: number) => void;
}) {
  const id = useId();
  const [centimesRaw, setCentimesRaw] = useState(String(program.pointValueCentimes));
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [advice, setAdvice] = useState<StaffAdvice | null>(null);

  const parsed = Number(centimesRaw.trim());
  const validCentimes = Number.isInteger(parsed) && parsed >= 1 && parsed <= 10000 ? parsed : null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (validCentimes === null) {
      setError("Indiquez une valeur entière en centimes entre 1 et 10 000 (ex. 20 pour 0,20 DH).");
      return;
    }
    const cleanReason = reason.replace(/\s+/g, " ").trim();
    if (cleanReason.length < 3) {
      setError("Indiquez le motif de ce changement (au moins 3 caractères).");
      return;
    }
    setError(null);
    setBusy(true);
    setAdvice(null);
    try {
      await updateSettings(rpc, { point_value_centimes: validCentimes }, cleanReason);
      onSaved(validCentimes);
    } catch (err) {
      setAdvice(staffAdvice(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      title="Modifier la valeur d'un point"
      tone="warning"
      busy={busy}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={busy} className={`${outlineButton} sm:w-auto`}>
            Annuler
          </button>
          <button type="submit" form={`${id}-form`} disabled={busy} className={`${primaryButton} sm:w-auto`}>
            <BusyLabel busy={busy} idle="Confirmer la nouvelle valeur" pending="Enregistrement…" />
          </button>
        </>
      }
    >
      <div className="rounded-xl border border-admin-warn/30 bg-admin-warnSoft p-3.5 text-[0.84rem] text-admin-warn">
        <p className="font-semibold">Confirmation explicite du changement de valeur</p>
        <p className="mt-1">
          Ancienne valeur : <strong>1 point = {formatCentimes(program.pointValueCentimes)}</strong>
          {" → "}
          Nouvelle valeur :{" "}
          <strong>1 point = {validCentimes !== null ? formatCentimes(validCentimes) : "…"}</strong>
        </p>
        <p className="mt-1 text-[0.78rem]">
          Ce changement ne modifie pas rétroactivement le nombre de points déjà acquis par les clients.
        </p>
      </div>

      <form id={`${id}-form`} onSubmit={submit} noValidate className="space-y-3">
        <div>
          <label htmlFor={`${id}-centimes`} className="mb-1 block text-[0.88rem] font-medium text-admin-ink">
            Valeur d&apos;un point en centimes (20 centimes = 0,20 DH)
          </label>
          <input
            id={`${id}-centimes`}
            data-autofocus
            inputMode="numeric"
            value={centimesRaw}
            onChange={(e) => {
              setCentimesRaw(e.target.value.replace(/\D/g, ""));
              setError(null);
            }}
            className={`${fieldClass} font-semibold tabular-nums`}
          />
          {validCentimes !== null ? (
            <p className="mt-1 text-[0.8rem] text-admin-muted">
              Exemple : 100 points = <strong>{pointsValueLabel(100, validCentimes)}</strong> · 250 points ={" "}
              <strong>{pointsValueLabel(250, validCentimes)}</strong>
            </p>
          ) : null}
        </div>

        <div>
          <label htmlFor={`${id}-reason`} className="mb-1 block text-[0.88rem] font-medium text-admin-ink">
            Motif du changement (obligatoire)
          </label>
          <input
            id={`${id}-reason`}
            maxLength={300}
            placeholder="ex. ajustement annuel du barème"
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              setError(null);
            }}
            className={fieldClass}
          />
        </div>

        {error ? <p className="text-[0.82rem] font-medium text-admin-danger">{error}</p> : null}
      </form>
      {advice ? <AdviceBox advice={advice} /> : null}
    </Sheet>
  );
}

/* ------------------------------------------------------------------ modale règle d'attribution */

function EarningRuleSheet({
  program,
  rpc,
  onClose,
  onSaved,
}: {
  program: StaffProgram;
  rpc: ReturnType<typeof useStaff>["rpc"];
  onClose: () => void;
  onSaved: () => void;
}) {
  const id = useId();
  const [earningPoints, setEarningPoints] = useState(
    program.earningPoints !== null ? String(program.earningPoints) : "1",
  );
  const [earningDirhams, setEarningDirhams] = useState(
    program.earningDirhams !== null ? String(program.earningDirhams) : "2",
  );
  const [roundingRule, setRoundingRule] = useState<RoundingRule>(program.roundingRule);
  const [minTicketDh, setMinTicketDh] = useState(
    program.minTicketCentimes > 0 ? String(program.minTicketCentimes / 100) : "0",
  );
  const [maxPerOrder, setMaxPerOrder] = useState(
    program.maxPointsPerOrder !== null ? String(program.maxPointsPerOrder) : "",
  );
  const [maxPerDay, setMaxPerDay] = useState(
    program.maxPointsPerDay !== null ? String(program.maxPointsPerDay) : "",
  );
  const [recentWindow, setRecentWindow] = useState(String(program.recentCreditWindowSeconds));
  const [termsSummary, setTermsSummary] = useState(program.termsSummary ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [advice, setAdvice] = useState<StaffAdvice | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const pts = Number(earningPoints);
    const dhs = Number(earningDirhams);
    if (!Number.isInteger(pts) || pts < 1 || pts > 1000 || !Number.isInteger(dhs) || dhs < 1 || dhs > 10000) {
      setError("Indiquez un barème valide (ex. 1 point pour 2 DH).");
      return;
    }
    const minCentimes = minTicketDh.trim() === "" || minTicketDh.trim() === "0" ? 0 : parseDirhams(minTicketDh);
    if (minCentimes === null || minCentimes < 0 || minCentimes > 1000000) {
      setError("Ticket minimum invalide.");
      return;
    }
    const orderCap = maxPerOrder.trim() === "" ? null : Number(maxPerOrder);
    if (orderCap !== null && (!Number.isInteger(orderCap) || orderCap < 1 || orderCap > 100000)) {
      setError("Plafond par commande : entier entre 1 et 100 000 ou vide.");
      return;
    }
    const dayCap = maxPerDay.trim() === "" ? null : Number(maxPerDay);
    if (dayCap !== null && (!Number.isInteger(dayCap) || dayCap < 1 || dayCap > 500000)) {
      setError("Plafond par jour : entier entre 1 et 500 000 ou vide.");
      return;
    }
    const win = Number(recentWindow);
    if (!Number.isInteger(win) || win < 0 || win > 3600) {
      setError("Délai de crédit rapproché : entre 0 et 3 600 secondes.");
      return;
    }
    setError(null);
    setBusy(true);
    setAdvice(null);
    const changes: SettingsChanges = {
      earning_points: pts,
      earning_dirhams: dhs,
      rounding_rule: roundingRule,
      min_ticket_centimes: minCentimes,
      max_points_per_order: orderCap,
      max_points_per_day: dayCap,
      recent_credit_window_seconds: win,
      terms_summary: termsSummary.replace(/\s+/g, " ").trim() || null,
    };
    try {
      await updateSettings(rpc, changes, "Mise à jour du barème d'attribution");
      onSaved();
    } catch (err) {
      setAdvice(staffAdvice(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      title="Configurer la règle d'attribution des points"
      busy={busy}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={busy} className={`${outlineButton} sm:w-auto`}>
            Annuler
          </button>
          <button type="submit" form={`${id}-form`} disabled={busy} className={`${primaryButton} sm:w-auto`}>
            <BusyLabel busy={busy} idle="Enregistrer le barème" pending="Enregistrement…" />
          </button>
        </>
      }
    >
      <form id={`${id}-form`} onSubmit={submit} noValidate className="space-y-3.5">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor={`${id}-epts`} className="mb-1 block text-[0.86rem] font-medium text-admin-ink">
              Points attribués
            </label>
            <input
              id={`${id}-epts`}
              data-autofocus
              inputMode="numeric"
              value={earningPoints}
              onChange={(e) => setEarningPoints(e.target.value.replace(/\D/g, ""))}
              className={`${fieldClass} font-semibold tabular-nums`}
            />
          </div>
          <div>
            <label htmlFor={`${id}-edhs`} className="mb-1 block text-[0.86rem] font-medium text-admin-ink">
              Par tranche de (en DH)
            </label>
            <input
              id={`${id}-edhs`}
              inputMode="numeric"
              value={earningDirhams}
              onChange={(e) => setEarningDirhams(e.target.value.replace(/\D/g, ""))}
              className={`${fieldClass} font-semibold tabular-nums`}
            />
          </div>
        </div>

        <div>
          <label htmlFor={`${id}-round`} className="mb-1 block text-[0.86rem] font-medium text-admin-ink">
            Règle d&apos;arrondi
          </label>
          <select
            id={`${id}-round`}
            value={roundingRule}
            onChange={(e) => setRoundingRule(e.target.value as RoundingRule)}
            className={fieldClass}
          >
            <option value="floor">Tranche entière atteinte (arrondi inférieur)</option>
            <option value="nearest">Arrondi au point le plus proche</option>
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor={`${id}-min`} className="mb-1 block text-[0.86rem] font-medium text-admin-ink">
              Ticket minimum (DH)
            </label>
            <input
              id={`${id}-min`}
              inputMode="decimal"
              value={minTicketDh}
              onChange={(e) => setMinTicketDh(e.target.value)}
              className={`${fieldClass} tabular-nums`}
            />
          </div>
          <div>
            <label htmlFor={`${id}-win`} className="mb-1 block text-[0.86rem] font-medium text-admin-ink">
              Délai anti-doublon (s)
            </label>
            <input
              id={`${id}-win`}
              inputMode="numeric"
              value={recentWindow}
              onChange={(e) => setRecentWindow(e.target.value.replace(/\D/g, ""))}
              className={`${fieldClass} tabular-nums`}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor={`${id}-maxo`} className="mb-1 block text-[0.86rem] font-medium text-admin-ink">
              Plafond points / ticket
            </label>
            <input
              id={`${id}-maxo`}
              inputMode="numeric"
              placeholder="Illimité"
              value={maxPerOrder}
              onChange={(e) => setMaxPerOrder(e.target.value.replace(/\D/g, ""))}
              className={`${fieldClass} tabular-nums`}
            />
          </div>
          <div>
            <label htmlFor={`${id}-maxd`} className="mb-1 block text-[0.86rem] font-medium text-admin-ink">
              Plafond points / jour
            </label>
            <input
              id={`${id}-maxd`}
              inputMode="numeric"
              placeholder="Illimité"
              value={maxPerDay}
              onChange={(e) => setMaxPerDay(e.target.value.replace(/\D/g, ""))}
              className={`${fieldClass} tabular-nums`}
            />
          </div>
        </div>

        <div>
          <label htmlFor={`${id}-terms`} className="mb-1 block text-[0.86rem] font-medium text-admin-ink">
            Résumé des conditions affiché aux clients (facultatif)
          </label>
          <textarea
            id={`${id}-terms`}
            rows={2}
            maxLength={400}
            value={termsSummary}
            onChange={(e) => setTermsSummary(e.target.value)}
            className={fieldClass}
          />
        </div>

        {error ? <p className="text-[0.82rem] font-medium text-admin-danger">{error}</p> : null}
      </form>
      {advice ? <AdviceBox advice={advice} /> : null}
    </Sheet>
  );
}

/* ------------------------------------------------------------------ modale code secret QR */

function QrPinSheet({
  program,
  rpc,
  onClose,
  onSaved,
}: {
  program: StaffProgram;
  rpc: ReturnType<typeof useStaff>["rpc"];
  onClose: () => void;
  onSaved: () => void;
}) {
  const id = useId();
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [advice, setAdvice] = useState<StaffAdvice | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!/^\d{4,12}$/.test(pin)) {
      setError("Le code secret QR doit comporter entre 4 et 12 chiffres.");
      return;
    }
    if (pin !== confirmPin) {
      setError("Les deux saisies du code secret ne correspondent pas.");
      return;
    }
    setError(null);
    setBusy(true);
    setAdvice(null);
    try {
      await setQrPin(rpc, pin, reason.trim() || null);
      onSaved();
    } catch (err) {
      setAdvice(staffAdvice(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      title={program.qrPinConfigured ? "Changer le code secret du scan QR" : "Définir le code secret du scan QR"}
      busy={busy}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={busy} className={`${outlineButton} sm:w-auto`}>
            Annuler
          </button>
          <button type="submit" form={`${id}-form`} disabled={busy} className={`${primaryButton} sm:w-auto`}>
            <BusyLabel busy={busy} idle="Enregistrer le code secret" pending="Enregistrement…" />
          </button>
        </>
      }
    >
      <p className="text-[0.86rem] text-admin-muted">
        Ce code secret permet au manager de déverrouiller le formulaire rapide lorsqu&apos;il scanne le QR code
        d&apos;un client avec son téléphone (<code className="text-admin-ink">/fidelite/scan/:code</code>). Toute
        session QR active avec l&apos;ancien code sera révoquée.
      </p>

      <form id={`${id}-form`} onSubmit={submit} noValidate className="space-y-3">
        <div>
          <label htmlFor={`${id}-pin`} className="mb-1 block text-[0.86rem] font-medium text-admin-ink">
            Nouveau code secret (4 à 12 chiffres)
          </label>
          <input
            id={`${id}-pin`}
            data-autofocus
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            maxLength={12}
            value={pin}
            onChange={(e) => {
              setPin(e.target.value.replace(/\D/g, ""));
              setError(null);
            }}
            className={`${fieldClass} tracking-widest`}
          />
        </div>

        <div>
          <label htmlFor={`${id}-confirm`} className="mb-1 block text-[0.86rem] font-medium text-admin-ink">
            Confirmer le code secret
          </label>
          <input
            id={`${id}-confirm`}
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            maxLength={12}
            value={confirmPin}
            onChange={(e) => {
              setConfirmPin(e.target.value.replace(/\D/g, ""));
              setError(null);
            }}
            className={`${fieldClass} tracking-widest`}
          />
        </div>

        <div>
          <label htmlFor={`${id}-reason`} className="mb-1 block text-[0.86rem] font-medium text-admin-ink">
            Motif (facultatif)
          </label>
          <input
            id={`${id}-reason`}
            maxLength={200}
            placeholder="ex. renouvellement périodique du code"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className={fieldClass}
          />
        </div>

        {error ? <p className="text-[0.82rem] font-medium text-admin-danger">{error}</p> : null}
      </form>
      {advice ? <AdviceBox advice={advice} /> : null}
    </Sheet>
  );
}
