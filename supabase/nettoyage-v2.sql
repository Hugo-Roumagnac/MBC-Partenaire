-- =============================================================================
-- MBC Partenaires — NETTOYAGE FACULTATIF (après la première version de migration-v2.sql)
-- -----------------------------------------------------------------------------
-- La saisie manuelle « Affectation des fonds » a été remplacée par une répartition
-- CALCULÉE automatiquement (cotisations / sponsoring / mécénat) à partir des contrats.
-- La table « affectations » et la colonne « reglages.categories » ne servent donc plus.
-- Les garder ne gêne pas l'application ; ce script les retire simplement pour garder
-- une base propre. Il ne touche à AUCUNE autre donnée (partenaires, contrats, membres…).
-- =============================================================================
drop table if exists public.affectations;                   -- supprime aussi son trigger et ses règles RLS
alter table public.reglages drop column if exists categories; -- liste des catégories, inutile désormais
select 'ok' as etat, 'nettoyage terminé' as element;
