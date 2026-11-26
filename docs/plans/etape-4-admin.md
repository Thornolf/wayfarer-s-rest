# Étape 4 — L'admin web : plan

Préparé le 26 novembre 2026, à partir de `docs/DESIGN.md`, de l'admin de Valdorne (le dépôt `azeroth`)
et d'une recherche en ligne. Rien n'est encore construit : ce plan propose, le propriétaire tranche
(questions à la fin). Il suppose les étapes 2 (schéma + générateur dans `packages/shared`) et 3
(serveur du Pi : contenu, sons, import, conversion) faites ou en cours ; il dit ce que l'admin attend
d'elles.

## 1. Ce qu'on garde de Valdorne

L'admin de Valdorne dessine **un seul éditeur pour toutes les collections** :

- `app/models/game/content/schema.rb` : par collection, une liste de champs `[clé, libellé, type,
  option]` ; types `string`, `text`, `integer`, `float`, `boolean`, `select` (option : les choix),
  `ref` / `refs` (option : la collection visée), `json` pour le reste. Les clés inconnues sont quand
  même montrées, en JSON. `cast` remet chaque valeur dans son type et retire les vides.
- `Admin/Collection.tsx` : la liste des fiches à gauche (recherche au-delà de 8), le formulaire à
  droite, un composant `Input` par type ; une référence introuvable reste visible (« introuvable : x »).
- `Admin/Dashboard.tsx` + `validation.rb` : la page d'accueil liste les problèmes (références
  cassées, zones injouables…), en phrases françaises qui disent où chercher.
- Le contrôleur **refuse un enregistrement qui ajoute un problème** (il compare la liste avant/après
  dans une transaction) et le dit.

À reprendre tel quel dans l'esprit. À changer :

- le schéma vit en **TypeScript dans `packages/shared`**, lu par l'admin, le serveur et le générateur
  (un seul endroit, typé) au lieu d'être servi par le serveur ;
