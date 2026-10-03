/** URLs et coordonnées — alignées sur le profil @kaytorisushi. */

export const SITE = {
  name: "Kaytori Sushi",
  nameAccent: "Kaytôri",
  city: "Casablanca",
  tagline: "Une expérience culinaire unique.",
  district: "Les Perles de Californie",

  phoneFixeDisplay: "05 20 02 68 24",
  phoneMobileDisplay: "06 75 56 59 13",

  /** Numéro composé par le bouton « Appeler » du header (sans + ni espaces). */
  callE164: "212665801807",
  callDisplay: "06 65 80 18 07",

  /** WhatsApp : ligne mobile (sans + ni espaces) */
  whatsappE164: "212675565913",

  address: "Les Perles de Californie, Mag 5 Av. Al Hachimi Al Filali, Casablanca",

  instagram: "https://www.instagram.com/kaytorisushi/",

  /** Logo officiel nettoyé et centré (fond extérieur transparent) */
  logoUrl: "/kaytori-logo-clean.png",

  mapsUrl: "https://maps.app.goo.gl/gmXPPxTwrmFtF1U36",
  googleReviewsUrl:
    "https://www.google.com/maps/place/KAYT%C3%94RI+SUSHI/@33.5280816,-7.6180753,17z/data=!4m18!1m9!3m8!1s0xda62db0d6bc48fb:0xd46a63a15e06ffb7!2sKAYT%C3%94RI+SUSHI!8m2!3d33.5280816!4d-7.6155004!9m1!1b1!16s%2Fg%2F11xswkn5nh!3m7!1s0xda62db0d6bc48fb:0xd46a63a15e06ffb7!8m2!3d33.5280816!4d-7.6155004!9m1!1b1!16s%2Fg%2F11xswkn5nh?entry=ttu&g_ep=EgoyMDI2MDUwNi4wIKXMDSoASAFQAw%3D%3D",

  /** Horaires affichés dans le header du menu (une seule source de vérité) */
  hoursWeekdays: "12h – 23h",
  hoursWeekend: "12h – minuit",
} as const;

export function whatsappHref(message?: string): string {
  const base = `https://wa.me/${SITE.whatsappE164}`;
  if (!message) return base;
  return `${base}?text=${encodeURIComponent(message)}`;
}
