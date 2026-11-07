// logos-auto.js — v2 : recherche AUTOMATIQUE des logos (service logo.dev) avec validation par un membre.
//
// =============================================================================
// FONCTIONNEMENT PAS À PAS
// =============================================================================
//  1. CANDIDATS (selectors.candidatsLogo, règle pure) : pour une fiche, on fabrique des adresses d'images
//     logo.dev à essayer, dans cet ordre :
//       a. le site web tiré de l'e-mail professionnel de chaque contact (jean@ecf82.fr → ecf82.fr) — le plus fiable ;
//       b. le nom de l'entreprise, puis chaque marque d'un nom composé (« Acuitis - Optic 2000 »).
//     Ces adresses utilisent la clé PUBLIQUE logo.dev (config.js) : aucune clé secrète, aucun serveur.
//  2. VÉRIFICATION (testerImage) : le navigateur charge chaque image. Grâce au paramètre fallback=404,
//     logo.dev répond « introuvable » quand il ne connaît pas l'entreprise → l'image échoue → candidat écarté.
//  3. CHOIX : les logos trouvés sont affichés ; le premier est présélectionné, le membre peut en choisir
//     un autre ou « Aucun ». Rien n'est enregistré sans validation : deux entreprises peuvent porter le même nom.
//  4. ENREGISTREMENT (store.enregistrerLogo) : l'ADRESSE de l'image logo.dev est écrite dans partenaires.logo,
//     exactement comme un logo importé à la main → affichage partout + temps réel + journal.
//
// Par DÉFAUT, aucune action n'est nécessaire : toute fiche sans logo choisi affiche directement le logo
// automatique (voir logos.js, « LOGO AUTOMATIQUE PAR DÉFAUT »). Ce module sert à CHOISIR explicitement :
//   • « Nouveau partenaire » : le logo trouvé s'affiche sous le champ Nom pendant la saisie (initSuggestionNouveau) ;
//   • fiche › Informations › « Autres logos trouvés » : toutes les propositions pour une fiche (ouvrirRechercheLogos([id])).
// =============================================================================
import { CONFIG } from "./config.js"; // clé publique logo.dev
import { store, enregistrerLogo } from "./store.js"; // fiches + écriture du logo
import { candidatsLogo } from "./selectors.js"; // règle pure : adresses à essayer
import { escapeHtml, showToast } from "./utils.js"; // affichage
import { logoHtml } from "./logos.js"; // logo actuel / monogramme
import { ouvrirModale, fermerModale } from "./modal.js"; // fenêtre accessible

const $ = (id) => document.getElementById(id); // raccourci
const MAX_PROPOSITIONS = 4; // logos affichés au plus par fiche
const MAX_EN_PARALLELE = 6; // fiches recherchées en même temps (recherche groupée)
export const rechercheActive = () => !!CONFIG.LOGO_DEV_KEY; // désactivée si aucune clé n'est configurée

// ---------- 2. Vérification : l'image existe-t-elle vraiment ? ----------
const cache = new Map(); // url → Promise<boolean> (chaque image n'est testée qu'une fois par session)
export function testerImage(url, delai = 8000) {
  if (!cache.has(url)) cache.set(url, new Promise((ok) => {
    const img = new Image(); // image hors document
    const fin = (r) => { clearTimeout(t); ok(r); }; // une seule réponse
    const t = setTimeout(() => fin(false), delai); // réseau trop lent → on abandonne ce candidat
    img.onload = () => fin(img.naturalWidth > 1); // une vraie image (pas un pixel de suivi)
    img.onerror = () => fin(false); // 404 : logo inconnu
    img.src = url; // déclenche le chargement
  }));
  return cache.get(url);
}

// 1 + 2 : logos réellement disponibles pour une fiche (dans l'ordre de fiabilité), au plus MAX_PROPOSITIONS.
export async function trouverLogos(fiche) {
  const candidats = candidatsLogo(fiche, CONFIG.LOGO_DEV_KEY); // adresses à essayer
  const ok = await Promise.all(candidats.map((c) => testerImage(c.url))); // chargées en parallèle
  return candidats.filter((_, i) => ok[i]).slice(0, MAX_PROPOSITIONS); // seulement celles qui existent
}

// ---------- 3. Gabarit des propositions (boutons radio illustrés) ----------
// nomGroupe : name des radios ; selection : url cochée ("" = Aucun).
function choixHtml(nomGroupe, trouves, selection) {
  if (!trouves.length) return `<span class="logo-choix__vide">Aucun logo trouvé — importez-le à la main depuis la fiche.</span>`;
  const radio = (valeur, contenu, titre) => `<label class="logo-choix__opt" title="${escapeHtml(titre)}"><input type="radio" name="${escapeHtml(nomGroupe)}" value="${escapeHtml(valeur)}" ${valeur === selection ? "checked" : ""}>${contenu}</label>`;
  return trouves.map((c) => radio(c.url, `<img src="${escapeHtml(c.url)}" alt="" loading="lazy"><small>${escapeHtml(c.source)}</small>`, `Logo trouvé via ${c.source}`)).join("")
    + radio("", `<span class="logo-choix__aucun">Aucun</span><small>ne rien changer</small>`, "Ne pas utiliser ces propositions");
}

// ---------- Fenêtre « Logos automatiques » (une fiche ou toutes les fiches sans logo) ----------
let session = 0; // numéro de recherche : une recherche relancée annule l'affichage de la précédente

