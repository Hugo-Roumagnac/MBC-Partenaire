-- =============================================================================
-- MBC Partenaires — MIGRATION v3, ÉTAPE 2 : finalisation du statut « Contacter »
-- À lancer SEULEMENT quand la v3 est en PRODUCTION (branche main fusionnée et publiée sur Netlify).
-- Avant cela, l'ancien site en production utilise encore « Contact à rajouter » : ne pas lancer.
-- SQL Editor → New query → coller tout ce fichier → Run. Peut être relancé sans risque.
-- =============================================================================

-- 1. Les anciennes lignes prennent le nouveau nom (le journal d'audit trace chaque changement)
update public.presences set presence = 'Contacter' where presence = 'Contact à rajouter';

-- 2. L'ancienne valeur n'est plus acceptée
alter table public.presences drop constraint if exists presences_presence_check;
alter table public.presences add  constraint presences_presence_check check (presence in ('Oui','En attente','Non','Contacter'));

-- Vérification : doit afficher 1 ligne « ok »
select 'ok' as etat, 'plus aucun « Contact à rajouter »' as element where not exists (select 1 from public.presences where presence = 'Contact à rajouter');
