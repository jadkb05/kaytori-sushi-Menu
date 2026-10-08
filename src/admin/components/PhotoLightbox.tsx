/**
 * Aperçu agrandi d'une photo (lecture seule) : clic sur la miniature → photo en grand, entière
 * (object-contain), sur fond sombre. Fermeture : bouton X, clic hors de la photo, Échap.
 * Le focus va sur X à l'ouverture et revient à la miniature à la fermeture.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** Durée de la transition d'ouverture / fermeture (ms). */
const TRANSITION_MS = 150;

export function PhotoLightbox({ src, label, children }: { src: string; label: string; children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const closeTimer = useRef<number | null>(null);

  /** Fermeture : fondu, puis retrait de la fenêtre et retour du focus à la miniature. */
  const close = () => {
    if (closeTimer.current !== null) return;
    setVisible(false);
    closeTimer.current = window.setTimeout(() => {
      closeTimer.current = null;
      setMounted(false);
      triggerRef.current?.focus({ preventScroll: true });
    }, TRANSITION_MS);
  };

  useEffect(() => () => {
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const frame = window.requestAnimationFrame(() => setVisible(true));
    closeRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      // Seul élément focusable : le focus reste sur X.
      if (e.key === "Tab") {
        e.preventDefault();
        closeRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [mounted]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setMounted(true)}
        aria-haspopup="dialog"
        aria-label={label}
        className="block w-full cursor-zoom-in rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-900/40"
      >
        {children}
      </button>
      {mounted
        ? createPortal(
            <div
              role="dialog"
              aria-modal="true"
              aria-label={label}
              onClick={close}
              className={`fixed inset-0 z-50 flex cursor-zoom-out items-center justify-center bg-stone-950/85 p-4 transition-opacity duration-150 ease-out motion-reduce:transition-none sm:p-8 ${
                visible ? "opacity-100" : "opacity-0"
              }`}
            >
              <img
                src={src}
                alt=""
                onClick={(e) => e.stopPropagation()}
                className={`max-h-full max-w-full cursor-default rounded-lg object-contain shadow-2xl transition-transform duration-150 ease-out motion-reduce:transition-none ${
                  visible ? "scale-100" : "scale-95"
                }`}
              />
              <button
                ref={closeRef}
                type="button"
                onClick={close}
                aria-label="Fermer l'aperçu"
                className="absolute right-3 top-3 grid h-10 w-10 cursor-pointer place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 sm:right-5 sm:top-5"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                </svg>
              </button>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
