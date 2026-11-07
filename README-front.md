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
| Colonne **Non encaissé** après « Signé » | Pipeline | `selectors.js` (`resteAEncaisser`, `estSolde`, `colonnePipeline`), `store.js` (`COLONNES`), `pipeline.js` |
| **Numéro SIRET** (saisie, modification, contrôle) | Partenaires (colonne + bouton), fiche › Informations, fenêtre « Nouveau partenaire » | `selectors.js` (`validerSiret`), `siret.js`, `partenaires.js`, `fiche.js` |
| **Logos** des sponsors (import manuel + **recherche automatique** logo.dev) | Fiche (en-tête + Informations), Pipeline, Partenaires › Logos automatiques, Nouveau partenaire | `logos.js`, `logos-auto.js`, `api.js` (`deposerLogo`), `store.js` (`enregistrerLogo`) |
| Statut **« Contacter »** (v3, ex-« Contact à rajouter ») | Événements › Présences ; badge sur Pipeline, Partenaires (+ filtre) et fiche | `selectors.js` (`aContacterParPartenaire`), `evenements.js`, `utils.js` (`badgeAContacter`) |
| **Journal d'audit** (qui / quoi / quel compte) | Écran Journal, fiche › Journal des modifications | `schema.sql` §2 bis, `api.js`, `store.js` (`restaurer`), `journal.js` |
| **Répartition de l'argent** (montants validés / cotisations) sous « Signé » et « Encaissé », calculée automatiquement | Tableau de bord › Score de la saison | `selectors.js` (`calculerRepartition`), `dashboard.js` |

**Mise à jour v3** (en deux temps, car la branche de dev et la production partagent la même base) :
1. **Avant** de déployer la v3 (même sur la branche de dev) : lancer `supabase/migration-v3.sql` (3 lignes « ok »). Compatible avec l'ancien site : « Contacter » est ajouté, « Contact à rajouter » reste accepté.
2. **Après** la mise en production de la v3 (fusion dans `main`) : lancer `supabase/migration-v3-finalisation.sql`, qui convertit les anciennes lignes et retire l'ancienne valeur.

**Mise à jour d'une base Supabase existante** : coller `supabase/migration-v2.sql` dans le SQL Editor et cliquer sur Run (4 lignes « ok » attendues). Alternative : relancer `supabase/schema.sql` en entier, après avoir retiré les membres fictifs de la section 4. Le script est idempotent (vérifié sur PostgreSQL 16) : il ajoute colonnes, tables, trigger et bucket sans toucher aux données.

**Nettoyage facultatif** : si vous aviez lancé la toute première version de `migration-v2.sql`, la table `affectations` et la colonne `reglages.categories` ne servent plus (la répartition est désormais calculée). `supabase/nettoyage-v2.sql` les retire ; les garder ne gêne pas l'application.

---

## 7. Pipeline : colonnes « Signé » et « Non encaissé »

- **Signé** ne montre que les partenaires **soldés** (tout le montant validé + la cotisation est encaissé, ou contrat à 0 € comme un apport en nature).
- **Non encaissé**, juste après, montre les partenaires signés qui **doivent encore de l'argent**. Chaque carte affiche le **reste dû** et une barre de progression ; le total de la colonne est la somme des restes dus.

« Non encaissé » n'est **pas** une étape enregistrée en base : c'est une colonne **calculée** (`selectors.colonnePipeline`). Dès que toutes les échéances d'un partenaire sont cochées payées, sa carte repasse d'elle-même dans « Signé » ; si une échéance est décochée, elle revient dans « Non encaissé ».

Pourquoi ce choix plutôt qu'une 9e étape ?
- aucune donnée en double : impossible d'avoir une carte mal rangée ;
- toutes les règles existantes (`etape === "Signé"` : score, KPI, CERFA, invitations…) restent justes sans modification.

