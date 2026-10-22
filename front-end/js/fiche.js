// fiche.js — contenu de la fiche partenaire (le panneau latéral lui-même est géré par drawer.js).
import { store, ecrire, ajouter, supprimer, changerEtape, noterHistorique, assurerContrat, appliquerPlanEcheancier, auteur } from "./store.js"; // état + actions
import { totalValide, totalDemande, cerfaAEmettre, montantParDefaut, planifierEcheancier, enCents, enEuros, statutAction } from "./selectors.js"; // règles métier
import { aujourdhui } from "./dates.js"; // date du jour
import { creerDrawer } from "./drawer.js"; // mécanisme du panneau
import { naviguer } from "./router.js"; // navigation par URL
import { formatEuro, formatDate, escapeHtml, showToast, stageSlug, montantAffiche, montantMeta } from "./utils.js";
import { icon } from "./icons.js"; // affichage

const $ = (id) => document.getElementById(id); // raccourci getElementById
let idCourant = null; // id de la fiche ouverte (null = fermée)
let drawer = null; // instance du panneau
let suppressionArmee = false; // vrai après le 1er clic sur « Supprimer » (confirmation en deux clics)

const vue = (id) => store.partenaires.find((p) => p.id === id) || null; // vue du partenaire par id

export function initFiche() {
  const overlay = $("fiche-partenaire"); // conteneur du panneau
  drawer = creerDrawer(overlay, { onFermer: () => naviguer({ ficheId: null }) }); // fermer = retirer ?fiche= de l'URL
  overlay.addEventListener("change", surChangement); // enregistrement au blur (UNE écoute pour tous les champs)
  overlay.addEventListener("click", surClic); // boutons d'action (ajout, suppression, génération…)
}

export function ouvrirFiche(id) { // appelé par le routeur quand l'URL contient ?fiche=
  if (!vue(id)) { showToast("Fiche introuvable"); naviguer({ ficheId: null }); return; } // id inconnu → on referme
  idCourant = id; // mémorise la fiche ouverte
  suppressionArmee = false; // réinitialise la confirmation de suppression
  drawer.ouvrir(); // affiche le panneau
  renderFiche(true); // remplit tout, même un champ qui aurait le focus
}

export function fermerFiche() { idCourant = null; drawer?.fermer(); } // appelé par le routeur quand ?fiche= disparaît

// ---------- Lecture d'un champ du formulaire en valeur typée ----------
function lireValeur(el) {
  if (el.type === "checkbox") return el.checked; // case → booléen
  if (el.type === "number") { const n = Number(el.value); return el.value === "" ? 0 : Number.isFinite(n) && n >= 0 ? n : undefined; } // nombre ≥ 0, sinon invalide
  if (el.type === "date") return el.value || null; // date vide → null
  if (el.dataset.field === "responsable") return el.value === "—" ? "" : el.value; // « — » = sans responsable
  return el.tagName === "TEXTAREA" ? el.value : el.value.trim(); // texte
}

// ---------- Enregistrement au blur ----------
async function surChangement(e) {
  const el = e.target.closest("[data-table][data-field]"); // champ concerné (ignore les champs du générateur)
  if (!el || !idCourant) return; // rien à enregistrer
  const { table, field } = el.dataset; // table et colonne visées
  const valeur = lireValeur(el); // valeur typée
  if (valeur === undefined) { showToast("Valeur invalide"); renderFiche(true); return; } // refuse et réaffiche l'ancienne valeur
  if (field === "nom") { // une seule fiche par entreprise : nom obligatoire et unique
    const k = (x) => String(x || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!valeur) { showToast("Valeur invalide : le nom est obligatoire"); renderFiche(true); return; }
    if (store.partenaires.some((p) => p.id !== idCourant && k(p.nom) === k(valeur))) { showToast("Valeur invalide : une fiche porte déjà ce nom"); renderFiche(true); return; }
  }
  try {
    if (table === "partenaires" && field === "etape") await changerEtape(idCourant, valeur); // étape : écrit aussi l'historique (§5.1)
    else {
      const id = table === "contrats" ? (await assurerContrat(idCourant)).id : table === "partenaires" ? idCourant : el.dataset.id; // ligne visée
      const patch = { [field]: valeur }; // UNIQUEMENT le champ modifié (règle §5.6)
      if (table === "partenaires") Object.assign(patch, { modifieLe: new Date().toISOString(), modifiePar: auteur() }); // traçabilité §6
      await ecrire(table, id, patch); // écriture optimiste
    }
    showToast(); // « Enregistré »
  } catch (err) { console.error(err); showToast("Échec de l'enregistrement"); renderFiche(true); } // erreur : on réaffiche la valeur serveur
}

