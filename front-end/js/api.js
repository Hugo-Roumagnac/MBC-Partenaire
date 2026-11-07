// api.js — UNIQUE point d'accès aux données. Même interface en mode "supabase" et en mode "mock".
import { CONFIG } from "./config.js"; // mode et identifiants
import { seedTables } from "./mock-seed.js"; // données de départ du mode mock
import { genererJeton, empreinte, normaliserEmail, emailValide, jetonPlausible, DUREE_INVITATION_HEURES } from "./invitations-core.js"; // invitations

export const TABLES = ["partenaires", "contrats", "echeances", "contreparties", "contacts", "echanges", "evenements", "presences", "reglages", "membres", "journal", "documents"]; // toutes les tables lues (v2 : + journal ; v3 : + documents)
export const TABLES_ENFANTS = ["contrats", "echeances", "contreparties", "contacts", "echanges", "presences", "documents"]; // tables rattachées à une fiche (supprimées en cascade avec elle)
export const JOURNAL_MAX = 1000; // v2 : nombre d'entrées de journal chargées (les plus récentes) — le reste reste consultable dans Supabase
const CHAMPS_TECHNIQUES = ["modifieLe", "modifiePar", "creeLe"]; // v2 : ignorés par le journal (comme dans le trigger SQL)

const toCamel = (s) => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase()); // "date_prevue" → "datePrevue"
const toSnake = (s) => s.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase()); // "datePrevue" → "date_prevue"
const mapKeys = (obj, fn) => Object.fromEntries(Object.entries(obj || {}).map(([k, v]) => [fn(k), v])); // renomme les clés d'un objet
const pk = (table) => (table === "membres" ? "email" : "id"); // clé primaire de chaque table

// v2 : normalise une ligne lue en base. Pour le journal, les colonnes « avant » / « apres » sont des
// objets JSON dont les clés sont en snake_case (to_jsonb côté SQL) : on les convertit aussi en camelCase,
// pour que le front (restauration, affichage) manipule partout les mêmes noms de champs.
function normaliser(table, ligne) {
  const l = mapKeys(ligne, toCamel); // colonnes de premier niveau
  if (table === "presences" && l.presence === "Contact à rajouter") l.presence = "Contacter"; // v3 : ancienne valeur (avant migration-v3.sql) lue sous son nouveau nom
  if (table !== "journal") return l; // cas général
  if (l.avant) l.avant = mapKeys(l.avant, toCamel); // anciennes valeurs
  if (l.apres) l.apres = mapKeys(l.apres, toCamel); // nouvelles valeurs
  l.champs = (l.champs || []).map(toCamel); // liste des colonnes modifiées
  return l;
}

// v2 : membre connecté, mémorisé pour signer les entrées du journal en mode mock
// (en mode supabase, c'est le trigger SQL qui lit l'e-mail dans le jeton JWT).
// On mémorise une FONCTION de lecture (et non une copie) : le nom du membre n'est connu qu'après le chargement des données.
let lireSession = () => null;
export const definirSession = (lecteur) => { lireSession = lecteur; };
let diffusionLocale = null; // v2 (mock) : fonction du store qui reçoit les entrées de journal créées DANS cet onglet

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
    if (table === "journal") { // v2 : le journal grossit sans fin → seulement les JOURNAL_MAX entrées les plus récentes
      const { data, error } = await client.from(table).select("*").order("le", { ascending: false }).limit(JOURNAL_MAX); // une seule requête
      if (error) throw error; // remonte l'erreur
      lignes.push(...data); break; // pas de pagination
    }
    const { data, error } = await client.from(table).select("*").range(debut, debut + 999); // une page
    if (error) throw error; // remonte l'erreur au store
    lignes.push(...data); // ajoute la page
    if (data.length < 1000) break; // dernière page atteinte
  }
  return lignes.map((l) => normaliser(table, l)); // snake_case → camelCase (y compris avant/après du journal)
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
        onEvent({ table, type: p.eventType, row: normaliser(table, ligne) }); // normalise et transmet
      });
    });
    canal.subscribe((statut) => onStatus?.(statut)); // état de la connexion websocket
    return () => client.removeChannel(canal); // fonction de désabonnement
  }
  const ecouteur = (e) => { // mode mock : on simule le temps réel entre onglets via l'évènement « storage »
    if (e.key !== "mbc:evt" || !e.newValue) return; // seul notre canal nous intéresse
    const message = JSON.parse(e.newValue); // { t, evts: [...] } (v2 : plusieurs évènements par message)
    (message.evts || [message.evt]).filter(Boolean).forEach(onEvent); // rejoue chaque évènement écrit par l'autre onglet
  };
  window.addEventListener("storage", ecouteur); // « storage » ne se déclenche QUE dans les autres onglets
  diffusionLocale = onEvent; // v2 : les entrées de journal de CET onglet passent par la même fonction
  setTimeout(() => onStatus?.("SUBSCRIBED"), 0); // le mock est « connecté » immédiatement
  return () => { window.removeEventListener("storage", ecouteur); diffusionLocale = null; }; // désabonnement
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
  const avant = lignes.find((l) => l[pk(table)] === id) || null; // v2 : état AVANT écriture (pour le journal)
  if (type === "DELETE") lignes = lignes.filter((l) => l[pk(table)] !== id); // retire la ligne
  else if (avant) lignes = lignes.map((l) => (l[pk(table)] === id ? { ...l, ...ligne } : l)); // fusionne le patch
  else lignes.push(ligne); // ajoute la ligne
  ecrireTable(table, lignes); // persiste
  const finale = type === "DELETE" ? avant || ligne : lignes.find((l) => l[pk(table)] === id); // ligne finale
  const le = new Date().toISOString(); // même horodatage pour la ligne et ses enfants supprimés en cascade
  const evts = [{ table, type, row: type === "DELETE" ? ligne : finale }]; // évènements diffusés aux autres onglets
  const action = type === "DELETE" ? "DELETE" : avant && type === "UPDATE" ? "UPDATE" : "INSERT"; // action réellement effectuée
  const journal = [journaliserLocal(table, action, action === "INSERT" ? null : avant, action === "DELETE" ? null : finale, le)]; // v2 : simule le trigger SQL
  if (type === "DELETE" && table === "partenaires") TABLES_ENFANTS.forEach((t) => { // simule le « on delete cascade »
    const [enfants, autres] = lireTable(t).reduce((acc, l) => (acc[l.partenaireId === id ? 0 : 1].push(l), acc), [[], []]); // sépare les lignes du partenaire
    ecrireTable(t, autres); // retire les enfants
    enfants.forEach((l) => journal.push(journaliserLocal(t, "DELETE", l, null, le))); // et trace chaque suppression (comme le trigger)
  });
  journal.filter(Boolean).forEach((j) => evts.push({ table: "journal", type: "INSERT", row: j })); // les entrées du journal suivent le même canal
  try { localStorage.setItem("mbc:evt", JSON.stringify({ t: Date.now(), evts })); } catch { /* ignore */ } // diffuse aux autres onglets
  evts.filter((e) => e.table === "journal").forEach((e) => diffusionLocale?.(e)); // « storage » ne prévient pas l'onglet courant : on lui transmet le journal directement
  return finale; // renvoie la ligne enregistrée
}

