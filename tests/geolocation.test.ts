/**
 * « Utiliser ma position actuelle » : précision (coords.accuracy), affinage par relevés successifs,
 * position approximative non ajoutée, refus, délais, erreurs et réponses tardives ignorées.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mapsUrlFromCoords, normalizeLocationUrl } from "../src/cart/checkout";
import {
  GEO_MAX_ACCURACY_M,
  GEO_OPTIONS,
  GEO_REFINE_MS,
  GEO_WATCHDOG_MS,
  approximateFixMessage,
  formatAccuracy,
  geoFailureMessage,
  isPreciseFix,
  preciseFixMessage,
  requestCurrentPosition,
} from "../src/cart/geolocation";

type Success = (p: { coords: { latitude: number; longitude: number; accuracy: number } }) => void;
type Failure = (e: { code: number; message: string }) => void;

/** Faux navigator.geolocation (watchPosition) : le test émet les relevés quand il le décide. */
function fakeGeo() {
  let ok: Success = () => {};
  let ko: Failure = () => {};
  let options: PositionOptions | undefined;
  const geolocation = {
    watchPosition: vi.fn((s: Success, f: Failure, o?: PositionOptions) => {
      ok = s;
      ko = f;
      options = o;
      return 7;
    }),
    clearWatch: vi.fn(),
  };
  return {
    geolocation: geolocation as unknown as Geolocation,
    clearWatch: geolocation.clearWatch,
    watchPosition: geolocation.watchPosition,
    fix: (latitude: number, longitude: number, accuracy: number) => ok({ coords: { latitude, longitude, accuracy } }),
    error: (code: number, message = "msg") => ko({ code, message }),
    options: () => options,
  };
}

