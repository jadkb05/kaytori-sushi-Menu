import type { SupabaseClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, TrashIcon } from "../components/icons";
import {
  ConfirmDialog,
  LoadingState,
  PageHeader,
  StatusBadge,
  Toast,
  buttonClass,
  cardClass,
  orderButton,
  type ToastNotice,
} from "../components/ui";
import {
  COVER_BANNERS_MIGRATION_HINT,
  PHOTO_ACCEPT,
  coverBannerPosition,
  coverMoveTarget,
  createCoverBanner,
  deleteCoverBanner,
  fetchCoverBanners,
  orderedCoverBanners,
  replaceCoverBannerPhoto,
  updateCoverBanner,
  validatePhotoFile,
  type CoverBannerRow,
} from "../lib/coverBannerAdmin";

/**
 * Gestion des photos de couverture du menu public (carrousel).
 * Ajout / remplacement / ordre / activation / suppression — persistés via Supabase.
 */
export function CoverBannersPage({ client }: { client: SupabaseClient }) {
  const [banners, setBanners] = useState<CoverBannerRow[] | null>(null);
  const [ready, setReady] = useState(false);
  const [toast, setToast] = useState<ToastNotice | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<CoverBannerRow | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [addBusy, setAddBusy] = useState(false);
  const addInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const replaceTargetRef = useRef<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setBanners(await fetchCoverBanners(client));
    } catch (e) {
      setToast({ tone: "error", message: e instanceof Error ? e.message : "Lecture impossible." });
      setBanners(null);
    } finally {
      setReady(true);
    }
  }, [client]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const ordered = banners ? orderedCoverBanners(banners) : [];

  const onAddFiles = async (files: FileList | null) => {
    if (!files || files.length === 0 || !banners) return;
    setAddBusy(true);
    try {
      let list = banners;
      let added = 0;
      for (const file of Array.from(files)) {
        const invalid = validatePhotoFile(file);
        if (invalid) {
          setToast({ tone: "error", message: invalid });
          continue;
        }
        const res = await createCoverBanner(client, list, {
          file,
          isActive: true,
          position: list.length + 1,
        });
        if (!res.ok) {
          setToast({ tone: "error", message: res.error });
          break;
        }
        list = orderedCoverBanners([...list, res.banner]);
        setBanners(list);
        added += 1;
      }
      if (added > 0) setToast({ tone: "success", message: added === 1 ? "Photo ajoutée." : `${added} photos ajoutées.` });
      await reload();
    } finally {
      setAddBusy(false);
      if (addInputRef.current) addInputRef.current.value = "";
    }
  };

  const onReplace = async (file: File | undefined) => {
    const id = replaceTargetRef.current;
    replaceTargetRef.current = null;
    if (!file || !id) return;
    const invalid = validatePhotoFile(file);
    if (invalid) {
      setToast({ tone: "error", message: invalid });
      return;
    }
    setBusyId(id);
    const res = await replaceCoverBannerPhoto(client, id, file);
    setBusyId(null);
    if (!res.ok) {
      setToast({ tone: "error", message: res.error });
      return;
    }
    setToast({ tone: "success", message: "Photo remplacée." });
    await reload();
    if (replaceInputRef.current) replaceInputRef.current.value = "";
  };

  const toggle = async (b: CoverBannerRow) => {
    setBusyId(b.id);
    const res = await updateCoverBanner(client, b.id, { isActive: !b.is_active });
    setBusyId(null);
    if (!res.ok) {
      setToast({ tone: "error", message: res.error });
      return;
    }
    await reload();
  };

  const move = async (b: CoverBannerRow, direction: "up" | "down") => {
    const pos = coverBannerPosition(ordered, b.id);
    const target = coverMoveTarget(pos, ordered.length, direction);
    if (target === null) return;
    setBusyId(b.id);
    const res = await updateCoverBanner(client, b.id, { position: target });
    setBusyId(null);
    if (!res.ok) {
      setToast({ tone: "error", message: res.error });
      return;
    }
    await reload();
  };

  const setFirst = async (b: CoverBannerRow) => {
    if (coverBannerPosition(ordered, b.id) === 1) return;
    setBusyId(b.id);
    const res = await updateCoverBanner(client, b.id, { position: 1 });
    setBusyId(null);
    if (!res.ok) {
      setToast({ tone: "error", message: res.error });
      return;
    }
    setToast({ tone: "success", message: "Première photo du carrousel." });
    await reload();
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    setDeleteError(null);
    const res = await deleteCoverBanner(client, deleting.id);
    setDeleteBusy(false);
    if (!res.ok) {
      setDeleteError(res.error);
      return;
    }
    setDeleting(null);
    setToast({ tone: "success", message: "Photo supprimée." });
    await reload();
  };

  return (
    <>
      <PageHeader
        title="Couverture"
        description="Photos du bandeau d'accueil du menu public. Ordre, activation et première photo : le carrousel n'affiche que les photos actives, dans cet ordre."
        actions={
          banners ? (
            <>
              <input
                ref={addInputRef}
                type="file"
                accept={PHOTO_ACCEPT}
                multiple
                className="sr-only"
                onChange={(e) => void onAddFiles(e.target.files)}
              />
              <button
                type="button"
                className={buttonClass("primary")}
                disabled={addBusy}
                onClick={() => addInputRef.current?.click()}
              >
                <PlusIcon className="h-4 w-4" />
                {addBusy ? "Ajout…" : "Ajouter des photos"}
              </button>
            </>
          ) : null
        }
      />

      {!ready ? <LoadingState /> : null}
      {ready && banners === null ? (
        <p className={`${cardClass} p-5 text-sm leading-relaxed text-admin-soft`}>{COVER_BANNERS_MIGRATION_HINT}</p>
      ) : null}

      {ready && banners ? (
        <ul className="space-y-3">
          {ordered.map((b) => {
            const pos = coverBannerPosition(ordered, b.id);
            const isFirst = pos === 1;
            const busy = busyId === b.id;
            return (
              <li key={b.id} className={`${cardClass} flex flex-col gap-3 p-3 sm:flex-row sm:items-center`}>
                <div className="aspect-[2/1] w-full shrink-0 overflow-hidden rounded-lg bg-admin-canvas sm:w-48">
                  <img
                    src={b.image_url}
                    alt=""
                    className="h-full w-full object-cover"
                    loading="lazy"
                    decoding="async"
                  />
                </div>
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge active={b.is_active} />
                    {isFirst ? (
                      <span className="rounded-full bg-admin-tint px-2 py-0.5 text-[11px] font-semibold text-kaytori-green">
                        Première
                      </span>
                    ) : null}
                    <span className="text-xs text-admin-muted">Position {pos}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <div className="flex gap-1">
                      <button
                        type="button"
                        className={orderButton}
                        disabled={busy || pos <= 1}
                        aria-label="Monter"
                        onClick={() => void move(b, "up")}
                      >
                        <ArrowUpIcon className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        className={orderButton}
                        disabled={busy || pos >= ordered.length}
                        aria-label="Descendre"
                        onClick={() => void move(b, "down")}
                      >
                        <ArrowDownIcon className="h-4 w-4" />
                      </button>
                    </div>
                    <button
                      type="button"
                      className={buttonClass("secondary", "sm")}
                      disabled={busy || isFirst}
                      onClick={() => void setFirst(b)}
                    >
                      Définir comme première
                    </button>
                    <button
                      type="button"
                      className={buttonClass("secondary", "sm")}
                      disabled={busy}
                      onClick={() => {
                        replaceTargetRef.current = b.id;
                        replaceInputRef.current?.click();
                      }}
                    >
                      Remplacer
                    </button>
                    <button
                      type="button"
                      className={buttonClass("secondary", "sm")}
                      disabled={busy}
                      onClick={() => void toggle(b)}
                    >
                      {b.is_active ? "Désactiver" : "Activer"}
                    </button>
                    <button
                      type="button"
                      className={buttonClass("dangerOutline", "sm")}
                      disabled={busy}
                      onClick={() => {
                        setDeleteError(null);
                        setDeleting(b);
                      }}
                    >
                      <TrashIcon className="h-3.5 w-3.5" />
                      Supprimer
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
          {ordered.length === 0 ? (
            <li className={`${cardClass} p-5 text-sm text-admin-soft`}>
              Aucune photo. Ajoutez-en pour alimenter le carrousel (sinon le site affiche la bannière par défaut).
            </li>
          ) : null}
        </ul>
      ) : null}

      <input
        ref={replaceInputRef}
        type="file"
        accept={PHOTO_ACCEPT}
        className="sr-only"
        onChange={(e) => void onReplace(e.target.files?.[0])}
      />

      {deleting ? (
        <ConfirmDialog
          title="Supprimer cette photo ?"
          description="La photo disparaîtra du carrousel public. L'image n'est retirée du stockage que si vous le faites séparément."
          confirmLabel="Supprimer"
          pendingLabel="Suppression…"
          busy={deleteBusy}
          error={deleteError}
          onConfirm={() => void confirmDelete()}
          onClose={() => {
            if (!deleteBusy) setDeleting(null);
          }}
        />
      ) : null}

      {toast ? <Toast notice={toast} onDismiss={() => setToast(null)} /> : null}
    </>
  );
}
