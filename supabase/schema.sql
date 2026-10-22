-- =============================================================================
-- MBC Partenaires — schéma Supabase complet (tables, sécurité RLS, temps réel)
-- À coller UNE fois dans Supabase : SQL Editor → New query → Run.
-- Le script peut être relancé sans risque (il ne supprime aucune donnée).
-- Les noms de colonnes (snake_case) correspondent exactement à ce que lit le front.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. TABLES
-- ---------------------------------------------------------------------------

-- Membres autorisés à se connecter (§6 : retirer une ligne coupe l'accès)
create table if not exists public.membres (
  email text primary key check (email = lower(email)),
  nom   text not null default ''
);

-- Réglages du club : une seule ligne (id = 1)
create table if not exists public.reglages (
  id                integer primary key default 1 check (id = 1),
  saison_en_cours   text    not null default '2026-27',
  saison_precedente text    not null default '2025-26',
  objectif          numeric(12,2) not null default 0 check (objectif >= 0),
  responsables      text[]  not null default '{}',
  catalogue         text[]  not null default '{}'
);

-- Fiche partenaire : une seule fiche par entreprise
create table if not exists public.partenaires (
  id                     text primary key,                 -- identifiant lisible créé par le front (ex. « boulangerie-dupont »)
  nom                    text not null,
  secteur                text not null default '',
  etape                  text not null default 'Prospect'
                         check (etape in ('Prospect','Contacté','RDV','Proposition','Négociation','Signé','Perdu','Archivé')),
  type                   text not null default 'Sponsoring'
                         check (type in ('','Sponsoring','Mécénat','Sponsoring + mécénat','En nature','Média','Institution')),
  responsable            text not null default '',
  notes                  text not null default '',
  prochaine_action_date  date,
  prochaine_action_texte text not null default '',
  premier_contact        date default current_date,
  modifie_le             timestamptz not null default now(),
  modifie_par            text not null default '',
  cree_le                timestamptz not null default now()
);
create unique index if not exists partenaires_nom_unique on public.partenaires (lower(nom));

-- Contrat de saison : un par partenaire et par saison (historique conservé)
create table if not exists public.contrats (
  id                  uuid primary key default gen_random_uuid(),
  partenaire_id       text not null references public.partenaires(id) on delete cascade,
  saison              text not null,
  montant_demande     numeric(12,2) not null default 0 check (montant_demande >= 0),
  cotisation_demandee numeric(12,2) not null default 200 check (cotisation_demandee >= 0),
  montant_valide      numeric(12,2) not null default 0 check (montant_valide >= 0),
  cotisation_validee  numeric(12,2) not null default 0 check (cotisation_validee >= 0),
  dont_mecenat        numeric(12,2) not null default 0 check (dont_mecenat >= 0),
  cerfa_emis          boolean not null default false,
  nature_valeur       numeric(12,2) not null default 0 check (nature_valeur >= 0),
  nature_description  text not null default '',
  modalites           text not null default '',
  cree_le             timestamptz not null default now(),
  unique (partenaire_id, saison)
);

-- Échéances (paiements prévus)
create table if not exists public.echeances (
  id            uuid primary key default gen_random_uuid(),
  partenaire_id text not null references public.partenaires(id) on delete cascade,
  saison        text not null,
  date_prevue   date,
  montant       numeric(12,2) not null default 0 check (montant >= 0),
  paye          boolean not null default false,
  note          text not null default '',
  cree_le       timestamptz not null default now()
);

-- Contreparties promises
create table if not exists public.contreparties (
  id            uuid primary key default gen_random_uuid(),
  partenaire_id text not null references public.partenaires(id) on delete cascade,
  saison        text not null,
  libelle       text not null,
  livree        boolean not null default false,
  cree_le       timestamptz not null default now()
);

-- Contacts (données personnelles : RGPD §6)
create table if not exists public.contacts (
  id            uuid primary key default gen_random_uuid(),
  partenaire_id text not null references public.partenaires(id) on delete cascade,
  nom           text not null default '',
  fonction      text not null default '',
  email         text not null default '',
  tel           text not null default '',
  cree_le       timestamptz not null default now()
);

-- Historique des échanges
create table if not exists public.echanges (
  id            uuid primary key default gen_random_uuid(),
  partenaire_id text not null references public.partenaires(id) on delete cascade,
  date          date not null default current_date,
  texte         text not null,
  auteur        text not null default '',
  auto          boolean not null default false,
  cree_le       timestamptz not null default now()
);

-- Événements du Business Club
create table if not exists public.evenements (
  id      text primary key,                                 -- créé par le front (ex. « evt-afterwork-de-rentree »)
  nom     text not null,
  date    date not null,
  type    text not null default 'Autre' check (type in ('Afterwork','Match','Business Club','Autre')),
  cree_le timestamptz not null default now()
);

-- Présences : un partenaire invité à un événement
create table if not exists public.presences (
  id            uuid primary key default gen_random_uuid(),
  evenement_id  text not null references public.evenements(id) on delete cascade,
  partenaire_id text not null references public.partenaires(id) on delete cascade,
  presence      text not null default 'En attente' check (presence in ('Oui','En attente','Non')),
  personnes     integer not null default 0 check (personnes >= 0),
  noms          text not null default '',
  cree_le       timestamptz not null default now(),
  unique (evenement_id, partenaire_id)
);

-- Index sur les clés étrangères (performance)
create index if not exists contrats_partenaire_idx      on public.contrats (partenaire_id);
create index if not exists echeances_partenaire_idx     on public.echeances (partenaire_id);
create index if not exists contreparties_partenaire_idx on public.contreparties (partenaire_id);
create index if not exists contacts_partenaire_idx      on public.contacts (partenaire_id);
create index if not exists echanges_partenaire_idx      on public.echanges (partenaire_id);
create index if not exists presences_evenement_idx      on public.presences (evenement_id);
create index if not exists presences_partenaire_idx     on public.presences (partenaire_id);

-- ---------------------------------------------------------------------------
-- 2. SÉCURITÉ (§6) : seul un compte dont l'e-mail est dans « membres » lit ou écrit
-- ---------------------------------------------------------------------------

create or replace function public.est_membre()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.membres
    where email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;
revoke all on function public.est_membre() from public;
grant execute on function public.est_membre() to authenticated;

-- Active RLS et crée une règle « membres uniquement » sur chaque table de données
do $$
declare t text;
begin
  foreach t in array array['partenaires','contrats','echeances','contreparties','contacts','echanges','evenements','presences'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "membres uniquement" on public.%I', t);
    execute format('create policy "membres uniquement" on public.%I for all to authenticated using (public.est_membre()) with check (public.est_membre())', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- Réglages : lecture + modification par les membres (pas de création ni suppression depuis le site)
alter table public.reglages enable row level security;
drop policy if exists "membres lisent" on public.reglages;
drop policy if exists "membres modifient" on public.reglages;
create policy "membres lisent"    on public.reglages for select to authenticated using (public.est_membre());
create policy "membres modifient" on public.reglages for update to authenticated using (public.est_membre()) with check (public.est_membre());
revoke all on public.reglages from anon;
grant select, update on public.reglages to authenticated;

-- Membres : lecture seule par les membres (ajout / retrait par un administrateur dans Supabase)
alter table public.membres enable row level security;
drop policy if exists "membres lisent" on public.membres;
create policy "membres lisent" on public.membres for select to authenticated using (public.est_membre());
revoke all on public.membres from anon;
grant select on public.membres to authenticated;

-- ---------------------------------------------------------------------------
-- 3. TEMPS RÉEL (§7) : les modifications d'un membre apparaissent chez les autres
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['partenaires','contrats','echeances','contreparties','contacts','echanges','evenements','presences','reglages','membres'] loop
    execute format('alter table public.%I replica identity full', t);
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 4. DONNÉES DE DÉPART
-- ---------------------------------------------------------------------------
insert into public.reglages (id, saison_en_cours, saison_precedente, objectif, responsables, catalogue)
values (1, '2026-27', '2025-26', 0,
  array['Thomas Roumagnac','Éric Bussing'],
  array['Pack P1','Pack P2','Pack P3','Pack P4','Écran géant','Logo short NM3','Dos maillot NM3',
        'Post réseaux sociaux','Post résultats','Newsletter','Vidéo réel','Invitations match',
        'Business Club / afterworks','Intervention équipe seniors','Équipe U15 Élite','Équipe U18',
        'Équipe SF1','Véhicules exposés','Diffusion radio NM3','Places cinéma à gagner'])
on conflict (id) do nothing;

-- Membres autorisés : REMPLACEZ les adresses par les vraies (en minuscules),
-- les mêmes que celles des comptes créés dans Authentication → Users.
insert into public.membres (email, nom) values
  ('thomas@remplacer.fr', 'Thomas Roumagnac'),
  ('eric@remplacer.fr',   'Éric Bussing')
on conflict (email) do update set nom = excluded.nom;
