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
| `apps/server` | Le serveur du Pi, joint en Tailscale (squelette pour l'instant) |
| `packages/shared` | Le code partagé : schéma du contenu, types, générateur de nuits |

## Lancer l'app sur l'iPhone depuis Windows

Il faut Node 22 et l'app **Expo Go** sur l'iPhone (App Store).

```bash
npm install
```

```bash
npm run mobile
```

Scanne le QR code avec l'appareil photo de l'iPhone. Le PC et l'iPhone doivent être sur le même
Wi-Fi ; si le pare-feu Windows bloque, autorise Node ou lance `npx expo start --tunnel` dans
`apps/mobile`.

## Lancer l'admin et le serveur

```bash
npm run dev --workspace apps/admin
```

```bash
npm run dev --workspace apps/server
```

## Vérifications

```bash
npm run typecheck
```
