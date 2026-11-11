-- =============================================================================
-- MBC Partenaires — MIGRATION v5 : quatre statuts de présence
--   « À contacter », « Contacté en attente », « Oui », « Non »
-- SQL Editor → New query → coller tout ce fichier → Run.
-- À lancer AVANT de pousser le front v5 en production.
-- Compatible avec le site v4 encore en ligne (il n'écrit que des valeurs autorisées ici).
-- Ne supprime aucune donnée ; peut être relancé sans risque.
-- =============================================================================

alter table public.presences drop constraint if exists presences_presence_check;

-- Anciennes valeurs éventuellement restantes (si migration-v4-finalisation.sql n'a pas été lancée)
update public.presences set presence = 'Contacté en attente' where presence = 'En attente';
update public.presences set presence = 'À contacter'         where presence in ('Contacter','Contact à rajouter');

alter table public.presences alter column presence set default 'Contacté en attente';
alter table public.presences add constraint presences_presence_check
  check (presence in ('À contacter','Contacté en attente','Oui','Non'));

-- Vérification : doit afficher 1 ligne « ok »
select 'ok' as etat, 'statut À contacter accepté' as element
from pg_constraint
where conname = 'presences_presence_check' and pg_get_constraintdef(oid) like '%À contacter%';
