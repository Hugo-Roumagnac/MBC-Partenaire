// supabase/functions/invitations/index.ts — Edge Function (Deno) des invitations par e-mail.
//
// Une seule fonction, trois actions (corps JSON { action, ... }) :
//   • "send"   — un MEMBRE connecté invite une adresse e-mail      (jeton d'accès Supabase requis)
//   • "check"  — la page d'inscription vérifie un jeton             (public)
//   • "accept" — la page d'inscription crée le compte               (public, protégé par le jeton)
//
// Le mot de passe est confié à Supabase Auth, qui le stocke haché avec bcrypt.
// Déploiement : voir supabase/README-invitations.md
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.16"; // envoi SMTP (Gmail…)

// ---------- Configuration (variables d'environnement / secrets) ----------
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;                       // fourni automatiquement
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;      // fourni automatiquement
const SITE_URL = (Deno.env.get("SITE_URL") ?? "").replace(/\/$/, "");     // ex. https://mbc-partenaires.netlify.app
// Envoi des e-mails : SMTP (ex. Gmail) si SMTP_USER est défini, sinon Resend.
const SMTP_HOST = Deno.env.get("SMTP_HOST") ?? "smtp.gmail.com";
const SMTP_PORT = Number(Deno.env.get("SMTP_PORT") ?? "465");          // 465 (SSL) : Supabase bloque 25 et 587
const SMTP_USER = Deno.env.get("SMTP_USER") ?? "";                    // ex. mbc.partenaires@gmail.com
const SMTP_PASS = (Deno.env.get("SMTP_PASS") ?? "").replace(/\s+/g, ""); // mot de passe d'application Google (16 lettres)
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const MAIL_FROM = Deno.env.get("INVITE_FROM_EMAIL") ?? (SMTP_USER ? `MBC Partenaires <${SMTP_USER}>` : "MBC Partenaires <onboarding@resend.dev>");
const TTL_HEURES = Number(Deno.env.get("INVITATION_TTL_HOURS") ?? "168"); // 7 jours par défaut
const MAX_PAR_HEURE = Number(Deno.env.get("INVITATION_MAX_PER_HOUR") ?? "20");
const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") ?? (SITE_URL || "*");

