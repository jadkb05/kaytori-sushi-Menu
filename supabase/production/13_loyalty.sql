-- À appliquer UNE FOIS sur Supabase (SQL Editor) après autorisation explicite.
-- Prérequis : 01_schema.sql (fonction public.is_admin) déjà appliqué. Aucun autre prérequis.
-- =============================================================================
-- PRODUCTION — 13 : carte de fidélité (fondations : données, droits, fonctions)
-- Contenu aligné sur supabase/migrations/20261026120000_loyalty.sql
--
-- Une seule transaction : tout ou rien. La garde ARRÊTE tout si un objet de la fidélité existe
-- déjà (aucun écrasement possible). AUCUN objet du menu n'est modifié.
-- Le programme est installé FERMÉ (loyalty.settings.is_active = false) : rien ne change pour
-- le public tant qu'un owner ne l'ouvre pas.
-- Ensuite : 14_loyalty_verify_readonly.sql (tout doit être ok), puis
-- 15_loyalty_grant_staff.template.sql pour chaque manager. Retour arrière : 98_loyalty_rollback.sql.
-- =============================================================================

begin;

do $guard$
begin
  if to_regprocedure('public.is_admin()') is null then
    raise exception 'ARRÊT — rien n''a été modifié : public.is_admin() absente (appliquer d''abord 01_schema.sql).';
  end if;
  if to_regclass('auth.users') is null then
    raise exception 'ARRÊT — rien n''a été modifié : auth.users absente (projet Supabase attendu).';
  end if;
  if to_regnamespace('loyalty') is not null then
    raise exception 'ARRÊT — rien n''a été modifié : le schéma loyalty existe déjà (script déjà appliqué ?).';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname like 'loyalty\_%') then
    raise exception 'ARRÊT — rien n''a été modifié : des fonctions public.loyalty_* existent déjà.';
  end if;
end
$guard$;

-- =============================================================================
-- Kaytôri Sushi — Kaytôri Club : programme de fidélité par points
--
-- AJOUTS UNIQUEMENT. Aucune table, politique ni fonction du menu n'est modifiée ;
-- is_admin() est seulement APPELÉE (un admin du site est propriétaire de la fidélité).
--
-- Isolement :
--   - les données vivent dans un schéma dédié « loyalty », jamais exposé par l'API :
--     anon / authenticated n'y ont aucun droit (ni USAGE, ni table) ; RLS activée sans
--     politique en défense supplémentaire. Lecture et écriture passent UNIQUEMENT par les
--     fonctions public.loyalty_* ci-dessous (SECURITY DEFINER, search_path vide, droits
--     vérifiés dans chaque fonction) : un solde ne peut jamais être modifié depuis le navigateur ;
--   - aucune dépendance de la fidélité vers les objets du menu (pas de trigger set_updated_at,
--     pas de politique utilisant is_admin()) : 99_rollback.sql du menu reste inchangé.
--
-- Rôles :
--   - owner      : admin du site (public.is_admin()) ou ligne loyalty.staff role = 'owner' ;
--   - manager    : ligne loyalty.staff role = 'manager' — fidélité uniquement, AUCUN droit sur le menu ;
--   - qr_manager : session temporaire ouverte par le code secret QR, limitée à la carte scannée ;
--   - public     : inscription, consultation de SA carte et échange de récompense (jeton personnel).
--   Les membres du personnel se déclarent en SQL (production/15_loyalty_grant_staff.template.sql).
--
-- Modèle de points :
--   - 1 point = 0,20 DH par défaut (point_value_centimes = 20), configurable en centimes entiers ;
--   - attribution à partir du montant du ticket selon le taux configuré (earning_points / earning_dirhams) ;
--   - catalogue de récompenses réel dans loyalty.rewards (coût en points, activation, archivage) ;
--   - journal immuable en ajout seul (loyalty.events) ; soldes toujours >= 0 ;
--   - conservation des colonnes et événements historiques de tampons pour l'audit sans conversion
--     automatique silencieuse.
--
-- Codes d'erreur (SQLSTATE, repris tels quels par supabase-js dans error.code) :
--   42501 droits insuffisants · KL001 nom invalide · KL002 téléphone invalide
--   KL003 numéro déjà inscrit · KL004 programme fermé · KL005 carte introuvable
--   KL006 carte suspendue · KL007 solde insuffisant ou récompense indisponible
--   KL008 opération déjà corrigée · KL009 correction impossible (points déjà utilisés)
--   KL010 motif obligatoire · KL011 identifiant de requête déjà utilisé pour une autre opération
--   KL012 trop de demandes · KL013 demande invalide · KL014 plafond ou seuil non respecté
--   KL015 session QR expirée ou invalide · KL016 programme ou code QR non configuré
--   KL017 récompense introuvable ou inactive
-- =============================================================================

create schema loyalty;
revoke all on schema loyalty from public;
comment on schema loyalty is
  'Programme de fidélité Kaytôri Club (points). Jamais exposé par l''API : accès uniquement via public.loyalty_*.';

-- -----------------------------------------------------------------------------
-- Tables
-- -----------------------------------------------------------------------------

-- Réglages : une seule ligne. Le programme est FERMÉ à l'installation (ouverture par un owner
-- via loyalty_update_settings) : rien n'est accessible au public avant le lancement.
create table loyalty.settings (
  id                           text primary key default 'default' check (id = 'default'),
  is_active                    boolean not null default false,
  -- Valeur monétaire d'un point en centimes de dirham (20 = 0,20 DH).
  point_value_centimes         integer not null default 20 check (point_value_centimes between 1 and 10000),
  -- Règle d'attribution : earning_points gagnés par tranche de earning_dirhams DH dépensés.
  -- Null par défaut tant que le responsable n'a pas fixé le taux d'attribution.
  earning_points               integer check (earning_points is null or earning_points between 1 and 10000),
  earning_dirhams              integer check (earning_dirhams is null or earning_dirhams between 1 and 10000),
  rounding_rule                text not null default 'floor' check (rounding_rule in ('floor', 'nearest', 'ceil')),
  min_ticket_centimes          integer not null default 0 check (min_ticket_centimes between 0 and 10000000),
  max_points_per_order         integer check (max_points_per_order is null or max_points_per_order between 1 and 1000000),
  max_points_per_day           integer check (max_points_per_day is null or max_points_per_day between 1 and 1000000),
  -- Fenêtre anti-double crédit accidentel sur une même carte (0 = désactivée).
  recent_credit_window_seconds integer not null default 60 check (recent_credit_window_seconds between 0 and 3600),
  -- Plafond global d'inscriptions par heure (anti-création en masse).
  signup_limit_per_hour        integer not null default 200 check (signup_limit_per_hour between 1 and 5000),
  -- Résumé des conditions du programme affiché aux membres.
  terms_summary                text check (terms_summary is null or char_length(terms_summary) between 1 and 500),
  -- Code secret du parcours rapide QR (empreinte salée SHA-256 uniquement, jamais en clair).
  qr_pin_salt                  bytea check (qr_pin_salt is null or octet_length(qr_pin_salt) = 16),
  qr_pin_hash                  bytea check (qr_pin_hash is null or octet_length(qr_pin_hash) = 32),
  qr_pin_updated_at            timestamptz,
  qr_session_ttl_seconds       integer not null default 300 check (qr_session_ttl_seconds between 60 and 3600),
  -- Champs historiques conservés pour compatibilité d'audit.
  reward_label                 text check (reward_label is null or char_length(reward_label) between 1 and 80),
  stamps_per_reward            integer not null default 10 check (stamps_per_reward = 10),
  max_pending_rewards          integer check (max_pending_rewards between 1 and 10),
  recent_stamp_window_seconds  integer not null default 120 check (recent_stamp_window_seconds between 0 and 3600),
  updated_at                   timestamptz not null default now(),
  updated_by                   uuid,
  constraint settings_earning_pair check ((earning_points is null) = (earning_dirhams is null)),
  constraint settings_qr_pin_pair check ((qr_pin_salt is null) = (qr_pin_hash is null))
);

insert into loyalty.settings (id) values ('default');

create table loyalty.staff (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  role       text not null check (role in ('manager', 'owner')),
  created_at timestamptz not null default now()
);

create table loyalty.customers (
  id          uuid primary key default gen_random_uuid(),
  full_name   text not null check (char_length(full_name) between 2 and 80),
  -- Nom sans casse ni accents (loyalty.fold) : recherche par le personnel.
  name_search text not null,
  -- Mobile marocain normalisé 0[67]XXXXXXXX (mêmes règles que normalizeMoroccanPhone).
  phone       text not null unique check (phone ~ '^0[67][0-9]{8}$'),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Catalogue des récompenses échangeables contre des points.
-- Une récompense créée n'est jamais supprimée physiquement (trigger reject_change) : elle est
-- désactivée ou archivée pour préserver l'intégrité des échanges historiques.
create table loyalty.rewards (
  id             uuid primary key default gen_random_uuid(),
  name           text not null check (char_length(name) between 2 and 80),
  description    text check (description is null or char_length(description) between 1 and 300),
  points_cost    integer not null check (points_cost between 1 and 1000000),
  conditions     text check (conditions is null or char_length(conditions) between 1 and 300),
  image_url      text check (image_url is null or (char_length(image_url) between 1 and 500 and image_url ~ '^(https?://|/)')),
  is_active      boolean not null default true,
  archived_at    timestamptz,
  sort_order     integer not null default 0 check (sort_order between -1000 and 10000),
  redeemed_count integer not null default 0 check (redeemed_count >= 0),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_by     uuid,
  updated_by     uuid
);

create index rewards_active_sort_idx on loyalty.rewards (is_active, sort_order, points_cost, created_at);

create table loyalty.cards (
  id                  uuid primary key default gen_random_uuid(),
  customer_id         uuid not null unique references loyalty.customers (id),
  -- Code du QR : aléatoire, sans donnée personnelle, sans droit direct.
  public_code         text not null unique check (public_code ~ '^[0-9A-HJKMNP-TV-Z]{12}$'),
  -- Empreinte SHA-256 du jeton d'accès du client (le jeton lui-même n'est jamais stocké).
  token_hash          bytea not null unique check (octet_length(token_hash) = 32),
  token_version       integer not null default 1 check (token_version >= 1),
  token_issued_at     timestamptz not null default now(),
  status              text not null default 'active' check (status in ('active', 'suspended')),
  -- Compteurs de points (toujours >= 0, synchronisés avec le journal loyalty.events).
  points_balance      integer not null default 0 check (points_balance >= 0),
  points_earned_total integer not null default 0 check (points_earned_total >= 0),
  points_spent_total  integer not null default 0 check (points_spent_total >= 0),
  rewards_redeemed    integer not null default 0 check (rewards_redeemed >= 0),
  last_points_at      timestamptz,
  last_activity_at    timestamptz,
  -- Compteurs historiques de tampons conservés pour l'audit (sans conversion automatique).
  stamps_total        integer not null default 0 check (stamps_total >= 0),
  stamps_in_cycle     integer generated always as (stamps_total % 10) stored,
  rewards_available   integer generated always as (greatest(0, stamps_total / 10 - rewards_redeemed)) stored,
  last_stamp_at       timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint cards_points_accounting check (points_earned_total - points_spent_total = points_balance)
);

-- Journal en AJOUT SEUL (triggers ci-dessous) : une erreur se corrige par un événement
-- compensatoire qui référence l'original ; rien n'est effacé ni réécrit.
create table loyalty.events (
  id                     uuid primary key default gen_random_uuid(),
  seq                    bigint generated always as identity unique,
  card_id                uuid references loyalty.cards (id),
  kind                   text not null check (kind in (
                           'card_created',
                           'points_credited', 'points_adjusted', 'points_reverted',
                           'reward_redeemed', 'reward_redemption_reverted',
                           'reward_created', 'reward_updated',
                           'access_reissued', 'customer_updated', 'card_status_changed',
                           'settings_updated', 'qr_pin_updated',
                           'stamp_added', 'stamp_reverted', 'reward_unlocked', 'reward_withdrawn')),
  points_delta           integer not null default 0,
  points_balance_after   integer check (points_balance_after is null or points_balance_after >= 0),
  ticket_amount_centimes integer check (ticket_amount_centimes is null or ticket_amount_centimes > 0),
  order_ref              text check (order_ref is null or char_length(order_ref) between 1 and 60),
  reward_id              uuid references loyalty.rewards (id),
  reward_name            text,
  redemption_code        text,
  stamps_delta           smallint not null default 0,
  redeemed_delta         smallint not null default 0,
  stamps_total_after     integer,
  rewards_redeemed_after integer,
  -- Correction : au plus UNE par événement d'origine (unique).
  reverts_event_id       uuid unique references loyalty.events (id),
  related_event_id       uuid references loyalty.events (id),
  reason                 text check (reason is null or char_length(reason) between 3 and 300),
  actor_user_id          uuid,
  actor_role             text not null check (actor_role in ('public', 'manager', 'owner', 'qr_manager')),
  -- Identifiant de requête fourni par le navigateur : un nouvel essai ne refait rien.
  idempotency_key        uuid unique,
  details                jsonb not null default '{}'::jsonb,
  created_at             timestamptz not null default now(),
  constraint events_card_required check (
    (kind in ('settings_updated', 'qr_pin_updated', 'reward_created', 'reward_updated')) = (card_id is null)),
  constraint events_deltas check (
    case kind
      when 'points_credited'            then points_delta > 0  and redeemed_delta = 0 and stamps_delta = 0 and ticket_amount_centimes is not null
      when 'points_adjusted'            then points_delta <> 0 and redeemed_delta = 0 and stamps_delta = 0
      when 'points_reverted'            then points_delta <> 0 and redeemed_delta = 0 and stamps_delta = 0
      when 'reward_redeemed'            then points_delta <= 0 and redeemed_delta = 1 and stamps_delta = 0
      when 'reward_redemption_reverted' then points_delta >= 0 and redeemed_delta = -1 and stamps_delta = 0
      when 'stamp_added'                then stamps_delta = 1  and redeemed_delta = 0 and points_delta = 0
      when 'stamp_reverted'             then stamps_delta = -1 and redeemed_delta = 0 and points_delta = 0
      else points_delta = 0 and redeemed_delta = 0 and stamps_delta = 0
    end),
  constraint events_revert_link check (
    (kind in ('points_reverted', 'stamp_reverted', 'reward_redemption_reverted')) = (reverts_event_id is not null)),
  constraint events_reason_required check (
    kind not in ('points_adjusted', 'points_reverted', 'stamp_reverted', 'reward_redemption_reverted', 'customer_updated', 'card_status_changed')
    or reason is not null)
);

