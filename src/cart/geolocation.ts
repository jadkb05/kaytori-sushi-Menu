/**
 * Position GPS du client, à la demande uniquement (clic sur « Utiliser ma position actuelle »).
 *
 * Le premier relevé d'un téléphone est souvent grossier (Wi-Fi, antenne) avant que le GPS ne se
 * fixe : on suit donc les relevés successifs (`watchPosition`) et on garde le plus précis selon
 * `coords.accuracy`, jusqu'à la précision visée ou une échéance. Aucune moyenne ni recalage :
 * les coordonnées retenues sont exactement celles d'un relevé du téléphone.
 *
 * Le `timeout` de l'API ne court qu'après l'autorisation : si l'invite d'iOS n'aboutit pas (ignorée,
 * navigateur intégré d'Instagram/Facebook, services de localisation coupés), aucun callback n'est
 * appelé. Un minuteur de secours garantit donc toujours une réponse.
 */

/** maximumAge 0 : jamais de position en cache (potentiellement ancienne ou grossière). */
export const GEO_OPTIONS: PositionOptions = { enableHighAccuracy: true, timeout: 25000, maximumAge: 0 };
/** Relevé jugé précis : on s'arrête dès qu'il est atteint. */
export const GEO_TARGET_ACCURACY_M = 50;
/** Au-delà, la position est approximative : elle n'est pas ajoutée au champ. */
export const GEO_MAX_ACCURACY_M = 100;
/** Après un premier relevé, temps laissé au GPS pour s'affiner. */
export const GEO_REFINE_MS = 12000;
/** Délai maximal total, invite d'autorisation comprise. */
export const GEO_WATCHDOG_MS = 40000;

export type GeoFix = { latitude: number; longitude: number; /** Rayon d'incertitude en mètres. */ accuracy: number };

export type GeoFailure = "unsupported" | "insecure" | "denied" | "unavailable" | "timeout" | "error";

/** Codes de GeolocationPositionError (comparés en nombres : constantes absentes de certains navigateurs). */
const PERMISSION_DENIED = 1;
const POSITION_UNAVAILABLE = 2;
const TIMEOUT = 3;

export function geoFailureFromCode(code: number): GeoFailure {
  if (code === PERMISSION_DENIED) return "denied";
  if (code === POSITION_UNAVAILABLE) return "unavailable";
  if (code === TIMEOUT) return "timeout";
  return "error";
}

const MANUAL = "Vous pouvez coller un lien Google Maps dans le champ ci-dessus.";
const PRECISE_HINT =
  "Sur iPhone, vérifiez que « Position exacte » est activée (Réglages › Confidentialité et sécurité › Service de localisation › Sites web Safari)";

export function geoFailureMessage(failure: GeoFailure): string {
  switch (failure) {
    case "denied":
      // Code 1 avec le Service de localisation actif : refus mémorisé par Safari pour ce site,
      // ou page ouverte dans le navigateur intégré d'une app (autorisation de l'app, pas de Safari).
      return `Accès à la position bloqué pour ce site. Dans Safari : Réglages du site web › Position › Autoriser (ou Réglages › Apps › Safari › Position). Depuis WhatsApp, Instagram ou Facebook, ouvrez d'abord la page dans Safari. Puis réessayez. ${MANUAL}`;
    case "unavailable":
      return `Position indisponible (GPS ou réseau). Vérifiez que le Service de localisation est activé. ${MANUAL}`;
    case "timeout":
      return `La position n'a pas pu être obtenue à temps. Réessayez, idéalement près d'une fenêtre. ${MANUAL}`;
    case "insecure":
      return `La localisation nécessite une connexion sécurisée (https). ${MANUAL}`;
    case "unsupported":
      return `La localisation n'est pas disponible sur ce navigateur. ${MANUAL}`;
    default:
      return `La localisation a échoué. ${MANUAL}`;
  }
}

/** « ± 18 m », « ± 1,2 km ». */
export function formatAccuracy(meters: number): string {
  if (meters < 1000) return `± ${Math.max(1, Math.round(meters))} m`;
  const km = Math.round(meters / 100) / 10;
  return `± ${String(km).replace(".", ",")} km`;
}

export function isPreciseFix(fix: GeoFix): boolean {
  return Number.isFinite(fix.accuracy) && fix.accuracy <= GEO_MAX_ACCURACY_M;
}

export function preciseFixMessage(fix: GeoFix): string {
  return `Position ajoutée au champ Localisation (précision ${formatAccuracy(fix.accuracy)}).`;
}

export function approximateFixMessage(fix: GeoFix): string {
  return `Position trop approximative (précision ${formatAccuracy(fix.accuracy)}) : elle n'a pas été ajoutée. ${PRECISE_HINT}, puis réessayez, idéalement à l'extérieur ou près d'une fenêtre. ${MANUAL}`;
}

type GeoEnv = {
  geolocation?: Pick<Geolocation, "watchPosition" | "clearWatch">;
  isSecureContext?: boolean;
};

type Timing = { watchdogMs?: number; refineMs?: number; targetAccuracy?: number };

/**
 * Suit les relevés jusqu'à la précision visée, la fin du délai d'affinage ou l'échéance globale,
 * puis appelle exactement un des deux callbacks avec le relevé le plus précis. Le suivi GPS est
 * toujours arrêté ; les réponses tardives sont ignorées.
 */
export function requestCurrentPosition(
  env: GeoEnv,
  onSuccess: (fix: GeoFix) => void,
  onFailure: (failure: GeoFailure, detail?: string) => void,
  { watchdogMs = GEO_WATCHDOG_MS, refineMs = GEO_REFINE_MS, targetAccuracy = GEO_TARGET_ACCURACY_M }: Timing = {},
): void {
  let settled = false;
  let best: GeoFix | null = null;
  let watchId: number | undefined;
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  let refine: ReturnType<typeof setTimeout> | undefined;

  const settle = (fn: () => void) => {
    if (settled) return;
    settled = true;
    clearTimeout(watchdog);
    clearTimeout(refine);
    if (watchId !== undefined) env.geolocation?.clearWatch(watchId);
    fn();
  };
  /** Fin : meilleur relevé s'il y en a un, sinon l'échec donné. */
  const finish = (failure: GeoFailure, detail?: string) => {
    const fix = best;
    settle(() => (fix ? onSuccess(fix) : onFailure(failure, detail)));
  };

  if (env.isSecureContext === false) return settle(() => onFailure("insecure"));
  if (!env.geolocation) return settle(() => onFailure("unsupported"));

  watchdog = setTimeout(() => finish("timeout", "aucune réponse du navigateur"), watchdogMs);
  try {
    watchId = env.geolocation.watchPosition(
      (pos) => {
        if (settled) return;
        const fix = { latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy };
        if (!best || fix.accuracy < best.accuracy) best = fix;
        if (best.accuracy <= targetAccuracy) return finish("error");
        if (refine === undefined) refine = setTimeout(() => finish("timeout"), refineMs);
      },
      (err) => {
        if (settled) return;
        const failure = geoFailureFromCode(err.code);
        // Refus : jamais de position. Sinon on garde le meilleur relevé déjà obtenu.
        if (failure === "denied") settle(() => onFailure(failure, err.message));
        else finish(failure, err.message);
      },
      GEO_OPTIONS,
    );
    if (settled && watchId !== undefined) env.geolocation.clearWatch(watchId);
  } catch (e) {
    settle(() => onFailure("error", e instanceof Error ? e.message : String(e)));
  }
}
