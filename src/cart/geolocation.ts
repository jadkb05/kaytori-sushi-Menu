/**
 * Position GPS du client, à la demande uniquement (clic sur « Utiliser ma position actuelle »).
 *
 * Le `timeout` de l'API ne court qu'après l'autorisation : si l'invite d'iOS n'aboutit pas (ignorée,
 * navigateur intégré d'Instagram/Facebook, services de localisation coupés), aucun callback n'est
 * appelé. Un minuteur de secours garantit donc toujours une réponse.
 */

export const GEO_OPTIONS: PositionOptions = { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 };
/** Délai maximal total, invite d'autorisation comprise. */
export const GEO_WATCHDOG_MS = 30000;

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

export function geoFailureMessage(failure: GeoFailure): string {
  switch (failure) {
    case "denied":
      return `Accès à la position refusé. Sur iPhone : Réglages › Confidentialité et sécurité › Service de localisation › Sites web Safari › « Lorsque l'app est active », puis réessayez. ${MANUAL}`;
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

type GeoEnv = {
  geolocation?: Pick<Geolocation, "getCurrentPosition">;
  isSecureContext?: boolean;
};

/**
 * Demande la position une seule fois ; exactement un des deux callbacks est appelé (le premier
 * résultat l'emporte, les réponses tardives sont ignorées).
 */
export function requestCurrentPosition(
  env: GeoEnv,
  onSuccess: (coords: { latitude: number; longitude: number }) => void,
  onFailure: (failure: GeoFailure, detail?: string) => void,
  watchdogMs = GEO_WATCHDOG_MS,
): void {
  let settled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const settle = (fn: () => void) => {
    if (settled) return;
    settled = true;
    if (timer !== undefined) clearTimeout(timer);
    fn();
  };
  const fail = (failure: GeoFailure, detail?: string) => settle(() => onFailure(failure, detail));

  if (env.isSecureContext === false) return fail("insecure");
  if (!env.geolocation) return fail("unsupported");

  timer = setTimeout(() => fail("timeout", "aucune réponse du navigateur"), watchdogMs);
  try {
    env.geolocation.getCurrentPosition(
      (pos) => settle(() => onSuccess({ latitude: pos.coords.latitude, longitude: pos.coords.longitude })),
      (err) => fail(geoFailureFromCode(err.code), err.message),
      GEO_OPTIONS,
    );
  } catch (e) {
    fail("error", e instanceof Error ? e.message : String(e));
  }
}
