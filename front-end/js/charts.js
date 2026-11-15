// charts.js — v6 : graphiques épurés du tableau de bord (SVG et HTML générés ici, calculs dans selectors.js).
// Aucune bibliothèque : des barres en HTML/CSS et des courbes de tendance en SVG.
// Infobulles : chaque barre est focusable (clavier) et porte son détail ; l'infobulle s'affiche au survol
// ou au focus, en CSS seulement (voir .chart-tip dans theme-v6.css). Les couleurs viennent des variables CSS,
// donc les graphiques suivent le thème clair / sombre sans être redessinés.
import { formatEuro, escapeHtml } from "./utils.js";

// Courbe de tendance (sparkline) : polyligne grise, dernier point marqué. vide → "" (rien n'est affiché).
export function sparkline(valeurs = [], { largeur = 96, hauteur = 28, libelle = "" } = {}) {
  if (!valeurs || valeurs.length < 2) return "";
  const min = Math.min(...valeurs), max = Math.max(...valeurs), plage = max - min || 1, marge = 3;
  const pts = valeurs.map((v, i) => [((i / (valeurs.length - 1)) * (largeur - marge * 2) + marge).toFixed(1), (hauteur - marge - ((v - min) / plage) * (hauteur - marge * 2)).toFixed(1)]);
  const [lx, ly] = pts[pts.length - 1];
  return `<svg class="spark" width="${largeur}" height="${hauteur}" viewBox="0 0 ${largeur} ${hauteur}" role="img" aria-label="${escapeHtml(libelle)}">
    <polyline points="${pts.map((p) => p.join(",")).join(" ")}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${lx}" cy="${ly}" r="2.6" class="spark__dot"/></svg>`;
}

// Échéancier de la saison : une barre empilée par mois (encaissé / en retard / à venir), repère « Aujourd'hui ».
export function graphiqueEcheancier(data) {
  if (!data.mois.length || data.max <= 0) {
    return `<div class="empty">Aucune échéance datée cette saison. Créez un échéancier depuis la fiche d'un partenaire signé.</div>`;
  }
  const echelle = arrondiEchelle(data.max);
  const h = (v) => `${Math.max(0, (v / echelle) * 100).toFixed(2)}%`;
  // Colonne « Sans date / Hors saison » en bout d'axe, pour que les totaux du graphique soient complets
  const a = data.autres;
  const colonnes = [...data.mois];
  if (a && a.nombre > 0) {
    const court = a.horsSaison === 0 ? "Sans date" : a.sansDate === 0 ? "Hors saison" : "Autres";
    const long = a.horsSaison === 0 ? `Sans date (${a.sansDate} échéance${a.sansDate > 1 ? "s" : ""})`
      : a.sansDate === 0 ? `Hors saison (${a.horsSaison} échéance${a.horsSaison > 1 ? "s" : ""} datée${a.horsSaison > 1 ? "s" : ""} hors sept.–août)`
      : `${a.sansDate} sans date, ${a.horsSaison} hors saison`;
    colonnes.push({ ...a, court, long, autres: true });
  }
  const barres = colonnes.map((m) => {
    const detail = `${m.long} : prévu ${formatEuro(m.prevu)}, encaissé ${formatEuro(m.encaisse)}, en retard ${formatEuro(m.retard)}, à venir ${formatEuro(m.aVenir)}`;
    return `<div class="chart-col${m.enCours ? " chart-col--now" : ""}${m.autres ? " chart-col--autres" : ""}" tabindex="0" role="img" aria-label="${escapeHtml(detail)}">
      <span class="chart-tip" aria-hidden="true"><strong>${escapeHtml(m.long)}</strong>
        <span class="chart-tip__row"><i class="sw sw--prevu"></i>Prévu <b class="mono">${formatEuro(m.prevu)}</b></span>
        <span class="chart-tip__row"><i class="sw sw--encaisse"></i>Encaissé <b class="mono">${formatEuro(m.encaisse)}</b></span>
        <span class="chart-tip__row"><i class="sw sw--retard"></i>En retard <b class="mono">${formatEuro(m.retard)}</b></span>
        <span class="chart-tip__row"><i class="sw sw--avenir"></i>À venir <b class="mono">${formatEuro(m.aVenir)}</b></span></span>
      <span class="chart-bar">
        <span class="chart-bar__seg chart-bar__seg--avenir" style="height:${h(m.aVenir)}"></span>
        <span class="chart-bar__seg chart-bar__seg--retard" style="height:${h(m.retard)}"></span>
        <span class="chart-bar__seg chart-bar__seg--encaisse" style="height:${h(m.encaisse)}"></span>
      </span>
      <span class="chart-col__lbl">${m.autres ? `<span class="chart-col__lbl-long">${escapeHtml(m.court)}</span><span class="chart-col__lbl-court">${m.court === "Sans date" ? "s. d." : "autres"}</span>` : escapeHtml(m.court)}</span>
    </div>`;
  }).join("");
  const pos = data.aujourdhuiPos == null ? null : (data.aujourdhuiPos * data.mois.length) / colonnes.length; // la colonne « autres » décale l'axe
  const repere = pos == null ? "" : `<span class="chart-now" style="left:${(pos * 100).toFixed(2)}%" aria-hidden="true"><span>Aujourd'hui</span></span>`;
  return `<div class="chart">
      <div class="chart__axis mono" aria-hidden="true"><span>${formatCourt(echelle)}</span><span>${formatCourt(echelle / 2)}</span><span>0</span></div>
      <div class="chart__plot"><div class="chart__cols" style="--n:${colonnes.length}">${barres}</div>${repere}</div>
    </div>`;
}

