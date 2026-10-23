-- =====================================================================
-- Invitations par e-mail — MBC Partenaires
-- À exécuter une fois : Supabase > SQL Editor > coller ce fichier > Run
-- (ou `supabase db push` si vous utilisez la CLI).
--
-- Principe de sécurité :
--   * le jeton envoyé par e-mail n'est JAMAIS stocké en clair : seule son
--     empreinte SHA-256 est enregistrée (token_hash). Une fuite de la base
--     ne permet donc pas d'utiliser les invitations en attente ;
--   * toutes les écritures passent par l'Edge Function « invitations »
--     (clé service_role, côté serveur). Le navigateur ne peut que LIRE la
--     liste des invitations, et seulement s'il est membre, sans la colonne
--     token_hash.
-- =====================================================================

-- Prérequis : supabase/schema.sql déjà exécuté (tables « membres », fonction public.est_membre()).

create table if not exists public.invitations (
  id           uuid primary key default gen_random_uuid(),
  email        text not null check (email = lower(email) and email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'),
  token_hash   text not null unique,                 -- SHA-256 (hex) du jeton envoyé par e-mail
  statut       text not null default 'pending'
               check (statut in ('pending', 'accepted', 'expired', 'revoked')),
  invite_par   text,                                 -- e-mail du membre qui a invité
  expire_le    timestamptz not null,
  cree_le      timestamptz not null default now(),
  accepte_le   timestamptz
);

-- Une seule invitation « pending » à la fois par adresse.
create unique index if not exists invitations_une_en_attente
  on public.invitations (email) where statut = 'pending';
create index if not exists invitations_email_idx on public.invitations (email);

-- ---------------------------------------------------------------------
-- Droits : lecture seule pour les membres connectés, sans token_hash.
-- ---------------------------------------------------------------------
alter table public.invitations enable row level security;

revoke all on public.invitations from anon, authenticated;
grant select (id, email, statut, invite_par, expire_le, cree_le, accepte_le)
  on public.invitations to authenticated;

-- public.est_membre() est déjà définie dans supabase/schema.sql : on la réutilise telle quelle.
drop policy if exists "membres lisent les invitations" on public.invitations;
create policy "membres lisent les invitations"
  on public.invitations for select to authenticated
  using (public.est_membre());

-- ---------------------------------------------------------------------
-- Une adresse est-elle déjà associée à un compte ?
-- (membre existant OU compte Supabase Auth existant). Réservée au serveur.
-- ---------------------------------------------------------------------
create or replace function public.email_deja_inscrit(p_email text)
returns boolean
language sql stable security definer set search_path = public, auth
as $$
  select exists (select 1 from public.membres where lower(email) = lower(p_email))
      or exists (select 1 from auth.users     where lower(email) = lower(p_email));
$$;
revoke all on function public.email_deja_inscrit(text) from public, anon, authenticated;
grant execute on function public.email_deja_inscrit(text) to service_role;

-- ---------------------------------------------------------------------
-- Passage automatique en « expired » des invitations périmées.
-- Appelée par l'Edge Function à chaque requête ; peut aussi être planifiée
-- (Database > Cron) : select public.expirer_invitations();
-- ---------------------------------------------------------------------
create or replace function public.expirer_invitations()
returns integer
language sql security definer set search_path = public
as $$
  with maj as (
    update public.invitations set statut = 'expired'
    where statut = 'pending' and expire_le <= now()
    returning 1
  )
  select count(*)::int from maj;
$$;
revoke all on function public.expirer_invitations() from public, anon, authenticated;
grant execute on function public.expirer_invitations() to service_role;
