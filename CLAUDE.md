# Working on this repo

## What this is

Wayfarer's Rest, an iPhone sleep app: a generated MMO-style adventure told in sound while the user
falls asleep, with a written summary in the morning. `docs/DESIGN.md` holds every product and
architecture decision; read it before changing how something works, and update it when a decision
changes.

## Layout

An npm workspaces monorepo, TypeScript everywhere:

- `apps/mobile`: the Expo app (see `apps/mobile/AGENTS.md`: check the Expo docs for the SDK in use,
  never trust memory). It must keep running in Expo Go: no library that needs a development build
  without asking first.
- `apps/admin`: the web admin (React + Vite).
- `apps/server`: the server on the owner's Pi, reached over Tailscale.
- `packages/shared`: the content schema, its types and the night generator, used by all three.

`npx expo install` cannot reach Expo's servers from the cloud sandbox: install Expo modules with
`npm install --workspace apps/mobile <name>@<version>`, taking the version from
`node_modules/expo/bundledNativeModules.json`.

## Rules

- Content (zones, places, quests, sounds, companions, summary sentences…) is data edited in the
  admin. Nothing about a particular zone or quest belongs in the code.
- Content written by an AI carries `aiGenerated: true` so the owner can find and rewrite it.
- Content is archived, never deleted: a character keeps what it owns and old summaries stay readable.
- Every text the user reads goes through i18n. French is the default and the fallback; content
  fields hold one value per language (`LocalizedText`).
- Code, comments and commits are in English. Everything the user reads is in French.

## Checks

```bash
npm run typecheck
```