// Pipeline : une barre empilée (montant par étape) + la liste détaillée (gérée par dashboard.js).
export function barreEmpilee(lignes) {
  const total = lignes.reduce((t, l) => t + Math.max(0, l.montant), 0);
  if (!total) return "";
  return `<div class="pstack" role="img" aria-label="Répartition des montants par étape">${lignes.filter((l) => l.montant > 0).map((l) =>
    `<span class="pstack__seg" style="flex:${l.montant};--stage-c:var(--stage-${l.slug})" title="${escapeHtml(`${l.etape} : ${formatEuro(l.montant)}`)}"></span>`).join("")}</div>`;
}

// Conversion : un palier par étape, barre proportionnelle au nombre de fiches.
export function graphiqueConversion(c) {
  if (!c.total) return `<p class="muted" style="font-size:var(--text-sm)">Aucune fiche pour l'instant.</p>`;
  return `<div class="funnel">${c.etapes.map((e, i) => `
    <div class="funnel__row" tabindex="0" role="img" aria-label="${escapeHtml(`${e.nom} : ${e.nombre} fiche${e.nombre > 1 ? "s" : ""} (${e.pct} %)`)}">
      <span class="funnel__lbl">${escapeHtml(e.nom)}</span>
      <span class="funnel__track"><span class="funnel__fill${i === c.etapes.length - 1 ? " funnel__fill--fin" : ""}" style="width:${e.pct}%"></span></span>
      <span class="funnel__n mono">${e.nombre}</span>
    </div>`).join("")}</div>`;
}

// Barres horizontales simples (signé par responsable).
export function barresHorizontales(lignes, { vide = "Aucun partenaire signé." } = {}) {
  if (!lignes.length) return `<p class="muted" style="font-size:var(--text-sm)">${escapeHtml(vide)}</p>`;
  const max = Math.max(...lignes.map((l) => l.montant), 1);
  return `<div class="hbars">${lignes.map((l) => `
    <div class="hbars__row">
      <span class="hbars__top"><span>${escapeHtml(l.libelle)}</span><strong class="mono">${formatEuro(l.montant)}</strong></span>
      <span class="hbars__track"><span class="hbars__fill" style="width:${((l.montant / max) * 100).toFixed(1)}%"></span></span>
    </div>`).join("")}</div>`;
}

// Échelle « ronde » au-dessus du maximum (1 600 plutôt que 1 575).
function arrondiEchelle(max) {
  const p = 10 ** Math.floor(Math.log10(max)), pas = [1, 2, 2.5, 5, 10].map((k) => k * p);
  return pas.find((x) => x >= max) || max;
}
const formatCourt = (v) => (v >= 1000 ? `${(v / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} k` : String(Math.round(v)));
