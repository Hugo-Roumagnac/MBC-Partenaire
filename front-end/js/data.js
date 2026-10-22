/**
 * data.js — charge les fichiers JSON du dossier /mock.
 *
 * Chemins résolus depuis ce module (front-end/js/) :
 *   ../../mock/pipeline.json
 *   ../../mock/partenaires.json
 *   ../../mock/evenements.json
 *
 * Si fetch échoue (file://), on bascule sur fallback-data.js.
 */

import { FALLBACK_PIPELINE, FALLBACK_PARTENAIRES, FALLBACK_EVENEMENTS } from "./fallback-data.js";

const MOCK_DIR = new URL("../../mock/", import.meta.url);

async function loadJson(name, fallback) {
  try {
    const res = await fetch(new URL(name, MOCK_DIR));
    if (!res.ok) throw new Error(res.statusText);
    return await res.json();
  } catch (err) {
    console.warn(`[mock] ${name} indisponible (${err.message}) — fallback JS.`);
    return fallback;
  }
}

export async function loadMockData() {
  const [pipeline, partenaires, evenements] = await Promise.all([
    loadJson("pipeline.json", FALLBACK_PIPELINE),
    loadJson("partenaires.json", FALLBACK_PARTENAIRES),
    loadJson("evenements.json", FALLBACK_EVENEMENTS)
  ]);

  return {
    colonnes: pipeline.colonnes || FALLBACK_PIPELINE.colonnes,
    saison: pipeline.saison || "2026-27",
    partenaires,
    evenements
  };
}