create index events_card_seq_idx on loyalty.events (card_id, seq desc);
create index events_kind_created_idx on loyalty.events (kind, created_at desc);
create index events_reward_idx on loyalty.events (reward_id) where reward_id is not null;

-- État de protection du code secret QR (limitation serveur des tentatives échouées).
create table loyalty.qr_state (
  id              text primary key default 'default' check (id = 'default'),
  failed_attempts integer not null default 0 check (failed_attempts >= 0),
  last_failed_at  timestamptz,
  locked_until    timestamptz
);

insert into loyalty.qr_state (id) values ('default');

-- Sessions temporaires de scan QR, strictement limitées à une carte précise.
create table loyalty.qr_sessions (
  id          uuid primary key default gen_random_uuid(),
  token_hash  bytea not null unique check (octet_length(token_hash) = 32),
  card_id     uuid not null references loyalty.cards (id),
  expires_at  timestamptz not null,
  used_count  integer not null default 0 check (used_count >= 0),
  revoked_at  timestamptz,
  created_at  timestamptz not null default now()
);

create index qr_sessions_card_idx on loyalty.qr_sessions (card_id, expires_at desc);

alter table loyalty.settings    enable row level security;
alter table loyalty.staff       enable row level security;
alter table loyalty.customers   enable row level security;
alter table loyalty.rewards     enable row level security;
alter table loyalty.cards       enable row level security;
alter table loyalty.events      enable row level security;
alter table loyalty.qr_state    enable row level security;
alter table loyalty.qr_sessions enable row level security;

-- -----------------------------------------------------------------------------
-- Protections : journal immuable, fiches, cartes et récompenses jamais supprimées
-- -----------------------------------------------------------------------------

create function loyalty.reject_change() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Fidélité : % interdit sur loyalty.% (historique conservé).', tg_op, tg_table_name
    using errcode = '42501';
end;
$$;

create trigger events_append_only before update or delete on loyalty.events
  for each row execute function loyalty.reject_change();
create trigger events_no_truncate before truncate on loyalty.events
  for each statement execute function loyalty.reject_change();
create trigger cards_no_delete before delete on loyalty.cards
  for each row execute function loyalty.reject_change();
create trigger cards_no_truncate before truncate on loyalty.cards
  for each statement execute function loyalty.reject_change();
create trigger customers_no_delete before delete on loyalty.customers
  for each row execute function loyalty.reject_change();
create trigger customers_no_truncate before truncate on loyalty.customers
  for each statement execute function loyalty.reject_change();
create trigger rewards_no_delete before delete on loyalty.rewards
  for each row execute function loyalty.reject_change();
create trigger rewards_no_truncate before truncate on loyalty.rewards
  for each statement execute function loyalty.reject_change();

-- -----------------------------------------------------------------------------
-- Fonctions internes (schéma loyalty : inaccessibles depuis l'API)
-- -----------------------------------------------------------------------------

-- Espaces au sens de JavaScript (\s) : mêmes séparateurs que normalizeMoroccanPhone.
create function loyalty.space_class() returns text
language sql immutable
set search_path = ''
as $$
  select '[:space:]' || chr(160) || chr(5760) || chr(8192) || '-' || chr(8202)
         || chr(8232) || chr(8233) || chr(8239) || chr(8287) || chr(12288) || chr(65279);
$$;

-- Miroir SQL de normalizeMoroccanPhone (src/cart/checkout.ts) : 06/07 uniquement, accepte
-- +212 / 00212 / 212, espaces, points, tirets, parenthèses. Retourne 0XXXXXXXXX ou null.
create function loyalty.normalize_phone(p_raw text) returns text
language plpgsql immutable
set search_path = ''
as $$
declare
  v text;
begin
  if p_raw is null then
    return null;
  end if;
  v := regexp_replace(p_raw, '[' || loyalty.space_class() || '.()-]', '', 'g');
  if v = '' then
    return null;
  end if;
  if left(v, 4) = '+212' then
    v := '0' || substr(v, 5);
  elsif left(v, 5) = '00212' then
    v := '0' || substr(v, 6);
  elsif v ~ '^212[67][0-9]{8}$' then
    v := '0' || substr(v, 4);
  end if;
  if v !~ '^0[67][0-9]{8}$' then
    return null;
  end if;
  return v;
end;
$$;

-- Nom affiché : espaces réduits, 2 à 80 caractères, sans caractère de contrôle,
-- au moins un caractère qui n'est ni chiffre ni ponctuation. null si invalide.
create function loyalty.clean_name(p_raw text) returns text
language plpgsql immutable
set search_path = ''
as $$
declare
  v text;
begin
  if p_raw is null then
    return null;
  end if;
  v := btrim(regexp_replace(p_raw, '[' || loyalty.space_class() || ']+', ' ', 'g'));
  if v ~ '[[:cntrl:]]' or char_length(v) < 2 or char_length(v) > 80 then
    return null;
  end if;
  if v !~ '[^[:space:][:digit:][:punct:]]' then
    return null;
  end if;
  return v;
end;
$$;

-- Forme de recherche : minuscules, sans accents (français), tirets et apostrophes → espace.
create function loyalty.fold(p_raw text) returns text
language sql immutable
set search_path = ''
as $$
  select btrim(regexp_replace(regexp_replace(lower(
           replace(replace(replace(replace(replace(
             translate(coalesce(p_raw, ''),
               'ÀÁÂÃÄÅàáâãäåÇçÈÉÊËèéêëÌÍÎÏìíîïÑñÒÓÔÕÖØòóôõöøÙÚÛÜùúûüÝŸýÿ',
               'AAAAAAaaaaaaCcEEEEeeeeIIIIiiiiNnOOOOOOooooooUUUUuuuuYYyy'),
             'Œ', 'oe'), 'œ', 'oe'), 'Æ', 'ae'), 'æ', 'ae'), 'ß', 'ss')),
           '[-''’`´.]', ' ', 'g'), '\s+', ' ', 'g'));
$$;

-- Jeton d'accès : 43 caractères base64url (256 bits), généré par le navigateur
-- (crypto.getRandomValues). Seule son empreinte SHA-256 est stockée. null si format invalide.
create function loyalty.token_hash(p_token text) returns bytea
language sql immutable
set search_path = ''
as $$
  select case when p_token ~ '^[A-Za-z0-9_-]{43}$' then sha256(convert_to(p_token, 'UTF8')) end;
$$;

-- Code public du QR : 12 caractères base32 Crockford (60 bits, sans I L O U), aléa CSPRNG.
create function loyalty.new_public_code() returns text
language plpgsql volatile
set search_path = ''
as $$
declare
  alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  b bytea := sha256(decode(replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''), 'hex'));
  code text := '';
  i integer;
begin
  for i in 0..11 loop
    code := code || substr(alphabet, (get_byte(b, i) % 32) + 1, 1);
  end loop;
  return code;
end;
$$;

-- Code court de présentation d'un échange de récompense au comptoir (ex. KR-8F4K2M).
create function loyalty.new_redemption_code() returns text
language sql volatile
set search_path = ''
as $$
  select 'KR-' || substr(loyalty.new_public_code(), 1, 6);
$$;

-- Saisie manuelle d'un code : majuscules, sans espaces ni tirets, O→0, I/L→1.
create function loyalty.clean_public_code(p_raw text) returns text
language sql immutable
set search_path = ''
as $$
  select translate(upper(regexp_replace(coalesce(p_raw, ''), '[[:space:]-]', '', 'g')), 'OIL', '011');
$$;

create function loyalty.clean_reason(p_raw text) returns text
language sql immutable
set search_path = ''
as $$
  select case when char_length(v) between 3 and 300 and v !~ '[[:cntrl:]]' then v end
  from (select btrim(regexp_replace(coalesce(p_raw, ''), '\s+', ' ', 'g')) as v) s;
$$;

create function loyalty.clean_order_ref(p_raw text) returns text
language sql immutable
set search_path = ''
as $$
  select case when char_length(v) between 1 and 60 and v !~ '[[:cntrl:]]' then v end
  from (select btrim(regexp_replace(coalesce(p_raw, ''), '\s+', ' ', 'g')) as v) s;
$$;

create function loyalty.format_phone(p_phone text) returns text
language sql immutable
set search_path = ''
as $$
  select substr(p_phone, 1, 2) || ' ' || substr(p_phone, 3, 2) || ' ' || substr(p_phone, 5, 2)
         || ' ' || substr(p_phone, 7, 2) || ' ' || substr(p_phone, 9, 2);
$$;

-- « 06 •• •• •• 78 » (p_visible_pairs = 1) ou « 06 •• •• 56 78 » (2).
create function loyalty.mask_phone(p_phone text, p_visible_pairs integer) returns text
language sql immutable
set search_path = ''
as $$
  select substr(p_phone, 1, 2) || repeat(' ••', 4 - p_visible_pairs)
         || (select coalesce(string_agg(' ' || substr(p_phone, 11 - 2 * k, 2), '' order by k desc), '')
             from generate_series(1, p_visible_pairs) k);
$$;

-- Rôle fidélité de la session : 'owner' (admin du site ou staff owner), 'manager', ou null.
create function loyalty.staff_role() returns text
language sql stable
set search_path = ''
as $$
  select case
    when auth.uid() is null then null
    when public.is_admin() then 'owner'
    else (select s.role from loyalty.staff s where s.user_id = auth.uid())
  end;
$$;

create function loyalty.require_staff(p_min_role text) returns text
language plpgsql stable
set search_path = ''
as $$
declare
  v_role text := loyalty.staff_role();
begin
  if v_role is null or (p_min_role = 'owner' and v_role <> 'owner') then
    raise exception 'Accès refusé : droits de gestion de la fidélité requis.' using errcode = '42501';
  end if;
  return v_role;
end;
$$;

-- Nouvel essai d'une même requête (réponse perdue, double clic) : renvoie l'événement déjà
-- enregistré, ou null si la requête est nouvelle. Même identifiant pour une AUTRE opération : KL011.
create function loyalty.find_replay(p_request_id uuid, p_kind text, p_card_id uuid, p_reverts uuid default null)
returns uuid
language plpgsql stable
set search_path = ''
as $$
declare
  e loyalty.events%rowtype;
begin
  select * into e from loyalty.events where idempotency_key = p_request_id;
  if not found then
    return null;
  end if;
  if e.kind <> p_kind or e.card_id is distinct from p_card_id or e.reverts_event_id is distinct from p_reverts then
    raise exception 'Cet identifiant de requête a déjà servi pour une autre opération.' using errcode = 'KL011';
  end if;
  return e.id;
end;
$$;

-- Calcul entier exact des points gagnés sur un ticket (en centimes).
create function loyalty.compute_ticket_points(p_ticket_centimes integer, s loyalty.settings)
returns integer
language plpgsql immutable
set search_path = ''
as $$
declare
  v_num bigint;
  v_denom bigint;
  v_points integer;
begin
  if s.earning_points is null or s.earning_dirhams is null then
    raise exception 'Le taux d''attribution des points n''est pas encore configuré par le responsable.'
      using errcode = 'KL016';
  end if;
  if p_ticket_centimes is null or p_ticket_centimes <= 0 or p_ticket_centimes > 100000000 then
    raise exception 'Indiquez un montant de ticket valide.' using errcode = 'KL013';
  end if;
  if p_ticket_centimes < s.min_ticket_centimes then
    raise exception 'Le montant du ticket est inférieur au minimum requis pour gagner des points.'
      using errcode = 'KL014';
  end if;
  v_num := (p_ticket_centimes::bigint) * (s.earning_points::bigint);
  v_denom := (s.earning_dirhams::bigint) * 100;
  v_points := case s.rounding_rule
    when 'ceil' then ((v_num + v_denom - 1) / v_denom)::integer
    when 'nearest' then ((v_num + (v_denom / 2)) / v_denom)::integer
    else (v_num / v_denom)::integer
  end;
  if s.max_points_per_order is not null and v_points > s.max_points_per_order then
    v_points := s.max_points_per_order;
  end if;
  if v_points <= 0 then
    raise exception 'Ce montant ne donne droit à aucun point selon la règle actuelle.'
      using errcode = 'KL014';
  end if;
  return v_points;
