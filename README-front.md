# Guide Front-End — MBC Partenaires

## 0. Structure des pages

| Page | Rôle |
|---|---|
| `index.html` | **Page d'accueil = connexion** (§4.1). Mode démo : comptes `thomas@exemple.fr` / `eric@exemple.fr`, tout mot de passe de 8 caractères. |
| `register.html` | **Création de compte sur invitation** (lien reçu par e-mail : `/register?token=…`). Voir [`supabase/README-invitations.md`](./supabase/README-invitations.md). |
| `app.html` | Application (5 écrans + fiche partenaire). Redirige vers `index.html` si personne n'est connecté. |
| `front-end/html/*.html` | Anciennes adresses, redirigent vers les nouvelles pages. |

Invitations : menu du compte → **Inviter un membre**. Mise en service (table, Edge Function, e-mails, variables d'environnement) : [`supabase/README-invitations.md`](./supabase/README-invitations.md).

Écrans : `app.html#/dashboard`, `#/pipeline`, `#/partenaires`, `#/paiements`, `#/evenements`, `#/journal` (v2) ; fiche : `?fiche=<id>` (ex. `#/partenaires?fiche=myjob`).

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

---

## 6. Évolutions v2 — vue d'ensemble

| Fonctionnalité | Où la trouver | Fichiers |
|---|---|---|
| Colonne **Encaissé** après « Signé » | Pipeline | `selectors.js` (`estSolde`, `colonnePipeline`), `store.js` (`COLONNES`), `pipeline.js` |
| **Numéro SIRET** (saisie, modification, contrôle) | Partenaires (colonne + bouton), fiche › Informations, fenêtre « Nouveau partenaire » | `selectors.js` (`validerSiret`), `siret.js`, `partenaires.js`, `fiche.js` |
| **Logos** des sponsors | Fiche (en-tête + Informations), Pipeline, Partenaires | `logos.js`, `api.js` (`deposerLogo`), `store.js` (`enregistrerLogo`) |
| Statut **« Contact à rajouter »** | Événements › Présences | `evenements.js`, `contacts.js` |
| **Journal d'audit** (qui / quoi / quel compte) | Écran Journal, fiche › Journal des modifications | `schema.sql` §2 bis, `api.js`, `store.js` (`restaurer`), `journal.js` |
| **Affectation des fonds** par catégorie | Tableau de bord, fiche › Affectation des fonds, Réglages | `selectors.js` (`calculerVentilation`), `dashboard.js`, `fiche.js` |

**Mise à jour d'une base Supabase existante** : coller `supabase/migration-v2.sql` dans le SQL Editor et cliquer sur Run (4 lignes « ok » attendues). Alternative : relancer `supabase/schema.sql` en entier, après avoir retiré les membres fictifs de la section 4. Le script est idempotent (vérifié sur PostgreSQL 16) : il ajoute colonnes, tables, trigger et bucket sans toucher aux données.

**Mode démo** : les nouvelles données de démonstration (affectations) ne sont créées qu'au premier lancement. Pour les voir, videz le stockage local du site (voir §0).

---

## 7. Pipeline : colonne « Encaissé »

« Encaissé » n'est **pas** une étape enregistrée en base : c'est une colonne **calculée**. Une fiche à l'étape « Signé » dont les échéances payées couvrent le total validé (montant + cotisation) y est rangée automatiquement ; si une échéance est décochée, la carte revient dans « Signé ».

Pourquoi ce choix plutôt qu'une 9e étape ?
- aucune donnée en double : impossible d'avoir une carte « Encaissé » qui ne l'est pas réellement ;
- toutes les règles existantes (`etape === "Signé"` : score, KPI, CERFA, invitations…) restent justes sans modification.

Déposer une carte sur « Encaissé » la passe en « Signé » ; elle rejoint « Encaissé » dès que ses échéances sont cochées payées. Les cartes signées affichent une barre de progression de l'encaissement.

---

## 8. Numéro SIRET

- **Où le saisir** : bouton « + SIRET » (ou clic sur le numéro) dans la colonne SIRET de l'écran Partenaires → fenêtre dédiée ; champ « Numéro SIRET » de la fiche › Informations ; fenêtre « Nouveau partenaire ».
- **Contrôle** (`selectors.validerSiret`) : 14 chiffres (espaces tolérés à la saisie) et **clé de Luhn** ; exception La Poste (SIREN 356 000 000, somme des chiffres multiple de 5). Un numéro faux n'est jamais enregistré ; la base revérifie le format (contrainte `CHECK`).
- **Aides** : lien vers l'annuaire officiel des entreprises pré-rempli avec le nom ; avertissement si le même SIRET est déjà utilisé par une autre fiche ; filtre « Sans SIRET » ; badge « SIRET manquant » sur les fiches signées ; colonne SIRET dans l'export Excel.

---

## 9. Logos — fonctionnement pas à pas

### 9.1 Import (quand un membre choisit ou dépose une image)

1. **Choix du fichier** — clic sur le logo en haut de la fiche (ou bouton « Importer » dans Informations), ou glisser-déposer d'une image sur ce logo.
2. **Contrôle** (`logos.verifierFichier`) — PNG, JPEG, WebP, GIF ou SVG, 5 Mo maximum.
3. **Aperçu immédiat** — `URL.createObjectURL(fichier)` crée une adresse locale `blob:…` : l'image s'affiche dans la fiche **avant** tout envoi réseau.
4. **Traitement** (`logos.preparerImage`) — l'image est dessinée dans un `<canvas>` réduit à 256 px sur le plus grand côté, puis ré-encodée en **WebP** (PNG si le navigateur ne sait pas produire du WebP). Un fichier de plusieurs Mo devient ~10 à 30 Ko, et ce qui n'est pas des pixels (métadonnées, scripts d'un SVG) disparaît.
5. **Stockage** (`api.deposerLogo`) :
   - mode **supabase** → fichier déposé dans le bucket Storage `logos`, chemin `<id-partenaire>/<horodatage>.webp`. Un **nouveau nom à chaque import** : le cache des navigateurs ne peut jamais montrer l'ancien logo. La fonction renvoie l'URL publique ;
   - mode **mock** → l'image est convertie en texte `data:image/webp;base64,…` (stockée dans le localStorage avec la fiche).
6. **Enregistrement** (`store.enregistrerLogo`) — l'adresse est écrite dans la colonne `partenaires.logo` (écriture optimiste), puis l'**ancien fichier** est supprimé du bucket (si l'écriture échoue, l'ancien logo reste intact).
7. **Diffusion** — la modification de `partenaires` est envoyée par le temps réel (Supabase Realtime, ou évènement `storage` entre onglets en mode mock) : les écrans des autres membres se redessinent et le logo apparaît chez eux **sans recharger**.

### 9.2 Affichage

- `logos.logoHtml(partenaire)` produit un `<img src="…">` si `logo` est rempli, sinon un **monogramme** (initiales sur une couleur stable calculée à partir du nom).
- Les écrans ignorent où l'image est rangée : une URL `https://…supabase.co/…` et une URL `data:` s'affichent de la même façon. Changer de stockage ne concerne que `api.js`.
- Le monogramme est toujours placé **sous** l'image : si elle ne se charge plus (fichier supprimé, hors ligne), un écouteur global (`logos.initLogos`) retire l'`<img>` et le monogramme réapparaît. Pas d'attribut `onerror="…"` : la politique de sécurité (CSP) interdit le JavaScript en ligne.

### 9.3 Sécurité et configuration

- Bucket `logos` **en lecture publique** (un logo d'entreprise est une information publique ; l'URL contient un horodatage non devinable), **écriture réservée aux membres** (règles RLS sur `storage.objects`, `schema.sql` §3 bis). Taille max 512 Ko et types WebP/PNG/JPEG imposés côté serveur.
- `netlify.toml` autorise `img-src blob: https://*.supabase.co` (aperçu + images du bucket).
- Le journal d'audit ne recopie pas les images base64 du mode mock (remplacées par « (image importée) »).

---

## 10. Événements : statut « Contact à rajouter »

1. Dans la liste Présence d'un partenaire, choisir **« Contact à rajouter »** : le statut est enregistré (pense-bête, il apparaît aussi dans « À faire » du tableau de bord).
2. La fenêtre **« Nouveau contact »** s'ouvre automatiquement, pré-remplie (entreprise, événement, nom s'il n'y en a qu'un dans « Noms ») et rappelle les contacts déjà connus pour éviter les doublons.
3. **Enregistrer** → le contact est ajouté à la fiche, une ligne « Contact ajouté : … — Afterwork du … » est écrite dans l'historique, et la présence reprend son statut précédent (« Oui » par défaut, 1 personne minimum, nom reporté dans « Noms » s'il était vide).
4. **Plus tard** → le statut reste « Contact à rajouter » ; un bouton « Ajouter le contact » sur la ligne (et dans la fiche › Présences) permet de reprendre.

