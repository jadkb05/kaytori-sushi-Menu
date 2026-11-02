/**
 * Écrans du Kaytôri Club (rendu statique) :
 * présentation selon l'état du programme, formulaire, récapitulatif, envoi,
 * carte membre de points, catalogue de récompenses, historique client et écran QR manager (/fidelite/scan/:code).
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LoyaltyCard } from "../src/loyalty/components/LoyaltyCard";
import { SignupSection } from "../src/loyalty/components/SignupSection";
import type { LoyaltyProgram, PublicCard } from "../src/loyalty/lib/api";
import { LoyaltyError, registrationAdvice } from "../src/loyalty/lib/errors";
import { qrModules, scanUrl } from "../src/loyalty/lib/qr";
import { INITIAL_SIGNUP, type SignupState } from "../src/loyalty/lib/signupForm";
import { CardView, type CardState } from "../src/loyalty/pages/CardPage";
import { HomeView, type ProgramState } from "../src/loyalty/pages/HomePage";
import { ScanPage } from "../src/loyalty/pages/ScanPage";

const TOKEN = "SECRETtokenSECRETtokenSECRETtokenSECRETtok";
const ORIGIN = "https://commander.example";
const noop = () => {};

const defaultProgram = (over: Partial<LoyaltyProgram> = {}): LoyaltyProgram => ({
  isActive: true,
  pointValueCentimes: 20,
  earningPoints: 1,
  earningDirhams: 1,
  roundingRule: "floor",
  minTicketCentimes: 1000,
  maxPointsPerOrder: null,
  maxPointsPerDay: null,
  termsSummary: "Les points Kaytôri Club sont crédités lors du règlement au restaurant.",
  rewardLabel: null,
  rewards: [
    {
      id: "00000000-0000-4000-8000-000000000001",
      name: "Boisson fraîche offerte",
      description: "Thé glacé maison ou soda au choix",
      pointsCost: 50,
      conditions: "Sur place ou à emporter",
      imageUrl: null,
      sortOrder: 10,
      available: true,
      pointsMissing: 0,
    },
    {
      id: "00000000-0000-4000-8000-000000000002",
      name: "Assortiment 6 pièces California",
      description: "Saumon avocat préparé minute",
      pointsCost: 150,
      conditions: "Sur présentation du pass",
      imageUrl: null,
      sortOrder: 20,
      available: false,
      pointsMissing: 30,
    },
  ],
  ...over,
});

const card = (over: Partial<PublicCard> = {}): PublicCard => ({
  fullName: "Élodie Ben-Ali",
  phoneMasked: "06 •• •• •• 32",
  publicCode: "9TN5D14KYZY2",
  status: "active",
  pointsBalance: 120,
  pointsEarnedTotal: 150,
  pointsSpentTotal: 30,
  rewardsRedeemed: 1,
  pointValueCentimes: 20,
  earningPoints: 1,
  earningDirhams: 1,
  roundingRule: "floor",
  minTicketCentimes: 1000,
  maxPointsPerOrder: null,
  maxPointsPerDay: null,
  programActive: true,
  termsSummary: "Les points sont crédités au comptoir.",
  lastPointsAt: "2026-10-26T12:00:00Z",
  lastActivityAt: "2026-10-26T12:00:00Z",
  createdAt: "2026-10-01T12:00:00Z",
  rewards: defaultProgram().rewards,
  history: [
    {
      eventId: "00000000-0000-4000-8000-000000000099",
      seq: 2,
      kind: "points_credited",
      pointsDelta: 120,
      pointsBalanceAfter: 120,
      ticketAmountCentimes: 12000,
      orderRef: "CMD-104",
      rewardId: null,
      rewardName: null,
      redemptionCode: null,
      reason: null,
      revertsEventId: null,
      revertedByEventId: null,
      createdAt: "2026-10-26T12:00:00Z",
    },
  ],
  ...over,
});

const home = (program: ProgramState, extra: Partial<Parameters<typeof HomeView>[0]> = {}) =>
  renderToStaticMarkup(
    <HomeView
      program={program}
      hasSavedCard={false}
      pending={null}
      onRetry={noop}
      onCreated={noop}
      onClosed={noop}
      {...extra}
    />,
  );

const cardScreen = (state: CardState) =>
  renderToStaticMarkup(
    <CardView
      state={state}
      token={TOKEN}
      qrOrigin={ORIGIN}
      onRetry={noop}
      onRefresh={noop}
      onForget={noop}
      onCardUpdated={noop}
    />,
  );

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ");

describe("présentation (/fidelite)", () => {
  it("programme ouvert : principe des points, valeur 1 point = 0,20 DH, catalogue de récompenses, formulaire, aide et données", () => {
    const html = home({ status: "ready", program: defaultProgram() });
    const t = text(html);
    expect(t).toContain("Kaytôri Club");
    expect(t).toContain("1 point = 0,20 DH");
    expect(t).toContain("Boisson fraîche offerte");
    expect(t).toContain("50 points");
    expect(html).toContain('id="fidelite-fullName"');
    expect(t).toContain("Carte perdue ou nouveau téléphone");
    expect(t).toContain("Vos données et la sécurité de votre carte");
    expect(html.match(/<h1/g)).toHaveLength(1);
  });

  it("programme fermé : message clair, aucun formulaire de création", () => {
    const html = home({ status: "ready", program: defaultProgram({ isActive: false }) });
    expect(text(html)).toContain("Le programme ouvre bientôt");
    expect(html).not.toContain("<form");
    expect(html).not.toContain("Créer ma carte");
  });

  it("chargement et erreur réseau : emplacement réservé, puis message avec « Réessayer »", () => {
    const loading = home({ status: "loading" });
    expect(loading).toContain('role="status"');
    expect(loading).not.toContain("<form");
    const error = home({
      status: "error",
      advice: { title: "Pas de connexion", message: "Vérifiez votre connexion et réessayez.", action: "retry" },
    });
    expect(error).toContain('role="alert"');
    expect(text(error)).toContain("Réessayer");
  });

  it("carte déjà sur l'appareil : accès direct proposé", () => {
    expect(text(home({ status: "ready", program: defaultProgram() }, { hasSavedCard: true }))).toContain(
      "Ouvrir ma carte et consulter mes points",
    );
  });
});

describe("formulaire et récapitulatif", () => {
  const section = (initialState: SignupState, extra: Partial<Parameters<typeof SignupSection>[0]> = {}) =>
    renderToStaticMarkup(
      <SignupSection
        resume={null}
        hasSavedCard={false}
        onCreated={noop}
        onClosed={noop}
        recoveryHref="#aide"
        initialState={initialState}
        {...extra}
      />,
    );

  it("champs : libellés, clavier téléphone, autocomplétion, 16 px (pas de zoom iOS), aides liées", () => {
    const html = section(INITIAL_SIGNUP);
    expect(html).toContain('<label for="fidelite-fullName"');
    expect(html).toMatch(/id="fidelite-fullName"[^>]*autoComplete="name"|autoComplete="name"[^>]*id="fidelite-fullName"/i);
    expect(html).toMatch(/type="tel"/);
    expect(html).toMatch(/inputMode="tel"/i);
    expect(html).toMatch(/autoComplete="tel"/i);
    expect(html).toContain("text-[16px]");
    expect(html).toContain('aria-describedby="fidelite-phone-hint"');
    expect(html).toContain("min-h-[52px]");
  });

  it("erreurs : liées au champ (aria-invalid, aria-describedby) avec la prochaine action", () => {
    const html = section({
      ...INITIAL_SIGNUP,
      errors: { phone: "Numéro invalide. Exemple : 06 12 34 56 78 ou +212 6 12 34 56 78." },
      touched: { phone: true },
    });
    expect(html).toMatch(/aria-invalid="true"[^>]*aria-describedby="fidelite-phone-error"/);
    expect(html).toContain('id="fidelite-phone-error"');
  });

  it("récapitulatif avant toute création : nom, numéro lisible, deux actions distinctes", () => {
    const t = text(
      section({
        ...INITIAL_SIGNUP,
        step: "confirm",
        values: { fullName: " Élodie  Ben-Ali ", phone: "+212698765432" },
      }),
    );
    expect(t).toContain("Vos informations sont-elles exactes");
    expect(t).toContain("Élodie Ben-Ali");
    expect(t).toContain("06 98 76 54 32");
    expect(t).toContain("Confirmer et créer ma carte");
    expect(t).toContain("Modifier mes informations");
  });

  it("envoi en cours : boutons désactivés, état annoncé ; après coupure réseau, « Réessayer »", () => {
    const sending = section({
      ...INITIAL_SIGNUP,
      step: "submitting",
      values: { fullName: "Salma", phone: "0612345678" },
    });
    expect(sending).toContain('aria-busy="true"');
    expect(sending.match(/disabled=""/g)?.length).toBe(2);
    expect(text(sending)).toContain("Création de votre carte…");
    const failed = section({
      ...INITIAL_SIGNUP,
      step: "confirm",
      values: { fullName: "Salma", phone: "0612345678" },
      failure: registrationAdvice(new LoyaltyError("network")),
    });
    expect(failed).toContain('role="alert"');
    expect(text(failed)).toContain("Connexion interrompue");
    expect(text(failed)).toContain("Réessayer");
  });

  it("numéro déjà inscrit : renvoi vers l'aide pour retrouver sa carte", () => {
    const html = section({
      ...INITIAL_SIGNUP,
      step: "confirm",
      values: { fullName: "Salma", phone: "0612345678" },
      failure: registrationAdvice(new LoyaltyError("business", "KL003")),
    });
    expect(text(html)).toContain("Ce numéro a déjà une carte");
    expect(html).toContain('href="#aide"');
  });

  it("demande interrompue à reprendre : explication et possibilité d'abandonner", () => {
    const pending = {
      token: TOKEN,
      requestId: "00000000-0000-4000-8000-000000000000",
      fullName: "Salma Bennani",
      phone: "0612345678",
      startedAt: 1,
    };
    const html = renderToStaticMarkup(
      <SignupSection resume={pending} hasSavedCard={false} onCreated={noop} onClosed={noop} recoveryHref="#aide" />,
    );
    expect(text(html)).toContain("Une demande n'a pas reçu de réponse");
    expect(text(html)).toContain("Abandonner cette demande");
    expect(html).not.toContain(TOKEN);
  });
});

describe("pass membre et espace client (/fidelite/carte)", () => {
  it("affiche le solde de points, l'équivalent en dirhams, la progression vers le prochain palier, le QR et le code public", () => {
    const html = renderToStaticMarkup(<LoyaltyCard card={card()} qrOrigin={ORIGIN} />);
    const t = text(html);
    expect(t).toContain("Élodie Ben-Ali");
    expect(t).toContain("120");
    expect(t).toContain("points");
    expect(t).toContain("24 DH");
    expect(t).toContain("1 point = 0,20 DH");
    expect(t).toContain("Assortiment 6 pièces California");
    expect(t).toContain("120 / 150 pts");
    expect(t).toContain("9TN5 D14K YZY2");
    expect(html).toContain('aria-label="QR code de votre carte, à présenter au comptoir"');
  });

  it("carte neuve (0 point), carte suspendue", () => {
    const fresh = text(
      renderToStaticMarkup(
        <LoyaltyCard
          card={card({ pointsBalance: 0, pointsEarnedTotal: 0, pointsSpentTotal: 0, history: [] })}
          qrOrigin={ORIGIN}
        />,
      ),
    );
    expect(fresh).toContain("0 DH");
    expect(fresh).toContain("cumuler vos premiers points");
    expect(text(renderToStaticMarkup(<LoyaltyCard card={card({ status: "suspended" })} qrOrigin={ORIGIN} />))).toContain(
      "Cette carte est suspendue",
    );
  });

  it("ni numéro complet, ni jeton dans la carte ; le QR n'encode que l'URL du code public", () => {
    const html = cardScreen({ status: "ready", card: card(), freshPoints: 0, justCreated: true });
    expect(html).not.toContain(TOKEN);
    expect(html).not.toMatch(/0698765432|06 98 76 54 32/);
    const url = scanUrl("9TN5D14KYZY2", ORIGIN);
    expect(url).toBe("https://commander.example/fidelite/scan/9TN5D14KYZY2");
    expect(url).not.toContain(TOKEN);
    const modules = qrModules(url);
    expect(html).toContain(`viewBox="-4 -4 ${modules.length + 8} ${modules.length + 8}"`);
  });

  it("catalogue de récompenses et historique : récompense débloquée échangeable, récompense verrouillée expliquée, historique affiché", () => {
    const t = text(cardScreen({ status: "ready", card: card(), freshPoints: 0, justCreated: false }));
    expect(t).toContain("Catalogue des récompenses");
    expect(t).toContain("Boisson fraîche offerte");
    expect(t).toContain("Échanger cette récompense (50 points)");
    expect(t).toContain("Il vous manque 30 points");
    expect(t).toContain("Historique de vos points");
    expect(t).toContain("Ticket : 120 DH");
    expect(t).toContain("+120 pts");
  });

  it("état vide à 0 point : encouragement clair pour démarrer", () => {
    const t = text(
      cardScreen({
        status: "ready",
        card: card({ pointsBalance: 0, pointsEarnedTotal: 0, history: [] }),
        freshPoints: 0,
        justCreated: false,
      }),
    );
    expect(t).toContain("Cumulez vos premiers points au restaurant");
  });

  it("programme en pause : la carte reste lisible, avec une explication", () => {
    expect(
      text(cardScreen({ status: "ready", card: card({ programActive: false }), freshPoints: 0, justCreated: false })),
    ).toContain("Programme en pause");
  });

  it("chargement, aucune carte, lien abîmé, carte introuvable, erreur réseau", () => {
    expect(cardScreen({ status: "loading" })).toContain('aria-label="Chargement de votre carte"');
    const none = text(cardScreen({ status: "none" }));
    expect(none).toContain("Aucune carte sur ce téléphone");
    expect(none).toContain("Rejoindre le Kaytôri Club");
    expect(text(cardScreen({ status: "invalidLink" }))).toContain("Lien incomplet");
    const lost = cardScreen({
      status: "error",
      advice: { title: "Carte introuvable", message: "Ce lien est incomplet ou a été remplacé.", action: "recover" },
      fromDevice: true,
    });
    expect(text(lost)).toContain("Retirer ce lien de ce téléphone");
    expect(text(lost)).toContain("Carte perdue ou nouveau téléphone");
    expect(
      text(
        cardScreen({
          status: "error",
          advice: { title: "Pas de connexion", message: "Réessayez.", action: "retry" },
          fromDevice: true,
        }),
      ),
    ).toContain("Réessayer");
  });

  it("aucun vestige de tampons ni de fleurs de cerisier dans l'espace client", () => {
    const t = text(cardScreen({ status: "ready", card: card(), freshPoints: 0, justCreated: false }));
    expect(t).not.toMatch(/tampon|cerisier|fleurs écloses/i);
  });
});

describe("parcours rapide manager depuis le QR (/fidelite/scan/:code)", () => {
  it("demande d'abord le code secret manager sans exposer aucune donnée personnelle de la carte", () => {
    const html = renderToStaticMarkup(<ScanPage publicCode="9tn5d14kyzy2" hasSavedCard={false} />);
    const t = text(html);
    expect(t).toContain("Validation Manager");
    expect(t).toContain("Code secret du manager");
    expect(t).toContain("9TN5 D14K YZY2");
    expect(t).toContain("Valider");
    expect(t).not.toMatch(/Bennani|Ben-Ali|06/);
  });

  it("code QR invalide : affiche un message d'erreur clair sans clavier PIN", () => {
    const html = renderToStaticMarkup(<ScanPage publicCode="invalide" hasSavedCard={false} />);
    const t = text(html);
    expect(t).toContain("QR code non reconnu");
    expect(t).not.toContain("Code secret du manager");
  });
});