// ---------- Invitations par e-mail ----------
// En mode "supabase", tout passe par l'Edge Function « invitations » (clé service_role côté serveur).
// En mode "mock", les invitations sont simulées dans localStorage et le lien est affiché au lieu d'être envoyé.

const COLONNES_INVITATION = "id, email, statut, invite_par, expire_le, cree_le, accepte_le"; // jamais token_hash

async function appelerFonction(corps) { // POST vers /functions/v1/super-worker ; renvoie toujours { ok, ... }
  const c = await init();
  const { data: { session } } = await c.auth.getSession();
  const r = await fetch(`${CONFIG.SUPABASE_URL}/functions/v1/super-worker`, {
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

// ---------- v2 : journal d'audit en mode mock ----------
// Reproduit À L'IDENTIQUE le trigger SQL public.journaliser() (voir supabase/schema.sql §2 bis),
// pour que l'écran « Journal » et la restauration fonctionnent aussi hors ligne.
const JOURNAL_MAX_LOCAL = 2000; // plafond local (le localStorage est limité à ~5 Mo)
const pourJournal = (v) => (typeof v === "string" && v.startsWith("data:") ? "(image importée)" : v); // ne recopie pas les logos en base64 dans le journal

function journaliserLocal(table, action, avant, apres, le) {
  if (table === "journal" || table === "membres") return null; // le journal ne se journalise pas ; les membres sont gérés par l'administrateur
  let champs = [], av = avant, ap = apres; // valeurs à enregistrer
  if (action === "UPDATE") { // seulement les champs réellement modifiés, hors champs techniques
    champs = Object.keys(apres).filter((k) => !CHAMPS_TECHNIQUES.includes(k) && JSON.stringify(avant?.[k] ?? null) !== JSON.stringify(apres[k] ?? null));
    if (!champs.length) return null; // rien de significatif
    av = Object.fromEntries(champs.map((k) => [k, pourJournal(avant?.[k] ?? null)])); // anciennes valeurs
    ap = Object.fromEntries(champs.map((k) => [k, pourJournal(apres[k] ?? null)])); // nouvelles valeurs
  } else { // INSERT / DELETE : ligne complète (sans les images)
    av = avant ? Object.fromEntries(Object.entries(avant).map(([k, v]) => [k, pourJournal(v)])) : null;
    ap = apres ? Object.fromEntries(Object.entries(apres).map(([k, v]) => [k, pourJournal(v)])) : null;
  }
  const ligne = apres || avant || {}; // ligne de référence
  const entree = {
    id: crypto.randomUUID(), le, // identifiant + horodatage
    email: lireSession()?.email || "", nom: lireSession()?.nom || "", appareil: navigator.userAgent, // QUI et DEPUIS QUEL compte / appareil
    action, tableNom: table, ligneId: String(ligne[pk(table)] ?? ""), // QUOI
    partenaireId: table === "partenaires" ? ligne.id : ligne.partenaireId ?? null, // sur quelle fiche
    avant: av, apres: ap, champs // le détail
  };
  const tout = [entree, ...lireTable("journal")].slice(0, JOURNAL_MAX_LOCAL); // le plus récent en tête, plafonné
  ecrireTable("journal", tout); // persiste
  return entree; // diffusée aux autres onglets
}

// ---------- v2 : stockage des logos ----------
// Le navigateur a déjà redimensionné et converti l'image (voir logos.js) ; ici on ne fait que la RANGER
// et renvoyer l'adresse à écrire dans partenaires.logo. Le reste du code affiche cette adresse dans un
// <img src> sans savoir d'où elle vient : URL https (Supabase Storage) ou « data: » (mode mock).
export async function deposerLogo(partenaireId, blob) {
  if (CONFIG.MODE === "supabase") { // base réelle : bucket « logos » (schema.sql §3 bis)
    const ext = blob.type === "image/png" ? "png" : blob.type === "image/jpeg" ? "jpg" : "webp"; // extension selon le format produit
    const chemin = `${partenaireId}/${Date.now()}.${ext}`; // un NOUVEAU fichier à chaque import → jamais de cache périmé
    const { error } = await client.storage.from("logos").upload(chemin, blob, { contentType: blob.type, cacheControl: "31536000", upsert: false }); // dépôt
    if (error) throw error; // droits, taille, réseau…
    return client.storage.from("logos").getPublicUrl(chemin).data.publicUrl; // URL publique stable
  }
  return new Promise((ok, ko) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => ko(r.error); r.readAsDataURL(blob); }); // mock : image encodée en base64 (« data:image/webp;base64,… »)
}

// Supprime l'ancien fichier d'un logo remplacé ou retiré (best-effort : un échec laisse juste un fichier orphelin).
export async function supprimerFichierLogo(url) {
  if (CONFIG.MODE !== "supabase" || !url) return; // en mock, l'image vit dans la ligne : rien à faire
  const repere = "/object/public/logos/"; // forme des URL publiques Supabase
  const i = url.indexOf(repere); if (i < 0) return; // URL étrangère : on n'y touche pas
  const chemin = decodeURIComponent(url.slice(i + repere.length).split("?")[0]); // « <id>/<horodatage>.webp »
  await client.storage.from("logos").remove([chemin]).catch(() => {}); // on ignore les erreurs
}

// ---------- v3 : documents des partenaires (convention signée, autres documents) ----------
// Mode supabase : bucket PRIVÉ « documents » (schema.sql §3 ter). On ne stocke jamais d'URL publique :
// chaque ouverture demande une adresse signée valable 2 minutes.
// Mode mock : le fichier est gardé en base64 dans la ligne (champ « contenu ») — limité à 1,5 Mo,
// car le stockage local du navigateur ne dépasse pas ~5 Mo.
export const DOCUMENT_MAX_OCTETS = 15 * 1024 * 1024; // 15 Mo (= file_size_limit du bucket)
export const DOCUMENT_MAX_OCTETS_MOCK = 1.5 * 1024 * 1024;

// Nom de fichier sûr pour une clé de stockage : sans accents, espaces ni caractères spéciaux.
export const nomFichierSur = (nom) => String(nom || "document").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^[-.]+|-+$/g, "").slice(-100) || "document";

// Dépose le fichier puis renvoie les champs à enregistrer dans public.documents.
export async function deposerDocument(partenaireId, categorie, fichier) {
  const chemin = `${partenaireId}/${categorie}/${Date.now()}-${nomFichierSur(fichier.name)}`; // jamais deux fois la même clé
  if (CONFIG.MODE === "supabase") {
    const { error } = await client.storage.from("documents").upload(chemin, fichier, { contentType: fichier.type || "application/octet-stream", upsert: false });
    if (error) throw error; // droits, taille, type refusé, réseau…
    return { chemin };
  }
  const contenu = await new Promise((ok, ko) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => ko(r.error); r.readAsDataURL(fichier); });
  return { chemin, contenu }; // mock : le fichier voyage dans la ligne
}

// Adresse pour ouvrir / télécharger un document (signée et temporaire en mode supabase).
export async function adresseDocument(doc, { telecharger = false } = {}) {
  if (CONFIG.MODE !== "supabase") return doc.contenu || "";
  const { data, error } = await client.storage.from("documents").createSignedUrl(doc.chemin, 120, telecharger ? { download: doc.nom } : undefined);
  if (error) throw error;
  return data.signedUrl;
}

// Supprime des fichiers du bucket (best-effort : un échec laisse seulement un fichier orphelin).
export async function supprimerFichiersDocuments(chemins) {
  const liste = (chemins || []).filter(Boolean);
  if (CONFIG.MODE !== "supabase" || !liste.length) return;
  await client.storage.from("documents").remove(liste).catch(() => {});
}
