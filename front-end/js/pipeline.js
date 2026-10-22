// pipeline.js — Kanban 7 colonnes (Prospect → Perdu).
// Importation du store central et de l'action de changement d'étape historisée
import { store, changerEtape } from "./store.js";
// Importation du helper pour construire les liens hash vers la fiche
import { ficheHref } from "./router.js";
// Importation des utilitaires d'affichage, sécurité et notification
import {
  formatEuro, // formatage en euros
  formatDate, // formatage de dates ISO
  dueClass, // classe CSS selon l'échéance de l'action
  stageSlug, // conversion d'étape en slug CSS
  montantAffiche, // calcul du montant à afficher selon l'étape
  montantMeta, // mention descriptive associée au montant
  escapeHtml, // neutralisation des caractères HTML
  showToast, // affichage d'un toast temporaire
  remplirResponsables // alimentation dynamique des options du filtre
} from "./utils.js";
import { icon } from "./icons.js";
import { naviguer } from "./router.js";

// Filtre sélectionné pour le responsable (vide = tous)
let filterOwner = "";
// Chaîne de recherche saisie par l'utilisateur
let filterQuery = "";

// Initialisation des écouteurs d'événements du Kanban
export function initPipeline() {
  // Récupération de l'élément racine du Kanban
  const root = document.getElementById("kanban");
  // Si le Kanban n'est pas présent dans la page, on s'arrête
  if (!root) return;

  // Récupération du menu déroulant de filtrage par responsable
  const owner = document.getElementById("pipeline-filter-owner");
  // Récupération du champ de recherche textuelle
  const search = document.getElementById("pipeline-search");
  // Changement de responsable : mémorise le filtre et re-rend le pipeline
  if (owner) owner.addEventListener("change", () => { filterOwner = owner.value; renderPipeline(); });
  // Saisie dans la recherche : mémorise la requête et re-rend le pipeline
  if (search) search.addEventListener("input", () => { filterQuery = search.value.trim().toLowerCase(); renderPipeline(); });

  // Alternative au glisser-déposer (clavier, tactile) : liste « Déplacer vers… » sur chaque carte
  root.addEventListener("change", (e) => {
    const sel = e.target.closest("[data-move]");
    if (sel) changerEtape(sel.dataset.move, sel.value).then(() => showToast(`Étape : ${sel.value}`)).catch(() => showToast("Échec du déplacement"));
  });
  // Clic n'importe où sur la carte → ouvre la fiche
  root.addEventListener("click", (e) => {
    if (e.target.closest("a, select, label")) return;
    const card = e.target.closest(".pcard");
    if (card) naviguer({ ficheId: card.dataset.partnerId });
  });
}

// Filtre la liste des partenaires selon les critères actifs
function visiblePartners() {
  // Récupération de la requête normalisée
  const q = filterQuery;
  // Filtrage de la liste complète des partenaires du store
  return store.partenaires.filter((p) => {
    // Les fiches archivées sont masquées du Kanban
    if (p.archive || p.etape === "Archivé") return false;
    // Filtre "Sans responsable" : exclut ceux qui ont un responsable
    if (filterOwner === "none" && p.responsable) return false;
    // Filtre par responsable précis : exclut ceux qui ne correspondent pas
    if (filterOwner && filterOwner !== "none" && p.responsable !== filterOwner) return false;
    // Si aucune recherche texte n'est renseignée, le partenaire est conservé
    if (!q) return true;
    // Concaténation des champs textuels pour la recherche globale
    const blob = `${p.nom} ${p.secteur} ${p.type} ${p.responsable} ${p.notes}`.toLowerCase();
    // Vérifie si la requête est contenue dans les données du partenaire
    return blob.includes(q);
  });
}

// Fonction de rendu complet du Kanban
export function renderPipeline() {
  // Récupération de l'élément racine du Kanban
  const root = document.getElementById("kanban");
  // Si l'élément n'existe pas, on abandonne le rendu
  if (!root) return;

  // Alimentation dynamique des options du select responsable
  const ownerSel = document.getElementById("pipeline-filter-owner");
  // Remplissage avec les options Tous et Sans responsable
  if (ownerSel) remplirResponsables(ownerSel, { tous: true, sans: true });

  // Liste des partenaires visibles après application des filtres
  const partners = visiblePartners();
  // Récupération des colonnes configurées dans le store ou liste par défaut
  const colonnes = store.colonnes.length
    ? store.colonnes
    : ["Prospect", "Contacté", "RDV", "Proposition", "Négociation", "Signé", "Perdu"].map((id) => ({
        id, // identifiant de la colonne
        slug: stageSlug(id) // slug CSS
      }));

  // Génération du balisage HTML de chaque colonne
  root.innerHTML = colonnes.map((col) => {
    // Filtrage des fiches appartenant à cette étape
    const cards = partners.filter((p) => p.etape === col.id);
    // Somme cumulée des montants affichés pour cette étape
    const total = cards.reduce((sum, p) => sum + montantAffiche(p), 0);
    // Slug CSS de la colonne
    const slug = col.slug || stageSlug(col.id);

    // Retourne le gabarit HTML de la colonne avec son en-tête et ses cartes
    return `
      <section class="kanban__col kanban__col--${escapeHtml(slug)}" data-stage="${escapeHtml(col.id)}" aria-label="${escapeHtml(col.id)}">
        <header class="kanban__head">
          <div>
            <h3 class="kanban__title">${escapeHtml(col.id)} <span class="kanban__count">${cards.length}</span></h3>
            ${col.description ? `<p class="kanban__hint">${escapeHtml(col.description)}</p>` : ""}
          </div>
          <span class="kanban__total">${formatEuro(total)}</span>
        </header>
        <div class="kanban__cards" data-stage="${escapeHtml(col.id)}">
          ${cards.length ? cards.map(cardHtml).join("") : `<p class="kanban__empty">Déposez une carte ici</p>`}
        </div>
      </section>`;
  }).join("");

  // Attachement des gestionnaires de glisser-déposer sur les colonnes et cartes
  bindDragAndDrop(root);

  // Mise à jour du compteur global de fiches visibles dans le sous-titre
  const countEl = document.getElementById("pipeline-visible-count");
  // Affichage du nombre de fiches au singulier ou pluriel
  if (countEl) countEl.textContent = `${partners.length} fiche${partners.length > 1 ? "s" : ""}`;
}

