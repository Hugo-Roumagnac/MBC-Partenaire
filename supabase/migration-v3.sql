-- =============================================================================
-- MBC Partenaires — MIGRATION v3, ÉTAPE 1 (à lancer UNE fois sur une base déjà en v2)
-- SQL Editor → New query → coller tout ce fichier → Run.
-- À lancer AVANT de déployer le front v3 (branche de dev comprise : elle utilise la même base).
-- Compatible avec l'ancien front encore en production : rien n'est retiré ni converti ici.
-- Ne supprime aucune donnée ; peut être relancé sans risque.
-- Ajoute :
--   1. statut de présence « Contacter » (l'ancien « Contact à rajouter » reste accepté pendant la transition ;
--      il sera converti par migration-v3-finalisation.sql une fois la v3 en production)
--   2. table « documents » (convention signée + autres documents d'un partenaire)
--   3. bucket PRIVÉ « documents » dans Supabase Storage (lecture/écriture réservées aux membres)
-- =============================================================================

-- ---------- 1. Présences : « Contacter » accepté (en plus de l'ancienne valeur, pendant la transition) ----------
-- Le front v3 lit déjà « Contact à rajouter » comme « Contacter » : les deux versions du site cohabitent.
alter table public.presences drop constraint if exists presences_presence_check;
alter table public.presences add  constraint presences_presence_check check (presence in ('Oui','En attente','Non','Contacter','Contact à rajouter'));

-- ---------- 2. Table des documents ----------
-- Une ligne = un fichier déposé dans le bucket « documents ». Le fichier lui-même vit dans Storage,
-- à l'adresse « chemin » (<id-partenaire>/<categorie>/<horodatage>-<nom>).
create table if not exists public.documents (
  id            uuid primary key default gen_random_uuid(),
  partenaire_id text not null references public.partenaires(id) on delete cascade,
  categorie     text not null default 'autre' check (categorie in ('convention','autre')),
  nom           text not null,                               -- nom d'origine du fichier (affiché)
  chemin        text not null,                               -- clé dans le bucket « documents »
  taille        bigint not null default 0 check (taille >= 0),
  type_mime     text not null default '',
  saison        text not null default '',                    -- saison en cours au moment du dépôt
  ajoute_par    text not null default '',
  cree_le       timestamptz not null default now()
);
create index if not exists documents_partenaire_idx on public.documents (partenaire_id);

alter table public.documents enable row level security;
drop policy if exists "membres uniquement" on public.documents;
create policy "membres uniquement" on public.documents for all to authenticated using (public.est_membre()) with check (public.est_membre());
revoke all on public.documents from anon;
grant select, insert, update, delete on public.documents to authenticated;

-- Journal d'audit (le trigger public.journaliser() existe depuis la v2)
drop trigger if exists journaliser on public.documents;
create trigger journaliser after insert or update or delete on public.documents for each row execute function public.journaliser();

-- Temps réel : un document ajouté par un membre apparaît chez les autres
alter table public.documents replica identity full;
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'documents') then
    alter publication supabase_realtime add table public.documents;
  end if;
end $$;

-- ---------- 3. Bucket PRIVÉ « documents » ----------
-- Contrairement aux logos, une convention ou un RIB n'est PAS public : le bucket est privé et le
-- site obtient une adresse de téléchargement temporaire (signée, 2 minutes) pour chaque ouverture.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 15728640, array[
  'application/pdf',
  'image/png','image/jpeg','image/webp','image/heic',
  'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.oasis.opendocument.text','application/vnd.oasis.opendocument.spreadsheet',
  'text/plain','text/csv'])
on conflict (id) do update set public = excluded.public,
  file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "documents : membres lisent"     on storage.objects;
drop policy if exists "documents : membres deposent"   on storage.objects;
drop policy if exists "documents : membres suppriment" on storage.objects;
create policy "documents : membres lisent"     on storage.objects for select to authenticated using (bucket_id = 'documents' and public.est_membre());
create policy "documents : membres deposent"   on storage.objects for insert to authenticated with check (bucket_id = 'documents' and public.est_membre());
create policy "documents : membres suppriment" on storage.objects for delete to authenticated using (bucket_id = 'documents' and public.est_membre());

-- ---------- Vérification : doit afficher 3 lignes « ok » ----------
select 'ok' as etat, 'statut Contacter accepté' as element from pg_constraint where conname = 'presences_presence_check' and pg_get_constraintdef(oid) like '%Contacter%'
union all select 'ok', 'table documents' from information_schema.tables where table_schema = 'public' and table_name = 'documents'
union all select 'ok', 'bucket documents (privé)' from storage.buckets where id = 'documents' and public = false;