const admin: SupabaseClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ---------- Utilitaires ----------
const CORS = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};
const json = (corps: unknown, status = 200) =>
  new Response(JSON.stringify(corps), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const echec = (code: string, message: string, status = 400) => json({ ok: false, code, message }, status);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const normEmail = (e: unknown) => String(e ?? "").trim().toLowerCase();
const echapper = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

function genererJeton(): string { // 256 bits aléatoires, encodés en base64url (43 caractères)
  const octets = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...octets)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function empreinte(jeton: string): Promise<string> { // SHA-256 hex : seule forme stockée en base
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(jeton));
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
const jetonPlausible = (t: unknown) => typeof t === "string" && /^[A-Za-z0-9_-]{32,128}$/.test(t);

// ---------- Lecture d'une invitation à partir du jeton ----------
type Etat = { ok: true; id: string; email: string; expireLe: string } | { ok: false; code: string; message: string };
async function lireInvitation(jeton: unknown): Promise<Etat> {
  const invalide = { ok: false as const, code: "invalide", message: "Ce lien d'invitation n'est pas valide." };
  if (!jetonPlausible(jeton)) return invalide;
  const { data: inv } = await admin.from("invitations").select("id, email, statut, expire_le")
    .eq("token_hash", await empreinte(jeton as string)).maybeSingle();
  if (!inv) return invalide;
  if (inv.statut === "accepted") return { ok: false, code: "utilisee", message: "Cette invitation a déjà été utilisée. Connectez-vous avec votre compte." };
  if (inv.statut === "revoked") return { ok: false, code: "revoquee", message: "Cette invitation a été remplacée par une plus récente. Utilisez le dernier e-mail reçu." };
  if (inv.statut === "expired" || new Date(inv.expire_le) <= new Date()) {
    if (inv.statut === "pending") await admin.from("invitations").update({ statut: "expired" }).eq("id", inv.id);
    return { ok: false, code: "expiree", message: "Cette invitation a expiré. Demandez à un membre de l'équipe de vous en renvoyer une." };
  }
  return { ok: true, id: inv.id, email: inv.email, expireLe: inv.expire_le };
}

// ---------- E-mail ----------
// Message volontairement simple et personnel (texte court, lien classique, pas de gros bouton) :
// c'est ce qui limite le plus le classement en spam pour un envoi depuis une adresse Gmail.
async function envoyerEmail(destinataire: string, lien: string, invitePar: { nom: string; email: string }, expireLe: Date) {
  const jours = Math.max(1, Math.round((expireLe.getTime() - Date.now()) / 86400_000));
  const nomComplet = invitePar.nom || invitePar.email;
  const prenom = nomComplet.split(" ")[0];
  const sujet = `${prenom} vous invite sur MBC Partenaires`;

  const text = `Bonjour,

${nomComplet} vous a ajouté(e) à l'outil de suivi des partenaires du club (MBC Partenaires), utilisé par l'équipe pour suivre les partenaires, les contrats et les événements.

Pour créer votre compte, ouvrez ce lien :
${lien}

Vous choisirez simplement votre nom et votre mot de passe. Le lien est personnel et reste valable ${jours} jours.

Une question ? Répondez directement à cet e-mail, ${prenom} recevra votre message.

À bientôt,
${nomComplet}
MBC Partenaires`;

  const p = (t: string) => `<p style="margin:0 0 14px">${t}</p>`;
  const html = `<!doctype html><html lang="fr"><body style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#222">
${p("Bonjour,")}
${p(`${echapper(nomComplet)} vous a ajouté(e) à l'outil de suivi des partenaires du club (MBC Partenaires), utilisé par l'équipe pour suivre les partenaires, les contrats et les événements.`)}
${p(`Pour créer votre compte, ouvrez ce lien :<br><a href="${lien}">${lien}</a>`)}
${p(`Vous choisirez simplement votre nom et votre mot de passe. Le lien est personnel et reste valable ${jours} jours.`)}
${p(`Une question ? Répondez directement à cet e-mail, ${echapper(prenom)} recevra votre message.`)}
${p(`À bientôt,<br>${echapper(nomComplet)}<br>MBC Partenaires`)}
</body></html>`;
  const expediteur = SMTP_USER ? `"${nomComplet.replace(/"/g, "")} (MBC Partenaires)" <${SMTP_USER}>` : MAIL_FROM;
  const repondreA = invitePar.email;

  if (SMTP_USER) { // ----- SMTP (Gmail) -----
    const transport = nodemailer.createTransport({
      host: SMTP_HOST, port: SMTP_PORT, secure: SMTP_PORT === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
    await transport.sendMail({ from: Deno.env.get("INVITE_FROM_EMAIL") ?? expediteur, replyTo: repondreA, to: destinataire, subject: sujet, html, text });
    return;
  }

  // ----- Resend -----
  if (!RESEND_API_KEY) throw new Error("Aucun service d'e-mail configuré (SMTP_USER ou RESEND_API_KEY).");
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: MAIL_FROM, reply_to: repondreA, to: [destinataire], subject: sujet, html, text }),
  });
  if (!r.ok) throw new Error(`Resend ${r.status} : ${await r.text()}`);
}

// ---------- Action « send » ----------
async function envoyer(req: Request, corps: Record<string, unknown>) {
  // 1) Appelant authentifié ET membre
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: { user } } = await admin.auth.getUser(jwt);
  if (!user?.email) return echec("non-connecte", "Session expirée : reconnectez-vous.", 401);
  const moi = user.email.toLowerCase();
  const { data: membre } = await admin.from("membres").select("email, nom").eq("email", moi).maybeSingle();
  if (!membre) return echec("non-autorise", "Seuls les membres de l'équipe peuvent inviter.", 403);

  // 2) Adresse valide et libre
  const email = normEmail(corps.email);
  if (!EMAIL_RE.test(email) || email.length > 254) return echec("email-invalide", "Adresse e-mail invalide.");
  const { data: dejaInscrit, error: eRpc } = await admin.rpc("email_deja_inscrit", { p_email: email });
  if (eRpc) throw eRpc;
  if (dejaInscrit) return echec("deja-inscrit", "Cette adresse est déjà associée à un compte.", 409);

  // 3) Limite anti-abus : N invitations par membre et par heure
  const { count } = await admin.from("invitations").select("id", { count: "exact", head: true })
    .eq("invite_par", moi).gte("cree_le", new Date(Date.now() - 3600_000).toISOString());
  if ((count ?? 0) >= MAX_PAR_HEURE) return echec("trop-de-demandes", "Trop d'invitations envoyées. Réessayez dans une heure.", 429);

  // 4) Nouvelle invitation (l'éventuelle invitation en attente pour cette adresse est révoquée)
  await admin.rpc("expirer_invitations");
  await admin.from("invitations").update({ statut: "revoked" }).eq("email", email).eq("statut", "pending");
  const jeton = genererJeton();
  const expireLe = new Date(Date.now() + TTL_HEURES * 3600_000);
  const { data: inv, error: eIns } = await admin.from("invitations")
    .insert({ email, token_hash: await empreinte(jeton), invite_par: moi, expire_le: expireLe.toISOString() })
    .select("id, email, statut, invite_par, expire_le, cree_le").single();
  if (eIns) throw eIns;

  // 5) E-mail ; en cas d'échec, l'invitation est supprimée pour ne pas laisser de jeton orphelin
  const lien = `${SITE_URL}/register?token=${encodeURIComponent(jeton)}`;
  try {
    await envoyerEmail(email, lien, { nom: membre.nom || "", email: moi }, expireLe);
  } catch (e) {
    console.error(e);
    await admin.from("invitations").delete().eq("id", inv.id);
    return echec("envoi-impossible", "L'e-mail n'a pas pu être envoyé. Vérifiez l'adresse ou réessayez plus tard.", 502);
  }
  return json({ ok: true, invitation: inv });
}

