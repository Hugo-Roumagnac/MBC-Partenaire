-- =============================================================================
-- MBC Partenaires — schéma Supabase complet (tables, sécurité RLS, temps réel)
-- À coller UNE fois dans Supabase : SQL Editor → New query → Run.
-- Le script peut être relancé sans risque (il ne supprime aucune donnée).
-- Les noms de colonnes (snake_case) correspondent exactement à ce que lit le front.
--
-- ÉVOLUTIONS v2 (relancer le script sur une base existante suffit : tout est en
-- « if not exists » / « drop … if exists ») :
--   • partenaires.siret  : numéro SIRET (14 chiffres, clé de Luhn vérifiée côté front)
--   • partenaires.logo   : adresse du logo (URL publique Supabase Storage) — voir §5
--   • presences.presence : nouvelle valeur « Contact à rajouter »
--   • affectations       : ventilation des fonds par catégorie (où va l'argent)
--   • reglages.categories: liste des catégories d'affectation, modifiable à l'écran
--   • journal + trigger  : historique « qui modifie quoi, depuis quel compte » (§6)
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
  siret                  text not null default '' check (siret = '' or siret ~ '^[0-9]{14}$'), -- v2 : 14 chiffres sans espace (ou vide)
  logo                   text not null default '',          -- v2 : URL publique du logo (bucket « logos »), vide = monogramme
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
  presence      text not null default 'En attente' check (presence in ('Oui','En attente','Non','Contact à rajouter')), -- v2 : + « Contact à rajouter »
  personnes     integer not null default 0 check (personnes >= 0),
  noms          text not null default '',
  cree_le       timestamptz not null default now(),
  unique (evenement_id, partenaire_id)
);

-- v2 — Affectation des fonds : « où va l'argent ». Une ligne = une part du montant
-- validé d'un partenaire, rangée dans une catégorie (Cotisations, Équipement…).
-- Les totaux par catégorie sont CALCULÉS par le front (selectors.calculerVentilation),
-- rien n'est stocké en double.
create table if not exists public.affectations (
  id            uuid primary key default gen_random_uuid(),
  partenaire_id text not null references public.partenaires(id) on delete cascade,
  saison        text not null,
  categorie     text not null,
  montant       numeric(12,2) not null default 0 check (montant >= 0),
  note          text not null default '',
  cree_le       timestamptz not null default now()
);