// ---------- Actions (boutons) ----------
async function surClic(e) {
  const b = e.target.closest("[data-action]"); // bouton cliqué
  if (!b || !idCourant) return; // clic ailleurs
  const v = vue(idCourant), saison = store.reglages.saisonEnCours; // fiche et saison courantes
  try {
    switch (b.dataset.action) {
      case "action-faite": { // §4.5 : l'ajoute à l'historique puis la vide
        await noterHistorique(v.id, `Action faite : ${v.prochaineActionTexte || "(sans libellé)"}`, { auto: true }); // trace
        await ecrire("partenaires", v.id, { prochaineActionDate: null, prochaineActionTexte: "", modifieLe: new Date().toISOString(), modifiePar: auteur() }); // vide la prochaine action
        showToast("Action marquée comme faite"); break;
      }
      case "add-echeance": await ajouter("echeances", { partenaireId: v.id, saison, datePrevue: null, montant: 0, paye: false, note: "" }); break; // échéance vide
      case "del-echeance": await supprimer("echeances", b.dataset.id); break; // supprime l'échéance
      case "generer": { // générateur d'échéancier (§5.3)
        const montant = Number($("g-amount").value) || montantParDefaut(v); // vide → total validé − déjà payé
        const nombre = Math.floor(Number($("g-count").value)); // nombre de versements mensuels
        const premier = $("g-start").value; // date du 1er versement (ISO)
        if (!(montant > 0) || !(nombre >= 1) || !premier) { showToast("Montant, nombre et 1er versement requis"); return; } // validation
        const plan = planifierEcheancier(v, { montant, nombre, premierVersement: premier }); // calcule (ne modifie rien)
        await appliquerPlanEcheancier(v.id, plan); // insère puis supprime les non payées
        $("g-amount").value = "";
        showToast(`${plan.aCreer.length} échéances générées`); break;
      }
      case "add-cp": { // contrepartie : catalogue OU texte libre
        const libre = $("cp-free").value.trim(), cat = $("cp-catalog").value; // les deux sources
        const libelle = libre || cat; // le texte libre l'emporte
        if (!libelle) { showToast("Choisissez ou saisissez une contrepartie"); return; } // rien à ajouter
        if (v.contreparties.some((c) => c.libelle.toLowerCase() === libelle.toLowerCase())) { showToast("Contrepartie déjà présente"); return; }
        await ajouter("contreparties", { partenaireId: v.id, saison, libelle, livree: false }); // ajoute
        $("cp-free").value = ""; $("cp-catalog").value = ""; break; // réinitialise la saisie
      }
      case "del-cp": await supprimer("contreparties", b.dataset.id); break; // supprime la contrepartie
      case "add-contact": { // contact vide, le champ « Nom » reçoit le focus
        const c = await ajouter("contacts", { partenaireId: v.id, nom: "", fonction: "", email: "", tel: "" });
        renderFiche(true);
        document.querySelector(`#contacts-list [data-id="${CSS.escape(c.id)}"][data-field="nom"]`)?.focus();
        return;
      }
      case "del-contact": await supprimer("contacts", b.dataset.id); break; // supprime le contact
      case "add-echange": { // échange daté ajouté à la main
        const texte = $("h-text").value.trim(); // texte de l'échange
        if (!texte) { showToast("Saisissez le texte de l'échange"); return; } // obligatoire
        await noterHistorique(v.id, texte, { date: $("h-date").value || aujourdhui() }); // date choisie ou aujourd'hui
        $("h-text").value = ""; break; // vide le champ
      }
      case "supprimer-fiche": { // §4.5 : confirmation en deux clics
        if (!suppressionArmee) { // 1er clic : on arme
          suppressionArmee = true; b.classList.add("is-armed"); b.querySelector("span").textContent = "Confirmer la suppression"; // change le libellé
          setTimeout(() => { suppressionArmee = false; b.classList.remove("is-armed"); const l = b.querySelector("span"); if (l) l.textContent = "Supprimer la fiche"; }, 4000); // désarme après 4 s
          return;
        }
        await supprimer("partenaires", v.id); // 2e clic : supprime (les enfants partent en cascade côté base)
        naviguer({ ficheId: null }); showToast("Fiche supprimée"); return; // ferme le panneau
      }
    }
    renderFiche(true); // action structurelle : on redessine tout de suite (même si un bouton a le focus)
  } catch (err) { console.error(err); showToast("Échec de l'opération"); } // erreur réseau / droits
}

