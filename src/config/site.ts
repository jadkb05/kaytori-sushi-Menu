/** URLs et coordonnées — alignées sur le profil @kaytorisushi. */

export const SITE = {
  name: "Kaytori Sushi",
  nameAccent: "Kaytôri",
  city: "Casablanca",
  tagline: "Une expérience culinaire unique.",
  district: "Les Perles de Californie",

  phoneFixeDisplay: "05 20 02 68 24",
  /** Numéro principal SEO / NAP (footer + JSON-LD d'index.html), confirmé par le restaurant. */
  phoneFixeE164: "212520026824",
  phoneMobileDisplay: "06 75 56 59 13",

  /** Numéro composé par le bouton « Appeler » du header (sans + ni espaces). */
  callE164: "212665801807",
  callDisplay: "06 65 80 18 07",

  /** WhatsApp : ligne mobile (sans + ni espaces) */
  whatsappE164: "212675565913",

  /** Adresse officielle (confirmée par le restaurant), identique au JSON-LD d'index.html. */
  address: "Les Perles de Californie, Mag. 5, Av. Al Hachmi Al Filali, Casablanca",

  instagram: "https://www.instagram.com/kaytorisushi/",

  /** Logo officiel (badge rond 256 px, glyphe centré, coins transparents) : header, footer, chargement, Admin. */
  logoUrl: "/kaytori-logo-2026.webp",

  /** Fiche Google Maps (lien fourni par le restaurant). */
  mapsUrl: "https://maps.app.goo.gl/HPD8cTM8YA4h7HZP8",
  googleReviewsUrl:
    "https://www.google.com/maps/place/KAYT%C3%94RI+SUSHI/@33.5280816,-7.6180753,17z/data=!4m18!1m9!3m8!1s0xda62db0d6bc48fb:0xd46a63a15e06ffb7!2sKAYT%C3%94RI+SUSHI!8m2!3d33.5280816!4d-7.6155004!9m1!1b1!16s%2Fg%2F11xswkn5nh!3m7!1s0xda62db0d6bc48fb:0xd46a63a15e06ffb7!8m2!3d33.5280816!4d-7.6155004!9m1!1b1!16s%2Fg%2F11xswkn5nh?entry=ttu&g_ep=EgoyMDI2MDUwNi4wIKXMDSoASAFQAw%3D%3D",

  /**
   * Horaires confirmés par le restaurant, affichés dans le footer (une seule source de vérité).
   * Doivent rester identiques à openingHoursSpecification du JSON-LD d'index.html.
   */
  hours: [
    { days: "Lundi – Jeudi", range: "12h–23h" },
    { days: "Vendredi – Dimanche", range: "12h–00h" },
  ],
} as const;

/**
 * Lien WhatsApp vers le restaurant. On cible directement api.whatsapp.com/send : la redirection
 * de wa.me remplace les emojis (caractères UTF-8 sur 4 octets, ex. 🙂) par « � ».
 */
export function whatsappHref(message?: string): string {
  const base = `https://api.whatsapp.com/send?phone=${SITE.whatsappE164}`;
  if (!message) return base;
  return `${base}&text=${encodeURIComponent(message)}`;
}
