# Étape 1 — le test audio sur l'iPhone

Plan de l'étape 1 de `docs/DESIGN.md` (issue #2) : prouver, pour pas cher, que dans **Expo Go sur
iOS** plusieurs lecteurs `expo-audio` jouent en même temps, continuent **écran verrouillé pendant une
heure**, et que le **JS continue de tourner** pour lancer de nouveaux sons (changements de scène, sac
mélangé de variantes, ponctuels, volume et vitesse variables, fondu final).

Recherche faite le 26 novembre 2026 sur `expo-audio` 58.0.12 (installé), Expo SDK 58.

## 1. Ce qu'on a trouvé

### Expo Go et l'arrière-plan

- **Expo Go déclare lui-même le mode `audio` en arrière-plan.** Son `Info.plist` contient
  `UIBackgroundModes = [audio, fetch, location, remote-notification, processing]`, sur la branche
  `sdk-58` comme sur `main` ([Info.plist d'Expo Go, sdk-58][expogo-plist]). Le plugin
  `enableBackgroundPlayback` de notre `app.json` n'agit que sur un build natif ; dans Expo Go, il ne
  sert à rien, mais il ne manque rien non plus. Des messages de forum disent « ça ne marche pas dans
  Expo Go » ([canny][canny], [dev.to][devto]) : ils parlent d'`expo-av` ou de vieux SDK, et aucun
  n'est une source officielle. **C'est justement ce que le test tranche.**
- **Côté JS, il suffit de `setAudioModeAsync({ shouldPlayInBackground: true, playsInSilentMode: true })`.**
  Lu dans le code natif installé (`node_modules/expo-audio/ios/AudioModule.swift`) :
  - sans `shouldPlayInBackground`, le module **met tous les lecteurs en pause** quand l'app passe en
    arrière-plan (`OnAppEntersBackground`) ;
  - avec `playsInSilentMode: false`, la catégorie devient `.ambient`/`.soloAmbient`, qui **coupe le son
    avec le bouton silencieux et ne joue pas en arrière-plan**. Avec `true`, c'est `.playback` : le
    bouton silencieux est ignoré et l'arrière-plan est permis ([Apple, catégories][apple-category]).
- **iOS ne garde l'app éveillée que tant qu'un son joue.** Le mode `audio` n'est pas un passe-droit :
  si plus rien ne sort, l'app est suspendue au bout de quelques secondes, le JS s'arrête, et
  **relancer un son depuis l'arrière-plan échoue** (erreur `561015905`, `cannotStartPlaying`, `!pla`).
  Continuer un son déjà lancé marche ([Apple forums 791865][apple-791865],
  [746319][apple-746319], [Apple, background audio][apple-bg]).
  ⇒ **l'ambiance ne doit jamais s'arrêter** tant que le minuteur court ; c'est elle qui garde le JS
  vivant. Les couches action et ponctuels viennent par-dessus.
- **Piège trouvé dans le code** : un lecteur qui n'est pas en boucle, à la fin de son son, appelle
  `deactivateSession()` si `keepAudioSessionActive` est faux. C'est gardé (rien ne se désactive si un
  autre lecteur joue encore), mais si l'ambiance est en pause à ce moment-là, la session tombe. ⇒ créer
  les lecteurs d'ambiance avec `keepAudioSessionActive: true`.

### Les lecteurs (lu dans le code natif 58.0.12)

- Chaque lecteur est un `AVQueuePlayer`. **La boucle** (`player.loop = true`) n'utilise pas
  `AVPlayerLooper` : le module met en file une copie de l'élément (`enqueueNextLoopItem`). C'est natif,
  donc la boucle continue même si le JS est suspendu, mais la couture dépend du fichier (voir plus bas).
- **Vitesse sans correction de hauteur** : `player.shouldCorrectPitch = false` **avant**
  `player.setPlaybackRate(r)` ⇒ algorithme `.varispeed` (la hauteur suit la vitesse, comme voulu dans
  DESIGN). Plage iOS : 0 à 2.
- **Volume** : `player.volume` (0–1) écrit directement sur l'`AVPlayer` ; les fondus sont donc des
  rampes faites en JS (pas de fondu natif dans `expo-audio`).
- **Interruptions** (appel, Siri, alarme) : le module **met tout en pause** au début, et **relance
  lui-même** à la fin si iOS dit `shouldResume`. **Débrancher les AirPods** (`oldDeviceUnavailable`)
  met tout en pause, sans reprise. La doc le confirme ([audio.mdx][expo-doc-src]).
- **Écran verrouillé / « À l'écoute »** : `setActiveForLockScreen(true, metadata)` sur **un seul**
  lecteur, et seulement avec `interruptionMode: 'doNotMix'` ou `'doNotMixPersistent'`. Les boutons
  pause/lecture de l'écran verrouillé n'agissent que sur ce lecteur-là : les autres continueraient.
- `preload(source)` et `player.replace(source)` existent : on peut garder un petit **pool de lecteurs
  fixes** et changer leur source, plutôt que créer et détruire des lecteurs toute la nuit
  (`replace` figeait l'app plusieurs secondes avant 58.0.7, corrigé depuis).
- `AudioPlaylist` (une file `AVQueuePlayer` enchaînée sans JS) existe aussi : utile en repli.
- La doc web avertit que `expo-audio` « n'est pas fait pour beaucoup de sons courts qui se
  chevauchent » : c'est dit pour le web, mais c'est notre cas d'usage, donc on le mesure.

### Boucles sans couture (AAC/m4a)

- L'AAC ajoute des échantillons de « priming » au début (1024 avec l'encodeur de FFmpeg, 2048 ou 2112
  avec d'autres). Le lecteur doit les retirer grâce à une liste d'édition (`elst`) ou au tag
  `iTunSMPB` ; si les deux côtés ne s'accordent pas, on entend un **clic ou un trou à chaque tour**
  ([Vimeo, gapless][vimeo], [FFmpeg #10477][ff-10477], [Apple forums 81268][apple-81268],
  [Apple forums 677188][apple-677188]).
- Nos fichiers viennent de FFmpeg (`Lavf60.16.100`) ; `rain.m4a` (30 s, stéréo) a bien une liste
  d'édition qui saute 1024 échantillons. Personne ne garantit qu'AVFoundation l'applique bien à la
  jonction de deux éléments d'une file.
- Un fichier **WAV/CAF (PCM)** n'a pas de priming : c'est la référence sans couture
  (Noizio, par exemple, boucle des `.caf` [TidBITS][noizio]). Coût : ~5 Mo pour 30 s en stéréo
  44,1 kHz, contre ~0,4 Mo en AAC.
- ⇒ le test joue **la même boucle en m4a et en WAV**, et on écoute la couture.

### Ce que font les applis du genre

- **myNoise** superpose une dizaine de boucles de longueurs différentes : la somme « ne se répète
  jamais » ([App Store][mynoise]). Même idée pour nous : des boucles d'ambiance de durées premières
  entre elles, démarrées à un point au hasard.
- Les mélangeurs de sons pour dormir (Noizio, Drift, Blankie, Moodist…) jouent **quelques boucles
  longues** en continu et appliquent un **fondu au minuteur** ; aucun ne relance des dizaines de sons
  depuis le JS pendant une heure. Nous sommes plus exigeants qu'eux : c'est pour ça qu'on teste.
- Les applis qui doivent placer des sons au temps près en arrière-plan (minuteurs d'entraînement)
  finissent sur `AVAudioEngine` avec des sons programmés à l'avance ([Apple forums 746319][apple-746319]).
  Pas disponible dans Expo Go : c'est le repli « build de développement » (par exemple
  `react-native-audio-api`, qui donnerait aussi le panoramique).

Note : `docs.expo.dev` n'est pas joignable depuis le bac à sable cloud. La doc a été lue dans sa
source sur GitHub et dans les types et le code natif installés de `expo-audio` 58.0.12.

## 2. Les risques, et comment le test les détecte

| # | Risque | Comment on le voit |
|---|--------|--------------------|
| R1 | Expo Go coupe le son au verrouillage | Le son s'arrête à l'oreille ; le journal montre `AppState=background` puis plus de battement |
| R2 | Le son continue mais le JS est suspendu | Les boucles tournent, mais plus de nouvelles scènes ni de ponctuels ; trous dans le battement JS |
| R3 | Le JS ralentit (minuteurs décalés) | Le battement toutes les 10 s enregistre l'écart attendu/réel ; on regarde l'écart max |
| R4 | Un nouveau son refuse de démarrer en arrière-plan (`!pla`) | `player.playing` reste faux après `play()` ; l'erreur du statut est journalisée |
| R5 | Clic ou trou à la couture des boucles AAC | Écoute A/B m4a/WAV au premier plan ; décompte des coutures |
| R6 | Trop de lecteurs : craquements, mémoire, plantage | Test de charge : 10 lecteurs, `replace()` chaque seconde ; l'app plante ou le journal s'arrête |
| R7 | Un appel, Siri, une alarme, une autre app coupent le son pour de bon | Tests d'interruption, chacun noté « reprend seul / reprend au toucher / perdu » |
| R8 | Débrancher les AirPods arrête tout | Test AirPods ; attendu : pause (c'est acceptable la nuit) |
| R9 | Bouton silencieux, mode économie d'énergie, concentration « Sommeil » | Chaque réglage basculé pendant la lecture |
| R10 | Le fondu final saccade (rampe JS en arrière-plan) | Écoute du fondu écran verrouillé + pas de rampe journalisés |
| R11 | Batterie ou chauffe | Niveau de batterie au début et à la fin (`expo-battery`) |
| R12 | L'app dépend de Metro (le PC Windows) | Le test principal se fait **Metro arrêté** après le chargement |

## 3. Plan de réalisation

Un écran de test jetable, rangé à part, qui deviendra la base du lecteur de l'étape 5. Pas de routeur
pour l'instant : `App.tsx` ajoute un bouton « Test audio » sous le bouton « Aventure ».

### Modules à ajouter (tous dans Expo Go)

Installés avec `npm install --workspace apps/mobile <nom>@<version>` (versions de
`node_modules/expo/bundledNativeModules.json`) :

- `expo-file-system@~58.0.15` : le journal sur le téléphone ;
- `expo-sharing@~58.0.24` : envoyer le journal (Mail, Fichiers, OneDrive) vers le PC ;
- `expo-battery@~58.0.4` : batterie au début et à la fin.

### Fichiers

- `apps/mobile/src/audio-test/rng.ts` — un PRNG à graine (mulberry32) : même graine, même test.
- `apps/mobile/src/audio-test/shuffleBag.ts` — `ShuffleBag<T>` : tire sans remise, ne rejoue jamais
  le dernier élément du sac précédent.
- `apps/mobile/src/audio-test/testLog.ts` — `TestLog` : JSONL horodaté dans
  `Paths.document/audio-test-<date>.jsonl`, plus `console.log` (visible dans Metro quand il tourne).
  Événements : `start`, `appState`, `heartbeat` (toutes les 10 s, avec l'écart au temps attendu et le
  `currentTime`/`playing` de chaque lecteur), `scene`, `oneShot`, `fadeStep` (échantillonné), `error`,
  `statusError`, `end`.
- `apps/mobile/src/audio-test/soundEngine.ts` — `SoundEngine`, le cœur réutilisable :
  - au départ, `setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true,
    interruptionMode })`, le mode d'interruption venant d'un réglage de l'écran (`doNotMix` par défaut,
    `mixWithOthers` en variante) ;
  - un **pool fixe** créé avec `createAudioPlayer` : 2 lecteurs d'ambiance (A/B pour les fondus
    enchaînés, `loop`, `keepAudioSessionActive: true`), 2 lecteurs d'action (A/B), 3 lecteurs de
    ponctuels ; les sources changent par `replace()` ;
  - `fadeTo(player, volume, ms)` : rampe à 20 pas par seconde calée sur `Date.now()` (pas sur le
    nombre de pas), pour rester juste si le JS prend du retard ;
  - `crossfade(layer, source, ms)` ; `playOneShot(category)` ;
  - à chaque lecture : variante tirée au sac, volume ±20 %, vitesse ±8 % (`shouldCorrectPitch =
    false` puis `setPlaybackRate`), point de départ au hasard dans une boucle d'ambiance (`seekTo`) ;
  - `releaseAll()` qui appelle `remove()` sur chaque lecteur.
- `apps/mobile/src/audio-test/scenario.ts` — le scénario, piloté par une seule boucle d'une seconde
  (jamais de `setTimeout` d'une heure) :
  - **ambiance** : `rain` en continu, toute la durée ;
  - **action** : scènes de 30 s à 2 min tirées parmi `marche` (`steps`), `minage` (`mining`) et
    « rien », fondu enchaîné de 2 à 5 s ;
  - **ponctuels** : `bird` et `ding` toutes les 20 à 90 s, délai minimum, rafales de trois parfois ;
  - **transition** : un `ding` de quête toutes les 10 min ;
  - **intensité** : sur le dernier quart, plus de « rien », moins de minage ;
  - **fin** : fondu de 45 s de tout, `releaseAll()`, puis le battement continue pour voir quand iOS
    suspend l'app (attendu : quelques secondes après, et c'est voulu).
- `apps/mobile/src/audio-test/AudioTestScreen.tsx` — l'écran : durée (5, 15, 60, 120 min), boucle en
  `m4a` ou `wav`, mode d'interruption, « À l'écoute » oui/non, boutons Démarrer, Arrêter, Test de
  charge, Partager le journal ; résumé en direct (scène, temps écoulé, nombre de sons lancés, plus
  grand trou du battement, dernières erreurs).
- `apps/mobile/src/i18n/locales/fr.json` et `en.json` — clés `audioTest.*` (tous les textes de
  l'écran passent par i18n, comme le veut `CLAUDE.md`).
- `apps/mobile/assets/sounds/rain.wav` — la même boucle que `rain.m4a`, en PCM 16 bits, pour l'A/B de
  couture : `ffmpeg -i rain.m4a -c:a pcm_s16le rain.wav` (FFmpeg applique la liste d'édition en
  décodant, donc le WAV a la bonne longueur ; si la couture claque aussi en WAV, c'est le contenu de
  la boucle, pas l'AAC).
- Le contenu (quels sons, quelles fourchettes) est en dur ici : c'est un test, pas le moteur. Le
  moteur de l'étape 5 lira les mêmes réglages depuis le catalogue.

Vérification avant de rendre : `npm run typecheck`.

## 4. Protocole sur l'iPhone (depuis Windows)

### Préparation

1. Sur le PC : `npm install` à la racine, puis `npm run mobile` (`expo start`). Si l'iPhone ne
   trouve pas le PC sur le Wi-Fi, `npx expo start --tunnel` dans `apps/mobile`.
2. Sur l'iPhone : Expo Go à jour (SDK 58), scanner le QR code avec l'appareil photo.
3. Pour les tests longs, recharger en mode production (moins de travail JS, plus proche du vrai) :
   `npx expo start --no-dev --minify`.
4. Noter : modèle d'iPhone, version d'iOS, niveau de batterie, branché ou pas.

### Les essais

| # | Essai | Durée | Comment | Ce qu'on note |
|---|-------|-------|---------|---------------|
| T1 | Premier plan | 5 min | Écran allumé, `m4a` | 3 couches audibles ensemble ? variations de volume et de hauteur perceptibles ? |
| T2 | Couture | 3 min | `m4a` puis `wav`, casque ou AirPods, écouter 3 tours de pluie chacun | Clic, trou ou rien à chaque tour ? |
| T3 | Verrouillage court | 15 min | Démarrer, verrouiller tout de suite, Metro allumé | Son jusqu'au bout ? nouvelles scènes et ponctuels entendus ? fondu final propre ? |
| T4 | **Le test principal** | 60 min | Démarrer, attendre que le journal montre le 1er battement, **arrêter Metro** (Ctrl+C), verrouiller, poser le téléphone sur batterie | Écouter vers 5, 15, 30, 45 et 60 min (ou enregistrer avec un autre appareil) ; au déverrouillage : plus grand trou du battement, nombre de scènes et de ponctuels contre l'attendu, erreurs, batterie |
| T5 | Nuit longue | 120 min | Comme T4, branché | Mêmes notes ; l'app tient-elle 2 h ? |
| T6 | Appel | 5 min | Se faire appeler (ou FaceTime audio) pendant T3, raccrocher | Le son revient-il seul ? le JS repart-il (battement) ? |
| T7 | Siri, alarme, minuteur de l'Horloge | 5 min | Déclencher chacun pendant la lecture | Idem T6 |
| T8 | Autre app | 5 min | Lancer une musique ou un podcast, en `doNotMix` puis en `mixWithOthers` | Qui coupe qui ? notre son revient-il ? |
| T9 | AirPods | 5 min | Connecter en cours de lecture, puis retirer un écouteur, puis les deux | Bascule propre ? pause attendue au retrait |
| T10 | Réglages | 5 min | Bouton silencieux, mode économie d'énergie, concentration « Sommeil » | Le son continue ? |
| T11 | « À l'écoute » | 5 min | Option activée : regarder l'écran verrouillé, appuyer sur pause puis lecture | Titre affiché ? quels lecteurs s'arrêtent ? |
| T12 | Charge | 5 min | Bouton « Test de charge » : 10 lecteurs en même temps, `replace()` chaque seconde | Craquements ? plantage ? l'app reste fluide ? |

Après chaque essai : « Partager le journal » vers le PC, et une ligne dans un commentaire de l'issue
#2 (essai, iPhone/iOS, résultat, remarques).

### Critères de réussite

- T4 passe : son continu 60 min, **aucun trou de battement de plus de 15 s** pendant que le son joue,
  au moins 90 % des scènes et ponctuels prévus effectivement lancés, aucune erreur `!pla`.
- T1, T3 et T12 passent ; T6 et T7 reprennent seuls (ou bien on sait quoi faire au retour).
- T2 : au moins un format boucle sans clic audible (sinon on boucle en WAV/CAF).
- Le reste (T8–T11) n'empêche pas de continuer : on note le comportement et on en tire des décisions.

## 5. Si Expo Go ne passe pas

Selon ce qui casse :

1. **Le son continue mais le JS s'endort (R2/R3)** — ne plus dépendre du JS pour la couche action :
   jouer les scènes par une `AudioPlaylist` (file native) de morceaux préparés, ou passer au plan 3.
2. **Expo Go lui-même est en cause (R1/R4)** — un **build de développement** : `expo prebuild` +
   `xcodebuild` sur un runner macOS de GitHub Actions, `.ipa` non signé, signé et installé par
   **SideStore** avec un Apple ID gratuit (re-signature tous les 7 jours, 3 apps actives au plus).
   C'est déjà le plan de DESIGN pour plus tard ; on l'avancerait. EAS Build demande en principe un
   compte Apple Developer payant pour un build sur appareil : à vérifier, mais probablement exclu. Le
   build ouvre aussi la porte à `AVAudioEngine` (par exemple `react-native-audio-api`) : sons
   programmés à l'avance au temps près et panoramique.
3. **Toute la partie entendue mixée en un seul fichier sur le Pi** — la nuit est déjà générée d'avance
   à partir d'une graine, donc le Pi peut en faire le rendu avec FFmpeg (le générateur de
   `packages/shared` tourne en Node) : un seul lecteur, sans couture, sans JS en arrière-plan, le cas
   le plus solide d'iOS. Coûts : il faut le réseau avant de dormir (2 h en AAC 64 kb/s ≈ 58 Mo), un
   temps de rendu sur le Pi à mesurer, et les nuits hors ligne exigent un rendu préparé d'avance
   (par exemple la nuit suivante, à chaque synchro). Variante hybride : le Pi rend des morceaux de
   5 min enchaînés par une `AudioPlaylist`.

Si on change de plan, DESIGN.md (« Ordre de construction » et « Sur l'iPhone ») est mis à jour.

## 6. Questions pour toi

1. Quel iPhone et quelle version d'iOS ? As-tu des AirPods, et un second téléphone pour l'appel (T6) ?
2. Le son doit-il **se mélanger** à une autre app (podcast qui continue) ou **la couper** ?
   (`mixWithOthers` contre `doNotMix` ; « À l'écoute » sur l'écran verrouillé exige `doNotMix`.)
3. Veux-tu la carte « À l'écoute » sur l'écran verrouillé (titre de l'aventure, bouton pause) ?
4. As-tu les originaux non compressés des sons d'essai, pour un vrai WAV de `rain` ?
5. D'accord pour ajouter `expo-file-system`, `expo-sharing` et `expo-battery` (tous dans Expo Go) ?
6. L'écran de test reste-t-il dans l'app après l'étape (caché, pour les réglages du son), ou on le
   retire une fois le moteur en place ?
7. Quel modèle de Pi ? Ça compte pour le temps de rendu du plan de repli 3.

## Sources

[expogo-plist]: https://github.com/expo/expo/blob/sdk-58/apps/expo-go/ios/Exponent/Supporting/Info.plist
[expo-doc-src]: https://github.com/expo/expo/blob/main/docs/pages/versions/unversioned/sdk/audio.mdx
[canny]: https://expo.canny.io/feature-requests/p/audio-playback-in-background
[devto]: https://dev.to/josie/how-to-add-background-audio-to-expo-apps-3fgc
[apple-category]: https://developer.apple.com/documentation/avfaudio/avaudiosession/category-swift.struct/playback
[apple-bg]: https://developer.apple.com/documentation/avfoundation/configuring-your-app-for-media-playback
[apple-791865]: https://developer.apple.com/forums/thread/791865
[apple-746319]: https://developer.apple.com/forums/thread/746319
[apple-81268]: https://developer.apple.com/forums/thread/81268
[apple-677188]: https://developer.apple.com/forums/thread/677188
[vimeo]: https://medium.com/vimeo-engineering-blog/a-brief-history-of-gapless-audio-and-what-you-can-do-about-it-ea9e1c343215
[ff-10477]: https://trac.ffmpeg.org/ticket/10477
[noizio]: https://tidbits.com/2016/03/03/generate-relaxing-background-sounds-with-noizio/
[mynoise]: https://apps.apple.com/us/app/mynoise/id813099896

- Info.plist d'Expo Go (SDK 58) : <https://github.com/expo/expo/blob/sdk-58/apps/expo-go/ios/Exponent/Supporting/Info.plist>
- Doc `expo-audio` (source) : <https://github.com/expo/expo/blob/main/docs/pages/versions/unversioned/sdk/audio.mdx> ;
  version 58 : <https://docs.expo.dev/versions/v58.0.0/sdk/audio/>
- Journal des changements d'`expo-audio` 58 : <https://github.com/expo/expo/blob/sdk-58/packages/expo-audio/CHANGELOG.md>
- Code natif installé : `node_modules/expo-audio/ios/AudioModule.swift`, `AudioPlayer.swift`
- Apple, lecture en arrière-plan : <https://developer.apple.com/documentation/avfoundation/configuring-your-app-for-media-playback>
- Apple forums : [791865][apple-791865] (son lancé depuis l'arrière-plan), [746319][apple-746319]
  (sons programmés en arrière-plan), [81268][apple-81268] et [677188][apple-677188] (priming AAC)
- Gapless : [Vimeo][vimeo], [FFmpeg #10477][ff-10477]
- Applis : [myNoise][mynoise], [Noizio][noizio]