---

## 11. Historique & suivi des modifications (audit)

### 11.1 Les trois approches étudiées

| | **A. Journal d'activité global** | **B. Historique réversible par fiche** | **C. Journal générique avant/après (retenu)** |
|---|---|---|---|
| Principe | Une ligne de texte par action (« Thomas a modifié MyJob ») | Copie complète de la fiche à chaque version | Une ligne par écriture avec **uniquement les champs modifiés**, valeurs avant / après, compte, appareil |
| Qui / quand / compte | Oui | Oui | Oui (e-mail du jeton JWT, horodatage serveur, navigateur) |
| Détail de la modification | Texte libre, pas exploitable | Il faut comparer deux versions | Champ par champ, directement lisible |
| Annuler une modification | Non | Oui, fiche entière seulement | Oui : un champ, une ligne supprimée, ou une fiche et toutes ses données |
| Couvre contrats, échéances, contacts… | Si on pense à l'écrire partout | Non (fiche seulement) | Oui, automatiquement (trigger sur toutes les tables) |
| Volume | Faible | Élevé (copies complètes) | Faible |

**C** est la plus souple : avec un seul format, on obtient à la fois le journal global (A), l'historique réversible par fiche (B) et un tableau de suivi par membre.

### 11.2 Architecture intégrée

