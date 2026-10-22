// config.js — réglages de déploiement. Aucune donnée secrète : la clé « anon » est publique par conception
// (la sécurité vient des règles RLS côté base, §6 du PDF).
export const CONFIG = {
  MODE: "mock", // "mock" = localStorage hors ligne ; "supabase" = base réelle
  SUPABASE_URL: "https://xuzlvotivqcyiwjagvmh.supabase.co", // URL du projet Supabase (région européenne, §6)
  SUPABASE_ANON_KEY: "REMPLACER" // clé publique « anon »
};
