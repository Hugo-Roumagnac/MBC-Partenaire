-- =============================================================================
-- MBC Partenaires — MIGRATION v4, ÉTAPE 2 : finalisation du statut « Contacté en attente »
-- À lancer SEULEMENT quand la v4 est en PRODUCTION (branche main publiée sur Netlify).
-- Avant cela, l'ancien site en production écrit encore « En attente » / « Contacter » : ne pas lancer.
-- SQL Editor → New query → coller tout ce fichier → Run. Peut être relancé sans risque.
-- =============================================================================

-- 1. Les anciennes lignes prennent le nouveau nom (le journal d'audit trace chaque changement)
update public.presences set presence = 'Contacté en attente' where presence in ('En attente','Contacter','Contact à rajouter');

-- 2. Nouvelle valeur par défaut, anciennes valeurs refusées
alter table public.presences alter column presence set default 'Contacté en attente';
alter table public.presences drop constraint if exists presences_presence_check;
alter table public.presences add  constraint presences_presence_check check (presence in ('Oui','Contacté en attente','Non'));

-- Vérification : doit afficher 1 ligne « ok »
select 'ok' as etat, 'plus aucune ancienne valeur' as element where not exists (select 1 from public.presences where presence in ('En attente','Contacter','Contact à rajouter'));