function run(geolocation: Geolocation | undefined, isSecureContext = true) {
  const onSuccess = vi.fn();
  const onFailure = vi.fn();
  requestCurrentPosition({ geolocation, isSecureContext }, onSuccess, onFailure);
  return { onSuccess, onFailure };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("acquisition", () => {
  it("options : haute précision, 25 s, jamais de position en cache", () => {
    const g = fakeGeo();
    run(g.geolocation);
    expect(g.options()).toEqual({ enableHighAccuracy: true, timeout: 25000, maximumAge: 0 });
    expect(GEO_OPTIONS).toEqual(g.options());
  });

  it("relevé précis d'emblée : retenu tel quel, suivi GPS arrêté", () => {
    const g = fakeGeo();
    const { onSuccess, onFailure } = run(g.geolocation);
    g.fix(33.528081, -7.6155, 12);
    expect(onSuccess).toHaveBeenCalledWith({ latitude: 33.528081, longitude: -7.6155, accuracy: 12 });
    expect(g.clearWatch).toHaveBeenCalledWith(7);
    expect(onFailure).not.toHaveBeenCalled();
  });

  it("affinage : premier relevé grossier, puis meilleur → le meilleur est retenu (sans moyenne)", () => {
    const g = fakeGeo();
    const { onSuccess } = run(g.geolocation);
    g.fix(33.6, -7.7, 3500); // antenne
    g.fix(33.53, -7.62, 400); // Wi-Fi
    expect(onSuccess).not.toHaveBeenCalled();
    g.fix(33.528081, -7.6155, 25); // GPS
    expect(onSuccess).toHaveBeenCalledWith({ latitude: 33.528081, longitude: -7.6155, accuracy: 25 });
  });

  it("un relevé moins précis n'écrase jamais le meilleur", () => {
    const g = fakeGeo();
    const { onSuccess } = run(g.geolocation);
    g.fix(33.528, -7.615, 80);
    g.fix(33.9, -7.9, 2000);
    vi.advanceTimersByTime(GEO_REFINE_MS);
    expect(onSuccess).toHaveBeenCalledWith({ latitude: 33.528, longitude: -7.615, accuracy: 80 });
  });

  it("précision jamais atteinte : fin du délai d'affinage → meilleur relevé, même approximatif", () => {
    const g = fakeGeo();
    const { onSuccess } = run(g.geolocation);
    g.fix(33.6, -7.7, 3500);
    vi.advanceTimersByTime(GEO_REFINE_MS - 1);
    expect(onSuccess).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onSuccess).toHaveBeenCalledWith({ latitude: 33.6, longitude: -7.7, accuracy: 3500 });
    expect(g.clearWatch).toHaveBeenCalled();
    g.fix(33.528, -7.615, 5); // tardif : ignoré
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it("délai/erreur après un relevé : on garde ce relevé", () => {
    const g = fakeGeo();
    const { onSuccess, onFailure } = run(g.geolocation);
    g.fix(33.53, -7.62, 400);
    g.error(3);
    expect(onSuccess).toHaveBeenCalledWith({ latitude: 33.53, longitude: -7.62, accuracy: 400 });
    expect(onFailure).not.toHaveBeenCalled();
  });
});

describe("échecs", () => {
  it.each([
    [1, "denied", /bloqué pour ce site.*Safari/],
    [2, "unavailable", /indisponible/],
    [3, "timeout", /à temps/],
    [99, "error", /a échoué/],
  ])("erreur code %i sans relevé → %s", (code, failure, text) => {
    const g = fakeGeo();
    const { onSuccess, onFailure } = run(g.geolocation);
    g.error(code);
    expect(onFailure).toHaveBeenCalledWith(failure, "msg");
    expect(onSuccess).not.toHaveBeenCalled();
    expect(g.clearWatch).toHaveBeenCalledWith(7);
    expect(geoFailureMessage(failure as never)).toMatch(text);
    expect(geoFailureMessage(failure as never)).toContain("coller un lien Google Maps");
  });

  it("refus après un relevé : aucune position transmise", () => {
    const g = fakeGeo();
    const { onSuccess, onFailure } = run(g.geolocation);
    g.fix(33.53, -7.62, 400);
    g.error(1);
    expect(onFailure).toHaveBeenCalledWith("denied", "msg");
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("aucune réponse (invite iOS non aboutie) → délai dépassé à l'échéance globale ; tardif ignoré", () => {
    const g = fakeGeo();
    const { onSuccess, onFailure } = run(g.geolocation);
    vi.advanceTimersByTime(GEO_WATCHDOG_MS - 1);
    expect(onFailure).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onFailure).toHaveBeenCalledWith("timeout", "aucune réponse du navigateur");
    expect(g.clearWatch).toHaveBeenCalledWith(7);
    g.fix(1, 2, 5);
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("exception levée par l'API → échec signalé une seule fois", () => {
    const geolocation = {
      watchPosition: () => {
        throw new Error("boom");
      },
      clearWatch: vi.fn(),
    } as unknown as Geolocation;
    const { onFailure } = run(geolocation);
    expect(onFailure).toHaveBeenCalledWith("error", "boom");
    vi.advanceTimersByTime(GEO_WATCHDOG_MS);
    expect(onFailure).toHaveBeenCalledTimes(1);
  });

  it("page non sécurisée ou API absente : message sans appel à l'API", () => {
    const g = fakeGeo();
    expect(run(g.geolocation, false).onFailure).toHaveBeenCalledWith("insecure");
    expect(run(undefined).onFailure).toHaveBeenCalledWith("unsupported");
    expect(g.watchPosition).not.toHaveBeenCalled();
  });
});

describe("précision affichée honnêtement", () => {
  const at = (accuracy: number) => ({ latitude: 33.528081, longitude: -7.6155, accuracy });

  it(`précis jusqu'à ${GEO_MAX_ACCURACY_M} m, approximatif au-delà`, () => {
    expect(isPreciseFix(at(12))).toBe(true);
    expect(isPreciseFix(at(GEO_MAX_ACCURACY_M))).toBe(true);
    expect(isPreciseFix(at(GEO_MAX_ACCURACY_M + 1))).toBe(false);
    expect(isPreciseFix(at(Number.NaN))).toBe(false);
  });

  it("messages : précision affichée, conseil « Position exacte » si approximatif, jamais de coordonnées", () => {
    expect(formatAccuracy(12.4)).toBe("± 12 m");
    expect(formatAccuracy(1234)).toBe("± 1,2 km");
    expect(preciseFixMessage(at(12))).toBe("Position ajoutée au champ Localisation (précision ± 12 m).");
    const approx = approximateFixMessage(at(3500));
    expect(approx).toMatch(/approximative \(précision ± 3,5 km\).*pas été ajoutée/);
    expect(approx).toContain("Position exacte");
    expect(approx).toContain("coller un lien Google Maps");
    expect(approx + preciseFixMessage(at(12))).not.toMatch(/33[.,]5|7[.,]61/);
  });

  it("lien Google Maps produit : accepté par la validation et le récapitulatif", () => {
    const url = mapsUrlFromCoords(33.528081, -7.6155);
    expect(url).toBe("https://www.google.com/maps?q=33.52808,-7.61550");
    expect(normalizeLocationUrl(url)).toBe(url);
  });
});
