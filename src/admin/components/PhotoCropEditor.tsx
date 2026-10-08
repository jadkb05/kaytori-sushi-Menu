/**
 * Éditeur de cadrage carré d'une photo produit : zoom (slider, molette), déplacement (souris,
 * doigt, flèches du clavier), Réinitialiser / Annuler / Enregistrer la photo.
 *
 * L'aperçu est dessiné sur un canvas avec exactement la même opération que le fichier enregistré
 * (même zone source) : ce qui est vu est ce qui est enregistré.
 */
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import {
  clampCrop,
  cropOutputSide,
  cropRect,
  initialCrop,
  loadPhotoForCrop,
  maxCropZoom,
  panCrop,
  renderCroppedPhoto,
  type Crop,
} from "../lib/photoCrop";

/** Pas de déplacement au clavier (pixels d'écran) et de zoom (molette, touches + / −). */
const KEY_PAN = 12;
const ZOOM_STEP = 0.1;

type Props = {
  /** Photo actuelle du produit. */
  src: string;
  onCancel: () => void;
  /** Enregistre le fichier recadré ; renvoie un message d'erreur, ou null en cas de succès. */
  onSave: (file: File) => Promise<string | null>;
};

export function PhotoCropEditor({ src, onCancel, onSave }: Props) {
  const [image, setImage] = useState<ImageBitmap | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [crop, setCrop] = useState<Crop | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [viewport, setViewport] = useState(0);
  const dialogRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ id: number; x: number; y: number } | null>(null);
  const savingRef = useRef(false);
  savingRef.current = saving;
  /** Annuler le plus récent, sans relancer l'effet de la fenêtre à chaque rendu du parent. */
  const cancelRef = useRef(onCancel);
  cancelRef.current = onCancel;

  // Chargement de la photo actuelle (pixels réels, orientation appliquée).
  useEffect(() => {
    let cancelled = false;
    let loaded: ImageBitmap | null = null;
    loadPhotoForCrop(src)
      .then((bitmap) => {
        if (cancelled) return bitmap.close();
        loaded = bitmap;
        setImage(bitmap);
        setCrop(initialCrop(bitmap.width, bitmap.height));
      })
      .catch(() => !cancelled && setLoadError("Impossible de charger la photo actuelle pour la recadrer."));
    return () => {
      cancelled = true;
      loaded?.close();
    };
  }, [src]);

  // Taille du cadre affiché (carré responsive).
  useLayoutEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const measure = () => setViewport(el.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [image]);

  // Aperçu : même zone source que le fichier enregistré.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !image || !crop || viewport === 0) return;
    const ratio = window.devicePixelRatio || 1;
    const size = Math.round(viewport * ratio);
    if (canvas.width !== size) canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = cropRect(crop, image.width, image.height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(image, rect.x, rect.y, rect.side, rect.side, 0, 0, size, size);
  }, [image, crop, viewport]);

  // Molette : zoom (écouteur non passif pour bloquer le défilement de la page).
  useEffect(() => {
    const el = frameRef.current;
    if (!el || !image) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setCrop((c) => c && clampCrop({ ...c, zoom: c.zoom * (e.deltaY < 0 ? 1 + ZOOM_STEP : 1 / (1 + ZOOM_STEP)) }, image.width, image.height));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [image]);

  // Fenêtre modale : Échap = Annuler, focus gardé dans la fenêtre, défilement de la page bloqué.
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !savingRef.current) {
        e.preventDefault();
        cancelRef.current();
      }
      if (e.key !== "Tab") return;
      const items = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), [tabindex='0']") ?? [],
      );
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);

  const update = (next: (c: Crop) => Crop) => setCrop((c) => (c && image ? clampCrop(next(c), image.width, image.height) : c));

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!image || saving) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
    setDragging(true);
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId || !image) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    drag.current = { ...d, x: e.clientX, y: e.clientY };
    setCrop((c) => c && panCrop(c, dx, dy, viewport, image.width, image.height));
  };
  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (drag.current?.id !== e.pointerId) return;
    drag.current = null;
    setDragging(false);
  };
  const onFrameKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!image) return;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [KEY_PAN, 0],
      ArrowRight: [-KEY_PAN, 0],
      ArrowUp: [0, KEY_PAN],
      ArrowDown: [0, -KEY_PAN],
    };
    if (moves[e.key]) {
      e.preventDefault();
      const [dx, dy] = moves[e.key];
      setCrop((c) => c && panCrop(c, dx, dy, viewport, image.width, image.height));
    } else if (e.key === "+" || e.key === "=") {
      e.preventDefault();
      update((c) => ({ ...c, zoom: c.zoom + ZOOM_STEP }));
    } else if (e.key === "-") {
      e.preventDefault();
      update((c) => ({ ...c, zoom: c.zoom - ZOOM_STEP }));
    }
  };

  const save = async () => {
    if (!image || !crop) return;
    setSaving(true);
    setSaveError(null);
    try {
      const file = await renderCroppedPhoto(image, cropRect(crop, image.width, image.height), "photo");
      const error = await onSave(file);
      if (error) setSaveError(error);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Recadrage impossible.");
    } finally {
      setSaving(false);
    }
  };

  const maxZoom = image ? maxCropZoom(image.width, image.height) : 1;
  const outputSide = image && crop ? cropOutputSide(cropRect(crop, image.width, image.height)) : null;
  const buttonClass = "rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50";

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-stone-900/50 sm:items-center sm:p-4" role="presentation">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="crop-title"
        className="max-h-full w-full max-w-md overflow-y-auto rounded-t-xl bg-white p-5 shadow-lg sm:rounded-xl sm:p-6"
      >
        <h3 id="crop-title" className="text-lg font-semibold text-stone-900">
          Recadrer la photo
        </h3>
        <p className="mt-1 text-sm text-stone-500">Zoomez, puis faites glisser la photo pour choisir la partie visible dans le carré.</p>

        <div
          ref={frameRef}
          tabIndex={0}
          data-autofocus
          role="group"
          aria-label="Cadrage : faites glisser ou utilisez les flèches du clavier, + et − pour zoomer"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onKeyDown={onFrameKey}
          className={`relative mt-4 aspect-square w-full touch-none select-none overflow-hidden rounded-lg bg-stone-900 outline-none focus-visible:ring-2 focus-visible:ring-stone-900/40 focus-visible:ring-offset-2 ${
            image ? (dragging ? "cursor-grabbing" : "cursor-grab") : ""
          }`}
        >
          {image ? <canvas ref={canvasRef} className="block h-full w-full" aria-hidden /> : null}
          {!image && !loadError ? (
            <p className="absolute inset-0 grid place-items-center text-sm text-stone-300">Chargement de la photo…</p>
          ) : null}
          {loadError ? <p className="absolute inset-0 grid place-items-center px-6 text-center text-sm text-red-200">{loadError}</p> : null}
          {/* Repères des tiers, discrets : aide au cadrage, absents du fichier. */}
          {image ? (
            <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3" aria-hidden>
              {Array.from({ length: 9 }, (_, i) => (
                <span key={i} className="border-[0.5px] border-white/20" />
              ))}
            </div>
          ) : null}
        </div>

        <div className="mt-4 flex items-center gap-3">
          <label htmlFor="crop-zoom" className="text-sm font-medium text-stone-700">
            Zoom
          </label>
          <input
            id="crop-zoom"
            type="range"
            min={1}
            max={maxZoom}
            step={0.01}
            value={crop?.zoom ?? 1}
            disabled={!image || saving || maxZoom <= 1}
            onChange={(e) => update((c) => ({ ...c, zoom: Number(e.target.value) }))}
            className="h-2 flex-1 cursor-pointer accent-kaytori-green"
          />
          <span className="w-12 text-right text-sm tabular-nums text-stone-500">{(crop?.zoom ?? 1).toFixed(1)}×</span>
        </div>
        <p className="mt-2 text-xs text-stone-500">
          {outputSide ? `Photo enregistrée : ${outputSide} × ${outputSide} px, carrée, puis compressée automatiquement.` : " "}
        </p>

        {saveError ? (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
            {saveError}
          </p>
        ) : null}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => image && setCrop(initialCrop(image.width, image.height))}
            disabled={!image || saving}
            className={`${buttonClass} text-stone-600 hover:bg-stone-100`}
          >
            Réinitialiser
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={saving}
              className={`${buttonClass} border border-stone-300 bg-white text-stone-700 hover:bg-stone-50`}
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={save}
              disabled={!image || saving}
              className={`${buttonClass} bg-kaytori-green text-white hover:bg-kaytori-greenDark`}
            >
              {saving ? "Enregistrement…" : "Enregistrer la photo"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