// Génère le code HTML d'une carte partenaire (§4.3 : nom, montant, responsable, type si ≠ sponsoring, prochaine action)
const ETAPES_KANBAN = ["Prospect", "Contacté", "RDV", "Proposition", "Négociation", "Signé", "Perdu", "Archivé"];
function cardHtml(p) {
  const amount = montantAffiche(p);
  const meta = montantMeta(p);
  const due = dueClass(p.prochaineActionDate);
  const action = p.prochaineActionTexte || p.prochaineActionDate
    ? `<div class="pcard__action">${icon("clock")}<span>${escapeHtml(p.prochaineActionTexte || "Action prévue")}${
        p.prochaineActionDate ? ` · <span class="${due}">${formatDate(p.prochaineActionDate)}${due === "due--late" ? " (en retard)" : ""}</span>` : ""}</span></div>`
    : (["RDV", "Proposition", "Négociation"].includes(p.etape) ? `<div class="pcard__action"><span class="due--late">Aucune prochaine action</span></div>` : "");

  return `
    <article class="pcard" draggable="true" data-partner-id="${escapeHtml(p.id)}">
      <a class="pcard__name" href="${ficheHref(p.id)}">${escapeHtml(p.nom)}</a>
      <span class="pcard__amount">${amount ? formatEuro(amount) : "—"}${meta ? ` <small>${escapeHtml(meta)}</small>` : ""}</span>
      <div class="pcard__badges">
        ${p.type && p.type !== "Sponsoring" ? `<span class="badge badge--info">${escapeHtml(p.type)}</span>` : ""}
        ${p.secteur ? `<span class="badge">${escapeHtml(p.secteur)}</span>` : ""}
      </div>
      <span class="pcard__meta">${icon("user")}${p.responsable ? escapeHtml(p.responsable) : '<span class="due--soon">Sans responsable</span>'}</span>
      ${action}
      <div class="pcard__foot">
      <label class="sr-only" for="mv-${escapeHtml(p.id)}">Changer l'étape de ${escapeHtml(p.nom)}</label>
      <select class="pcard__move" id="mv-${escapeHtml(p.id)}" data-move="${escapeHtml(p.id)}" title="Déplacer vers…">
        ${ETAPES_KANBAN.map((e) => `<option ${e === p.etape ? "selected" : ""}>${e}</option>`).join("")}
      </select>
      </div>
    </article>`;
}

// Attache les événements de glisser-déposer HTML5
function bindDragAndDrop(root) {
  // Identifiant du partenaire en cours de glissement
  let draggedId = null;

  // Parcours de toutes les cartes déplaçables
  root.querySelectorAll(".pcard").forEach((card) => {
    // Début du glissement : mémorise l'identifiant et applique le style
    card.addEventListener("dragstart", (e) => {
      // Stocke l'identifiant du partenaire
      draggedId = card.dataset.partnerId;
      // Ajoute la classe visuelle de glissement
      card.classList.add("pcard--dragging");
      // Définit l'effet autorisé comme déplacement
      e.dataTransfer.effectAllowed = "move";
      // Transfère l'identifiant en texte brut
      e.dataTransfer.setData("text/plain", draggedId);
    });
    // Fin du glissement : retire les styles et réinitialise l'identifiant
    card.addEventListener("dragend", () => {
      // Retire la classe visuelle de glissement sur la carte
      card.classList.remove("pcard--dragging");
      // Retire la classe de survol sur toutes les colonnes cibles
      root.querySelectorAll(".kanban__col--drop").forEach((c) => c.classList.remove("kanban__col--drop"));
      // Réinitialise la référence temporaire
      draggedId = null;
    });
  });

  // Parcours de chaque colonne cible
  root.querySelectorAll(".kanban__col").forEach((col) => {
    // Survol d'une colonne : autorise le dépôt et applique le feedback visuel
    col.addEventListener("dragover", (e) => {
      // Empêche le comportement par défaut pour autoriser le drop
      e.preventDefault();
      // Indique au navigateur qu'un déplacement aura lieu
      e.dataTransfer.dropEffect = "move";
      // Ajoute la classe visuelle de survol valide
      col.classList.add("kanban__col--drop");
    });
    // Sortie de survol de la colonne : retire le feedback visuel
    col.addEventListener("dragleave", (e) => {
      // Vérifie que le curseur a bien quitté la colonne
      if (!col.contains(e.relatedTarget)) col.classList.remove("kanban__col--drop");
    });
    // Dépôt de la carte dans la nouvelle colonne
    col.addEventListener("drop", (e) => {
      // Empêche le comportement natif du navigateur
      e.preventDefault();
      // Retire la classe de survol
      col.classList.remove("kanban__col--drop");
      // Récupère l'identifiant du partenaire déplacé
      const id = e.dataTransfer.getData("text/plain") || draggedId;
      // Récupère l'étape de destination associée à la colonne
      const stage = col.dataset.stage;
      // Si l'identifiant et l'étape sont présents, applique le changement avec historisation
      if (id && stage) changerEtape(id, stage).catch(() => showToast("Échec du déplacement"));
    });
  });
}