end;
$$;

-- Catalogue actif des récompenses (pour l'espace client et les informations publiques).
create function loyalty.active_rewards_json(p_balance integer default null, p_card_active boolean default true)
returns jsonb
language sql stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id,
    'name', r.name,
    'description', r.description,
    'pointsCost', r.points_cost,
    'conditions', r.conditions,
    'imageUrl', r.image_url,
    'sortOrder', r.sort_order,
    'available', case when p_balance is null then true else (p_card_active and p_balance >= r.points_cost) end,
    'pointsMissing', case when p_balance is null then 0 else greatest(0, r.points_cost - p_balance) end
  ) order by r.sort_order asc, r.points_cost asc, r.created_at asc), '[]'::jsonb)
  from loyalty.rewards r
  where r.is_active = true and r.archived_at is null;
$$;

-- Historique récent vu par le titulaire de la carte (sans identifiants internes ni e-mail du personnel).
create function loyalty.public_card_history_json(p_card_id uuid)
returns jsonb
language sql stable
set search_path = ''
as $$
  with recent as (
    select e.*, r.id as reverted_by
    from loyalty.events e
    left join loyalty.events r on r.reverts_event_id = e.id
    where e.card_id = p_card_id
      and e.kind in ('card_created', 'points_credited', 'points_adjusted', 'points_reverted',
                     'reward_redeemed', 'reward_redemption_reverted')
    order by e.seq desc
    limit 30
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'eventId', id,
    'seq', seq,
    'kind', kind,
    'createdAt', created_at,
    'pointsDelta', points_delta,
    'pointsBalanceAfter', points_balance_after,
    'ticketAmountCentimes', ticket_amount_centimes,
    'orderRef', order_ref,
    'rewardId', reward_id,
    'rewardName', reward_name,
    'redemptionCode', redemption_code,
    'reason', reason,
    'revertsEventId', reverts_event_id,
    'revertedByEventId', reverted_by
  ) order by seq desc), '[]'::jsonb)
  from recent;
$$;

-- Carte vue par son titulaire : jamais le numéro complet ni les identifiants internes.
create function loyalty.public_card_json(p_card_id uuid) returns jsonb
language sql stable
set search_path = ''
as $$
  select jsonb_build_object(
    'fullName', u.full_name,
    'phoneMasked', loyalty.mask_phone(u.phone, 1),
    'publicCode', c.public_code,
    'status', c.status,
    'pointsBalance', c.points_balance,
    'pointsEarnedTotal', c.points_earned_total,
    'pointsSpentTotal', c.points_spent_total,
    'rewardsRedeemed', c.rewards_redeemed,
    'pointValueCentimes', s.point_value_centimes,
    'earningPoints', s.earning_points,
    'earningDirhams', s.earning_dirhams,
    'roundingRule', s.rounding_rule,
    'minTicketCentimes', s.min_ticket_centimes,
    'maxPointsPerOrder', s.max_points_per_order,
    'maxPointsPerDay', s.max_points_per_day,
    'termsSummary', s.terms_summary,
    'programActive', s.is_active,
    'lastPointsAt', c.last_points_at,
    'lastActivityAt', c.last_activity_at,
    'createdAt', c.created_at,
    'rewards', loyalty.active_rewards_json(c.points_balance, c.status = 'active'),
    'history', loyalty.public_card_history_json(c.id))
  from loyalty.cards c
  join loyalty.customers u on u.id = c.customer_id
  cross join loyalty.settings s
  where c.id = p_card_id and s.id = 'default';
$$;

-- Fiche vue par le personnel.
create function loyalty.staff_card_json(p_card_id uuid) returns jsonb
language sql stable
set search_path = ''
as $$
  select jsonb_build_object(
    'cardId', c.id,
    'publicCode', c.public_code,
    'fullName', u.full_name,
    'phone', loyalty.format_phone(u.phone),
    'status', c.status,
    'pointsBalance', c.points_balance,
    'pointsEarnedTotal', c.points_earned_total,
    'pointsSpentTotal', c.points_spent_total,
    'rewardsRedeemed', c.rewards_redeemed,
    'stampsTotal', c.stamps_total,
    'pointValueCentimes', s.point_value_centimes,
    'lastPointsAt', c.last_points_at,
    'lastActivityAt', c.last_activity_at,
    'tokenVersion', c.token_version,
    'tokenIssuedAt', c.token_issued_at,
    'createdAt', c.created_at)
  from loyalty.cards c
  join loyalty.customers u on u.id = c.customer_id
  cross join loyalty.settings s
  where c.id = p_card_id and s.id = 'default';
$$;

-- Réponse standard d'une opération du personnel sur une carte.
create function loyalty.result(p_status text, p_card_id uuid, p_event_id uuid, p_replayed boolean, p_extra jsonb default '{}'::jsonb)
returns jsonb
language sql stable
set search_path = ''
as $$
  select jsonb_build_object('status', p_status, 'replayed', p_replayed, 'eventId', p_event_id,
                            'card', loyalty.staff_card_json(p_card_id)) || coalesce(p_extra, '{}'::jsonb);
$$;

-- Carte verrouillée (FOR UPDATE) : sérialise toutes les opérations concurrentes sur une carte.
create function loyalty.lock_card(p_card_id uuid) returns loyalty.cards
language plpgsql
set search_path = ''
as $$
declare
  c loyalty.cards%rowtype;
begin
  select * into c from loyalty.cards where id = p_card_id for update;
  if not found then
    raise exception 'Carte de fidélité introuvable.' using errcode = 'KL005';
  end if;
  return c;
end;
$$;

-- Dernier crédit ou échange de points valide d'une carte.
create function loyalty.last_valid_points_at(p_card_id uuid) returns timestamptz
language sql stable
set search_path = ''
as $$
  select max(e.created_at) from loyalty.events e
  where e.card_id = p_card_id and e.kind in ('points_credited', 'points_adjusted', 'reward_redeemed')
    and not exists (select 1 from loyalty.events r where r.reverts_event_id = e.id);
$$;

-- Points déjà crédités par ticket aujourd'hui (fuseau Africa/Casablanca), hors crédits annulés.
create function loyalty.points_credited_today(p_card_id uuid) returns integer
language sql stable
set search_path = ''
as $$
  select coalesce(sum(e.points_delta), 0)::integer
  from loyalty.events e
  where e.card_id = p_card_id
    and e.kind = 'points_credited'
    and e.created_at >= (date_trunc('day', now() at time zone 'Africa/Casablanca') at time zone 'Africa/Casablanca')
    and not exists (select 1 from loyalty.events r where r.reverts_event_id = e.id);
$$;

-- Empreinte des réglages sans exposer les secrets QR (pour le journal d'audit).
create function loyalty.settings_audit_json(s loyalty.settings) returns jsonb
language sql immutable
set search_path = ''
as $$
  select to_jsonb(s) - 'id' - 'updated_at' - 'updated_by' - 'qr_pin_salt' - 'qr_pin_hash'
         || jsonb_build_object('qr_pin_configured', s.qr_pin_hash is not null);
$$;

revoke all on all functions in schema loyalty from public;
revoke all on all tables in schema loyalty from public;

-- =============================================================================
-- API (schéma public). Toutes SECURITY DEFINER : les tables ne sont accordées à aucun rôle
-- de l'API, la fonction s'exécute avec les droits de son propriétaire APRÈS avoir vérifié
-- elle-même les droits de l'appelant (auth.uid() reste celui de l'appelant).
-- search_path vide et objets entièrement qualifiés : aucune substitution d'objet possible.
-- =============================================================================

