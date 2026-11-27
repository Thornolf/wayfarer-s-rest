# Wayfarer's Rest

Une app iPhone pour s'endormir : un aventurier façon MMO vit une aventure sonore pendant que tu
dors (marche, quêtes, combats, minage, taverne, pluie…), gagne de l'XP et du butin, et te laisse un
résumé de sa nuit au réveil.

Les décisions de conception sont dans [`docs/DESIGN.md`](docs/DESIGN.md).

## Organisation

| Dossier | Contenu |
|---|---|
| `apps/mobile` | L'app iPhone (Expo, React Native) |
| `apps/admin` | L'admin web : contenu, sons, quêtes, zones (squelette pour l'instant) |
| `apps/server` | Le serveur du Pi, joint en Tailscale : contenu, publication, rapports de nuit |
| `packages/shared` | Le code partagé : schéma du contenu, types, générateur de nuits |

## Lancer l'app sur l'iPhone depuis Windows

Il faut Node 24 et l'app **Expo Go** sur l'iPhone (App Store).

```bash
npm install
```

```bash
npm run mobile
```

Scanne le QR code avec l'appareil photo de l'iPhone. Le PC et l'iPhone doivent être sur le même
Wi-Fi ; si le pare-feu Windows bloque, autorise Node ou lance `npx expo start --tunnel` dans
`apps/mobile`.

## Lancer l'admin

```bash
npm run dev --workspace apps/admin
```

## Lancer le serveur

```bash
npm run dev --workspace apps/server
```

Il écoute sur `http://127.0.0.1:4600` et range sa base SQLite dans `apps/server/data` (ignoré par
git). Au premier démarrage, il y copie le monde de départ et le publie. Vérifie qu'il répond avec
`http://127.0.0.1:4600/health`.

Pour te connecter à l'admin, il faut un mot de passe. Cette commande te le demande et affiche son
empreinte, à donner au serveur dans `ADMIN_PASSWORD_HASH` :

```bash
npm run hash-password --workspace apps/server
```

Le serveur se règle par des variables d'environnement :

| Variable | Rôle | Par défaut |
|---|---|---|
| `PORT` | Le port d'écoute | `4600` |
| `HOST` | L'adresse d'écoute. À laisser tel quel sur le Pi : Tailscale est la seule entrée | `127.0.0.1` |
| `DATA_DIR` | Le dossier des données (la base, plus tard les sons) | `apps/server/data` |
| `ADMIN_PASSWORD_HASH` | L'empreinte du mot de passe de l'admin. Sans elle, personne ne peut se connecter | aucune |
| `ALLOWED_TAILSCALE_LOGIN` | Si elle est remplie, seul ce compte Tailscale passe (sauf sur `/health`) | aucune |
| `COOKIE_SECURE` | `false` pour développer en `http` avec un navigateur qui refuse sinon le cookie de session | `true` |
| `CODE_VERSION` | La version annoncée par `/health` | celle de `package.json` |
| `LOG_LEVEL` | Le niveau de journalisation | `info` |

## Simuler une nuit

Le générateur tourne en ligne de commande, sur le monde de départ :

```bash
npm run simulate --workspace packages/shared -- --seed 4821 --sound 30 --start 23:00 --wake 07:00 --level 5
```

`--cut 02:15` coupe la nuit comme si l'app était rouverte, `--all` détaille la partie silencieuse,
`--json` sort la nuit en JSON, `--help` liste toutes les options.

## Vérifications

```bash
npm run typecheck
```

```bash
npm test
```

Après un changement voulu du générateur ou du monde de départ, les nuits témoins se réécrivent
avec :

```bash
npm run golden --workspace packages/shared
```
