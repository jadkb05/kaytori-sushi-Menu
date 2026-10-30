/**
 * Disponibilité Formule Midi — Africa/Casablanca, lun–ven 11:30–17:00.
 */
import { describe, expect, it } from "vitest";
import {
  FORMULE_MIDI_SECTION_ID,
  casablancaLocalToUtc,
  getCasablancaWallClock,
  isFormuleMidiAvailableAt,
  isFormuleMidiOffer,
  nextFormuleMidiAvailabilityChangeAt,
  unavailableMidiCartLineIds,
} from "../src/data/formuleMidiAvailability";
import { FORMULE_SECTION_MIDI, FORMULE_SECTION_PROMO } from "../src/data/formulesPromos";

/** Instant UTC dont l'horloge murale Casablanca correspond aux arguments. */
function atCasablanca(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second = 0,
): Date {
  return casablancaLocalToUtc(year, month, day, hour, minute, second);
}

describe("isFormuleMidiOffer", () => {
  it("privilégie l'id de section stable formule-midi", () => {
    expect(
      isFormuleMidiOffer({
        id: "x",
        name: "Offre renommée",
        category: "Autre libellé",
        formuleSectionId: FORMULE_MIDI_SECTION_ID,
      }),
    ).toBe(true);
    expect(
      isFormuleMidiOffer({
        id: "formule-duo",
        name: "Formule Duo",
        category: FORMULE_SECTION_MIDI,
        formuleSectionId: "formules-solo-duo-family",
      }),
    ).toBe(false);
  });

  it("replie sur le libellé / heuristique sans formuleSectionId", () => {
    expect(
      isFormuleMidiOffer({ id: "abc", name: "Formule Californie", category: FORMULE_SECTION_MIDI }),
    ).toBe(true);
    expect(
      isFormuleMidiOffer({ id: "formule-midi-special", name: "Spécial", category: FORMULE_SECTION_PROMO }),
    ).toBe(true);
    expect(
      isFormuleMidiOffer({ id: "formule-duo", name: "Formule Duo", category: "Formules Solo / Duo / Family" }),
    ).toBe(false);
  });
});

describe("isFormuleMidiAvailableAt (Casablanca)", () => {
  // 2026-10-26 = lundi ; 2026-10-24 = samedi ; 2026-10-25 = dimanche
  it("lundi 11:29 indisponible, 11:30 disponible", () => {
    expect(isFormuleMidiAvailableAt(atCasablanca(2026, 10, 26, 11, 29))).toBe(false);
    expect(isFormuleMidiAvailableAt(atCasablanca(2026, 10, 26, 11, 30))).toBe(true);
    expect(isFormuleMidiAvailableAt(atCasablanca(2026, 10, 26, 11, 59))).toBe(true);
  });

  it("lundi 16:59 disponible, 17:01 indisponible", () => {
    expect(isFormuleMidiAvailableAt(atCasablanca(2026, 10, 26, 16, 59))).toBe(true);
    expect(isFormuleMidiAvailableAt(atCasablanca(2026, 10, 26, 17, 1))).toBe(false);
  });

  it.each([26, 27, 28, 29, 30])("jour ouvré %i : 15h et 17h inclus disponibles", (day) => {
    expect(isFormuleMidiAvailableAt(atCasablanca(2026, 10, day, 15, 0))).toBe(true);
    const end = atCasablanca(2026, 10, day, 17, 0);
    expect(isFormuleMidiAvailableAt(end)).toBe(true);
    expect(isFormuleMidiAvailableAt(new Date(end.getTime() + 1))).toBe(false);
    expect(nextFormuleMidiAvailabilityChangeAt(end).getTime()).toBe(end.getTime() + 1);
  });

  it("respecte Casablanca avec les décalages UTC+0 et UTC+1", () => {
    expect(isFormuleMidiAvailableAt(new Date("2026-02-18T17:00:00Z"))).toBe(true);
    expect(isFormuleMidiAvailableAt(new Date("2026-02-18T17:00:01Z"))).toBe(false);
    expect(isFormuleMidiAvailableAt(new Date("2026-07-06T16:00:00Z"))).toBe(true);
    expect(isFormuleMidiAvailableAt(new Date("2026-07-06T16:00:01Z"))).toBe(false);
  });

  it("samedi et dimanche indisponibles toute la journée", () => {
    expect(isFormuleMidiAvailableAt(atCasablanca(2026, 10, 24, 12, 30))).toBe(false);
    expect(isFormuleMidiAvailableAt(atCasablanca(2026, 10, 24, 13, 0))).toBe(false);
    expect(isFormuleMidiAvailableAt(atCasablanca(2026, 10, 24, 11, 30))).toBe(false);
    expect(isFormuleMidiAvailableAt(atCasablanca(2026, 10, 25, 11, 30))).toBe(false);
    expect(isFormuleMidiAvailableAt(atCasablanca(2026, 10, 25, 12, 0))).toBe(false);
    expect(isFormuleMidiAvailableAt(atCasablanca(2026, 10, 25, 14, 59))).toBe(false);
  });

  it("vendredi dans le créneau, hors créneau", () => {
    expect(isFormuleMidiAvailableAt(atCasablanca(2026, 10, 30, 11, 29))).toBe(false);
    expect(isFormuleMidiAvailableAt(atCasablanca(2026, 10, 30, 11, 30))).toBe(true);
    expect(isFormuleMidiAvailableAt(atCasablanca(2026, 10, 30, 17, 1))).toBe(false);
  });
});