-- v2 — Journal d'audit (« qui modifie quoi et depuis quel compte »).
-- Rempli UNIQUEMENT par le trigger public.journaliser() (voir §2 bis) : aucun membre
-- ne peut y écrire, le modifier ni l'effacer depuis le site → journal infalsifiable.
create table if not exists public.journal (
  id            bigint generated always as identity primary key,
  le            timestamptz not null default now(),          -- horodatage serveur (pas l'horloge du navigateur)
  email         text not null default '',                    -- compte connecté (JWT) ; vide = action d'administration SQL
  nom           text not null default '',                    -- nom du membre au moment de l'action
  appareil      text not null default '',                    -- navigateur / système (en-tête User-Agent)
  action        text not null check (action in ('INSERT','UPDATE','DELETE')),
  table_nom     text not null,                               -- table touchée (« table » est un mot réservé)
  ligne_id      text not null default '',                    -- clé de la ligne touchée
  partenaire_id text,                                        -- fiche concernée (sans clé étrangère : le journal survit à la suppression)
  avant         jsonb,                                       -- UPDATE : anciennes valeurs des SEULS champs modifiés ; DELETE : ligne complète
  apres         jsonb,                                       -- UPDATE : nouvelles valeurs ; INSERT : ligne complète
  champs        text[] not null default '{}'                 -- UPDATE : liste des colonnes modifiées
);

-- Évolutions des tables existantes (bases créées avant la v2)
alter table public.partenaires add column if not exists siret text not null default '';
alter table public.partenaires add column if not exists logo  text not null default '';
alter table public.partenaires drop constraint if exists partenaires_siret_check;
alter table public.partenaires add  constraint partenaires_siret_check check (siret = '' or siret ~ '^[0-9]{14}$');
alter table public.presences   drop constraint if exists presences_presence_check;
alter table public.presences   add  constraint presences_presence_check check (presence in ('Oui','En attente','Non','Contact à rajouter'));
alter table public.reglages    add column if not exists categories text[] not null
  default array['Cotisations','Sponsoring','Mécénat','Équipement','Événementiel','Déplacements','Formation jeunes','Fonctionnement'];

-- Index sur les clés étrangères (performance)
create index if not exists contrats_partenaire_idx      on public.contrats (partenaire_id);
create index if not exists echeances_partenaire_idx     on public.echeances (partenaire_id);
create index if not exists contreparties_partenaire_idx on public.contreparties (partenaire_id);
create index if not exists contacts_partenaire_idx      on public.contacts (partenaire_id);
create index if not exists echanges_partenaire_idx      on public.echanges (partenaire_id);
create index if not exists presences_evenement_idx      on public.presences (evenement_id);
create index if not exists presences_partenaire_idx     on public.presences (partenaire_id);
create index if not exists affectations_partenaire_idx  on public.affectations (partenaire_id);
create index if not exists journal_le_idx               on public.journal (le desc);
create index if not exists journal_partenaire_idx       on public.journal (partenaire_id, le desc);

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
  foreach t in array array['partenaires','contrats','echeances','contreparties','contacts','echanges','evenements','presences','affectations'] loop
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

-- Journal : LECTURE SEULE pour les membres. Aucune règle insert/update/delete :
-- seule la fonction trigger (security definer) peut y écrire.
alter table public.journal enable row level security;
drop policy if exists "membres lisent" on public.journal;
create policy "membres lisent" on public.journal for select to authenticated using (public.est_membre());
revoke all on public.journal from anon, authenticated;
grant select on public.journal to authenticated;

-- ---------------------------------------------------------------------------
-- 2 bis. JOURNAL D'AUDIT (v2) — architecture « journal générique avant/après »
-- ---------------------------------------------------------------------------
-- Pourquoi un trigger plutôt qu'une écriture depuis le navigateur ?
--   1. Impossible à contourner : toute écriture (site, autre outil, SQL) est tracée.
--   2. Identité fiable : l'e-mail vient du jeton JWT vérifié par Supabase, pas du front.
--   3. Horodatage serveur : l'horloge du poste du membre n'intervient pas.
-- Pour chaque ligne modifiée on enregistre :
--   INSERT → apres = ligne complète          (permet d'annuler une création)
--   UPDATE → avant/apres = champs modifiés    (permet de restaurer une valeur)
--   DELETE → avant = ligne complète           (permet de recréer la ligne supprimée)
-- Les champs purement techniques (modifie_le, modifie_par, cree_le) sont ignorés :
-- une mise à jour qui ne touche qu'eux ne crée pas de ligne de journal.
create or replace function public.journaliser()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_avant    jsonb  := case when tg_op <> 'INSERT' then to_jsonb(old) end; -- ancienne ligne
  v_apres    jsonb  := case when tg_op <> 'DELETE' then to_jsonb(new) end; -- nouvelle ligne
  v_ligne    jsonb  := coalesce(v_apres, v_avant);                         -- ligne de référence
  v_email    text   := lower(coalesce(auth.jwt() ->> 'email', ''));        -- compte connecté
  v_champs   text[] := '{}';                                               -- colonnes modifiées
  v_entetes  json;                                                         -- en-têtes HTTP (PostgREST)
begin
  if tg_op = 'UPDATE' then
    -- 1) liste des colonnes réellement modifiées (hors champs techniques)
    select coalesce(array_agg(k order by k), '{}') into v_champs
      from jsonb_object_keys(v_apres) as k
     where k not in ('modifie_le', 'modifie_par', 'cree_le')
       and (v_avant -> k) is distinct from (v_apres -> k);
    if cardinality(v_champs) = 0 then return null; end if; -- rien de significatif : pas de ligne
    -- 2) on ne garde QUE ces colonnes dans avant / après (journal compact et lisible)
    select jsonb_object_agg(k, v_avant -> k), jsonb_object_agg(k, v_apres -> k)
      into v_avant, v_apres
      from unnest(v_champs) as k;
  end if;

  -- 3) « depuis quel appareil » : PostgREST expose les en-têtes de la requête
  begin v_entetes := current_setting('request.headers', true)::json; exception when others then v_entetes := null; end;

  insert into public.journal (email, nom, appareil, action, table_nom, ligne_id, partenaire_id, avant, apres, champs)
  values (
    v_email,
    coalesce((select m.nom from public.membres m where m.email = v_email), ''),
    left(coalesce(v_entetes ->> 'user-agent', ''), 300),
    tg_op,
    tg_table_name,
    coalesce(v_ligne ->> 'id', ''),
    case when tg_table_name = 'partenaires' then v_ligne ->> 'id' else v_ligne ->> 'partenaire_id' end,
    v_avant,
    v_apres,
    v_champs
  );
  return null; -- trigger AFTER : la valeur de retour est ignorée
end;
$$;
revoke all on function public.journaliser() from public;

-- Branche le trigger sur toutes les tables métier (relançable sans doublon)
do $$
declare t text;
begin
  foreach t in array array['partenaires','contrats','echeances','contreparties','contacts','echanges','evenements','presences','affectations','reglages'] loop
    execute format('drop trigger if exists journaliser on public.%I', t);
    execute format('create trigger journaliser after insert or update or delete on public.%I for each row execute function public.journaliser()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 3. TEMPS RÉEL (§7) : les modifications d'un membre apparaissent chez les autres
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['partenaires','contrats','echeances','contreparties','contacts','echanges','evenements','presences','reglages','membres','affectations','journal'] loop
    execute format('alter table public.%I replica identity full', t);
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 3 bis. STOCKAGE DES LOGOS (v2) — bucket Supabase Storage « logos »
-- ---------------------------------------------------------------------------
-- Fonctionnement (détaillé dans README-front.md, section « Logos ») :
--   1. le navigateur redimensionne l'image (256 px max) et la convertit en WebP ;
--   2. il dépose le fichier dans logos/<id-partenaire>/<horodatage>.webp ;
--   3. il écrit l'URL publique dans partenaires.logo → le temps réel prévient
--      les autres membres, qui voient le logo apparaître sans recharger.
-- Lecture PUBLIQUE (un logo d'entreprise est une information publique et l'URL
-- contient un horodatage impossible à deviner) ; écriture réservée aux membres.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('logos', 'logos', true, 524288, array['image/webp','image/png','image/jpeg'])
on conflict (id) do update set public = excluded.public,
  file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "logos : membres deposent"  on storage.objects;
drop policy if exists "logos : membres remplacent" on storage.objects;
drop policy if exists "logos : membres suppriment" on storage.objects;
create policy "logos : membres deposent"  on storage.objects for insert to authenticated with check (bucket_id = 'logos' and public.est_membre());
create policy "logos : membres remplacent" on storage.objects for update to authenticated using (bucket_id = 'logos' and public.est_membre()) with check (bucket_id = 'logos' and public.est_membre());
create policy "logos : membres suppriment" on storage.objects for delete to authenticated using (bucket_id = 'logos' and public.est_membre());

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
