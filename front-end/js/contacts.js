// contacts.js — v2 : fenêtre « Nouveau contact » réutilisable.
// Utilisée par l'écran Événements : le bouton « Ajouter le contact » d'une ligne de présence
// ouvre cette fenêtre, pré-remplie avec le partenaire et les noms notés pour l'événement.
// Le contact est enregistré dans la fiche du partenaire (table « contacts ») et tracé dans son historique.
import { store, creerContact } from "./store.js"; // état + action métier
import { showToast } from "./utils.js"; // messages
import { ouvrirModale, fermerModale } from "./modal.js"; // fenêtre accessible

const $ = (id) => document.getElementById(id); // raccourci
let contexte = null; // { partenaireId, origine, onEnregistre, onAnnule } de l'ouverture en cours
let enregistre = false; // vrai si la fenêtre s'est fermée après un enregistrement réussi

// Ouvre la fenêtre. noms = texte libre saisi pour l'événement (« Jean Dupont + 1 ») : s'il ne contient
// qu'UN nom, il pré-remplit le champ « Nom » ; sinon il est affiché en aide.
export function ouvrirNouveauContact({ partenaireId, origine = "", noms = "", onEnregistre, onAnnule } = {}) {
  const p = store.partenaires.find((x) => x.id === partenaireId); // fiche cible
  if (!p) { showToast("Fiche introuvable", { erreur: true }); return; } // supprimée entre-temps
  contexte = { partenaireId, origine, onEnregistre, onAnnule }; // mémorise pour l'enregistrement
  enregistre = false; // nouvelle ouverture
  const form = $("form-contact"); form.reset(); // formulaire vide
  $("ct-partenaire").textContent = p.nom; // rappel de l'entreprise
  $("ct-origine").textContent = origine; $("ct-origine").hidden = !origine; // ex. « Afterwork du 17/09 »
  const unSeulNom = noms.trim() && !/[,;+\n&]|\bet\b/i.test(noms); // un seul nom → on pré-remplit
  form.nom.value = unSeulNom ? noms.trim() : ""; // pré-remplissage
  $("ct-noms").hidden = !noms.trim() || unSeulNom; // sinon : on affiche les noms en aide
  $("ct-noms").textContent = `Noms notés pour l'événement : ${noms.trim()}`;
  $("ct-existants").textContent = p.contacts.length ? `Contacts déjà enregistrés : ${p.contacts.map((c) => c.nom || "(sans nom)").join(", ")}` : "Aucun contact enregistré pour l'instant."; // évite les doublons
  ouvrirModale($("modal-contact")); // affiche (focus sur le 1er champ)
}

export function initContacts() {
  const modal = $("modal-contact"), form = $("form-contact"); // éléments
  if (!form) return; // page sans la fenêtre
  // Fermeture SANS enregistrement (Annuler, Échap, fond) → on prévient l'appelant s'il le demande
  new MutationObserver(() => { if (modal.hidden && contexte && !enregistre) { const c = contexte; contexte = null; c.onAnnule?.(); } }).observe(modal, { attributes: true, attributeFilter: ["hidden"] });
  form.addEventListener("submit", async (e) => {
    e.preventDefault(); // pas de rechargement
    const nom = form.nom.value.trim(); // seul champ obligatoire
    if (!nom) { form.nom.focus(); showToast("Le nom du contact est obligatoire", { erreur: true }); return; }
    const bouton = form.querySelector("[type=submit]"); bouton.disabled = true; // évite le double envoi
    try {
      const c = await creerContact(contexte.partenaireId, { nom, fonction: form.fonction.value.trim(), email: form.email.value.trim(), tel: form.tel.value.trim() }, contexte.origine); // enregistre + historique
      enregistre = true; const ctx = contexte; contexte = null; // la fermeture qui suit n'est pas une annulation
      fermerModale(modal); showToast("Contact ajouté à la fiche");
      await ctx.onEnregistre?.(c); // ex. : l'écran Événements remet le statut de présence
    } catch (err) { console.error(err); showToast("Échec de l'enregistrement"); }
    finally { bouton.disabled = false; }
  });
}
