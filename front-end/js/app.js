// app.js — point d'entrée de l'application : authentification → données → écrans → routeur.
import { requireSession, initEnTete, completerUtilisateur, majLiaisons } from "./auth.js";
import { initStore, onChange, store } from "./store.js";
import { initRouter, enregistrerEcran, rendreEcranActif, naviguer, ecranActif } from "./router.js";
import { initDashboard, renderDashboard } from "./dashboard.js";
import { initPipeline, renderPipeline } from "./pipeline.js";
import { initPartenaires, renderTable, ouvrirNouveauPartenaire } from "./partenaires.js";
import { initPaiements, renderPaiements } from "./paiements.js";
import { initEvenements, renderEvenements, ouvrirNouvelEvenement } from "./evenements.js";
import { initFiche, ouvrirFiche, fermerFiche, renderFiche } from "./fiche.js";
import { exporterExcel } from "./export-excel.js";
import { calculerTableauDeBord, enRetard } from "./selectors.js";
import { aujourdhui } from "./dates.js";
import { showToast, escapeHtml, stageSlug, formatEuro, montantAffiche } from "./utils.js";
import { injecterIcones } from "./icons.js";
import { initModales } from "./modal.js";

injecterIcones();

const exporter = () => exporterExcel(store).catch((e) => { console.error(e); showToast("Export impossible"); });

try {
  await requireSession(); // redirige vers la connexion si pas connecté ou « Compte non autorisé »
  await initStore(); // charge les tables + abonne le temps réel
  if (!completerUtilisateur()) throw new Error("non autorisé");

  initModales();
  initEnTete({ onExport: exporter });
  initDashboard(); initPipeline(); initPartenaires(); initPaiements(); initEvenements(); initFiche();
  initActionsRapides();
  initRechercheGlobale();
  document.querySelectorAll("form[data-no-submit]").forEach((f) => f.addEventListener("submit", (e) => e.preventDefault()));
  const jour = document.getElementById("dash-today");
  if (jour) jour.textContent = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date());

  enregistrerEcran("dashboard", renderDashboard);
  enregistrerEcran("pipeline", renderPipeline);
  enregistrerEcran("partenaires", renderTable);
  enregistrerEcran("paiements", renderPaiements);
  enregistrerEcran("evenements", renderEvenements);

  onChange(() => { // à chaque changement (local ou temps réel)
    rendreEcranActif(); // seul l'écran visible est redessiné
    renderFiche(); // la fiche ouverte suit les modifications des autres membres (§7)
    majVoyantSync();
    majCompteurs();
    majLiaisons();
  });

  initRouter({ onOuvrirFiche: ouvrirFiche, onFermerFiche: fermerFiche });
  majVoyantSync(); majCompteurs();
  document.body.classList.add("is-ready");
} catch (err) {
  console.error(err);
  const boot = document.getElementById("boot");
  boot?.classList.add("boot--error");
  const t = document.getElementById("boot-text");
  if (t) t.innerHTML = `Impossible de charger les données.<br><button class="btn btn--small" style="margin-top:10px">Réessayer</button>`;
  t?.querySelector("button")?.addEventListener("click", () => location.reload());
}

// Voyant « synchronisé / hors ligne »
function majVoyantSync() {
  const el = document.getElementById("sync-status");
  if (!el) return;
  const libelles = { connecte: "Synchronisé", "hors-ligne": "Hors ligne", erreur: "Reconnexion…" };
  el.querySelector(".sync-status__label").textContent = libelles[store.sync] || "";
  el.title = libelles[store.sync] || "";
  el.dataset.state = store.sync;
}

