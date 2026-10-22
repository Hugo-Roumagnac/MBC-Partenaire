// api.js — UNIQUE point d'accès aux données. Même interface en mode "supabase" et en mode "mock".
import { CONFIG } from "./config.js"; // mode et identifiants
import { seedTables } from "./mock-seed.js"; // données de départ du mode mock

export const TABLES = ["partenaires", "contrats", "echeances", "contreparties", "contacts", "echanges", "evenements", "presences", "reglages", "membres"]; // toutes les tables lues

const toCamel = (s) => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase()); // "date_prevue" → "datePrevue"
const toSnake = (s) => s.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase()); // "datePrevue" → "date_prevue"
const mapKeys = (obj, fn) => Object.fromEntries(Object.entries(obj || {}).map(([k, v]) => [fn(k), v])); // renomme les clés d'un objet
const pk = (table) => (table === "membres" ? "email" : "id"); // clé primaire de chaque table

let client = null; // client Supabase (mode "supabase" uniquement)

// ---------- Initialisation ----------
export async function init() {
  if (CONFIG.MODE !== "supabase") return null; // le mode mock n'a rien à initialiser
  if (client) return client; // déjà initialisé (auth.js puis store.js l'appellent tous deux)
  const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm"); // chargé à la demande, version épinglée
  client = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true } }); // session conservée
  return client; // exposé pour auth.js
}
export const getClient = () => client; // auth.js en a besoin

// ---------- Lecture complète ----------
async function lireToutSupabase(table) {
  const lignes = []; // accumulateur
  for (let debut = 0; ; debut += 1000) { // Supabase plafonne à 1000 lignes par requête → on pagine
    const { data, error } = await client.from(table).select("*").range(debut, debut + 999); // une page
    if (error) throw error; // remonte l'erreur au store
    lignes.push(...data); // ajoute la page
    if (data.length < 1000) break; // dernière page atteinte
  }
  return lignes.map((l) => mapKeys(l, toCamel)); // snake_case → camelCase
}

export async function loadAll() {
  if (CONFIG.MODE === "supabase") { // base réelle
    const paires = await Promise.all(TABLES.map(async (t) => [t, await lireToutSupabase(t)])); // lit les tables en parallèle
    return Object.fromEntries(paires); // { partenaires: [...], contrats: [...], ... }
  }
  return lireToutLocal(); // mode mock
}

// ---------- Écritures (renvoient la ligne enregistrée, en camelCase) ----------
export async function insert(table, ligne) {
  if (CONFIG.MODE === "supabase") { // base réelle
    const { data, error } = await client.from(table).insert(mapKeys(ligne, toSnake)).select().single(); // insère et relit la ligne
    if (error) throw error; // erreur RLS, réseau, contrainte…
    return mapKeys(data, toCamel); // renvoie en camelCase
  }
  return ecrireLocal(table, "INSERT", { id: crypto.randomUUID(), creeLe: new Date().toISOString(), ...ligne }); // mode mock : id et date de création générés
}

export async function update(table, id, patch) {
  if (CONFIG.MODE === "supabase") { // base réelle
    const { data, error } = await client.from(table).update(mapKeys(patch, toSnake)).eq(pk(table), id).select().single(); // PATCH des seuls champs modifiés (règle §5.6)
    if (error) throw error; // erreur
    return mapKeys(data, toCamel); // ligne à jour
  }
  return ecrireLocal(table, "UPDATE", { [pk(table)]: id, ...patch }); // mode mock
}

export async function remove(table, id) {
  if (CONFIG.MODE === "supabase") { // base réelle
    const { error } = await client.from(table).delete().eq(pk(table), id); // suppression par clé primaire
    if (error) throw error; // erreur
    return; // rien à renvoyer
  }
  ecrireLocal(table, "DELETE", { [pk(table)]: id }); // mode mock
}

// ---------- Temps réel ----------
// onEvent({ table, type: "INSERT"|"UPDATE"|"DELETE", row }) ; onStatus("SUBSCRIBED"|"CHANNEL_ERROR"|"TIMED_OUT"|"CLOSED")
export function subscribe(onEvent, onStatus) {
  if (CONFIG.MODE === "supabase") { // base réelle
    const canal = client.channel("mbc-temps-reel"); // un seul canal pour toutes les tables
    TABLES.forEach((table) => { // abonnement par table
      canal.on("postgres_changes", { event: "*", schema: "public", table }, (p) => { // chaque changement Postgres
        const ligne = p.eventType === "DELETE" ? p.old : p.new; // DELETE ne fournit que l'ancienne ligne
        onEvent({ table, type: p.eventType, row: mapKeys(ligne, toCamel) }); // normalise et transmet
      });
    });
    canal.subscribe((statut) => onStatus?.(statut)); // état de la connexion websocket
    return () => client.removeChannel(canal); // fonction de désabonnement
  }
  const ecouteur = (e) => { // mode mock : on simule le temps réel entre onglets via l'évènement « storage »
    if (e.key !== "mbc:evt" || !e.newValue) return; // seul notre canal nous intéresse
    onEvent(JSON.parse(e.newValue).evt); // rejoue l'évènement écrit par l'autre onglet
  };
  window.addEventListener("storage", ecouteur); // « storage » ne se déclenche QUE dans les autres onglets
  setTimeout(() => onStatus?.("SUBSCRIBED"), 0); // le mock est « connecté » immédiatement
  return () => window.removeEventListener("storage", ecouteur); // désabonnement
}

// ---------- Implémentation « mock » (localStorage) ----------
const cle = (t) => `mbc:${t}`; // clé de stockage d'une table
function lireTable(t) { try { return JSON.parse(localStorage.getItem(cle(t))) || []; } catch { return []; } } // lit une table (tolère un stockage vide/cassé)
function ecrireTable(t, lignes) { try { localStorage.setItem(cle(t), JSON.stringify(lignes)); } catch { /* quota ou navigation privée : on continue en mémoire */ } } // écrit une table

function lireToutLocal() {
  if (!localStorage.getItem(cle("partenaires"))) { // premier lancement : on amorce depuis mock/*.json
    return seedTables().then((tables) => { TABLES.forEach((t) => ecrireTable(t, tables[t] || [])); return tables; }); // sauvegarde puis renvoie
  }
  return Object.fromEntries(TABLES.map((t) => [t, lireTable(t)])); // sinon relit le stockage
}

function ecrireLocal(table, type, ligne) {
  let lignes = lireTable(table); // table courante
  const id = ligne[pk(table)]; // clé de la ligne visée
  if (type === "DELETE") lignes = lignes.filter((l) => l[pk(table)] !== id); // retire la ligne
  else if (lignes.some((l) => l[pk(table)] === id)) lignes = lignes.map((l) => (l[pk(table)] === id ? { ...l, ...ligne } : l)); // fusionne le patch
  else lignes.push(ligne); // ajoute la ligne
  ecrireTable(table, lignes); // persiste
  const finale = type === "DELETE" ? ligne : lignes.find((l) => l[pk(table)] === id); // ligne finale
  if (type === "DELETE" && table === "partenaires") ["contrats", "echeances", "contreparties", "contacts", "echanges", "presences"].forEach((t) => ecrireTable(t, lireTable(t).filter((l) => l.partenaireId !== id))); // simule le « on delete cascade »
  try { localStorage.setItem("mbc:evt", JSON.stringify({ t: Date.now(), evt: { table, type, row: finale } })); } catch { /* ignore */ } // diffuse aux autres onglets
  return finale; // renvoie la ligne enregistrée
}
