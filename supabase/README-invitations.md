# Invitations par e-mail — mise en service

Les nouveaux membres ne peuvent plus être ajoutés « à la main » uniquement : n'importe quel membre connecté peut inviter une adresse e-mail. L'invité reçoit un lien personnel, valable 7 jours et utilisable une seule fois, qui ouvre la page de création de compte.

```
Membre connecté ──(Inviter un membre)──▶ Edge Function « invitations » (send)
                                          ├─ vérifie : membre ? e-mail valide ? pas déjà inscrit ?
                                          ├─ génère un jeton 256 bits, stocke son empreinte SHA-256
                                          └─ envoie l'e-mail (Resend) : https://site/register?token=…
Invité ──(clic)──▶ register.html ──(check)──▶ e-mail pré-rempli (non modifiable)
       ──(formulaire)──(accept)──▶ compte Supabase Auth (mot de passe haché bcrypt)
                                   + ligne dans « membres » + invitation « accepted »
                                   ──▶ connexion automatique ──▶ app.html
```

## Fichiers ajoutés / modifiés

| Fichier | Rôle |
|---|---|
| `supabase/migrations/20261023120000_invitations.sql` | **Nouveau.** Table `invitations`, droits, RLS, fonctions SQL |
| `supabase/functions/invitations/index.ts` | **Nouveau.** Edge Function : actions `send`, `check`, `accept` |
| `supabase/config.toml` | **Nouveau.** Désactive la vérification JWT de la passerelle pour cette fonction (elle vérifie elle-même) |
| `register.html`, `front-end/js/register.js` | **Nouveau.** Page de création de compte |
| `front-end/js/invitations.js` | **Nouveau.** Fenêtre « Inviter un membre » + liste des invitations |
| `front-end/js/invitations-core.js` | **Nouveau.** Règles pures (jeton, validation), testées |
| `front-end/js/api.js` | Fonctions `envoyerInvitation`, `listerInvitations`, `verifierInvitation`, `accepterInvitation` (mock + Supabase) |
| `app.html`, `front-end/js/app.js`, `front-end/js/icons.js`, CSS | Entrée de menu, fenêtre modale, icônes, styles |
| `index.html`, `front-end/js/login.js` | Texte « accès sur invitation », message après création de compte |
| `netlify.toml` | Réécriture `/register` → `register.html` |
| `tests/invitations.test.mjs`, `tests/e2e/invitations.cjs` | Tests unitaires et parcours navigateur |

## Structure de la table `invitations`

| Colonne | Type | Description |
|---|---|---|
| `id` | uuid (PK) | Identifiant |
| `email` | text | Adresse invitée, en minuscules |
| `token_hash` | text, unique | **Empreinte SHA-256 du jeton** — le jeton lui-même n'est jamais stocké |
| `statut` | text | `pending`, `accepted`, `expired`, `revoked` (remplacée par un renvoi) |
| `invite_par` | text | E-mail du membre qui a invité |
| `expire_le` | timestamptz | Date d'expiration (7 jours par défaut) |
| `cree_le` / `accepte_le` | timestamptz | Horodatages |

Une seule invitation `pending` par adresse (index unique partiel). Les membres connectés peuvent **lire** la table (sauf `token_hash`) ; toutes les écritures passent par l'Edge Function.

---

## Étapes pas à pas

### 1. Créer la table (une fois)

Supabase → **SQL Editor** → coller le contenu de `supabase/migrations/20261023120000_invitations.sql` → **Run**.
(Le script peut être relancé sans risque.)

> Prérequis : `supabase/schema.sql` doit avoir été exécuté avant (table `membres`, fonction `est_membre()`).

### 2. Créer un compte d'envoi d'e-mails (Resend)