// Pastilles de la navigation : actions à faire, retards, nombre de fiches…
function majCompteurs() {
  const jour = aujourdhui();
  const t = calculerTableauDeBord({ partenaires: store.partenaires, echeances: store.echeancesSaison, reglages: store.reglages }, jour);
  const urgent = t.todo.filter((i) => i.ton === "danger").length;
  const valeurs = {
    todo: urgent || "",
    pipeline: store.partenaires.filter((p) => !["Signé", "Perdu", "Archivé"].includes(p.etape)).length || "",
    partenaires: store.partenaires.filter((p) => p.etape !== "Archivé").length || "",
    retards: store.echeancesSaison.filter((e) => enRetard(e, jour)).length || "",
    evenements: store.evenements.filter((e) => e.date >= jour).length || ""
  };
  document.querySelectorAll("[data-count]").forEach((el) => { el.textContent = String(valeurs[el.dataset.count] ?? ""); });
}

// Boutons « Nouveau partenaire », « Export », « Nouvel événement » présents à plusieurs endroits.
function initActionsRapides() {
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-quick]");
    if (!b) return;
    e.preventDefault();
    if (b.dataset.quick === "new-partner") ouvrirNouveauPartenaire();
    if (b.dataset.quick === "export") exporter();
    if (b.dataset.quick === "new-event") ouvrirNouvelEvenement();
  });
}

// Recherche globale : nom, secteur, contacts → ouvre la fiche. Raccourci Ctrl/⌘ + K ou « / ».
function initRechercheGlobale() {
  const input = document.getElementById("gsearch-input");
  const box = document.getElementById("gsearch-results");
  const combo = input?.closest(".gsearch");
  if (!input) return;
  let index = 0, resultats = [];

  const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const fermer = () => { box.hidden = true; combo.setAttribute("aria-expanded", "false"); };
  const ouvrir = (p) => { fermer(); input.value = ""; input.blur(); naviguer({ ecran: ecranActif(), ficheId: p.id }); };

  function rendre() {
    const q = norm(input.value.trim());
    if (!q) { fermer(); return; }
    resultats = store.partenaires.filter((p) => norm([p.nom, p.secteur, p.responsable, p.notes, ...p.contacts.map((c) => `${c.nom} ${c.email}`)].join(" ")).includes(q))
      .sort((a, b) => Number(!norm(a.nom).startsWith(q)) - Number(!norm(b.nom).startsWith(q)) || a.nom.localeCompare(b.nom, "fr")).slice(0, 8);
    index = 0;
    box.innerHTML = resultats.length ? resultats.map((p, i) => `
      <a class="gsearch__item" role="option" id="gs-${i}" aria-selected="${i === index}" href="#" data-i="${i}">
        <span class="gsearch__item-main"><span class="gsearch__item-name">${escapeHtml(p.nom)}</span><span class="gsearch__item-meta">${escapeHtml([p.secteur, p.responsable].filter(Boolean).join(" · ") || "—")} · ${formatEuro(montantAffiche(p))}</span></span>
        <span class="badge badge--${stageSlug(p.etape)}">${escapeHtml(p.etape)}</span>
      </a>`).join("") : `<p class="gsearch__empty">Aucun partenaire trouvé</p>`;
    box.hidden = false; combo.setAttribute("aria-expanded", "true");
  }
  const surligner = () => box.querySelectorAll(".gsearch__item").forEach((el, i) => el.setAttribute("aria-selected", String(i === index)));

  input.addEventListener("input", rendre);
  input.addEventListener("focus", () => { if (input.value) rendre(); });
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); index = Math.min(resultats.length - 1, index + 1); surligner(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); index = Math.max(0, index - 1); surligner(); }
    else if (e.key === "Enter") { e.preventDefault(); if (resultats[index]) ouvrir(resultats[index]); }
    else if (e.key === "Escape") { input.value = ""; fermer(); input.blur(); }
  });
  box.addEventListener("mousedown", (e) => { const a = e.target.closest("[data-i]"); if (a) { e.preventDefault(); ouvrir(resultats[Number(a.dataset.i)]); } });
  input.addEventListener("blur", () => setTimeout(fermer, 120));
  document.addEventListener("keydown", (e) => {
    const champ = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName);
    if (((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") || (e.key === "/" && !champ)) { e.preventDefault(); input.focus(); input.select(); }
  });
}
