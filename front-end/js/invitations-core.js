// invitations-core.js — règles pures des invitations (aucune dépendance au DOM) : testées par `npm test`.
// Les mêmes règles sont appliquées côté serveur par supabase/functions/invitations/index.ts.

export const DUREE_INVITATION_HEURES = 168; // 7 jours (côté serveur : variable INVITATION_TTL_HOURS)
export const MDP_MIN = 8;  // §6 du cahier des charges
export const MDP_MAX = 72; // limite de bcrypt

export const normaliserEmail = (e) => String(e ?? "").trim().toLowerCase();
export const emailValide = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 254;

// Jeton cryptographique : 256 bits aléatoires en base64url (43 caractères).
export function genererJeton() {
  const octets = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...octets)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export const jetonPlausible = (t) => typeof t === "string" && /^[A-Za-z0-9_-]{32,128}$/.test(t);

// Empreinte SHA-256 (hex) : seule forme du jeton conservée en base.
export async function empreinte(jeton) {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(jeton));
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Statut réel d'une invitation à l'instant `maintenant` (une « pending » périmée est « expired »).
export function statutEffectif(inv, maintenant = new Date()) {
  if (inv.statut === "pending" && new Date(inv.expireLe) <= maintenant) return "expired";
  return inv.statut;
}

export const LIBELLES_STATUT = {
  pending: { libelle: "En attente", ton: "info" },
  accepted: { libelle: "Acceptée", ton: "success" },
  expired: { libelle: "Expirée", ton: "warning" },
  revoked: { libelle: "Remplacée", ton: "neutral" }
};

// Contrôle de l'adresse à inviter. Renvoie un message d'erreur, ou null si tout va bien.
export function controlerEmailInvite(email, emailsMembres = []) {
  if (!email) return "Saisissez l'adresse e-mail à inviter.";
  if (!emailValide(email)) return "Adresse e-mail invalide.";
  if (emailsMembres.map(normaliserEmail).includes(email)) return "Cette adresse est déjà associée à un compte.";
  return null;
}

// Contrôle du formulaire d'inscription. Renvoie { champ, message } ou null.
export function controlerInscription({ prenom, nom, motDePasse, confirmation }) {
  if (!String(prenom ?? "").trim()) return { champ: "prenom", message: "Renseignez votre prénom." };
  if (!String(nom ?? "").trim()) return { champ: "nom", message: "Renseignez votre nom." };
  if (String(motDePasse ?? "").length < MDP_MIN) return { champ: "password", message: `Le mot de passe doit contenir au moins ${MDP_MIN} caractères.` };
  if (String(motDePasse).length > MDP_MAX) return { champ: "password", message: `Le mot de passe ne doit pas dépasser ${MDP_MAX} caractères.` };
  if (motDePasse !== confirmation) return { champ: "confirm", message: "Les deux mots de passe diffèrent." };
  return null;
}

// Messages d'erreur affichés pour un jeton refusé.
export const MESSAGES_JETON = {
  invalide: "Ce lien d'invitation n'est pas valide. Vérifiez que vous avez copié l'adresse complète reçue par e-mail.",
  expiree: "Cette invitation a expiré. Demandez à un membre de l'équipe de vous en renvoyer une.",
  utilisee: "Cette invitation a déjà été utilisée. Connectez-vous avec votre compte.",
  revoquee: "Cette invitation a été remplacée par une plus récente. Utilisez le dernier e-mail reçu."
};
