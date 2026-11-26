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
- **Zone de départ au hasard.** Les zones n'ont pas de niveau : les monstres et le butin suivent le
  niveau du perso.
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
- **Son manquant** : on prend un son de secours de la catégorie générale (sinon juste l'ambiance), et
  la vérification de l'admin signale le trou.

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
- Les collections : zones fixes, lieux, quêtes, modèles de scènes, tables d'événements, sons,
  compagnons, objets, phrases du résumé ; plus tard les départs et les classes.

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
