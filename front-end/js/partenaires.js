// partenaires.js — écran « Partenaires » (§4.4) : recherche plein texte, filtres, tri, création.
import { store, creerPartenaire } from "./store.js";
import { ficheHref, naviguer } from "./router.js";
import { ETAPES_NEGOCIATION, totalValide } from "./selectors.js";
import { formatEuro, formatDate, dueClass, stageSlug, montantAffiche, montantMeta, escapeHtml, showToast, remplirResponsables } from "./utils.js";
import { ouvrirModale, fermerModale } from "./modal.js";

// Filtres d'état (§4.4)
const FILTERS = {
  actifs: (p) => p.etape !== "Archivé" && p.etape !== "Perdu",
  negociation: (p) => ETAPES_NEGOCIATION.includes(p.etape),
  signes: (p) => p.etape === "Signé",
  prospects: (p) => p.etape === "Prospect" || p.etape === "Contacté",
  perdus: (p) => p.etape === "Perdu",
  archives: (p) => p.etape === "Archivé",
  tous: () => true
};

let currentFilter = "actifs", query = "", owner = "", sortKey = "nom", sortDir = 1;
const $ = (id) => document.getElementById(id);

// Normalise pour comparer sans accents ni casse ni ponctuation (détection des doublons : « une seule fiche par entreprise »)
const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const cleNom = (s) => norm(s).replace(/\b(sarl|sas|sasu|eurl|sa|ets|etablissements)\b/g, "").replace(/[^a-z0-9]/g, "");

export function ouvrirNouveauPartenaire(nom = "") {
  const modal = $("modal-new-partner"), form = $("form-new-partner");
  form.reset();
  remplirResponsables($("np-resp"));
  $("np-duplicate").hidden = true;
  if (nom) form.nom.value = nom;
  ouvrirModale(modal);
}

export function initPartenaires() {
  const search = $("partner-search"), ownerSel = $("filter-owner");
  const chips = document.querySelector("#screen-partenaires .chips");
  const thead = document.querySelector("#screen-partenaires thead");

  search?.addEventListener("input", () => { query = norm(search.value.trim()); renderTable(); });
  ownerSel?.addEventListener("change", () => { owner = ownerSel.value; renderTable(); });

  chips?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-filter]");
    if (!btn) return;
    currentFilter = btn.dataset.filter;
    chips.querySelectorAll(".chip").forEach((c) => { c.classList.toggle("chip--active", c === btn); c.setAttribute("aria-pressed", String(c === btn)); });
    renderTable();
  });

  thead?.querySelectorAll("th[data-sort]").forEach((th) => {
    th.tabIndex = 0;
    const trier = () => {
      const key = th.dataset.sort;
      if (sortKey === key) sortDir *= -1; else { sortKey = key; sortDir = key === "montant" || key === "encaisse" ? -1 : 1; }
      thead.querySelectorAll("th").forEach((h) => h.removeAttribute("aria-sort"));
      th.setAttribute("aria-sort", sortDir > 0 ? "ascending" : "descending");
      renderTable();
    };
    th.addEventListener("click", trier);
    th.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); trier(); } });
  });

  // Clic sur une ligne → ouvre la fiche
  $("partners-tbody")?.addEventListener("click", (e) => {
    if (e.target.closest("a")) return;
    const tr = e.target.closest("tr[data-partner-id]");
    if (tr) naviguer({ ficheId: tr.dataset.partnerId });
  });

  $("btn-new-partner")?.addEventListener("click", () => ouvrirNouveauPartenaire());

  // Modale de création
  const form = $("form-new-partner");
  const alerte = $("np-duplicate");
  const doublon = (nom) => { const k = cleNom(nom); return k ? store.partenaires.find((p) => cleNom(p.nom) === k) : null; };
  form.nom.addEventListener("input", () => {
    const d = doublon(form.nom.value);
    alerte.hidden = !d;
    if (d) alerte.innerHTML = `Une fiche « <a href="${ficheHref(d.id)}" data-close-dup>${escapeHtml(d.nom)}</a> » existe déjà (${escapeHtml(d.etape)}). Une seule fiche par entreprise.`;
  });
  alerte.addEventListener("click", (e) => { if (e.target.closest("[data-close-dup]")) fermerModale($("modal-new-partner")); });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const nom = form.nom.value.trim();
    if (!nom) { form.nom.focus(); showToast("Le nom est obligatoire", { erreur: true }); return; }
    const d = doublon(nom);
    if (d) { alerte.hidden = false; form.nom.focus(); return; }
    const bouton = form.querySelector("[type=submit]");
    bouton.disabled = true;
    try {
      const p = await creerPartenaire({
        nom,
        secteur: form.secteur.value.trim(),
        etape: form.etape.value || "Prospect",
        type: form.type.value || "Sponsoring",
        responsable: form.responsable.value,
        montantDemande: Math.max(0, Number(form.montant.value) || 0),
        prochaineActionDate: form.actionDate.value || null,
        prochaineActionTexte: form.actionTexte.value.trim()
      });
      fermerModale($("modal-new-partner"));
      showToast("Partenaire créé");
      naviguer({ ficheId: p.id });
    } catch (err) { console.error(err); showToast("Échec de la création"); }
    finally { bouton.disabled = false; }
  });
}

