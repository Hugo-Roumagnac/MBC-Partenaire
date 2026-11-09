-- =============================================================================
-- MBC Partenaires — MIGRATION v4, ÉTAPE 1 : statut « Contacté en attente »
-- SQL Editor → New query → coller tout ce fichier → Run.
-- À lancer AVANT de déployer le front v4 (branche de test comprise : elle utilise la même base).
-- Compatible avec le site encore en production : les anciennes valeurs restent acceptées.
-- Ne supprime aucune donnée ; peut être relancé sans risque.
-- =============================================================================

-- « Contacté en attente » remplace « En attente » et « Contacter » (fusion des deux statuts).
-- Le front v4 lit déjà les anciennes valeurs sous le nouveau nom : les deux versions du site cohabitent.
alter table public.presences drop constraint if exists presences_presence_check;
alter table public.presences add  constraint presences_presence_check check (presence in ('Oui','Contacté en attente','Non','En attente','Contacter','Contact à rajouter'));

-- Vérification : doit afficher 1 ligne « ok »
select 'ok' as etat, 'statut Contacté en attente accepté' as element from pg_constraint where conname = 'presences_presence_check' and pg_get_constraintdef(oid) like '%Contacté en attente%';
