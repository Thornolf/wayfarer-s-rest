# Étape 2 — le générateur de nuits

Plan de l'étape 2 (issue #3) : tout vit dans `packages/shared`. Écrit le 26 novembre 2026 à partir de
`docs/DESIGN.md`, du moteur de Valdorne (`/home/user/azeroth`) et d'une recherche en ligne. Rien n'est
codé : ce document propose, le propriétaire tranche les questions de la fin.

## 1. Ce qu'on a appris

### Chez Valdorne (le jeu Rails du propriétaire)

- **Dés graines** (`app/models/game/rng.rb`) : `Rng.for(seed, index)` mélange la graine du perso et
  l'index du tick ; chaque commande ajoute un « sel » (`salt: 7`, `11`…) pour avoir son propre flux.
  Résultat : un tick se joue pareil quel que soit le moment où l'on regarde. On garde l'idée, en
  plus strict : un flux nommé par usage, pour qu'ajouter un tirage à un endroit ne décale pas tout
  le reste. Comme `simulation.rb`, le générateur ne lit jamais l'horloge réelle.
- **Schéma de l'admin** (`content/schema.rb`) : une liste `[clé, libellé, type, option]` par collection
  (`string`, `text`, `integer`, `select`, `ref`, `refs`, `json`) d'où le formulaire se dessine. Bon
  modèle ; la limite est que la validation et les types vivent à part. En TypeScript on peut avoir les
  trois d'une seule source.
- **Tables d'événements** (`db/data/event_tables.json`) : des poids par issue (`combat: 68`,
  `nothing: 10`, `elite: 6`…) par type d'activité. On reprend tel quel le principe.