Déposer une carte sur « Signé » ou sur « Non encaissé » la passe à l'étape « Signé » ; c'est ensuite l'état de ses paiements qui décide de la colonne. Dans la fiche, un badge « Non encaissé · reste … € » le rappelle.

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

### 9.4 Logos automatiques (logo.dev)

Trois façons de trouver un logo **sans l'importer à la main** (`logos-auto.js`) :

| Où | Ce qui se passe |
|---|---|
| **Nouveau partenaire** | Dès qu'on tape le nom, les logos trouvés s'affichent sous le champ ; le premier est présélectionné (« Aucun » pour ne rien enregistrer). |
| **Fiche › Informations › Chercher automatiquement** | Propositions pour cette fiche, à valider. |
| **Partenaires › Logos automatiques** | Toutes les fiches **sans logo** d'un coup : une ligne par fiche, le premier logo trouvé présélectionné, « Tout décocher », puis « Enregistrer N logos ». |

Fonctionnement pas à pas :
1. **Candidats** (`selectors.candidatsLogo`, testé) : d'abord le **site tiré de l'e-mail professionnel** des contacts (`jean@ecf82.fr` → `ecf82.fr`, le plus fiable), puis le **nom** de l'entreprise et chaque marque d'un nom composé (« Acuitis - Optic 2000 »). Les messageries grand public (gmail.com, orange.fr…) sont ignorées.
2. **Vérification** : le navigateur charge chaque image `https://img.logo.dev/…?token=<clé publique>&fallback=404`. Un logo inconnu répond 404 → il est écarté.
3. **Validation par un membre** : rien n'est enregistré sans clic (deux entreprises peuvent porter le même nom).
4. **Enregistrement** : l'adresse de l'image est écrite dans `partenaires.logo` (comme un logo importé) → affichage partout, temps réel, journal.

Configuration : `CONFIG.LOGO_DEV_KEY` dans `config.js` = clé **publique** `pk_…` (faite pour être visible). Ne jamais y mettre la clé secrète `sk_…`. Clé vide = fonctionnalité masquée. `netlify.toml` autorise les images `https://img.logo.dev`. Aucune modification Supabase.

