import { useEffect } from "react";
import { BrandLogo } from "../components/BrandLogo";
import { SITE, whatsappHref } from "../config/site";
import { HomeHeader, OrderLink } from "./HomeHeader";
import { ArrowIcon, ChefHatIcon, Eyebrow, LeafIcon, ScooterIcon, SeigaihaLines, WaveDivider } from "./HomeDecor";
import { FEATURED_DISHES, HERO_MOBILE_PHOTO, HERO_PHOTO, HERO_TITLE_IMAGE, HOME_SECTIONS, MENU_PATH, MENU_SHORTCUTS, STORY_PHOTOS, dishMenuHref, type FeaturedDish } from "./homeContent";

const focusRing = "outline-none focus-visible:ring-2 focus-visible:ring-home-lantern focus-visible:ring-offset-2";

/** « @kaytorisushi » depuis l'URL du profil Instagram. */
const instagramHandle = SITE.instagram.split("/").filter(Boolean).pop();

/**
 * Hero : photo pleine largeur, ambiance tamisée. Le texte occupe la zone sombre de l'image ;
 * une courbe crème cernée d'or fait la transition vers « L'art des saveurs ».
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
          className="absolute inset-0 -z-10 h-full w-full object-cover object-[30%_50%] motion-safe:animate-hero-settle sm:object-[38%_50%] lg:object-[50%_60%] max-lg:portrait:object-[68%_42%]"
        />
      </picture>
      <div
        className="absolute inset-0 -z-10 bg-gradient-to-b from-home-night/80 via-black/30 to-black/10 max-lg:portrait:bg-gradient-to-t max-lg:portrait:from-home-night/90 max-lg:portrait:via-black/10 max-lg:portrait:via-45% max-lg:portrait:to-black/30 lg:bg-gradient-to-r lg:from-home-night/85 lg:via-black/35 lg:to-transparent"
        aria-hidden
      />

      <div className="mx-auto w-full max-w-[90rem] px-5 pb-20 pt-28 sm:px-8 sm:pt-32 max-lg:portrait:mt-auto max-lg:portrait:pb-[max(4.5rem,calc(env(safe-area-inset-bottom)+3.5rem))] lg:px-12 lg:pt-[max(8rem,clamp(8rem,30svh_-_6rem,14rem))]">
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
            className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-3 motion-safe:animate-hero-rise max-sm:mt-7 max-sm:flex-nowrap max-sm:gap-x-2.5 lg:mt-9"
            style={{ animationDelay: "260ms" }}
          >
            <OrderLink
              className="min-h-[52px] px-8 text-[1rem] max-sm:flex-auto max-sm:whitespace-nowrap max-sm:px-3 max-sm:text-[clamp(0.8rem,3.6vw,0.98rem)]"
              icon={null}
            >
              Commander
            </OrderLink>
            <a
              href="#restaurant"
              className={`inline-flex min-h-[52px] items-center justify-center rounded-full border border-home-lantern/60 bg-home-night/30 px-7 font-sans text-[0.98rem] text-white backdrop-blur-[3px] transition-colors hover:border-home-lantern hover:text-home-lanternSoft max-sm:flex-auto max-sm:whitespace-nowrap max-sm:px-3 max-sm:text-[clamp(0.8rem,3.6vw,0.98rem)] ${focusRing} focus-visible:ring-offset-home-night`}
            >
              Découvrir le restaurant
            </a>
          </div>
        </div>
      </div>

      <WaveDivider shape="crest" fillClass="fill-home-washi" className="absolute inset-x-0 bottom-[-1px]" />
    </section>
  );
}

/** Engagements du restaurant, sous le texte de « L'art des saveurs ». */
const PROMISES = [
  { title: "Produits frais", detail: "Sélection rigoureuse et de qualité", Icon: LeafIcon },
  { title: "Recettes maison", detail: "Préparées chaque jour par notre équipe", Icon: ChefHatIcon },
  { title: "Livraison rapide", detail: "Commande en quelques clics", Icon: ScooterIcon },
] as const;

