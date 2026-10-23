// api.js — UNIQUE point d'accès aux données. Même interface en mode "supabase" et en mode "mock".
import { CONFIG } from "./config.js"; // mode et identifiants
import { seedTables } from "./mock-seed.js"; // données de départ du mode mock
import { genererJeton, empreinte, normaliserEmail, emailValide, jetonPlausible, DUREE_INVITATION_HEURES } from "./invitations-core.js"; // invitations

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

// ---------- Invitations par e-mail ----------
// En mode "supabase", tout passe par l'Edge Function « invitations » (clé service_role côté serveur).
// En mode "mock", les invitations sont simulées dans localStorage et le lien est affiché au lieu d'être envoyé.

const COLONNES_INVITATION = "id, email, statut, invite_par, expire_le, cree_le, accepte_le"; // jamais token_hash

async function appelerFonction(corps) { // POST vers /functions/v1/invitations ; renvoie toujours { ok, ... }
  const c = await init();
  const { data: { session } } = await c.auth.getSession();
  const r = await fetch(`${CONFIG.SUPABASE_URL}/functions/v1/invitations`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: CONFIG.SUPABASE_ANON_KEY, Authorization: `Bearer ${session?.access_token || CONFIG.SUPABASE_ANON_KEY}` },
    body: JSON.stringify(corps)
  });
  let rep; try { rep = await r.json(); } catch { rep = null; }
  return rep && typeof rep.ok === "boolean" ? rep : { ok: false, code: "erreur-serveur", message: "Service d'invitation indisponible." };
}

// Envoie (ou renvoie) une invitation. → { ok, invitation, lien? } ou { ok:false, code, message }
export async function envoyerInvitation(email, invitePar) {
  email = normaliserEmail(email);
  if (CONFIG.MODE === "supabase") {
    const rep = await appelerFonction({ action: "send", email });
    if (rep.ok) rep.invitation = mapKeys(rep.invitation, toCamel);
    return rep;
  }
  // ----- mock -----
  if (!emailValide(email)) return { ok: false, code: "email-invalide", message: "Adresse e-mail invalide." };
  if (lireTable("membres").some((m) => normaliserEmail(m.email) === email)) return { ok: false, code: "deja-inscrit", message: "Cette adresse est déjà associée à un compte." };
  const invitations = lireTable("invitations").map((i) => (i.email === email && i.statut === "pending" ? { ...i, statut: "revoked" } : i)); // l'ancienne est remplacée
  const jeton = genererJeton();
  const invitation = { id: crypto.randomUUID(), email, tokenHash: await empreinte(jeton), statut: "pending", invitePar: normaliserEmail(invitePar), expireLe: new Date(Date.now() + DUREE_INVITATION_HEURES * 3600e3).toISOString(), creeLe: new Date().toISOString(), accepteLe: null };
  ecrireTable("invitations", [invitation, ...invitations]);
  const { tokenHash, ...publique } = invitation;
  return { ok: true, invitation: publique, lien: new URL(`register.html?token=${jeton}`, location.href.replace(/[^/]*$/, "")).href };
}

// Liste des invitations (les plus récentes d'abord).
export async function listerInvitations() {
  if (CONFIG.MODE === "supabase") {
    const { data, error } = await (await init()).from("invitations").select(COLONNES_INVITATION).order("cree_le", { ascending: false }).limit(50);
    if (error) throw error;
    return data.map((l) => mapKeys(l, toCamel));
  }
  return lireTable("invitations").map(({ tokenHash, ...i }) => i).sort((a, b) => b.creeLe.localeCompare(a.creeLe));
}

// Vérifie un jeton (page d'inscription). → { ok:true, email } ou { ok:false, code, message }
export async function verifierInvitation(jeton) {
  if (CONFIG.MODE === "supabase") return appelerFonction({ action: "check", token: jeton });
  const inv = await trouverInvitationLocale(jeton);
  return inv.ok ? { ok: true, email: inv.invitation.email, expireLe: inv.invitation.expireLe } : inv;
}

// Crée le compte à partir d'une invitation valide. → { ok:true, email } ou { ok:false, code, message }
export async function accepterInvitation({ token, prenom, nom, motDePasse }) {
  if (CONFIG.MODE === "supabase") return appelerFonction({ action: "accept", token, prenom, nom, motDePasse });
  const inv = await trouverInvitationLocale(token);
  if (!inv.ok) return inv;
  const { email, id } = inv.invitation;
  if (lireTable("membres").some((m) => normaliserEmail(m.email) === email)) return { ok: false, code: "deja-inscrit", message: "Un compte existe déjà pour cette adresse. Connectez-vous." };
  ecrireLocal("membres", "INSERT", { email, nom: `${prenom.trim()} ${nom.trim()}` }); // mode démo : pas de mot de passe stocké
  ecrireTable("invitations", lireTable("invitations").map((i) => (i.id === id ? { ...i, statut: "accepted", accepteLe: new Date().toISOString() } : i)));
  return { ok: true, email };
}

async function trouverInvitationLocale(jeton) {
  const invalide = { ok: false, code: "invalide", message: "Ce lien d'invitation n'est pas valide." };
  if (!jetonPlausible(jeton)) return invalide;
  const h = await empreinte(jeton);
  const inv = lireTable("invitations").find((i) => i.tokenHash === h);
  if (!inv) return invalide;
  if (inv.statut === "accepted") return { ok: false, code: "utilisee", message: "Cette invitation a déjà été utilisée." };
  if (inv.statut === "revoked") return { ok: false, code: "revoquee", message: "Cette invitation a été remplacée par une plus récente." };
  if (inv.statut === "expired" || new Date(inv.expireLe) <= new Date()) {
    ecrireTable("invitations", lireTable("invitations").map((i) => (i.id === inv.id ? { ...i, statut: "expired" } : i)));
    return { ok: false, code: "expiree", message: "Cette invitation a expiré." };
  }
  return { ok: true, invitation: inv };
}