- **Base** (`schema.sql` §1 et §2 bis) : table `journal` + fonction trigger `public.journaliser()` (`security definer`) branchée en `AFTER INSERT/UPDATE/DELETE` sur toutes les tables métier. Elle enregistre l'**e-mail du compte** (lu dans le JWT vérifié par Supabase, donc non falsifiable depuis le navigateur), le nom du membre, l'**appareil** (en-tête User-Agent transmis par PostgREST), l'horodatage serveur et le détail avant/après. Les mises à jour qui ne touchent que `modifie_le` / `modifie_par` sont ignorées.
- **Journal infalsifiable** : les membres ont seulement le droit de **lire** `journal` ; aucune règle n'autorise insert/update/delete depuis le site.
- **Mode mock** : `api.journaliserLocal` reproduit exactement le même format, cascades comprises.
- **Front** : 1 000 entrées les plus récentes chargées (`api.JOURNAL_MAX`) et tenues à jour en temps réel.
  - écran **Journal** : récapitulatif d'activité par membre (cliquer = filtrer), filtres membre / élément / action / période / recherche, détail « champ : avant → après » ;
  - fiche › **Journal des modifications** : tout ce qui concerne la fiche ;
  - bouton **Restaurer / Recréer / Annuler** (confirmation en deux clics) : remet les anciennes valeurs, recrée un élément supprimé (une fiche supprimée revient avec contrat, échéances, contacts… supprimés au même instant), ou annule la création d'un élément. La restauration est elle-même tracée ;
  - export Excel : onglet « Journal ».
- **Pistes pour aller plus loin** : purge/archivage des entrées de plus de N ans (RGPD), alerte e-mail sur les suppressions, rôle « lecture seule ».

---

## 12. Tableau de bord : affectation des fonds

- **Saisie** : fiche › « Affectation des fonds ». Chaque ligne = catégorie + montant + note. « Pré-remplir depuis le contrat » propose : cotisation validée → *Cotisations*, part de mécénat → *Mécénat*, reste du montant validé → *Sponsoring* (sans doublon). Un bandeau signale « Reste à affecter » ou un dépassement par rapport au total validé.
- **Catégories** : modifiables dans Réglages du club (par défaut : Cotisations, Sponsoring, Mécénat, Équipement, Événementiel, Déplacements, Formation jeunes, Fonctionnement). Retirer une catégorie ne supprime aucun montant : elle reste affichée « hors liste » tant qu'elle est utilisée.
- **Cumuls** (`selectors.calculerVentilation`, partenaires **signés** de la saison) : par catégorie, total affecté, part **encaissée au prorata** (un partenaire qui a payé 50 % de son contrat a encaissé 50 % de chacune de ses affectations), nombre de partenaires, et détail dépliable. Exemple : trois partenaires à 200 € en *Cotisations* → la ligne Cotisations affiche 600 €.
- **Export** : onglets « Affectations » (lignes) et « Ventilation » (cumuls).

---

## 13. Tests

- `npm test` : 13 tests unitaires (dont SIRET/Luhn, colonne Encaissé, ventilation et prorata, pré-remplissage, « Contact à rajouter » dans À faire, résumé de l'appareil).
- `npm run test:e2e` : parcours navigateur complet, étendu en v2 (colonne Encaissé, SIRET refusé puis accepté, import de logo visible dans l'autre onglet, affectation cumulée au tableau de bord, fenêtre contact automatique, journal et restauration d'une valeur).