/**
 * « L'art des saveurs » : collage de deux photos superposées (filet doré, coins arrondis),
 * grand titre, texte, engagements, puis une courbe verte vers les spécialités.
 */
function Story() {
  const { main, detail } = STORY_PHOTOS;
  return (
    <section id="restaurant" aria-labelledby="restaurant-title" className="relative scroll-mt-20 bg-home-washi pt-10 sm:pt-16 lg:pt-24">
      <div className="mx-auto max-w-[90rem] px-5 sm:px-8 lg:px-12">
        <div className="grid gap-12 lg:grid-cols-12 lg:items-center lg:gap-10">
          {/* Collage : la table en grand, la salle en chevauchement sur l'angle bas droit. */}
          <div className="relative mx-auto w-full max-w-[36rem] pb-[22%] lg:col-span-6 lg:mx-0 lg:max-w-none lg:pb-[16%]">
            <div className="photo-frame w-[84%] overflow-hidden shadow-[0_28px_56px_-28px_rgba(11,34,25,0.55)] lg:w-[78%]">
              <img
                src={main.src}
                width={main.width}
                height={main.height}
                alt={main.alt}
                loading="lazy"
                decoding="async"
                className="block aspect-[4/3] h-auto w-full object-cover object-[50%_80%] lg:aspect-[4/5] lg:object-center"
              />
            </div>
            <div className="photo-frame absolute bottom-0 right-0 w-[42%] overflow-hidden shadow-[0_24px_48px_-18px_rgba(11,34,25,0.6)] ring-[6px] ring-home-washi lg:w-[44%]">
              <img
                src={detail.src}
                width={detail.width}
                height={detail.height}
                alt={detail.alt}
                loading="lazy"
                decoding="async"
                className="block aspect-[4/5] h-auto w-full object-cover"
              />
            </div>
          </div>

          <div className="lg:col-span-6 lg:pl-6">
            <Eyebrow>私たちの物語</Eyebrow>
            <h2
              id="restaurant-title"
              className="mt-5 font-display text-[3rem] font-semibold leading-[1] tracking-[-0.01em] text-home-ink sm:text-[4.2rem] lg:text-[5.2rem]"
            >
              L&apos;art des saveurs
            </h2>
            <div className="mt-7 max-w-[34rem] space-y-5 font-sans text-[1.04rem] leading-[1.75] text-home-soft sm:text-[1.08rem]">
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
            <p className="mt-9 max-w-[30rem] border-l border-home-lantern pl-6 font-display text-[1.35rem] italic leading-snug text-home-velvet sm:text-[1.6rem]">
              Une adresse, plusieurs univers, une même envie&nbsp;: vous faire plaisir.
            </p>
          </div>
        </div>

        <ul className="mx-auto mt-16 grid max-w-[60rem] grid-cols-3 divide-x divide-home-lantern/35 sm:mt-20 lg:mt-24">
          {PROMISES.map(({ title, detail, Icon }) => (
            <li key={title} className="flex flex-col items-center px-2 text-center sm:px-6">
              <Icon className="h-9 w-9 text-[#B58C3F] sm:h-11 sm:w-11" />
              <p className="mt-3 font-display text-[1.02rem] font-semibold leading-tight text-home-ink sm:mt-4 sm:text-[1.4rem]">{title}</p>
              <p className="mt-1.5 max-w-[12rem] font-sans text-[0.82rem] leading-snug text-home-soft sm:text-[0.95rem]">{detail}</p>
            </li>
          ))}
        </ul>
      </div>

      <div className="h-8 sm:h-12" />
    </section>
  );
}

