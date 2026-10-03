/**
 * Mapping des images locales personnalisées par plat.
 * Clé : id du plat dans yumloMenu.ts
 */

/** Photos individuelles HD fournies par le client (mode rond) */
export const CLIENT_DISH_IMAGES: Record<string, string> = {
  // Nems & Gyoza & Rouleaux de printemps (visuels client WhatsApp 13.27.28)
  "a720b7b300": "/menu-hd-onglet2/nems.png",
  "a1aee64eaf": "/menu-hd-onglet2/gyoza.png",
  "76d7875ff7": "/menu-hd-onglet2/rouleau-de-printemps.png",

  // Sushi Fusion — visuels client WhatsApp 13.28.07
  "1842edff6e": "/menu-hd-onglet3/sushi-gratine.png",
  "da6c1fe793": "/menu-hd-onglet3/pizza-saumon-crabe.png",
  "f6cb920bcd": "/menu-hd-onglet3/pizza-tropicale.png",
  "0ba6c99141": "/menu-hd-onglet3/pizza-saumon-mozza.png",
  "79bda10a6e": "/menu-hd-onglet3/burger.png",
  "b6220c2315": "/menu-hd-onglet3/crunchy-burrito.png",
  "5a7a6c1ff9": "/menu-hd-onglet3/sushi-burrito.png",

  // Yakitori — visuels client WhatsApp 13.28.07 (_7–_10)
  "99671b537e": "/menu-hd-onglet4/yakitori-boeuf-fromage.png",
  "1dfecb937d": "/menu-hd-onglet4/yakitori-poulet-pane.png",
  "7cb2b13500": "/menu-hd-onglet4/yakitori-poulet-tsukun.png",
  "a043965b0e": "/menu-hd-onglet4/yakitori-boeuf-fromage-pane.png",

  // Soupes — visuels client WhatsApp 13.28.08
  "58ab2c54d0": "/menu-hd-onglet5/soupe-pekinoise.png",
  "261985956b": "/menu-hd-onglet5/soupe-tom-kha-kai.png",
  "fb33c65f0c": "/menu-hd-onglet5/soupe-royale.png",
  "a03e0a6aff": "/menu-hd-onglet5/soupe-tom-yum.png",
  "1714470567": "/menu-hd-onglet5/soupe-fruits-de-mer.png",

  // Salades — visuels client WhatsApp 13.28.08 (_5–_9)
  "4240ad621c": "/menu-hd-onglet6/salade-royale.png",
  "b446a7355a": "/menu-hd-onglet6/salade-exotic-chicken.png",
  "c2651f806f": "/menu-hd-onglet6/salade-tropicale.png",
  "2c80cdd361": "/menu-hd-onglet6/salade-fruits-de-mer.png",
  "fb89c84798": "/menu-hd-onglet6/salade-vietnamienne.png",

  // Poké Bowl — WhatsApp 13.31.26
  "743455af94": "/menu-hd-onglet7-12/poke-saumon.png",
  "bd77948103": "/menu-hd-onglet7-12/poke-crevettes.png",
  "5034601de3": "/menu-hd-onglet7-12/poke-poulet.png",

  // Tartare
  "d4d9f53292": "/menu-hd-onglet7-12/tartare-tropical.png",
  "1eef119afb": "/menu-hd-onglet7-12/tartare-saumon-avocat.png",

  // Chirashi
  "a2118c7dd7": "/menu-hd-onglet7-12/chirashi-saumon-avocat.png",
  "3a8fb1f6ad": "/menu-hd-onglet7-12/chirashi-mixte.png",

  // Sashimi
  "dbca86e5a4": "/menu-hd-onglet7-12/sashimi-saumon.png",
  "eaa53cd6d3": "/menu-hd-onglet7-12/sashimi-thon.png",

  // Carpaccio
  "5206f52f84": "/menu-hd-onglet7-12/carpaccio-saumon.png",
  "eee25cf62b": "/menu-hd-onglet7-12/carpaccio-thon.png",

  // Tacos
  "2505b93cd8": "/menu-hd-onglet7-12/tacos-saumon-avocat.png",
  "8101c52f8c": "/menu-hd-onglet7-12/tacos-saumon-epice.png",
  "b5131a7c46": "/menu-hd-onglet7-12/tacos-gambas-shitake.png",
  "0d86283322": "/menu-hd-onglet7-12/tacos-chicken-garlic.png",

  // Crispy Rice — WhatsApp 14.32.30 (onglet 13)
  "f1773a150f": "/menu-hd-onglet13/crispy-rice-saumon-avocat.png",
  "e624eac353": "/menu-hd-onglet13/crispy-rice-ebi-avocat.png",
  "b276b0ceb2": "/menu-hd-onglet13/crispy-rice-mangue-avocat.png",
  "d56e6ad4c1": "/menu-hd-onglet13/crispy-rice-crunchy-poulet.png",

  // Nigiri — WhatsApp 14.32.30 (_4–_7)
  "4cac8d8b4e": "/menu-hd-onglet14/nigiri-saumon-avocat.png",
  "0055351351": "/menu-hd-onglet14/nigiri-saumon.png",
  "9467aea043": "/menu-hd-onglet14/nigiri-saumon-braise.png",
  "742209d9f7": "/menu-hd-onglet14/nigiri-thon.png",

  // Maki — WhatsApp 14.32.30 / 14.32.31
  "a134dbcb8f": "/menu-hd-onglet15/maki-saumon-cheese.png",
  "07f5e99819": "/menu-hd-onglet15/maki-saumon-avocat.png",
  "2594bcb7b0": "/menu-hd-onglet15/maki-eby-fry.png",
  "6be7c32896": "/menu-hd-onglet15/maki-saumon.png",
  "78b88fbc91": "/menu-hd-onglet15/maki-avocat-cheese.png",

  // Futomaki — WhatsApp 14.32.31 (_5–_12)
  "48d9b28c3c": "/menu-hd-onglet16/futomaki-crabe-mango.png",
  "f5de1461f2": "/menu-hd-onglet16/futomaki-salmon-eby.png",
  "a1051484c6": "/menu-hd-onglet16/futomaki-eby-mango.png",
  "5f48df3cac": "/menu-hd-onglet16/futomaki-eby-roll.png",
  "ecc7c8cd38": "/menu-hd-onglet16/futomaki-tobiko-roll.png",

  // California Roll — WhatsApp 14.32.31 (lot complet + extensions carte)
  "c0a1b2c3d4": "/menu-hd-onglet17/california-cream-cheese.png",
  "d1e2f3a4b5": "/menu-hd-onglet17/california-classic.png",
  "e2f3a4b5c6": "/menu-hd-onglet17/california-shake-yaki.png",
  "cc76387393": "/menu-hd-onglet17/california-saumon-avocat.png",
  "c6d7e8f9a0": "/menu-hd-onglet17/california-thon-avocat.png",
  "f3a4b5c6d7": "/menu-hd-onglet17/california-eby-tobiko.png",
  "a4b5c6d7e8": "/menu-hd-onglet17/california-eby-fry.png",
  "b5c6d7e8f9": "/menu-hd-onglet17/california-chicken-crispy.png",
  "84f445e743": "/menu-hd-onglet17/california-chicken-eby.png",
  "302c4c0e8a": "/menu-hd-onglet17/california-nara.png",
  "566b2be815": "/menu-hd-onglet17/california-eby-avocado.png",
  "79e57587e9": "/menu-hd-onglet17/california-rainbow.png",

  // Special Roll — WhatsApp 14.32.32 (lot complet carte)
  "712e0027e2": "/menu-hd-onglet18/special-okinawa-saumon.png",
  "5ee8246804": "/menu-hd-onglet18/special-unagui-roll.png",
  "7412fc4ec3": "/menu-hd-onglet18/special-triangle-roll.png",
  "f46b03f169": "/menu-hd-onglet18/special-pink-tuna.png",
  "7eeb7d6f83": "/menu-hd-onglet18/special-havana-roll.png",
  "a1b2c3d4e6": "/menu-hd-onglet18/special-goma-roll.png",
  "b2c3d4e5f7": "/menu-hd-onglet18/special-gambas-roll.png",
  "c3d4e5f6a8": "/menu-hd-onglet18/special-samurai-roll.png",
  "d4e5f6a7b9": "/menu-hd-onglet18/special-palawan-roll.png",
  "e5f6a7b8c0": "/menu-hd-onglet18/special-shogun-roll.png",
  "f6a7b8c9d1": "/menu-hd-onglet18/special-kunafa-roll.png",
  "a7b8c9d0e2": "/menu-hd-onglet18/special-naruto-roll.png",

  // Aromaki — captures produit Yumlo 15-53 (145px, miniatures officielles)
  "11b8f36cb5": "/menu-hd-onglet19/aromaki-ibiza.png",
  "4da542fb7e": "/menu-hd-onglet19/aromaki-kyoto.png",
  "be681d7f41": "/menu-hd-onglet19/aromaki-rio.png",
  "dabf870bd3": "/menu-hd-onglet19/aromaki-tropicale.png",
  "4646423648": "/menu-hd-onglet19/aromaki-honolulu.png",

  // Blossom — captures produit Yumlo 15-57 (miniatures)
  "e41a8a69ca": "/menu-hd-onglet20/blossom-ceviche-roll.png",
  "5347977dbc": "/menu-hd-onglet20/blossom-hawai.png",
  "2d6c4738f9": "/menu-hd-onglet20/blossom-new-york.png",
  "f84280a0f7": "/menu-hd-onglet20/blossom-boston.png",
  "12117b00b9": "/menu-hd-onglet20/blossom-eby-roll.png",

  // Premium — captures produit Yumlo 15-58 / 15-59 (miniatures)
  "6c2ba70a6f": "/menu-hd-onglet21/premium-krabi-roll.png",
  "c6bf1f1759": "/menu-hd-onglet21/premium-fuji-roll.png",
  "b1b1b0e1ba": "/menu-hd-onglet21/premium-pink-salmon.png",
  "82bc3899c0": "/menu-hd-onglet21/premium-exotica-roll.png",
  "2aacef48a6": "/menu-hd-onglet21/premium-pataya.png",

  // Makito Fry — captures Yumlo 15-59 (miniatures)
  "df7dc34617": "/menu-hd-onglet22/makito-saumon-epice.png",
  "e6820a6ec3": "/menu-hd-onglet22/makito-crevettes.png",
  "6dd2877aea": "/menu-hd-onglet22/makito-thon.png",

  // Crispy Roll — captures Yumlo 16-00 (miniatures)
  "df8e4b755c": "/menu-hd-onglet23/crispy-red-white.png",
  "007985588c": "/menu-hd-onglet23/crispy-sakura.png",
  "f0b86623a1": "/menu-hd-onglet23/crispy-eby-chicken-fry.png",
  "deb56ea325": "/menu-hd-onglet23/crispy-cheesy-fish.png",
  "9f730f7289": "/menu-hd-onglet23/crispy-saumon-tempura.png",

  // Crunchy Roll — captures Yumlo 16-01 (miniatures)
  "5ec25676a2": "/menu-hd-onglet24/crunchy-saumon-avocat.png",
  "fc97991608": "/menu-hd-onglet24/crunchy-eby-tempura.png",
  "b2336232f7": "/menu-hd-onglet24/crunchy-casablanca.png",
  "b6bb8210a3": "/menu-hd-onglet24/crunchy-tiger-fry.png",
  "e8077d2295": "/menu-hd-onglet24/crunchy-dragon-eyes.png",

  // Wok & Thaï — captures Yumlo 16-02 (miniatures)
  "083ac320dd": "/menu-hd-onglet25/wok-nouilles.png",
  "0c48c8093e": "/menu-hd-onglet25/vermicelle.png",
  "5c227884f6": "/menu-hd-onglet25/riz-cantonais.png",

  // Plats Thaï (hors Bentos) — captures Yumlo 16-03 (miniatures)
  "cd6fcbb51e": "/menu-hd-onglet26/boeuf-bulgogi.png",
  "36987b1e67": "/menu-hd-onglet26/red-curry-thai.png",
  "9eba998f82": "/menu-hd-onglet26/ananas-aigre-doux.png",
  "0755e5b16d": "/menu-hd-onglet26/corean-chicken.png",
  "9443eb67b5": "/menu-hd-onglet26/sate.png",

  // Assortiments 16 pcs — captures Yumlo 16-04 / 16-05 (miniatures)
  "d99671dda4": "/menu-hd-onglet27/assort16-prime-box.png",
  "f7e59011ae": "/menu-hd-onglet27/assort16-funny.png",
  "794bc29deb": "/menu-hd-onglet27/assort16-eby-lovers.png",
  "5e0ccaac41": "/menu-hd-onglet27/assort16-crunchy-box.png",
  "6515d6b542": "/menu-hd-onglet27/assort16-california-box.png",

  // Assortiments 24 pcs — captures Yumlo 16-05 (miniatures)
  "8827d5820f": "/menu-hd-onglet28/assort24-aromaki-lovers.png",
  "c9b4e3431d": "/menu-hd-onglet28/assort24-california-lovers.png",
  "d2212cb6f2": "/menu-hd-onglet28/assort24-crunchy-lovers.png",
  "941fda2c02": "/menu-hd-onglet28/assort24-deluxe.png",
  "58c0a31b31": "/menu-hd-onglet28/assort20-summer.png",

  // Assortiments 30 pcs — captures Yumlo 16-06 (miniatures)
  "a39d62353c": "/menu-hd-onglet29/assort30-delice.png",
  "0679c0f898": "/menu-hd-onglet29/assort30-enjoy-box.png",
  "267463ea64": "/menu-hd-onglet29/assort30-jocker.png",

  // Assortiments 36 pcs (+ Extasy 40 même page Yumlo) — captures 16-06
  "59108b5a10": "/menu-hd-onglet30/assort36-gourmet.png",
  "c800597832": "/menu-hd-onglet30/assort36-dream.png",
  "b5dd505e6f": "/menu-hd-onglet30/assort40-extasy.png",

  // Assortiments 48 pcs (+ Happy Box 44 même page Yumlo) — captures 16-07
  "b4a12d5c8c": "/menu-hd-onglet31/assort48-fiesta.png",
  "a4fdedb9b3": "/menu-hd-onglet31/assort48-festival.png",
  "225dc32819": "/menu-hd-onglet31/assort44-happy-box.png",

  // Assortiments 60 pcs — captures Yumlo 16-07
  "4a3cdf3348": "/menu-hd-onglet32/assort60-carnaval.png",
  "10fc49f9b4": "/menu-hd-onglet32/assort60-family-box.png",

  // Desserts — captures Yumlo 16-08 (miniatures)
  "5c15472d24": "/menu-hd-onglet33/dessert-cheese-cake-speculos.png",
  "6038f3931e": "/menu-hd-onglet33/dessert-cheese-cake-citron.png",
  "6bfd43d617": "/menu-hd-onglet33/dessert-banoffee-pie.png",

  // Jus — captures Yumlo 16-08 (miniatures)
  "787c236c7b": "/menu-hd-onglet34/jus-exotique.png",
  "fde993538f": "/menu-hd-onglet34/jus-fraise.png",
  "2b9993080d": "/menu-hd-onglet34/jus-ananas.png",
  "a2b893eb78": "/menu-hd-onglet34/jus-mangue.png",
  "cb223847c5": "/menu-hd-onglet34/jus-kiwi.png",

  // Boissons — captures Yumlo 16-08 / 16-09 (miniatures)
  "0229f0431e": "/menu-hd-onglet35/boisson-coca-cola.png",
  "8e12069c86": "/menu-hd-onglet35/boisson-coca-cola-zero.png",
  "4750e9d01c": "/menu-hd-onglet35/boisson-sprite.png",
  "cf01bd2066": "/menu-hd-onglet35/boisson-hawai.png",
  "5b62bf8e93": "/menu-hd-onglet35/boisson-poms.png",

  // Bentos — captures Yumlo 16-35 (miniatures, alignées CUSTOM_DISH_IMAGES)
  "66073a8aee": "/menu-hd-onglet36/bento-d.png",
  "6a0c00190c": "/menu-hd-onglet36/bento-f.png",
  "bd099ce53c": "/menu-hd-onglet36/bento-b.png",
  "d2ba4b91b8": "/menu-hd-onglet36/bento-g.png",
  "d570740bae": "/menu-hd-onglet36/bento-h.png",
};

