import { useEffect } from "react";
import { BrandLogo } from "../components/BrandLogo";
import { SITE } from "../config/site";
import { HomeHeader, OrderLink } from "./HomeHeader";
import { FEATURED_DISHES, HERO_MOBILE_PHOTO, HERO_PHOTO, HERO_TITLE_IMAGE, HOME_SECTIONS, MENU_PATH, MENU_SHORTCUTS, STORY_PHOTOS, dishMenuHref, type FeaturedDish } from "./homeContent";

const focusRing = "outline-none focus-visible:ring-2 focus-visible:ring-home-lantern focus-visible:ring-offset-2";

/** « @kaytorisushi » depuis l'URL du profil Instagram. */
const instagramHandle = SITE.instagram.split("/").filter(Boolean).pop();

/**
 * Hero : photo pleine largeur, ambiance tamisée. Le texte occupe la zone sombre en haut à gauche
 * de l'image ; un seul voile, côté texte, laisse les plats intacts en bas de l'écran.
 */
function Hero() {
  return (
    <section className="relative isolate flex min-h-[100svh] flex-col overflow-hidden bg-home-night text-white">
      {/* Téléphone en portrait : photo verticale dédiée ; ordinateur : photo horizontale. */}
      <picture>
        <source
          media={HERO_MOBILE_PHOTO.media}
          srcSet={HERO_MOBILE_PHOTO.srcSet}
          sizes="100vw"
          width={HERO_MOBILE_PHOTO.width}
          height={HERO_MOBILE_PHOTO.height}
        />
        <img
          src={HERO_PHOTO.src}
          srcSet={HERO_PHOTO.srcSet}
          sizes="100vw"
          width={HERO_PHOTO.width}
          height={HERO_PHOTO.height}
          alt={HERO_PHOTO.alt}
          fetchPriority="high"
          decoding="async"
          className="absolute inset-0 -z-10 h-full w-full object-cover object-[30%_50%] motion-safe:animate-hero-settle sm:object-[38%_50%] lg:object-[50%_60%] max-lg:portrait:object-[50%_42%]"
        />
      </picture>
      <div
        className="absolute inset-0 -z-10 bg-gradient-to-b from-black/75 via-black/35 to-transparent max-lg:portrait:bg-gradient-to-t max-lg:portrait:from-black/85 max-lg:portrait:via-black/10 max-lg:portrait:via-45% max-lg:portrait:to-black/35 lg:bg-gradient-to-r lg:from-black/70 lg:via-black/30 lg:to-transparent"
        aria-hidden
      />

      <div className="mx-auto w-full max-w-[90rem] px-5 pt-28 sm:px-8 sm:pt-32 max-lg:portrait:mt-auto max-lg:portrait:pb-[max(2.25rem,calc(env(safe-area-inset-bottom)+1.25rem))] max-sm:portrait:pb-[max(1rem,calc(env(safe-area-inset-bottom)+1rem))] lg:px-12 lg:pt-[max(7rem,clamp(7rem,30svh_-_7rem,13rem))]">
        <div className="max-w-[30rem] lg:max-w-[36rem]">
          <h1 className="motion-safe:animate-hero-rise">
            <img
              src={HERO_TITLE_IMAGE.src}
              srcSet={HERO_TITLE_IMAGE.srcSet}
              sizes="(min-width: 1024px) 36rem, 92vw"
              width={HERO_TITLE_IMAGE.width}
              height={HERO_TITLE_IMAGE.height}
              alt={HERO_TITLE_IMAGE.alt}
              decoding="async"
              className="block h-auto w-full drop-shadow-[0_2px_18px_rgba(0,0,0,0.55)]"
            />
          </h1>
          <div
            className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 motion-safe:animate-hero-rise max-sm:mt-7 max-sm:flex-nowrap max-sm:gap-x-2.5 lg:mt-7"
            style={{ animationDelay: "260ms" }}
          >
            <OrderLink className="min-h-[52px] px-8 text-[1rem] shadow-[0_10px_30px_-8px_rgba(227,177,90,0.55)] max-sm:flex-auto max-sm:whitespace-nowrap max-sm:px-3 max-sm:text-[clamp(0.8rem,3.6vw,0.98rem)]">Commander</OrderLink>
            <a
              href="#restaurant"
              className={`inline-flex min-h-[52px] items-center justify-center rounded-full border border-white/35 px-7 font-sans text-[0.98rem] max-sm:flex-auto max-sm:whitespace-nowrap max-sm:px-3 max-sm:text-[clamp(0.8rem,3.6vw,0.98rem)] text-white backdrop-blur-[2px] transition-colors hover:border-home-lantern hover:text-home-lanternSoft ${focusRing} focus-visible:ring-offset-home-night`}
            >
              Découvrir le restaurant
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

function Story() {
  const { main, detail } = STORY_PHOTOS;
  return (
    <section id="restaurant" aria-labelledby="restaurant-title" className="scroll-mt-20 bg-home-washi py-20 sm:py-28 lg:py-36">
      <div className="mx-auto grid max-w-[90rem] gap-12 px-5 sm:px-8 lg:grid-cols-12 lg:gap-8 lg:px-12">
        {/* Deux photos superposées : la salle en grand, le détail en chevauchement sur l'angle. */}
        <div className="relative mx-auto w-full max-w-[34rem] pb-[18%] pr-[16%] lg:col-span-5 lg:mx-0 lg:max-w-none">
          <img
            src={main.src}
            width={main.width}
            height={main.height}
            alt={main.alt}
            loading="lazy"
            decoding="async"
            className="photo-frame block h-auto w-full shadow-[0_30px_60px_-30px_rgba(20,37,29,0.45)]"
          />
          <img
            src={detail.src}
            width={detail.width}
            height={detail.height}
            alt={detail.alt}
            loading="lazy"
            decoding="async"
            className="photo-frame absolute bottom-0 right-0 h-auto w-[46%] shadow-[0_24px_48px_-20px_rgba(20,37,29,0.5)]"
          />
        </div>
        <div className="lg:col-span-6 lg:col-start-7 lg:self-center">
          <h2
            id="restaurant-title"
            className="font-mincho text-[2.9rem] font-semibold leading-[1.02] text-home-ink sm:text-[4rem] lg:text-[5rem]"
          >
            L&apos;art des saveurs
          </h2>
          <div className="mt-8 max-w-[34rem] space-y-5 font-sans text-[1.06rem] leading-[1.75] text-home-soft">
            <p>
              Chez Kaytôri, chaque détail invite au voyage. Des fresques colorées aux lumières tamisées, des matières
              naturelles aux assises de velours vert, le restaurant compose un cadre singulier où l&apos;on prend le temps
              de savourer l&apos;instant.
            </p>
            <p>
              Dans l&apos;assiette, les traditions asiatiques rencontrent la créativité : sushi, maki, sashimi, spécialités
              au wok, cuisine thaïlandaise et bentos généreux. Une cuisine haute en couleur, pensée pour éveiller les sens
              et donner envie de partager.
            </p>
          </div>
          <p className="mt-10 max-w-[30rem] border-l-2 border-home-lantern pl-6 font-mincho text-[1.45rem] font-medium leading-snug text-home-velvet sm:text-[1.7rem]">
            Une adresse, plusieurs univers, une même envie&nbsp;: vous faire plaisir.
          </p>
        </div>
      </div>
    </section>
  );
}

function DishFigure({ dish, large = false }: { dish: FeaturedDish; large?: boolean }) {
  return (
    <a href={dishMenuHref(dish)} className={`group block rounded-[5px] ${focusRing} focus-visible:ring-offset-home-leaf`}>
      <figure>
        <div className="photo-frame overflow-hidden bg-home-velvet shadow-[0_24px_48px_-24px_rgba(0,0,0,0.55)]">
          <img
            src={dish.image.src}
            srcSet={dish.image.srcSet}
            sizes={large ? "(min-width: 1024px) 45vw, 100vw" : "(min-width: 1024px) 22vw, 50vw"}
            width={dish.image.width}
            height={dish.image.height}
            alt={dish.name}
            loading="lazy"
            decoding="async"
            className="block h-auto w-full transition-transform duration-500 ease-smooth group-hover:scale-[1.03]"
          />
        </div>
        <figcaption className={large ? "mt-6" : "mt-4"}>
          <span className={`block font-mincho font-semibold text-white ${large ? "text-[1.9rem] lg:text-[2.4rem]" : "text-[1.15rem] lg:text-[1.3rem]"}`}>
            {dish.name}
          </span>
          <span className={`mt-1.5 block font-sans text-white/70 ${large ? "text-[1rem]" : "text-[0.88rem]"}`}>
            {dish.description}
          </span>
          <span className="mt-2 inline-block font-sans text-[0.85rem] text-home-lanternSoft underline decoration-home-lantern/50 underline-offset-4 group-hover:text-white">
            Voir le plat
          </span>
        </figcaption>
      </figure>
    </a>
  );
}

/**
 * Spécialités : photos des plats sur le vert de la section, chacune dans ses proportions
 * d'origine ; chaque plat ouvre directement sa carte dans le menu (#plat-<id>).
 */
function Specialties() {
  const [first, ...others] = FEATURED_DISHES;
  return (
    <section id="specialites" aria-labelledby="specialites-title" className="scroll-mt-20 bg-home-leaf py-20 text-white sm:py-28">
      <div className="mx-auto max-w-[90rem] px-5 sm:px-8 lg:px-12">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <h2 id="specialites-title" className="max-w-[14ch] font-mincho text-[2.6rem] font-semibold leading-[1.05] sm:text-[3.4rem] lg:text-[4.2rem]">
            Quelques plats de la carte
          </h2>
          <div className="max-w-[26rem] lg:pb-3">
            <p className="font-sans text-[1.02rem] leading-relaxed text-white/75">
              Du curry thaï aux rouleaux de printemps, un aperçu de la carte. Touchez un plat pour le
              retrouver dans le menu.
            </p>
            <a
              href={MENU_PATH}
              className={`mt-5 inline-flex min-h-[44px] items-center rounded-full border border-home-lantern/70 px-6 font-sans text-[0.95rem] font-semibold text-home-lanternSoft transition-colors hover:bg-home-lantern hover:text-home-night ${focusRing} focus-visible:ring-offset-home-leaf`}
            >
              Voir toute la carte
            </a>
          </div>
        </div>

        <div className="mt-14 grid grid-cols-2 gap-x-5 gap-y-12 sm:gap-x-8 lg:mt-20 lg:grid-cols-12 lg:gap-x-10">
          <div className="col-span-2 sm:max-w-xl lg:sticky lg:top-28 lg:col-span-6 lg:row-span-2 lg:max-w-none lg:self-start">
            <DishFigure dish={first} large />
          </div>
          {others.map((dish, i) => (
            <div key={dish.id} className={`lg:col-span-3 ${i % 2 === 1 ? "lg:mt-16" : ""}`}>
              <DishFigure dish={dish} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Invitation au menu : le bouton principal et les accès directs aux formules (liens profonds existants). */
function MenuInvite() {
  return (
    <section aria-labelledby="carte-title" className="bg-home-night py-20 text-white sm:py-28">
      <div className="mx-auto grid max-w-[90rem] gap-14 px-5 sm:px-8 lg:grid-cols-12 lg:gap-8 lg:px-12">
        <div className="lg:col-span-6">
          <h2 id="carte-title" className="max-w-[15ch] font-mincho text-[2.6rem] font-semibold leading-[1.05] sm:text-[3.4rem] lg:text-[4.2rem]">
            Toute la carte, en quelques clics
          </h2>
          <p className="mt-6 max-w-[32rem] font-sans text-[1.04rem] leading-relaxed text-white/75">
            Choisissez vos plats, ajoutez-les au panier, puis envoyez votre commande sur WhatsApp.
          </p>
          <OrderLink className="mt-9 min-h-[52px] px-8 text-[1rem]">Commander maintenant</OrderLink>
        </div>
        <div className="lg:col-span-5 lg:col-start-8 lg:pt-3">
          <h3 className="font-sans text-[0.95rem] text-home-lanternSoft">Accès direct</h3>
          <ul className="mt-4 border-t border-white/15">
            {MENU_SHORTCUTS.map((s) => (
              <li key={s.hash} className="border-b border-white/15">
                <a
                  href={`${MENU_PATH}#${s.hash}`}
                  className={`group flex min-h-[76px] items-center justify-between gap-6 py-4 ${focusRing} focus-visible:ring-offset-home-night`}
                >
                  <span>
                    <span className="block font-mincho text-[1.4rem] font-semibold leading-tight group-hover:text-home-lanternSoft">
                      {s.label}
                    </span>
                    <span className="mt-1 block font-sans text-[0.9rem] text-white/60">{s.detail}</span>
                  </span>
                  <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.5" className="shrink-0 text-home-lantern transition-transform group-hover:translate-x-1">
                    <path d="M4 10h12M11 5l5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

/** Infos pratiques : uniquement les informations confirmées par le restaurant (src/config/site.ts). */
function PracticalInfo() {
  const linkClass = `underline decoration-home-ink/25 underline-offset-4 transition-colors hover:text-home-velvet hover:decoration-home-velvet ${focusRing} focus-visible:ring-offset-home-washi`;
  return (
    <section id="infos" aria-labelledby="infos-title" className="scroll-mt-20 bg-home-washi py-20 text-home-ink sm:py-28">
      <div className="mx-auto max-w-[90rem] px-5 sm:px-8 lg:px-12">
        <h2 id="infos-title" className="font-mincho text-[2.6rem] font-semibold leading-[1.05] sm:text-[3.4rem]">
          Infos pratiques
        </h2>
        <div className="mt-12 grid gap-12 border-t border-home-ink/15 pt-10 font-sans text-[1.02rem] leading-relaxed md:grid-cols-3 md:gap-10">
          <div>
            <h3 className="font-mincho text-[1.35rem] font-semibold">Adresse</h3>
            <address className="mt-3 not-italic text-home-soft">
              <a href={SITE.mapsUrl} target="_blank" rel="noopener noreferrer" className={linkClass}>
                {SITE.address}
                <span className="sr-only"> (Google Maps, nouvel onglet)</span>
              </a>
            </address>
          </div>
          <div>
            <h3 className="font-mincho text-[1.35rem] font-semibold">Horaires</h3>
            <dl className="mt-3 text-home-soft">
              {SITE.hours.map(({ days, range }) => (
                <div key={days} className="flex justify-between gap-6 border-b border-home-ink/10 py-2 first:pt-0 md:max-w-[19rem]">
                  <dt>{days}</dt>
                  <dd className="tabular-nums text-home-ink">{range}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div>
            <h3 className="font-mincho text-[1.35rem] font-semibold">Contact</h3>
            <ul className="mt-3 space-y-1.5 text-home-soft">
              <li>
                <a href={`tel:+${SITE.phoneFixeE164}`} className={`tabular-nums ${linkClass}`}>
                  {SITE.phoneFixeDisplay}
                </a>
              </li>
              <li>
                <a href={SITE.instagram} target="_blank" rel="noopener noreferrer" className={linkClass}>
                  @{instagramHandle}
                  <span className="sr-only"> (Instagram, nouvel onglet)</span>
                </a>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

function HomeFooter() {
  const linkClass = `inline-flex min-h-[44px] items-center text-white/70 transition-colors hover:text-home-lanternSoft ${focusRing} focus-visible:ring-offset-home-night`;
  return (
    <footer className="border-t border-home-lantern/20 bg-home-night pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-12 font-sans text-white">
      <div className="mx-auto flex max-w-[90rem] flex-col gap-8 px-5 sm:px-8 md:flex-row md:items-center md:justify-between lg:px-12">
        <div className="flex items-center gap-3">
          <BrandLogo size={44} className="ring-1 ring-home-lantern/40" />
          <p className="font-mincho text-[1.3rem] font-semibold">{SITE.nameAccent} Sushi</p>
        </div>
        <nav aria-label="Pied de page">
          <ul className="flex flex-wrap gap-x-7 text-[0.95rem]">
            {HOME_SECTIONS.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className={linkClass}>
                  {s.label}
                </a>
              </li>
            ))}
            <li>
              <a href={MENU_PATH} className={linkClass}>
                La carte
              </a>
            </li>
          </ul>
        </nav>
      </div>
      <p className="mx-auto mt-8 max-w-[90rem] border-t border-white/10 px-5 pt-6 text-[0.82rem] text-white/50 sm:px-8 lg:px-12">
        © {new Date().getFullYear()} {SITE.nameAccent} Sushi, Casablanca
      </p>
    </footer>
  );
}

/** Page d'accueil du restaurant (/). Toute commande passe par le menu digital (/menu). */
export function HomePage() {
  // Lien direct vers une section (/#infos…) : la page est rendue après le défilement natif du navigateur.
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (id) document.getElementById(id)?.scrollIntoView();
  }, []);

  return (
    <>
      <a
        href="#contenu"
        className="sr-only z-50 rounded-full bg-home-lantern px-5 py-3 font-sans font-semibold text-home-night focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Aller au contenu
      </a>
      <HomeHeader />
      <main id="contenu">
        <Hero />
        <Story />
        <Specialties />
        <MenuInvite />
        <PracticalInfo />
      </main>
      <HomeFooter />
    </>
  );
}