// ---------- Rendu (appelé à l'ouverture ET à chaque changement du store, y compris temps réel) ----------
// forcer = true : ignore la protection « ne pas écraser ce que l'utilisateur est en train de saisir ».
export function renderFiche(forcer = false) {
  if (!idCourant) return;
  const v = vue(idCourant);
  if (!v) { showToast("Cette fiche a été supprimée par un autre membre"); naviguer({ ficheId: null }); return; }
  const jour = aujourdhui();

  $("fiche-title").textContent = v.nom;
  $("fiche-saison").textContent = store.reglages.saisonEnCours;
  const stAction = statutAction(v.prochaineActionDate, jour);
  $("fiche-badges").innerHTML = [
    `<span class="badge badge--${stageSlug(v.etape)}">${escapeHtml(v.etape)}</span>`,
    v.type ? `<span class="badge">${escapeHtml(v.type)}</span>` : "",
    v.secteur ? `<span class="badge">${escapeHtml(v.secteur)}</span>` : "",
    cerfaAEmettre(v) ? '<span class="badge badge--warning">CERFA à émettre</span>' : "",
    v.echeances.some((e) => !e.paye && e.datePrevue && e.datePrevue < jour) ? '<span class="badge badge--danger">Paiement en retard</span>' : "",
    stAction === "late" ? '<span class="badge badge--danger">Action en retard</span>' : ""
  ].join("");

  // Listes déroulantes alimentées par les réglages
  remplirSelect($("f-owner"), ["—", ...store.reglages.responsables, ...(v.responsable && !store.reglages.responsables.includes(v.responsable) ? [v.responsable] : [])]);
  remplirSelect($("cp-catalog"), ["", ...store.reglages.catalogue.filter((c) => !v.contreparties.some((x) => x.libelle === c))], "Ajouter depuis le catalogue…");

  // Champs « statiques » (data-table/data-field sans data-id), sauf celui qui a le focus
  $("fiche-partenaire").querySelectorAll("[data-table][data-field]:not([data-id])").forEach((el) => {
    if (!forcer && el === document.activeElement) return;
    const source = el.dataset.table === "contrats" ? v.contrat || { cotisationDemandee: v.cotisationDemandee } : v;
    const valeur = source[el.dataset.field];
    if (el.type === "checkbox") el.checked = !!valeur;
    else el.value = el.dataset.field === "responsable" && !valeur ? "—" : valeur ?? "";
  });

  // Résumé chiffré
  const m = montantAffiche(v), mention = montantMeta(v), tv = totalValide(v);
  const totalPrevu = v.echeances.reduce((t, e) => t + enCents(e.montant), 0);
  $("fiche-summary").innerHTML = `
    <div class="score__fig kpi ${v.etape === "Signé" ? "score__fig--success" : ""}"><span class="kpi__label">${v.etape === "Signé" ? "Signé" : mention === "demandé" ? "Demandé" : "Saison préc."}</span><span class="kpi__value">${formatEuro(m)}</span></div>
    <div class="score__fig kpi"><span class="kpi__label">Encaissé</span><span class="kpi__value">${formatEuro(v.encaisse)}</span></div>
    <div class="score__fig kpi"><span class="kpi__label">Contreparties</span><span class="kpi__value">${v.contrepartiesLivrees} / ${v.contrepartiesTotal}</span></div>`;

  $("fiche-action-state").innerHTML = stAction === "late" ? '<span class="badge badge--danger">En retard</span>' : stAction === "soon" ? '<span class="badge badge--warning">Bientôt</span>' : "";
  $("c-total").textContent = formatEuro(tv);
  $("c-total-asked").textContent = formatEuro(totalDemande(v));
  $("c-prev").textContent = v.montantPrecedent ? formatEuro(v.montantPrecedent) : "—";
  $("cerfa-field").hidden = !(Number(v.dontMecenat) > 0); // case CERFA seulement s'il y a du mécénat
  $("i-updated").textContent = v.modifieLe ? `${formatDate(String(v.modifieLe).slice(0, 10))} · ${v.modifiePar || "?"}` : "—";
  $("i-first").textContent = v.premierContact ? formatDate(v.premierContact) : "—";

  // Alerte : total des échéances ≠ total validé
  const alerte = $("schedule-alert");
  alerte.hidden = !v.echeances.length || totalPrevu === enCents(tv);
  alerte.textContent = `Le total des échéances (${formatEuro(enEuros(totalPrevu))}) diffère du total validé (${formatEuro(tv)}).`;
  $("g-amount").placeholder = String(montantParDefaut(v));
  if (!$("g-start").value) $("g-start").value = jour;

  // Compteurs des sections
  $("count-schedule").textContent = v.echeances.length ? `${v.echeances.filter((e) => e.paye).length} / ${v.echeances.length} payées` : "";
  $("count-cp").textContent = v.contrepartiesTotal ? `${v.contrepartiesLivrees} / ${v.contrepartiesTotal} livrées` : "";
  $("count-contacts").textContent = v.contacts.length || "";
  $("count-history").textContent = v.echanges.length || "";

  // Listes générées (pas redessinées pendant une saisie, sauf forcer)
  majListe($("schedule-tbody"), v.echeances.length ? v.echeances.slice().sort((a, b) => String(a.datePrevue || "9999").localeCompare(String(b.datePrevue || "9999"))).map((e) => htmlEcheance(e, jour)).join("") : `<tr><td colspan="5" class="empty-cell">Aucune échéance. Utilisez le générateur ci-dessous.</td></tr>`, forcer);
  majListe($("counterparts-list"), v.contreparties.map(htmlContrepartie).join("") || '<li class="faint" style="font-size: var(--text-sm)">Aucune contrepartie.</li>', forcer);
  majListe($("contacts-list"), v.contacts.map(htmlContact).join("") || '<p class="faint" style="font-size: var(--text-sm); margin-bottom: var(--space-3)">Aucun contact.</p>', forcer);
  majListe($("history-list"), v.echanges.map((x) => `<div class="timeline__item ${x.auto ? "timeline__item--auto" : ""}"><div class="timeline__text">${escapeHtml(x.texte)}</div><div class="timeline__meta">${formatDate(x.date)} · ${escapeHtml(x.auteur || "?")}</div></div>`).join("") || '<p class="faint" style="font-size: var(--text-sm)">Aucun échange.</p>', forcer);
  if (!$("h-date").value) $("h-date").value = jour;

  const presences = store.evenements.flatMap((evt) => evt.presences.filter((p) => p.partenaireId === v.id).map((p) => ({ evt, p }))).sort((a, b) => String(b.evt.date).localeCompare(String(a.evt.date)));
  $("count-attendance").textContent = presences.length ? `${presences.filter((x) => x.p.presence === "Oui").length} / ${presences.length}` : "";
  majListe($("fiche-attendance"), presences.map(({ evt, p }) => `<li class="cp-item"><span style="flex:1; font-size: var(--text-sm)"><strong>${escapeHtml(evt.nom)}</strong> <span class="muted">· ${formatDate(evt.date)}</span></span><span class="badge ${p.presence === "Oui" ? "badge--success" : p.presence === "Non" ? "badge--danger" : "badge--warning"}">${escapeHtml(p.presence)}${p.presence === "Oui" ? ` · ${Number(p.personnes) || 0} pers.` : ""}</span></li>`).join("") || '<li class="faint" style="font-size: var(--text-sm)">Aucune invitation pour l\'instant.</li>', true);
}

