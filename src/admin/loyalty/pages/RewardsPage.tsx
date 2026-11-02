/**
 * Gestion du catalogue des récompenses par points (/admin/fidelite/recompenses).
 * Permet de créer, modifier, activer, désactiver ou archiver les récompenses du programme
 * (loyalty_list_rewards & loyalty_save_reward) et de suivre le nombre d'échanges par récompense.
 * Aucune récompense n'est supprimée physiquement afin de préserver l'intégrité de l'historique.
 */
import { useCallback, useEffect, useId, useMemo, useState, type FormEvent } from "react";
import { CoinsIcon, GiftIcon, PencilIcon, PlusIcon } from "../../components/icons";
import { ClubPanel, EmptyState, KpiCard, PageHeader } from "../components/club";
import {
  AdviceBox,
  BusyLabel,
  Pill,
  Sheet,
  fieldClass,
  outlineButton,
  primaryButton,
  quietButton,
} from "../components/staffUi";
import { parsePointsInput, pointsLabel, pointsValueLabel } from "../lib/points";
import { listRewards, saveReward, type RewardSavePayload, type StaffReward } from "../lib/staffApi";
import { staffAdvice, type StaffAdvice } from "../lib/staffErrors";
import { useStaff } from "../StaffContext";

const count = (n: number) => new Intl.NumberFormat("fr-FR").format(n).replace(/\s/g, " ");