function DishFigure({ dish, large = false }: { dish: FeaturedDish; large?: boolean }) {
  return (
    <a href={dishMenuHref(dish)} className={`group block rounded-[10px] ${focusRing} focus-visible:ring-offset-home-night`}>
      <figure>
        <div className="photo-frame overflow-hidden bg-home-leaf shadow-[0_28px_56px_-26px_rgba(0,0,0,0.75)]">
          <img
            src={dish.image.src}
            srcSet={dish.image.srcSet}
            sizes={large ? "(min-width: 1024px) 45vw, 100vw" : "(min-width: 1024px) 22vw, 50vw"}
            width={dish.image.width}
            height={dish.image.height}
            alt={dish.name}
            loading="lazy"
            decoding="async"
            className="block h-auto w-full transition-transform duration-700 ease-smooth group-hover:scale-[1.04]"
          />
        </div>
        <figcaption className={large ? "mt-6" : "mt-4"}>
          <span className={`block font-display font-semibold leading-tight text-white ${large ? "text-[1.9rem] lg:text-[2.5rem]" : "text-[1.15rem] lg:text-[1.35rem]"}`}>
            {dish.name}
          </span>
          <span className={`mt-1.5 block font-sans leading-snug text-white/65 ${large ? "text-[1rem]" : "text-[0.86rem]"}`}>
            {dish.description}
          </span>
          <span className="mt-3 inline-flex items-center gap-1.5 font-sans text-[0.85rem] font-medium text-home-lantern transition-colors group-hover:text-home-lanternSoft">
            Voir le plat
            <ArrowIcon className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </span>
        </figcaption>
      </figure>
    </a>
  );
}

/**
 * Spécialités : photos des plats sur le vert profond, chacune dans ses proportions
 * d'origine ; chaque plat ouvre directement sa carte dans le menu (#plat-<id>).
 */