-- Rôle de la session (routage de l'interface). Aucune donnée.
create function public.loyalty_my_role() returns text
language sql stable
security definer
set search_path = ''
as $$
  select loyalty.staff_role();
$$;

-- Informations publiques du programme ; réglages complets pour le personnel (sans secret QR).
create function public.loyalty_program() returns jsonb
language plpgsql stable
security definer
set search_path = ''
as $$
declare
  s loyalty.settings%rowtype;
  v_role text := loyalty.staff_role();
  v jsonb;
begin
  select * into s from loyalty.settings where id = 'default';
  v := jsonb_build_object(
    'isActive', s.is_active,
    'pointValueCentimes', s.point_value_centimes,
    'earningPoints', s.earning_points,
    'earningDirhams', s.earning_dirhams,
    'roundingRule', s.rounding_rule,
    'minTicketCentimes', s.min_ticket_centimes,
    'maxPointsPerOrder', s.max_points_per_order,
    'maxPointsPerDay', s.max_points_per_day,
    'termsSummary', s.terms_summary,
    'rewardLabel', s.reward_label,
    'rewards', loyalty.active_rewards_json(),
    'role', v_role);
  if v_role is not null then
    v := v || jsonb_build_object(
      'recentCreditWindowSeconds', s.recent_credit_window_seconds,
      'signupLimitPerHour', s.signup_limit_per_hour,
      'qrPinConfigured', s.qr_pin_hash is not null,
      'qrPinUpdatedAt', s.qr_pin_updated_at,
      'qrSessionTtlSeconds', s.qr_session_ttl_seconds,
      'updatedAt', s.updated_at);
  end if;
  return v;
end;
$$;

-- -----------------------------------------------------------------------------
-- Inscription (public). DEFINER : crée fiche + carte sans compte Supabase Auth.
-- Le navigateur fournit son jeton (secret, 256 bits) et un identifiant de requête :
-- un nouvel essai avec le même couple renvoie la même carte (réponse perdue après succès,
-- double clic) sans rien créer ; le jeton n'a jamais besoin d'être renvoyé ni stocké en clair.
-- -----------------------------------------------------------------------------
create function loyalty.registration_replay(p_request_id uuid, p_hash bytea, p_phone text) returns uuid
language plpgsql stable
set search_path = ''
as $$
declare
  e loyalty.events%rowtype;
begin
  select * into e from loyalty.events where idempotency_key = p_request_id;
  if not found then
    return null;
  end if;
  if e.kind <> 'card_created' or not exists (
       select 1 from loyalty.cards c join loyalty.customers u on u.id = c.customer_id
       where c.id = e.card_id and c.token_hash = p_hash and u.phone = p_phone) then
    raise exception 'Cet identifiant de requête a déjà servi pour une autre opération.' using errcode = 'KL011';
  end if;
  return e.card_id;
end;
$$;
revoke all on function loyalty.registration_replay(uuid, bytea, text) from public;

create function public.loyalty_register(p_full_name text, p_phone text, p_token text, p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := loyalty.clean_name(p_full_name);
  v_phone text := loyalty.normalize_phone(p_phone);
  v_hash bytea := loyalty.token_hash(p_token);
  s loyalty.settings%rowtype;
  v_customer uuid;
  v_card uuid;
  v_recent integer;
  i integer;
begin
  if p_request_id is null or v_hash is null then
    raise exception 'Demande invalide.' using errcode = 'KL013';
  end if;
  if v_name is null then
    raise exception 'Indiquez votre nom et prénom (2 à 80 caractères).' using errcode = 'KL001';
  end if;
  if v_phone is null then
    raise exception 'Numéro invalide. Exemple : 06 12 34 56 78.' using errcode = 'KL002';
  end if;

  v_card := loyalty.registration_replay(p_request_id, v_hash, v_phone);
  if v_card is not null then
    return jsonb_build_object('status', 'created', 'replayed', true, 'card', loyalty.public_card_json(v_card));
  end if;

  select * into s from loyalty.settings where id = 'default';
  if not s.is_active then
    raise exception 'Le programme de fidélité n''est pas ouvert pour le moment.' using errcode = 'KL004';
  end if;
  select count(*) into v_recent from loyalty.events
  where kind = 'card_created' and created_at > now() - interval '1 hour';
  if v_recent >= s.signup_limit_per_hour then
    raise exception 'Trop d''inscriptions en ce moment. Réessayez dans quelques minutes.' using errcode = 'KL012';
  end if;

  begin
    insert into loyalty.customers (full_name, name_search, phone)
    values (v_name, loyalty.fold(v_name), v_phone)
    returning id into v_customer;
  exception when unique_violation then
    v_card := loyalty.registration_replay(p_request_id, v_hash, v_phone);
    if v_card is not null then
      return jsonb_build_object('status', 'created', 'replayed', true, 'card', loyalty.public_card_json(v_card));
    end if;
    raise exception 'Ce numéro a déjà une carte de fidélité.' using errcode = 'KL003';
  end;

  for i in 1..5 loop
    begin
      insert into loyalty.cards (customer_id, public_code, token_hash, last_activity_at)
      values (v_customer, loyalty.new_public_code(), v_hash, now())
      returning id into v_card;
      exit;
    exception when unique_violation then
      if exists (select 1 from loyalty.cards where token_hash = v_hash) then
        raise exception 'Demande invalide.' using errcode = 'KL013';
      end if;
      if i = 5 then
        raise;
      end if;
    end;
  end loop;

  begin
    insert into loyalty.events (card_id, kind, actor_user_id, actor_role, idempotency_key,
                                points_balance_after, stamps_total_after, rewards_redeemed_after)
    values (v_card, 'card_created', auth.uid(), 'public', p_request_id, 0, 0, 0);
  exception when unique_violation then
    raise exception 'Cet identifiant de requête a déjà servi pour une autre opération.' using errcode = 'KL011';
  end;

  return jsonb_build_object('status', 'created', 'replayed', false, 'card', loyalty.public_card_json(v_card));
end;
$$;

-- -----------------------------------------------------------------------------
-- Consultation de SA carte (public). DEFINER : lecture ciblée par empreinte du jeton.
-- Jeton inconnu ou remplacé : même réponse qu'un jeton mal formé (aucun indice).
-- -----------------------------------------------------------------------------
create function public.loyalty_card_view(p_token text) returns jsonb
language plpgsql stable
security definer
set search_path = ''
as $$
declare
  v_hash bytea := loyalty.token_hash(p_token);
  v_card uuid;
begin
  if v_hash is not null then
    select id into v_card from loyalty.cards where token_hash = v_hash;
  end if;
  if v_card is null then
    raise exception 'Carte introuvable. Le lien est incomplet ou a été remplacé.' using errcode = 'KL005';
  end if;
  return loyalty.public_card_json(v_card);
end;
$$;

-- -----------------------------------------------------------------------------
-- Échange d'une récompense par le titulaire de la carte (public, jeton personnel).
-- Débit atomique des points, incrément du compteur de la récompense et création d'un code
-- d'échange à présenter au comptoir. Idempotent via p_request_id.
-- -----------------------------------------------------------------------------
create function public.loyalty_client_redeem_reward(p_token text, p_reward_id uuid, p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hash bytea := loyalty.token_hash(p_token);
  v_card_id uuid;
  c loyalty.cards%rowtype;
  r loyalty.rewards%rowtype;
  e loyalty.events%rowtype;
  v_event uuid;
  v_code text;
begin
  if p_request_id is null or p_reward_id is null or v_hash is null then
    raise exception 'Demande invalide.' using errcode = 'KL013';
  end if;
  select id into v_card_id from loyalty.cards where token_hash = v_hash;
  if v_card_id is null then
    raise exception 'Carte introuvable. Le lien est incomplet ou a été remplacé.' using errcode = 'KL005';
  end if;

  c := loyalty.lock_card(v_card_id);
  v_event := loyalty.find_replay(p_request_id, 'reward_redeemed', c.id);
  if v_event is not null then
    select * into e from loyalty.events where id = v_event;
    if e.reward_id is distinct from p_reward_id then
      raise exception 'Cet identifiant de requête a déjà servi pour une autre opération.' using errcode = 'KL011';
    end if;
    return jsonb_build_object(
      'status', 'ok',
      'replayed', true,
      'eventId', e.id,
      'redemption', jsonb_build_object(
        'eventId', e.id,
        'rewardId', e.reward_id,
        'rewardName', e.reward_name,
        'pointsCost', -e.points_delta,
        'redemptionCode', e.redemption_code,
        'createdAt', e.created_at
      ),
      'card', loyalty.public_card_json(c.id));
  end if;

  if c.status <> 'active' then
    raise exception 'Cette carte est suspendue.' using errcode = 'KL006';
  end if;

  select * into r from loyalty.rewards where id = p_reward_id for update;
  if not found or not r.is_active or r.archived_at is not null then
    raise exception 'Cette récompense n''est plus disponible.' using errcode = 'KL017';
  end if;

  if c.points_balance < r.points_cost then
    raise exception 'Solde de points insuffisant pour échanger cette récompense.' using errcode = 'KL007';
  end if;

  v_code := loyalty.new_redemption_code();

  update loyalty.cards
     set points_balance = points_balance - r.points_cost,
         points_spent_total = points_spent_total + r.points_cost,
         rewards_redeemed = rewards_redeemed + 1,
         last_points_at = now(),
         last_activity_at = now(),
         updated_at = now()
   where id = c.id
   returning * into c;

  update loyalty.rewards
     set redeemed_count = redeemed_count + 1,
         updated_at = now()
   where id = r.id;

  insert into loyalty.events (
    card_id, kind, points_delta, points_balance_after, redeemed_delta,
    reward_id, reward_name, redemption_code, stamps_total_after, rewards_redeemed_after,
    actor_user_id, actor_role, idempotency_key, details
  ) values (
    c.id, 'reward_redeemed', -r.points_cost, c.points_balance, 1,
    r.id, r.name, v_code, c.stamps_total, c.rewards_redeemed,
    auth.uid(), 'public', p_request_id,
    jsonb_build_object('pointsCost', r.points_cost, 'rewardName', r.name, 'redemptionCode', v_code, 'initiatedBy', 'client')
  ) returning * into e;

  return jsonb_build_object(
    'status', 'ok',
    'replayed', false,
    'eventId', e.id,
    'redemption', jsonb_build_object(
      'eventId', e.id,
      'rewardId', r.id,
      'rewardName', r.name,
      'pointsCost', r.points_cost,
      'redemptionCode', v_code,
      'createdAt', e.created_at
    ),
    'card', loyalty.public_card_json(c.id));
end;
$$;

-- -----------------------------------------------------------------------------
-- Parcours rapide Manager via QR code (/fidelite/scan/:code)
-- 1. loyalty_qr_card_status : vérifie le code QR et l'état du programme sans révéler de données.
-- 2. loyalty_qr_unlock : vérifie le code secret côté serveur (avec limitation des essais) et
--    délivre un jeton de session temporaire limité à cette carte.
-- 3. loyalty_qr_credit_points : crédite les points du ticket sur cette carte uniquement.
-- 4. loyalty_qr_close_session : ferme immédiatement la session rapide.
-- -----------------------------------------------------------------------------

create function public.loyalty_qr_card_status(p_public_code text) returns jsonb
language plpgsql stable
security definer
set search_path = ''
as $$
declare
  v_code text := loyalty.clean_public_code(p_public_code);
  c loyalty.cards%rowtype;
  s loyalty.settings%rowtype;
  q loyalty.qr_state%rowtype;
begin
  if v_code !~ '^[0-9A-HJKMNP-TV-Z]{12}$' then
    return jsonb_build_object('status', 'invalid_code');
  end if;
  select * into c from loyalty.cards where public_code = v_code;
  if not found then
    return jsonb_build_object('status', 'not_found', 'publicCode', v_code);
  end if;
  select * into s from loyalty.settings where id = 'default';
  if not s.is_active then
    return jsonb_build_object('status', 'program_closed', 'publicCode', v_code);
  end if;
  if s.earning_points is null or s.earning_dirhams is null then
    return jsonb_build_object('status', 'unconfigured_earning', 'publicCode', v_code);
  end if;
  if s.qr_pin_hash is null then
    return jsonb_build_object('status', 'unconfigured_pin', 'publicCode', v_code);
  end if;
  if c.status <> 'active' then
    return jsonb_build_object('status', 'card_suspended', 'publicCode', v_code);
  end if;
  select * into q from loyalty.qr_state where id = 'default';
  if q.locked_until is not null and q.locked_until > now() then
    return jsonb_build_object(
      'status', 'locked',
      'publicCode', v_code,
      'retryAfterSeconds', greatest(1, ceil(extract(epoch from (q.locked_until - now())))::integer)
    );
  end if;
  return jsonb_build_object(
    'status', 'ready',
    'publicCode', v_code,
    'pointValueCentimes', s.point_value_centimes,
    'earningPoints', s.earning_points,
    'earningDirhams', s.earning_dirhams,
    'roundingRule', s.rounding_rule,
    'minTicketCentimes', s.min_ticket_centimes,
    'maxPointsPerOrder', s.max_points_per_order,
    'maxPointsPerDay', s.max_points_per_day
  );
end;
$$;

create function public.loyalty_qr_unlock(p_public_code text, p_pin text) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text := loyalty.clean_public_code(p_public_code);
  v_pin text := btrim(coalesce(p_pin, ''));
  c loyalty.cards%rowtype;
  u loyalty.customers%rowtype;
  s loyalty.settings%rowtype;
  q loyalty.qr_state%rowtype;
  v_attempts integer;
  v_wait integer;
  v_locked timestamptz;
  v_raw_token text;
  v_token_hash bytea;
  v_expires timestamptz;
begin
  if v_code !~ '^[0-9A-HJKMNP-TV-Z]{12}$' then
    raise exception 'Code de carte invalide.' using errcode = 'KL005';
  end if;

  select * into q from loyalty.qr_state where id = 'default' for update;
  if q.locked_until is not null and q.locked_until > now() then
    return jsonb_build_object(
      'status', 'locked',
      'attemptsRemaining', 0,
      'retryAfterSeconds', greatest(1, ceil(extract(epoch from (q.locked_until - now())))::integer)
    );
  end if;

  select * into c from loyalty.cards where public_code = v_code;
  if not found then
    raise exception 'Carte de fidélité introuvable.' using errcode = 'KL005';
  end if;

  select * into s from loyalty.settings where id = 'default';
  if not s.is_active then
    raise exception 'Le programme de fidélité est fermé.' using errcode = 'KL004';
  end if;
  if s.earning_points is null or s.earning_dirhams is null or s.qr_pin_hash is null or s.qr_pin_salt is null then
    raise exception 'Le programme ou le code secret QR n''est pas encore configuré.' using errcode = 'KL016';
  end if;
  if c.status <> 'active' then
    raise exception 'Cette carte est suspendue.' using errcode = 'KL006';
  end if;

  if v_pin !~ '^[0-9]{4,12}$' or sha256(s.qr_pin_salt || convert_to(v_pin, 'UTF8')) <> s.qr_pin_hash then
    v_attempts := q.failed_attempts + 1;
    if v_attempts >= 5 then
      v_wait := least(300, 30 * (1 << least(4, v_attempts - 5)));
      v_locked := now() + make_interval(secs => v_wait);
    end if;
    update loyalty.qr_state
       set failed_attempts = v_attempts,
           last_failed_at = now(),
           locked_until = v_locked
     where id = 'default';
    return jsonb_build_object(
      'status', case when v_locked is not null then 'locked' else 'invalid_pin' end,
      'attemptsRemaining', greatest(0, 5 - v_attempts),
      'retryAfterSeconds', coalesce(v_wait, 0)
    );
  end if;

  update loyalty.qr_state
     set failed_attempts = 0,
         last_failed_at = null,
         locked_until = null
   where id = 'default';

  delete from loyalty.qr_sessions where expires_at < now() - interval '1 hour';

  v_raw_token := encode(sha256(decode(replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''), 'hex')), 'hex');
  v_token_hash := sha256(convert_to(v_raw_token, 'UTF8'));
  v_expires := now() + make_interval(secs => s.qr_session_ttl_seconds);

  insert into loyalty.qr_sessions (token_hash, card_id, expires_at)
  values (v_token_hash, c.id, v_expires);

  select * into u from loyalty.customers where id = c.customer_id;

  return jsonb_build_object(
    'status', 'unlocked',
    'sessionToken', v_raw_token,
    'expiresAt', v_expires,
    'card', jsonb_build_object(
      'publicCode', c.public_code,
      'fullName', u.full_name,
      'status', c.status,
      'pointsBalance', c.points_balance,
      'pointValueCentimes', s.point_value_centimes
    ),
    'program', jsonb_build_object(
      'pointValueCentimes', s.point_value_centimes,
      'earningPoints', s.earning_points,
      'earningDirhams', s.earning_dirhams,
      'roundingRule', s.rounding_rule,
      'minTicketCentimes', s.min_ticket_centimes,
      'maxPointsPerOrder', s.max_points_per_order,
      'maxPointsPerDay', s.max_points_per_day
    )
  );
end;
$$;

create function public.loyalty_qr_credit_points(
  p_session_token text,
  p_public_code text,
  p_ticket_centimes integer,
  p_order_ref text default null,
  p_request_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text := btrim(coalesce(p_session_token, ''));
  v_code text := loyalty.clean_public_code(p_public_code);
  v_order_ref text := loyalty.clean_order_ref(p_order_ref);
  sess loyalty.qr_sessions%rowtype;
  c loyalty.cards%rowtype;
  u loyalty.customers%rowtype;
  s loyalty.settings%rowtype;
  e loyalty.events%rowtype;
  v_event uuid;
  v_points integer;
  v_today integer;
begin
  if p_request_id is null or v_token = '' then
    raise exception 'Demande invalide.' using errcode = 'KL013';
  end if;
  if nullif(btrim(coalesce(p_order_ref, '')), '') is not null and v_order_ref is null then
    raise exception 'Numéro de commande invalide (1 à 60 caractères).' using errcode = 'KL013';
  end if;

  select * into sess from loyalty.qr_sessions
  where token_hash = sha256(convert_to(v_token, 'UTF8'))
  for update;

  if not found or sess.revoked_at is not null or sess.expires_at <= now() then
    raise exception 'Session expirée ou invalide. Veuillez ressaisir le code secret.' using errcode = 'KL015';
  end if;

  c := loyalty.lock_card(sess.card_id);
  if c.public_code <> v_code then
    raise exception 'Cette session n''est valable que pour la carte scannée.' using errcode = 'KL015';
  end if;

  select * into s from loyalty.settings where id = 'default';
  select * into u from loyalty.customers where id = c.customer_id;

  v_event := loyalty.find_replay(p_request_id, 'points_credited', c.id);
  if v_event is not null then
    select * into e from loyalty.events where id = v_event;
    return jsonb_build_object(
      'status', 'ok',
      'replayed', true,
      'eventId', e.id,
      'pointsAdded', e.points_delta,
      'newBalance', e.points_balance_after,
      'pointValueCentimes', s.point_value_centimes,
      'ticketCentimes', e.ticket_amount_centimes,
      'orderRef', e.order_ref,
      'card', jsonb_build_object(
        'publicCode', c.public_code,
        'fullName', u.full_name,
        'status', c.status,
        'pointsBalance', c.points_balance,
        'pointValueCentimes', s.point_value_centimes
      )
    );
  end if;

  if not s.is_active then
    raise exception 'Le programme de fidélité est fermé.' using errcode = 'KL004';
  end if;
  if c.status <> 'active' then
    raise exception 'Cette carte est suspendue.' using errcode = 'KL006';
  end if;

  v_points := loyalty.compute_ticket_points(p_ticket_centimes, s);

  if s.max_points_per_day is not null then
    v_today := loyalty.points_credited_today(c.id);
    if v_today + v_points > s.max_points_per_day then
      raise exception 'Le plafond quotidien de points pour cette carte est atteint.' using errcode = 'KL014';
    end if;
  end if;

  update loyalty.cards
     set points_balance = points_balance + v_points,
         points_earned_total = points_earned_total + v_points,
         last_points_at = now(),
         last_activity_at = now(),
         updated_at = now()
   where id = c.id
   returning * into c;

  update loyalty.qr_sessions
     set used_count = used_count + 1
   where id = sess.id;

  insert into loyalty.events (
    card_id, kind, points_delta, points_balance_after,
    ticket_amount_centimes, order_ref, stamps_total_after, rewards_redeemed_after,
    actor_role, idempotency_key, details
  ) values (
    c.id, 'points_credited', v_points, c.points_balance,
    p_ticket_centimes, v_order_ref, c.stamps_total, c.rewards_redeemed,
    'qr_manager', p_request_id,
    jsonb_build_object(
      'source', 'qr_scan',
      'pointValueCentimes', s.point_value_centimes,
      'earningPoints', s.earning_points,
      'earningDirhams', s.earning_dirhams,
      'roundingRule', s.rounding_rule
    )
  ) returning id into v_event;

  return jsonb_build_object(
    'status', 'ok',
    'replayed', false,
    'eventId', v_event,
    'pointsAdded', v_points,
    'newBalance', c.points_balance,
    'pointValueCentimes', s.point_value_centimes,
    'ticketCentimes', p_ticket_centimes,
    'orderRef', v_order_ref,
    'card', jsonb_build_object(
      'publicCode', c.public_code,
      'fullName', u.full_name,
      'status', c.status,
      'pointsBalance', c.points_balance,
      'pointValueCentimes', s.point_value_centimes
    )
  );
end;
$$;

create function public.loyalty_qr_close_session(p_session_token text) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text := btrim(coalesce(p_session_token, ''));
begin
  if v_token <> '' then
    update loyalty.qr_sessions
       set revoked_at = now()
     where token_hash = sha256(convert_to(v_token, 'UTF8'))
       and revoked_at is null;
  end if;
  return jsonb_build_object('status', 'closed');
end;
$$;

-- -----------------------------------------------------------------------------
-- Statistiques globales du programme (personnel). Agrégations exactes côté base.
-- -----------------------------------------------------------------------------
create function public.loyalty_stats() returns jsonb
language plpgsql stable
security definer
set search_path = ''
as $$
declare
  v_cards jsonb;
  v_rewards jsonb;
  v_recent jsonb;
  s loyalty.settings%rowtype;
begin
  perform loyalty.require_staff('manager');
  select * into s from loyalty.settings where id = 'default';

  select jsonb_build_object(
    'totalCards', count(*)::integer,
    'activeCards', count(*) filter (where status = 'active')::integer,
    'suspendedCards', count(*) filter (where status = 'suspended')::integer,
    'cardsWithPoints', count(*) filter (where points_balance > 0)::integer,
    'recentVisitors30d', count(*) filter (where coalesce(last_points_at, last_stamp_at) > now() - interval '30 days')::integer,
    'neverVisitedCards', count(*) filter (where last_points_at is null and last_stamp_at is null)::integer,
    'pointsInCirculation', coalesce(sum(points_balance), 0)::bigint,
    'pointsEarnedTotal', coalesce(sum(points_earned_total), 0)::bigint,
    'pointsSpentTotal', coalesce(sum(points_spent_total), 0)::bigint,
    'rewardsRedeemedTotal', coalesce(sum(rewards_redeemed), 0)::bigint
  ) into v_cards
  from loyalty.cards;

  select jsonb_build_object(
    'activeRewardsCount', count(*) filter (where is_active and archived_at is null)::integer,
    'totalRewardsCount', count(*) filter (where archived_at is null)::integer
  ) into v_rewards
  from loyalty.rewards;

  with latest as (
    select e.id, e.seq, e.kind, e.created_at, e.points_delta, e.points_balance_after,
           e.ticket_amount_centimes, e.order_ref, e.reward_name, e.actor_role,
           c.id as card_id, c.public_code, u.full_name,
           exists (select 1 from loyalty.events r where r.reverts_event_id = e.id) as is_reverted
    from loyalty.events e
    join loyalty.cards c on c.id = e.card_id
    join loyalty.customers u on u.id = c.customer_id
    where e.kind in ('points_credited', 'points_adjusted', 'points_reverted', 'reward_redeemed', 'reward_redemption_reverted', 'card_created')
    order by e.seq desc
    limit 10
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'eventId', id,
    'seq', seq,
    'kind', kind,
    'createdAt', created_at,
    'pointsDelta', points_delta,
    'pointsBalanceAfter', points_balance_after,
    'ticketAmountCentimes', ticket_amount_centimes,
    'orderRef', order_ref,
    'rewardName', reward_name,
    'actorRole', actor_role,
    'cardId', card_id,
    'publicCode', public_code,
    'fullName', full_name,
    'isReverted', is_reverted
  ) order by seq desc), '[]'::jsonb)
  into v_recent
  from latest;

  return v_cards || v_rewards || jsonb_build_object(
    'pointValueCentimes', s.point_value_centimes,
    'recentOperations', v_recent
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Recherche (personnel). Chiffres seuls → téléphone (≥ 3 chiffres) ; sinon nom (chaque mot,
-- sans casse ni accents, ≥ 2 caractères) ; vide → cartes les plus récentes. 50 résultats max,
-- numéro partiellement masqué.
-- -----------------------------------------------------------------------------
create function public.loyalty_search(p_query text default '', p_limit integer default 20, p_offset integer default 0)
returns jsonb
language plpgsql stable
security definer
set search_path = ''
as $$
declare
  v_q text := btrim(coalesce(p_query, ''));
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_digits text;
  v_words text[];
  v_items jsonb;
  v_count integer;
begin
  perform loyalty.require_staff('manager');
  if char_length(v_q) > 80 then
    raise exception 'Recherche trop longue.' using errcode = 'KL013';
  end if;

  if v_q <> '' and v_q !~ '[^0-9[:space:]+().-]' then
    v_digits := regexp_replace(v_q, '[^0-9]', '', 'g');
    if left(v_digits, 5) = '00212' then
      v_digits := '0' || substr(v_digits, 6);
    elsif left(v_digits, 3) = '212' and char_length(v_digits) > 3 then
      v_digits := '0' || substr(v_digits, 4);
    end if;
    if char_length(v_digits) < 3 then
      raise exception 'Saisissez au moins 3 chiffres du numéro.' using errcode = 'KL013';
    end if;
  elsif v_q <> '' then
    v_words := array(
      select replace(replace(replace(w, '\', '\\'), '%', '\%'), '_', '\_')
      from unnest(string_to_array(loyalty.fold(v_q), ' ')) w where w <> '');
    if char_length(array_to_string(v_words, '')) < 2 then
      raise exception 'Saisissez au moins 2 lettres du nom.' using errcode = 'KL013';
    end if;
  end if;

  with found as (
    select c.id, c.public_code, u.full_name, u.phone, u.name_search,
           c.points_balance, c.points_earned_total, c.points_spent_total,
           c.rewards_redeemed, c.status, c.last_points_at, c.last_activity_at, c.created_at
    from loyalty.cards c join loyalty.customers u on u.id = c.customer_id
    where (v_digits is null or u.phone like '%' || v_digits || '%')
      and (v_words is null or not exists (
             select 1 from unnest(v_words) w where u.name_search not like '%' || w || '%'))
  ),
  ranked as (
    select found.*, row_number() over (
             order by (v_words is not null and name_search like v_words[1] || '%') desc,
                      (v_digits is not null and phone like v_digits || '%') desc,
                      case when v_q = '' then created_at end desc nulls last,
                      full_name, id) as rn
    from found
  ),
  page as (
    select * from ranked where rn > v_offset and rn <= v_offset + v_limit + 1
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'cardId', id,
           'publicCode', public_code,
           'fullName', full_name,
           'phoneMasked', loyalty.mask_phone(phone, 2),
           'pointsBalance', points_balance,
           'pointsEarnedTotal', points_earned_total,
           'pointsSpentTotal', points_spent_total,
           'rewardsRedeemed', rewards_redeemed,
           'status', status,
           'lastPointsAt', last_points_at,
           'lastActivityAt', last_activity_at,
           'createdAt', created_at)
           order by rn), '[]'::jsonb),
         count(*)
    into v_items, v_count
  from page;

  if v_count > v_limit then
    v_items := v_items - v_limit;
  end if;
  return jsonb_build_object('items', v_items, 'limit', v_limit, 'offset', v_offset, 'hasMore', v_count > v_limit);
end;
$$;

-- Fiche (personnel) par identifiant interne ou par code du QR.
create function public.loyalty_card_detail(p_card_id uuid default null, p_public_code text default null)
returns jsonb
language plpgsql stable
security definer
set search_path = ''
as $$
declare
  v_card uuid;
begin
  perform loyalty.require_staff('manager');
  if p_card_id is not null then
    select id into v_card from loyalty.cards where id = p_card_id;
  elsif p_public_code is not null then
    select id into v_card from loyalty.cards where public_code = loyalty.clean_public_code(p_public_code);
  end if;
  if v_card is null then
    raise exception 'Carte de fidélité introuvable.' using errcode = 'KL005';
  end if;
  return loyalty.staff_card_json(v_card);
end;
$$;

-- Historique (personnel), du plus récent au plus ancien, par pages (p_before_seq).
create function public.loyalty_card_history(p_card_id uuid, p_before_seq bigint default null, p_limit integer default 50)
returns jsonb
language plpgsql stable
security definer
set search_path = ''
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_items jsonb;
  v_last bigint;
  v_count integer;
begin
  perform loyalty.require_staff('manager');
  if not exists (select 1 from loyalty.cards where id = p_card_id) then
    raise exception 'Carte de fidélité introuvable.' using errcode = 'KL005';
  end if;
  with page as (
    select e.*, r.id as reverted_by, au.email as actor_email
    from loyalty.events e
    left join loyalty.events r on r.reverts_event_id = e.id
    left join auth.users au on au.id = e.actor_user_id
    where e.card_id = p_card_id and (p_before_seq is null or e.seq < p_before_seq)
    order by e.seq desc
    limit v_limit
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'eventId', id, 'seq', seq, 'kind', kind, 'createdAt', created_at,
           'actorRole', actor_role, 'actorUserId', actor_user_id, 'actorEmail', actor_email,
           'pointsDelta', points_delta, 'pointsBalanceAfter', points_balance_after,
           'ticketAmountCentimes', ticket_amount_centimes, 'orderRef', order_ref,
           'rewardId', reward_id, 'rewardName', reward_name, 'redemptionCode', redemption_code,
           'reason', reason, 'revertsEventId', reverts_event_id, 'relatedEventId', related_event_id,
           'revertedByEventId', reverted_by, 'stampsTotalAfter', stamps_total_after,
           'rewardsRedeemedAfter', rewards_redeemed_after, 'details', details) order by seq desc), '[]'::jsonb),
         min(seq), count(*)
    into v_items, v_last, v_count
  from page;
  return jsonb_build_object('items', v_items, 'nextBeforeSeq', case when v_count = v_limit then v_last end);
end;
$$;

-- -----------------------------------------------------------------------------
-- Attribution de points à partir d'un ticket (personnel).
-- Calcule les points côté serveur selon le taux configuré, avec fenêtre de confirmation
-- anti-doublon accidentel et idempotence stricte via p_request_id.
-- -----------------------------------------------------------------------------
create function public.loyalty_credit_ticket(
  p_card_id uuid,
  p_ticket_centimes integer,
  p_order_ref text default null,
  p_request_id uuid default null,
  p_confirm_recent boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := loyalty.require_staff('manager');
  v_order_ref text := loyalty.clean_order_ref(p_order_ref);
  c loyalty.cards%rowtype;
  s loyalty.settings%rowtype;
  e loyalty.events%rowtype;
  v_event uuid;
  v_points integer;
  v_today integer;
begin
  if p_request_id is null or p_card_id is null then
    raise exception 'Demande invalide.' using errcode = 'KL013';
  end if;
  if nullif(btrim(coalesce(p_order_ref, '')), '') is not null and v_order_ref is null then
    raise exception 'Numéro de commande invalide (1 à 60 caractères).' using errcode = 'KL013';
  end if;

  c := loyalty.lock_card(p_card_id);
  v_event := loyalty.find_replay(p_request_id, 'points_credited', c.id);
  if v_event is not null then
    select * into e from loyalty.events where id = v_event;
    return loyalty.result('ok', c.id, v_event, true, jsonb_build_object(
      'pointsAdded', e.points_delta,
      'ticketCentimes', e.ticket_amount_centimes,
      'orderRef', e.order_ref
    ));
  end if;

  select * into s from loyalty.settings where id = 'default';
  if not s.is_active then
    raise exception 'Le programme de fidélité est fermé : aucun point ne peut être attribué.' using errcode = 'KL004';
  end if;
  if c.status <> 'active' then
    raise exception 'Cette carte est suspendue.' using errcode = 'KL006';
  end if;

  v_points := loyalty.compute_ticket_points(p_ticket_centimes, s);

  if s.max_points_per_day is not null then
    v_today := loyalty.points_credited_today(c.id);
    if v_today + v_points > s.max_points_per_day then
      raise exception 'Le plafond quotidien de points pour cette carte est atteint.' using errcode = 'KL014';
    end if;
  end if;

  if not coalesce(p_confirm_recent, false) and s.recent_credit_window_seconds > 0
     and c.last_points_at is not null
     and c.last_points_at > now() - make_interval(secs => s.recent_credit_window_seconds) then
    return loyalty.result('confirm_recent', c.id, null, false, jsonb_build_object(
      'secondsSinceLastCredit', greatest(0, floor(extract(epoch from now() - c.last_points_at))::integer),
      'pointsPreview', v_points
    ));
  end if;

  update loyalty.cards
     set points_balance = points_balance + v_points,
         points_earned_total = points_earned_total + v_points,
         last_points_at = now(),
         last_activity_at = now(),
         updated_at = now()
   where id = c.id
   returning * into c;

  insert into loyalty.events (
    card_id, kind, points_delta, points_balance_after,
    ticket_amount_centimes, order_ref, stamps_total_after, rewards_redeemed_after,
    actor_user_id, actor_role, idempotency_key, details
  ) values (
    c.id, 'points_credited', v_points, c.points_balance,
    p_ticket_centimes, v_order_ref, c.stamps_total, c.rewards_redeemed,
    auth.uid(), v_role, p_request_id,
    jsonb_build_object(
      'source', 'admin_ticket',
      'pointValueCentimes', s.point_value_centimes,
      'earningPoints', s.earning_points,
      'earningDirhams', s.earning_dirhams,
      'roundingRule', s.rounding_rule
    )
  ) returning id into v_event;

  return loyalty.result('ok', c.id, v_event, false, jsonb_build_object(
    'pointsAdded', v_points,
    'ticketCentimes', p_ticket_centimes,
    'orderRef', v_order_ref
  ));
end;
$$;

-- -----------------------------------------------------------------------------
-- Ajustement administratif de points (personnel, motif obligatoire).
-- Permet un crédit exceptionnel ou un débit correctif sans jamais rendre le solde négatif.
-- -----------------------------------------------------------------------------
create function public.loyalty_adjust_points(
  p_card_id uuid,
  p_delta integer,
  p_reason text,
  p_request_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := loyalty.require_staff('manager');
  v_reason text := loyalty.clean_reason(p_reason);
  c loyalty.cards%rowtype;
  e loyalty.events%rowtype;
  v_event uuid;
begin
  if p_request_id is null or p_card_id is null or p_delta is null or p_delta = 0 or abs(p_delta) > 1000000 then
    raise exception 'Indiquez un nombre de points valide (non nul).' using errcode = 'KL013';
  end if;
  if v_reason is null then
    raise exception 'Indiquez le motif de l''ajustement (3 à 300 caractères).' using errcode = 'KL010';
  end if;

  c := loyalty.lock_card(p_card_id);
  v_event := loyalty.find_replay(p_request_id, 'points_adjusted', c.id);
  if v_event is not null then
    select * into e from loyalty.events where id = v_event;
    return loyalty.result('ok', c.id, v_event, true, jsonb_build_object('pointsDelta', e.points_delta));
  end if;

  if c.status <> 'active' then
    raise exception 'Cette carte est suspendue.' using errcode = 'KL006';
  end if;
  if c.points_balance + p_delta < 0 then
    raise exception 'Le solde de points ne peut pas devenir négatif.' using errcode = 'KL007';
  end if;

  update loyalty.cards
     set points_balance = points_balance + p_delta,
         points_earned_total = points_earned_total + case when p_delta > 0 then p_delta else 0 end,
         points_spent_total = points_spent_total + case when p_delta < 0 then -p_delta else 0 end,
         last_points_at = now(),
         last_activity_at = now(),
         updated_at = now()
   where id = c.id
   returning * into c;

  insert into loyalty.events (
    card_id, kind, points_delta, points_balance_after,
    stamps_total_after, rewards_redeemed_after, reason,
    actor_user_id, actor_role, idempotency_key
  ) values (
    c.id, 'points_adjusted', p_delta, c.points_balance,
    c.stamps_total, c.rewards_redeemed, v_reason,
    auth.uid(), v_role, p_request_id
  ) returning id into v_event;

  return loyalty.result('ok', c.id, v_event, false, jsonb_build_object('pointsDelta', p_delta));
end;
$$;

-- -----------------------------------------------------------------------------
-- Échange d'une récompense au comptoir (personnel) : verrou + vérification du solde et du catalogue.
-- -----------------------------------------------------------------------------
create function public.loyalty_redeem_reward(p_card_id uuid, p_reward_id uuid, p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := loyalty.require_staff('manager');
  c loyalty.cards%rowtype;
  r loyalty.rewards%rowtype;
  e loyalty.events%rowtype;
  v_event uuid;
  v_code text;
begin
  if p_request_id is null or p_card_id is null or p_reward_id is null then
    raise exception 'Demande invalide.' using errcode = 'KL013';
  end if;
  c := loyalty.lock_card(p_card_id);
  v_event := loyalty.find_replay(p_request_id, 'reward_redeemed', c.id);
  if v_event is not null then
    select * into e from loyalty.events where id = v_event;
    if e.reward_id is distinct from p_reward_id then
      raise exception 'Cet identifiant de requête a déjà servi pour une autre opération.' using errcode = 'KL011';
    end if;
    return loyalty.result('ok', c.id, v_event, true, jsonb_build_object(
      'rewardId', e.reward_id,
      'rewardName', e.reward_name,
      'pointsCost', -e.points_delta,
      'redemptionCode', e.redemption_code
    ));
  end if;
  if c.status <> 'active' then
    raise exception 'Cette carte est suspendue.' using errcode = 'KL006';
  end if;

  select * into r from loyalty.rewards where id = p_reward_id for update;
  if not found or not r.is_active or r.archived_at is not null then
    raise exception 'Cette récompense n''est pas disponible.' using errcode = 'KL017';
  end if;
  if c.points_balance < r.points_cost then
    raise exception 'Solde de points insuffisant sur cette carte.' using errcode = 'KL007';
  end if;

  v_code := loyalty.new_redemption_code();

  update loyalty.cards
     set points_balance = points_balance - r.points_cost,
         points_spent_total = points_spent_total + r.points_cost,
         rewards_redeemed = rewards_redeemed + 1,
         last_points_at = now(),
         last_activity_at = now(),
         updated_at = now()
   where id = c.id
   returning * into c;

  update loyalty.rewards
     set redeemed_count = redeemed_count + 1,
         updated_at = now()
   where id = r.id;

  insert into loyalty.events (
    card_id, kind, points_delta, points_balance_after, redeemed_delta,
    reward_id, reward_name, redemption_code, stamps_total_after, rewards_redeemed_after,
    actor_user_id, actor_role, idempotency_key, details
  ) values (
    c.id, 'reward_redeemed', -r.points_cost, c.points_balance, 1,
    r.id, r.name, v_code, c.stamps_total, c.rewards_redeemed,
    auth.uid(), v_role, p_request_id,
    jsonb_build_object('pointsCost', r.points_cost, 'rewardName', r.name, 'redemptionCode', v_code, 'initiatedBy', 'staff')
  ) returning id into v_event;

  return loyalty.result('ok', c.id, v_event, false, jsonb_build_object(
    'rewardId', r.id,
    'rewardName', r.name,
    'pointsCost', r.points_cost,
    'redemptionCode', v_code
  ));
end;
$$;

-- -----------------------------------------------------------------------------
-- Correction (personnel, motif obligatoire) d'une attribution de points, d'un ajustement
-- ou d'un échange de récompense : nouvel événement compensatoire lié à l'original (conservé).
-- Une seule correction par événement. Un crédit de points déjà dépensé ne peut pas être annulé
-- si le solde deviendrait négatif (KL009).
-- -----------------------------------------------------------------------------
create function public.loyalty_revert_event(p_event_id uuid, p_reason text, p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := loyalty.require_staff('manager');
  v_reason text := loyalty.clean_reason(p_reason);
  e loyalty.events%rowtype;
  c loyalty.cards%rowtype;
  v_kind text;
  v_event uuid;
  v_points_delta integer := 0;
begin
  if p_request_id is null or p_event_id is null then
    raise exception 'Demande invalide.' using errcode = 'KL013';
  end if;
  select * into e from loyalty.events where id = p_event_id;
  if not found or e.kind not in ('points_credited', 'points_adjusted', 'reward_redeemed', 'stamp_added') then
    raise exception 'Cette opération ne peut pas être corrigée.' using errcode = 'KL013';
  end if;
  v_kind := case e.kind
    when 'points_credited' then 'points_reverted'
    when 'points_adjusted' then 'points_reverted'
    when 'reward_redeemed' then 'reward_redemption_reverted'
    when 'stamp_added'     then 'stamp_reverted'
  end;

  c := loyalty.lock_card(e.card_id);
  v_event := loyalty.find_replay(p_request_id, v_kind, c.id, e.id);
  if v_event is not null then
    return loyalty.result('ok', c.id, v_event, true);
  end if;
  if v_reason is null then
    raise exception 'Indiquez le motif de la correction (3 à 300 caractères).' using errcode = 'KL010';
  end if;
  if exists (select 1 from loyalty.events where reverts_event_id = e.id) then
    raise exception 'Cette opération a déjà été corrigée.' using errcode = 'KL008';
  end if;

  v_points_delta := -e.points_delta;
  if c.points_balance + v_points_delta < 0 then
    raise exception 'Ces points ont déjà été utilisés pour une récompense : annulez d''abord cet échange.'
      using errcode = 'KL009';
  end if;

  if e.kind in ('points_credited', 'points_adjusted') then
    update loyalty.cards
       set points_balance = points_balance + v_points_delta,
           points_earned_total = points_earned_total - case when e.points_delta > 0 then e.points_delta else 0 end,
           points_spent_total = points_spent_total - case when e.points_delta < 0 then -e.points_delta else 0 end,
           updated_at = now()
     where id = c.id
     returning * into c;
  elsif e.kind = 'reward_redeemed' then
    update loyalty.cards
       set points_balance = points_balance + v_points_delta,
           points_spent_total = points_spent_total - v_points_delta,
           rewards_redeemed = rewards_redeemed - 1,
           updated_at = now()
     where id = c.id
     returning * into c;
    if e.reward_id is not null then
      update loyalty.rewards
         set redeemed_count = greatest(0, redeemed_count - 1),
             updated_at = now()
       where id = e.reward_id;
    end if;
  elsif e.kind = 'stamp_added' then
    update loyalty.cards
       set stamps_total = stamps_total - 1,
           updated_at = now()
     where id = c.id
     returning * into c;
  end if;

  insert into loyalty.events (
    card_id, kind, points_delta, points_balance_after,
    stamps_delta, redeemed_delta, stamps_total_after, rewards_redeemed_after,
    reward_id, reward_name, reverts_event_id, reason,
    actor_user_id, actor_role, idempotency_key
  ) values (
    c.id, v_kind, v_points_delta, c.points_balance,
    case when v_kind = 'stamp_reverted' then -1 else 0 end,
    case when v_kind = 'reward_redemption_reverted' then -1 else 0 end,
    c.stamps_total, c.rewards_redeemed,
    e.reward_id, e.reward_name, e.id, v_reason,
    auth.uid(), v_role, p_request_id
  ) returning id into v_event;

  update loyalty.cards
     set last_points_at = loyalty.last_valid_points_at(c.id)
   where id = c.id;

  return loyalty.result('ok', c.id, v_event, false);
end;
$$;

-- -----------------------------------------------------------------------------
-- Gestion du catalogue des récompenses (personnel).
-- -----------------------------------------------------------------------------
create function public.loyalty_list_rewards() returns jsonb
language plpgsql stable
security definer
set search_path = ''
as $$
declare
  v_items jsonb;
begin
  perform loyalty.require_staff('manager');
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id,
    'name', r.name,
    'description', r.description,
    'pointsCost', r.points_cost,
    'conditions', r.conditions,
    'imageUrl', r.image_url,
    'isActive', r.is_active,
    'archivedAt', r.archived_at,
    'sortOrder', r.sort_order,
    'redeemedCount', r.redeemed_count,
    'createdAt', r.created_at,
    'updatedAt', r.updated_at
  ) order by (r.archived_at is not null) asc, r.sort_order asc, r.points_cost asc, r.created_at asc), '[]'::jsonb)
  into v_items
  from loyalty.rewards r;

  return jsonb_build_object('items', v_items);
end;
$$;

create function public.loyalty_save_reward(p_reward jsonb, p_request_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := loyalty.require_staff('manager');
  v_id uuid;
  v_name text;
  v_desc text;
  v_cond text;
  v_img text;
  v_cost integer;
  v_active boolean;
  v_archive boolean;
  v_sort integer;
  r loyalty.rewards%rowtype;
  v_before jsonb;
  v_after jsonb;
  v_kind text;
  v_event uuid;
begin
  if jsonb_typeof(coalesce(p_reward, 'null'::jsonb)) <> 'object' then
    raise exception 'Demande invalide.' using errcode = 'KL013';
  end if;

  if p_reward ? 'id' and p_reward ->> 'id' is not null and btrim(p_reward ->> 'id') <> '' then
    begin
      v_id := (p_reward ->> 'id')::uuid;
    exception when invalid_text_representation then
      raise exception 'Identifiant de récompense invalide.' using errcode = 'KL013';
    end;
  end if;

  v_kind := case when v_id is null then 'reward_created' else 'reward_updated' end;
  if p_request_id is not null then
    v_event := loyalty.find_replay(p_request_id, v_kind, null);
    if v_event is not null then
      return public.loyalty_list_rewards();
    end if;
  end if;

  v_name := btrim(regexp_replace(coalesce(p_reward ->> 'name', ''), '\s+', ' ', 'g'));
  if char_length(v_name) < 2 or char_length(v_name) > 80 or v_name ~ '[[:cntrl:]]' then
    raise exception 'Indiquez un nom de récompense valide (2 à 80 caractères).' using errcode = 'KL013';
  end if;

  v_desc := nullif(btrim(regexp_replace(coalesce(p_reward ->> 'description', ''), '\s+', ' ', 'g')), '');
  if v_desc is not null and (char_length(v_desc) > 300 or v_desc ~ '[[:cntrl:]]') then
    raise exception 'Description trop longue (300 caractères maximum).' using errcode = 'KL013';
  end if;

  v_cond := nullif(btrim(regexp_replace(coalesce(p_reward ->> 'conditions', ''), '\s+', ' ', 'g')), '');
  if v_cond is not null and (char_length(v_cond) > 300 or v_cond ~ '[[:cntrl:]]') then
    raise exception 'Conditions trop longues (300 caractères maximum).' using errcode = 'KL013';
  end if;

  v_img := nullif(btrim(coalesce(p_reward ->> 'image_url', p_reward ->> 'imageUrl', '')), '');
  if v_img is not null and (char_length(v_img) > 500 or v_img !~ '^(https?://|/)') then
    raise exception 'URL d''image invalide.' using errcode = 'KL013';
  end if;

  begin
    v_cost := coalesce((p_reward ->> 'points_cost')::integer, (p_reward ->> 'pointsCost')::integer);
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'Coût en points invalide.' using errcode = 'KL013';
  end;
  if v_cost is null or v_cost < 1 or v_cost > 1000000 then
    raise exception 'Le coût en points doit être un entier supérieur à 0.' using errcode = 'KL013';
  end if;

  v_active := coalesce((p_reward ->> 'is_active')::boolean, (p_reward ->> 'isActive')::boolean, true);
  v_archive := coalesce((p_reward ->> 'archived')::boolean, false);
  v_sort := coalesce((p_reward ->> 'sort_order')::integer, (p_reward ->> 'sortOrder')::integer, 0);

  if v_id is null then
    insert into loyalty.rewards (
      name, description, points_cost, conditions, image_url,
      is_active, archived_at, sort_order, created_by, updated_by
    ) values (
      v_name, v_desc, v_cost, v_cond, v_img,
      case when v_archive then false else v_active end,
      case when v_archive then now() else null end,
      v_sort, auth.uid(), auth.uid()
    ) returning * into r;

    insert into loyalty.events (kind, reward_id, reward_name, actor_user_id, actor_role, idempotency_key, details)
    values ('reward_created', r.id, r.name, auth.uid(), v_role, p_request_id, to_jsonb(r));
  else
    select * into r from loyalty.rewards where id = v_id for update;
    if not found then
      raise exception 'Récompense introuvable.' using errcode = 'KL017';
    end if;
    v_before := to_jsonb(r);
    update loyalty.rewards
       set name = v_name,
           description = v_desc,
           points_cost = v_cost,
           conditions = v_cond,
           image_url = v_img,
           is_active = case when v_archive then false else v_active end,
           archived_at = case when v_archive then coalesce(archived_at, now())
                              when p_reward ? 'archived' and not v_archive then null
                              else archived_at end,
           sort_order = v_sort,
           updated_at = now(),
           updated_by = auth.uid()
     where id = r.id
     returning * into r;
    v_after := to_jsonb(r);
    insert into loyalty.events (kind, reward_id, reward_name, actor_user_id, actor_role, idempotency_key, details)
    values ('reward_updated', r.id, r.name, auth.uid(), v_role, p_request_id, jsonb_build_object('before', v_before, 'after', v_after));
  end if;

  return public.loyalty_list_rewards();
end;
$$;

-- -----------------------------------------------------------------------------
-- Nouveau lien d'accès (personnel) : récupération assistée au restaurant. Le navigateur du
-- personnel génère le nouveau jeton et le transmettra au numéro du client (WhatsApp) ;
-- l'ancien lien cesse IMMÉDIATEMENT de fonctionner. Tracé, jeton jamais stocké.
-- -----------------------------------------------------------------------------
create function public.loyalty_reissue_access(p_card_id uuid, p_token text, p_request_id uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := loyalty.require_staff('manager');
  v_hash bytea := loyalty.token_hash(p_token);
  v_reason text := loyalty.clean_reason(p_reason);
  c loyalty.cards%rowtype;
  v_event uuid;
begin
  if p_request_id is null or p_card_id is null or v_hash is null then
    raise exception 'Demande invalide.' using errcode = 'KL013';
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is not null and v_reason is null then
    raise exception 'Motif invalide (3 à 300 caractères).' using errcode = 'KL010';
  end if;
  c := loyalty.lock_card(p_card_id);
  v_event := loyalty.find_replay(p_request_id, 'access_reissued', c.id);
  if v_event is not null then
    if c.token_hash <> v_hash then
      raise exception 'Cet identifiant de requête a déjà servi pour une autre opération.' using errcode = 'KL011';
    end if;
    return loyalty.result('ok', c.id, v_event, true);
  end if;

  begin
    update loyalty.cards
       set token_hash = v_hash, token_version = token_version + 1, token_issued_at = now(), updated_at = now()
     where id = c.id
     returning * into c;
  exception when unique_violation then
    raise exception 'Demande invalide.' using errcode = 'KL013';
  end;

  insert into loyalty.events (card_id, kind, points_balance_after, stamps_total_after, rewards_redeemed_after, reason,
                              actor_user_id, actor_role, idempotency_key, details)
  values (c.id, 'access_reissued', c.points_balance, c.stamps_total, c.rewards_redeemed, v_reason, auth.uid(), v_role,
          p_request_id, jsonb_build_object('tokenVersion', c.token_version))
  returning id into v_event;

  return loyalty.result('ok', c.id, v_event, false);
end;
$$;

-- Correction du nom ou du numéro (personnel, motif obligatoire). Avant / après conservés.
create function public.loyalty_update_customer(p_card_id uuid, p_changes jsonb, p_reason text, p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := loyalty.require_staff('manager');
  v_reason text := loyalty.clean_reason(p_reason);
  c loyalty.cards%rowtype;
  u loyalty.customers%rowtype;
  k text;
  v_name text;
  v_phone text;
  v_before jsonb := '{}'::jsonb;
  v_after jsonb := '{}'::jsonb;
  v_event uuid;
begin
  if p_request_id is null or p_card_id is null or jsonb_typeof(coalesce(p_changes, 'null'::jsonb)) <> 'object' then
    raise exception 'Demande invalide.' using errcode = 'KL013';
  end if;
  for k in select jsonb_object_keys(p_changes) loop
    if k not in ('full_name', 'phone') then
      raise exception 'Champ non modifiable : %.', k using errcode = 'KL013';
    end if;
  end loop;
  c := loyalty.lock_card(p_card_id);
  v_event := loyalty.find_replay(p_request_id, 'customer_updated', c.id);
  if v_event is not null then
    return loyalty.result('ok', c.id, v_event, true);
  end if;
  if v_reason is null then
    raise exception 'Indiquez le motif de la modification (3 à 300 caractères).' using errcode = 'KL010';
  end if;
  select * into u from loyalty.customers where id = c.customer_id for update;
  v_name := u.full_name;
  v_phone := u.phone;
  if p_changes ? 'full_name' then
    v_name := loyalty.clean_name(p_changes ->> 'full_name');
    if v_name is null then
      raise exception 'Indiquez le nom et prénom (2 à 80 caractères).' using errcode = 'KL001';
    end if;
  end if;
  if p_changes ? 'phone' then
    v_phone := loyalty.normalize_phone(p_changes ->> 'phone');
    if v_phone is null then
      raise exception 'Numéro invalide. Exemple : 06 12 34 56 78.' using errcode = 'KL002';
    end if;
  end if;
  if v_name = u.full_name and v_phone = u.phone then
    return loyalty.result('unchanged', c.id, null, false);
  end if;
  if v_name <> u.full_name then
    v_before := v_before || jsonb_build_object('fullName', u.full_name);
    v_after := v_after || jsonb_build_object('fullName', v_name);
  end if;
  if v_phone <> u.phone then
    v_before := v_before || jsonb_build_object('phone', u.phone);
    v_after := v_after || jsonb_build_object('phone', v_phone);
  end if;

  begin
    update loyalty.customers
       set full_name = v_name, name_search = loyalty.fold(v_name), phone = v_phone, updated_at = now()
     where id = u.id;
  exception when unique_violation then
    raise exception 'Ce numéro a déjà une carte de fidélité.' using errcode = 'KL003';
  end;

  insert into loyalty.events (card_id, kind, points_balance_after, stamps_total_after, rewards_redeemed_after, reason,
                              actor_user_id, actor_role, idempotency_key, details)
  values (c.id, 'customer_updated', c.points_balance, c.stamps_total, c.rewards_redeemed, v_reason, auth.uid(), v_role,
          p_request_id, jsonb_build_object('before', v_before, 'after', v_after))
  returning id into v_event;

  return loyalty.result('ok', c.id, v_event, false);
end;
$$;

-- Suspension / réactivation d'une carte (owner, motif obligatoire).
create function public.loyalty_set_card_status(p_card_id uuid, p_status text, p_reason text, p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := loyalty.require_staff('owner');
  v_reason text := loyalty.clean_reason(p_reason);
  c loyalty.cards%rowtype;
  v_before text;
  v_event uuid;
begin
  if p_request_id is null or p_card_id is null or p_status is null or p_status not in ('active', 'suspended') then
    raise exception 'Demande invalide.' using errcode = 'KL013';
  end if;
  c := loyalty.lock_card(p_card_id);
  v_event := loyalty.find_replay(p_request_id, 'card_status_changed', c.id);
  if v_event is not null then
    return loyalty.result('ok', c.id, v_event, true);
  end if;
  if v_reason is null then
    raise exception 'Indiquez le motif (3 à 300 caractères).' using errcode = 'KL010';
  end if;
  if c.status = p_status then
    return loyalty.result('unchanged', c.id, null, false);
  end if;
  v_before := c.status;
  update loyalty.cards set status = p_status, updated_at = now() where id = c.id returning * into c;

  insert into loyalty.events (card_id, kind, points_balance_after, stamps_total_after, rewards_redeemed_after, reason,
                              actor_user_id, actor_role, idempotency_key, details)
  values (c.id, 'card_status_changed', c.points_balance, c.stamps_total, c.rewards_redeemed, v_reason, auth.uid(), v_role,
          p_request_id, jsonb_build_object('before', v_before, 'after', p_status))
  returning id into v_event;

  return loyalty.result('ok', c.id, v_event, false);
end;
$$;

-- Réglages (owner) : ouverture du programme, valeur du point, règles d'attribution, garde-fous. Journalisé.
create function public.loyalty_update_settings(p_changes jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := loyalty.require_staff('owner');
  s loyalty.settings%rowtype;
  k text;
  v_before jsonb;
  v_after jsonb;
  v_label text;
  v_terms text;
  v_reason text;
begin
  if jsonb_typeof(coalesce(p_changes, 'null'::jsonb)) <> 'object' then
    raise exception 'Demande invalide.' using errcode = 'KL013';
  end if;
  for k in select jsonb_object_keys(p_changes) loop
    if k not in (
      'is_active', 'point_value_centimes', 'earning_points', 'earning_dirhams',
      'rounding_rule', 'min_ticket_centimes', 'max_points_per_order', 'max_points_per_day',
      'recent_credit_window_seconds', 'signup_limit_per_hour', 'terms_summary',
      'qr_session_ttl_seconds', 'reward_label', 'max_pending_rewards',
      'recent_stamp_window_seconds', 'reason'
    ) then
      raise exception 'Réglage non modifiable : %.', k using errcode = 'KL013';
    end if;
  end loop;

  if (p_changes ? 'is_active' and jsonb_typeof(p_changes -> 'is_active') <> 'boolean')
     or (p_changes ? 'point_value_centimes' and jsonb_typeof(p_changes -> 'point_value_centimes') <> 'number')
     or (p_changes ? 'earning_points' and jsonb_typeof(p_changes -> 'earning_points') not in ('number', 'null'))
     or (p_changes ? 'earning_dirhams' and jsonb_typeof(p_changes -> 'earning_dirhams') not in ('number', 'null'))
     or (p_changes ? 'rounding_rule' and jsonb_typeof(p_changes -> 'rounding_rule') <> 'string')
     or (p_changes ? 'min_ticket_centimes' and jsonb_typeof(p_changes -> 'min_ticket_centimes') <> 'number')
     or (p_changes ? 'max_points_per_order' and jsonb_typeof(p_changes -> 'max_points_per_order') not in ('number', 'null'))
     or (p_changes ? 'max_points_per_day' and jsonb_typeof(p_changes -> 'max_points_per_day') not in ('number', 'null'))
     or (p_changes ? 'recent_credit_window_seconds' and jsonb_typeof(p_changes -> 'recent_credit_window_seconds') <> 'number')
     or (p_changes ? 'signup_limit_per_hour' and jsonb_typeof(p_changes -> 'signup_limit_per_hour') <> 'number')
     or (p_changes ? 'qr_session_ttl_seconds' and jsonb_typeof(p_changes -> 'qr_session_ttl_seconds') <> 'number')
     or (p_changes ? 'terms_summary' and jsonb_typeof(p_changes -> 'terms_summary') not in ('string', 'null'))
     or (p_changes ? 'reward_label' and jsonb_typeof(p_changes -> 'reward_label') not in ('string', 'null'))
     or (p_changes ? 'max_pending_rewards' and jsonb_typeof(p_changes -> 'max_pending_rewards') not in ('number', 'null'))
     or (p_changes ? 'recent_stamp_window_seconds' and jsonb_typeof(p_changes -> 'recent_stamp_window_seconds') <> 'number') then
    raise exception 'Valeur de réglage invalide.' using errcode = 'KL013';
  end if;

  select * into s from loyalty.settings where id = 'default' for update;
  v_before := loyalty.settings_audit_json(s);

  v_label := case when p_changes ? 'reward_label'
                  then nullif(btrim(regexp_replace(coalesce(p_changes ->> 'reward_label', ''), '\s+', ' ', 'g')), '')
                  else s.reward_label end;
  v_terms := case when p_changes ? 'terms_summary'
                  then nullif(btrim(regexp_replace(coalesce(p_changes ->> 'terms_summary', ''), '\s+', ' ', 'g')), '')
                  else s.terms_summary end;
  v_reason := loyalty.clean_reason(p_changes ->> 'reason');

  begin
    update loyalty.settings set
      is_active = coalesce((p_changes ->> 'is_active')::boolean, is_active),
      point_value_centimes = coalesce((p_changes ->> 'point_value_centimes')::integer, point_value_centimes),
      earning_points = case when p_changes ? 'earning_points' then (p_changes ->> 'earning_points')::integer else earning_points end,
      earning_dirhams = case when p_changes ? 'earning_dirhams' then (p_changes ->> 'earning_dirhams')::integer else earning_dirhams end,
      rounding_rule = coalesce(p_changes ->> 'rounding_rule', rounding_rule),
      min_ticket_centimes = coalesce((p_changes ->> 'min_ticket_centimes')::integer, min_ticket_centimes),
      max_points_per_order = case when p_changes ? 'max_points_per_order' then (p_changes ->> 'max_points_per_order')::integer else max_points_per_order end,
      max_points_per_day = case when p_changes ? 'max_points_per_day' then (p_changes ->> 'max_points_per_day')::integer else max_points_per_day end,
      recent_credit_window_seconds = coalesce((p_changes ->> 'recent_credit_window_seconds')::integer, recent_credit_window_seconds),
      signup_limit_per_hour = coalesce((p_changes ->> 'signup_limit_per_hour')::integer, signup_limit_per_hour),
      qr_session_ttl_seconds = coalesce((p_changes ->> 'qr_session_ttl_seconds')::integer, qr_session_ttl_seconds),
      terms_summary = v_terms,
      reward_label = v_label,
      max_pending_rewards = case when p_changes ? 'max_pending_rewards'
                                 then (p_changes ->> 'max_pending_rewards')::integer else max_pending_rewards end,
      recent_stamp_window_seconds = coalesce((p_changes ->> 'recent_stamp_window_seconds')::integer, recent_stamp_window_seconds),
      updated_at = now(),
      updated_by = auth.uid()
    where id = 'default'
    returning * into s;
  exception when check_violation or numeric_value_out_of_range or invalid_text_representation then
    raise exception 'Valeur de réglage hors limites.' using errcode = 'KL013';
  end;

  v_after := loyalty.settings_audit_json(s);

  if v_after <> v_before then
    insert into loyalty.events (kind, reason, actor_user_id, actor_role, details)
    values ('settings_updated', v_reason, auth.uid(), v_role, jsonb_build_object('before', v_before, 'after', v_after));
  end if;
  return public.loyalty_program();
end;
$$;

-- Configuration du code secret QR (owner uniquement). Stocke uniquement un sel aléatoire + SHA-256.
create function public.loyalty_set_qr_pin(p_pin text, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := loyalty.require_staff('owner');
  v_pin text := btrim(coalesce(p_pin, ''));
  v_reason text := loyalty.clean_reason(p_reason);
  v_salt bytea;
  v_hash bytea;
begin
  if v_pin !~ '^[0-9]{4,12}$' then
    raise exception 'Le code secret doit comporter de 4 à 12 chiffres.' using errcode = 'KL013';
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is not null and v_reason is null then
    raise exception 'Motif invalide (3 à 300 caractères).' using errcode = 'KL010';
  end if;

  v_salt := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
  v_hash := sha256(v_salt || convert_to(v_pin, 'UTF8'));

  update loyalty.settings
     set qr_pin_salt = v_salt,
         qr_pin_hash = v_hash,
         qr_pin_updated_at = now(),
         updated_at = now(),
         updated_by = auth.uid()
   where id = 'default';

  update loyalty.qr_state
     set failed_attempts = 0,
         last_failed_at = null,
         locked_until = null
   where id = 'default';

  update loyalty.qr_sessions
     set revoked_at = now()
   where revoked_at is null;

  insert into loyalty.events (kind, reason, actor_user_id, actor_role, details)
  values ('qr_pin_updated', v_reason, auth.uid(), v_role, jsonb_build_object('pinLength', char_length(v_pin)));

  return public.loyalty_program();
end;
$$;

-- Diagnostic (owner) : compteurs de chaque carte et de chaque récompense comparés aux sommes du journal.
create function public.loyalty_reconcile() returns jsonb
language plpgsql stable
security definer
set search_path = ''
as $$
declare
  v_mismatches jsonb;
  v_cards integer;
begin
  perform loyalty.require_staff('owner');
  select count(*) into v_cards from loyalty.cards;
  select coalesce(jsonb_agg(jsonb_build_object(
           'cardId', c.id,
           'pointsBalance', c.points_balance,
           'journalPoints', coalesce(j.points, 0),
           'stampsTotal', c.stamps_total,
           'journalStamps', coalesce(j.stamps, 0),
           'rewardsRedeemed', c.rewards_redeemed,
           'journalRedeemed', coalesce(j.redeemed, 0))), '[]'::jsonb)
    into v_mismatches
  from loyalty.cards c
  left join (
    select card_id,
           sum(points_delta)::integer as points,
           sum(stamps_delta)::integer as stamps,
           sum(redeemed_delta)::integer as redeemed
    from loyalty.events where card_id is not null group by card_id
  ) j on j.card_id = c.id
  where c.points_balance <> coalesce(j.points, 0)
     or c.stamps_total <> coalesce(j.stamps, 0)
     or c.rewards_redeemed <> coalesce(j.redeemed, 0);
  return jsonb_build_object('ok', jsonb_array_length(v_mismatches) = 0, 'cards', v_cards, 'mismatches', v_mismatches);
end;
$$;

-- -----------------------------------------------------------------------------
-- Droits d'exécution. Supabase accorde par défaut EXECUTE à anon et authenticated sur les
-- nouvelles fonctions de public : tout est retiré puis accordé au strict nécessaire.
-- -----------------------------------------------------------------------------
revoke all on function public.loyalty_my_role() from public, anon, authenticated;
revoke all on function public.loyalty_program() from public, anon, authenticated;
revoke all on function public.loyalty_register(text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.loyalty_card_view(text) from public, anon, authenticated;
revoke all on function public.loyalty_client_redeem_reward(text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.loyalty_qr_card_status(text) from public, anon, authenticated;
revoke all on function public.loyalty_qr_unlock(text, text) from public, anon, authenticated;
revoke all on function public.loyalty_qr_credit_points(text, text, integer, text, uuid) from public, anon, authenticated;
revoke all on function public.loyalty_qr_close_session(text) from public, anon, authenticated;
revoke all on function public.loyalty_stats() from public, anon, authenticated;
revoke all on function public.loyalty_search(text, integer, integer) from public, anon, authenticated;
revoke all on function public.loyalty_card_detail(uuid, text) from public, anon, authenticated;
revoke all on function public.loyalty_card_history(uuid, bigint, integer) from public, anon, authenticated;
revoke all on function public.loyalty_credit_ticket(uuid, integer, text, uuid, boolean) from public, anon, authenticated;
revoke all on function public.loyalty_adjust_points(uuid, integer, text, uuid) from public, anon, authenticated;
revoke all on function public.loyalty_redeem_reward(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.loyalty_revert_event(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.loyalty_list_rewards() from public, anon, authenticated;
revoke all on function public.loyalty_save_reward(jsonb, uuid) from public, anon, authenticated;
revoke all on function public.loyalty_reissue_access(uuid, text, uuid, text) from public, anon, authenticated;
revoke all on function public.loyalty_update_customer(uuid, jsonb, text, uuid) from public, anon, authenticated;
revoke all on function public.loyalty_set_card_status(uuid, text, text, uuid) from public, anon, authenticated;
revoke all on function public.loyalty_update_settings(jsonb) from public, anon, authenticated;
revoke all on function public.loyalty_set_qr_pin(text, text) from public, anon, authenticated;
revoke all on function public.loyalty_reconcile() from public, anon, authenticated;

-- Public (site, sans compte Supabase Auth) : programme, inscription, sa propre carte, échange et parcours QR protégé par code secret.
grant execute on function public.loyalty_my_role() to anon, authenticated;
grant execute on function public.loyalty_program() to anon, authenticated;
grant execute on function public.loyalty_register(text, text, text, uuid) to anon, authenticated;
grant execute on function public.loyalty_card_view(text) to anon, authenticated;
grant execute on function public.loyalty_client_redeem_reward(text, uuid, uuid) to anon, authenticated;
grant execute on function public.loyalty_qr_card_status(text) to anon, authenticated;
grant execute on function public.loyalty_qr_unlock(text, text) to anon, authenticated;
grant execute on function public.loyalty_qr_credit_points(text, text, integer, text, uuid) to anon, authenticated;
grant execute on function public.loyalty_qr_close_session(text) to anon, authenticated;

-- Personnel (droits revérifiés dans chaque fonction).
grant execute on function public.loyalty_stats() to authenticated;
grant execute on function public.loyalty_search(text, integer, integer) to authenticated;
grant execute on function public.loyalty_card_detail(uuid, text) to authenticated;
grant execute on function public.loyalty_card_history(uuid, bigint, integer) to authenticated;
grant execute on function public.loyalty_credit_ticket(uuid, integer, text, uuid, boolean) to authenticated;
grant execute on function public.loyalty_adjust_points(uuid, integer, text, uuid) to authenticated;
grant execute on function public.loyalty_redeem_reward(uuid, uuid, uuid) to authenticated;
grant execute on function public.loyalty_revert_event(uuid, text, uuid) to authenticated;
grant execute on function public.loyalty_list_rewards() to authenticated;
grant execute on function public.loyalty_save_reward(jsonb, uuid) to authenticated;
grant execute on function public.loyalty_reissue_access(uuid, text, uuid, text) to authenticated;
grant execute on function public.loyalty_update_customer(uuid, jsonb, text, uuid) to authenticated;
grant execute on function public.loyalty_set_card_status(uuid, text, text, uuid) to authenticated;
grant execute on function public.loyalty_update_settings(jsonb) to authenticated;
grant execute on function public.loyalty_set_qr_pin(text, text) to authenticated;
grant execute on function public.loyalty_reconcile() to authenticated;

commit;
