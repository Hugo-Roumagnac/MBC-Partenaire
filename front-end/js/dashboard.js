// dashboard.js — écran « Tableau de bord » (§4.2). Affichage uniquement : les calculs sont dans selectors.js.
import { store, ecrire } from "./store.js";
import { calculerTableauDeBord } from "./selectors.js";
import { aujourdhui } from "./dates.js";
import { formatEuro, formatDate, escapeHtml, showToast, stageSlug } from "./utils.js";
import { ficheHref } from "./router.js";
import { icon } from "./icons.js";

const $ = (id) => document.getElementById(id);
const texte = (id, valeur) => { const el = $(id); if (el) el.textContent = valeur; };
const ID_REGLAGES = () => store.raw.reglages[0]?.id ?? 1; // une seule ligne de réglages

async function enregistrerReglages(patch) {
  try { await ecrire("reglages", ID_REGLAGES(), patch); showToast(); }
  catch (e) { console.error(e); showToast("Échec de l'enregistrement"); }
}

export function initDashboard() {
  // Objectif de la saison : saisi sur l'écran, enregistré à la sortie du champ (§4.2)
  $("season-goal")?.addEventListener("change", (e) => enregistrerReglages({ objectif: Math.max(0, Math.round(Number(e.target.value) || 0)) }));

  // Saisons
  $("settings-form")?.addEventListener("change", (e) => {
    const champ = e.target;
    if (champ.name !== "saison_en_cours" && champ.name !== "saison_precedente") return;
    const v = champ.value.trim();
    if (!/^\d{4}-\d{2}$/.test(v)) { showToast("Valeur invalide : format attendu 2026-27"); renderDashboard(); return; }
    enregistrerReglages({ [champ.name === "saison_en_cours" ? "saisonEnCours" : "saisonPrecedente"]: v });
  });

  // Listes : responsables et catalogue des contreparties (ajout / retrait)
  const ajouterTag = (cle, input) => {
    const v = input.value.trim();
    if (!v) return;
    const liste = store.reglages[cle] || [];
    if (liste.some((x) => x.toLowerCase() === v.toLowerCase())) { showToast("Déjà dans la liste"); return; }
    input.value = "";
    enregistrerReglages({ [cle]: [...liste, v] });
  };
  document.querySelectorAll("[data-add-tag]").forEach((b) => b.addEventListener("click", () => ajouterTag(b.dataset.addTag, b.previousElementSibling)));
  [["owner-new", "responsables"], ["catalog-new", "catalogue"]].forEach(([id, cle]) => $(id)?.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); ajouterTag(cle, e.target); } }));
  $("settings-form")?.addEventListener("click", (e) => {
    const b = e.target.closest("[data-remove-tag]");
    if (!b) return;
    const cle = b.dataset.removeTag, valeur = b.dataset.value;
    enregistrerReglages({ [cle]: (store.reglages[cle] || []).filter((x) => x !== valeur) });
  });
}

const ICONES_TODO = { 1: "wallet", 2: "clock", 3: "receipt", 4: "clock", 5: "alert" };

