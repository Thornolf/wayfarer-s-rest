# Étape 5 — l'app iPhone : plan

Plan de l'étape 5 de `docs/DESIGN.md` (issue #6) : Aventure, lecture, résumé, notification, perso,
gear, synchro. Rédigé le 26 novembre 2026, d'après `docs/DESIGN.md`, la maquette (`wayfarers-rest.html`)
et le code actuel de `apps/mobile` (un écran d'accueil provisoire, `expo-audio`, i18n).

Dépendances : le générateur de nuit (étape 2, `packages/shared`, vide pour l'instant) et l'API du
serveur (étape 3). Les tâches ci-dessous commencent avec des données de test et branchent le vrai
générateur et le vrai serveur dès qu'ils existent.

## 1. Ce que dit la recherche

**Méthode.** `docs.expo.dev` et `unpkg.com` ne sont pas joignables depuis le bac à sable cloud. Les
docs SDK 58 ont été lues dans leurs sources sur GitHub
(`expo/expo/docs/pages/versions/v58.0.0/sdk/*.mdx`). Les signatures ont été lues dans les paquets npm
eux-mêmes, aux versions de `node_modules/expo/bundledNativeModules.json`. Les liens `docs.expo.dev`
ci-dessous sont les pages officielles correspondantes.

| Sujet | Constat | Source |
|---|---|---|
| Modules dans Expo Go | Tous les modules retenus figurent dans `bundledNativeModules.json` du SDK 58 : `expo-router ~58.0.33`, `expo-notifications ~58.1.10`, `expo-file-system ~58.0.15`, `expo-sqlite ~58.0.18`, `expo-network ~58.0.6`, `expo-keep-awake ~58.0.4`, `expo-background-task ~58.0.13`, `@react-native-async-storage/async-storage 2.2.0`. `react-native-mmkv` n'y est pas. | fichier local |
| Son en arrière-plan dans Expo Go | Le `Info.plist` d'Expo Go déclare `UIBackgroundModes` = `audio`, `fetch`, `location`, `remote-notification`, `processing`. Le plugin `expo-audio` de `app.json` ne s'applique qu'à un build natif (« require building a new app binary »), mais Expo Go a déjà le mode `audio`. Des retours anciens disent que ça ne marche pas dans Expo Go : c'est exactement ce que l'étape 1 vérifie sur l'iPhone. | [Info.plist Expo Go](https://github.com/expo/expo/blob/main/apps/expo-go/ios/Exponent/Supporting/Info.plist), [doc audio v58](https://docs.expo.dev/versions/v58.0.0/sdk/audio/), [forum Expo](https://forums.expo.dev/t/help-background-audio-not-working-on-ios/58706) |
| `expo-audio` | `createAudioPlayer` survit aux composants mais exige `release()`. Les propriétés `volume`, `loop` et `playbackRate` existent, ainsi que `setPlaybackRate(rate, quality)`, `shouldCorrectPitch`, `seekTo`, `replace` et `preload()`/`clearPreloadedSource()`. Aucun fondu natif n'existe : les fondus sont des rampes de volume faites en JS. `setActiveForLockScreen` demande `interruptionMode: 'doNotMix'`. | typings `expo-audio` installés, [doc audio v58](https://docs.expo.dev/versions/v58.0.0/sdk/audio/) |
| Minuteries JS en arrière-plan | iOS suspend le JS d'une app en arrière-plan, sauf si une session audio joue. Il ne faut pas compter sur `setInterval` hors lecture : on stocke des horodatages et on recalcule au retour. | [Newly, timers](https://newly.app/guides/timers-and-background-work), [dev.to](https://dev.to/shivampawar/efficiently-managing-timers-in-a-react-native-app-overcoming-background-foreground-timer-state-issues-map) |
| Notifications locales | Elles marchent dans Expo Go. Seul le push distant a été retiré, et le paquet l'écrit (« Local notifications remain available »). En SDK 58, le module affiche un avertissement « not fully supported in Expo Go » au chargement. Il propose un déclencheur `SchedulableTriggerInputTypes.DATE`, ainsi que `getLastNotificationResponse()`, `useLastNotificationResponse()` et `addNotificationResponseReceivedListener`. iOS limite à 64 le nombre de notifications planifiées ; on n'en planifie qu'une. | paquet `expo-notifications@58.1.10`, [doc v58](https://docs.expo.dev/versions/v58.0.0/sdk/notifications/), [forums Apple](https://developer.apple.com/forums/thread/811171) |
| `expo-background-task` | **Pas dans Expo Go.** Le code du module le refuse (« not available in Expo Go ») et renvoie `Restricted`. iOS décide seul du moment de la tâche, et un balayage dans le sélecteur d'apps l'arrête. Le plan n'en a pas besoin. | paquet `expo-background-task@58.0.13`, [doc v58](https://docs.expo.dev/versions/v58.0.0/sdk/background-task/) |
| `expo-file-system` (nouvelle API) | Classes `File`, `Directory` et `Paths`. `File.downloadFileAsync(url, dest, { idempotent })` télécharge un fichier, et `File.createDownloadTask(url, dest, { onProgress })` donne la progression (barres de la maquette). On trouve aussi `exists`, `md5`, `Paths.availableDiskSpace`, `Paths.document`/`Paths.cache`. L'ancienne API reste dans `expo-file-system/legacy`. | paquet `expo-file-system@58.0.15`, [doc v58](https://docs.expo.dev/versions/v58.0.0/sdk/filesystem/) |
| `expo-sqlite` | Disponible dans Expo Go. Il fournit `SQLiteProvider`/`useSQLiteContext` et des migrations par `PRAGMA user_version`. `expo-sqlite/kv-store` remplace AsyncStorage avec la même API et ajoute des méthodes synchrones (`getItemSync`). | [doc v58](https://docs.expo.dev/versions/v58.0.0/sdk/sqlite/) |
| MMKV | Exige un build de développement (Nitro Modules) : **à écarter**. | [guide 2026](https://reactnativerelay.com/uk/article/mmkv-react-native-2026-shvydke-skhovyshche-shyfruvannia-zustand), [LogRocket](https://blog.logrocket.com/using-react-native-mmkv-improve-app-performance) |
| `expo-network` | Fournit `useNetworkState()`, `getNetworkStateAsync()` et `addNetworkStateListener()`, avec les champs `type`, `isConnected` et `isInternetReachable`. Il est dans Expo Go. | paquet `expo-network@58.0.6`, [doc v58](https://docs.expo.dev/versions/v58.0.0/sdk/network/) |
| `expo-keep-awake` | Fournit `useKeepAwake()` et `activateKeepAwake`/`deactivateKeepAwake`. Il est dans Expo Go. | [doc v58](https://docs.expo.dev/versions/v58.0.0/sdk/keep-awake/) |
| Expo Router | Pour l'installer : `expo-router` avec `react-native-safe-area-context`, `react-native-screens`, `expo-linking` et `expo-constants`. Il faut aussi `"main": "expo-router/entry"`, un `scheme` et le plugin dans `app.json`, des routes dans `src/app/`, et `experiments.typedRoutes`. Les onglets natifs passent sous `expo-router/native-tabs` en SDK 58 (bêta). | [installation](https://docs.expo.dev/router/installation/), [native tabs v58](https://docs.expo.dev/versions/v58.0.0/sdk/router/native-tabs/) |
| Zustand `persist` | `createJSONStorage(() => storage)` accepte tout objet `getItem/setItem/removeItem`, donc le kv-store d'`expo-sqlite`. Un stockage asynchrone réhydrate après le premier rendu ; un stockage synchrone évite ce délai. | [doc Zustand](https://zustand.docs.pmnd.rs/integrations/persisting-store-data) |
| TanStack Query hors ligne | Il faut brancher `onlineManager` sur un écouteur réseau. Les mutations en pause se perdent si on ne les persiste pas. Un cas signalé : elles repartent avant que le réseau soit vraiment revenu. | [onlineManager](https://tanstack.com/query/latest/docs/react/reference/onlineManager), [network mode](https://www.mintlify.com/tanstack/query/guides/network-mode), [fil Expo](https://www.answeroverflow.com/m/1046385577068609556) |
| UX du coucher | Fond sombre, peu de contraste, grandes cibles tactiles, peu d'interactions entre « je lance » et « je dors ». Un réglage « moins de transparence » aide les yeux fatigués. | [guide Headspace](https://blakecrosley.com/guides/design/headspace), [Dreamwell](https://www.designrush.com/best-designs/apps/dreamwell-app-design), [Sleep Cycle](https://sleepcycle.com/sleep-talk/liquid-glass) |
| Rapport « pendant ton absence » (jeux idle) | La progression hors ligne se calcule au retour à partir de l'état au départ. Un rapport détaillé l'accompagne (XP, or, butin, jalons). | [Clicker Heroes](https://blog.clickerheroes.com/offline-progression-in-clicker-heroes/embed/), [Game Bootcamp](https://seanking11.github.io/gamebootcamp/modules/34-idle-incremental) |
| `.ipa` sans Mac | Sur un runner macOS GitHub Actions : `npx expo prebuild`, puis `xcodebuild archive … CODE_SIGNING_ALLOWED=NO`, puis un zip `Payload/` en `.ipa`. SideStore signe ensuite sur l'iPhone avec l'Apple ID gratuit. Ce compte donne des profils valables 7 jours (à rafraîchir) et 3 apps au plus ; LiveContainer contourne cette limite. Notre `Info.plist` réel suivra alors `app.json` (`audio`, notifications) et ne sera plus celui d'Expo Go. | [Codemagic unsigned](https://docs.codemagic.io/yaml-quick-start/first-signed-build/), [dev.to unsigned ipa](https://dev.to/oivoodoo/build-unsigned-ios-ipa-to-install-via-sideloadly-236f), [LiveContainer + SideStore](https://livecontainer.github.io/docs/installation/lc_sidestore), [refresh 7 jours](https://livecontainer.github.io/docs/guides/refresh-verification) |
| Tailscale | Expo Go autorise le HTTP (`NSAllowsArbitraryLoads`), mais un `.ipa` maison sera soumis à l'ATS. `tailscale serve`/`tailscale cert` fournit un HTTPS valide sur `machine.tailnet.ts.net`. En contrepartie, le nom de la machine est publié dans les journaux de transparence des certificats. | [Info.plist Expo Go](https://github.com/expo/expo/blob/main/apps/expo-go/ios/Exponent/Supporting/Info.plist), [Tailscale HTTPS](https://tailscale.com/kb/1153/enabling-https/) |

## 2. Bibliothèques retenues

| Bibliothèque | Rôle | Expo Go |
|---|---|---|
| `expo-router` (+ `react-native-screens`, `react-native-safe-area-context`, `expo-linking`, `expo-constants`) | Navigation par fichiers, imposée par `AGENTS.md`. Les onglets sont dessinés en JS (`Tabs`) pour coller à la maquette ; `NativeTabs` reste en bêta. | OK dans Expo Go |
| `expo-audio` (déjà là) | Les trois couches, la variation et les fondus | OK dans Expo Go (le fond est à valider à l'étape 1) |
| `expo-notifications` | Une notification locale à l'heure du réveil | OK dans Expo Go (local seulement) |
| `expo-file-system` (API `File`/`Directory`) | Les packs de sons par zone, rangés dans `Paths.document` et non `cache`, qu'iOS peut vider | OK dans Expo Go |
| `expo-sqlite` + `expo-sqlite/kv-store` | Les Chroniques, la file d'envoi, l'index des sons ; le kv-store sert de stockage aux stores Zustand | OK dans Expo Go |
| `zustand` | L'état de l'app : perso, réglages, nuit en cours, statut de synchro. Pur JS, sans fournisseur, utilisable hors React (moteur audio, cycle de vie). | OK (pur JS) |
| `expo-network` | Savoir si l'on est en ligne, pour vider la file d'envoi | OK dans Expo Go |
| `expo-keep-awake` | Garder l'écran allumé **seulement** pendant un gros téléchargement lancé à la main, jamais la nuit | OK dans Expo Go |
| *Écartés* | `react-native-mmkv` (build de dev), `expo-background-task` (absent d'Expo Go et inutile), TanStack Query (cinq appels réseau à peine, et la file d'envoi doit vivre dans SQLite : une petite boucle maison suffit), AsyncStorage (doublon du kv-store) | — |
| *Optionnels* | `expo-brightness` (baisser la luminosité à l'écran Lecture), `react-native-reanimated` (fondus des textes) | OK dans Expo Go |

Les règles du jeu (XP, butin, auto-équipement, phrases du résumé) vont dans `packages/shared`, à côté du
générateur : l'app les applique, l'admin les simule.

## 3. Architecture de l'app

```
apps/mobile/src/
  app/                         routes Expo Router (uniquement des écrans)
    _layout.tsx                Stack racine : i18n, SQLite, hydratation, règlement de la nuit, tap notif
    (tabs)/_layout.tsx         onglets : Accueil, Personnage, Chroniques, Réglages
    (tabs)/index.tsx           Accueil
    (tabs)/personnage.tsx      Personnage + sac
    (tabs)/chroniques.tsx      Chroniques
    (tabs)/reglages.tsx        Réglages
    lecture.tsx                Lecture (plein écran, sans onglets, geste retour coupé)
    nuit/[id].tsx              Résumé du réveil (depuis Accueil, la notification ou les Chroniques)
    objet/[ref].tsx            fiche d'objet (presentation: 'formSheet')
  night/       lifecycle.ts (startNight, settleNight, isSoundPhase), active-night.ts
  audio/       conductor.ts (pur : chronologie + horloge → ordres), mixer.ts (expo-audio),
               shuffle-bag.ts, variation.ts, ramp.ts
  sync/        api.ts, catalogue.ts, packs.ts, outbox.ts, backup.ts, network.ts
  notifications/ wake.ts (permission, planifier, annuler, ouvrir le résumé)
  storage/     db.ts (migrations user_version), kv.ts
  stores/      character.ts, settings.ts, nights.ts, sync.ts (Zustand + persist)
  ui/          theme.ts (couleurs de la maquette), Card, Pill, XpBar, Coins, ItemIcon, Segmented…
  i18n/        (existant) toutes les chaînes FR de la maquette
```

**Navigation.** Il y a 4 onglets (Accueil, Personnage, Chroniques, Réglages). `lecture` est poussé
au-dessus des onglets. `nuit/[id]` revient à l'écran d'origine : c'est la pile qui gère le retour,
plus besoin du `from` de la maquette. Lien profond : `wayfarersrest://nuit/<id>`, porté par la
notification dans `data.url`.

**Stores (Zustand, persistés dans le kv-store).**
- `settings` : heure du réveil (07:30), notification activée, dernier minuteur choisi, URL du serveur.
- `character` : niveau, XP, or, équipement, sac (20 cases), compagnons rencontrés.
- `activeNight` : `{ id, seed, settings, startedAt, soundEndsAt, wakeAt, characterSnapshot,
  notificationId, zoneId }`, ou `null`. C'est la seule chose qui doit survivre à un arrêt brutal.
- `sync` : version du catalogue, date de la dernière synchro, nombre d'envois en attente.
- SQLite (pas Zustand) : `nights` (les rapports complets, pour les Chroniques), `outbox`, `sound_files`
  (son → chemin local, taille, md5), `catalogue` (le JSON du monde et sa version).

**Moteur audio** (`audio/`). Il est coupé en deux pour être testable :
- `conductor` est pur et ne connaît pas `expo-audio`. À partir de la chronologie de la nuit et de
  `now - startedAt`, il dit ce qui doit jouer : l'ambiance du lieu, l'action de la scène et la
  prochaine date d'un ponctuel. Il tire au hasard la variante (sac mélangé, sans rejouer la
  précédente), le volume (± fourchette), la vitesse (`playbackRate`, `shouldCorrectPitch = false`) et
  le point de départ d'une boucle. Les dés sont graines par la nuit et par événement. Il module
  l'intensité selon le temps restant au minuteur.
- `mixer` gère un petit parc de lecteurs `createAudioPlayer` : 2 pour l'ambiance (fondu enchaîné A/B
  plus une couche qui va et vient), 2 pour l'action, 2 ou 3 pour les ponctuels et 1 pour les
  transitions. Une seule boucle `setInterval` (~200 ms) lit l'horloge murale, applique les rampes de
  volume (pas de fondu natif) et repart d'elle-même si le JS a pris du retard. Il appelle `preload()`
  pour le son suivant, `release()` à la fin, et le son de secours de la catégorie générale s'il en
  manque un.
- Mode audio au lancement : `setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground:
  true, interruptionMode: … })`, le mode d'interruption restant à trancher (§7). À la fin :
  `setIsAudioActiveAsync(false)`, et iOS peut suspendre l'app.

**Synchro** (`sync/`). Toujours en tâche de fond, déclenchée au démarrage, au retour au premier plan
(`AppState`) et au retour du réseau (`addNetworkStateListener`) :
1. **Catalogue** : `GET /api/catalogue` avec `If-None-Match`, enregistré dans SQLite.
2. **Packs de zone** : `GET /api/zones/:id/sons` (manifeste : id, URL, taille, md5), puis un
   `File.createDownloadTask` par fichier manquant ou dont le md5 a changé, avec la progression par
   zone. On vérifie `Paths.availableDiskSpace` d'abord.
3. **File d'envoi** : table `outbox(id, kind, payload, attempts, next_attempt_at)`, vidée dans
   l'ordre avec un délai croissant entre les essais. Le serveur ignore un doublon grâce à l'`id` du
   rapport (graine + `startedAt`). On n'envoie qu'une fois `isInternetReachable` vrai **et** un
   `GET /api/health` réussi, pour éviter le « réseau pas encore revenu ».
4. **Sauvegarde du perso** : `PUT /api/personnage` avec un compteur de version. L'iPhone fait foi ;
   la restauration depuis le Pi ne sert que sur un téléphone neuf.

**Notification** (`notifications/wake.ts`). On demande la permission au premier lancement d'une
aventure, pas à l'installation. On planifie avec le déclencheur `DATE` à `wakeAt`. On annule si la
nuit est réglée avant. `useLastNotificationResponse` ouvre `nuit/[id]`, et
`clearLastNotificationResponse` évite d'y revenir deux fois.

## 4. Les écrans (d'après la maquette)

- **Accueil.** En haut, la date en eyebrow (« Jeudi 26 novembre · bonsoir »), puis le bandeau « La nuit
  dernière : … » si un résumé n'a pas été lu (il mène à `nuit/[id]`). La carte du perso montre le
  portrait, le niveau, l'or, la barre d'XP et le lieu de repos. Viennent ensuite le choix
  « Son pendant » (15 min / 30 min / 1 h / 2 h, le dernier choix est retenu) et le gros bouton
  **Aventure**, avec en sous-titre « 30 min de son ». Dessous : la phrase d'ambiance (une rumeur
  tirée du catalogue), puis la carte de la zone de départ (zone tirée au sort, « Sons téléchargés » ou
  progression) avec un lien vers Réglages › Zones. L'encart « Départs » est grisé, avec « Bientôt ».
  Le bouton est désactivé pendant le téléchargement de la zone ; hors ligne, la zone est tirée parmi
  celles déjà présentes sur l'appareil.
- **Lecture.** Fond « ciel de nuit » presque noir et peu de texte. On y voit la graine
  (« Aventure #4821 »), le bloc « En ce moment » (action, lieu, météo, qui se fondent d'une scène à
  l'autre), le compte à rebours « de son restant · puis l'aventure continue en silence jusqu'à 7 h
  30 », la courbe d'intensité et les trois couches avec leur vu-mètre et le nom du son. Suivent le
  conseil « Verrouillez le téléphone… » et le bouton **Arrêter l'aventure**, qui demande confirmation
  et règle la nuit tout de suite. Pas de `useKeepAwake` : l'écran doit pouvoir s'éteindre. Les
  vu-mètres sont simulés à partir du volume visé (`expo-audio` ne donne pas le niveau du signal à la
  lecture) et sont coupés quand l'app est en arrière-plan.
- **Résumé du réveil** (`nuit/[id]`). Il montre le badge « Synchronisé » ou « en attente de
  synchro », « Résumé du réveil · aventure #seed », le titre, le récit sur parchemin, le bloc
  « Niveau supérieur » s'il y a lieu, les trois chiffres (XP, or, durée), puis la note « Son : 30 min ·
  aventure : 7 h 12… ». Viennent ensuite le **Butin** (objets colorés par rareté, « équipé
  automatiquement » ou « meilleur, à équiper dans le sac »), les **Compagnons rencontrés** et **Le fil
  de la nuit** (chronologie). Les textes viennent des phrases à trous du catalogue, en `LocalizedText`.
- **Personnage.** Les 10 emplacements d'équipement (tête, cou, dos, torse, mains ; taille, jambes,
  pieds, doigt, arme) en deux colonnes autour de la silhouette, les
  caractéristiques (armure, stats, or), puis le sac de 20 cases avec un point « nouveau » et
  quantités, et la légende des raretés. Toucher un objet ouvre `objet/[ref]` : une infobulle façon MMO
  (rareté, emplacement, armure ou dégâts, stats, niveau requis, citation, prix de vente) avec la
  comparaison « Comparé à … : +6 armure » et les boutons Fermer / Équiper (mis en avant si l'objet
  est meilleur). La comparaison et l'équipement passent par les règles de `packages/shared`.
- **Chroniques.** Le sous-titre « Le journal de … · N nuits », les nuits groupées par mois, et pour
  chacune : date, titre, zone, durée, niveau gagné, meilleur butin et « en attente » si elle n'est pas
  envoyée. Toucher une nuit ouvre `nuit/[id]`.
- **Réglages.** Groupe *Réveil* : interrupteur « Notification du matin », heure du réveil (sélecteur
  d'heure natif de RN ou une roue maison ; aucun module natif en plus) et sa note « Ouvrir l'app plus
  tôt termine l'aventure ». Groupe *Sons par zone* : chaque zone avec sa taille, « Téléchargée » /
  progression en % / bouton Télécharger, et un appui long pour supprimer. Groupe *Synchronisation* :
  « Récits en attente », « Dernière synchro · ce soir, 21:58 » et un bouton Réessayer. Groupe
  *Bientôt* grisé : Départs, Classes, Langue.
- **Écran verrouillé** (iOS). Notification « Thornolf est passé niveau 7 ! » avec « 7 h 12 d'aventure
  à Elwynn · Casque du veilleur (rare). Touchez pour lire le résumé. » Son texte est calculé **au
  lancement**, puisque la nuit est générée jusqu'au réveil.

Les noms de la maquette (Thornolf, Elwynn…) sont des exemples : en vrai, tout vient du catalogue et le
code n'en contient aucun.

## 5. La nuit sur le téléphone

1. **Lancement** (bouton Aventure). On choisit la zone, on télécharge son pack s'il manque (ou on se
   replie sur une zone présente), puis on tire la graine. On génère la chronologie jusqu'à `wakeAt`
   (le prochain 07:30 après maintenant) avec un instantané du perso. On enregistre `activeNight`
   **avant** tout son, et on planifie la notification avec le résumé « si la nuit va jusqu'au
   réveil ». On règle le mode audio, on démarre le `mixer`, et l'écran Lecture s'affiche.
2. **Son** (de `startedAt` à `soundEndsAt`). Le `conductor` suit la chronologie ; l'intensité baisse
   (moins de combats, plus de marche, puis l'auberge ou le feu de camp). Comme la session audio est
   active, iOS laisse tourner le JS, écran verrouillé compris (à confirmer par l'étape 1).
3. **Fin du minuteur.** Fondu final sur 30 à 90 s, `release()` des lecteurs, puis désactivation de la
   session audio. iOS suspend l'app, qui n'a plus rien à faire.
4. **Silence** (de `soundEndsAt` à `wakeAt`). Aucun code ne tourne. L'aventure « continue » parce
   qu'elle est déjà écrite dans la chronologie.
5. **Réveil.** iOS affiche la notification à `wakeAt` tout seul, que l'app soit suspendue ou tuée.
6. **Ouverture.** Au démarrage à froid et à chaque retour au premier plan, `settleNight()` tourne.
   - S'il y a une `activeNight` et qu'on est encore dans la phase son, l'app revient à Lecture et rien
     n'est réglé.
   - Sinon, on fixe `endAt = min(now, wakeAt)` et on annule la notification si `now < wakeAt`. On
     coupe la chronologie à `endAt`, puis on calcule le rapport (XP, butin, auto-équipement,
     compagnons, phrases).
   - Dans **une seule transaction** : mise à jour du perso, ajout dans `nights`, ajout dans `outbox`,
     `activeNight = null`. L'opération est idempotente par id de nuit.
   - Enfin, on ouvre `nuit/[id]`.
7. **Synchro.** La file d'envoi part dès que le serveur répond, avec la sauvegarde du perso.

**Si iOS tue l'app.**
- *Pendant le son* (mémoire, plantage, balayage) : le son s'arrête et on n'y peut rien. Comme
  `activeNight` est déjà sur disque et la notification déjà planifiée, l'ouverture suivante règle la
  nuit normalement. Si l'app est rouverte avant `soundEndsAt` après un arrêt, on propose « Reprendre le
  son » ou « Terminer l'aventure ». Pour le savoir, on enregistre l'heure du dernier tic toutes les
  minutes.
- *Interruption audio* (appel, alarme, Siri) : on écoute l'état des lecteurs. On relance l'ambiance
  si iOS le permet ; sinon on accepte le silence, puisque l'aventure continue de toute façon.
- *Pendant le silence* : rien n'est perdu, car il n'y a rien en mémoire.
- *Changement d'heure ou de fuseau* : tout est en horodatages absolus, et `wakeAt` est calculé une
  seule fois au lancement.
- *Notification refusée* : rien ne change, le résumé s'affiche à l'ouverture.
- *Expo Go fermé ou mis à jour* : c'est le même cas qu'un arrêt.

## 6. Tâches, dans l'ordre (une PR chacune)

1. **Squelette.** Installer `expo-router` et ses dépendances (versions de `bundledNativeModules.json`,
   via `npm install --workspace apps/mobile`). Créer `src/app/`, les onglets et les routes vides, les
   jetons de thème de la maquette, et toutes les chaînes FR dans `fr.json`. Supprimer `App.tsx`.
2. **Stockage.** `expo-sqlite` (migrations), kv-store, stores Zustand persistés, données de test d'un
   perso et de trois nuits.
3. **Écrans statiques.** Personnage, fiche d'objet, Chroniques et Résumé du réveil branchés sur les
   stores, avec équiper/déséquiper via les règles de `shared` (ou un bouchon en attendant l'étape 2).
4. **Cycle de vie de la nuit.** `startNight`/`settleNight`, idempotence, règlement au retour au
   premier plan, en code pur testé avec une horloge factice. On ajoute un exécuteur de tests (voir §7).
5. **Moteur audio.** `conductor` pur (tests : sac mélangé, fourchettes, intensité, minuteur) et
   `mixer` sur `expo-audio` avec les sons de `assets/sounds`. Écran Lecture complet.
6. **Notification.** Permission, planification `DATE`, annulation, ouverture du résumé au toucher.
7. **Accueil.** Bandeau non lu, carte du perso, minuteur, bouton Aventure, carte de zone.
8. **Synchro, partie 1.** Client API (URL dans les réglages ou `EXPO_PUBLIC_SERVER_URL`), catalogue,
   manifeste et téléchargement des packs avec progression, groupe « Sons par zone ».
9. **Synchro, partie 2.** File d'envoi des rapports, sauvegarde du perso, groupe « Synchronisation »
   et badges « en attente ».
10. **Nuit réelle sur l'iPhone.** Une nuit complète dans Expo Go (minuteur de 30 min, réveil le
    lendemain, mode avion pendant la nuit, puis retour du réseau). Corriger, puis mettre à jour
    `docs/DESIGN.md`.
11. *(Étape 6)* Workflow GitHub Actions pour le `.ipa` non signé, puis SideStore (voir §1) ; HTTPS
    Tailscale requis.

## 7. Questions pour le propriétaire

1. **Ouvrir l'app en pleine nuit** (pendant le silence, pour regarder l'heure à 3 h) termine
   l'aventure, comme le dit DESIGN. Faut-il plutôt afficher « Terminer l'aventure maintenant ? »,
   avec la possibilité de la laisser continuer ?
2. **Autres sons.** Faut-il laisser jouer un podcast ou une musique en même temps (`mixWithOthers`,
   sans contrôles sur l'écran verrouillé) ou prendre la main (`doNotMix`, avec un bouton « Arrêter »
   sur l'écran verrouillé via `setActiveForLockScreen`) ?
3. **Téléchargements.** Faut-il télécharger les packs (20 à 130 Mo) seulement en Wi-Fi ? Et
   automatiquement toutes les zones, ou seulement la zone tirée avant l'aventure ?
4. **Heure du réveil.** Une seule heure, ou une par jour de la semaine ? Et si on lance une aventure
   après l'heure du réveil (une sieste à 14 h), quand s'arrête-t-elle ?
5. **Premier lancement.** Il n'est pas dans la maquette : faut-il un nom à choisir pour le perso, un
   écran d'accueil, et quand demander la permission des notifications ?
6. **Accès au serveur.** Un jeton pour l'API de l'app (en plus de Tailscale) ? L'URL est-elle saisie
   dans les réglages ou fixée au build ? Faut-il activer HTTPS sur le tailnet, ce qui publie le nom
   de la machine ?
7. **Tests.** Le dépôt n'a que `typecheck`. Peut-on ajouter un exécuteur de tests (`node:test` ou
   Vitest) pour `shared` et les modules purs de l'app ?
8. **Luminosité.** Faut-il baisser la luminosité à l'écran Lecture (`expo-brightness`, présent dans
   Expo Go) ou s'en tenir au fond noir ?
9. **Noms de la maquette.** Ils reprennent des lieux d'un MMO existant (Elwynn, Northshire, Hogger…).
   Le monde de départ écrit pour l'étape 2 doit-il rester original ?