export function RewardsPage() {
  const { rpc, program, reloadProgram } = useStaff();
  const [rewards, setRewards] = useState<StaffReward[] | null>(null);
  const [loadError, setLoadError] = useState<StaffAdvice | null>(null);
  const [editing, setEditing] = useState<StaffReward | "new" | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [toggleBusyId, setToggleBusyId] = useState<string | null>(null);

  const pointValueCentimes = program?.pointValueCentimes ?? 20;

  const load = useCallback(() => {
    setLoadError(null);
    listRewards(rpc)
      .then(setRewards)
      .catch((e) => setLoadError(staffAdvice(e)));
  }, [rpc]);

  useEffect(() => {
    load();
    reloadProgram();
  }, [load, reloadProgram]);

  const activeRewards = useMemo(
    () => (rewards ? rewards.filter((r) => r.isActive && !r.archivedAt) : []),
    [rewards],
  );
  const inactiveRewards = useMemo(
    () => (rewards ? rewards.filter((r) => !r.isActive && !r.archivedAt) : []),
    [rewards],
  );
  const archivedRewards = useMemo(
    () => (rewards ? rewards.filter((r) => r.archivedAt !== null) : []),
    [rewards],
  );
  const totalRedemptions = useMemo(
    () => (rewards ? rewards.reduce((sum, r) => sum + r.redeemedCount, 0) : null),
    [rewards],
  );

  const visibleRewards = useMemo(() => {
    if (!rewards) return null;
    return showArchived ? rewards : rewards.filter((r) => !r.archivedAt);
  }, [rewards, showArchived]);

  const quickToggleActive = async (reward: StaffReward) => {
    if (toggleBusyId) return;
    setToggleBusyId(reward.id);
    try {
      await saveReward(rpc, {
        id: reward.id,
        name: reward.name,
        description: reward.description,
        pointsCost: reward.pointsCost,
        conditions: reward.conditions,
        imageUrl: reward.imageUrl,
        isActive: !reward.isActive,
        sortOrder: reward.sortOrder,
        archived: false,
      });
      load();
      reloadProgram();
    } catch (e) {
      setLoadError(staffAdvice(e));
    } finally {
      setToggleBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<GiftIcon className="h-5 w-5" />}
        title="Catalogue des récompenses"
        subtitle="Gérez les récompenses échangeables contre des points, leurs coûts, conditions et disponibilité."
        actions={
          <button type="button" onClick={() => setEditing("new")} className={primaryButton}>
            <PlusIcon className="h-4 w-4" />
            Nouvelle récompense
          </button>
        }
      />

      {loadError ? <AdviceBox advice={loadError} onRetry={load} /> : null}

      <section aria-label="Indicateurs du catalogue" className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <KpiCard
          icon={<GiftIcon className="h-5 w-5" />}
          label="Récompenses actives"
          value={rewards ? count(activeRewards.length) : "…"}
          note="visibles et échangeables par les clients"
        />
        <KpiCard
          icon={<CoinsIcon className="h-5 w-5" />}
          label="Seuil d'entrée"
          value={
            activeRewards.length > 0
              ? pointsLabel(Math.min(...activeRewards.map((r) => r.pointsCost)))
              : rewards
                ? "Aucun"
                : "…"
          }
          note={
            activeRewards.length > 0
              ? `soit ${pointsValueLabel(Math.min(...activeRewards.map((r) => r.pointsCost)), pointValueCentimes)}`
              : "aucune récompense active"
          }
        />
        <KpiCard
          icon={<GiftIcon className="h-5 w-5" />}
          label="Échanges cumulés"
          value={totalRedemptions !== null ? count(totalRedemptions) : "…"}
          note="toutes récompenses confondues"
        />
        <KpiCard
          icon={<GiftIcon className="h-5 w-5" />}
          label="Inactives / archivées"
          value={rewards ? count(inactiveRewards.length + archivedRewards.length) : "…"}
          note="conservées pour l'audit"
        />
      </section>

      <ClubPanel
        title="Récompenses du programme"
        icon={<GiftIcon className="h-4 w-4" />}
        action={
          archivedRewards.length > 0 ? (
            <button
              type="button"
              onClick={() => setShowArchived((v) => !v)}
              className={quietButton}
            >
              {showArchived
                ? "Masquer les archivées"
                : `Afficher les archivées (${archivedRewards.length})`}
            </button>
          ) : undefined
        }
      >
        {!visibleRewards ? (
          <div className="space-y-2.5" aria-hidden>
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="h-20 rounded-xl bg-admin-canvas motion-safe:animate-pulse" />
            ))}
          </div>
        ) : visibleRewards.length === 0 ? (
          <EmptyState
            icon={<GiftIcon className="h-5 w-5" />}
            title="Aucune récompense au catalogue"
            action={
              <button type="button" onClick={() => setEditing("new")} className={primaryButton}>
                <PlusIcon className="h-4 w-4" />
                Créer une première récompense
              </button>
            }
          >
            Ajoutez les récompenses que vos clients pourront échanger contre leurs points Kaytôri Club.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-admin-line">
            {visibleRewards.map((reward) => {
              const isArchived = reward.archivedAt !== null;
              const isBusy = toggleBusyId === reward.id;
              return (
                <li
                  key={reward.id}
                  className={`flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between ${
                    isArchived ? "opacity-60" : ""
                  }`}
                >
                  <div className="flex min-w-0 items-start gap-3.5">
                    {reward.imageUrl ? (
                      <img
                        src={reward.imageUrl}
                        alt=""
                        className="h-14 w-14 shrink-0 rounded-xl border border-admin-line object-cover"
                      />
                    ) : (
                      <span
                        className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-admin-accentSoft text-admin-accent"
                        aria-hidden
                      >
                        <GiftIcon className="h-5 w-5" />
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-[0.98rem] font-semibold text-admin-ink">{reward.name}</h3>
                        <Pill tone="neutral">
                          {pointsLabel(reward.pointsCost)} ({pointsValueLabel(reward.pointsCost, pointValueCentimes)})
                        </Pill>
                        {isArchived ? (
                          <Pill tone="muted">Archivée</Pill>
                        ) : reward.isActive ? (
                          <Pill tone="positive">Active</Pill>
                        ) : (
                          <Pill tone="warning">Désactivée</Pill>
                        )}
                      </div>
                      {reward.description ? (
                        <p className="mt-1 text-[0.86rem] text-admin-muted">{reward.description}</p>
                      ) : null}
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.78rem] text-admin-soft">
                        {reward.conditions ? <span>Conditions : {reward.conditions}</span> : null}
                        <span>
                          Échanges enregistrés :{" "}
                          <strong className="font-semibold text-admin-ink">{count(reward.redeemedCount)}</strong>
                        </span>
                        <span>Ordre : {reward.sortOrder}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    {!isArchived ? (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void quickToggleActive(reward)}
                        className={outlineButton}
                      >
                        {reward.isActive ? "Désactiver" : "Activer"}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => setEditing(reward)}
                      className={outlineButton}
                      aria-label={`Modifier ${reward.name}`}
                    >
                      <PencilIcon className="h-4 w-4" />
                      Modifier
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </ClubPanel>

      {editing ? (
        <RewardSheet
          initial={editing === "new" ? null : editing}
          pointValueCentimes={pointValueCentimes}
          rpc={rpc}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
            reloadProgram();
          }}
        />
      ) : null}
    </div>
  );
}

function RewardSheet({
  initial,
  pointValueCentimes,
  rpc,
  onClose,
  onSaved,
}: {
  initial: StaffReward | null;
  pointValueCentimes: number;
  rpc: ReturnType<typeof useStaff>["rpc"];
  onClose: () => void;
  onSaved: () => void;
}) {
  const id = useId();
  const [name, setName] = useState(initial?.name ?? "");
  const [pointsRaw, setPointsRaw] = useState(initial ? String(initial.pointsCost) : "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [conditions, setConditions] = useState(initial?.conditions ?? "");
  const [imageUrl, setImageUrl] = useState(initial?.imageUrl ?? "");
  const [sortOrder, setSortOrder] = useState(initial ? String(initial.sortOrder) : "100");
  const [isActive, setIsActive] = useState(initial ? initial.isActive : true);
  const [archived, setArchived] = useState(Boolean(initial?.archivedAt));
  const [errors, setErrors] = useState<{ name?: string; points?: string; sortOrder?: string }>({});
  const [busy, setBusy] = useState(false);
  const [advice, setAdvice] = useState<StaffAdvice | null>(null);

  const parsedPoints = parsePointsInput(pointsRaw);
  const validPoints = "points" in parsedPoints ? parsedPoints.points : null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const cleanName = name.replace(/\s+/g, " ").trim();
    const nextErrors: { name?: string; points?: string; sortOrder?: string } = {};
    if (cleanName.length < 2 || cleanName.length > 100) {
      nextErrors.name = "Indiquez un nom de récompense (2 à 100 caractères).";
    }
    if ("error" in parsedPoints) {
      nextErrors.points = parsedPoints.error;
    }
    const orderNum = sortOrder.trim() === "" ? 100 : Number(sortOrder);
    if (!Number.isInteger(orderNum) || orderNum < 0 || orderNum > 10000) {
      nextErrors.sortOrder = "Ordre d'affichage : entier entre 0 et 10 000.";
    }
    setErrors(nextErrors);
    if (nextErrors.name || nextErrors.points || nextErrors.sortOrder || validPoints === null) return;

    setBusy(true);
    setAdvice(null);
    const payload: RewardSavePayload = {
      id: initial?.id ?? null,
      name: cleanName,
      description: description.replace(/\s+/g, " ").trim() || null,
      pointsCost: validPoints,
      conditions: conditions.replace(/\s+/g, " ").trim() || null,
      imageUrl: imageUrl.trim() || null,
      isActive: archived ? false : isActive,
      sortOrder: orderNum,
      archived,
    };
    try {
      await saveReward(rpc, payload);
      onSaved();
    } catch (err) {
      setAdvice(staffAdvice(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      title={initial ? `Modifier « ${initial.name} »` : "Nouvelle récompense"}
      busy={busy}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={busy} className={`${outlineButton} sm:w-auto`}>
            Annuler
          </button>
          <button
            type="submit"
            form={`${id}-form`}
            disabled={busy}
            className={`${primaryButton} sm:w-auto sm:min-w-[11.5rem]`}
          >
            <BusyLabel
              busy={busy}
              idle={initial ? "Enregistrer les modifications" : "Créer la récompense"}
              pending="Enregistrement…"
            />
          </button>
        </>
      }
    >
      <form id={`${id}-form`} onSubmit={submit} noValidate className="space-y-3.5">
        <div>
          <label htmlFor={`${id}-name`} className="mb-1 block text-[0.88rem] font-medium text-admin-ink">
            Nom de la récompense <span className="text-admin-danger">*</span>
          </label>
          <input
            id={`${id}-name`}
            data-autofocus
            maxLength={100}
            placeholder="ex. Dessert Signature au choix"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setErrors((x) => ({ ...x, name: undefined }));
            }}
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={`${id}-name-err`}
            className={fieldClass}
          />
          <p id={`${id}-name-err`} className="mt-1 min-h-[1.1rem] text-[0.8rem] font-medium text-admin-danger">
            {errors.name ?? ""}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor={`${id}-points`} className="mb-1 block text-[0.88rem] font-medium text-admin-ink">
              Coût en points <span className="text-admin-danger">*</span>
            </label>
            <input
              id={`${id}-points`}
              inputMode="numeric"
              autoComplete="off"
              placeholder="ex. 150"
              value={pointsRaw}
              onChange={(e) => {
                setPointsRaw(e.target.value);
                setErrors((x) => ({ ...x, points: undefined }));
              }}
              aria-invalid={errors.points ? true : undefined}
              aria-describedby={`${id}-points-help`}
              className={`${fieldClass} font-semibold tabular-nums`}
            />
            <p
              id={`${id}-points-help`}
              className={`mt-1 text-[0.8rem] ${errors.points ? "font-medium text-admin-danger" : "text-admin-muted"}`}
            >
              {errors.points ??
                (validPoints
                  ? `Contre-valeur : ${pointsValueLabel(validPoints, pointValueCentimes)}`
                  : "Entier strictement positif")}
            </p>
          </div>

          <div>
            <label htmlFor={`${id}-order`} className="mb-1 block text-[0.88rem] font-medium text-admin-ink">
              Ordre d&apos;affichage
            </label>
            <input
              id={`${id}-order`}
              inputMode="numeric"
              value={sortOrder}
              onChange={(e) => {
                setSortOrder(e.target.value.replace(/\D/g, ""));
                setErrors((x) => ({ ...x, sortOrder: undefined }));
              }}
              className={`${fieldClass} tabular-nums`}
            />
            <p className="mt-1 text-[0.78rem] text-admin-muted">
              {errors.sortOrder ?? "Plus petit = affiché en premier"}
            </p>
          </div>
        </div>

        <div>
          <label htmlFor={`${id}-desc`} className="mb-1 block text-[0.88rem] font-medium text-admin-ink">
            Description (facultatif)
          </label>
          <textarea
            id={`${id}-desc`}
            rows={2}
            maxLength={300}
            placeholder="ex. Mochi glacé artisanal, fondant au matcha ou perles du Japon."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={fieldClass}
          />
        </div>

        <div>
          <label htmlFor={`${id}-cond`} className="mb-1 block text-[0.88rem] font-medium text-admin-ink">
            Conditions d&apos;utilisation (facultatif)
          </label>
          <input
            id={`${id}-cond`}
            maxLength={240}
            placeholder="ex. Sur place ou à emporter, selon disponibilité."
            value={conditions}
            onChange={(e) => setConditions(e.target.value)}
            className={fieldClass}
          />
        </div>

        <div>
          <label htmlFor={`${id}-img`} className="mb-1 block text-[0.88rem] font-medium text-admin-ink">
            URL d&apos;image (facultatif)
          </label>
          <input
            id={`${id}-img`}
            type="url"
            maxLength={500}
            placeholder="Laisser vide si aucune photo dédiée n'est disponible"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            className={fieldClass}
          />
        </div>

        <div className="space-y-2 rounded-xl border border-admin-line bg-admin-canvas/60 p-3.5">
          <label className="flex cursor-pointer items-center gap-2.5 text-[0.88rem] font-medium text-admin-ink">
            <input
              type="checkbox"
              checked={isActive && !archived}
              disabled={archived}
              onChange={(e) => setIsActive(e.target.checked)}
              className="h-4 w-4 accent-[#003024]"
            />
            Récompense active (proposée aux clients et au comptoir)
          </label>

          {initial ? (
            <label className="flex cursor-pointer items-center gap-2.5 text-[0.84rem] text-admin-muted">
              <input
                type="checkbox"
                checked={archived}
                onChange={(e) => {
                  setArchived(e.target.checked);
                  if (e.target.checked) setIsActive(false);
                }}
                className="h-4 w-4 accent-[#003024]"
              />
              Archiver cette récompense (masquée par défaut, conservée pour l&apos;historique des{" "}
              {initial.redeemedCount} échange{initial.redeemedCount > 1 ? "s" : ""})
            </label>
          ) : null}
        </div>
      </form>
      {advice ? <AdviceBox advice={advice} /> : null}
    </Sheet>
  );
}
