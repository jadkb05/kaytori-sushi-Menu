/** Données alignées sur captures menu Yumlo (mai 2026) — confirmer sur place si le restaurant met à jour les tarifs. */
export const YUMLO_MENU_URL = "https://yumlo.ma/fr/casablanca/kaytori-cas" as const;

/** Visuel boutique (Yumlo CDN) — bannière menu */
export const YUMLO_STORE_COVER =
  "https://media.yumlo.ma/stores/f8c65915-9001-48c9-afe6-b8195dbe5fe4.jpg?width=1080" as const;

/** Variante de prix (ex. croquettes fromage / poulet / saumon). */
export type YumloMenuVariant = {
  id: string;
  label: string;
  priceMAD: string;
};

export type YumloMenuItem = {
  id: string;
  category: string;
  name: string;
  description: string;
  priceMAD: string;
  currency: string;
  image: string;
  /** Si défini, une seule carte avec choix + prix par option. */
  variants?: readonly YumloMenuVariant[];
};

export const YUMLO_MENU = [
  {
    "id": "66073a8aee",
    "category": "Bentos",
    "name": "Bento D",
    "description": "4 Fry Ebi Fry, 4 Shake Yaki, salade gambas, yakitori Bœuf fromage.",
    "priceMAD": "135.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet36/bento-d.png"
  },
  {
    "id": "6a0c00190c",
    "category": "Bentos",
    "name": "Bento F",
    "description": "4 Croquette saumon, 4 ébi fry, 2 bœuf fromage, 1 ébi tempura, 1 nems poulet.",
    "priceMAD": "129.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet36/bento-f.png"
  },
  {
    "id": "bd099ce53c",
    "category": "Bentos",
    "name": "Bento B",
    "description": "6 Aromaki saumon, salade viet, 4 ébi fry, 4 croquettes saumon.",
    "priceMAD": "129.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet36/bento-b.png"
  },
  {
    "id": "d2ba4b91b8",
    "category": "Bentos",
    "name": "Bento G",
    "description": "1 Nem poulet, 1 gambas pané, salade viet, 4 fry eby fry, riz cantonais crevettes.",
    "priceMAD": "128.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet36/bento-g.png"
  },
  {
    "id": "d570740bae",
    "category": "Bentos",
    "name": "Bento H",
    "description": "Salade veggie, 4 gambas dynamite, 4 California eby fry, wok poulet.",
    "priceMAD": "128.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet36/bento-h.png"
  },
  {
    "id": "b6fe11da37",
    "category": "Starters",
    "name": "Saumon Wakamé Avocat",
    "description": "Saumon",
    "priceMAD": "48.00",
    "currency": "MAD",
    "image": "/starters-hd/saumon-wakame-avocat.png"
  },
  {
    "id": "2a41bacc9f",
    "category": "Starters",
    "name": "Crevettes Tempura 5 pcs",
    "description": "Crevettes",
    "priceMAD": "45.00",
    "currency": "MAD",
    "image": "/starters-hd/crevettes-tempura.png"
  },
  {
    "id": "4bb9d46122",
    "category": "Starters",
    "name": "Crevettes Dynamite",
    "description": "Crevettes",
    "priceMAD": "49.00",
    "currency": "MAD",
    "image": "/starters-hd/crevettes-dynamite.png"
  },
  {
    "id": "3f0f832948",
    "category": "Starters",
    "name": "Saumon Sweet & Sour",
    "description": "Saumon",
    "priceMAD": "49.00",
    "currency": "MAD",
    "image": "/starters-hd/saumon-sweet-sour.png"
  },
  {
    "id": "c4b4c870b0",
    "category": "Starters",
    "name": "Poulet Sweet & Sour",
    "description": "Poulet",
    "priceMAD": "44.00",
    "currency": "MAD",
    "image": "/starters-hd/poulet-sweet-sour.png"
  },
  {
    "id": "8f3c2a91b0",
    "category": "Starters",
    "name": "Croquettes (5 pcs)",
    "description": "Au choix : fromage, poulet ou saumon — sauce maison.",
    "priceMAD": "39.00",
    "currency": "MAD",
    "image": "/starters-hd/croquettes.png",
    "variants": [
      { "id": "fromage", "label": "Fromage", "priceMAD": "39.00" },
      { "id": "poulet", "label": "Poulet", "priceMAD": "39.00" },
      { "id": "saumon", "label": "Saumon", "priceMAD": "49.00" }
    ]
  },
  {
    "id": "a1aee64eaf",
    "category": "Nems & Gyoza & Rouleaux de printemps",
    "name": "Gyoza",
    "description": "4 Pièces — au choix.",
    "priceMAD": "44.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet2/gyoza.png",
    "variants": [
      { "id": "poulet", "label": "Poulet", "priceMAD": "44.00" },
      { "id": "crevettes", "label": "Crevettes", "priceMAD": "54.00" }
    ]
  },
  {
    "id": "a720b7b300",
    "category": "Nems & Gyoza & Rouleaux de printemps",
    "name": "Nems",
    "description": "4 pièces — au choix.",
    "priceMAD": "39.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet2/nems.png",
    "variants": [
      { "id": "poulet", "label": "Poulet", "priceMAD": "39.00" },
      { "id": "crevettes", "label": "Crevettes", "priceMAD": "49.00" },
      { "id": "mixte", "label": "Mixte", "priceMAD": "49.00" }
    ]
  },
  {
    "id": "1842edff6e",
    "category": "Sushi Fusion",
    "name": "Sushi Gratiné",
    "description": "Gratiné au choix — sauce maison.",
    "priceMAD": "78.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet3/sushi-gratine.png",
    "variants": [
      { "id": "gambas", "label": "Gambas", "priceMAD": "78.00" },
      { "id": "saumon-crabe", "label": "Saumon Crabe", "priceMAD": "78.00" },
      { "id": "chicken", "label": "Chicken", "priceMAD": "74.00" }
    ]
  },
  {
    "id": "da6c1fe793",
    "category": "Sushi Fusion",
    "name": "Pizza Saumon Crabe",
    "description": "Saumon, surimi, crabe, avocat, mozzarelle, tobiko 8 Pièces",
    "priceMAD": "59.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet3/pizza-saumon-crabe.png"
  },
  {
    "id": "f6cb920bcd",
    "category": "Sushi Fusion",
    "name": "Pizza Tropicale",
    "description": "Crevettes, mangue, surimi, mozzarelle, tobiko 8 Pièces",
    "priceMAD": "54.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet3/pizza-tropicale.png"
  },
  {
    "id": "0ba6c99141",
    "category": "Sushi Fusion",
    "name": "Pizza Saumon Mozza",
    "description": "Saumon, surimi, mozzarelle, tobiko 8 Pièces",
    "priceMAD": "54.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet3/pizza-saumon-mozza.png"
  },
  {
    "id": "79bda10a6e",
    "category": "Sushi Fusion",
    "name": "Sushi Burger",
    "description": "Riz croustillant, cheese, surimi épicé, goma wakamé, tobiko, sauce japonaise.",
    "priceMAD": "59.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet3/burger.png",
    "variants": [
      { "id": "saumon-avocat", "label": "Saumon Avocat", "priceMAD": "79.00" },
      { "id": "thon-mangue", "label": "Thon Mangue", "priceMAD": "79.00" },
      { "id": "crevettes-avocat", "label": "Crevettes Avocat", "priceMAD": "74.00" }
    ]
  },
  {
    "id": "b6220c2315",
    "category": "Sushi Fusion",
    "name": "Crunchy Burrito",
    "description": "Riz croustillant, cheese, surimi épicé, goma wakamé, tobiko, sauce japonaise.",
    "priceMAD": "59.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet3/crunchy-burrito.png",
    "variants": [
      { "id": "saumon-avocat", "label": "Saumon Avocat", "priceMAD": "79.00" },
      { "id": "thon-mangue", "label": "Thon Mangue", "priceMAD": "79.00" },
      { "id": "crevettes-avocat", "label": "Crevettes Avocat", "priceMAD": "74.00" }
    ]
  },
  {
    "id": "5a7a6c1ff9",
    "category": "Sushi Fusion",
    "name": "Sushi Burrito",
    "description": "Riz, cheese, surimi épicé, goma wakamé, tobiko, sauce japonaise.",
    "priceMAD": "59.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet3/sushi-burrito.png",
    "variants": [
      { "id": "saumon-avocat", "label": "Saumon Avocat", "priceMAD": "79.00" },
      { "id": "thon-mangue", "label": "Thon Mangue", "priceMAD": "79.00" },
      { "id": "crevettes-avocat", "label": "Crevettes Avocat", "priceMAD": "74.00" },
      { "id": "chicken-fry-avocat", "label": "Chicken Fry Avocat", "priceMAD": "69.00" }
    ]
  },
  {
    "id": "76d7875ff7",
    "category": "Nems & Gyoza & Rouleaux de printemps",
    "name": "Rouleaux de Printemps (8 pcs)",
    "description": "Au choix : végétarien, poulet ou crevettes — 8 pièces, sauce au choix.",
    "priceMAD": "39.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet2/rouleau-de-printemps.png",
    "variants": [
      { "id": "vegetarien", "label": "Végétarien", "priceMAD": "29.00" },
      { "id": "poulet", "label": "Poulet", "priceMAD": "39.00" },
      { "id": "crevettes", "label": "Crevettes", "priceMAD": "44.00" }
    ]
  },
  {
    "id": "a043965b0e",
    "category": "Yakitori",
    "name": "Boeuf Fromage Pané 2 pcs",
    "description": "Servi avec du riz",
    "priceMAD": "54.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet4/yakitori-boeuf-fromage-pane.png"
  },
  {
    "id": "99671b537e",
    "category": "Yakitori",
    "name": "Yakitori Bœuf Fromage 2 pcs",
    "description": "Servi avec du riz",
    "priceMAD": "49.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet4/yakitori-boeuf-fromage.png"
  },
  {
    "id": "1dfecb937d",
    "category": "Yakitori",
    "name": "Yakitori Poulet Pané 2 pcs",
    "description": "Servi avec du riz",
    "priceMAD": "44.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet4/yakitori-poulet-pane.png"
  },
  {
    "id": "7cb2b13500",
    "category": "Yakitori",
    "name": "Yakitori Poulet Tsukun 2 pcs",
    "description": "Servi avec du riz",
    "priceMAD": "39.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet4/yakitori-poulet-tsukun.png"
  },
  {
    "id": "261985956b",
    "category": "Soupes",
    "name": "Soupe Tom Kha Kaï",
    "description": "Poulet, lait de coco, tomate cerise, citronnelle, champignon",
    "priceMAD": "54.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet5/soupe-tom-kha-kai.png"
  },
  {
    "id": "fb33c65f0c",
    "category": "Soupes",
    "name": "Soupe Royale",
    "description": "Crevettes, calamar, saumon, boulettes de poulet, surimi, champignon noir, vermicelle, ciboulette",
    "priceMAD": "54.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet5/soupe-royale.png"
  },
  {
    "id": "a03e0a6aff",
    "category": "Soupes",
    "name": "Soupe Tom Yum",
    "description": "Crevettes, pate tom yum, champignon, citronnelle",
    "priceMAD": "54.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet5/soupe-tom-yum.png"
  },
  {
    "id": "1714470567",
    "category": "Soupes",
    "name": "Soupe Fruits de Mer",
    "description": "Crevettes, calamar, saumon, boulettes de poulet, surimi, champignon noir, vermicelle, ciboulette",
    "priceMAD": "54.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet5/soupe-fruits-de-mer.png"
  },
  {
    "id": "58ab2c54d0",
    "category": "Soupes",
    "name": "Soupe Pékinoise",
    "description": "Crevettes, poulet, vermicelle, champignon noir",
    "priceMAD": "49.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet5/soupe-pekinoise.png"
  },
  {
    "id": "4240ad621c",
    "category": "Salades",
    "name": "Salade Royale",
    "description": "Crabe, crevettes, poulet, mangue, avocat, mais, tomate cerise, laitue",
    "priceMAD": "64.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet6/salade-royale.png"
  },
  {
    "id": "2c80cdd361",
    "category": "Salades",
    "name": "Salade Fruits de Mer",
    "description": "Calamar, crevettes, crabe, surimi, mangue, choux, carottes, laitue",
    "priceMAD": "54.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet6/salade-fruits-de-mer.png"
  },
  {
    "id": "c2651f806f",
    "category": "Salades",
    "name": "Salade Tropicale",
    "description": "Crevettes tempura, mangue, épis de maïs, wakamé, pomme, tomate cerise, tobiko, ciboulette",
    "priceMAD": "59.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet6/salade-tropicale.png"
  },
  {
    "id": "b446a7355a",
    "category": "Salades",
    "name": "Salade Exotic Chicken",
    "description": "Poulet pané, avocat, mangue, surimi, épis de mais, tomate cerise, choux, carottes, tobiko",
    "priceMAD": "54.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet6/salade-exotic-chicken.png"
  },
  {
    "id": "fb89c84798",
    "category": "Salades",
    "name": "Salade Vietnamienne",
    "description": "Poulet, crevettes, choux, carottes, cacahuète, germe de soja, concombre, laitue, sauce viet",
    "priceMAD": "54.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet6/salade-vietnamienne.png"
  },
  {
    "id": "743455af94",
    "category": "Poké Bowl",
    "name": "Poké Saumon",
    "description": "Saumon, mangue, avocat, goma wakamé, carottes, tomate cerise, edamame, riz vinaigré",
    "priceMAD": "69.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet7-12/poke-saumon.png"
  },
  {
    "id": "bd77948103",
    "category": "Poké Bowl",
    "name": "Poké Crevettes",
    "description": "Crevettes, mangue, avocat, goma wakamé, carottes, tomate cerise, edamame, riz vinaigré",
    "priceMAD": "65.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet7-12/poke-crevettes.png"
  },
  {
    "id": "5034601de3",
    "category": "Poké Bowl",
    "name": "Poké Poulet",
    "description": "Poulet, mangue, avocat, goma wakamé, carottes, tomate cerise, edamame, riz vinaigré",
    "priceMAD": "59.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet7-12/poke-poulet.png"
  },
  {
    "id": "d4d9f53292",
    "category": "Tartare",
    "name": "Tartare Tropical",
    "description": "Saumon, mangue, avocat, tobiko, ciboulette",
    "priceMAD": "59.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet7-12/tartare-tropical.png"
  },
  {
    "id": "1eef119afb",
    "category": "Tartare",
    "name": "Tartare Saumon Avocat",
    "description": "Saumon, avocat, tobiko, kunafa, ciboulette",
    "priceMAD": "59.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet7-12/tartare-saumon-avocat.png"
  },
  {
    "id": "a2118c7dd7",
    "category": "Chirashi",
    "name": "Chirashi Saumon Avocat",
    "description": "Saumon, avocat",
    "priceMAD": "64.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet7-12/chirashi-saumon-avocat.png"
  },
  {
    "id": "3a8fb1f6ad",
    "category": "Chirashi",
    "name": "Chirashi Mixte",
    "description": "Saumon, thon",
    "priceMAD": "64.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet7-12/chirashi-mixte.png"
  },
  {
    "id": "dbca86e5a4",
    "category": "Sashimi",
    "name": "Sashimi Saumon 4 pcs",
    "description": "Saumon",
    "priceMAD": "34.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet7-12/sashimi-saumon.png"
  },
  {
    "id": "eaa53cd6d3",
    "category": "Sashimi",
    "name": "Sashimi Thon 4 pcs",
    "description": "Thon",
    "priceMAD": "34.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet7-12/sashimi-thon.png"
  },
  {
    "id": "5206f52f84",
    "category": "Carpaccio",
    "name": "Carpaccio Saumon 8 pcs",
    "description": "Saumon",
    "priceMAD": "64.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet7-12/carpaccio-saumon.png"
  },
  {
    "id": "eee25cf62b",
    "category": "Carpaccio",
    "name": "Carpaccio Thon 8 pcs",
    "description": "Thon",
    "priceMAD": "64.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet7-12/carpaccio-thon.png"
  },
  {
    "id": "2505b93cd8",
    "category": "Tacos",
    "name": "Tacos Saumon Avocat 2 pcs",
    "description": "Saumon, avocat, tobiko",
    "priceMAD": "39.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet7-12/tacos-saumon-avocat.png"
  },
  {
    "id": "8101c52f8c",
    "category": "Tacos",
    "name": "Tacos Saumon Epicé 2 pcs",
    "description": "Saumon épicé, poireaux, guacamole, sésame",
    "priceMAD": "39.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet7-12/tacos-saumon-epice.png"
  },
  {
    "id": "b5131a7c46",
    "category": "Tacos",
    "name": "Tacos Gambas Shitaké 2 pcs",
    "description": "Gambas, champignon shitaké, sauce chili",
    "priceMAD": "39.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet7-12/tacos-gambas-shitake.png"
  },
  {
    "id": "0d86283322",
    "category": "Tacos",
    "name": "Tacos Chicken Garlic 2 pcs",
    "description": "Chicken, sauce chili",
    "priceMAD": "34.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet7-12/tacos-chicken-garlic.png"
  },
  {
    "id": "f1773a150f",
    "category": "Crispy Rice",
    "name": "Crispy Rice Saumon Avocat 2 pcs",
    "description": "Saumon, avocat",
    "priceMAD": "34.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet13/crispy-rice-saumon-avocat.png"
  },
  {
    "id": "e624eac353",
    "category": "Crispy Rice",
    "name": "Crispy Rice Ebi Avocat 2 pcs",
    "description": "Crevettes, avocat",
    "priceMAD": "34.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet13/crispy-rice-ebi-avocat.png"
  },
  {
    "id": "b276b0ceb2",
    "category": "Crispy Rice",
    "name": "Crispy Rice Mangue Avocat 2 pcs",
    "description": "Mangue, avocat",
    "priceMAD": "29.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet13/crispy-rice-mangue-avocat.png"
  },
  {
    "id": "d56e6ad4c1",
    "category": "Crispy Rice",
    "name": "Crispy Rice Crunchy Poulet 2 pcs",
    "description": "Poulet",
    "priceMAD": "29.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet13/crispy-rice-crunchy-poulet.png"
  },
  {
    "id": "4cac8d8b4e",
    "category": "Nigiri",
    "name": "Nigiri Saumon Avocat 2 pcs",
    "description": "Saumon, avocat",
    "priceMAD": "39.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet14/nigiri-saumon-avocat.png"
  },
  {
    "id": "0055351351",
    "category": "Nigiri",
    "name": "Nigiri Saumon 2 pcs",
    "description": "Saumon",
    "priceMAD": "34.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet14/nigiri-saumon.png"
  },
  {
    "id": "9467aea043",
    "category": "Nigiri",
    "name": "Nigiri Saumon Braisé 2 pcs",
    "description": "Saumon",
    "priceMAD": "34.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet14/nigiri-saumon-braise.png"
  },
  {
    "id": "742209d9f7",
    "category": "Nigiri",
    "name": "Nigiri Thon 2 pcs",
    "description": "Thon",
    "priceMAD": "34.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet14/nigiri-thon.png"
  },
  {
    "id": "a134dbcb8f",
    "category": "Maki",
    "name": "Maki Saumon Cheese",
    "description": "6 Pièces",
    "priceMAD": "34.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet15/maki-saumon-cheese.png"
  },
  {
    "id": "07f5e99819",
    "category": "Maki",
    "name": "Maki Saumon Avocat",
    "description": "6 Pièces",
    "priceMAD": "34.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet15/maki-saumon-avocat.png"
  },
  {
    "id": "2594bcb7b0",
    "category": "Maki",
    "name": "Maki Eby Fry",
    "description": "6 Pièces",
    "priceMAD": "29.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet15/maki-eby-fry.png"
  },
  {
    "id": "6be7c32896",
    "category": "Maki",
    "name": "Maki Saumon",
    "description": "6 Pièces",
    "priceMAD": "29.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet15/maki-saumon.png"
  },
  {
    "id": "78b88fbc91",
    "category": "Maki",
    "name": "Maki Avocat Cheese",
    "description": "6 Pièces",
    "priceMAD": "26.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet15/maki-avocat-cheese.png"
  },
  {
    "id": "48d9b28c3c",
    "category": "Futomaki",
    "name": "Futomaki Crabe Mango",
    "description": "Crevettes poché, mangue, saumon, crabe, tobiko, cheese 5 Pièces",
    "priceMAD": "58.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet16/futomaki-crabe-mango.png"
  },
  {
    "id": "f5de1461f2",
    "category": "Futomaki",
    "name": "Futomaki Salmon Eby",
    "description": "Saumon, avocat, crevette pané, surimi, tobiko, cheese 5 Pièces",
    "priceMAD": "49.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet16/futomaki-salmon-eby.png"
  },
  {
    "id": "a1051484c6",
    "category": "Futomaki",
    "name": "Futomaki Eby Mango",
    "description": "Crevette pané, avocat, mangue, concombre ciselé, carottes, tobiko, cheese 5 Pièces",
    "priceMAD": "49.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet16/futomaki-eby-mango.png"
  },
  {
    "id": "5f48df3cac",
    "category": "Futomaki",
    "name": "Futomaki Eby Roll",
    "description": "Crevette pochée, surimi, ebi tempura, avocat, cheese 5 Pièces",
    "priceMAD": "49.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet16/futomaki-eby-roll.png"
  },
  {
    "id": "ecc7c8cd38",
    "category": "Futomaki",
    "name": "Futomaki Tobiko Roll",
    "description": "Saumon, avocat, surimi, tobiko, cheese 5 Pièces",
    "priceMAD": "49.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet16/futomaki-tobiko-roll.png"
  },
  {
    "id": "c0a1b2c3d4",
    "category": "California Roll",
    "name": "California Cream Cheese",
    "description": "Saumon, surimi, avocat, tobiko 4 Pièces",
    "priceMAD": "39.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet17/california-cream-cheese.png"
  },
  {
    "id": "d1e2f3a4b5",
    "category": "California Roll",
    "name": "California Classic",
    "description": "Surimi, avocat, concombre, tobiko 4 Pièces",
    "priceMAD": "29.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet17/california-classic.png"
  },
  {
    "id": "e2f3a4b5c6",
    "category": "California Roll",
    "name": "California Shake Yaki",
    "description": "Saumon cuit, avocat, ciboulette 4 Pièces",
    "priceMAD": "34.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet17/california-shake-yaki.png"
  },
  {
    "id": "cc76387393",
    "category": "California Roll",
    "name": "California Saumon Avocat",
    "description": "Saumon, avocat, sésame 4 Pièces",
    "priceMAD": "34.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet17/california-saumon-avocat.png"
  },
  {
    "id": "c6d7e8f9a0",
    "category": "California Roll",
    "name": "California Thon Avocat",
    "description": "Thon, avocat, tobiko 4 Pièces",
    "priceMAD": "39.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet17/california-thon-avocat.png"
  },
  {
    "id": "f3a4b5c6d7",
    "category": "California Roll",
    "name": "California Eby Tobiko",
    "description": "Crevette panée, avocat, tobiko 4 Pièces",
    "priceMAD": "39.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet17/california-eby-tobiko.png"
  },
  {
    "id": "a4b5c6d7e8",
    "category": "California Roll",
    "name": "California Eby Fry",
    "description": "Crevette tempura, avocat, ciboulette 4 Pièces",
    "priceMAD": "34.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet17/california-eby-fry.png"
  },
  {
    "id": "b5c6d7e8f9",
    "category": "California Roll",
    "name": "California Chicken Crispy",
    "description": "Chicken crispy, avocat, tobiko 4 Pièces",
    "priceMAD": "39.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet17/california-chicken-crispy.png"
  },
  {
    "id": "84f445e743",
    "category": "California Roll",
    "name": "California Chicken Eby",
    "description": "Poulet pané, crevette pané, cheese, tobiko 4 Pièces",
    "priceMAD": "48.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet17/california-chicken-eby.png"
  },
  {
    "id": "302c4c0e8a",
    "category": "California Roll",
    "name": "California Nara",
    "description": "Saumon, crevette pané, avocat, cheese 4 Pièces",
    "priceMAD": "48.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet17/california-nara.png"
  },
  {
    "id": "566b2be815",
    "category": "California Roll",
    "name": "California Eby Avocado",
    "description": "Crevette pané, surimi, saumon, cheese, avocat 4 Pièces",
    "priceMAD": "48.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet17/california-eby-avocado.png"
  },
  {
    "id": "79e57587e9",
    "category": "California Roll",
    "name": "California Rainbow",
    "description": "Saumon, avocat, cheese, tobiko 4 Pièces",
    "priceMAD": "48.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet17/california-rainbow.png"
  },
  {
    "id": "712e0027e2",
    "category": "Special Roll",
    "name": "Okinawa Saumon 4 pcs",
    "description": "Saumon, crème d’anguille",
    "priceMAD": "59.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet18/special-okinawa-saumon.png"
  },
  {
    "id": "5ee8246804",
    "category": "Special Roll",
    "name": "Special Unagui Roll",
    "description": "Anguilles, crevettes pané, avocat, cheese 4 Pièces",
    "priceMAD": "64.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet18/special-unagui-roll.png"
  },
  {
    "id": "7412fc4ec3",
    "category": "Special Roll",
    "name": "Special Triangle Roll",
    "description": "Saumon, crevettes pané, crabe, surimi, avocat, tobiko 4 Pièces",
    "priceMAD": "58.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet18/special-triangle-roll.png"
  },
  {
    "id": "f46b03f169",
    "category": "Special Roll",
    "name": "Special Pink Tuna",
    "description": "Thon, surimi pané, crabe, avocat, saumon, tobiko 4 Pièces",
    "priceMAD": "58.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet18/special-pink-tuna.png"
  },
  {
    "id": "7eeb7d6f83",
    "category": "Special Roll",
    "name": "Special Havana Roll",
    "description": "Saumon, crevettes pané, mangue, surimi, cheese, tobiko 4 Pièces",
    "priceMAD": "54.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet18/special-havana-roll.png"
  },
  {
    "id": "a1b2c3d4e6",
    "category": "Special Roll",
    "name": "Special Goma Roll",
    "description": "Saumon, fromage à la crème, sauce 4 Pièces",
    "priceMAD": "49.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet18/special-goma-roll.png"
  },
  {
    "id": "b2c3d4e5f7",
    "category": "Special Roll",
    "name": "Special Gambas Roll",
    "description": "Crevettes, surimi, avocat, tempura 4 Pièces",
    "priceMAD": "49.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet18/special-gambas-roll.png"
  },
  {
    "id": "c3d4e5f6a8",
    "category": "Special Roll",
    "name": "Special Samurai Roll",
    "description": "Saumon, thon, crevettes pané, avocat, sauce 4 Pièces",
    "priceMAD": "54.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet18/special-samurai-roll.png"
  },
  {
    "id": "d4e5f6a7b9",
    "category": "Special Roll",
    "name": "Special Palawan Roll",
    "description": "Saumon, mangue, wakame, thon, fromage 4 Pièces",
    "priceMAD": "58.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet18/special-palawan-roll.png"
  },
  {
    "id": "e5f6a7b8c0",
    "category": "Special Roll",
    "name": "Special Shogun Roll",
    "description": "Saumon, surimi, fromage, tobiko, tempura 4 Pièces",
    "priceMAD": "58.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet18/special-shogun-roll.png"
  },
  {
    "id": "f6a7b8c9d1",
    "category": "Special Roll",
    "name": "Special Kunafa Roll",
    "description": "Crevettes pané, crabe épicé, avocat, mangue, nori 4 Pièces",
    "priceMAD": "49.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet18/special-kunafa-roll.png"
  },
  {
    "id": "a7b8c9d0e2",
    "category": "Special Roll",
    "name": "Special Naruto Roll",
    "description": "Saumon, avocat, crevettes pané, concombre 4 Pièces",
    "priceMAD": "45.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet18/special-naruto-roll.png"
  },
  {
    "id": "11b8f36cb5",
    "category": "Aromaki",
    "name": "Aromaki Ibiza",
    "description": "Saumon, surimi, crevettes pané, avocat, crabe, cheese, tobiko 6 Pièces",
    "priceMAD": "64.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet19/aromaki-ibiza.png"
  },
  {
    "id": "4da542fb7e",
    "category": "Aromaki",
    "name": "Aromaki Kyoto",
    "description": "Saumon, crabe, surimi, mangue, cheese, tobiko 6 Pièces",
    "priceMAD": "59.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet19/aromaki-kyoto.png"
  },
  {
    "id": "be681d7f41",
    "category": "Aromaki",
    "name": "Aromaki Rio",
    "description": "Saumon, surimi, crevettes pané, cheese, tobiko 6 Pièces",
    "priceMAD": "59.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet19/aromaki-rio.png"
  },
  {
    "id": "dabf870bd3",
    "category": "Aromaki",
    "name": "Aromaki Tropicale",
    "description": "Crabe, crevettes pané, avocat, mangue, cheese, tobiko 6 Pièces",
    "priceMAD": "59.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet19/aromaki-tropicale.png"
  },
  {
    "id": "4646423648",
    "category": "Aromaki",
    "name": "Aromaki Honolulu",
    "description": "Saumon, surimi, avocat, saumon mariné, cheese, tobiko 6 Pièces",
    "priceMAD": "59.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet19/aromaki-honolulu.png"
  },
  {
    "id": "e41a8a69ca",
    "category": "Blossom",
    "name": "Blossom Ceviché Roll",
    "description": "Saumon, mangue, avocat, surimi tobiko, sésame 4 pièces",
    "priceMAD": "68.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet20/blossom-ceviche-roll.png"
  },
  {
    "id": "5347977dbc",
    "category": "Blossom",
    "name": "Blossom Hawai",
    "description": "Crevettes pané, crabe, avocat, mangue, cheese, tobiko 4 pièces",
    "priceMAD": "62.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet20/blossom-hawai.png"
  },
  {
    "id": "2d6c4738f9",
    "category": "Blossom",
    "name": "Blossom New York",
    "description": "Saumon pané, crevettes, cheese, tobiko 4 Pièces",
    "priceMAD": "62.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet20/blossom-new-york.png"
  },
  {
    "id": "f84280a0f7",
    "category": "Blossom",
    "name": "Blossom Boston",
    "description": "Crevettes pané, avocat, cheese, crabe, poireaux, tobiko 4 Pièces",
    "priceMAD": "64.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet20/blossom-boston.png"
  },
  {
    "id": "12117b00b9",
    "category": "Blossom",
    "name": "Blossom Eby Roll",
    "description": "Crevettes, saumon, avocat, cheese 4 Pièces",
    "priceMAD": "64.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet20/blossom-eby-roll.png"
  },
  {
    "id": "6c2ba70a6f",
    "category": "Premium",
    "name": "Premium Krabi Roll",
    "description": "Saumon, crevettes pané, surimi crabe, avocat, goma wakamé, cheese 4 Pièces",
    "priceMAD": "85.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet21/premium-krabi-roll.png"
  },
  {
    "id": "c6bf1f1759",
    "category": "Premium",
    "name": "Premium Fuji Roll",
    "description": "Saumon, crevettes pané, saumon cuit, mangue, cheese 4 Pièces",
    "priceMAD": "85.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet21/premium-fuji-roll.png"
  },
  {
    "id": "b1b1b0e1ba",
    "category": "Premium",
    "name": "Premium Pink Salmon",
    "description": "Crevette poché, saumon, surimi crevette pané 4 Pièces",
    "priceMAD": "85.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet21/premium-pink-salmon.png"
  },
  {
    "id": "82bc3899c0",
    "category": "Premium",
    "name": "Premium Exotica Roll",
    "description": "Double crevette pané, saumon, surimi, avocat, goma wakamé 4 Pièces",
    "priceMAD": "85.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet21/premium-exotica-roll.png"
  },
  {
    "id": "2aacef48a6",
    "category": "Premium",
    "name": "Premium Pataya",
    "description": "Double crevette pané, surimi, saumon, mangue, tobiko, ciboulette 4 Pièces",
    "priceMAD": "85.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet21/premium-pataya.png"
  },
  {
    "id": "df7dc34617",
    "category": "Makito Fry",
    "name": "Makito Saumon Epicé",
    "description": "Saumon épicé, fondu de gouda 6 Pièces",
    "priceMAD": "52.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet22/makito-saumon-epice.png"
  },
  {
    "id": "e6820a6ec3",
    "category": "Makito Fry",
    "name": "Makito Crevettes",
    "description": "Crevette mariné, gambas, fondu de gouda 6 Pièces",
    "priceMAD": "49.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet22/makito-crevettes.png"
  },
  {
    "id": "6dd2877aea",
    "category": "Makito Fry",
    "name": "Makito Thon",
    "description": "Thon, fondu de gouda 6 Pièces",
    "priceMAD": "49.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet22/makito-thon.png"
  },
  {
    "id": "df8e4b755c",
    "category": "Crispy Roll",
    "name": "Crispy Red White",
    "description": "Saumon, crevette, poisson, cheese, tobiko 6 Pièces",
    "priceMAD": "62.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet23/crispy-red-white.png"
  },
  {
    "id": "007985588c",
    "category": "Crispy Roll",
    "name": "Crispy Sakura",
    "description": "Saumon, surimi, tobiko, avocat 6 Pièces",
    "priceMAD": "56.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet23/crispy-sakura.png"
  },
  {
    "id": "f0b86623a1",
    "category": "Crispy Roll",
    "name": "Crispy Eby Chicken Fry",
    "description": "Poulet pané, crevette pané, avocat, surimi 6 Pièces",
    "priceMAD": "58.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet23/crispy-eby-chicken-fry.png"
  },
  {
    "id": "deb56ea325",
    "category": "Crispy Roll",
    "name": "Crispy Cheesy Fish",
    "description": "Poisson pané, surimi pané, fondu de gouda 6 pièces",
    "priceMAD": "54.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet23/crispy-cheesy-fish.png"
  },
  {
    "id": "9f730f7289",
    "category": "Crispy Roll",
    "name": "Crispy Saumon Tempura",
    "description": "Saumon tempura, avocat, surimi, cheese, tobiko 6 Pièces",
    "priceMAD": "52.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet23/crispy-saumon-tempura.png"
  },
  {
    "id": "5ec25676a2",
    "category": "Crunchy Roll",
    "name": "Crunchy Saumon Avocat",
    "description": "saumon, surimi, avocat, tobiko, cheese 6 Pièces",
    "priceMAD": "59.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet24/crunchy-saumon-avocat.png"
  },
  {
    "id": "fc97991608",
    "category": "Crunchy Roll",
    "name": "Crunchy Eby Tempura",
    "description": "Crevette pané, saumon, concombre, tobiko, cheese 6 Pièces",
    "priceMAD": "59.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet24/crunchy-eby-tempura.png"
  },
  {
    "id": "b2336232f7",
    "category": "Crunchy Roll",
    "name": "Crunchy Casablanca",
    "description": "Crevettes pané, crabe, mangue, cheese, tobiko 6 Pièces",
    "priceMAD": "59.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet24/crunchy-casablanca.png"
  },
  {
    "id": "b6bb8210a3",
    "category": "Crunchy Roll",
    "name": "Crunchy Tiger Fry",
    "description": "Crevette pané, surimi, avocat, cheese, tobiko 6 Pièces",
    "priceMAD": "59.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet24/crunchy-tiger-fry.png"
  },
  {
    "id": "e8077d2295",
    "category": "Crunchy Roll",
    "name": "Crunchy Dragon Eyes",
    "description": "Saumon, poireaux, carottes, ciboulette, cheese, tobiko 6 Pièces",
    "priceMAD": "55.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet24/crunchy-dragon-eyes.png"
  },
  {
    "id": "083ac320dd",
    "category": "Wok & Thaï",
    "name": "Wok",
    "description": "Nouilles — sauce au choix : oyster, teriyaki, aigre doux, sweet chili.",
    "priceMAD": "49.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet25/wok-nouilles.png",
    "variants": [
      { "id": "vegetarien", "label": "Végétarien", "priceMAD": "49.00" },
      { "id": "poulet", "label": "Poulet", "priceMAD": "59.00" },
      { "id": "boeuf", "label": "Bœuf", "priceMAD": "64.00" },
      { "id": "crevettes", "label": "Crevettes", "priceMAD": "64.00" },
      { "id": "fruits-de-mer", "label": "Fruits de mer", "priceMAD": "74.00" }
    ]
  },
  {
    "id": "0c48c8093e",
    "category": "Wok & Thaï",
    "name": "Vermicelle",
    "description": "Vermicelle — sauce au choix : oyster, teriyaki, aigre doux, sweet chili.",
    "priceMAD": "49.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet25/vermicelle.png",
    "variants": [
      { "id": "vegetarien", "label": "Végétarien", "priceMAD": "49.00" },
      { "id": "poulet", "label": "Poulet", "priceMAD": "59.00" },
      { "id": "boeuf", "label": "Bœuf", "priceMAD": "64.00" },
      { "id": "crevettes", "label": "Crevettes", "priceMAD": "64.00" },
      { "id": "fruits-de-mer", "label": "Fruits de mer", "priceMAD": "74.00" }
    ]
  },
  {
    "id": "5c227884f6",
    "category": "Wok & Thaï",
    "name": "Riz Cantonais",
    "description": "Riz cantonais.",
    "priceMAD": "49.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet25/riz-cantonais.png",
    "variants": [
      { "id": "vegetarien", "label": "Végétarien", "priceMAD": "44.00" },
      { "id": "poulet", "label": "Poulet", "priceMAD": "54.00" },
      { "id": "boeuf", "label": "Bœuf", "priceMAD": "59.00" },
      { "id": "crevettes", "label": "Crevettes", "priceMAD": "64.00" },
      { "id": "fruits-de-mer", "label": "Fruits de mer", "priceMAD": "69.00" }
    ]
  },
  {
    "id": "cd6fcbb51e",
    "category": "Plats Thaï",
    "name": "Boeuf Bulgogi",
    "description": "Boeuf, gingembre, huile de sésame, Ail, sauce cacahuète, cacahuètes (servi avec du riz)",
    "priceMAD": "79.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet26/boeuf-bulgogi.png"
  },
  {
    "id": "36987b1e67",
    "category": "Plats Thaï",
    "name": "Red Curry Thaï",
    "description": "Lait de coco, sauce curry thaï poivrons, champignon, brocolis, carottes, courgettes, échalotes (servi avec du riz)",
    "priceMAD": "64.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet26/red-curry-thai.png",
    "variants": [
      { "id": "poulet", "label": "Poulet", "priceMAD": "69.00" },
      { "id": "boeuf", "label": "Bœuf", "priceMAD": "74.00" },
      { "id": "crevette", "label": "Crevette", "priceMAD": "74.00" },
      { "id": "fruits-de-mer", "label": "Fruits de mer", "priceMAD": "79.00" }
    ]
  },
  {
    "id": "9eba998f82",
    "category": "Plats Thaï",
    "name": "Ananas Aigre Doux",
    "description": "Ananas, poivrons, champignon noir, champignon paris, noix de cajou, sauce aigre doux (servi avec du riz)",
    "priceMAD": "64.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet26/ananas-aigre-doux.png",
    "variants": [
      { "id": "poulet", "label": "Poulet", "priceMAD": "69.00" },
      { "id": "boeuf", "label": "Bœuf", "priceMAD": "74.00" },
      { "id": "crevette", "label": "Crevette", "priceMAD": "74.00" },
      { "id": "fruits-de-mer", "label": "Fruits de mer", "priceMAD": "79.00" }
    ]
  },
  {
    "id": "0755e5b16d",
    "category": "Plats Thaï",
    "name": "Corean Chicken",
    "description": "Poulet caramélisé , servi avec nouilles ou riz sauté aux légumes",
    "priceMAD": "69.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet26/corean-chicken.png"
  },
  {
    "id": "9443eb67b5",
    "category": "Plats Thaï",
    "name": "Saté",
    "description": "servi avec du riz",
    "priceMAD": "69.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet26/sate.png",
    "variants": [
      { "id": "poulet", "label": "Poulet", "priceMAD": "69.00" },
      { "id": "boeuf", "label": "Bœuf", "priceMAD": "74.00" },
      { "id": "crevette", "label": "Crevette", "priceMAD": "74.00" },
      { "id": "fruits-de-mer", "label": "Fruits de mer", "priceMAD": "79.00" }
    ]
  },
  {
    "id": "d99671dda4",
    "category": "Assortiments",
    "name": "Prime Box 16 pcs",
    "description": "6 aromaki saumon, 4 cream cheese, 6 maki saumon.",
    "priceMAD": "119.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet27/assort16-prime-box.png"
  },
  {
    "id": "f7e59011ae",
    "category": "Assortiments",
    "name": "Funny 16 pcs",
    "description": "4 cream cheese, 4 eby fry, 6 maki saumon, 2 nigiri saumon.",
    "priceMAD": "119.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet27/assort16-funny.png"
  },
  {
    "id": "794bc29deb",
    "category": "Assortiments",
    "name": "Eby Lovers 16 pcs",
    "description": "4 pacific, 4 ebi fry, 8 aromaki crevettes.",
    "priceMAD": "119.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet27/assort16-eby-lovers.png"
  },
  {
    "id": "5e0ccaac41",
    "category": "Assortiments",
    "name": "Crunchy Box 16 pcs",
    "description": "4 fry salmon fry, 4 fry ebi fry, 4 croquette poulet, 4 pacific.",
    "priceMAD": "119.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet27/assort16-crunchy-box.png"
  },
  {
    "id": "6515d6b542",
    "category": "Assortiments",
    "name": "California Box 16 pcs",
    "description": "4 classic, 4 chicken crispy, 4 ebi fry, 4 cream cheese.",
    "priceMAD": "119.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet27/assort16-california-box.png"
  },
  {
    "id": "8827d5820f",
    "category": "Assortiments",
    "name": "Aromaki Lovers 24 pcs",
    "description": "6 aromaki saumon, 6 aromaki crevettes, 6 sunchine, 6 spring roll crevettes.",
    "priceMAD": "255.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet28/assort24-aromaki-lovers.png"
  },
  {
    "id": "c9b4e3431d",
    "category": "Assortiments",
    "name": "California Lovers 24 pcs",
    "description": "4 classic, 4 ebi fry, 4 cream cheese, 4 shake yaki, 4 saumon avocat, 4 chicken crispy.",
    "priceMAD": "255.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet28/assort24-california-lovers.png"
  },
  {
    "id": "58c0a31b31",
    "category": "Assortiments",
    "name": "Summer 20 pcs",
    "description": "4 ebi salmon, 4 green tiger, 4 spider, 6 aromaki crevettes, 2 nigiri saumon.",
    "priceMAD": "255.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet28/assort20-summer.png"
  },
  {
    "id": "d2212cb6f2",
    "category": "Assortiments",
    "name": "Crunchy Lovers 24 pcs",
    "description": "8 pizza saumon mozza, 4 crunchy crevettes, 4 croquette poulet, 4 fry salmon fry, 4 pacific.",
    "priceMAD": "255.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet28/assort24-crunchy-lovers.png"
  },
  {
    "id": "941fda2c02",
    "category": "Assortiments",
    "name": "Deluxe 24 pcs",
    "description": "4 classic, 4 ebi fry, 4 maki saumon, 4 fry ebi fry, 4 fry salmon fry, 4 makito saumon épicé.",
    "priceMAD": "255.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet28/assort24-deluxe.png"
  },
  {
    "id": "a39d62353c",
    "category": "Assortiments",
    "name": "Delice 30 pcs",
    "description": "6 classic, 4 ebi fry, 4 shake yaki, 4 cream cheese, 6 maki saumon, 4 aromaki saumon, 2 nigiri saumon.",
    "priceMAD": "235.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet29/assort30-delice.png"
  },
  {
    "id": "0679c0f898",
    "category": "Assortiments",
    "name": "Enjoy Box 30 pcs",
    "description": "4 classic, 4 ebi fry, 4 pacific, 4 fry salmon fry, 6 aromaki crevettes, 6 aromaki saumon, 2 nigiri saumon.",
    "priceMAD": "235.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet29/assort30-enjoy-box.png"
  },
  {
    "id": "267463ea64",
    "category": "Assortiments",
    "name": "Jocker 30 pcs",
    "description": "6 classic, 6 ebi fry, 4 cream cheese, 4 pacific, 6 fry salmon fry, 4 aromaki crevettes.",
    "priceMAD": "235.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet29/assort30-jocker.png"
  },
  {
    "id": "59108b5a10",
    "category": "Assortiments",
    "name": "Gourmet 36 pcs",
    "description": "4 classic, 4 ebi fry, 4 cream cheese, 4 saumon avocat, 4 nara, 4 green tiger, 4 naruto, 4 tahiti, 4 spider.",
    "priceMAD": "295.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet30/assort36-gourmet.png"
  },
  {
    "id": "c800597832",
    "category": "Assortiments",
    "name": "Dream 36 pcs",
    "description": "4 green tiger, 4 Tahiti, 4 naruto, 4 goma roll, 4 spider, 4 eby salmon, 6 aromaki saumon, 6 aromaki crevettes.",
    "priceMAD": "295.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet30/assort36-dream.png"
  },
  {
    "id": "b5dd505e6f",
    "category": "Assortiments",
    "name": "Extasy 40",
    "description": "4 classic, 4 ebi fry, 4 cream cheese, 4 shake yaki, 4 saumon avocat, 4 chicken crispy, 8 fry salmon fry, 8 pacific. (40 pcs)",
    "priceMAD": "295.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet30/assort40-extasy.png"
  },
  {
    "id": "b4a12d5c8c",
    "category": "Assortiments",
    "name": "Fiesta 48 pcs",
    "description": "4 classic, 4 ebi fry, 4 shake yaki, 4 cream cheese, 4 saumon avocat, 4 chicken crispy, 4 pacific, 4 fry salmon fry, 4 fry ebi fry, 6 aromaki saumon, 6 aromaki crevettes.",
    "priceMAD": "355.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet31/assort48-fiesta.png"
  },
  {
    "id": "a4fdedb9b3",
    "category": "Assortiments",
    "name": "Festival 48 pcs",
    "description": "4 classic, 4 ebi fry, 4 shake yaki, 4 cream cheese, 4 saumon avocat, 8 fry salmon fry, 8 fry ebi fry, 4 chicken crispy, 8 makito saumon epicé.",
    "priceMAD": "355.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet31/assort48-festival.png"
  },
  {
    "id": "225dc32819",
    "category": "Assortiments",
    "name": "Happy Box 44 pcs",
    "description": "4 goma roll, 4 Tahiti, 4 green tiger, 4 ebi salmon, 4 bali, 4 spider, 4 maki saumon épicé, 4 naruto, 6 aromaki crevettes, 6 aromaki saumon.",
    "priceMAD": "355.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet31/assort44-happy-box.png"
  },
  {
    "id": "4a3cdf3348",
    "category": "Assortiments",
    "name": "Carnaval 60 pcs",
    "description": "4 classic, 4 ebi fry, 4 cream cheese, 4 shake yaki, 4 saumon avocat, 4 chicken crispy, 4 green tiger, 4 aromaki saumon, 4 ebi salmon, 4 aromaki crevettes, 4 tahiti, 4 naruto, 4 goma roll, 8 spider.",
    "priceMAD": "450.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet32/assort60-carnaval.png"
  },
  {
    "id": "10fc49f9b4",
    "category": "Assortiments",
    "name": "Family Box 60 pcs",
    "description": "4 classic, 4 ebi fry, 4 cream cheese, 4 saumon avocat, 4 green tiger, 4 tahiti, 4 naruto, 4 ebi salmon, 8 fry salmon fry, 8 pacific, 4 aromaki saumon, 8 aromaki crevettes.",
    "priceMAD": "450.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet32/assort60-family-box.png"
  },
  {
    "id": "5c15472d24",
    "category": "Desserts",
    "name": "Cheese Cake Speculos",
    "description": "Cheese Cake Speculos",
    "priceMAD": "39.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet33/dessert-cheese-cake-speculos.png"
  },
  {
    "id": "6038f3931e",
    "category": "Desserts",
    "name": "Cheese Cake Citron",
    "description": "Cheese Cake Citron",
    "priceMAD": "39.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet33/dessert-cheese-cake-citron.png"
  },
  {
    "id": "6bfd43d617",
    "category": "Desserts",
    "name": "Banoffee Pie",
    "description": "Banoffee Pie",
    "priceMAD": "34.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet33/dessert-banoffee-pie.png"
  },
  {
    "id": "787c236c7b",
    "category": "Jus",
    "name": "Jus Exotique",
    "description": "Exotique",
    "priceMAD": "34.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet34/jus-exotique.png"
  },
  {
    "id": "fde993538f",
    "category": "Jus",
    "name": "Jus Fraise",
    "description": "Fraise",
    "priceMAD": "32.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet34/jus-fraise.png"
  },
  {
    "id": "2b9993080d",
    "category": "Jus",
    "name": "Jus Ananas",
    "description": "Ananas",
    "priceMAD": "32.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet34/jus-ananas.png"
  },
  {
    "id": "a2b893eb78",
    "category": "Jus",
    "name": "Jus Mangue",
    "description": "Mangue",
    "priceMAD": "32.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet34/jus-mangue.png"
  },
  {
    "id": "cb223847c5",
    "category": "Jus",
    "name": "Jus Kiwi",
    "description": "Kiwi",
    "priceMAD": "32.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet34/jus-kiwi.png"
  },
  {
    "id": "0229f0431e",
    "category": "Boissons",
    "name": "Coca Cola",
    "description": "33 cl",
    "priceMAD": "15.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet35/boisson-coca-cola.png"
  },
  {
    "id": "8e12069c86",
    "category": "Boissons",
    "name": "Coca Cola Zéro",
    "description": "33 cl",
    "priceMAD": "15.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet35/boisson-coca-cola-zero.png"
  },
  {
    "id": "4750e9d01c",
    "category": "Boissons",
    "name": "Sprite",
    "description": "33 cl",
    "priceMAD": "15.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet35/boisson-sprite.png"
  },
  {
    "id": "cf01bd2066",
    "category": "Boissons",
    "name": "Hawai",
    "description": "33 cl",
    "priceMAD": "15.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet35/boisson-hawai.png"
  },
  {
    "id": "5b62bf8e93",
    "category": "Boissons",
    "name": "Poms",
    "description": "33 cl",
    "priceMAD": "15.00",
    "currency": "MAD",
    "image": "/menu-hd-onglet35/boisson-poms.png"
  }
] as const satisfies readonly YumloMenuItem[];

/** Onglets menu — ordre fixe demandé par le client. */
export const YUMLO_CATEGORIES = [
  "Starters",
  "Nems & Gyoza & Rouleaux de printemps",
  "Sushi Fusion",
  "Yakitori",
  "Soupes",
  "Salades",
  "Poké Bowl",
  "Tartare",
  "Chirashi",
  "Sashimi",
  "Carpaccio",
  "Tacos",
  "Crispy Rice",
  "Nigiri",
  "Maki",
  "Futomaki",
  "California Roll",
  "Special Roll",
  "Aromaki",
  "Blossom",
  "Premium",
  "Makito Fry",
  "Crispy Roll",
  "Crunchy Roll",
  "Wok & Thaï",
  "Bentos",
  "Plats Thaï",
  "Assortiments",
  "Desserts",
  "Jus",
  "Boissons",
] as const;
