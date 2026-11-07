// siret.js — v2 : fenêtre dédiée « Numéro SIRET » (saisie / modification rapide sans ouvrir la fiche).
// Ouverte par le bouton SIRET de chaque ligne de l'écran Partenaires (et par le badge « SIRET manquant »
// de la fiche). La même règle de validation (selectors.validerSiret) sert partout :
// nouvelle fiche, champ SIRET de la fiche, et cette fenêtre.
import { store, enregistrerSiret } from "./store.js"; // état + écriture
import { validerSiret, formaterSiret } from "./selectors.js"; // règle de validation (14 chiffres + clé de Luhn)
import { showToast } from "./utils.js"; // messages
import { ouvrirModale, fermerModale } from "./modal.js"; // fenêtre accessible

const $ = (id) => document.getElementById(id); // raccourci
let idCourant = null; // fiche dont on modifie le SIRET

// Lien de recherche sur l'annuaire officiel des entreprises (data.gouv.fr) pour retrouver un SIRET.
export const lienAnnuaire = (terme) => `https://annuaire-entreprises.data.gouv.fr/rechercher?terme=${encodeURIComponent(terme)}`;

// Affiche sous le champ le résultat de la validation, à chaque frappe.
function majRetour(input, retour) {
  const r = validerSiret(input.value); // contrôle de la saisie en cours
  const complet = r.siret.length === 14; // on ne crie pas « invalide » avant le 14e chiffre
  retour.hidden = !r.siret || (!complet && r.valide); // rien à dire tant que c'est vide
  retour.className = `alert ${r.valide ? "alert--success" : complet ? "alert--danger" : "alert--info"}`; // couleur
  retour.textContent = r.valide ? `SIRET valide : ${formaterSiret(r.siret)} (SIREN ${r.siret.slice(0, 9)})` : complet ? r.erreur : `${r.siret.length} / 14 chiffres`; // message
  return r; // résultat (réutilisé à l'enregistrement)
}

export function ouvrirSiret(partenaireId) {
  const p = store.partenaires.find((x) => x.id === partenaireId); // fiche visée
  if (!p) return; // fiche supprimée entre-temps
  idCourant = partenaireId; // mémorise
  $("siret-nom").textContent = p.nom; // rappel du partenaire
  $("siret-input").value = formaterSiret(p.siret); // valeur actuelle, lisible
  $("siret-annuaire").href = lienAnnuaire(p.nom); // aide à la recherche
  $("siret-effacer").hidden = !p.siret; // « Effacer » seulement s'il y a quelque chose
  majRetour($("siret-input"), $("siret-retour")); // état initial
  ouvrirModale($("modal-siret")); // affiche
}

export function initSiret() {
  const form = $("form-siret"), input = $("siret-input"), retour = $("siret-retour"); // éléments
  if (!form) return; // page sans la fenêtre
  input.addEventListener("input", () => majRetour(input, retour)); // validation en direct
  $("siret-effacer").addEventListener("click", async () => { // retire le SIRET
    try { await enregistrerSiret(idCourant, ""); fermerModale($("modal-siret")); showToast("SIRET effacé"); }
    catch (err) { console.error(err); showToast("Échec de l'enregistrement"); }
  });
  form.addEventListener("submit", async (e) => {
    e.preventDefault(); // pas de rechargement
    const r = majRetour(input, retour); // validation finale
    if (!r.valide) { input.focus(); return; } // on garde la fenêtre ouverte avec le message d'erreur
    const doublon = r.siret && store.partenaires.find((p) => p.id !== idCourant && p.siret === r.siret); // même établissement sur deux fiches ?
    if (doublon && form.dataset.confirm !== r.siret) { // avertit une fois, le 2e clic confirme
      form.dataset.confirm = r.siret;
      retour.hidden = false; retour.className = "alert alert--warning";
      retour.textContent = `Ce SIRET est déjà utilisé par « ${doublon.nom} ». Cliquez à nouveau sur Enregistrer pour confirmer.`;
      return;
    }
    delete form.dataset.confirm; // réinitialise la confirmation
    try { await enregistrerSiret(idCourant, r.siret); fermerModale($("modal-siret")); showToast(r.siret ? "SIRET enregistré" : "SIRET effacé"); }
    catch (err) { console.error(err); showToast("Échec de l'enregistrement"); }
  });
}
