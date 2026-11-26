# Plans par étape

Un plan par étape de la feuille de route ([Thornolf/wayfarer-s-rest#1](https://github.com/Thornolf/wayfarer-s-rest/issues/1)).
Chacun a été écrit après des recherches en ligne ; les sources sont citées dans chaque fichier.

| Étape | Plan | Issue |
|---|---|---|
| 1. Test audio écran verrouillé | [etape-1-test-audio.md](etape-1-test-audio.md) | #2 |
| 2. Générateur de nuits | [etape-2-generateur.md](etape-2-generateur.md) | #3 |
| 3. Serveur sur le Pi | [etape-3-serveur.md](etape-3-serveur.md) | #4 |
| 4. Admin web | [etape-4-admin.md](etape-4-admin.md) | #5 |
| 5. App iPhone | [etape-5-app-iphone.md](etape-5-app-iphone.md) | #6 |

## Ce qui tranche entre les plans

Les plans ont été écrits en parallèle. Là où ils se contredisent, c'est cette section qui fait foi.

- **L'API, c'est le plan 3.** Les noms de routes des plans 4 et 5 sont indicatifs. Le plan 3 doit
  ajouter ce que les autres attendent : l'édition en masse des sons (`PATCH`), la validation d'un lot
  d'import, et `GET /api/health`.
- **Les fichiers de son sont identifiés par leur SHA-256** côté serveur, et les manifestes de packs
  donnent **aussi leur md5** : c'est le seul hash que `expo-file-system` sait calculer sur le
  téléphone.
- **Le schéma du contenu est en Zod 4**, dans `packages/shared` (plan 2). L'admin (plan 4) dessine
  ses formulaires depuis ses métadonnées, et le serveur (plan 3) valide avec lui.
- **Les tests** utilisent `node:test`, lancé par `tsx` (plan 2), partout où c'est possible.
- **Node** : 22 en local aujourd'hui, 24 LTS visé sur le Pi (plan 3). À aligner dans `engines` au
  moment de l'étape 3.
- **Les noms tirés de WoW** (Elwynn, Northshire, Hogger…) sont voulus par le propriétaire : la
  question du plan 5 à ce sujet est réglée.

## Réponses du propriétaire

Ces réponses passent avant les plans, et sont reportées dans `docs/DESIGN.md`.

- **Ouvrir l'app en pleine nuit** : l'app demande « Terminer l'aventure ? » (plan 5).
- **Les autres apps** : l'aventure coupe leur musique (mode exclusif, `doNotMix`), avec une carte et
  un bouton Arrêter sur l'écran verrouillé (plans 1 et 5).
- **Sous-ambiances** : une ambiance est faite de plusieurs sous-ambiances superposées (fond, vent,
  rivière, feu, barde…), chacune avec ses sons, son volume, ses conditions et sa probabilité
  (plans 1, 2 et 4).
- **Un bouton « Publier »** dans l'admin : l'iPhone ne reçoit que le contenu publié (plans 3 et 4).
- **Le perso** : nom et genre choisis à la création, dans l'app (plans 2 et 5).
- **Le matériel** : iPhone 14 Pro, dernière version d'iOS ; Pi avec SSD, les données vont sur le SSD
  (plans 1 et 3).
- **Format des boucles d'ambiance** : encore ouvert, le test de l'étape 1 tranche entre AAC et un
  format sans perte.
