// logos.js — v2 : import, traitement et affichage des logos des partenaires.
//
// =============================================================================
// FONCTIONNEMENT PAS À PAS (résumé ; version détaillée dans README-front.md § « Logos »)
// =============================================================================
//
//  IMPORT (quand un membre choisit ou dépose une image)
//  ----------------------------------------------------
//   1. CONTRÔLE      verifierFichier() : type d'image accepté et 5 Mo maximum.
//   2. APERÇU        URL.createObjectURL(fichier) : le navigateur fabrique une adresse
//                    locale temporaire (« blob:… ») → l'image s'affiche IMMÉDIATEMENT,
//                    avant tout envoi réseau.
//   3. TRAITEMENT    preparerImage() : l'image est dessinée dans un <canvas> réduit à
//                    256 px (plus grand côté), puis ré-encodée en WebP (PNG en secours).
//                    Un logo de 3 Mo devient ~10 à 30 Ko : stockage et affichage rapides,
//                    et les éventuelles métadonnées / scripts (SVG) disparaissent.
//   4. STOCKAGE      api.deposerLogo() :
//                      • mode "supabase" → fichier déposé dans le bucket « logos »
//                        (logos/<id-partenaire>/<horodatage>.webp), on récupère son URL publique ;
//                      • mode "mock"     → l'image est encodée en texte « data:image/webp;base64,… ».
//   5. ENREGISTREMENT store.enregistrerLogo() écrit cette adresse dans partenaires.logo
//                    (écriture optimiste) puis supprime l'ancien fichier éventuel.
//   6. DIFFUSION     le temps réel (Supabase ou évènement « storage » entre onglets)
//                    prévient les autres membres : leurs écrans se redessinent et le logo
//                    apparaît chez eux sans recharger la page.
//
//  AFFICHAGE (à chaque rendu d'écran)
//  ----------------------------------
//   logoHtml(partenaire) renvoie un <img src="…"> si partenaires.logo est rempli, sinon un
//   monogramme (initiales sur fond coloré stable, calculé à partir du nom). Les écrans ne
//   savent PAS où est rangée l'image : une URL https et une URL « data: » s'affichent de la
//   même façon dans un <img>. Changer de stockage ne touche donc que api.js.
//   Si l'image ne se charge plus (fichier supprimé, hors ligne), un écouteur global d'erreurs
//   (initLogos) retire le <img> : le monogramme placé dessous réapparaît automatiquement.
//   (Pas d'attribut onerror="…" : la politique de sécurité CSP de netlify.toml interdit le JS en ligne.)
// =============================================================================

import * as api from "./api.js"; // dépôt du fichier (Storage ou data URL)
import { enregistrerLogo } from "./store.js"; // écriture de l'adresse dans la fiche
import { escapeHtml, initiales } from "./utils.js"; // sécurité et initiales
import { CONFIG } from "./config.js"; // v2 : clé publique logo.dev (logos automatiques)
import { candidatsLogo } from "./selectors.js"; // v2 : adresses logo.dev à essayer pour une fiche

// =============================================================================
// v2 — LOGO AUTOMATIQUE PAR DÉFAUT
// =============================================================================
// Valeurs possibles de partenaires.logo :
//   • une adresse (Supabase Storage, « data: » ou img.logo.dev) → ce logo, choisi par un membre ;
//   • ""  (vide, cas par défaut) → logo AUTOMATIQUE : on affiche directement l'image logo.dev trouvée
//         d'après l'e-mail pro des contacts puis le nom (selectors.candidatsLogo), sans aucun clic ;
//   • "-" → « pas de logo » : un membre a refusé le logo automatique (mauvaise entreprise) → monogramme.
// Le logo automatique n'est PAS enregistré en base : il est recalculé à l'affichage. Il suit donc
// tout seul les changements de nom ou de contacts, et importer un logo à la main le remplace.
export const SANS_LOGO = "-";
const echecs = new Set(); // adresses déjà en erreur pendant cette session (404 : logo inconnu) → plus jamais réessayées

// Adresses à essayer pour le logo automatique d'une fiche, dans l'ordre (sans celles déjà en échec).
export const logosAutomatiques = (p) => (p && !p.logo ? candidatsLogo(p, CONFIG.LOGO_DEV_KEY).map((c) => c.url).filter((u) => !echecs.has(u)) : []);

export const LOGO_TAILLE = 256; // côté maximal en pixels après redimensionnement (affiché au plus en 64 px : marge pour les écrans Retina)
export const LOGO_POIDS_MAX = 5 * 1024 * 1024; // 5 Mo : au-delà on refuse le fichier d'origine
export const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml"]; // formats acceptés à l'import
export const LOGO_ACCEPT = LOGO_TYPES.join(","); // pour l'attribut accept des <input type="file">

// ---------- 1. Contrôle du fichier ----------
// Renvoie un message d'erreur, ou "" si le fichier est acceptable.
export function verifierFichier(fichier) {
  if (!fichier) return "Aucun fichier sélectionné";
  if (!LOGO_TYPES.includes(fichier.type)) return "Format non pris en charge : PNG, JPEG, WebP, GIF ou SVG";
  if (fichier.size > LOGO_POIDS_MAX) return "Image trop lourde (5 Mo maximum)";
  return "";
}

// ---------- 3. Redimensionnement + conversion ----------
// Charge une image à partir d'une adresse (blob:) et attend qu'elle soit décodée.
function chargerImage(src) {
  return new Promise((ok, ko) => {
    const img = new Image(); // élément image hors document
    img.onload = () => ok(img); // prête
    img.onerror = () => ko(new Error("Image illisible")); // fichier corrompu ou format non décodable
    img.src = src; // déclenche le chargement
  });
}

