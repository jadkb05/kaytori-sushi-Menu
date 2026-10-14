/**
 * « Utiliser ma position actuelle » : succès, refus, délai dépassé, erreurs, absence de réponse du
 * navigateur (invite iOS non aboutie) et réponses tardives ignorées.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mapsUrlFromCoords, normalizeLocationUrl } from "../src/cart/checkout";
import { GEO_OPTIONS, GEO_WATCHDOG_MS, geoFailureMessage, requestCurrentPosition } from "../src/cart/geolocation";

type Success = (p: { coords: { latitude: number; longitude: number } }) => void;
type Failure = (e: { code: number; message: string }) => void;

/** Faux navigator.geolocation : garde les callbacks pour répondre quand le test le décide. */
function fakeGeo() {
  const calls: { ok: Success; ko: Failure; options?: PositionOptions }[] = [];
  const geolocation = {
    getCurrentPosition: vi.fn((ok: Success, ko: Failure, options?: PositionOptions) => {
      calls.push({ ok, ko, options });
    }),
  } as unknown as Geolocation;
  return { geolocation, calls };
}

function run(env: Parameters<typeof requestCurrentPosition>[0]) {
  const onSuccess = vi.fn();
  const onFailure = vi.fn();
  requestCurrentPosition(env, onSuccess, onFailure);
  return { onSuccess, onFailure };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("requestCurrentPosition", () => {
  it("succès : coordonnées transmises, options mobiles demandées", () => {
    const g = fakeGeo();
    const { onSuccess, onFailure } = run({ geolocation: g.geolocation, isSecureContext: true });
    expect(g.calls[0].options).toEqual({ enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
    expect(GEO_OPTIONS).toEqual(g.calls[0].options);
    g.calls[0].ok({ coords: { latitude: 33.528081, longitude: -7.6155 } });
    expect(onSuccess).toHaveBeenCalledWith({ latitude: 33.528081, longitude: -7.6155 });
    expect(onFailure).not.toHaveBeenCalled();
    // le lien produit est accepté par la validation du formulaire et le récapitulatif
    const url = mapsUrlFromCoords(33.528081, -7.6155);
    expect(url).toBe("https://www.google.com/maps?q=33.52808,-7.61550");
    expect(normalizeLocationUrl(url)).toBe(url);
    vi.advanceTimersByTime(GEO_WATCHDOG_MS * 2);
    expect(onFailure).not.toHaveBeenCalled();
  });

  it.each([
    [1, "denied", /refusé.*Réglages/],
    [2, "unavailable", /indisponible/],
    [3, "timeout", /à temps/],
    [99, "error", /a échoué/],
  ])("erreur code %i → %s", (code, failure, text) => {
    const g = fakeGeo();
    const { onSuccess, onFailure } = run({ geolocation: g.geolocation, isSecureContext: true });
    g.calls[0].ko({ code, message: "msg" });
    expect(onFailure).toHaveBeenCalledWith(failure, "msg");
    expect(onSuccess).not.toHaveBeenCalled();
    expect(geoFailureMessage(onFailure.mock.calls[0][0])).toMatch(text);
    expect(geoFailureMessage(onFailure.mock.calls[0][0])).toContain("coller un lien Google Maps");
  });

  it("aucune réponse du navigateur (invite iOS non aboutie) → délai dépassé, puis réponse tardive ignorée", () => {
    const g = fakeGeo();
    const { onSuccess, onFailure } = run({ geolocation: g.geolocation, isSecureContext: true });
    vi.advanceTimersByTime(GEO_WATCHDOG_MS - 1);
    expect(onFailure).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onFailure).toHaveBeenCalledWith("timeout", "aucune réponse du navigateur");
    g.calls[0].ok({ coords: { latitude: 1, longitude: 2 } });
    g.calls[0].ko({ code: 1, message: "late" });
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onFailure).toHaveBeenCalledTimes(1);
  });

  it("exception levée par l'API → échec signalé, jamais ignoré", () => {
    const geolocation = {
      getCurrentPosition: () => {
        throw new Error("boom");
      },
    } as unknown as Geolocation;
    const { onFailure } = run({ geolocation, isSecureContext: true });
    expect(onFailure).toHaveBeenCalledWith("error", "boom");
    vi.advanceTimersByTime(GEO_WATCHDOG_MS);
    expect(onFailure).toHaveBeenCalledTimes(1);
  });

  it("page non sécurisée ou API absente : message sans appel à l'API", () => {
    const g = fakeGeo();
    expect(run({ geolocation: g.geolocation, isSecureContext: false }).onFailure).toHaveBeenCalledWith("insecure", undefined);
    expect(run({ geolocation: undefined, isSecureContext: true }).onFailure).toHaveBeenCalledWith("unsupported", undefined);
    expect(g.geolocation.getCurrentPosition).not.toHaveBeenCalled();
  });
});
