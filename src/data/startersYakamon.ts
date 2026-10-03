/**
 * Starters — visuels fournis par le client (WhatsApp 13.25.57), servis depuis /public/starters-hd/.
 * Les PNG dans `public/starters-hd/` sont copiés depuis les assets projet ; pour remplacer, écrase ces fichiers.
 */
export type YakamonStarter = {
  id: string;
  name: string;
  description: string;
  priceMAD: string;
  currency: "MAD";
  image: string;
};

export const YAKAMON_STARTERS = [
  {
    id: "b6fe11da37",
    name: "Saumon Wakamé Avocat",
    description: "Saumon frais, salade wakamé, avocat, graines de sésame.",
    priceMAD: "48.00",
    currency: "MAD" as const,
    image: "/starters-hd/saumon-wakame-avocat.png",
  },
  {
    id: "2a41bacc9f",
    name: "Crevettes Tempura 5 pcs",
    description: "Cinq crevettes en tempura croustillantes, légumes de saison.",
    priceMAD: "45.00",
    currency: "MAD" as const,
    image: "/starters-hd/crevettes-tempura.png",
  },
  {
    id: "4bb9d46122",
    name: "Crevettes Dynamite",
    description: "Crevettes frites, sauce dynamite maison, oignons frits.",
    priceMAD: "49.00",
    currency: "MAD" as const,
    image: "/starters-hd/crevettes-dynamite.png",
  },
  {
    id: "3f0f832948",
    name: "Saumon Sweet & Sour",
    description: "Morceaux de saumon croustillants, sauce aigre-douce, légumes.",
    priceMAD: "49.00",
    currency: "MAD" as const,
    image: "/starters-hd/saumon-sweet-sour.png",
  },
  {
    id: "c4b4c870b0",
    name: "Poulet Sweet & Sour",
    description: "Poulet pané, sauce sweet & sour, poivrons et germes de soja.",
    priceMAD: "44.00",
    currency: "MAD" as const,
    image: "/starters-hd/poulet-sweet-sour.png",
  },
  {
    id: "8f3c2a91b0",
    name: "Croquettes (5 pcs)",
    description: "Fromage, poulet ou saumon — sauce maison.",
    priceMAD: "39.00",
    currency: "MAD" as const,
    image: "/starters-hd/croquettes.png",
  },
] as const satisfies readonly YakamonStarter[];

/** Photos HD pour les starters (prioritaires dans le menu en ligne). */
export const STARTER_IMAGE_URL_BY_ID: Record<string, string> = Object.fromEntries(
  YAKAMON_STARTERS.map((s) => [s.id, s.image]),
);