function Specialties() {
  const [first, ...others] = FEATURED_DISHES;
  return (
    <section id="specialites" aria-labelledby="specialites-title" className="relative isolate scroll-mt-20 overflow-hidden bg-home-night pb-20 text-white sm:pb-28">
      {/* Courbe crème de « L'art des saveurs », posée sur le fond vert de la section, sans couture. */}
      <WaveDivider shape="rise" fillAbove fillClass="fill-home-washi" className="absolute inset-x-0 top-[-1px]" />
      {/* Même motif que le bandeau « Accès direct », sur toute la largeur en haut, puis en fondu jusqu'à disparaître. */}
      <SeigaihaLines className="inset-x-0 top-0 -z-10 h-[34rem] [mask-image:linear-gradient(to_bottom,black_20%,transparent)] sm:h-[40rem]" opacity={0.12} />
      <div className="mx-auto max-w-[90rem] px-5 pt-20 sm:px-8 sm:pt-28 lg:px-12 lg:pt-36">
        <div className="mx-auto flex max-w-[44rem] flex-col items-center text-center">
          <Eyebrow tone="dark">料理</Eyebrow>
          <h2 id="specialites-title" className="mt-5 font-display text-[2.5rem] font-semibold leading-[1.05] sm:text-[3.4rem] lg:text-[4.2rem]">
            Quelques plats de la carte
          </h2>
          <span aria-hidden className="mt-6 h-[2px] w-16 rounded-full bg-home-lantern" />
          <p className="mt-6 max-w-[30rem] font-sans text-[1.02rem] leading-relaxed text-white/70">
            Du curry thaï aux rouleaux de printemps, un aperçu de la carte. Touchez un plat pour le
            retrouver dans le menu.
          </p>
          <a
            href={MENU_PATH}
            className={`mt-7 inline-flex min-h-[46px] items-center gap-2 rounded-full border border-home-lantern/70 px-6 font-sans text-[0.95rem] font-semibold text-home-lanternSoft transition-colors hover:bg-home-lantern hover:text-home-night ${focusRing} focus-visible:ring-offset-home-night`}
          >
            Voir toute la carte
            <ArrowIcon className="h-4 w-4" />
          </a>
        </div>

        <div className="mt-14 grid grid-cols-2 gap-x-4 gap-y-12 sm:gap-x-8 lg:mt-20 lg:grid-cols-12 lg:gap-x-10">
          <div className="col-span-2 sm:mx-auto sm:max-w-xl lg:sticky lg:top-28 lg:col-span-6 lg:row-span-2 lg:mx-0 lg:max-w-none lg:self-start">
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
    <section aria-labelledby="carte-title" className="border-t border-home-lantern/40 bg-home-washi py-20 text-home-ink sm:py-28">
      <div className="mx-auto grid max-w-[90rem] gap-12 px-5 sm:px-8 lg:grid-cols-12 lg:items-center lg:gap-10 lg:px-12">
        <div className="lg:col-span-5">
          <Eyebrow>お品書き</Eyebrow>
          <h2 id="carte-title" className="mt-5 max-w-[15ch] font-display text-[2.5rem] font-semibold leading-[1.05] sm:text-[3.4rem] lg:text-[4rem]">
            Toute la carte, en quelques clics
          </h2>
          <p className="mt-6 max-w-[30rem] font-sans text-[1.04rem] leading-relaxed text-home-soft">
            Choisissez vos plats, ajoutez-les au panier, puis envoyez votre commande sur WhatsApp.
          </p>
          {/* Centré sur téléphone et tablette, aligné sur le texte sur ordinateur. */}
          <div className="mt-9 flex justify-center lg:justify-start">
            <OrderLink className="min-h-[52px] px-8 text-[1rem]" icon={null}>
              Commander maintenant
            </OrderLink>
          </div>
        </div>

        {/* Bandeau vert : accès directs aux formules et promos du menu. */}
        <div className="relative isolate overflow-hidden rounded-[20px] border border-home-lantern/45 bg-home-night px-5 py-7 text-white shadow-[0_36px_70px_-36px_rgba(8,41,31,0.8)] sm:px-9 sm:py-10 lg:col-span-6 lg:col-start-7">
          <SeigaihaLines className="inset-y-0 right-0 -z-10 w-2/3 [mask-image:linear-gradient(to_left,black,transparent)]" opacity={0.16} />
          <h3 className="text-center font-sans text-[0.9rem] font-medium uppercase tracking-[0.28em] text-home-lantern">Accès direct</h3>
          <ul className="mt-4 border-t border-white/15">
            {MENU_SHORTCUTS.map((s) => (
              <li key={s.hash} className="border-b border-white/15 last:border-0">
                <a
                  href={`${MENU_PATH}#${s.hash}`}
                  className={`group flex min-h-[76px] items-center justify-between gap-5 py-4 ${focusRing} focus-visible:ring-offset-home-night`}
                >
                  <span>
                    <span className="block font-display text-[1.35rem] font-semibold leading-tight transition-colors group-hover:text-home-lanternSoft sm:text-[1.55rem]">
                      {s.label}
                    </span>
                    <span className="mt-1 block font-sans text-[0.9rem] text-white/60">{s.detail}</span>
                  </span>
                  <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-home-lantern/50 text-home-lantern transition-colors group-hover:bg-home-lantern group-hover:text-home-night">
                    <ArrowIcon />
                  </span>
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
  const linkClass = `underline decoration-home-lantern/40 underline-offset-4 transition-colors hover:text-home-lanternSoft hover:decoration-home-lantern ${focusRing} focus-visible:ring-offset-home-deep`;
  const headingClass = "font-display text-[1.4rem] font-semibold text-home-lantern";
  return (
    <section id="infos" aria-labelledby="infos-title" className="relative isolate scroll-mt-20 overflow-hidden bg-home-deep pb-14 pt-10 text-white sm:pb-20 sm:pt-14">
      {/* Même motif que « Quelques plats de la carte », discret : en haut, puis en fondu jusqu'à disparaître. */}
      <SeigaihaLines className="inset-x-0 top-0 -z-10 h-[18rem] [mask-image:linear-gradient(to_bottom,black,transparent)] sm:h-[22rem]" opacity={0.07} />
      {/* Et en bas, à l'inverse : le motif réapparaît en fondu jusqu'au bas de la section. */}
      <SeigaihaLines className="inset-x-0 bottom-0 -z-10 h-[18rem] [mask-image:linear-gradient(to_top,black,transparent)] sm:h-[22rem]" opacity={0.07} />
      <div className="mx-auto max-w-[90rem] px-5 sm:px-8 lg:px-12">
        <Eyebrow tone="dark">ご案内</Eyebrow>
        <h2 id="infos-title" className="mt-4 text-center font-display text-[2.5rem] font-semibold leading-[1.05] sm:text-[3.4rem]">
          Infos pratiques
        </h2>
        <div className="mt-6 grid gap-7 border-t border-home-lantern/30 pt-7 font-sans sm:mt-8 sm:gap-10 sm:pt-9 text-[1.02rem] leading-relaxed md:grid-cols-3 md:gap-0 md:divide-x md:divide-white/10">
          <div className="md:pr-10">
            <h3 className={headingClass}>Adresse</h3>
            <address className="mt-3 not-italic text-white/75">{SITE.address}</address>

            {/* Localisation : bouton à épingle rouge qui ouvre l'itinéraire dans Google Maps. */}
            <h3 id="localisation" className={`mt-7 scroll-mt-24 ${headingClass}`}>Localisation</h3>
            <a
              href={SITE.mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`group mt-3 inline-flex min-h-[46px] items-center gap-2.5 rounded-full border border-white/20 bg-white/[0.04] pl-3 pr-5 text-[0.95rem] text-white transition-colors hover:border-home-lantern/70 hover:bg-white/[0.08] ${focusRing} focus-visible:ring-offset-home-deep`}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden className="shrink-0 drop-shadow-[0_2px_5px_rgba(229,57,53,0.45)]">
                <path d="M12 2.5c-3.9 0-7 3-7 6.9 0 5 7 12.1 7 12.1s7-7.1 7-12.1c0-3.9-3.1-6.9-7-6.9Z" fill="#E53935" />
                <circle cx="12" cy="9.4" r="2.6" fill="#fff" />
              </svg>
              Ouvrir dans Google Maps
              <ArrowIcon className="h-4 w-4 text-home-lantern transition-transform group-hover:translate-x-1" />
              <span className="sr-only"> (nouvel onglet)</span>
            </a>
          </div>
          <div className="md:px-10">
            <h3 id="horaires" className={`scroll-mt-24 ${headingClass}`}>Horaires</h3>
            <dl className="mt-3 text-white/75">
              {SITE.hours.map(({ days, range }) => (
                <div key={days} className="flex justify-between gap-6 border-b border-white/10 py-2 first:pt-0 last:border-0">
                  <dt>{days}</dt>
                  <dd className="tabular-nums text-white">{range}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="md:pl-10">
            <h3 className={headingClass}>Contact</h3>
            <ul className="mt-3 grid grid-flow-col grid-cols-2 grid-rows-2 gap-x-4 gap-y-2 text-white/75">
              <li>
                <a href={`tel:+${SITE.phoneFixeE164}`} className={`inline-flex items-center gap-2.5 tabular-nums ${linkClass}`}>
                  <svg width="19" height="19" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-home-lantern">
                    <path d="M3.5 9.5c0-2.5 3.8-4.5 8.5-4.5s8.5 2 8.5 4.5v1.3a.9.9 0 0 1-.9.9h-2.4a.9.9 0 0 1-.9-.9V9.2c-1.3-.5-2.7-.7-4.3-.7s-3 .2-4.3.7v1.6a.9.9 0 0 1-.9.9H4.4a.9.9 0 0 1-.9-.9V9.5Z" />
                    <path d="M7.5 12.5 5.5 19.5h13l-2-7" />
                    <circle cx="12" cy="15.8" r="1.6" />
                  </svg>
                  {SITE.phoneFixeDisplay}
                </a>
              </li>
              <li>
                <a href={whatsappHref()} target="_blank" rel="noopener noreferrer" className={`inline-flex items-center gap-2.5 tabular-nums ${linkClass}`}>
                  <svg width="19" height="19" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-home-lantern">
                    <path d="M3.5 20.5l1.3-4.2A8.6 8.6 0 1 1 8 19.3l-4.5 1.2Z" />
                    <path d="M9 8.3c.2-.5.5-.6.8-.6h.5c.2 0 .4.1.5.4l.7 1.6c.1.2 0 .5-.1.6l-.5.6c-.1.2-.1.4 0 .5a6 6 0 0 0 2.6 2.4c.2.1.4.1.5 0l.6-.7c.2-.2.4-.2.6-.1l1.6.8c.2.1.3.3.3.5v.4c0 .4-.2.8-.6 1-.6.4-1.5.5-2.6.1a9.3 9.3 0 0 1-4.6-4.3c-.5-1-.4-2.1 0-2.9Z" />
                  </svg>
                  {SITE.phoneMobileDisplay}
                  <span className="sr-only"> (WhatsApp, nouvel onglet)</span>
                </a>
              </li>
              <li>
                <a href={`tel:+${SITE.callE164}`} className={`inline-flex items-center gap-2.5 tabular-nums ${linkClass}`}>
                  <svg width="19" height="19" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-home-lantern">
                    <path d="M5 4h3.2l1.6 4.2-2.1 1.3a11 11 0 0 0 6.8 6.8l1.3-2.1 4.2 1.6V19a1.8 1.8 0 0 1-1.9 1.8A15.6 15.6 0 0 1 3.2 6 1.8 1.8 0 0 1 5 4Z" />
                  </svg>
                  {SITE.callDisplay}
                  <span className="sr-only"> (portable)</span>
                </a>
              </li>
              <li>
                <a href={SITE.instagram} target="_blank" rel="noopener noreferrer" className={`inline-flex items-center gap-2.5 tabular-nums ${linkClass}`}>
                  <svg width="19" height="19" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.6" className="shrink-0 text-home-lantern">
                    <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
                    <circle cx="12" cy="12" r="4" />
                    <circle cx="17.2" cy="6.8" r="0.9" fill="currentColor" stroke="none" />
                  </svg>
                  {instagramHandle}
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
    <footer className="relative isolate overflow-hidden border-t border-home-lantern/40 bg-home-night pb-[max(1rem,env(safe-area-inset-bottom))] pt-8 font-sans text-white md:pt-10">
      <div className="mx-auto flex max-w-[90rem] flex-col gap-3 px-5 sm:px-8 md:flex-row md:items-center md:justify-between lg:px-12">
        <div className="flex items-center justify-center gap-3 md:justify-start">
          <BrandLogo size={44} className="ring-1 ring-home-lantern ring-offset-2 ring-offset-home-night" />
          <p className="font-display text-[1.35rem] font-medium">{SITE.nameAccent} Sushi</p>
        </div>
        <nav aria-label="Pied de page">
          <ul className="grid grid-cols-3 text-center text-[0.95rem] md:flex md:flex-wrap md:gap-x-7 md:text-left">
            {HOME_SECTIONS.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className={linkClass}>
                  {s.label}
                </a>
              </li>
            ))}
            <li>
              <a href="#localisation" className={linkClass}>
                Localisation
              </a>
            </li>
            <li>
              <a href={MENU_PATH} className={linkClass}>
                La carte
              </a>
            </li>
            <li>
              <a href="#horaires" className={linkClass}>
                Horaires
              </a>
            </li>
          </ul>
        </nav>
      </div>
      <p className="mx-auto mt-4 max-w-[90rem] border-t border-white/10 px-5 pt-4 text-center text-[0.82rem] text-white/50 sm:px-8 lg:px-12">
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