// Encode le contenu du canvas dans le format demandé (Promise autour de canvas.toBlob).
const versBlob = (canvas, type, qualite) => new Promise((ok) => canvas.toBlob(ok, type, qualite));

// Dessine l'image dans un canvas d'au plus LOGO_TAILLE px de côté et renvoie un Blob WebP (ou PNG).
export async function preparerImage(fichier) {
  const url = URL.createObjectURL(fichier); // adresse locale temporaire du fichier
  try {
    const img = await chargerImage(url); // décodage
    const largeur = img.naturalWidth || 512, hauteur = img.naturalHeight || 512; // un SVG sans dimensions → 512 par défaut
    const ratio = Math.min(1, LOGO_TAILLE / Math.max(largeur, hauteur)); // on réduit, on n'agrandit jamais
    const canvas = document.createElement("canvas"); // surface de dessin hors écran
    canvas.width = Math.max(1, Math.round(largeur * ratio)); // nouvelles dimensions
    canvas.height = Math.max(1, Math.round(hauteur * ratio));
    const ctx = canvas.getContext("2d"); // contexte 2D
    ctx.imageSmoothingQuality = "high"; // lissage de qualité lors de la réduction
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height); // dessine (la transparence est conservée)
    let blob = await versBlob(canvas, "image/webp", 0.86); // WebP : léger et transparent
    if (!blob || blob.type !== "image/webp") blob = await versBlob(canvas, "image/png"); // navigateur sans encodeur WebP → PNG
    if (!blob) throw new Error("Conversion impossible"); // cas extrême (canvas trop grand, mémoire…)
    return blob; // image prête à stocker
  } finally {
    URL.revokeObjectURL(url); // libère la mémoire de l'adresse temporaire
  }
}

// ---------- 2 + 3 + 4 + 5 : import complet ----------
// onApercu(urlLocale) est appelé dès que l'aperçu est disponible (étape 2) pour un affichage immédiat.
export async function importerLogo(partenaireId, fichier, { onApercu } = {}) {
  const erreur = verifierFichier(fichier); // 1. contrôle
  if (erreur) throw new Error(erreur);
  const apercu = URL.createObjectURL(fichier); // 2. aperçu instantané
  onApercu?.(apercu);
  try {
    const blob = await preparerImage(fichier); // 3. redimensionnement + WebP
    const adresse = await api.deposerLogo(partenaireId, blob); // 4. stockage (Storage ou data URL)
    await enregistrerLogo(partenaireId, adresse); // 5. écriture dans la fiche (→ 6. temps réel)
    return adresse;
  } finally {
    setTimeout(() => URL.revokeObjectURL(apercu), 5000); // l'aperçu n'est plus utile une fois la vraie image affichée
  }
}

// Retire le logo d'une fiche (l'ancien fichier est supprimé du stockage par le store).
export const retirerLogo = (partenaireId) => enregistrerLogo(partenaireId, SANS_LOGO); // « - » : ni logo choisi, ni logo automatique

// ---------- Affichage ----------
// Teinte stable dérivée du nom : un même partenaire a toujours la même couleur de monogramme.
function teinte(texte) {
  let h = 0; // empreinte
  for (const c of String(texte)) h = (h * 31 + c.charCodeAt(0)) % 360; // hachage simple → angle de 0 à 359
  return h;
}

// Gabarit HTML du logo d'un partenaire. taille : "sm" (cartes, listes) | "md" (tableau) | "lg" (fiche).
// apercu : adresse à afficher à la place de p.logo (aperçu local pendant l'envoi).
export function logoHtml(p, { taille = "sm", apercu = "" } = {}) {
  const mono = `<span class="plogo__mono" style="--plogo-h:${teinte(p?.nom || "?")}" aria-hidden="true">${escapeHtml(initiales(p?.nom || "?"))}</span>`; // monogramme de secours
  const choisi = apercu || (p?.logo && p.logo !== SANS_LOGO ? p.logo : ""); // logo choisi par un membre
  const auto = choisi ? [] : logosAutomatiques(p); // sinon : logos automatiques à essayer
  const src = choisi || auto[0] || ""; // image à afficher
  if (!src) return `<span class="plogo plogo--${taille}">${mono}</span>`; // pas de logo (ou « - ») → monogramme
  // Le monogramme est placé SOUS l'image : si elle échoue, initLogos essaie l'adresse suivante (data-suivants),
  // puis retire l'image → le monogramme réapparaît.
  const suivants = auto.slice(1).join(" "); // autres candidats automatiques (adresses sans espace : encodées)
  return `<span class="plogo plogo--${taille} plogo--img${auto.length ? " plogo--auto" : ""}">${mono}<img src="${escapeHtml(src)}" alt="Logo ${escapeHtml(p?.nom || "")}" loading="lazy" decoding="async"${suivants ? ` data-suivants="${escapeHtml(suivants)}"` : ""}></span>`;
}

// À appeler une fois au démarrage : les évènements « error » des images ne remontent pas (pas de bubbling),
// on les capture donc au niveau du document, en phase de capture.
export function initLogos() {
  document.addEventListener("error", (e) => {
    const img = e.target;
    if (!(img instanceof HTMLImageElement) || !img.closest(".plogo")) return; // pas un logo
    echecs.add(img.getAttribute("src")); // mémorise l'échec (les prochains rendus ne le réessaient pas)
    const [suivant, ...reste] = (img.dataset.suivants || "").split(" ").filter((u) => u && !echecs.has(u)); // candidat suivant
    if (suivant) { img.dataset.suivants = reste.join(" "); img.src = suivant; } // essaie le logo automatique suivant
    else img.remove(); // plus rien à essayer → monogramme
  }, true);
}
