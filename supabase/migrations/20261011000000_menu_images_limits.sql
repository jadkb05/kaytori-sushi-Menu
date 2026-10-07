-- =============================================================================
-- Kaytôri Sushi — limites du bucket « menu-images »
--
-- Aligne Storage sur la validation de l'admin : 5 Mo maximum, JPEG / PNG / WebP uniquement.
-- Aucun fichier existant n'est modifié ni supprimé. Idempotent (déjà appliqué à la main sur TEST).
-- =============================================================================

update storage.buckets
   set file_size_limit = 5242880,
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
 where id = 'menu-images';