export function ouvrirRechercheLogos(ids = null) {
  if (!rechercheActive()) { showToast("Recherche automatique désactivée : clé logo.dev absente de config.js", { erreur: true }); return; }
  const fiches = (ids ? store.partenaires.filter((p) => ids.includes(p.id)) : store.partenaires.filter((p) => !p.logo && p.etape !== "Archivé")) // une fiche, ou toutes celles sans logo
    .sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
  const liste = $("logos-liste"), num = ++session;
  $("logos-intro").textContent = ids ? "Choisissez le bon logo, puis enregistrez." : `${fiches.length} fiche${fiches.length > 1 ? "s" : ""} sans logo. Le premier logo trouvé est présélectionné : vérifiez chaque ligne avant d'enregistrer.`;
  liste.innerHTML = fiches.length ? fiches.map((p) => `
    <div class="logo-ligne" data-id="${escapeHtml(p.id)}">
      <div class="logo-ligne__nom">${logoHtml(p, { taille: "md" })}<span><strong>${escapeHtml(p.nom)}</strong><span class="table__sub">${escapeHtml(p.etape)}${p.logo ? " · logo actuel conservé si « Aucun »" : ""}</span></span></div>
      <div class="logo-choix" role="radiogroup" aria-label="Logo de ${escapeHtml(p.nom)}"><span class="logo-choix__vide">Recherche…</span></div>
    </div>`).join("") : `<p class="empty">Toutes les fiches ont déjà un logo.</p>`;
  majCompteur();
  ouvrirModale($("modal-logos"));

  // Recherche par petits paquets (MAX_EN_PARALLELE fiches à la fois) : l'affichage se remplit au fur et à mesure.
  const file = [...fiches];
  const travailleur = async () => {
    for (let p = file.shift(); p; p = file.shift()) {
      const trouves = await trouverLogos(p); // candidats vérifiés
      if (num !== session) return; // fenêtre refermée ou recherche relancée entre-temps
      const zone = liste.querySelector(`.logo-ligne[data-id="${CSS.escape(p.id)}"] .logo-choix`);
      if (zone) zone.innerHTML = choixHtml(`logo-${p.id}`, trouves, trouves[0]?.url || ""); // 1er logo présélectionné
      majCompteur();
    }
  };
  Promise.all(Array.from({ length: MAX_EN_PARALLELE }, travailleur));
}

// Nombre de logos sélectionnés → libellé du bouton « Enregistrer ».
function majCompteur() {
  const n = $("logos-liste").querySelectorAll('input[type=radio]:checked:not([value=""])').length;
  const b = $("logos-enregistrer"); b.disabled = !n; b.textContent = n ? `Enregistrer ${n} logo${n > 1 ? "s" : ""}` : "Enregistrer";
}

export function initLogosAuto() {
  const modal = $("modal-logos"); if (!modal) return;
  $("logos-liste").addEventListener("change", majCompteur); // changement de choix
  modal.addEventListener("click", (e) => { if (e.target.closest("[data-close-modal]")) session++; }); // fermeture → arrête l'affichage en cours
  $("logos-aucun").addEventListener("click", () => { $("logos-liste").querySelectorAll('input[type=radio][value=""]').forEach((r) => { r.checked = true; }); majCompteur(); }); // tout décocher
  $("logos-enregistrer").addEventListener("click", async (e) => { // 4. enregistrement
    const choix = [...$("logos-liste").querySelectorAll('input[type=radio]:checked:not([value=""])')].map((r) => ({ id: r.closest(".logo-ligne").dataset.id, url: r.value }));
    if (!choix.length) return;
    e.currentTarget.disabled = true; let ok = 0;
    for (const c of choix) { try { await enregistrerLogo(c.id, c.url); ok++; } catch (err) { console.error(err); } } // une écriture par fiche (journalisée)
    session++; fermerModale(modal);
    showToast(ok === choix.length ? `${ok} logo${ok > 1 ? "s" : ""} enregistré${ok > 1 ? "s" : ""}` : `Échec de l'enregistrement de ${choix.length - ok} logo(s)`);
  });
}

// ---------- « Nouveau partenaire » : propositions pendant la saisie du nom ----------
// Le logo choisi est lu par partenaires.js au moment de créer la fiche (logoChoisiNouveau).
let minuterie = 0, saisie = 0;
export function initSuggestionNouveau() {
  const input = $("np-nom"), zone = $("np-logo"); if (!input || !zone || !rechercheActive()) return;
  input.addEventListener("input", () => {
    clearTimeout(minuterie); const num = ++saisie; const nom = input.value.trim();
    if (nom.length < 2) { zone.hidden = true; zone.querySelector(".logo-choix").innerHTML = ""; return; } // trop court
    zone.hidden = false; zone.querySelector(".logo-choix").innerHTML = `<span class="logo-choix__vide">Recherche du logo…</span>`;
    minuterie = setTimeout(async () => { // attend une pause de frappe (évite une requête par lettre)
      const trouves = await trouverLogos({ nom, contacts: [] });
      if (num === saisie) zone.querySelector(".logo-choix").innerHTML = choixHtml("np-logo-choix", trouves, trouves[0]?.url || ""); // ignore une réponse périmée
    }, 600);
  });
}
// Logo choisi à la création : l'adresse cochée ; « - » si un logo était proposé mais « Aucun » a été coché
// (refus explicite → pas de logo automatique) ; "" si rien n'a été trouvé (logo automatique plus tard,
// par exemple quand un contact avec un e-mail pro sera ajouté).
export function logoChoisiNouveau() {
  const coche = document.querySelector('input[name="np-logo-choix"]:checked');
  if (!coche) return ""; // aucune proposition
  return coche.value || "-"; // adresse choisie, ou refus
}
export function reinitialiserSuggestionNouveau() { saisie++; const z = $("np-logo"); if (z) { z.hidden = true; z.querySelector(".logo-choix").innerHTML = ""; } }