export function renderDashboard() {
  const t = calculerTableauDeBord({ partenaires: store.partenaires, echeances: store.echeancesSaison, reglages: store.reglages }, aujourdhui());
  const { score, kpis } = t;

  // ----- Score de la saison -----
  texte("score-signed-big", formatEuro(score.signe));
  texte("score-goal-label", score.objectif ? formatEuro(score.objectif) : "objectif à définir");
  texte("score-pct", `${score.objectif ? Math.round((score.signe / score.objectif) * 100) : 0} %`);
  texte("score-signed", formatEuro(score.signe));
  texte("score-cashed", formatEuro(score.encaisse));
  texte("score-negotiation", formatEuro(score.negocie));
  texte("score-remaining", formatEuro(score.reste));
  const goal = $("season-goal");
  if (goal && document.activeElement !== goal) goal.value = score.objectif || "";

  const jauge = document.querySelector("#screen-dashboard .progress");
  jauge?.setAttribute("aria-valuenow", String(score.pctSigne));
  jauge?.setAttribute("aria-valuetext", `${score.pctSigne} % de l'objectif signé, ${score.pctEncaisse} % encaissé`);
  jauge?.querySelector(".progress__bar--signed")?.style.setProperty("--value", String(score.pctSigne));
  jauge?.querySelector(".progress__bar--cashed")?.style.setProperty("--value", String(score.pctEncaisse));

  // ----- 4 indicateurs -----
  texte("kpi-signed", String(kpis.signes.nombre));
  texte("kpi-signed-sub", `dont ${kpis.signes.natureMedia} en nature / média · cotisations ${formatEuro(kpis.signes.cotisations)}`);
  texte("kpi-negotiation", String(kpis.negociation.nombre));
  texte("kpi-negotiation-sub", `${formatEuro(kpis.negociation.montant)} demandés`);
  texte("kpi-late", String(kpis.retard.nombre));
  texte("kpi-late-sub", kpis.retard.nombre ? `${formatEuro(kpis.retard.montant)} à relancer` : "Aucun retard");
  $("kpi-late-card")?.classList.toggle("is-alert", kpis.retard.nombre > 0);
  texte("kpi-delivered", `${kpis.contreparties.livrees} / ${kpis.contreparties.total}`);
  texte("kpi-delivered-sub", `Mécénat ${formatEuro(kpis.contreparties.mecenat)} · CERFA à émettre : ${kpis.contreparties.cerfa}`);

  // ----- À faire : chaque ligne ouvre la fiche -----
  texte("todo-count", String(t.todo.length));
  const todo = $("todo-list");
  if (todo) todo.innerHTML = t.todo.length ? t.todo.map((i) => {
    const ton = i.ton || "info";
    const droite = i.badge ? `<span class="badge badge--${i.ton || "warning"}">${escapeHtml(i.badge)}</span>`
      : i.montant ? `<span class="due--late">${formatEuro(i.montant)}</span><span class="todo__meta">${i.date ? formatDate(i.date) : ""}</span>`
      : `<span class="${i.ton === "danger" ? "due--late" : i.ton === "warning" ? "due--soon" : "muted"}">${i.date && i.date < "9999" ? formatDate(i.date) : ""}</span>`;
    return `<a class="todo__item" href="${ficheHref(i.partenaireId)}">
      <span class="todo__dot todo__dot--${ton}">${icon(ICONES_TODO[i.priorite] || "clock", "icon--sm")}</span>
      <span class="todo__text"><span class="todo__main">${escapeHtml(i.titre)}</span><span class="todo__meta">${escapeHtml(i.meta)}</span></span>
      <span class="todo__side">${droite}</span>
    </a>`;
  }).join("") : `<div class="empty">${icon("check")}Rien à faire dans les 14 prochains jours.</div>`;

  // ----- Pipeline : nombre et montant par étape -----
  const max = Math.max(1, ...t.pipeline.map((l) => l.montant));
  const resume = $("pipeline-summary");
  if (resume) resume.innerHTML = t.pipeline.map((l) => `
    <div class="stage-row" style="--stage-c: var(--stage-${stageSlug(l.etape)})">
      <span class="stage-row__label">${escapeHtml(l.etape)}</span>
      <span class="stage-row__bar"><span class="stage-row__fill" style="--value: ${Math.round((l.montant / max) * 100)}"></span></span>
      <span class="stage-row__nums"><strong>${formatEuro(l.montant)}</strong><span>${l.nombre}</span></span>
    </div>`).join("");

  // ----- Non renouvelés -----
  texte("lost-count", `${t.nonRenouveles.nombre} · ${formatEuro(t.nonRenouveles.montant)}`);
  const perdus = $("lost-list");
  if (perdus) perdus.innerHTML = t.nonRenouveles.liste.length ? t.nonRenouveles.liste.map((v) => `
    <li><a class="lost-item" href="${ficheHref(v.id)}"><strong>${escapeHtml(v.nom)}</strong>
    <span class="muted">${formatEuro(v.montantPrecedent)} en ${escapeHtml(store.reglages.saisonPrecedente)}</span></a></li>`).join("")
    : `<li class="empty">${icon("check")}Aucun partenaire perdu.</li>`;

  // ----- Réglages du club (ne touche pas un champ en cours de saisie) -----
  const champs = { "set-season": store.reglages.saisonEnCours, "set-prev": store.reglages.saisonPrecedente };
  for (const [id, valeur] of Object.entries(champs)) { const el = $(id); if (el && document.activeElement !== el) el.value = valeur ?? ""; }
  const tags = (cle) => (store.reglages[cle] || []).map((x) => `<span class="tag">${escapeHtml(x)}<button type="button" data-remove-tag="${cle}" data-value="${escapeHtml(x)}" aria-label="Retirer ${escapeHtml(x)}">×</button></span>`).join("") || `<span class="faint" style="font-size: var(--text-sm)">Aucun élément</span>`;
  const o = $("owners-tags"); if (o) o.innerHTML = tags("responsables");
  const c = $("catalog-tags"); if (c) c.innerHTML = tags("catalogue");
  texte("catalog-count", String((store.reglages.catalogue || []).length));
}
