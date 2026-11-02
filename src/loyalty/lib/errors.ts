/**
 * Erreurs de la fidélité côté client : classement (réseau, délai, métier, service absent, imprévu)
 * puis message court et prochaine action. Aucun message technique PostgreSQL n'est affiché.
 * Codes métier : voir l'en-tête de supabase/migrations/20261026120000_loyalty.sql.
 */

export type LoyaltyErrorKind = "network" | "timeout" | "business" | "unavailable" | "unexpected";

export class LoyaltyError extends Error {
  readonly kind: LoyaltyErrorKind;
  /** SQLSTATE renvoyé par la base (KL001…, 42501…), ou null. */
  readonly code: string | null;

  constructor(kind: LoyaltyErrorKind, code: string | null = null, detail = "") {
    super(detail || kind);
    this.name = "LoyaltyError";
    this.kind = kind;
    this.code = code;
  }
}

export type RpcFailure = { message?: string; code?: string | null } | null;

/**
 * Réponse d'erreur de supabase-js → LoyaltyError.
 * status 0 : la requête n'a pas abouti (réseau coupé, ou abandon après délai).
 */
export function classifyRpcError(error: NonNullable<RpcFailure>, status: number | undefined, timedOut: boolean): LoyaltyError {
  const code = typeof error.code === "string" && error.code !== "" ? error.code : null;
  if (timedOut) return new LoyaltyError("timeout");
  if (code && /^KL\d{3}$/.test(code)) return new LoyaltyError("business", code, error.message ?? "");
  // Fonction absente (migration non appliquée) ou droits retirés : service indisponible.
  if (code === "PGRST202" || code === "42883" || code === "42501" || code === "3F000") {
    return new LoyaltyError("unavailable", code);
  }
  if (status === 0 || (!code && /fetch|network|abort/i.test(error.message ?? ""))) return new LoyaltyError("network");
  return new LoyaltyError("unexpected", code, error.message ?? "");
}

export function asLoyaltyError(e: unknown): LoyaltyError {
  if (e instanceof LoyaltyError) return e;
  if (e instanceof Error && /fetch|network/i.test(e.message)) return new LoyaltyError("network");
  return new LoyaltyError("unexpected", null, e instanceof Error ? e.message : "");
}

export type NextAction =
  | "retry" // réessayer la même demande
  | "edit" // corriger un champ
  | "recover" // retrouver sa carte (lien, personnel)
  | "restart" // recommencer l'inscription
  | "wait" // réessayer plus tard
  | "home"; // retour à la présentation

export type ErrorAdvice = {
  title: string;
  message: string;
  action: NextAction;
  /** Champ concerné, pour afficher l'erreur sous ce champ. */
  field?: "fullName" | "phone";
};

/** Conseil pour une erreur survenue pendant l'inscription. */
export function registrationAdvice(err: LoyaltyError): ErrorAdvice {
  if (err.kind === "network" || err.kind === "timeout") {
    return {
      title: "Connexion interrompue",
      message:
        "Votre demande est gardée sur ce téléphone. Réessayez : si la carte a déjà été créée, vous la retrouverez, sans doublon.",
      action: "retry",
    };
  }
  if (err.kind === "unavailable") {
    return {
      title: "Service momentanément indisponible",
      message: "Le programme Kaytôri Club n'est pas accessible pour le moment. Réessayez plus tard ou demandez au restaurant.",
      action: "wait",
    };
  }
  switch (err.code) {
    case "KL001":
      return { title: "Nom à vérifier", message: "Indiquez votre nom et prénom (2 à 80 caractères).", action: "edit", field: "fullName" };
    case "KL002":
      return { title: "Numéro à vérifier", message: "Indiquez un mobile marocain, par exemple 06 12 34 56 78.", action: "edit", field: "phone" };
    case "KL003":
      return {
        title: "Ce numéro a déjà une carte",
        message: "Si c'est la vôtre, ouvrez-la depuis le lien gardé, ou demandez au restaurant de vous la renvoyer.",
        action: "recover",
      };
    case "KL004":
      return { title: "Programme pas encore ouvert", message: "Le programme Kaytôri Club n'est pas encore ouvert. Revenez bientôt.", action: "home" };
    case "KL012":
      return { title: "Beaucoup de demandes en ce moment", message: "Réessayez dans quelques minutes : votre demande est gardée.", action: "wait" };
    case "KL011":
    case "KL013":
      return { title: "Demande à recommencer", message: "Cette demande n'a pas pu être reprise. Vérifiez vos informations et confirmez à nouveau.", action: "restart" };
    default:
      return {
        title: "La carte n'a pas pu être créée",
        message: "Réessayez dans un instant. Si le problème continue, demandez au restaurant.",
        action: "retry",
      };
  }
}

/** Conseil pour une erreur survenue à l'ouverture de la carte. */
export function cardAdvice(err: LoyaltyError): ErrorAdvice {
  if (err.kind === "network" || err.kind === "timeout") {
    return { title: "Pas de connexion", message: "Votre carte n'a pas pu être chargée. Vérifiez votre connexion et réessayez.", action: "retry" };
  }
  if (err.kind === "business" && err.code === "KL005") {
    return {
      title: "Carte introuvable",
      message: "Ce lien est incomplet ou a été remplacé par un nouveau lien. Demandez au restaurant de vous renvoyer votre carte.",
      action: "recover",
    };
  }
  if (err.kind === "unavailable") {
    return { title: "Service momentanément indisponible", message: "Votre carte n'est pas accessible pour le moment. Réessayez plus tard.", action: "wait" };
  }
  return { title: "Carte indisponible", message: "Votre carte n'a pas pu être affichée. Réessayez dans un instant.", action: "retry" };
}

/** Conseil pour un échange de récompense côté client. */
export function redemptionAdvice(err: LoyaltyError): ErrorAdvice {
  if (err.kind === "network" || err.kind === "timeout") {
    return {
      title: "Connexion interrompue",
      message: "Vérifiez votre connexion et réessayez : vos points ne seront jamais débités deux fois.",
      action: "retry",
    };
  }
  switch (err.code) {
    case "KL006":
      return { title: "Carte suspendue", message: "Les échanges sont suspendus sur cette carte. Adressez-vous au restaurant.", action: "wait" };
    case "KL007":
      return { title: "Solde insuffisant", message: "Votre solde de points ne couvre pas encore cette récompense.", action: "retry" };
    case "KL017":
      return { title: "Récompense indisponible", message: "Cette récompense n'est plus proposée actuellement.", action: "retry" };
    default:
      return { title: "Échange non abouti", message: "L'échange n'a pas pu être validé. Réessayez dans un instant.", action: "retry" };
  }
}

/** Codes après lesquels l'inscription en cours ne peut plus être reprise telle quelle. */
export function endsPendingRegistration(err: LoyaltyError): boolean {
  return err.kind === "business" && ["KL001", "KL002", "KL003", "KL004", "KL011", "KL013"].includes(err.code ?? "");
}