- deux types en plus : **texte localisé** (`LocalizedText`) et **réglage de variation** (fourchette) ;
- on **archive** au lieu de supprimer (`DESIGN.md`), donc pas de bouton « Supprimer » ;
- `aiGenerated` est un champ commun à toutes les fiches, avec badge et filtre ;
- Valdorne vérifie à l'enregistrement et bloque ; ici on **bloque seulement les références cassées
  nouvelles** et on **signale** le reste (une catégorie sans son est normale pendant qu'on remplit).

## 2. Ce que dit la recherche

### Formulaires générés depuis un schéma

- **react-jsonschema-form (RJSF)** : rend un formulaire depuis un JSON Schema, personnalisable par
  `uiSchema` et des widgets enregistrés par nom
  ([widgets](https://rjsf-team.github.io/react-jsonschema-form/docs/advanced-customization/custom-widgets-fields),
  [uiSchema](https://rjsf-team.github.io/react-jsonschema-form/docs/api-reference/uiSchema)). Puissant
  mais verbeux ; nos types clés (référence vers une autre collection, texte par langue, choix d'un son)
  seraient tous des widgets maison, donc on paierait la couche JSON Schema sans en profiter.
- **AutoForm** (zod → formulaire, sur React Hook Form ou TanStack Form) : couches schéma / adaptateur
  React, mais les champs maison se branchent différemment selon le moteur et l'adoption est mal
  documentée ([docs](https://docsearch.algolia.com/mcp/docs/repo/vantezzen/autoform)).
- **TanStack Form / React Hook Form + zod** : de bons moteurs d'état de formulaire, pas des générateurs
  ([comparaison TanStack](https://tanstack.com/form/latest/docs/comparison),
  [comparatif 2026](https://formisch.dev/blog/react-form-library-comparison/)). React Hook Form reste
  le choix par défaut le plus répandu ([pkgpulse](https://www.pkgpulse.com/guides/best-react-form-libraries-2026)).
- **zod 4** sait attacher des métadonnées (`.meta()`, registres) et produire un JSON Schema
  ([metadata](https://zod.dev/metadata), [JSON Schema](https://zod.dev/json-schema)) : utile pour
  valider aux frontières du serveur, pas nécessaire pour dessiner les formulaires.

**Conclusion** : un petit éditeur générique fait main (comme Valdorne, ~150 lignes) + des composants
de saisie Mantine. Les besoins sont étroits et connus ; une bibliothèque de génération serait plus
grosse que le code qu'elle remplace et moins lisible.

### Un CMS headless à la place ?

- **Payload 3** est construit sur Next.js et demande au moins 1 Go de RAM ; des soucis de modules
  natifs arm64 sont signalés ([guide Docker](https://oneuptime.com/blog/post/2026-02-08-how-to-run-payload-cms-in-docker/view),
  [arm64](https://payloadcms.com/community-help/discord/application-crashing-in-docker)).
- **Directus** : le plus léger sur le papier (1 Go mini) mais sous licence source-available (MSCL, gratuit
  sous 5 M$/an) ([licence v12](https://directus.io/blog/directus-v12-license-change)) ; **Strapi**
  demande 2 cœurs / 4 Go ([comparatif](https://dev.to/lilxyzz/headless-cms-directus-vs-payload-vs-strapi-in-2024-1o1b),
  [Strapi vs Directus vs Payload](https://glukhov.org/post/2025/11/headless-cms-comparison-strapi-directus-payload/)).
- **Keystatic** (mode local) : schéma en TypeScript, contenu en fichiers JSON/YAML dans git, mais les
  binaires (nos sons) gonflent l'historique git
  ([Astro + Keystatic](https://docs.astro.build/en/guides/cms/keystatic),
  [makerkit](https://makerkit.dev/docs/next-supabase-turbo/content/keystatic)).
  **TinaCMS** et **Sanity Studio** reposent sur un backend hébergé (Tina Cloud, Content Lake) : hors
  sujet pour un Pi hors ligne derrière Tailscale.

**Verdict : non.** Un CMS apporterait les CRUD, mais aucun ne fait ce qui fait la valeur de cet
admin : import de sons avec conversion AAC et mapping par nom de fichier, édition en lot des réglages
de variation, vérification propre au jeu, « Simuler une nuit » avec le générateur partagé. Il faudrait
les écrire en extensions dans un framework étranger, sur un Pi, avec un deuxième modèle de données à
synchroniser avec `packages/shared`. Ce qu'on en retient : le **modèle de champs** (Keystatic,
Payload) et l'idée de vues de liste filtrables (Directus).

### Grilles pour l'édition en lot

- **TanStack Table** : headless, gratuit, tri/filtre/sélection de lignes ; l'édition est à construire
  ([pkgpulse](https://www.pkgpulse.com/guides/best-react-table-libraries-2026)).
- **AG Grid Community** : édition de cellules simple, mais sélection de plages, copier-coller
  multi-cellules et poignée de recopie sont payants ([rv-grid](https://rv-grid.com/compare/ag-grid-alternatives),
  [fill handle](https://www.ag-grid.com/react-data-grid/cell-selection-fill-handle.md)).
- **Glide Data Grid** : canvas, MIT, millions de lignes, édition et collage multi-cellules
  (`onCellsEdited`) ; les cellules maison doivent être dessinées en canvas
  ([README](https://raw.githubusercontent.com/glideapps/glide-data-grid/main/README.md),
  [copier-coller](https://docs.grid.glideapps.com/extended-quickstart-guide/copy-and-paste-support)).

**Choix** : TanStack Table. On aura quelques centaines de sons, pas des millions ; le geste voulu est
« je coche 40 sons, je règle la couche et le volume une fois » (un panneau d'édition en lot), pas un
tableur. Glide reste l'option si le propriétaire veut un vrai collage façon tableur.

### Import, aperçu audio

- **react-dropzone** n'est qu'une zone de dépôt ; **Uppy** apporte tableau de bord et reprise (tus)
  mais demande un serveur tus et pèse plus lourd ([comparaison Uppy](https://uppy.io/docs/comparison/),
  [pkgpulse](https://www.pkgpulse.com/guides/uppy-vs-filepond-vs-react-dropzone-file-upload-2026)).
  Sur un réseau local, la reprise d'envoi ne vaut pas un serveur tus : **`@mantine/dropzone`** (bâti
  sur react-dropzone) + envoi multipart avec barre de progression.
- **wavesurfer.js v7** (TypeScript, Shadow DOM) et le paquet officiel `@wavesurfer/react`
  (`useWavesurfer`, `WavesurferPlayer`) ([intégration](https://wavesurfer.xyz/docs/frameworks/),
  [@wavesurfer/react](https://www.npmjs.com/package/@wavesurfer/react)). Pour la fiche d'un son
  seulement ; dans les listes, un seul `<audio>` partagé suffit.

### Kit UI, routage, données

- **Mantine vs shadcn/ui** : Mantine donne l'étendue d'emblée (formulaires, tables, notifications,
  modales, dropzone), shadcn/ui la propriété du code et Tailwind
  ([designrevision](https://designrevision.com/compare/mantine-vs-shadcn),
  [retour d'expérience](https://dev.to/devforgedev/why-i-chose-mantine-over-shadcnui-for-every-dashboard-project-5fd0)).
  Pour un outil interne à un seul utilisateur : **Mantine**.
- **TanStack Router** : paramètres de recherche typés et validés (zod), là où React Router v7 en mode
  SPA demande des conversions à la main
  ([comparaison officielle](https://tanstack.com/router/v1/docs/framework/react/comparison),
  [pkgpulse](https://www.pkgpulse.com/guides/tanstack-router-vs-react-router-v7-2026)). Nos filtres
  (archivé, IA, catégorie, couche, zone) vivent dans l'URL : c'est le bon outil.
- **TanStack Query** : cache, `invalidateQueries` après une mutation
  ([invalidations](https://tanstack.com/query/latest/docs/framework/react/guides/invalidations-from-mutations)).

## 3. Pile recommandée

| Besoin | Choix | Pourquoi |
|---|---|---|
| Base | React 19 + Vite (déjà là) | rien à changer |
| UI | Mantine 8 (`core`, `form`, `dropzone`, `notifications`, `modals`) | tout ce qu'il faut, sans Tailwind |
| Routage | TanStack Router (routes fichiers) | filtres typés dans l'URL |
| Données | TanStack Query | cache, invalidation, états de chargement |
| Formulaires | éditeur générique maison + `@mantine/form` | le schéma est à nous, les champs maison aussi |
| Listes / lot | TanStack Table (+ TanStack Virtual si besoin) | headless, sélection de lignes |
| Audio | `<audio>` partagé ; `@wavesurfer/react` sur la fiche | léger dans les listes |
| Textes de l'admin | i18next + react-i18next (comme `apps/mobile`) | une seule façon de faire |
| Validation runtime | fonctions de `packages/shared` | même code côté serveur et admin |

Toutes les versions viennent de npm au moment de l'installation et sont épinglées.

## 4. Le schéma pilote tout

Dans `packages/shared/src/schema/` (fait à l'étape 2, complété ici si besoin) :

```
FieldSpec = { key, label: LocalizedText, kind, required?, help? , ...options }
kind : text | longText | localizedText | localizedLongText | number(min,max,step,unit)
     | boolean | select(options) | ref(collection) | refs(collection, ordered?)
     | range(min,max)       ← fourchettes de variation (volume ±, hauteur ±)
     | json                 ← tout ce qui est imbriqué (tables d'événements au début)
CollectionSpec = { name, label, fields, titleField, listColumns, fixed? }
```

- Chaque fiche a en plus `id` (slug, immuable), `archived`, `aiGenerated`, `updatedAt`.
- **Formulaire** : `EntryForm` parcourt `fields` et choisit un composant par `kind`
  (`FieldInput`). `ref`/`refs` reçoivent les fiches de la collection visée (`Select` / `MultiSelect`
  cherchables de Mantine), une référence introuvable s'affiche en rouge comme dans Valdorne, une fiche
  archivée est marquée « (archivée) ».
- **Liste** : `listColumns` donne les colonnes de la table ; colonnes communes : titre (français),
  badges IA et archivé, nombre de problèmes de la fiche.
- **Validation** : `validateEntry(spec, data)` (types, requis, `fr` présent) et
  `checkContent(content)` (références cassées, références vers une fiche archivée, catégories de sons
  sans son actif, lieux sans ambiance…) vivent dans `shared`. Le serveur les appelle avant d'écrire et
  refuse ce qui **ajoute** une référence cassée (comparaison avant/après, comme Valdorne) ; l'admin
  les appelle pour afficher les erreurs sous les champs avant même l'envoi. Chaque problème porte
  `{ collection, id, field, message }` pour faire un lien direct vers le champ.
- Un champ inconnu dans les données est montré en JSON en lecture seule (pas perdu en silence).

## 5. Écrans

Cadre commun : barre du haut (nom, bouton « Simuler une nuit », pastille du nombre de problèmes,
déconnexion) ; colonne de gauche avec les collections et leurs nombres ; contenu à droite.

1. **Connexion** — un champ mot de passe. Le serveur pose un cookie de session `HttpOnly`.
2. **Vue d'ensemble** (`/`) — tuiles par collection (total, archivés, IA à réécrire) ; la liste des
   problèmes de `checkContent`, groupés par type, chaque ligne mène au champ fautif ; les derniers
   rapports de nuit reçus.
3. **Collection** (`/c/$collection?search=&archived=&ai=`) — table (TanStack Table) filtrable : texte,
   « afficher les archivées », « écrites par l'IA seulement » ; bouton « Nouvelle fiche ». Clic sur une
   ligne : la fiche.
4. **Fiche** (`/c/$collection/$id`) — formulaire généré, en deux colonnes sur grand écran ; en tête :
   titre, badge IA (avec « Marquer comme réécrite », qui met `aiGenerated: false`), archiver /
   désarchiver ; à droite « Utilisée par » (les fiches qui pointent ici) et ses problèmes. Brouillon
   non enregistré signalé avant de quitter.
5. **Sons** (`/sounds?layer=&category=&place=&status=`) — vue dédiée (sa propre table, pas la vue
   générique) : lecture en ligne, durée, couche, catégorie, lieux, boucle, volume, poids, actif.
   Cases à cocher → panneau « Modifier N sons ». Onglet « Non classés ». Bouton « Importer ».
6. **Import de sons** (`/sounds/import`) — dépôt, envoi, puis revue du mapping (section 6).
7. **Fiche d'un son** (`/sounds/$id`) — forme d'onde (wavesurfer), lecture avec les variations tirées
   au hasard (« Écouter une variante »), original et version AAC, mêmes champs que le formulaire.
8. **Catégories de sons** — si les fourchettes par catégorie deviennent une collection (voir
   questions) : formulaire générique, plus la liste des sons de la catégorie.
9. **Vérification** (`/check`) — la liste complète des problèmes, filtrable par collection.
10. **Simuler une nuit** (`/simulate`) — section 7.
11. **Chroniques** (`/chronicles`) — les rapports de nuit reçus de l'iPhone, en lecture seule.

## 6. Sons : import, revue du mapping, édition en lot

**Import**

1. L'écran accepte plusieurs fichiers ou un `.zip` (dépôt ou sélection). L'envoi part par lots en
   multipart vers `POST /api/sounds/uploads`, avec une progression par fichier.
2. Le serveur (étape 3) dézippe, garde l'original, convertit en AAC, calcule la durée, égalise le
   volume, puis applique le **mapping par nom** (`couche__categorie__lieux__NN`, `DESIGN.md`). Une
   fonction `parseSoundFilename` de `shared` le fait, pour que l'admin montre la même lecture que le
   serveur. Chaque fichier ressort en **brouillon d'import** (`importBatch`, statut `pending`).
3. L'écran suit l'avancement (requête régulière tant que des conversions tournent).

**Revue** — une table du lot : nom du fichier, lecture, ce que le mapping a compris (couche, catégorie,
lieux) avec un indicateur : vert (tout reconnu), orange (catégorie inconnue : sera créée ?), rouge
(nom illisible → « Non classés »). Un doublon (même nom ou même empreinte) est signalé. On corrige à
la main dans la ligne ou en lot, puis « Valider l'import » rend les sons actifs ; « Laisser en non
classés » les garde inactifs.

**Édition en lot** — dans la vue Sons, après sélection : un panneau latéral liste les champs
modifiables (couche, catégorie, lieux autorisés, boucle, volume, poids, fourchettes volume / hauteur /
vitesse, actif). Chaque champ a une case « modifier » : seuls les champs cochés sont appliqués. Pour
les lieux : « remplacer », « ajouter » ou « retirer ». Un aperçu dit « 40 sons, 3 champs » avant
`PATCH /api/sounds` (une seule requête, une seule transaction, refusée en entier si invalide).

## 7. « Simuler une nuit »

- Réglages en haut : graine (vide = au hasard, affichée « Aventure #4821 »), niveau du perso, minuteur
  du son (15 min à 2 h), heure du réveil, plus les réglages du moteur (moment, météo, zone, type,
  intensité) laissés sur « au hasard » par défaut. Les réglages vont dans l'URL : une simulation se
  partage et se rejoue.
- Le générateur de `shared` tourne **dans le navigateur** sur le contenu chargé (y compris un
  brouillon non enregistré : « simuler avec mes modifications »). Pas d'appel serveur.
- Résultat :
  - **chronologie** : une frise horizontale par couche (ambiance, action, ponctuels, transitions),
    une ligne pour la quête en cours, la courbe d'intensité, la frontière « son coupé » ; au survol, la
    scène, le son tiré et ses variations ; clic → la fiche concernée ;
  - **liste** des événements, minute par minute, pour lire en détail ;
  - **résumé du matin** tel que l'iPhone l'affichera, en français ;
  - **avertissements** de la génération (son manquant remplacé par le secours, table vide…).
- Bouton « Écouter un extrait » (option, plus tard) : jouer 2 minutes de la nuit depuis la position
  choisie avec les vrais sons.

## 8. Localisation

- **Textes de l'admin** : i18next, un fichier `fr`, même méthode que `apps/mobile`.
- **Champs localisés** : le champ affiche le français, toujours présent et obligatoire, et un petit
  sélecteur de langue (onglets `FR | EN`) ; une langue vide affiche le français en grisé (« repli :
  … »). Un réglage global « langue d'édition » permet de remplir l'anglais fiche après fiche.
- Vérification : « 12 textes sans anglais » est une **information**, pas un problème, tant que
  l'anglais n'est pas lancé.
- La simulation a un sélecteur de langue pour lire le résumé avec le repli réel.

## 9. Ce que l'admin attend du serveur (étape 3)

`GET /api/content` (tout le catalogue, léger), `GET/POST/PATCH /api/content/:collection(/:id)`,
`POST /api/content/:collection/:id/archive|unarchive`, `GET /api/check`, `GET/PATCH /api/sounds`,
`POST /api/sounds/uploads`, `GET /api/sounds/imports/:batch`, `POST /api/sounds/imports/:batch/commit`,
`GET /api/sounds/:id/file?variant=aac|original`, `GET /api/chronicles`, `POST /api/session`. Le
serveur sert aussi le `dist/` de l'admin. Un `id` ne change jamais une fois créé (références).

## 10. Tâches, dans l'ordre

1. **Schéma partagé** : `FieldSpec` / `CollectionSpec` pour toutes les collections, `validateEntry`,
   `checkContent`, `parseSoundFilename`, avec des tests (si pas fini à l'étape 2).
2. **Socle admin** : Mantine, TanStack Router + Query, i18next, client API typé, proxy Vite vers le
   serveur, cadre (barre, colonne des collections), écran de connexion.
3. **Éditeur générique** : `FieldInput` pour chaque `kind`, `EntryForm`, écran Collection (table +
   filtres URL), écran Fiche (créer, modifier, archiver, « Utilisée par »).
4. **Badge et filtre IA**, « Marquer comme réécrite ».
5. **Vérification** : vue d'ensemble + écran Vérification, erreurs sous les champs, refus serveur
   affiché.
6. **Vue Sons** : table dédiée, lecteur partagé, filtres, onglet Non classés.
7. **Édition en lot des sons** (panneau, champs cochés, `PATCH` groupé).
8. **Import** : dépôt multiple / zip, progression, revue du mapping, validation du lot.
9. **Fiche d'un son** avec forme d'onde et « Écouter une variante ».
10. **Simuler une nuit** : réglages, chronologie, liste, résumé, avertissements.
11. **Chroniques** en lecture seule.
12. **Localisation** des champs (onglets, repli visible), langue d'édition.
13. Construire l'admin dans le serveur, essai sur le Pi via Tailscale, puis mettre `DESIGN.md` à jour.

Chaque tâche : `npm run typecheck`, et des tests (Vitest) pour ce qui est dans `shared`.

## 11. Questions pour le propriétaire

1. **Kit UI** : Mantine (complet, sans Tailwind) te va, ou tu préfères shadcn/ui + Tailwind ?
2. **Édition en lot** : panneau « modifier N sons » suffit, ou tu veux un vrai tableur (coller une
   colonne depuis Excel, poignée de recopie) ? Le second pousserait vers Glide Data Grid.
3. **Fourchettes de variation par catégorie** : collection « catégories de sons » à part (un réglage
   par catégorie, hérité par les sons, surchargé par son) ? Une catégorie inconnue à l'import est-elle
   créée automatiquement ?
4. **Tables d'événements et scènes** : JSON brut au début (comme Valdorne), ou un éditeur dédié
   (lignes pondérées avec un total en % visible) dès cette étape ?
5. **Refus à l'enregistrement** : bloquer seulement les nouvelles références cassées (proposé), ou
   tout problème nouveau comme Valdorne ?
6. **Historique** : garder les versions précédentes d'une fiche (pour annuler), ou l'archivage suffit ?
7. **Brouillon et publication** : une modification part tout de suite dans le catalogue synchronisé,
   ou faut-il un bouton « Publier » pour que l'iPhone ne reçoive pas un contenu à moitié édité ?
8. **Simulation** : faut-il pouvoir **écouter** un extrait de la nuit dans l'admin dès maintenant ?
9. **Mot de passe** : un seul, défini dans une variable d'environnement du serveur, ça suffit ?
10. **Doublons à l'import** : remplacer le fichier d'un son existant (même nom) ou toujours ajouter
    une variante ?