/**
 * Photos rectangulaires (Bentos, Assortiments) — miniatures Yumlo ou PDF.
 * Mode d'affichage rectangulaire 4:3 (plateaux entiers).
 */
export const CUSTOM_DISH_IMAGES: Record<string, string> = {
  // Bentos — captures Yumlo 16-35 (miniatures)
  "66073a8aee": "/menu-hd-onglet36/bento-d.png",
  "6a0c00190c": "/menu-hd-onglet36/bento-f.png",
  "bd099ce53c": "/menu-hd-onglet36/bento-b.png",
  "d2ba4b91b8": "/menu-hd-onglet36/bento-g.png",
  "d570740bae": "/menu-hd-onglet36/bento-h.png",

  // Assortiments 16 pcs (alignés sur CLIENT_DISH_IMAGES — miniatures Yumlo)
  "d99671dda4": "/menu-hd-onglet27/assort16-prime-box.png",
  "f7e59011ae": "/menu-hd-onglet27/assort16-funny.png",
  "794bc29deb": "/menu-hd-onglet27/assort16-eby-lovers.png",
  "5e0ccaac41": "/menu-hd-onglet27/assort16-crunchy-box.png",
  "6515d6b542": "/menu-hd-onglet27/assort16-california-box.png",

  // Assortiments 24 pcs (alignés sur CLIENT_DISH_IMAGES — miniatures Yumlo)
  "8827d5820f": "/menu-hd-onglet28/assort24-aromaki-lovers.png",
  "c9b4e3431d": "/menu-hd-onglet28/assort24-california-lovers.png",
  "d2212cb6f2": "/menu-hd-onglet28/assort24-crunchy-lovers.png",
  "941fda2c02": "/menu-hd-onglet28/assort24-deluxe.png",
  "58c0a31b31": "/menu-hd-onglet28/assort20-summer.png",

  // Assortiments 30 pcs (alignés sur CLIENT_DISH_IMAGES — miniatures Yumlo)
  "a39d62353c": "/menu-hd-onglet29/assort30-delice.png",
  "0679c0f898": "/menu-hd-onglet29/assort30-enjoy-box.png",
  "267463ea64": "/menu-hd-onglet29/assort30-jocker.png",

  // Assortiments 36 pcs + Extasy 40 (alignés sur CLIENT_DISH_IMAGES — miniatures Yumlo)
  "59108b5a10": "/menu-hd-onglet30/assort36-gourmet.png",
  "c800597832": "/menu-hd-onglet30/assort36-dream.png",
  "b5dd505e6f": "/menu-hd-onglet30/assort40-extasy.png",

  // Assortiments 48 pcs + Happy Box 44 (alignés sur CLIENT_DISH_IMAGES — miniatures Yumlo)
  "b4a12d5c8c": "/menu-hd-onglet31/assort48-fiesta.png",
  "a4fdedb9b3": "/menu-hd-onglet31/assort48-festival.png",
  "225dc32819": "/menu-hd-onglet31/assort44-happy-box.png",

  // Assortiments 60 pcs (alignés sur CLIENT_DISH_IMAGES — miniatures Yumlo)
  "4a3cdf3348": "/menu-hd-onglet32/assort60-carnaval.png",
  "10fc49f9b4": "/menu-hd-onglet32/assort60-family-box.png",
};