function majListe(conteneur, html, forcer) {
  if (!conteneur) return;
  if (!forcer && conteneur.contains(document.activeElement)) return;
  conteneur.innerHTML = html;
}

function remplirSelect(select, valeurs, vide = "") {
  if (!select) return;
  const courante = select.value;
  select.innerHTML = valeurs.map((x) => `<option value="${escapeHtml(x)}">${escapeHtml(x || vide)}</option>`).join("");
  select.value = valeurs.includes(courante) ? courante : valeurs[0];
}

// ----- Gabarits HTML des lignes (chaque champ porte data-table / data-id / data-field) -----
const attrs = (table, id, champ) => `data-table="${table}" data-id="${escapeHtml(id)}" data-field="${champ}"`;

const htmlEcheance = (e, jour) => `<tr class="${!e.paye && e.datePrevue && e.datePrevue < jour ? "pay-row--late" : ""}">
  <td><input type="checkbox" ${attrs("echeances", e.id, "paye")} ${e.paye ? "checked" : ""} aria-label="Payé"></td>
  <td><input type="date" ${attrs("echeances", e.id, "datePrevue")} value="${escapeHtml(e.datePrevue || "")}" aria-label="Date prévue"></td>
  <td class="num"><input type="number" min="0" step="0.01" ${attrs("echeances", e.id, "montant")} value="${Number(e.montant) || 0}" aria-label="Montant" style="max-width:100px; text-align:right"></td>
  <td><input type="text" ${attrs("echeances", e.id, "note")} value="${escapeHtml(e.note || "")}" placeholder="Chèque, virement…" aria-label="Note"></td>
  <td><button type="button" class="btn btn--ghost btn--icon btn--small" data-action="del-echeance" data-id="${escapeHtml(e.id)}" aria-label="Supprimer l'échéance" title="Supprimer">${icon("x", "icon--sm")}</button></td>
</tr>`;

