# Guide Front-End — MBC Partenaires

## 0. Structure des pages

| Page | Rôle |
|---|---|
| `index.html` | **Page d'accueil = connexion** (§4.1). Mode démo : comptes `thomas@exemple.fr` / `eric@exemple.fr`, tout mot de passe de 8 caractères. |
| `register.html` | **Création de compte sur invitation** (lien reçu par e-mail : `/register?token=…`). Voir [`supabase/README-invitations.md`](./supabase/README-invitations.md). |
| `app.html` | Application (5 écrans + fiche partenaire). Redirige vers `index.html` si personne n'est connecté. |
| `front-end/html/*.html` | Anciennes adresses, redirigent vers les nouvelles pages. |

Invitations : menu du compte → **Inviter un membre**. Mise en service (table, Edge Function, e-mails, variables d'environnement) : [`supabase/README-invitations.md`](./supabase/README-invitations.md).

Écrans : `app.html#/dashboard`, `#/pipeline`, `#/partenaires`, `#/paiements`, `#/evenements` ; fiche : `?fiche=<id>` (ex. `#/partenaires?fiche=myjob`).

Tester en local : `python3 -m http.server 8765` dans le dossier, puis http://localhost:8765/ (ouvrir le fichier en double-cliquant ne marche pas : le navigateur bloque les modules JavaScript).

Pour repartir des données de démo : vider le stockage du site (outils de développement → Application → Local storage).

Application web de suivi des partenaires du club (saison 2026-27), développée en JavaScript Vanilla (modules ES natifs, sans étape de build ni bundler).

---

## 1. Basculer entre le mode « mock » et le mode « supabase »

Le fichier de configuration unique se trouve dans :
[`front-end/js/config.js`](./front-end/js/config.js)

Pour basculer en mode réel connecté à la base Supabase :
1. Ouvrez `front-end/js/config.js`.
2. Remplacez la valeur de `MODE` :
   ```javascript
   export const CONFIG = {
     // Passer de "mock" à "supabase" :
     MODE: "supabase",
     SUPABASE_URL: "https://votre-projet.supabase.co",
     SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6..."
   };
   ```

---

## 2. Emplacement de l'URL Supabase et de la clé publique anon

Toujours dans [`front-end/js/config.js`](./front-end/js/config.js) :
- `SUPABASE_URL` : l'URL de l'API Supabase de votre projet (`https://<projet>.supabase.co`).
- `SUPABASE_ANON_KEY` : la clé publique `anon` (disponible dans votre tableau de bord Supabase : *Project Settings > API > Project API keys > anon public*).

> **Important** : Ne **jamais** renseigner la clé `service_role` dans le front-end. Seule la clé `anon` est autorisée, les règles de sécurité étant assurées côté base par Row Level Security (RLS).

---

## 3. Déploiement sur Netlify par glisser-déposer (Drop)

L'application ne nécessitant aucun build :
1. Rendez-vous sur [Netlify Drop](https://app.netlify.com/drop).
2. Glissez-déposez l'intégralité du dossier du dépôt (ou archive zip décompressée).
3. Le fichier [`netlify.toml`](./netlify.toml) positionne automatiquement :
   - `publish = "."` (aucun build nécessaire, publication directe).
   - Les en-têtes de sécurité HTTP (`Content-Security-Policy`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`).
   - L'en-tête de non-référencement `X-Robots-Tag: noindex, nofollow`.
4. Le fichier [`robots.txt`](./robots.txt) interdit également l'exploration par les robots d'indexation.

---

## 4. Exécution des tests automatisés

Deux suites de tests sont disponibles pour valider la conformité :

### Tests unitaires de la logique métier (Node.js test runner)
Vérifie les calculs de répartition des montants, échéances, retards, CERFA et KPIs du tableau de bord :
```bash
npm test
```

### Tests end-to-end dans un vrai navigateur (Playwright)
Vérifie le cycle de vie complet, le non-affichage de données statiques, la navigation profonde avec tiroir latéral, la fermeture par touche Échap, et la synchronisation temps réel inter-onglets :
```bash
# Le test ouvre http://localhost:8765/ (connexion) puis app.html
# Lance le serveur local (dans un terminal séparé ou en tâche de fond) :
python3 -m http.server 8765

# Exécute le test de fumée automatisé :
npm run test:e2e
```

---

## 5. Protection des données personnelles & RGPD (§6 du cahier des charges)

- **Règle absolue** : Ne jamais stocker de vraies données de contact (noms réels de personnes physiques, adresses e-mails personnelles ou numéros de téléphone privés) dans les fichiers du dossier [`mock/`](./mock/).
- Le dossier `mock/` ne doit contenir que des données d'exemple fictives ou anonymisées.
- Les données réelles sont exclusivement hébergées dans la base de données Supabase protégée par authentification et politiques RLS strictes.
