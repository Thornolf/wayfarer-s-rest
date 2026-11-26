// Code shared by the app, the admin and the server: the content schema, its types and the night
// generator. Pure TypeScript: it must run in Expo Go, in a browser and in Node alike.
//
// The starter world is not exported from here, so that the app does not bundle it: import it from
// "@wayfarers-rest/shared/starter".

export * from "./locale";
export * from "./rng";
export * from "./schema";
export * from "./text/french";
export * from "./text/template";
