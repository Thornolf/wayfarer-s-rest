# Wayfarer's Rest — conception

Les décisions prises avec le propriétaire, le 26 novembre 2026. À mettre à jour dès qu'une décision
change.

## Le produit

- Une app iPhone pour s'endormir : un **aventurier classique** (pas de classe pour l'instant) vit une
  aventure sonore façon MMO pendant que tu t'endors.
- **Un seul bouton « Aventure »** en v1. Le moteur reçoit déjà un objet de réglages (moment, météo,
  zone, type d'aventure, intensité) ; le bouton envoie « tout au hasard ». Les **Départs** (à l'aube,
  de nuit, sous la pluie, en donjon…) viendront plus tard comme des réglages pré-remplis, édités
  dans l'admin.
- **Zone au hasard, une seule par nuit.** Les zones n'ont pas de niveau : les monstres et le butin
  suivent le niveau du perso.
- **Progression** : XP et niveaux, butin ramassé pendant la nuit, gear. Le gear augmente les chances
  de réussite (moins de fuites, plus d'élites et de boss vaincus) et la rareté du butin. Pas de mort,
  pas de perte : un échec n'existe que dans le récit (« il a dû fuir »).
- **Gear** : équipé automatiquement s'il est meilleur, avec un écran inventaire pour reprendre la main.
- **Groupes** : parfois une quête de groupe, avec des **compagnons nommés** définis dans l'admin, qui
  reviennent d'une nuit à l'autre.
- Un seul perso pour l'instant ; les classes et plusieurs persos plus tard.
- À la première ouverture, on **crée le perso** : son nom et son genre (pour accorder le résumé :
  « il est parti », « elle est partie »).

## La nuit

- Elle est **générée entièrement au lancement**, à partir d'une graine (« Aventure #4821 ») : même
  graine, même nuit. Puis elle est jouée.
- **Deux niveaux** :
  - des **modèles de quêtes** (chasse, récolte, livraison, grotte, pause…) qui donnent le fil :
    accepter, partir, faire, revenir, rendre ;
  - des **scènes** à durée aléatoire (marcher 30 s à 2 min, combattre, miner…) tirées selon des
    **tables d'événements** pondérées, réglables dans l'admin.
- **Trois couches sonores** :
  - **ambiance** en boucle, donnée par le lieu (forêt, taverne, grotte, pluie…). Une ambiance est
    faite de **sous-ambiances** qui se superposent et vont et viennent : la forêt, c'est le fond
    des feuillages, plus le vent, plus une rivière proche, plus des grillons la nuit ; la taverne,
    c'est le brouhaha, plus le feu, plus un barde. Chaque sous-ambiance a ses sons, son volume, ses
    conditions (météo, jour ou nuit) et sa probabilité d'être là ;
  - **action**, la scène en cours (pas sur l'herbe, sur du bois, combat, minage…) ;
  - **ponctuels**, au hasard, avec un délai minimum entre deux (oiseaux, tonnerre, voix…).
- **Transitions** sonores : porte, monture, « ding » de quête, level-up.
- **Météo** qui change lentement, **jour et nuit**.
- **Intensité** qui baisse au fil de la minuterie : moins de combats, plus de marche, puis l'auberge
  ou le feu de camp, et un fondu final. Pas de son brutal : volume max par catégorie, fondus.
- **Minuteur du son** : 15 min, 30 min, 1 h ou 2 h. À la fin, le son s'arrête en fondu, mais
  **l'aventure continue en silence jusqu'au réveil** : l'heure du réveil réglée dans l'app, ou
  l'ouverture de l'app si elle arrive avant. Toute l'aventure compte pour l'XP et le butin, la
  partie entendue comme la partie silencieuse.
- La nuit est générée jusqu'à l'heure du réveil, puis coupée au moment où l'app est rouverte. Une
  fois le son arrêté, l'app n'a donc plus besoin de tourner en arrière-plan.
- **Un fond sonore continu** joue du début à la fin du son : un bruit rose ou brun très doux, ou un
  vrai son (vent lointain, feu), au volume réglable dans l'admin. Le son ne coupe donc jamais,
  même entre deux scènes ou au point de boucle d'une ambiance, et iOS garde l'app active tant
  qu'il joue.
- **Formats envoyés à l'iPhone** : les boucles d'ambiance en **ALAC** (sans perte, pas de trou au
  point de boucle), les sons courts en **AAC**. Le Pi garde toujours les originaux. Le test de
  l'étape 1 confirme à l'oreille ; si l'AAC boucle sans trou, tout passe en AAC.
- **Variation procédurale** : un même son ne doit jamais sonner deux fois pareil. À chaque lecture,
  le moteur tire au hasard, dans des fourchettes réglables par son ou par catégorie dans l'admin :
  - la variante, parmi les fichiers de la même catégorie (sans rejouer la précédente) ;
  - le volume (par exemple ±20 %) ;
  - la hauteur et la vitesse (par exemple ±8 %, `playbackRate` sans correction de hauteur) ;
  - le point de départ dans une boucle d'ambiance ;
  - le rythme des ponctuels (délai aléatoire entre deux, en rafales parfois : trois oiseaux d'un
    coup, puis rien) ;
  - des couches d'ambiance qui vont et viennent lentement (le vent monte, la pluie faiblit) ;
  - la durée des fondus entre les scènes.
  `expo-audio` (Expo Go) permet le volume, la vitesse et la position. Le panoramique gauche-droite
  n'y est pas : à reconsidérer si on passe un jour à un build de développement.
- **Son manquant** : on prend un son de la catégorie de repli (sinon rien ne joue pour cette
  catégorie : il reste l'ambiance et le fond continu), et la vérification de l'admin signale le trou.

- **Les autres apps** : lancer une aventure **coupe la musique** des autres apps (mode audio
  exclusif), et l'écran verrouillé affiche une carte Wayfarer's Rest avec un bouton pour arrêter.

## Le réveil

- **Ouvrir l'app en pleine nuit** ne termine pas l'aventure d'office : l'app demande « Terminer
  l'aventure ? ». Si on refuse, l'aventure continue jusqu'à l'heure du réveil.

- Un **résumé écrit** de la nuit, fait de phrases à trous éditables dans l'admin, avec assez de
  variantes pour ne pas se répéter (pas d'IA en v1).
- Affiché à la prochaine ouverture de l'app, et annoncé par une **notification locale** à l'heure du
  réveil, qui marque aussi la fin de l'aventure.
- Un **journal de toutes les nuits** (« Chroniques »), dans l'app et dans l'admin.

## Le générateur

Les décisions prises en construisant l'étape 2. Tout vit dans `packages/shared`, en TypeScript pur :
le même code tourne dans l'app, dans l'admin et sur le serveur.

### Graine et hasard

- Un générateur maison (sfc32, graine hachée par cyrb128), sans dépendance : une mise à jour de
  bibliothèque ne peut pas changer les nuits passées. Le générateur ne lit jamais l'horloge et
  n'utilise jamais `Math.random` ; un test le vérifie.
- **Un flux de hasard par usage** (plan, récit, météo, combats, butin, sons, résumé). Ajouter un son
  ne change pas l'histoire, ajouter un objet ne change pas l'issue des combats.
- **Même graine + catalogue différent = autre nuit.** La nuit garde l'empreinte du catalogue qui l'a
  produite, et elle est stockée telle qu'elle a été générée : on ne la rejoue pas après coup.
- **Préfixe stable** : rien de ce qui se passe à 1 h ne dépend de l'heure du réveil. Couper la nuit
  à l'ouverture de l'app, c'est garder les événements commencés avant la coupure ; le résumé est
  réécrit pour cette partie, et les gains s'additionnent jusqu'à la coupure.

### Le récit

- **Une zone par nuit.** Une quête est donnée et rendue dans une ville, une auberge ou un camp ;
  elle se fait au lieu qu'elle désigne ; l'aller et le retour passent par un lieu sauvage de la zone.
- **La même quête n'est pas donnée deux fois de suite** tant qu'une autre est possible.
- **Niveau minimal** : un modèle de quête peut demander un niveau (celui du coucher). Au départ, le
  boss de zone attend le niveau 4.
- **L'horloge du monde** : le monde a sa propre heure de départ, tirée au hasard (ou dans le moment
  demandé), et avance au rythme réel. Aube de 5 h à 8 h, jour jusqu'à 18 h, crépuscule jusqu'à 21 h,
  puis nuit. (Question encore ouverte dans le plan 2 : c'est le choix par défaut.)
- **Météo** : un état dure au moins le temps réglé (20 min au départ), puis reste ou passe à un état
  voisin (clair, nuageux, pluie, orage), selon les poids de la zone.
- **Intensité** : elle descend en ligne droite de 1 à 0,2 sur la minuterie du son, puis reste à la
  valeur « silencieuse » des réglages (0,8 au départ) jusqu'au réveil. Elle pèse sur le tirage des
  scènes, écarte les quêtes trop animées (leur intensité minimale) et favorise les pauses.
- **La fin de la partie entendue** : une quête n'est acceptée que si elle se termine avant la
  réserve gardée pour le repos final (30 % de la minuterie, entre 3 et 10 min). Tous les modèles
  possibles sont essayés, en version longue puis courte. Quand plus rien ne tient, ou quand une
  pause est tirée alors qu'il reste deux réserves au plus, vient la dernière quête : une marche
  calme qui remplit l'attente, puis le repos à l'auberge ou au feu de camp, qui dure jusqu'à la
  fin du son. Un peu avant (trois réserves et demie), une pause n'est plus proposée, pour ne pas en
  entendre deux de suite. La dernière scène entendue est toujours un repos, et elle dépasse la
  minuterie.
- **Quête échouée** : une quête d'élite ou de boss échoue si son monstre a fait fuir le perso à
  chaque combat. Elle est rendue sans XP de quête ni « ding ».
- **Groupes** : un modèle de quête dit sa chance d'être en groupe et le nombre de compagnons. Les
  compagnons déjà rencontrés reviennent plus souvent (poids ×3 au départ).

### Progression et butin

- **Le gear du coucher vaut pour toute la nuit** : ni le gear ni le niveau gagné en route ne
  changent les chances des combats, pour que la coupure ne change rien. Au réveil, l'app équipe ce
  qui est meilleur.
- **Réussite** d'un combat : la base du rang (90 % normal, 65 % élite, 50 % boss au départ), plus
  2 % par point d'écart entre le score de gear et le niveau, plus 15 % en groupe, entre 40 % et
  98 %. Le score de gear est la moyenne, sur les six emplacements, de la puissance de l'objet
  multipliée par son niveau.
- **XP** : un combat gagné selon le rang (35, 90, 250), les scènes de récolte, de minage et de
  fouille, et la quête rendue. Une fuite ne rapporte rien.
- **Courbe d'XP** : 600 XP pour le niveau 2, puis 12 % de plus à chaque niveau. Une nuit de 8 h
  rapporte environ 6 800 XP quel que soit le niveau : 7 niveaux la première nuit, 5 au niveau 5,
  un seul au niveau 20, puis plusieurs nuits par niveau. Avec ces chiffres, un niveau se gagne
  rarement pendant la partie entendue.
- **Butin** : on tire d'abord la rareté selon le rang du monstre, puis un objet de cette rareté, qui
  prend le niveau du perso. Le gear et le groupe augmentent les chances au-dessus de « commun ».
  Une nuit de 8 h donne environ 37 objets, dont 6 rares et à peu près 1 épique ; un légendaire est
  très rare.
- **Pitié** : chaque butin qui n'est pas rare (ou pas épique) ajoute au compteur du perso la chance
  qu'il avait de l'être : beaucoup pour un boss, presque rien pour un loup. Quand le compteur
  dépasse 1, la chance d'un rattrapage monte, et elle est certaine à 2. Les taux réglés par rang
  restent donc ceux qu'on observe. Le compteur se garde d'une nuit à l'autre.

### Le son

- La nuit contient la liste de ce que le téléphone doit jouer (des « lectures ») : le son, quand,
  combien de temps, à quel volume, à quelle vitesse, avec quels fondus. Rien n'est prévu après la
  minuterie.
- **Le fondu final** est un seul fondu de tout ce qui joue : le dernier dixième de la minuterie,
  entre 30 s et 2 min.
- **Sous-ambiances** : leur présence est retirée toutes les 3 à 8 min, elles arrivent et partent en
  8 à 20 s, et leur volume dérive lentement.
- **Catégorie sans son** : on suit la chaîne de repli de la catégorie ; au bout, rien ne joue pour
  elle. Dans les deux cas la nuit le signale dans ses avertissements, que la vérification de
  l'admin réutilise.
- **Catégorie ou ambiance archivée** : elle se tait. Rien ne joue pour elle, aucune autre catégorie
  ne lui emprunte de son, et ce silence voulu n'est pas un avertissement.
- **Le fond continu ne manque jamais** : réglé sur « un vrai son », il prend un son de sa catégorie
  quel que soit le lieu ; si elle n'en a aucun, un bruit brun joue à sa place et la nuit le signale.
- **Le son du niveau gagné** joue à la fin de la scène qui l'a rapporté, et le « ding » de la quête
  suivante attend une seconde et demie.
- Un son a toujours une catégorie, et c'est la catégorie qui donne sa couche.

### Le résumé

- **Tamis** : la nuit jouée est relue, et les temps forts sont notés avec une saillance (boss,
  butin épique ou légendaire, niveau gagné, compagnon, fuite, repos, orage, quête rendue…).
- Le résumé raconte une ouverture, une clôture, et entre les deux **six temps forts au plus**, les
  plus saillants, dans l'ordre : deux du même type au maximum, et jamais deux fois le même monstre,
  le même objet ou la même quête.
- **Une pause** est racontée par son repos, pris à l'auberge ou au camp de la quête ; elle n'a pas
  de phrase « quête rendue ».
- **Le moment de la journée** : les phrases suivent l'horloge du monde. Seules celles qui portent
  une condition (aube, jour, crépuscule, nuit) nomment un moment ; les autres n'en parlent pas.
- Les phrases sortent d'un **sac mélangé gardé dans le perso** : une phrase ne revient pas tant que
  les autres ne sont pas sorties. Une phrase peut avoir des conditions (météo, moment, issue du
  combat, en groupe, nombre de fois).
- Le résumé est gardé **en texte et en données** : réécrire ou archiver une phrase ne change pas
  les anciennes Chroniques.

### Les phrases à trous

- Un petit moteur maison. **C'est le nom qui porte sa grammaire** (genre, élision, pluriel, nom
  propre), la phrase dit seulement la forme voulue : `{place:de}` donne « du Bois », « de
  l'Auberge », « des Collines », « d'Aldric ». Les formes : `le`, `un`, `de`, `a`, `d`, `ce`, et
  `pl` pour le pluriel.
- `{hero?parti|partie}` accorde selon le genre, `[a|b|c]` tire une variante, et les nombres sont
  écrits à la française (« 6 448 »).
- Les titres de quêtes sont aussi des phrases à trous.
- Seule la grammaire française existe pour l'instant.

### Simuler une nuit

```bash
npm run simulate --workspace packages/shared -- --seed 4821 --sound 30 --start 23:00 --wake 07:00 --level 5
```

Affiche la chronologie (la partie entendue scène par scène, la partie silencieuse quête par quête),
le résumé, les gains et les avertissements. `--cut 02:15` coupe la nuit comme si l'app était
rouverte, `--all` détaille aussi la partie silencieuse, `--json` sort la nuit telle que l'app la
reçoit, `--help` liste le reste.

Trois **nuits témoins** sont enregistrées dans `packages/shared/golden/` et comparées par les
tests. Après un changement voulu du générateur ou du monde de départ, `npm run golden --workspace
packages/shared` les réécrit, et leur diff se relit avec le reste.

## L'admin

- **Un bouton « Publier »** : les modifications restent en brouillon dans l'admin, et l'iPhone ne
  reçoit le contenu qu'une fois publié. L'admin montre ce qui a changé depuis la dernière
  publication.
- Une app web séparée (React + Vite), servie par le serveur du Pi, protégée par un mot de passe en
  plus de Tailscale.
- Des **éditeurs générés depuis le schéma** du contenu (comme l'admin de Valdorne) : chaque
  collection décrit ses champs (texte, nombre, liste, référence…) et le formulaire se dessine seul.
- Des **références** entre collections (une quête pointe vers un lieu, un son vers une zone).
- Une **vérification** du contenu : références cassées, catégories sans son.
- Un bouton **« Simuler une nuit »** : la chronologie générée et le résumé, sans attendre la nuit.
- Les collections : zones fixes, lieux, monstres, quêtes, modèles de scènes, tables d'événements,
  ambiances (avec leurs sous-ambiances), catégories de sons, sons, compagnons, objets, phrases du
  résumé, et un formulaire de réglages (XP, butin, réussite, fond sonore continu) ; plus tard les
  départs et les classes.
- Les **monstres** sont une collection à part : un nom, un rang (normal, élite, boss), et chaque zone
  liste les siens.
- **Le schéma est écrit en Zod 4**, dans `packages/shared` : d'une seule source sortent les types,
  la validation et ce qu'il faut pour dessiner les formulaires (libellé, type de champ, référence,
  aide). Les clés inconnues sont refusées.
- Les **libellés de l'admin** sont en français, écrits dans le schéma.
- **La pile de l'admin** : Mantine pour l'interface (thème sombre), TanStack Router (les filtres des
  listes vivent dans l'URL), TanStack Query et TanStack Table, i18next pour ses propres textes. Pas
  de bibliothèque de formulaires : l'état d'un formulaire tient en quelques fonctions maison, testées.
- **Un faux serveur en mémoire**, qui suit le contrat de l'API, sert à développer l'admin sans le Pi
  (`npm run dev:fake --workspace apps/admin`) et à ses tests. Il n'est pas embarqué dans l'admin
  construite.
- **Langue d'écriture** : un formulaire montre une langue à la fois, choisie par des onglets et
  gardée d'une fiche à l'autre ; les textes qui attendent encore leur traduction sont comptés et
  signalés, avec le français sous les yeux.

### Les sons

- **Import en lot**, n'importe quel format. Le serveur convertit en AAC (m4a) pour l'iPhone, garde
  l'original, calcule la durée et égalise les volumes.
- **Mapping automatique par nom de fichier**, corrigé ensuite à la main ; les fichiers mal nommés
  vont dans « Non classés » :

  ```
  ambiance__foret__01.mp3
  action__marche-herbe__01.mp3
  ponctuel__oiseau__foret__01.mp3   ← le 3e mot : les lieux où il peut sortir
  quete__accept__01.mp3
  ```

- Pour chaque son : couche, catégorie, lieux autorisés, boucle ou non, volume, poids (fréquence),
  fourchettes de variation (volume, hauteur), actif ou non.

## Architecture

- **Monorepo npm, TypeScript partout** : `apps/mobile` (Expo), `apps/admin` (React + Vite),
  `apps/server` (Node, sur le Pi), `packages/shared` (schéma, types, générateur).
- **Le matériel** : un iPhone 14 Pro sous la dernière version d'iOS, et un Raspberry Pi avec un
  SSD (les données et les sons vont sur le SSD, pas sur la carte SD).
- **Le serveur sur le Pi**, joint en Tailscale : il stocke le contenu et les sons, et reçoit les
  rapports.
- **Le contrat de l'API** est écrit une seule fois, dans `packages/shared/src/api` : une table des
  routes avec les schémas Zod de ce qui entre et de ce qui sort. Le serveur, l'admin et l'app s'en
  servent tous les trois.
- **Brouillon et publication** : un seul compteur de version. Chaque écriture de l'admin prend la
  valeur suivante ; publier ne recopie rien, on retient la valeur du compteur à ce moment-là.
  L'iPhone reçoit le contenu tel qu'il était à cette valeur, et l'admin voit comme « modifié » tout
  ce qui a été écrit depuis. Une publication est refusée tant que la vérification trouve des erreurs.
- **Synchro** :
  - le **catalogue** (le JSON du monde, léger) est toujours synchronisé ;
  - les **sons par zone** se téléchargent à la demande, et automatiquement avant une aventure ; sans
    réseau, on joue les zones déjà téléchargées ;
  - la **progression** vit sur l'iPhone, avec une sauvegarde sur le Pi ;
  - les **rapports** s'empilent hors ligne et partent dès que la connexion revient.
- **Contenu archivé, jamais supprimé** : un élément archivé ne sort plus dans les nouvelles nuits,
  mais le perso garde ce qu'il a et les anciens résumés restent lisibles.
- **Monde de départ** écrit par Claude, chaque élément marqué `aiGenerated: true`, avec un badge et
  un filtre dans l'admin pour le réécrire.
- **Langues** : français par défaut, i18n dès le départ (anglais plus tard). Les textes de l'app
  passent par des fichiers de traduction ; les champs de contenu ont une valeur par langue, le
  français est obligatoire et sert de repli.
- **Sur l'iPhone** : Expo Go pour développer. Plus tard, un `.ipa` construit par GitHub Actions et
  signé par SideStore avec un Apple ID gratuit.

## Ordre de construction

1. **Test audio sur l'iPhone** : trois couches en même temps, écran verrouillé, pendant une heure,
   dans Expo Go, avec les variations de volume et de vitesse. Si ça ne passe pas, on revoit le plan.
2. **Le générateur** : schéma, monde de départ, « simuler une nuit » en ligne de commande.
3. **Le serveur sur le Pi** : contenu, sons, import en lot, conversion.
4. **L'admin web** : éditeurs, mapping des sons, vérification, simulation.
5. **L'app iPhone** : Aventure, lecture, résumé, notification, perso, gear, synchro.
6. **Plus tard** : départs, classes, anglais, `.ipa` via GitHub Actions et SideStore.