- **Butin** (`loot.rb`, `loot_rates.json`) : on tire d'abord une rareté selon le rang du monstre,
  puis un objet de cette rareté ; un multiplicateur (`modifier`) et une **pitié** (après le nombre
  d'essais attendu, la chance d'un rare/épique monte jusqu'à être certaine au double) évitent les
  longues malchances. Les deux s'appliquent bien ici : le gear devient le multiplicateur.

### Génération de quêtes et de récits

- Doran & Parberry ont analysé plus de 750 quêtes de quatre MMO (dont WoW) : elles partagent une
  structure commune (une motivation, puis une suite d'actions élémentaires : aller, tuer, récupérer,
  rendre…) qu'une grammaire peut générer. C'est notre « modèle de quête = suite d'étapes ».
  [pcg2011.pdf](https://ianparberry.com/pubs/pcg2011.pdf),
  [grammaire du prototype](https://ianparberry.com/research/quests/questgen.txt).
- **Tracery** (Compton, Kybartas, Mateas, ICIDS 2015) : une grammaire JSON de symboles réécrits au
  hasard, avec des modificateurs (majuscule, pluriel, a/an) — idéal pour les auteurs non
  programmeurs, mais pensé pour l'anglais.
  [article](https://publications.graphics.tudelft.nl/papers/272),
  [tutoriel](https://nbviewer.jupyter.org/github/aparrish/rwet/blob/master/tracery-and-python.ipynb).
- **Ink** (inkle) : les alternatives `{a|b}` (séquence), `{&a|b}` (cycle), `{~a|b}` (mélange : tout
  sort une fois avant de rebattre) — c'est un sac mélangé appliqué au texte.
  [inkling, séquences](https://pjohansson.github.io/inkling/features/sequences.html).
- **Story sifting** (Ryan ; Kreminski et al., *Felt*, ICIDS 2019) : on simule d'abord, puis on cherche
  dans le journal les suites d'événements qui font une histoire. Notre résumé du matin est un tamis
  très simple : on note les temps forts (boss, montée de niveau, objet épique, fuite, compagnon) et
  on n'écrit qu'eux. [Felt](https://mkremins.github.io/publications/Felt_SimpleStorySifter),
  [Authoring for Story Sifters](https://mkremins.github.io/publications/AuthoringSifters_TAP.pdf).

### Jeux idle et progression hors ligne

- Deux écoles : rejouer la vraie logique pour le temps passé, ou extrapoler une moyenne. Rejouer
  garde une seule règle mais doit tourner sans effets de bord (UI, minuteurs).
  [itch.io](https://itch.io/post/14654594),
  [Clicker Heroes](https://blog.clickerheroes.com/offline-progression-in-clicker-heroes/embed/).
  Melvor plafonne le hors-ligne (12 à 24 h selon les sources, non tranché).
- Pour nous c'est plus simple : la nuit entière est générée d'avance, la partie silencieuse est la
  même chronologie, juste pas jouée. Pas d'extrapolation ; on coupe un préfixe.

### Aléatoire graine en TypeScript

- bryc classe **sfc32** (qualité) et **mulberry32** (vitesse, mais un état de 32 bits seulement)
  parmi les meilleurs générateurs JS, et fournit `cyrb128` pour hacher une chaîne en graine ; jeter
  les ~12 premiers tirages de sfc32 est conseillé.
  [PRNGs.md](https://github.com/bryc/code/blob/master/jshash/PRNGs.md),
  [Red Blob, « upgrading PRNG »](https://simblob.blogspot.com/2022/05/upgrading-prng.html).
- **pure-rand** (dubzzz, utilisé par fast-check) : générateurs purs (`next()` rend une nouvelle
  instance), xoroshiro128+, `jump()` pour des sous-flux indépendants.
  [README](https://cdn.jsdelivr.net/npm/pure-rand@8.4.0/README.md).
- **Pièges de déterminisme** : `Math.random`, `Date.now`, l'ordre d'itération des objets (les clés
  numériques passent devant), `Object.keys` d'un JSON venu du serveur, tri instable (stable depuis
  ES2019, mais un comparateur qui rend 0 garde l'ordre d'entrée, qui doit lui-même être fixé),
  `toFixed`/`Intl` dépendants de la locale. Et surtout : **même graine + catalogue différent = autre
  nuit**. Il faut donc garder avec la nuit l'empreinte du catalogue.

### Tables pondérées et sacs mélangés

- Le sac mélangé met les issues dans un sac, tire sans remise, rebat quand il est vide : pas de
  série absurde, et c'est l'usage classique pour ne pas rejouer le même bruitage deux fois.
  [Tuts+](https://code.tutsplus.com/shuffle-bags-making-random-feel-more-random--gamedev-1249t),
  [bevy_shuffle_bag](https://raw.githubusercontent.com/janhohenheim/bevy_shuffle_bag/main/readme.md),
  [Sean McArthur](https://seanmonstar.com/blog/a-less-random-generator/).
  Défaut connu : trop petit, il devient prévisible ; trop généreux, le jeu devient facile
  ([Dungeon of the Endless](https://community.amplitude-studios.com/amplitude-studios/dungeon-of-the-endless/forums/47-game-design/threads/17720-more-even-randomization-through-shuffle-bags?page=1),
  [Red Blob, loot drops](https://www.redblobgames.com/articles/probability/loot-drops.html)).
- Conclusion : tables pondérées pour le récit (les poids sont l'outil de l'admin), sac mélangé pour
  les variantes de sons et les phrases du résumé, pitié pour le butin rare.

### Schéma qui sert à la fois à valider et à dessiner l'admin

- **Zod 4** : `.meta()` et les registres (`z.registry<T>()`) attachent des métadonnées typées à
  chaque champ ; `z.toJSONSchema()` les recopie. [métadonnées](https://zod.dev/metadata),
  [JSON Schema](https://zod.dev/json-schema).
- **Valibot** : beaucoup plus léger (modulaire), mais l'export JSON Schema est un paquet à part et
  moins central. [comparaison](https://valibot.dev/guides/comparison).
- **TypeBox** : le schéma *est* du JSON Schema, `Static<typeof T>` en donne le type, `Value.Check`
  valide. Très bien pour un serveur ; plus verbeux à écrire.
  [README](https://unpkg.com/@sinclair/typebox@0.34.37/readme.md).

### Ambiances génératives

- ExoSphere, HollowTone, MoodScaper ou Endel empilent des couches d'échantillons tirées au hasard
  qui « apparaissent et se dissolvent » ; rien qui contredise `DESIGN.md`.
  [ExoSphere](https://apps.apple.com/app/exosphere/id6748644082),
  [MoodScaper](https://apps.apple.com/us/app/moodscaper-le/id1435065372),
  [Endel](https://en.wikipedia.org/wiki/Endel_(app)).

### Phrases à trous en français

- **ICU MessageFormat** (via `i18next-icu`) gère `select` (genre) et `plural`, mais pas l'élision ni
  les contractions (« de le » → « du », « de les » → « des », « le auberge » → « l'auberge ») ; et
  activer ICU coupe les pluriels natifs d'i18next.
  [react-i18next + ICU](https://react.i18next.com/misc/using-with-icu-format),
  [Lokalise](https://lokalise.com/blog/complete-guide-to-icu-message-format/).
- **Fluent** (Mozilla) règle ça par des « termes » qui portent des attributs (genre, cas) que les
  messages consultent. [Fluent 1.0](https://hacks.mozilla.org/2019/04/fluent-1-0-a-localization-system-for-natural-sounding-translations/),
  [projectfluent.org](https://projectfluent.org/). L'idée à retenir : **c'est le nom qui porte sa
  grammaire**, pas la phrase.

## 2. Choix recommandés

| Sujet | Choix | Pourquoi |
|---|---|---|
| Schéma | **Zod 4** + un registre `admin` typé (`label`, `widget`, `ref`, `help`) | Une source pour le type TS, la validation (serveur, admin, app) et le formulaire. Pur JS, tourne dans Expo Go. La taille du paquet ne compte pas ici. |
| PRNG | **sfc32 maison** (~15 lignes) + `cyrb128` pour la graine, avec des **flux nommés** `rng.fork("weather")` | Aucune dépendance, résultat figé à vie (une mise à jour de lib ne peut pas changer les nuits passées), testable. pure-rand en plan B. |
| Gabarits | **Petit moteur maison**, syntaxe à la Tracery/Ink : `{slot}`, `{slot:de}`, `[a\|b]` | ICU ne fait pas l'élision ; Tracery est anglais. Les noms du contenu portent leur grammaire. i18next reste pour les textes de l'app. |
| Tests | `node:test` lancé par `tsx` (déjà dans `node_modules`) | Pas de framework de plus ; `tsx --test`. |
| CLI | `tsx packages/shared/src/cli/simulate.ts` | Lancement direct du TypeScript. |

Le catalogue de départ est écrit en JSON dans `packages/shared/content/*.json`, validé par le schéma
dans les tests ; le serveur (étape 3) l'importera tel quel.

## 3. Modèle de données (esquisse)

Commun à tout : `id` (slug stable), `archived`, `aiGenerated`. Les noms qui entrent dans une phrase
sont des `Noun` : le texte et sa grammaire.

```ts
type Base = { id: string; archived?: boolean; aiGenerated?: boolean };
type Gender = "m" | "f";
type Noun = { text: LocalizedText; gender: Gender; elided?: boolean; plural?: LocalizedText;
              isPlural?: boolean;            // « les Collines de Brumefer »
              proper?: boolean };            // pas d'article (« Brann »)
type Range = { min: number; max: number };
type Weighted<T> = { value: T; weight: number }[];

type Zone = Base & { name: Noun; places: string[]; weather: Weighted<WeatherKind>;
  monsters: string[]; ambienceCategory: string };
type Place = Base & { name: Noun; zone: string; kind: "town" | "inn" | "wild" | "cave" | "camp" | "dungeon";
  ambienceCategory: string; floor: "grass" | "wood" | "stone" | "mud" | "snow" };
type Monster = Base & { name: Noun; rank: "normal" | "elite" | "boss"; zones: string[];
  family: string };                         // pas de niveau : il suit le perso
type QuestTemplate = Base & { kind: "hunt" | "gather" | "deliver" | "cave" | "rest" | "escort";
  title: LocalizedText;                     // gabarit : « Les {monster:pl} de {place} »
  steps: QuestStep[]; group?: { chance: number; size: Range }; minIntensity?: number;
  xp: number; weight: number };
type QuestStep = { action: "accept" | "travel" | "do" | "return" | "turnIn";
  scene?: string; eventTable?: string; repeat?: Range };
type SceneTemplate = Base & { kind: "walk" | "fight" | "gather" | "mine" | "ride" | "rest" | "talk";
  duration: Range;                          // secondes
  actionCategory: string; intensity: number /* 0..1 */ };
type EventTable = Base & { name: string; rows: { scene: string; weight: number;
  outcome?: "fight" | "loot" | "nothing" | "elite" | "boss" | "find" }[] };
type Sound = Base & { file: string; layer: "ambience" | "action" | "oneShot" | "transition";
  category: string; places?: string[]; loop: boolean; volume: number; weight: number;
  volumeJitter?: number; rateJitter?: number; active: boolean };
type SoundCategory = Base & { layer: Sound["layer"]; maxVolume: number; minGap?: Range;
  burst?: { chance: number; count: Range }; fallback?: string; volumeJitter: number;
  rateJitter: number };
type Item = Base & { name: Noun; slot: Slot; rarity: Rarity; power: number /* par niveau */ };
type Companion = Base & { name: Noun; role: "tank" | "healer" | "damage"; quips?: LocalizedText[] };
type SummarySentence = Base & { trigger: Highlight["kind"]; text: LocalizedText; weight: number;
  when?: { minCount?: number; companion?: boolean; outcome?: "win" | "flee" } };
type Settings = { xpCurve: { base: number; growth: number }; lootRates: Record<Monster["rank"], Record<Rarity, number>>;
  successBase: Record<Monster["rank"], number>; gearWeight: number; weatherMinMinutes: number };
```

Les champs Zod portent leur rôle pour l'admin, par exemple
`zone: z.string().meta({ admin: { label: "Zone", widget: "ref", ref: "zones" } })`. Les catégories
de sons sont une collection à part (DESIGN parle de réglages « par son ou par catégorie »).

**Entrées et sorties du générateur :**

```ts
type NightInput = { seed: number; catalog: Catalog; character: CharacterSnapshot;
  settings: AdventureSettings /* moment, météo, zone, type, intensité : "random" en v1 */;
  start: string /* ISO, l'heure du coucher */; soundMinutes: 15 | 30 | 60 | 120;
  wake: string /* ISO, l'heure du réveil */ };
type Night = { seed: number; catalogHash: string; events: TimelineEvent[];
  cues: SoundCue[]; summary: Summary };
type TimelineEvent = { at: number /* s depuis le début */; duration: number; quest?: string;
  scene: string; place: string; weather: WeatherKind; daylight: "dawn" | "day" | "dusk" | "night";
  intensity: number; outcome?: Outcome; gains?: { xp: number; items: ItemInstance[] };
  companions?: string[] };
```

`CharacterSnapshot` : niveau, XP, gear équipé, compagnons déjà rencontrés, compteurs de pitié et
l'historique des phrases du résumé déjà servies. La progression sort de la nuit sous forme de
`gains` par événement ; c'est l'app qui les additionne **jusqu'à l'instant de coupure**.

## 4. Architecture du générateur

```
seed ──cyrb128──► Rng racine ──fork("story" | "weather" | "loot" | "sound" | "summary")
                                │
NightInput ─► planner : zone de départ, moment, courbe d'intensité
          ─► quest loop : tant que t < wake
               choisir un QuestTemplate (poids × intensité courante × repos si intensité basse)
               dérouler ses étapes → scènes (durée tirée dans Range, scène tirée dans la table)
               résoudre chaque issue (réussite/fuite, XP, butin) → TimelineEvent
          ─► weather track (chaîne de Markov lente, durée mini par état)  ─┐
          ─► daylight (heure de départ du monde + horloge du monde)        ─┼─► timeline
          ─► sound cues (flux "sound", lu depuis la timeline)             ─┘
          ─► summary (tamis des temps forts → phrases à trous)
```

Points clés :

- **Préfixe stable.** Le générateur est une fonction génératrice (`function*`) qui produit les
  événements dans l'ordre ; rien de ce qui se passe à 1 h ne dépend de l'heure du réveil. Couper la
  nuit à l'ouverture de l'app = garder les événements dont `at < coupure`. Le test le vérifie.
- **Flux séparés.** Le récit tire dans `story`, le butin dans `loot`, les sons dans `sound`. Ajouter
  un son dans l'admin ne change pas l'histoire ; ajouter un objet ne change pas les combats.
- **Intensité.** Une courbe sur la minuterie : ~1 au début, descend jusqu'à ~0,2 à la fin du son,
  puis reste basse (le silence n'a pas besoin de calme, mais l'aventure continue : quêtes normales,
  intensité « silencieuse » réglable). Elle multiplie les poids : peu de combats quand elle est
  basse, plus de marche, et la dernière quête entendue est forcée sur un modèle `rest` (auberge, feu
  de camp) qui porte le fondu final.
- **Météo.** Chaque zone a des poids ; on change d'état au plus toutes les `weatherMinMinutes`,
  vers un état voisin (clair → nuageux → pluie → orage), jamais d'un coup.
- **Jour/nuit.** Le monde a sa propre heure de départ (tirée ou donnée par `settings.moment`) et
  avance au rythme réel ; `daylight` est déduit de cette heure. À trancher : voir questions.
- **Groupes.** Un modèle de quête avec `group.chance` tire des compagnons ; on préfère ceux déjà
  rencontrés (poids ×3) pour qu'ils reviennent. En groupe, la chance de réussite monte.
- **Sons.** Pour chaque scène : l'ambiance du lieu (avec un point de départ et des couches qui vont
  et viennent), l'action de la scène, des ponctuels selon `minGap` et `burst`. Chaque catégorie a son
  sac mélangé (pondéré par `weight`, jamais la même variante deux fois de suite) ; volume et vitesse
  tirés dans les fourchettes du son, sinon de la catégorie. **Repli** : catégorie vide → son
  `fallback` de la catégorie, sinon catégorie générale de la couche, sinon rien (l'ambiance seule) ;
  le générateur note le trou dans `night.warnings`, que la vérification de l'admin réutilise. Les
  cues ne sont produits que jusqu'à la fin du minuteur.

### Exemple de chronologie (graine 4821, son 30 min)

```
00:00  Bois des Murmures, crépuscule, clair   accept  « Les loups du Bois »    [quete__accept]
00:12  walk 1 min 40   sentier (herbe)              ambiance foret, action marche-herbe
01:52  fight 0 min 50  loup gris → victoire, 35 XP, Croc ébréché (commun)
02:42  walk 1 min 05   ponctuel : hibou ×3 (rafale)
03:47  fight 1 min 10  alpha des loups (élite) → fuite (« il a dû filer »)
...
14:30  pluie fine qui s'installe
21:05  turnIn  au Relais   +120 XP → niveau 6       [quete__turnin, level-up]
22:00  rest    Auberge du Sanglier Ivre, feu de cheminée, intensité 0,2 → fondu jusqu'à 30:00
30:00  — fin du son — la nuit continue en silence jusqu'à 07:00 (≈ 140 scènes de plus)
```

## 5. Progression et butin

- **XP** par scène (combat selon le rang, récolte, quête rendue) ; courbe `base × growth^niveau`
  dans `Settings`. Un niveau gagné est un événement (transition « level-up », temps fort du résumé).
- **Réussite** : `chance = successBase[rank] + gearWeight × (gearScore − niveau attendu)`, bornée
  (par exemple 40–98 %), + bonus de groupe. Un échec = fuite racontée, ni perte ni mort.
- **Butin** comme Valdorne : rareté tirée selon le rang, le multiplicateur vient du gear et du
  groupe, pitié sur rare/épique ; l'objet prend le niveau du perso (`power × niveau`), pas de niveau
  de zone. Le gear équipé ne change **pas** pendant la nuit (sinon la seconde moitié dépend de la
  première de façon fragile et la coupure change les chances) ; l'app équipe au réveil ce qui est
  meilleur. À confirmer (question 3).
- Tout ce qui précède la coupure compte, partie entendue comme partie silencieuse.

## 6. Le résumé du matin

1. **Tamis** : on parcourt la timeline coupée et on note des `Highlight` (`levelUp`, `boss`, `epicLoot`,
  `flee`, `companion`, `weatherChange`, `questDone`, `restAt`), avec un score de saillance.
2. On garde ~5–8 temps forts, dans l'ordre chronologique, toujours une ouverture et une clôture.
3. Pour chacun, une `SummarySentence` tirée par poids, en écartant celles servies les nuits
   précédentes (sac mélangé conservé dans le perso).
4. Remplissage : `{hero}`, `{monster}`, `{place:de}`, `{item:un}`, `{companion}`, `{count}`… Les
   filtres d'article lisent `gender`, `elided`, `proper` du `Noun` : `{place:de}` donne « du Bois »,
   « de la Forêt », « de l'Auberge », « des Collines », « de Hautval » ; `{monster:pl}` prend
   `plural` ou ajoute un s ; `[a|b]` choisit une variante. `isPlural` sert aux noms déjà au
   pluriel (« des Collines »).

Exemple : « À la tombée du jour, {hero} a quitté {place:le} sous un ciel clair. » →
« À la tombée du jour, Aldric a quitté le Bois des Murmures sous un ciel clair. »

Le résumé est stocké **rendu** (le texte) et **en données** (les temps forts) : un contenu archivé ou
réécrit plus tard ne change pas les anciennes Chroniques.

## 7. La CLI et les tests

**CLI** : `npm run simulate --workspace packages/shared -- --seed 4821 --sound 30 --start 23:00
--wake 07:00 --level 5 [--cut 02:15] [--json]`. Sortie lisible (comme l'exemple ci-dessus), puis le
résumé, les gains et les avertissements (catégories sans son). `--json` sort la `Night` pour la
réutiliser dans l'admin.

**Tests** (`node:test` via `tsx --test`) :
- même graine + même catalogue + même perso → `Night` identique (comparaison profonde et empreinte) ;
- graines différentes → nuits différentes ;
- préfixe stable : la nuit coupée à 3 h est un préfixe de celle coupée à 7 h ;
- ajouter un son ne change pas `events` ; ajouter un objet ne change pas les issues des combats ;
- le catalogue de départ passe le schéma et n'a aucune référence cassée ;
- l'intensité décroît sur la minuterie ; la dernière scène entendue est un repos ;
- le repli sonore fonctionne quand une catégorie est vide, et le trou est signalé ;
- le gabarit français : un jeu de cas `de/le/un` × genre × élision × pluriel × nom propre ;
- jamais une variante de son deux fois de suite dans une catégorie ;
- une graine figée (« golden ») dont la timeline est enregistrée : un changement voulu du
  générateur la met à jour explicitement.

Un test qui lit les sources interdit `Math.random` et `Date` dans `src/generator`.

## 8. Monde de départ à écrire (tout en `aiGenerated: true`)

- **3 zones** : le Bois des Murmures (forêt), les Collines de Brumefer (mines, rochers), les Marais
  de Noirjonc (marais, pluie fréquente).
- **~12 lieux** : par zone une ville ou un hameau (Relais de Hautval, Comptoir de Brumefer…), une
  auberge (le Sanglier Ivre, la Chope Fendue), deux lieux sauvages, une grotte/mine, un camp.
- **~15 monstres** : loups gris, sangliers, kobolds des mines, araignées des grottes, murlocs du
  marais, trolls des marais (élites), un boss par zone (l'Alpha Grisecroc, le Contremaître Kobold,
  la Vieille Noyée).
- **~8 modèles de quêtes** : chasse, récolte, livraison, grotte, escorte, pause à l'auberge, quête de
  groupe (élite), boss de zone (groupe).
- **~14 modèles de scènes** : marcher sur herbe/bois/pierre/boue, chevaucher, combattre, combattre en
  groupe, miner, cueillir, fouiller, parler au PNJ, se reposer au feu de camp, à l'auberge.
- **~6 tables d'événements** : chasse, récolte, grotte, route, marais, calme (intensité basse).
- **~30 objets** sur 6 emplacements et 4 raretés (commun, rare, épique, légendaire).
- **4 compagnons** : Brann le nain (tank), Sœur Elwyn (soins), Kaelen le rôdeur, Mira la
  pyromancienne, chacun avec 3 répliques.
- **Catégories de sons** (sans fichiers pour l'instant ; le repli et les avertissements les
  couvrent) : ambiances foret, taverne, grotte, marais, pluie, vent ; actions marche-herbe,
  marche-bois, marche-pierre, combat, minage, monture ; ponctuels oiseau, hibou, loup, tonnerre,
  voix ; transitions accept, turnin, levelup, porte.
- **~60 phrases du résumé** : 5 à 8 par type de temps fort.
- **Réglages** : courbe d'XP, taux de butin par rang (repris des valeurs de Valdorne comme point de
  départ), chances de réussite, poids du gear.

## 9. Tâches, dans l'ordre

1. `rng.ts` : sfc32, `cyrb128`, `fork(name)`, `int`, `float`, `chance`, `pick`, `weighted`,
   `ShuffleBag` ; tests de reproductibilité.
2. `schema/` : les collections en Zod 4 avec le registre `admin`, les types dérivés, `Catalog`,
   `catalogHash`, la vérification des références.
3. `text/` : `Noun`, filtres d'article et d'élision, moteur de gabarits ; tests français.
4. `content/*.json` : le monde de départ, validé par les tests.
5. `generator/` : planner, boucle de quêtes, scènes, intensité, météo, jour/nuit, groupes.
6. `progression/` : XP, niveaux, réussite, butin, pitié ; gains par événement, totaux à une coupure.
7. `sound/` : cues par couche, sacs mélangés, variations, replis et avertissements.
8. `summary/` : tamis des temps forts, choix des phrases, rendu.
9. `cli/simulate.ts` et le script `simulate` ; tests de bout en bout et graine dorée.
10. Mettre `DESIGN.md` à jour avec les décisions prises ici.

## 10. Questions pour le propriétaire

1. **Monstres** : DESIGN ne les liste pas parmi les collections de l'admin. Collection à part (comme
   Valdorne) ou simple texte dans les tables d'événements ? Le plan propose une collection.
2. **Horloge du monde** : le jour et la nuit du jeu suivent-ils l'heure réelle (on s'endort de nuit :
   l'aventure serait presque toujours nocturne), ou un monde qui tourne plus vite (un cycle en ~2 h),
   ou une heure de départ au hasard qui avance en temps réel ?
3. **Gear pendant la nuit** : on garde le gear du coucher toute la nuit (proposé, plus simple et
   plus stable), ou le perso s'équipe en route ?
4. **Partie silencieuse** : mêmes quêtes que la partie entendue, ou des quêtes plus « productives »
   (récolte, longues routes) puisque personne n'écoute ? Et faut-il un plafond de gains par nuit ?
5. **Graine et catalogue** : une nuit doit-elle se rejouer à l'identique après un changement du
   catalogue ? Proposé : non, on garde la nuit rendue et l'empreinte du catalogue.
6. **Nom du héros** : un nom fixe choisi dans l'app, ou tiré ? Et son genre, pour les accords du
   résumé (« il a dû fuir » / « elle a dû fuir ») ?
7. **Libellés de l'admin** : en français seulement (comme Valdorne), ou eux aussi en i18n ?
8. **Taille du catalogue de départ** : la liste du §8 suffit-elle pour une v1, ou en faut-il plus
   pour que deux nuits de suite ne se ressemblent pas ?