function filtered(fn = FILTERS[currentFilter] || FILTERS.tous) {
  return store.partenaires.filter((p) => {
    if (!fn(p)) return false;
    if (owner === "none" && p.responsable) return false;
    if (owner && owner !== "none" && p.responsable !== owner) return false;
    if (!query) return true;
    const blob = norm([p.nom, p.secteur, p.type, p.responsable, p.notes, p.etape, ...(p.contacts || []).map((c) => `${c.nom} ${c.fonction} ${c.email} ${c.tel}`)].join(" "));
    return blob.includes(query);
  });
}

function valueForSort(p, key) {
  if (key === "montant") return montantAffiche(p);
  if (key === "encaisse") return Number(p.encaisse) || 0;
  if (key === "contreparties") return p.contrepartiesTotal ? p.contrepartiesLivrees / p.contrepartiesTotal : -1;
  if (key === "action") return p.prochaineActionDate || "9999";
  if (key === "etape") return ["Prospect", "Contacté", "RDV", "Proposition", "Négociation", "Signé", "Perdu", "Archivé"].indexOf(p.etape);
  return p[key] || "";
}

function sorted(list) {
  return [...list].sort((a, b) => {
    const va = valueForSort(a, sortKey), vb = valueForSort(b, sortKey);
    const r = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb), "fr");
    return r * sortDir || a.nom.localeCompare(b.nom, "fr");
  });
}

const meter = (pct, txt) => `<span class="meter"><span class="meter__track"><span class="meter__fill" style="--value:${Math.max(0, Math.min(100, Math.round(pct)))}"></span></span><span class="meter__text">${txt}</span></span>`;

export function renderTable() {
  const tbody = $("partners-tbody");
  if (!tbody) return;
  remplirResponsables($("filter-owner"), { tous: true, sans: true });

  // Compteurs sur chaque filtre (avec recherche et responsable appliqués)
  document.querySelectorAll("#screen-partenaires .chip").forEach((c) => { const n = c.querySelector(".chip__count"); if (n) n.textContent = filtered(FILTERS[c.dataset.filter]).length; });

  const rows = sorted(filtered());
  const count = $("partners-count");
  if (count) count.textContent = `${rows.length} fiche${rows.length > 1 ? "s" : ""} affichée${rows.length > 1 ? "s" : ""} sur ${store.partenaires.length}`;

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-cell">Aucun partenaire ne correspond à ces critères.${query ? ` <a href="#" data-quick="new-partner">Créer « ${escapeHtml(document.getElementById("partner-search").value.trim())} »</a>` : ""}</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map((p) => {
    const amount = montantAffiche(p), meta = montantMeta(p), total = totalValide(p);
    const encaisse = p.etape === "Signé" && total > 0 ? meter((p.encaisse / total) * 100, `${formatEuro(p.encaisse)} / ${formatEuro(total)}`) : '<span class="faint">—</span>';
    const cp = p.contrepartiesTotal ? meter((p.contrepartiesLivrees / p.contrepartiesTotal) * 100, `${p.contrepartiesLivrees} / ${p.contrepartiesTotal} livrées`) : '<span class="faint">—</span>';
    const due = dueClass(p.prochaineActionDate);
    const action = p.prochaineActionTexte || p.prochaineActionDate
      ? `<span class="action-cell">${p.prochaineActionDate ? `<span class="${due || ""}">${formatDate(p.prochaineActionDate)}</span>` : ""}<span class="action-cell__text" title="${escapeHtml(p.prochaineActionTexte)}">${escapeHtml(p.prochaineActionTexte || "")}</span></span>`
      : (ETAPES_NEGOCIATION.includes(p.etape) ? '<span class="badge badge--danger">Aucune action</span>' : '<span class="faint">—</span>');
    return `
      <tr data-partner-id="${escapeHtml(p.id)}" class="partners-row">
        <td class="td--main">
          <a class="link-fiche" href="${ficheHref(p.id)}">${escapeHtml(p.nom)}</a>
          <span class="table__sub">${escapeHtml([p.type, p.secteur].filter(Boolean).join(" · "))}${p.premierContact ? ` · 1er contact ${formatDate(p.premierContact)}` : ""}</span>
        </td>
        <td data-label="Étape"><span class="badge badge--${stageSlug(p.etape)}">${escapeHtml(p.etape)}</span></td>
        <td data-label="Responsable">${p.responsable ? escapeHtml(p.responsable) : '<span class="faint">—</span>'}</td>
        <td data-label="Montant" class="num"><strong>${amount ? formatEuro(amount) : "—"}</strong>${meta ? `<span class="table__sub">${escapeHtml(meta)}</span>` : ""}</td>
        <td data-label="Encaissé / prévu">${encaisse}</td>
        <td data-label="Contreparties">${cp}</td>
        <td data-label="Prochaine action">${action}</td>
      </tr>`;
  }).join("");
}
