// paiements.js — écran « Paiements » (§4.6).
import { store, ecrire } from "./store.js"; // état + écriture optimiste
import { calculerPaiements, enRetard } from "./selectors.js"; // règles de calcul
import { aujourdhui, cleMois, libelleMois } from "./dates.js"; // dates
import { formatEuro, formatDate, escapeHtml, showToast } from "./utils.js"; // affichage
import { ficheHref } from "./router.js"; // lien vers la fiche

const FILTRES = { // prédicat par filtre (§4.6)
  "a-encaisser": (e) => !e.paye, // pas encore payé (les retards en font partie)
  "en-retard": (e, jour) => enRetard(e, jour), // non payé ET date dépassée
  encaisses: (e) => e.paye, // déjà payé
  tout: () => true // aucune restriction
};
let filtre = "a-encaisser"; // filtre actif (défaut du HTML)
const $ = (id) => document.getElementById(id); // raccourci

export function initPaiements() {
  const chips = document.querySelector("#screen-paiements .chips"); // barre de filtres
  chips?.addEventListener("click", (e) => { // clic sur un filtre
    const bouton = e.target.closest("[data-filter]"); // bouton cliqué
    if (!bouton) return; // clic ailleurs
    filtre = bouton.dataset.filter; // mémorise le filtre
    chips.querySelectorAll(".chip").forEach((c) => { c.classList.toggle("chip--active", c === bouton); c.setAttribute("aria-pressed", String(c === bouton)); }); // état visuel + ARIA
    renderPaiements(); // rafraîchit la liste
  });

  // Délégation : UNE seule écoute pour toutes les cases « payé » (les lignes sont recréées à chaque rendu).
  $("payments-list")?.addEventListener("change", async (e) => {
    const case_ = e.target.closest("input[data-echeance-id]"); // case cochée
    if (!case_) return; // autre champ
    const id = case_.dataset.echeanceId; // identifiant de l'échéance
    try {
      await ecrire("echeances", id, { paye: case_.checked }); // enregistre (optimiste + annulation si erreur)
      showToast(case_.checked ? "Paiement encaissé" : "Paiement décoché"); // retour utilisateur
    } catch {
      case_.checked = !case_.checked; // annule la case visuellement
      showToast("Échec de l'enregistrement"); // message d'erreur
    }
  });
}

export function renderPaiements() {
  const jour = aujourdhui(); // date du jour
  const parId = new Map(store.partenaires.map((p) => [p.id, p])); // nom du partenaire par id
  const toutes = store.echeancesSaison.filter((e) => parId.has(e.partenaireId)); // échéances de la saison (partenaire connu)

  // ----- 4 indicateurs : sur TOUTES les échéances de la saison, quel que soit le filtre -----
  const k = calculerPaiements(toutes, jour); // calculs
  $("pay-expected").textContent = formatEuro(k.attendu); // total attendu
  $("pay-cashed").textContent = formatEuro(k.encaisse); // encaissé
  const pct = $("pay-cashed-pct"); if (pct) pct.textContent = `${k.pctEncaisse} %`; // % encaissé
  $("pay-remaining").textContent = formatEuro(k.reste); // reste à encaisser
  $("pay-late").textContent = formatEuro(k.retardMontant); // en retard (montant)
  const sub = $("pay-late-sub"); if (sub) sub.textContent = `${k.retardNombre} échéance${k.retardNombre > 1 ? "s" : ""}`; // en retard (nombre)

  // Compteurs sur les filtres
  document.querySelectorAll("#screen-paiements .chip").forEach((c) => { const n = c.querySelector(".chip__count"); if (n) n.textContent = toutes.filter((e) => FILTRES[c.dataset.filter](e, jour)).length; });
  $("pay-late-card")?.classList.toggle("is-alert", k.retardNombre > 0);

  // ----- Liste filtrée puis groupée par mois -----
  const actif = document.activeElement?.dataset?.echeanceId; // case qui a le focus (pour le restituer après rendu)
  const visibles = toutes.filter((e) => e.id === actif || FILTRES[filtre](e, jour)); // applique le filtre sans faire disparaître la case active
  const groupes = new Map(); // clé de mois → échéances
  for (const e of visibles) { const cle = e.datePrevue ? cleMois(e.datePrevue) : "sans-date"; (groupes.get(cle) || groupes.set(cle, []).get(cle)).push(e); } // regroupe
  const cles = [...groupes.keys()].sort((a, b) => (a === "sans-date") - (b === "sans-date") || a.localeCompare(b)); // mois croissants, « sans date » en dernier

  const liste = $("payments-list"); // conteneur
  if (!cles.length) { liste.innerHTML = `<div class="card empty"><svg class="icon"><use href="#i-wallet"/></svg>${toutes.length ? "Aucune échéance pour ce filtre." : "Aucune échéance cette saison. Créez un échéancier depuis la fiche d'un partenaire signé."}</div>`; return; } // état vide

  liste.innerHTML = cles.map((cle) => {
    const lignes = groupes.get(cle).sort((a, b) => String(a.datePrevue || "").localeCompare(String(b.datePrevue || "")) || parId.get(a.partenaireId).nom.localeCompare(parId.get(b.partenaireId).nom, "fr")); // tri par date puis nom
    const total = lignes.reduce((t, e) => t + Math.round(e.montant * 100), 0) / 100; // total du mois (en cents puis euros)
    return `
      <section class="month-group" aria-labelledby="m-${cle}">
        <h2 id="m-${cle}" class="month-group__title">${cle === "sans-date" ? "Sans date de paiement" : libelleMois(cle)} <span class="month-group__total">· ${formatEuro(total)}</span></h2>
        <div class="table-wrap"><table class="table table--cards">
          <thead><tr><th scope="col">Payé</th><th scope="col">Partenaire</th><th scope="col">Date prévue</th><th scope="col" class="num">Montant</th><th scope="col">Note</th></tr></thead>
          <tbody>${lignes.map((e) => ligne(e, parId.get(e.partenaireId), jour)).join("")}</tbody>
        </table></div>
      </section>`;
  }).join(""); // un bloc par mois

  if (actif) liste.querySelector(`[data-echeance-id="${CSS.escape(actif)}"]`)?.focus(); // restitue le focus (le DOM a été recréé)
}

// Une ligne d'échéance (tableau sur grand écran, carte sur mobile grâce à data-label).
function ligne(e, p, jour) {
  const retard = enRetard(e, jour);
  return `
    <tr class="${retard ? "pay-row--late" : ""} ${e.paye ? "pay-row--paid" : ""}">
      <td data-label="Payé"><label class="pay-check"><input type="checkbox" data-echeance-id="${escapeHtml(e.id)}" ${e.paye ? "checked" : ""} aria-label="Marquer comme payé : ${escapeHtml(p.nom)}, ${formatEuro(e.montant)}"><span class="sr-only">Payé</span></label></td>
      <td data-label="Partenaire"><a class="link-fiche" href="${ficheHref(p.id)}">${escapeHtml(p.nom)}</a>${p.responsable ? `<span class="table__sub">${escapeHtml(p.responsable)}</span>` : ""}</td>
      <td data-label="Date prévue">${e.datePrevue ? `<span class="${retard ? "due--late" : ""}">${formatDate(e.datePrevue)}</span>${retard ? ' <span class="badge badge--danger">En retard</span>' : ""}` : '<span class="faint">—</span>'}</td>
      <td data-label="Montant" class="num"><strong>${formatEuro(e.montant)}</strong></td>
      <td data-label="Note">${escapeHtml(e.note || "") || '<span class="faint">—</span>'}</td>
    </tr>`;
}
