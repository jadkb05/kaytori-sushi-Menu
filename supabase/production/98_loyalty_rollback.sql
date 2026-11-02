-- =============================================================================
-- PRODUCTION — 98 : RETOUR ARRIÈRE de 13_loyalty.sql (fidélité uniquement)
--
-- DESTRUCTIF : retire le schéma loyalty et les fonctions public.loyalty_*. Le menu n'est pas touché.
-- À n'utiliser qu'avec un GO explicite.
--
-- Pour ARRÊTER le programme sans rien perdre, ne pas utiliser ce script : il suffit de le fermer
-- (owner : loyalty_update_settings({"is_active": false}), ou en SQL :
--  update loyalty.settings set is_active = false;). Les cartes restent consultables.
--
-- Garde-fous :
--   - ne fait RIEN tant que la confirmation ci-dessous n'est pas décommentée ;
--   - si des cartes existent, ne fait RIEN non plus sans une SECONDE confirmation explicite de
--     perte de données (exporter d'abord loyalty.customers, loyalty.cards et loyalty.events) ;
--   - à exécuter AVANT 99_rollback.sql si les deux sont nécessaires (la fidélité appelle is_admin()).
-- Une seule transaction : tout ou rien.
-- =============================================================================

begin;

-- Décommenter pour confirmer :
-- select set_config('kaytori.confirm_loyalty_rollback', 'OUI', true);
-- Uniquement si des cartes existent ET ont été exportées — décommenter pour accepter leur suppression :
-- select set_config('kaytori.confirm_loyalty_data_loss', 'SUPPRIMER LES CARTES', true);

do $rollback$
declare
  n_cards bigint := 0;
  n_events bigint := 0;
begin
  if coalesce(current_setting('kaytori.confirm_loyalty_rollback', true), '') <> 'OUI' then
    raise exception 'ARRÊT — rien n''a été modifié : confirmation absente (voir la ligne à décommenter).';
  end if;
  if to_regclass('loyalty.cards') is not null then
    select count(*) into n_cards from loyalty.cards;
    select count(*) into n_events from loyalty.events;
  end if;
  if n_cards > 0 and coalesce(current_setting('kaytori.confirm_loyalty_data_loss', true), '') <> 'SUPPRIMER LES CARTES' then
    raise exception 'ARRÊT — rien n''a été modifié : % carte(s) et % événement(s) existent. Fermer le programme suffit à l''arrêter ; sinon exporter puis confirmer la perte de données.', n_cards, n_events;
  end if;

  drop function if exists public.loyalty_reconcile();
  drop function if exists public.loyalty_set_qr_pin(text, text);
  drop function if exists public.loyalty_update_settings(jsonb);
  drop function if exists public.loyalty_set_card_status(uuid, text, text, uuid);
  drop function if exists public.loyalty_update_customer(uuid, jsonb, text, uuid);
  drop function if exists public.loyalty_reissue_access(uuid, text, uuid, text);
  drop function if exists public.loyalty_save_reward(jsonb, uuid);
  drop function if exists public.loyalty_list_rewards();
  drop function if exists public.loyalty_revert_event(uuid, text, uuid);
  drop function if exists public.loyalty_redeem_reward(uuid, uuid, uuid);
  drop function if exists public.loyalty_adjust_points(uuid, integer, text, uuid);
  drop function if exists public.loyalty_credit_ticket(uuid, integer, text, uuid, boolean);
  drop function if exists public.loyalty_card_history(uuid, bigint, integer);
  drop function if exists public.loyalty_card_detail(uuid, text);
  drop function if exists public.loyalty_search(text, integer, integer);
  drop function if exists public.loyalty_stats();
  drop function if exists public.loyalty_qr_close_session(text);
  drop function if exists public.loyalty_qr_credit_points(text, text, integer, text, uuid);
  drop function if exists public.loyalty_qr_unlock(text, text);
  drop function if exists public.loyalty_qr_card_status(text);
  drop function if exists public.loyalty_client_redeem_reward(text, uuid, uuid);
  drop function if exists public.loyalty_card_view(text);
  drop function if exists public.loyalty_register(text, text, text, uuid);
  drop function if exists public.loyalty_program();
  drop function if exists public.loyalty_my_role();

  -- Fonctions internes (certaines utilisent le type des tables), puis tables (sessions → journal →
  -- cartes → récompenses → fiches), puis le schéma, sans CASCADE : un objet inattendu dans loyalty
  -- fait échouer le retour arrière au lieu d'être supprimé.
  drop function if exists loyalty.registration_replay(uuid, bytea, text);
  drop function if exists loyalty.settings_audit_json(loyalty.settings);
  drop function if exists loyalty.points_credited_today(uuid);
  drop function if exists loyalty.last_valid_points_at(uuid);
  drop function if exists loyalty.lock_card(uuid);
  drop function if exists loyalty.result(text, uuid, uuid, boolean, jsonb);
  drop function if exists loyalty.staff_card_json(uuid);
  drop function if exists loyalty.public_card_json(uuid);
  drop function if exists loyalty.public_card_history_json(uuid);
  drop function if exists loyalty.active_rewards_json(integer, boolean);
  drop function if exists loyalty.compute_ticket_points(integer, loyalty.settings);
  drop function if exists loyalty.find_replay(uuid, text, uuid, uuid);
  drop function if exists loyalty.require_staff(text);
  drop function if exists loyalty.staff_role();
  drop function if exists loyalty.mask_phone(text, integer);
  drop function if exists loyalty.format_phone(text);
  drop function if exists loyalty.clean_order_ref(text);
  drop function if exists loyalty.clean_reason(text);
  drop function if exists loyalty.clean_public_code(text);
  drop function if exists loyalty.new_redemption_code();
  drop function if exists loyalty.new_public_code();
  drop function if exists loyalty.token_hash(text);
  drop function if exists loyalty.fold(text);
  drop function if exists loyalty.clean_name(text);
  drop function if exists loyalty.normalize_phone(text);
  drop function if exists loyalty.space_class();
  drop table if exists loyalty.qr_sessions;
  drop table if exists loyalty.qr_state;
  drop table if exists loyalty.events;
  drop table if exists loyalty.cards;
  drop table if exists loyalty.rewards;
  drop table if exists loyalty.customers;
  drop table if exists loyalty.staff;
  drop table if exists loyalty.settings;
  drop function if exists loyalty.reject_change();
  drop schema if exists loyalty;

  raise notice 'Fidélité retirée : % carte(s), % événement(s) supprimés.', n_cards, n_events;
end
$rollback$;

commit;