describe("nextFormuleMidiAvailabilityChangeAt", () => {
  it("pendant le créneau → juste après 17:00 le même jour", () => {
    const at = atCasablanca(2026, 10, 26, 13, 0);
    const next = nextFormuleMidiAvailabilityChangeAt(at);
    const wall = getCasablancaWallClock(next);
    expect(wall.year).toBe(2026);
    expect(wall.month).toBe(10);
    expect(wall.day).toBe(26);
    expect(wall.hour).toBe(17);
    expect(wall.minute).toBe(0);
    expect(isFormuleMidiAvailableAt(new Date(next.getTime() - 1))).toBe(true);
    expect(isFormuleMidiAvailableAt(next)).toBe(false);
  });

  it("avant 11:30 un jour ouvré → 11:30 le même jour", () => {
    const at = atCasablanca(2026, 10, 26, 11, 29);
    const next = nextFormuleMidiAvailabilityChangeAt(at);
    const wall = getCasablancaWallClock(next);
    expect(wall.day).toBe(26);
    expect(wall.hour).toBe(11);
    expect(wall.minute).toBe(30);
    expect(isFormuleMidiAvailableAt(new Date(next.getTime() - 1000))).toBe(false);
    expect(isFormuleMidiAvailableAt(next)).toBe(true);
  });

  it("après 17:00 vendredi → lundi suivant 11:30", () => {
    const at = atCasablanca(2026, 10, 30, 18, 0);
    const next = nextFormuleMidiAvailabilityChangeAt(at);
    const wall = getCasablancaWallClock(next);
    expect(wall.weekday).toBe("Mon");
    expect(wall.hour).toBe(11);
    expect(wall.minute).toBe(30);
    expect(isFormuleMidiAvailableAt(next)).toBe(true);
  });

  it("samedi → lundi 11:30", () => {
    const at = atCasablanca(2026, 10, 24, 10, 0);
    const next = nextFormuleMidiAvailabilityChangeAt(at);
    const wall = getCasablancaWallClock(next);
    expect(wall.weekday).toBe("Mon");
    expect(wall.day).toBe(26);
    expect(wall.hour).toBe(11);
    expect(wall.minute).toBe(30);
  });
});

describe("unavailableMidiCartLineIds", () => {
  const dishes = new Map([
    [
      "midi-1",
      {
        id: "midi-1",
        name: "Formule Californie",
        category: FORMULE_SECTION_MIDI,
        formuleSectionId: FORMULE_MIDI_SECTION_ID,
      },
    ],
    [
      "formule-duo",
      {
        id: "formule-duo",
        name: "Formule Duo",
        category: "Formules Solo / Duo / Family",
        formuleSectionId: "formules-solo-duo-family",
      },
    ],
  ]);

  it("vide pendant le créneau", () => {
    expect(
      unavailableMidiCartLineIds(
        [{ id: "midi-1" }, { id: "formule-duo" }],
        dishes,
        atCasablanca(2026, 10, 26, 12, 30),
      ),
    ).toEqual([]);
  });

  it("signale seulement les lignes midi hors créneau", () => {
    expect(
      unavailableMidiCartLineIds(
        [{ id: "midi-1" }, { id: "formule-duo" }],
        dishes,
        atCasablanca(2026, 10, 26, 17, 1),
      ),
    ).toEqual(["midi-1"]);
  });
});
