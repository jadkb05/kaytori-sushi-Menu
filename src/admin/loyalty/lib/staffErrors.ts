/**
 * Erreurs vues par le personnel : ce qui s'est passé et quoi faire ensuite, sans message technique.
 * Codes : voir l'en-tête de supabase/migrations/20261026120000_loyalty.sql.
 */
import { LoyaltyError, asLoyaltyError } from "../../../loyalty/lib/errors";

export type StaffAdvice = {
  title: string;
  message: string;
  /** retry : même demande à renvoyer (même identifiant, jamais comptée deux fois). reload : relire la fiche. */
  action: "retry" | "reload" | "edit" | "none";
  field?: "fullName" | "phone" | "reason" | "query" | "ticket" | "points";
};

export function staffAdvice(e: unknown): StaffAdvice {
  const err: LoyaltyError = asLoyaltyError(e);
  if (err.kind === "network" || err.kind === "timeout") {
    return {
      title: err.kind === "timeout" ? "Pas de réponse" : "Connexion interrompue",
      message: "Réessayez : si l'opération a déjà été enregistrée, elle ne sera pas comptée deux fois.",
      action: "retry",
    };
  }
  if (err.code === "42501") {
    return { title: "Accès refusé", message: "Ce compte n'a pas les droits requis pour cette opération.", action: "none" };
  }
  if (err.kind === "unavailable") {
    return { title: "Fidélité indisponible", message: "Le service de fidélité ne répond pas pour le moment. Réessayez plus tard.", action: "retry" };
  }
  switch (err.code) {
    case "KL001":
      return { title: "Nom à vérifier", message: "Indiquez le nom et prénom (2 à 80 caractères).", action: "edit", field: "fullName" };
    case "KL002":
      return { title: "Numéro à vérifier", message: "Indiquez un mobile marocain, par exemple 06 12 34 56 78.", action: "edit", field: "phone" };
    case "KL003":
      return { title: "Numéro déjà utilisé", message: "Ce numéro a déjà une autre carte de fidélité. Rien n'a été modifié.", action: "edit", field: "phone" };
    case "KL004":
      return {
        title: "Programme fermé",
        message: "Aucun point ne peut être attribué tant que le programme est fermé. Les récompenses déjà gagnées restent utilisables.",
        action: "none",
      };
    case "KL005":
      return { title: "Carte introuvable", message: "Aucune carte ne correspond. Vérifiez le code ou recherchez le client par son nom.", action: "none" };
    case "KL006":
      return { title: "Carte suspendue", message: "Aucune opération n'est possible sur cette carte. Seul le responsable peut la réactiver.", action: "none" };
    case "KL007":
      return { title: "Solde de points insuffisant", message: "Le solde de la carte ne permet pas cette opération ou cet échange.", action: "reload" };
    case "KL008":
      return { title: "Déjà corrigée", message: "Cette opération a déjà été corrigée. L'historique a été relu.", action: "reload" };
    case "KL009":
      return {
        title: "Correction impossible pour l'instant",
        message: "Ces points ont déjà été utilisés pour une récompense. Annulez d'abord l'échange de récompense concerné.",
        action: "reload",
      };
    case "KL010":
      return { title: "Motif obligatoire", message: "Indiquez le motif en quelques mots (3 à 300 caractères).", action: "edit", field: "reason" };
    case "KL011":
      return { title: "Demande à recommencer", message: "Cette demande n'a pas pu être reprise. Relancez l'opération.", action: "reload" };
    case "KL012":
      return { title: "Trop de demandes", message: "Réessayez dans quelques minutes.", action: "none" };
    case "KL013":
      return { title: "Demande invalide", message: "Vérifiez les valeurs saisies et recommencez.", action: "edit", field: "query" };
    case "KL014":
      return {
        title: "Seuil ou plafond atteint",
        message: err.message || "Le montant du ticket est inférieur au minimum requis ou dépasse le plafond autorisé.",
        action: "edit",
        field: "ticket",
      };
    case "KL015":
      return {
        title: "Session expirée",
        message: "La session rapide a expiré ou ne correspond pas à cette carte. Ressaisissez le code secret.",
        action: "reload",
      };
    case "KL016":
      return {
        title: "Programme à configurer",
        message: "Le taux d'attribution des points ou le code secret QR n'a pas encore été défini dans les paramètres.",
        action: "none",
      };
    case "KL017":
      return {
        title: "Récompense indisponible",
        message: "Cette récompense est désactivée ou introuvable.",
        action: "reload",
      };
    default:
      return { title: "Opération non aboutie", message: "Réponse inattendue du service. Relisez la fiche avant de recommencer.", action: "reload" };
  }
}

/**
 * Pré-contrôle de la recherche (mêmes seuils que loyalty_search, qui reste juge) : évite un appel
 * voué à l'échec pendant la frappe. null = recherche acceptable.
 */
export function searchQueryProblem(raw: string): string | null {
  const q = raw.trim();
  if (q === "") return null;
  if (q.length > 80) return "Recherche trop longue.";
  if (!/[^0-9\s+().-]/.test(q)) {
    let digits = q.replace(/\D/g, "");
    if (digits.startsWith("00212")) digits = `0${digits.slice(5)}`;
    else if (digits.startsWith("212") && digits.length > 3) digits = `0${digits.slice(3)}`;
    return digits.length < 3 ? "Saisissez au moins 3 chiffres du numéro." : null;
  }
  const letters = q.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[\s\-'’`´.]/g, "");
  return letters.length < 2 ? "Saisissez au moins 2 lettres du nom." : null;
}
