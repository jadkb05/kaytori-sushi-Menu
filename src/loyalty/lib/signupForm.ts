/**
 * Formulaire d'inscription : validation (mêmes règles que la base, qui reste juge) et étapes
 * saisie → confirmation → envoi, sous forme d'automate pur (testable sans navigateur).
 */
import { formatMoroccanPhoneDisplay, normalizeMoroccanPhone } from "../../cart/checkout";
import type { ErrorAdvice } from "./errors";

export type SignupValues = { fullName: string; phone: string };
export type SignupField = keyof SignupValues;
export type SignupErrors = Partial<Record<SignupField, string>>;

/** Espaces réduits, forme naturelle conservée (accents, apostrophes, traits d'union). */
export function cleanFullName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

export function validateFullName(raw: string): string | undefined {
  const name = cleanFullName(raw);
  if (name === "") return "Indiquez votre nom et prénom.";
  if (name.length < 2 || name.length > 80 || /[\u0000-\u001f\u007f]/.test(name)) return "Indiquez votre nom et prénom (2 à 80 caractères).";
  if (!/[^\s\d\p{P}\p{S}]/u.test(name)) return "Le nom doit contenir des lettres.";
  return undefined;
}

export function validatePhone(raw: string): string | undefined {
  if (raw.trim() === "") return "Indiquez votre numéro de mobile.";
  if (!normalizeMoroccanPhone(raw)) return "Numéro invalide. Exemple : 06 12 34 56 78 ou +212 6 12 34 56 78.";
  return undefined;
}

export function validateSignup(values: SignupValues): SignupErrors {
  const errors: SignupErrors = {};
  const name = validateFullName(values.fullName);
  const phone = validatePhone(values.phone);
  if (name) errors.fullName = name;
  if (phone) errors.phone = phone;
  return errors;
}

/** Récapitulatif affiché avant confirmation. */
export function confirmationSummary(values: SignupValues): { fullName: string; phone: string } {
  const phone = normalizeMoroccanPhone(values.phone);
  return { fullName: cleanFullName(values.fullName), phone: phone ? formatMoroccanPhoneDisplay(phone) : values.phone };
}

/* ------------------------------------------------------------------ automate */

export type SignupStep = "form" | "confirm" | "submitting";

export type SignupState = {
  step: SignupStep;
  values: SignupValues;
  errors: SignupErrors;
  touched: Partial<Record<SignupField, boolean>>;
  /** Dernier échec d'envoi (affiché sur l'écran de confirmation ou du formulaire). */
  failure: ErrorAdvice | null;
  /** Champ à mettre au point après une validation refusée. */
  focus: SignupField | null;
};

export type SignupAction =
  | { type: "change"; field: SignupField; value: string }
  | { type: "blur"; field: SignupField }
  | { type: "review" }
  | { type: "edit" }
  | { type: "submit" }
  | { type: "failed"; advice: ErrorAdvice }
  | { type: "restore"; values: SignupValues };

export const INITIAL_SIGNUP: SignupState = {
  step: "form",
  values: { fullName: "", phone: "" },
  errors: {},
  touched: {},
  failure: null,
  focus: null,
};

const validators: Record<SignupField, (v: string) => string | undefined> = {
  fullName: validateFullName,
  phone: validatePhone,
};

function withFieldError(errors: SignupErrors, field: SignupField, message: string | undefined): SignupErrors {
  const next = { ...errors };
  if (message) next[field] = message;
  else delete next[field];
  return next;
}

export function signupReducer(state: SignupState, action: SignupAction): SignupState {
  switch (action.type) {
    case "change": {
      if (state.step !== "form") return state;
      const values = { ...state.values, [action.field]: action.value };
      // Un champ déjà signalé se revalide pendant la saisie (l'erreur disparaît dès que c'est bon).
      const errors = state.touched[action.field] ? withFieldError(state.errors, action.field, validators[action.field](action.value)) : state.errors;
      return { ...state, values, errors, focus: null };
    }
    case "blur": {
      if (state.step !== "form" || state.values[action.field] === "") return state;
      return {
        ...state,
        touched: { ...state.touched, [action.field]: true },
        errors: withFieldError(state.errors, action.field, validators[action.field](state.values[action.field])),
        focus: null,
      };
    }
    case "review": {
      if (state.step !== "form") return state;
      const errors = validateSignup(state.values);
      const first = (["fullName", "phone"] as const).find((f) => errors[f]) ?? null;
      if (first) return { ...state, errors, touched: { fullName: true, phone: true }, focus: first };
      return { ...state, step: "confirm", errors: {}, failure: null, focus: null };
    }
    case "edit":
      return state.step === "confirm" ? { ...state, step: "form", failure: null, focus: "fullName" } : state;
    case "submit":
      // Un seul envoi à la fois : un double appui ne relance rien.
      return state.step === "confirm" ? { ...state, step: "submitting", failure: null } : state;
    case "failed": {
      if (state.step !== "submitting") return state;
      const { advice } = action;
      if (advice.action === "edit" && advice.field) {
        return {
          ...state,
          step: "form",
          failure: null,
          errors: { ...state.errors, [advice.field]: advice.message },
          touched: { ...state.touched, [advice.field]: true },
          focus: advice.field,
        };
      }
      if (advice.action === "restart") return { ...state, step: "form", failure: advice, focus: "fullName" };
      return { ...state, step: "confirm", failure: advice };
    }
    case "restore":
      return { ...INITIAL_SIGNUP, step: "confirm", values: action.values };
  }
}
