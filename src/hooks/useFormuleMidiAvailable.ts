import { useEffect, useState } from "react";
import {
  isFormuleMidiAvailableAt,
  nextFormuleMidiAvailabilityChangeAt,
} from "../data/formuleMidiAvailability";

const POLL_MS = 30_000;

/**
 * True pendant le créneau midi Casablanca. Se met à jour au prochain changement
 * d'horaire (et périodiquement si l'onglet reste ouvert).
 */
export function useFormuleMidiAvailable(): boolean {
  const [available, setAvailable] = useState(() => isFormuleMidiAvailableAt());

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let intervalId: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;

    const sync = () => {
      if (cancelled) return;
      setAvailable(isFormuleMidiAvailableAt());
    };

    const scheduleBoundary = () => {
      if (cancelled) return;
      if (timeoutId) clearTimeout(timeoutId);
      const next = nextFormuleMidiAvailabilityChangeAt();
      const delay = Math.max(250, next.getTime() - Date.now() + 50);
      timeoutId = setTimeout(() => {
        sync();
        scheduleBoundary();
      }, Math.min(delay, 2_147_000_000));
    };

    sync();
    scheduleBoundary();
    intervalId = setInterval(sync, POLL_MS);

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        sync();
        scheduleBoundary();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
      if (intervalId) clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return available;
}
