// config.js — réglages de déploiement. Aucune donnée secrète : la clé « anon » est publique par conception
// (la sécurité vient des règles RLS côté base, §6 du PDF).
export const CONFIG = {
  MODE: "supabase", // "mock" = localStorage hors ligne ; "supabase" = base réelle
  SUPABASE_URL: "https://xuzlvotivqcyiwjagvmh.supabase.co", // URL du projet Supabase (région européenne, §6)
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh1emx2b3RpdnFjeWl3amFndm1oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI2NzI4MzYsImV4cCI6MjEwODI0ODgzNn0.YaqQZU8IgV0C5oLr2wtmbsoqev_cnKQ-JDaRq1SgoTE" // clé publique « anon »
};
