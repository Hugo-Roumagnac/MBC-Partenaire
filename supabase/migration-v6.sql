-- =============================================================================
-- MBC Partenaires — MIGRATION v6 : étiquette (catégorie) sur chaque échéance
--   « Sponsoring », « Cotisation » ou « Non précisé »
-- SQL Editor → New query → coller tout ce fichier → Run.
-- À lancer AVANT de déployer le front v6 (même sur la branche dev : elle utilise la même base).
-- Compatible avec le site v5 encore en ligne : il n'envoie pas cette colonne, la valeur par défaut s'applique.
-- Ne supprime aucune donnée ; peut être relancé sans risque.
-- =============================================================================

-- 1) Nouvelle colonne : toutes les échéances existantes reçoivent « Non précisé »
alter table public.echeances
  add column if not exists categorie text not null default 'Non précisé';

-- 2) Seules les trois valeurs prévues sont acceptées
alter table public.echeances drop constraint if exists echeances_categorie_check;
alter table public.echeances add constraint echeances_categorie_check
  check (categorie in ('Sponsoring','Cotisation','Non précisé'));

-- Rien d'autre à faire : les droits (RLS), le temps réel et le journal des modifications
-- portent sur la table entière et prennent la nouvelle colonne en compte automatiquement.

-- Vérification : doit afficher le nombre d'échéances par catégorie (au départ, tout est « Non précisé »)
select categorie, count(*) as echeances, sum(montant) as montant_total
from public.echeances
group by categorie
order by categorie;