const htmlContrepartie = (c) => `<li class="cp-item ${c.livree ? "cp-item--done" : ""}">
  <input type="checkbox" id="cp-${escapeHtml(c.id)}" ${attrs("contreparties", c.id, "livree")} ${c.livree ? "checked" : ""}>
  <label for="cp-${escapeHtml(c.id)}">${escapeHtml(c.libelle)}</label>
  ${c.livree ? '<span class="badge badge--success">Livrée</span>' : ""}
  <button type="button" class="btn btn--ghost btn--icon btn--small" data-action="del-cp" data-id="${escapeHtml(c.id)}" aria-label="Supprimer la contrepartie ${escapeHtml(c.libelle)}" title="Supprimer">${icon("x", "icon--sm")}</button>
</li>`;

const htmlContact = (c) => `<fieldset class="contact-card" style="margin-inline:0">
  <legend class="sr-only">Contact ${escapeHtml(c.nom)}</legend>
  <div class="contact-card__head">
    <strong style="font-size: var(--text-sm)">${icon("user", "icon--sm")} ${escapeHtml(c.nom || "Nouveau contact")}</strong>
    <span class="contact-card__links">
      ${c.email ? `<a class="btn btn--ghost btn--icon btn--small" href="mailto:${escapeHtml(c.email)}" title="Écrire à ${escapeHtml(c.email)}" aria-label="Écrire un e-mail">${icon("mail", "icon--sm")}</a>` : ""}
      ${c.tel ? `<a class="btn btn--ghost btn--icon btn--small" href="tel:${escapeHtml(String(c.tel).replace(/\s/g, ""))}" title="Appeler ${escapeHtml(c.tel)}" aria-label="Appeler">${icon("phone", "icon--sm")}</a>` : ""}
      <button type="button" class="btn btn--ghost btn--icon btn--small" data-action="del-contact" data-id="${escapeHtml(c.id)}" aria-label="Supprimer ce contact" title="Supprimer">${icon("trash", "icon--sm")}</button>
    </span>
  </div>
  <div class="form-grid form-grid--2">
    <div class="field"><label>Nom<input type="text" class="input--sm" ${attrs("contacts", c.id, "nom")} value="${escapeHtml(c.nom || "")}" placeholder="Prénom Nom"></label></div>
    <div class="field"><label>Fonction<input type="text" class="input--sm" ${attrs("contacts", c.id, "fonction")} value="${escapeHtml(c.fonction || "")}"></label></div>
    <div class="field"><label>E-mail<input type="email" class="input--sm" ${attrs("contacts", c.id, "email")} value="${escapeHtml(c.email || "")}"></label></div>
    <div class="field"><label>Téléphone<input type="tel" class="input--sm" ${attrs("contacts", c.id, "tel")} value="${escapeHtml(c.tel || "")}"></label></div>
  </div>
</fieldset>`;
