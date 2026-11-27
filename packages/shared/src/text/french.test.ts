import assert from "node:assert/strict";
import { test } from "node:test";
import type { Noun } from "../schema/common";
import { NOUN_FORMS, joinList, nounPhrase, pluralOf, properNoun, type NounForm } from "./french";

const noun = (fr: string, gender: "m" | "f", extra: Partial<Noun> = {}): Noun => ({ text: { fr }, gender, ...extra });

const bois = noun("Bois des Murmures", "m");
const foret = noun("Forêt de Hautval", "f");
const auberge = noun("Auberge du Sanglier Ivre", "f");
const alpha = noun("Alpha Grisecroc", "m");
const collines = noun("Collines de Brumefer", "f", { isPlural: true });
const eboulis = noun("Éboulis des Chèvres", "m", { isPlural: true });
const hautval = noun("Hautval", "m", { proper: true });
const elwyn = noun("Elwyn", "f", { proper: true });
const loup = noun("loup gris", "m", { plural: { fr: "loups gris" } });
const araignee = noun("araignée des grottes", "f", { plural: { fr: "araignées des grottes" } });
const hachette = noun("hachette de bûcheron", "f");
const hotel = noun("hôtel des Brumes", "m", { elided: true });
const onzieme = noun("onzième heure", "f", { elided: false });

// One row per kind of name: [name, bare, le, un, de, a, d, ce].
const CASES: [Noun, ...string[]][] = [
  [bois, "Bois des Murmures", "le Bois des Murmures", "un Bois des Murmures", "du Bois des Murmures", "au Bois des Murmures", "de Bois des Murmures", "ce Bois des Murmures"],
  [foret, "Forêt de Hautval", "la Forêt de Hautval", "une Forêt de Hautval", "de la Forêt de Hautval", "à la Forêt de Hautval", "de Forêt de Hautval", "cette Forêt de Hautval"],
  [auberge, "Auberge du Sanglier Ivre", "l’Auberge du Sanglier Ivre", "une Auberge du Sanglier Ivre", "de l’Auberge du Sanglier Ivre", "à l’Auberge du Sanglier Ivre", "d’Auberge du Sanglier Ivre", "cette Auberge du Sanglier Ivre"],
  [alpha, "Alpha Grisecroc", "l’Alpha Grisecroc", "un Alpha Grisecroc", "de l’Alpha Grisecroc", "à l’Alpha Grisecroc", "d’Alpha Grisecroc", "cet Alpha Grisecroc"],
  [collines, "Collines de Brumefer", "les Collines de Brumefer", "des Collines de Brumefer", "des Collines de Brumefer", "aux Collines de Brumefer", "de Collines de Brumefer", "ces Collines de Brumefer"],
  [eboulis, "Éboulis des Chèvres", "les Éboulis des Chèvres", "des Éboulis des Chèvres", "des Éboulis des Chèvres", "aux Éboulis des Chèvres", "d’Éboulis des Chèvres", "ces Éboulis des Chèvres"],
  [hautval, "Hautval", "Hautval", "Hautval", "de Hautval", "à Hautval", "de Hautval", "Hautval"],
  [elwyn, "Elwyn", "Elwyn", "Elwyn", "d’Elwyn", "à Elwyn", "d’Elwyn", "Elwyn"],
  [hachette, "hachette de bûcheron", "la hachette de bûcheron", "une hachette de bûcheron", "de la hachette de bûcheron", "à la hachette de bûcheron", "de hachette de bûcheron", "cette hachette de bûcheron"],
  [hotel, "hôtel des Brumes", "l’hôtel des Brumes", "un hôtel des Brumes", "de l’hôtel des Brumes", "à l’hôtel des Brumes", "d’hôtel des Brumes", "cet hôtel des Brumes"],
  [onzieme, "onzième heure", "la onzième heure", "une onzième heure", "de la onzième heure", "à la onzième heure", "de onzième heure", "cette onzième heure"],
];

for (const [name, ...expected] of CASES) {
  test(`every form of « ${name.text.fr} »`, () => {
    NOUN_FORMS.forEach((form, i) => assert.equal(nounPhrase(name, form), expected[i], `form ${form}`));
  });
}

test("the plural takes the plural article, contraction and elision", () => {
  const plural = (name: Noun, form: NounForm) => nounPhrase(name, form, { plural: true });
  assert.equal(plural(loup, "bare"), "loups gris");
  assert.equal(plural(loup, "le"), "les loups gris");
  assert.equal(plural(loup, "un"), "des loups gris");
  assert.equal(plural(loup, "de"), "des loups gris");
  assert.equal(plural(loup, "a"), "aux loups gris");
  assert.equal(plural(loup, "d"), "de loups gris");
  assert.equal(plural(loup, "ce"), "ces loups gris");
  assert.equal(plural(araignee, "le"), "les araignées des grottes");
  assert.equal(plural(araignee, "d"), "d’araignées des grottes");
});

test("a name that is already a plural stays as it is", () => {
  assert.equal(nounPhrase(collines, "le", { plural: true }), "les Collines de Brumefer");
  assert.equal(pluralOf(collines), "Collines de Brumefer");
});

test("without a written plural, the plural is guessed for single words", () => {
  const guess = (fr: string) => pluralOf(noun(fr, "m"));
  assert.equal(guess("kobold"), "kobolds");
  assert.equal(guess("ours"), "ours");
  assert.equal(guess("corbeau"), "corbeaux");
  assert.equal(guess("feu"), "feux");
  assert.equal(guess("cheval"), "chevaux");
  assert.equal(guess("lynx"), "lynx");
  assert.equal(pluralOf(loup), "loups gris", "the written plural wins");
});

test("names fall back to French when the language has no translation", () => {
  const wolf = noun("loup gris", "m", { plural: { fr: "loups gris" } });
  assert.equal(nounPhrase(wolf, "le", { locale: "en" }), "le loup gris");
});

test("the hero is a proper noun with a gender", () => {
  assert.deepEqual(properNoun("Aldric", "m"), { text: { fr: "Aldric" }, gender: "m", proper: true });
  assert.equal(nounPhrase(properNoun("Aldric", "m"), "de"), "d’Aldric");
  assert.equal(nounPhrase(properNoun("Maëlle", "f"), "le"), "Maëlle");
});

test("lists are joined the French way", () => {
  assert.equal(joinList([]), "");
  assert.equal(joinList(["Brann"]), "Brann");
  assert.equal(joinList(["Brann", "Mira"]), "Brann et Mira");
  assert.equal(joinList(["Brann", "Mira", "Kaelen"]), "Brann, Mira et Kaelen");
});
