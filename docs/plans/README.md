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

## Questions ouvertes qui reviennent dans plusieurs plans

- **Un bouton « Publier »** dans l'admin, pour que l'iPhone ne reçoive pas un contenu à moitié édité
  (plans 3 et 4).
- **Mélanger avec la musique des autres apps, ou l'interrompre** avec une carte sur l'écran
  verrouillé (plans 1 et 5).
- **AAC ou un format sans perte pour les boucles d'ambiance**, si l'AAC laisse un petit trou à la
  boucle (plans 1 et 3) : le test de l'étape 1 tranche.