Limites : les marques connues sont bien trouvées ; les commerces locaux souvent pas (import manuel). La mention « Logos provided by Logo.dev » figure en pied de page (demandée par l'offre gratuite de logo.dev).

---

## 10. Événements : statut « Contacter » (v3)

« Contacter » remplace « Contact à rajouter » : **un contact est à établir avec le partenaire**.

1. Dans la liste Présence d'un partenaire (Événements), choisir **« Contacter »** : la valeur est **enregistrée immédiatement** dans Supabase (écriture optimiste, annulée avec un message si la base refuse).
2. Le temps réel la diffuse aux autres membres. Elle remonte partout : badge **« À contacter »** sur la carte du Pipeline, dans la liste Partenaires (filtre **« À contacter »**) et dans l'en-tête de la fiche ; ligne « À contacter — … » dans « À faire » du tableau de bord. L'infobulle du badge rappelle les événements concernés.
3. Le statut se modifie aussi depuis la fiche › Présences aux événements (liste déroulante). Dès qu'un autre statut est choisi, le badge disparaît.
4. Le bouton « Ajouter le contact » d'une ligne ouvre, si besoin, la fenêtre « Nouveau contact » pré-remplie ; il ne change pas le statut.

L'ancienne valeur est convertie par `supabase/migration-v3-finalisation.sql`, à lancer une fois la v3 en production ; en attendant, le site v3 la lit déjà comme « Contacter ».

---

## 10 bis. Documents de la fiche : Convention et Autres documents (v3)

Fiche › Informations › **Documents** : deux emplacements, **Convention** (convention signée ; badge « Reçue » / « Manquante ») et **Autres documents** (factures, RIB, justificatifs…).

1. Glisser-déposer un ou plusieurs fichiers sur l'emplacement, ou cliquer sur **Parcourir** (Entrée au clavier).
2. Formats acceptés : PDF, images (PNG, JPEG, WebP, HEIC), Word, Excel, OpenDocument, texte/CSV. **15 Mo max** par fichier (1,5 Mo en mode mock).
3. Le fichier est déposé dans le bucket **privé** Supabase `documents` (`<id-partenaire>/<categorie>/<horodatage>-<nom>`), puis une ligne est créée dans la table `documents` (temps réel + journal d'audit + ligne dans l'historique de la fiche).
4. **Ouvrir** (clic sur le nom) / **Télécharger** : adresse signée valable 2 minutes, le fichier n'a jamais d'URL publique.
5. **Supprimer** (deux clics) : la ligne puis le fichier. Supprimer une fiche retire aussi ses fichiers.

Fichiers : `documents.js`, `api.js` (`deposerDocument`, `adresseDocument`), `store.js` (`ajouterDocument`, `supprimerDocument`), `schema.sql` §3 ter.

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

## 12 bis. Tableau de bord : total global et répartition du budget (v3)

- **Total global** (grand chiffre du « Score de la saison ») = Σ montants validés + Σ cotisations validées. La jauge et « Reste à trouver » se calculent sur ce total.
- **Répartition du budget** juste dessous : Total montants validés, Total cotisations validées (comparé aux cotisations demandées), Total mécénat (part des montants validés, déjà dans le total), Total apports en nature (valorisation, hors total).
- Fiches comptées : toutes celles à l'étape « Signé », plus celles qui ont déjà un montant ou une cotisation validé(e) sans avoir changé d'étape ; jamais « Perdu » ni « Archivé ». Le nombre de fiches est affiché à droite du titre.
- « Dont fiches « Signé » » garde le total des seules fiches à l'étape Signé. Calcul : `selectors.calculerBudget`.

## 12. Tableau de bord : répartition sous « Signé » et « Encaissé »

Dans le bloc **« Score de la saison »**, sous les totaux « Signé » et « Encaissé », deux lignes indiquent d'où vient l'argent — **calculé automatiquement** à partir des contrats, sans saisie (`selectors.calculerRepartition`) :

| | Signé (partenaires à l'étape « Signé ») | Encaissé (échéances payées de la saison) |
|---|---|---|
| **Montants validés** | Σ montants validés (avec, en dessous, « dont mécénat ») | part des paiements qui revient aux montants validés |
| **Cotisations** | Σ cotisations validées | part des paiements qui revient aux cotisations |

Exemple : AXA a validé **500 €** + **200 €** de cotisation et a tout payé → 500 € comptent en « Montants validés » et 200 € en « Cotisations », côté Signé comme côté Encaissé ; les lignes « Cotisations » donnent ainsi le **total des cotisations** du club.

- Un paiement partiel est réparti au **prorata** du contrat du partenaire (moitié payée → moitié de sa cotisation), sans jamais dépasser la cotisation validée ; le reste, y compris un paiement d'une fiche sans contrat validé, compte en « Montants validés ».
- Les deux lignes retombent **exactement** sur le total affiché.
- **Export Excel** : onglet « Répartition ».

---

## 13. Tests

- `npm test` : tests unitaires (dont SIRET/Luhn, colonne Non encaissé et reste dû, répartition montants validés / cotisations (exemple AXA), « Contacter » dans À faire et sur les fiches, total global et ventilation du budget, résumé de l'appareil).
- `npm run test:e2e` : parcours navigateur complet, étendu en v2 (colonnes Signé / Non encaissé, SIRET refusé puis accepté, import de logo visible dans l'autre onglet, répartition égale au total Encaissé, journal et restauration d'une valeur) puis en v3 (« Contacter » enregistré et visible dans l'autre onglet, dépôt / téléchargement / suppression de documents, format refusé, total global = somme des sous-totaux).