1. Créez un compte sur [resend.com](https://resend.com) (offre gratuite : 3 000 e-mails/mois).
2. **Domains → Add domain** : ajoutez le domaine du club et créez chez votre hébergeur DNS les enregistrements indiqués (SPF/DKIM). Sans domaine vérifié, Resend n'envoie qu'à l'adresse de votre propre compte (pratique pour un premier test).
3. **API Keys → Create API key** (permission « Sending access ») et copiez la clé `re_…`.

> Autre fournisseur (Brevo, Mailgun, SendGrid…) : seule la fonction `envoyerEmail()` de `index.ts` est à adapter (un appel `fetch` à leur API).

### 3. Renseigner les secrets de la fonction

Supabase → **Edge Functions → Secrets** (ou en ligne de commande), avec ces variables :

```env
# Obligatoires
SITE_URL=https://mbc-partenaires.netlify.app     # adresse publique du site, sans « / » final
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxx
INVITE_FROM_EMAIL=MBC Partenaires <invitations@votre-club.fr>   # adresse du domaine vérifié

# Facultatives
INVITATION_TTL_HOURS=168        # durée de validité (168 h = 7 jours ; 48 pour 2 jours)
INVITATION_MAX_PER_HOUR=20      # limite anti-abus par membre
ALLOWED_ORIGIN=https://mbc-partenaires.netlify.app   # CORS ; par défaut = SITE_URL
```

`SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` sont fournies automatiquement aux Edge Functions : **ne les mettez jamais dans le front-end.**

En ligne de commande :

```bash
npx supabase login
npx supabase link --project-ref <ref-du-projet>
npx supabase secrets set SITE_URL=https://mbc-partenaires.netlify.app RESEND_API_KEY=re_xxx "INVITE_FROM_EMAIL=MBC Partenaires <invitations@votre-club.fr>"
```

### 4. Déployer l'Edge Function

```bash
npx supabase functions deploy invitations --no-verify-jwt
```

`--no-verify-jwt` est nécessaire car la page d'inscription appelle la fonction **sans être connectée** ; l'action `send` vérifie elle-même le jeton de session et l'appartenance à `membres`.

Sans CLI : Supabase → **Edge Functions → Deploy a new function → Via Editor**, nommez-la `invitations`, collez `index.ts`, puis dans ses réglages désactivez **Enforce JWT verification**.

### 5. Front-end

Rien à configurer de plus : `config.js` (`MODE: "supabase"`, URL, clé anon) suffit. Redéployez le dossier sur Netlify ; `netlify.toml` fait pointer `/register` vers `register.html`.
La CSP existante autorise déjà `https://*.supabase.co` (appels à `/functions/v1/invitations`).

### 6. Réglages Supabase Auth recommandés

- **Authentication → Providers → Email** : désactivez **Allow new users to sign up**. Les comptes ne sont alors créés que par la fonction (clé service_role) : impossible de contourner l'invitation via l'API publique.
- **Authentication → URL Configuration** : `Site URL` = votre adresse Netlify (déjà utile pour « Mot de passe oublié »).

### 7. Tester

1. Connectez-vous, menu du compte → **Inviter un membre**, saisissez votre propre adresse secondaire → **Envoyer l'invitation**.
2. Ouvrez l'e-mail, cliquez **Créer mon compte**, remplissez prénom, nom, mot de passe.
3. Vous arrivez connecté sur l'application ; la liste des invitations affiche « Acceptée ».
4. Rouvrez le même lien : message « invitation déjà utilisée ».

Tests automatisés (mode démo, sans Supabase) :

```bash
npm test                         # règles des invitations + règles métier existantes
python3 -m http.server 8765      # dans un autre terminal
npm run test:invitations         # parcours complet dans Chromium
```

### Facultatif : expiration planifiée

Les invitations périmées sont passées en `expired` automatiquement lors de chaque envoi ou vérification. Pour que la base soit aussi à jour sans activité, planifiez dans **Database → Cron** (extension `pg_cron`) :

```sql
select cron.schedule('expirer-invitations', '0 3 * * *', $$ select public.expirer_invitations(); $$);
```

---

## Sécurité — ce qui est en place

- Jeton de 256 bits issu de `crypto.getRandomValues`, transmis uniquement par e-mail ; seule l'empreinte SHA-256 est stockée.
- Lien à usage unique : la réservation du jeton est atomique (`UPDATE … WHERE statut = 'pending'`), deux clics simultanés ne créent pas deux comptes.
- Expiration (7 jours par défaut), renvoi = l'ancienne invitation est révoquée.
- Mot de passe : 8 à 72 caractères, haché en **bcrypt** par Supabase Auth ; jamais stocké dans les tables de l'application.
- E-mail de l'invité imposé par l'invitation (champ non modifiable côté page, et ignoré côté serveur).
- Seuls les membres peuvent inviter ; limite de 20 invitations par heure et par membre.
- Le jeton est retiré de la barre d'adresse dès l'ouverture de la page ; `Referrer-Policy: same-origin` empêche sa fuite vers des sites tiers.
- Si l'envoi de l'e-mail échoue, l'invitation est supprimée (pas de jeton orphelin).

## Mode démonstration (`MODE: "mock"`)

Tout fonctionne hors ligne : l'invitation est enregistrée dans le navigateur et, faute d'envoi d'e-mail, **le lien d'inscription est affiché dans la fenêtre** (boutons Copier / Ouvrir). Le nouveau membre peut ensuite se connecter avec n'importe quel mot de passe de 8 caractères, comme les comptes de démo.
