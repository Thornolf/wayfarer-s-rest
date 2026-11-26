# Étape 3 — le serveur sur le Pi (plan)

Plan pour l'issue #4, rédigé le 26 novembre 2026. Il s'appuie sur `docs/DESIGN.md` ; rien ici ne
contredit une décision déjà prise, et les points à trancher sont en fin de document.

Point de départ : `apps/server/src/index.ts` ne répond qu'à `/health` (`node:http`, port 4600,
lancé par `tsx`). `packages/shared` ne contient encore que `LocalizedText` : le schéma des
collections arrive avec l'étape 2, donc le serveur doit rester **générique sur les collections** et
valider avec le schéma partagé dès qu'il existe.

## 1. Ce que dit la recherche

### Framework HTTP

- Les comparatifs 2026 convergent : Fastify pour un serveur Node classique, Hono pour le
  multi-runtime (Workers, Bun, Deno), Express 5 surtout pour l'existant. Les écarts de débit
  (Fastify ≈ Hono > Express 5) ne comptent pas pour un seul utilisateur.
  [Better Stack](https://betterstack.com/community/guides/scaling-nodejs/fastify-vs-express-vs-hono/),
  [benchmarks Fastify](https://www.fastify.dev/benchmarks/),
  [PkgPulse](https://www.pkgpulse.com/guides/hono-vs-express-vs-fastify-2026).
- Le point décisif ici, ce sont les **gros envois** : `@fastify/multipart` (busboy) donne un flux par
  fichier, à écrire sur disque avec `pipeline`, avec des limites `fileSize`/`parts` (1 Mo par défaut,
  à relever) et un drapeau `truncated` à vérifier.
  [README @fastify/multipart](https://www.npmjs.com/package/@fastify/multipart),
  [issue #496 sur les limites par requête](https://github.com/fastify/fastify-multipart/issues/496).
  Côté Hono, `parseBody()` passe par `formData()` et garde le fichier en mémoire ; le streaming
  demande un paquet tiers jeune ([doc upload Hono](https://hono.dev/examples/file-upload),
  [hono-upload](https://www.npmjs.com/package/hono-upload),
  [TanStack #5704](https://github.com/TanStack/router/issues/5704)).

### Stockage

- `node:sqlite` est intégré à Node, sans drapeau depuis 22.13, au niveau « 1.2 Release candidate »
  depuis 24.15, et expose `sqlite.backup()` (sauvegarde à chaud, promesse).
  [Doc Node 24 sqlite](https://nodejs.org/docs/latest-v24.x/api/sqlite.html). Pas de
  `db.transaction()` : on écrit `BEGIN`/`COMMIT` soi-même
  ([comparatif photostructure](https://photostructure.github.io/node-sqlite/documents/library-comparison.html)).
- `better-sqlite3` reste la valeur sûre mais c'est un module natif à compiler sur ARM.
- En mode WAL, copier le fichier ne suffit pas : passer par l'API de sauvegarde ou `VACUUM INTO`.
  [sqlite.org/backup](https://sqlite.org/backup.html),
  [OneUptime, WAL](https://oneuptime.com/blog/post/2026-09-08-back-up-wal-mode-sqlite-safely/view).
- Des fichiers JSON à plat (ou LowDB) ne donnent ni transactions ni numéro de version global, qui est
  justement le cœur de la synchro : écarté.
- Node : 26 est passé LTS fin octobre 2026, 24 est encore maintenu jusqu'en avril 2028.
  [Release schedule](https://nodejs.org/en/blog/announcements/evolving-the-nodejs-release-schedule).

### Son

- `loudnorm` en une passe est **dynamique** (il compresse) ; en deux passes avec `linear=true`, c'est
  un gain constant. Le mode linéaire retombe en silence sur le dynamique si le gain ferait dépasser
  le true peak : lire `normalization_type` dans le JSON de la 2e passe. `loudnorm` suréchantillonne
  aussi à 192 kHz en interne : fixer `-ar` en sortie.
  [DEV, deux passes](https://dev.to/masonwritescode/two-pass-loudness-normalization-with-ffmpeg-loudnorm-the-right-way-1nm3),
  [liste ffmpeg-user](https://ffmpeg.org/pipermail/ffmpeg-user/2022-March/054425.html),
  [FAQ ffmpeg-normalize](https://slhck.info/ffmpeg-normalize/advanced/faq/).
- AAC : qualité `aac_at` (macOS seulement) ≥ `libfdk_aac` (non libre, rarement dans les paquets) >
  `aac` natif. Sur le Pi ce sera l'`aac` natif, en CBR ; `-movflags +faststart` met l'index en tête.
  [Wiki ffmpeg Encode/AAC](https://fftrac-bg.ffmpeg.org/wiki/Encode/AAC).
- **Boucles sans couture** : l'AAC ajoute des échantillons d'amorçage (2112 chez Apple) et du
  remplissage jusqu'à la fin de la trame ; ils sont signalés par `iTunSMPB` ou une liste d'édition
  (`elst`), et le support de ffmpeg est inégal.
  [Apple TN2258](https://developer.apple.com/library/ios/technotes/tn2258/_index.html),
  [QuickTime, annexe G](https://developer.apple.com/documentation/quicktime-file-format/appendix_g_audio_priming_handling_encoder_delay_in_aac.md),
  [trac #9140](https://lists.ffmpeg.org/pipermail/ffmpeg-trac/2021-September/059833.html),
  [trac #10477](https://trac.ffmpeg.org/ticket/10477).
  Les lecteurs haut niveau (AVPlayer, expo-av) laissent un trou en boucle ; contournements connus :
  fondu croisé entre deux lecteurs, ou format sans délai d'encodeur (WAV/ALAC).
  [Apple Forums 677188](https://developer.apple.com/forums/thread/677188),
  [forum Expo](https://forums.expo.dev/t/continuously-looping-audio-produces-glitches/23010),
  [Vimeo, gapless](https://medium.com/vimeo-engineering-blog/a-brief-history-of-gapless-audio-and-what-you-can-do-about-it-ea9e1c343215).

### Synchro hors ligne

- Motif classique : chaque écriture reçoit un numéro de séquence global ; le client tire « tout ce
  qui est après N » ; les suppressions passent dans le même flux (tombstones), sinon elles
  réapparaissent. [jsr @spy4x/realtime](https://jsr.io/@spy4x/realtime/doc/changes/),
  [techinterview, cursor sync](https://www.techinterview.org/post/3233468501/lld-cursor-based-sync/).
- Piège connu : avec plusieurs écrivains concurrents, un numéro attribué tôt peut être validé tard et
  le curseur le saute ([memry #273](https://github.com/memrynote/memry/issues/273)). SQLite n'a
  qu'un écrivain à la fois : si le numéro est pris **dans** la transaction d'écriture, le problème
  disparaît. Et comme on archive au lieu de supprimer, pas de purge de tombstones ni de « curseur
  trop vieux ».
- Envois idempotents : le brouillon IETF `Idempotency-Key` (rejouer = même réponse, même clé avec
  un autre contenu = 422, en cours = 409).
  [draft-ietf-httpapi-idempotency-key-header-07](https://datatracker.ietf.org/doc/html/draft-ietf-httpapi-idempotency-key-header).
  Plus simple ici : un `PUT` sur un identifiant choisi par le téléphone, idempotent par nature.
- Ordre côté client : tirer d'abord, puis vider la file d'envoi
  ([getstream](https://getstream.io/blog/sync-chat-state-offline/)).
- Téléchargement dans l'app : `File.downloadFileAsync(url, destination)` dans `expo-file-system`
  (API objet stable depuis SDK 54) ; le reprenable n'existe que dans `expo-file-system/legacy`.
  [Doc SDK 58](https://docs.expo.dev/versions/v58.0.0/sdk/filesystem/),
  [blog Expo](https://expo.dev/blog/expo-file-system). Pas de dézippage dans Expo Go : un pack sera
  une **liste de fichiers**, pas une archive.

### Accès et Pi

- Tailscale Serve termine le HTTPS et ajoute `Tailscale-User-Login` / `Tailscale-User-Name` (il
  efface ceux envoyés par le client) ; pas d'en-têtes pour les appareils tagués ni pour Funnel ; le
  service doit n'écouter que sur `127.0.0.1`, sinon on peut les forger.
  [Tailscale Serve](https://tailscale.com/kb/1312/serve),
  [Tailscale identity](https://tailscale.com/docs/concepts/tailscale-identity).
- C'est déjà le montage de la Toolbox sur ce Pi (HTTPS Tailscale sur :8443 → service local, mot de
  passe applicatif par-dessus) : on reprend le même schéma sur un autre port.
- systemd ou Docker : l'usure de la carte SD vient des écritures (logs, couches Docker sous
  `/var/lib/docker`), pas de l'outil ; reconstruire des images sur le Pi est lent, systemd est plus
  simple pour un seul service Node + ffmpeg d'apt.
  [dzombak, usure SD](https://dzombak.com/blog/2024/04/Pi-Reliability-Reduce-writes-to-your-SD-card.html),
  [Node-RED, Docker ou non](https://discourse.nodered.org/t/benefits-to-running-node-red-in-docker-vs-on-raspberry-pi-itself/12188).

## 2. Pile recommandée

| Choix | Pourquoi |
| --- | --- |
| **Node 24 ou 26 LTS** (arm64), TypeScript lancé par `tsx` comme aujourd'hui | Pas d'étape de build ; `@wayfarers-rest/shared` est en `.ts` et Node refuse le retrait de types dans `node_modules`. Option : un bundle esbuild plus tard. |
| **Fastify 5** + `@fastify/multipart`, `@fastify/static`, `@fastify/cookie`, `@fastify/rate-limit` | Envois en flux vers le disque, fichiers statiques avec `Range`, cycle de vie propre, typage correct. |
| **`node:sqlite`** (WAL), migrations en SQL numérotées | Zéro module natif sur ARM, sauvegarde à chaud intégrée. Repli : `better-sqlite3` (même modèle synchrone). |
| **ffmpeg / ffprobe** d'apt, appelés par `child_process.spawn` | Pas de wrapper (fluent-ffmpeg est abandonné) ; deux appels bien connus suffisent. |
| Validation : le schéma de `packages/shared` | Même règle pour l'admin, l'app et le serveur. |
| Tests : `node:test` lancé par `tsx --test` | Rien à ajouter ; une base SQLite temporaire par test. |

## 3. Stockage

Racine `DATA_DIR` (par défaut `/var/lib/wayfarers-rest`, sur le SSD si le Pi en a un) :

```
DATA_DIR/
  wayfarer.sqlite (+ -wal, -shm)
  sounds/originals/<sha256>.<ext>      original tel qu'envoyé, jamais modifié
  sounds/converted/<sha256>.m4a        sortie de la conversion, nommée par son propre hash
  uploads/                             fichiers en cours de réception (nettoyés au démarrage)
  backups/wayfarer-AAAAMMJJ.sqlite     copies de la base (14 jours)
```

Les fichiers adressés par leur hash : un même son importé deux fois n'est stocké qu'une fois, et une
URL de fichier ne change jamais de contenu (cache `immutable` côté app).

Tables :

- `content_entries(collection, id, data JSON, archived_at, ai_generated, version, updated_at)`,
  clé `(collection, id)`. `version` = valeur du compteur global au moment de l'écriture. Les champs
  de jeu (y compris `aiGenerated`) restent dans `data` ; `ai_generated` n'est qu'un index de filtre.
- `content_revisions(collection, id, version, data, written_at)` : chaque écriture, pour revenir en
  arrière dans l'admin. Peu coûteux, utile tant que le monde est réécrit à la main.
- `meta(key, value)` : `catalogue_version` (le compteur), `schema_version`.
- `sound_files(id, original_sha256, original_name, original_ext, bytes, status, error,
  converted_sha256, converted_bytes, duration_ms, sample_rate, channels, loudness_json,
  pipeline_version, created_at)`. `status` ∈ `pending | converting | ready | failed`. C'est la
  partie technique ; la partie éditable (couche, catégorie, lieux, boucle, volume, poids,
  fourchettes, actif) est un document de la collection `sounds` qui pointe vers `sound_files.id`.
- `jobs(id, kind, payload, status, attempts, last_error, created_at)` : file de conversion
  persistante, reprise au redémarrage.
- `import_batches(id, created_at, file_count, unmatched_count)` pour l'écran « dernier import ».
- `night_reports(id, character_id, seed, started_at, woke_at, catalogue_version, payload JSON,
  payload_sha256, received_at)` : le journal des nuits.
- `character_backups(character_id, revision, payload JSON, payload_sha256, saved_at)`, on garde les
  30 dernières par perso.
- `devices(id, name, token_hash, created_at, last_seen_at, revoked_at)` et
  `admin_sessions(token_hash, created_at, expires_at)`.

## 4. API

`app` = l'app iPhone (jeton d'appareil), `admin` = l'admin web (cookie de session).

| Méthode | Chemin | Rôle | Qui |
| --- | --- | --- | --- |
| GET | `/health` | Vivant, version du code, version du catalogue | systemd, moi |
| POST | `/api/admin/session` | Connexion (mot de passe) → cookie | admin |
| DELETE | `/api/admin/session` | Déconnexion | admin |
| GET | `/api/catalogue?since=N` | Changements après la version N (0 = tout), archivés compris | app, admin |
| GET | `/api/admin/collections/:collection` | Liste, filtres `archived`, `aiGenerated`, recherche | admin |
| GET | `/api/admin/collections/:collection/:id` | Un document et ses révisions | admin |
| PUT | `/api/admin/collections/:collection/:id` | Créer ou remplacer ; `If-Match: <version>` contre l'écrasement | admin |
| POST | `/api/admin/collections/:collection/:id/archive` (et `/unarchive`) | Archiver, jamais supprimer | admin |
| GET | `/api/admin/check` | Vérification : références cassées, catégories sans son | admin |
| POST | `/api/admin/sounds/import` | Envoi multipart en lot → un lot, un `sound_files` + un document `sounds` par fichier | admin |
| GET | `/api/admin/sounds/imports/:batchId` | État du lot (conversions, non classés) | admin |
| POST | `/api/admin/sounds/:id/reconvert` | Relancer la conversion (après échec ou nouveaux réglages) | admin |
| GET | `/api/admin/sounds/:id/original` | Télécharger l'original | admin |
| GET | `/api/packs` | Liste des packs (une par zone + `commun`) avec taille et hash | app |
| GET | `/api/packs/:packId` | Manifeste : fichiers (sha256, md5, octets, durée, URL) | app |
| GET | `/files/sounds/:sha256.m4a` | Le fichier converti, `Range`, `Cache-Control: immutable` | app, admin |
| PUT | `/api/reports/:reportId` | Rapport de nuit, id choisi par le téléphone (idempotent) | app |
| GET | `/api/reports?characterId=&before=` | Le journal (Chroniques), paginé | app, admin |
| PUT | `/api/characters/:characterId/backups/:revision` | Sauvegarde du perso (idempotent) | app |
| GET | `/api/characters/:characterId/backups/latest` | Restauration sur un nouveau téléphone | app |
| GET/POST/DELETE | `/api/admin/devices` | Créer (jeton affiché une fois) ou révoquer un jeton d'appareil | admin |
| GET | `/api/admin/export` | Tout le catalogue en JSON (sauvegarde lisible, retour vers le dépôt) | admin |
| GET | `/admin/*` | L'admin construite (`apps/admin/dist`), repli sur `index.html` | navigateur |

Erreurs : JSON `{ error: { code, message } }`, `code` stable en anglais (l'admin et l'app le
traduisent), jamais de texte français en dur dans le serveur.

## 5. Synchro app ↔ serveur

**Catalogue.** Le serveur tient un compteur `catalogue_version`. Chaque écriture de contenu, dans la
même transaction : compteur + 1, ligne mise à jour avec cette version, révision ajoutée. L'app garde
la dernière version reçue et appelle `GET /api/catalogue?since=N` :

```json
{ "version": 412, "schemaVersion": 3,
  "changes": [{ "collection": "zones", "id": "foret-de-brume", "version": 411,
                "archived": false, "data": { } }] }
```

- Écrivain unique (SQLite) : les versions sont validées dans l'ordre, aucun trou possible.
- Rien n'est supprimé, donc l'archivage est le « tombstone » et `since=0` reste toujours valable.
- `ETag: "412"` et `If-None-Match` → `304` : le contrôle à l'ouverture de l'app ne coûte rien.
- Si `schemaVersion` dépasse ce que l'app connaît, elle garde son catalogue et le signale (« mets
  l'app à jour ») plutôt que d'appliquer des données qu'elle ne comprend pas.
- La nuit enregistre la `catalogue_version` avec laquelle elle a été générée (dans le rapport).

**Packs de sons.** Un pack par zone, plus un pack `commun` (actions, transitions, quêtes, sons de
secours : tout son sans lieu). Le manifeste liste les sons **actifs et convertis** utilisables dans
la zone (via les lieux autorisés), avec `sha256`, `md5` (le seul hash que `expo-file-system` sait calculer sur le téléphone), octets, durée, URL ; son `packHash` est le hash de
la liste triée. L'app :

1. compare `packHash` avec le sien ; si différent, télécharge les fichiers dont le hash lui manque
   (`File.downloadFileAsync`), vérifie la taille, puis enregistre le nouveau manifeste ;
2. stocke les fichiers par hash, partagés entre zones, et supprime ceux qu'aucun manifeste local ne
   cite ;
3. avant une aventure : met à jour `commun` et la zone tirée ; sans réseau, ne tire que parmi les
   zones complètes.

**File d'envoi (outbox).** Sur le téléphone, chaque rapport de nuit et chaque sauvegarde de perso
entre dans une file persistante avec son identifiant (UUID créé au début de la nuit ; révision
croissante pour le perso). Au retour du réseau : tirer le catalogue, puis vider la file dans l'ordre.

- `PUT /api/reports/:id` : premier envoi `201`, renvoi identique `200`, même id avec un autre
  contenu `409` (comparaison par `payload_sha256`). L'app retire l'élément sur `200/201`, le garde
  et réessaie plus tard sur erreur réseau ou `5xx`, l'écarte en le journalisant sur `4xx`.
- `PUT /api/characters/:cid/backups/:revision` : même règle. Le téléphone est la source de vérité ;
  le serveur garde l'historique, ne fusionne rien.

## 6. Import et conversion des sons

1. **Réception** : `POST /api/admin/sounds/import`, multipart, plusieurs fichiers. Chaque fichier
   est écrit en flux dans `uploads/` en calculant son SHA-256 ; limite 300 Mo par fichier et
   `truncated` vérifié. Déjà connu (même hash) → on renvoie le son existant.
2. **Rangement** : déplacement vers `sounds/originals/<sha256>.<ext>`, ligne `sound_files` en
   `pending`, document `sounds` créé (catégorie remplie par le mapping), tâche `convert` en file.
3. **Mapping par nom** : minuscules, extension et accents retirés, découpe sur `__`.
   - `couche__categorie__nn` (`ambiance__foret__01`) ;
   - `couche__categorie__lieux__nn` (`ponctuel__oiseau__foret__01`).
   La couche doit être connue, la catégorie et les lieux sont cherchés par identifiant dans le
   catalogue, `nn` doit être numérique. Sinon : catégorie `non-classes`, avec la raison
   (« couche inconnue : … ») pour l'écran de correction. Rien n'est inventé : une catégorie absente
   n'est pas créée automatiquement.
4. **Conversion** (une tâche à la fois, le Pi est petit ; reprise au démarrage) :
   - `ffprobe` : durée, canaux, fréquence ; refus si pas de piste audio ;
   - passe 1 : `loudnorm=I=-20:TP=-2:LRA=11:print_format=json` sur `-f null` ;
   - passe 2 : mêmes cibles + `measured_*` + `linear=true`, `-ar 44100`, `-c:a aac -b:a 160k`
     (stéréo) ou `96k` (mono), `-movflags +faststart` ; lecture de `normalization_type` ; si
     `dynamic`, on garde le fichier et on note un avertissement (visible dans la vérification) ;
   - sons de moins de 3 s (ponctuels) : la mesure intégrée n'est pas fiable (blocs de 400 ms) ; on
     normalise sur le pic ou le RMS avec `volume`, au lieu de `loudnorm` ;
   - hash de la sortie, `ready`, durée réelle relue par `ffprobe` sur le m4a.
   `pipeline_version` est stocké : changer les réglages = reconvertir tout depuis les originaux.
5. **Boucles d'ambiance.** Deux soucis, traités séparément :
   - *la jointure du contenu* : un son coupé n'importe où claque en boucle. L'import peut proposer
     (option par son) un fondu de jointure : les dernières 500 ms fondues dans le début, fichier
     raccourci d'autant ;
   - *le trou de l'encodeur* : amorçage AAC et remplissage. À vérifier sur l'iPhone avec
     `expo-audio` en `loop` : (a) AAC tel quel, (b) ALAC en `.m4a` (sans perte, sans délai, ~2× plus
     gros), (c) WAV. Le serveur sait produire (a) ou (b) selon un réglage `loopEncoding` ; si les
     deux font un trou, la boucle se fera dans l'app par fondu croisé entre deux lecteurs (ce qui
     sert aussi le « point de départ au hasard » prévu par la conception).

## 7. Accès

- **Réseau** : Fastify écoute sur `127.0.0.1:4600` uniquement ; `tailscale serve --bg
  --https=<port> http://127.0.0.1:4600` publie en HTTPS sur le tailnet (même montage que la Toolbox,
  sur un port à part). Aucun Funnel.
- **Admin** : mot de passe dont seul le hash `scrypt` (`node:crypto`) est dans le fichier
  d'environnement. Connexion → jeton aléatoire, cookie `HttpOnly; Secure; SameSite=Strict`, 30 jours,
  hash du jeton en base. Limite de 5 essais par minute. Préféré à l'auth Basic : vraie déconnexion,
  pas de fenêtre du navigateur, et l'admin est servie par la même origine (pas de CORS ; en
  développement, le proxy de Vite).
- **App** : jeton d'appareil (`Authorization: Bearer`), créé dans l'admin, affiché une fois, hash en
  base, révocable ; saisi une fois dans l'app et gardé par `expo-secure-store` (dans Expo Go).
- **En plus** : `Tailscale-User-Login` est journalisé ; option `ALLOWED_TAILSCALE_LOGIN` pour refuser
  toute requête qui n'a pas le bon (attention : absent si l'appareil est tagué).

## 8. Déploiement et sauvegardes

- Utilisateur système `wayfarer`, code dans `/opt/wayfarers-rest` (clone du dépôt, `npm ci`,
  build de l'admin), données dans `/var/lib/wayfarers-rest` (`StateDirectory=`).
- Unité `wayfarers-rest.service` : `ExecStart=npx tsx apps/server/src/index.ts`,
  `EnvironmentFile=/etc/wayfarers-rest.env` (`PORT`, `DATA_DIR`, `ADMIN_PASSWORD_HASH`),
  `Restart=on-failure`, `WantedBy=multi-user.target`, durcissement (`NoNewPrivileges`,
  `ProtectSystem=strict`, `ReadWritePaths=/var/lib/wayfarers-rest`, `PrivateTmp`). Logs dans
  journald, niveau `info`, pas de log par requête de fichier.
- Le service `tailscale serve --bg` est persistant chez Tailscale ; rien à ajouter au démarrage.
- **Mise à jour** : script `apps/server/scripts/deploy.sh` (pull, `npm ci`, build admin, migrations
  au démarrage, `systemctl restart`). Automatisable plus tard par le runner auto-hébergé déjà présent
  sur le Pi, si le dépôt reste privé.
- **Sauvegardes** : timer systemd quotidien qui lance `tsx apps/server/scripts/backup.ts` :
  `sqlite.backup()` vers `backups/wayfarer-AAAAMMJJ.sqlite`, garde 14 jours, plus un export JSON du
  catalogue. Les originaux sont des fichiers immuables nommés par hash : copie incrémentale
  (`rsync` ou `restic`) vers un autre disque. Les fichiers convertis et les packs se refont depuis
  les originaux : pas besoin de les sauvegarder.
- **Restauration** testée une fois avant de clore l'étape : base copiée + originaux → service
  relancé → `reconvert` global → catalogue et sons identiques.

## 9. Tâches dans l'ordre

1. Squelette Fastify : config par environnement, `/health`, journalisation, arrêt propre ; base
   SQLite en WAL et migrations au démarrage ; tests `node:test` sur base temporaire.
2. Magasin de contenu : `content_entries`, révisions, compteur de version, archivage, `If-Match`,
   validation par le schéma partagé (dès l'étape 2) ; semis du monde de départ au premier démarrage.
3. Auth : sessions admin, jetons d'appareil, limite de connexion, en-tête Tailscale.
4. `GET /api/catalogue?since=` avec ETag/304 ; export JSON.
5. Import des sons : réception en flux, hash, dédoublonnage, mapping par nom, « Non classés », lots.
6. File de tâches et conversion ffmpeg (deux passes, cas des sons courts, avertissements) ;
   reconvertir.
7. Vérification du contenu (références cassées, catégories sans son, conversions en échec).
8. Packs : manifestes par zone + `commun`, service des fichiers avec `Range` et cache.
9. Rapports de nuit et sauvegardes de perso (PUT idempotents), journal paginé.
10. Service de l'admin construite sous `/admin`.
11. Déploiement sur le Pi : unité systemd, `tailscale serve`, timer de sauvegarde, script de mise à
    jour, restauration testée ; section « Serveur » dans `docs/DESIGN.md`.
12. Essai des boucles sur l'iPhone (AAC / ALAC / WAV) et choix de `loopEncoding`.

## 10. Questions pour le propriétaire

1. **Publication** : une modification de l'admin part-elle tout de suite vers le téléphone, ou
   faut-il un bouton « Publier » (le catalogue servi à l'app n'avance qu'à ce moment) pour ne pas
   jouer une zone à moitié écrite ?
2. **Noms de fichiers** : la liste fermée des couches (`ambiance`, `action`, `ponctuel`, `quete`,
   `transition` ?) ; plusieurs lieux dans le nom (`ponctuel__oiseau__foret+plaine__01`) ?
   Le lieu peut-il aussi suivre une ambiance (`ambiance__pluie__foret__01`) ?
3. **Cible de volume** : -20 LUFS pour tout, ou une cible par couche (ambiance plus basse) en plus
   du volume réglable par son ?
4. **Boucles** : accepte-t-on des fichiers ~2× plus gros (ALAC) pour les ambiances si l'AAC fait un
   trou ? Le fondu de jointure automatique est-il bienvenu ?
5. **Disque** : le Pi a-t-il un SSD pour `DATA_DIR`, et où va la copie des sauvegardes hors du Pi ?
6. **Accès de l'app** : jeton d'appareil en plus de Tailscale, ou Tailscale seul suffit pour l'app ?
7. **Port Tailscale** et nom : un port HTTPS à part (ex. 8444) à côté de la Toolbox, ou un chemin
   derrière elle ?
8. **Rétention** : tout garder pour les rapports (le journal) ; combien de sauvegardes de perso ?
9. **Déploiement automatique** par le runner du Pi tout de suite, ou à la main pour commencer ?

Note : pendant la recherche, `trac.ffmpeg.org`, `tailscale.com` et `slhck.info` n'étaient pas
joignables depuis le bac à sable ; les points tirés de ces pages viennent des résultats de recherche
et sont à revérifier sur place.