// ---------- Action « check » ----------
async function verifier(corps: Record<string, unknown>) {
  const etat = await lireInvitation(corps.token);
  if (!etat.ok) return json(etat, 200); // 200 : erreur « métier » affichée telle quelle par la page
  return json({ ok: true, email: etat.email, expireLe: etat.expireLe });
}

// ---------- Action « accept » ----------
async function accepter(corps: Record<string, unknown>) {
  const prenom = String(corps.prenom ?? "").trim().slice(0, 80);
  const nom = String(corps.nom ?? "").trim().slice(0, 80);
  const motDePasse = String(corps.motDePasse ?? "");
  if (!prenom || !nom) return echec("champs-manquants", "Renseignez votre prénom et votre nom.");
  if (motDePasse.length < 8 || motDePasse.length > 72) return echec("mot-de-passe", "Le mot de passe doit contenir entre 8 et 72 caractères."); // 72 = limite bcrypt

  const etat = await lireInvitation(corps.token);
  if (!etat.ok) return json(etat, 200);

  // Réservation atomique du jeton : deux soumissions simultanées ne créent pas deux comptes.
  const { data: reserve } = await admin.from("invitations")
    .update({ statut: "accepted", accepte_le: new Date().toISOString() })
    .eq("id", etat.id).eq("statut", "pending").gt("expire_le", new Date().toISOString())
    .select("id").maybeSingle();
  if (!reserve) return json({ ok: false, code: "utilisee", message: "Cette invitation a déjà été utilisée." });
  const annulerReservation = () => admin.from("invitations").update({ statut: "pending", accepte_le: null }).eq("id", etat.id);

  // Création du compte (mot de passe haché en bcrypt par Supabase Auth ; e-mail déjà prouvé par le lien)
  const { data: cree, error: eUser } = await admin.auth.admin.createUser({
    email: etat.email, password: motDePasse, email_confirm: true, user_metadata: { prenom, nom },
  });
  if (eUser || !cree.user) {
    await annulerReservation();
    const deja = /already|registered|exists/i.test(eUser?.message ?? "");
    return deja
      ? echec("deja-inscrit", "Un compte existe déjà pour cette adresse. Connectez-vous.", 409)
      : echec("creation-impossible", eUser?.message?.includes("assword") ? "Mot de passe refusé : choisissez-en un plus robuste." : "Création du compte impossible.", 400);
  }

  // Ajout à la liste des membres (donne l'accès à l'application)
  const { error: eMembre } = await admin.from("membres").upsert({ email: etat.email, nom: `${prenom} ${nom}` }, { onConflict: "email" });
  if (eMembre) {
    console.error(eMembre);
    await admin.auth.admin.deleteUser(cree.user.id);
    await annulerReservation();
    return echec("creation-impossible", "Création du compte impossible.", 500);
  }
  return json({ ok: true, email: etat.email });
}

// ---------- Routage ----------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return echec("methode", "Méthode non autorisée.", 405);
  let corps: Record<string, unknown>;
  try { corps = await req.json(); } catch { return echec("json", "Requête invalide."); }
  try {
    switch (corps.action) {
      case "send": return await envoyer(req, corps);
      case "check": return await verifier(corps);
      case "accept": return await accepter(corps);
      default: return echec("action", "Action inconnue.");
    }
  } catch (e) {
    console.error(e);
    return echec("erreur-serveur", "Erreur inattendue, réessayez plus tard.", 500);
  }
});
