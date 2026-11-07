-- =============================================================================
-- MBC Partenaires — MIGRATION v2 (à lancer UNE fois sur une base déjà en service)
-- SQL Editor → New query → coller tout ce fichier → Run.
-- Ne supprime ni ne modifie aucune donnée existante ; peut être relancé sans risque.
-- Ajoute : SIRET, logo, « Contact à rajouter »,
--          journal d'audit (table + trigger), bucket de stockage « logos ».
-- =============================================================================

-- ---------- 1. Colonnes et contraintes ----------
alter table public.partenaires add column if not exists siret text not null default '';
alter table public.partenaires add column if not exists logo  text not null default '';
alter table public.partenaires drop constraint if exists partenaires_siret_check;
alter table public.partenaires add  constraint partenaires_siret_check check (siret = '' or siret ~ '^[0-9]{14}$');

alter table public.presences drop constraint if exists presences_presence_check;
alter table public.presences add  constraint presences_presence_check check (presence in ('Oui','En attente','Non','Contact à rajouter'));


-- ---------- 2. Nouvelles tables ----------
create table if not exists public.journal (
  id            bigint generated always as identity primary key,
  le            timestamptz not null default now(),
  email         text not null default '',
  nom           text not null default '',
  appareil      text not null default '',
  action        text not null check (action in ('INSERT','UPDATE','DELETE')),
  table_nom     text not null,
  ligne_id      text not null default '',
  partenaire_id text,
  avant         jsonb,
  apres         jsonb,
  champs        text[] not null default '{}'
);

create index if not exists journal_le_idx              on public.journal (le desc);
create index if not exists journal_partenaire_idx      on public.journal (partenaire_id, le desc);

-- ---------- 3. Sécurité (RLS) ----------
-- Journal : lecture seule pour les membres ; seul le trigger y écrit
alter table public.journal enable row level security;
drop policy if exists "membres lisent" on public.journal;
create policy "membres lisent" on public.journal for select to authenticated using (public.est_membre());
revoke all on public.journal from anon, authenticated;
grant select on public.journal to authenticated;

-- ---------- 4. Trigger d'audit ----------
create or replace function public.journaliser()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_avant    jsonb  := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_apres    jsonb  := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  v_ligne    jsonb  := coalesce(v_apres, v_avant);
  v_email    text   := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_champs   text[] := '{}';
  v_entetes  json;
begin
  if tg_op = 'UPDATE' then
    select coalesce(array_agg(k order by k), '{}') into v_champs
      from jsonb_object_keys(v_apres) as k
     where k not in ('modifie_le', 'modifie_par', 'cree_le')
       and (v_avant -> k) is distinct from (v_apres -> k);
    if cardinality(v_champs) = 0 then return null; end if;
    select jsonb_object_agg(k, v_avant -> k), jsonb_object_agg(k, v_apres -> k)
      into v_avant, v_apres
      from unnest(v_champs) as k;
  end if;

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
  return null;
end;
$$;
revoke all on function public.journaliser() from public;

do $$
declare t text;
begin
  foreach t in array array['partenaires','contrats','echeances','contreparties','contacts','echanges','evenements','presences','reglages'] loop
    execute format('drop trigger if exists journaliser on public.%I', t);
    execute format('create trigger journaliser after insert or update or delete on public.%I for each row execute function public.journaliser()', t);
  end loop;
end $$;

-- ---------- 5. Temps réel pour le journal ----------
do $$
declare t text;
begin
  foreach t in array array['journal'] loop
    execute format('alter table public.%I replica identity full', t);
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ---------- 6. Stockage des logos ----------
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

-- ---------- Vérification : doit afficher 4 lignes « ok » ----------
select 'ok' as etat, 'table journal' as element from information_schema.tables where table_schema = 'public' and table_name = 'journal'
union all select 'ok', 'colonne logo' from information_schema.columns where table_schema = 'public' and table_name = 'partenaires' and column_name = 'logo'
union all select 'ok', 'colonne siret' from information_schema.columns where table_schema = 'public' and table_name = 'partenaires' and column_name = 'siret'
union all select 'ok', 'bucket logos' from storage.buckets where id = 'logos';
