import assert from "node:assert/strict";
import { test } from "node:test";
import { createRng } from "../rng";
import type { Noun } from "../schema/common";
import { properNoun } from "./french";
import { TemplateError, renderTemplate, templateProblems, type SlotValue } from "./template";

const aldric = properNoun("Aldric", "m");
const maelle = properNoun("Maëlle", "f");
const bois: Noun = { text: { fr: "Bois des Murmures" }, gender: "m" };
const auberge: Noun = { text: { fr: "Auberge du Sanglier Ivre" }, gender: "f" };
const collines: Noun = { text: { fr: "Collines de Brumefer" }, gender: "f", isPlural: true };
const loup: Noun = { text: { fr: "loup gris" }, gender: "m", plural: { fr: "loups gris" } };
const araignee: Noun = { text: { fr: "araignée des grottes" }, gender: "f", plural: { fr: "araignées des grottes" } };
const noyee: Noun = { text: { fr: "Vieille Noyée" }, gender: "f" };

const render = (source: string, slots: Record<string, SlotValue>) => renderTemplate(source, slots);

test("the example of the plan", () => {
  assert.equal(
    render("À la tombée du jour, {hero} a quitté {place:le} sous un ciel clair.", { hero: aldric, place: bois }),
    "À la tombée du jour, Aldric a quitté le Bois des Murmures sous un ciel clair.",
  );
});

test("slots take names, texts and numbers", () => {
  assert.equal(render("{hero} : niveau {level}, « {quest} ».", { hero: aldric, level: 7, quest: "Sus aux loups" }), "Aldric : niveau 7, « Sus aux loups ».");
});

test("forms contract and elide according to the name", () => {
  assert.equal(render("au retour {place:de}", { place: bois }), "Au retour du Bois des Murmures");
  assert.equal(render("au retour {place:de}", { place: auberge }), "Au retour de l’Auberge du Sanglier Ivre");
  assert.equal(render("au retour {place:de}", { place: collines }), "Au retour des Collines de Brumefer");
  assert.equal(render("une halte {place:a}", { place: bois }), "Une halte au Bois des Murmures");
  assert.equal(render("une halte {place:à}", { place: auberge }), "Une halte à l’Auberge du Sanglier Ivre");
  assert.equal(render("jusqu’{place:a}", { place: collines }), "Jusqu’aux Collines de Brumefer");
  assert.equal(render("le sac {hero:de}", { hero: aldric }), "Le sac d’Aldric");
  assert.equal(render("le sac {hero:de}", { hero: maelle }), "Le sac de Maëlle");
  assert.equal(render("face à {monster:ce}", { monster: loup }), "Face à ce loup gris");
});

test("pl puts the name in the plural before the form", () => {
  assert.equal(render("Les {monster:pl} {place:de}", { monster: loup, place: bois }), "Les loups gris du Bois des Murmures");
  assert.equal(render("sus {monster:pl:a}", { monster: araignee }), "Sus aux araignées des grottes");
  assert.equal(render("trop {monster:pl:d}", { monster: araignee }), "Trop d’araignées des grottes");
  assert.equal(render("trop {monster:pl:d}", { monster: loup }), "Trop de loups gris");
  assert.equal(render("{monster:le:pl} rôdent", { monster: loup }), "Les loups gris rôdent", "the order of filters does not matter");
});

test("agreement follows the gender of the name", () => {
  const source = "{hero} est parti{hero?|e} ; {hero?il|elle} reviendra, plus fort{hero?|e}.";
  assert.equal(render(source, { hero: aldric }), "Aldric est parti ; il reviendra, plus fort.");
  assert.equal(render(source, { hero: maelle }), "Maëlle est partie ; elle reviendra, plus forte.");
  assert.equal(render("{monster:le} s’est enfui{monster?|e}.", { monster: noyee }), "La Vieille Noyée s’est enfuie.");
});

test("the first letter of each sentence is capitalised", () => {
  assert.equal(render("{place:le} dormait. {monster:un} veillait ! {hero?il|elle} a souri.", { place: auberge, monster: loup, hero: maelle }),
    "L’Auberge du Sanglier Ivre dormait. Un loup gris veillait ! Elle a souri.");
  assert.equal(render("« {quip} » a dit {hero}.", { quip: "en route", hero: aldric }), "« En route » a dit Aldric.");
  assert.equal(render("{item:un}… rien de moins.", { item: { text: { fr: "épée" }, gender: "f" } }), "Une épée… rien de moins.");
  assert.equal(render("niveau {level}. 3 quêtes.", { level: 2 }), "Niveau 2. 3 quêtes.");
});

test("variants: the first one without rng, any of them with one, the same for the same seed", () => {
  const source = "{hero} [marchait|chevauchait|flânait] [sans hâte|].";
  assert.equal(render(source, { hero: aldric }), "Aldric marchait sans hâte.");

  const withSeed = (seed: number) => renderTemplate(source, { hero: aldric }, { rng: createRng(seed) });
  const seen = new Set(Array.from({ length: 60 }, (_, seed) => withSeed(seed)));
  assert.equal(seen.size, 6, "3 × 2 combinations");
  assert.equal(withSeed(4821), withSeed(4821));
});

test("variants can hold slots, agreements and other variants", () => {
  const source = "[{hero} est [ravi{hero?|e}|content{hero?|e}]|quelle nuit pour {hero}] !";
  const seen = new Set(Array.from({ length: 80 }, (_, seed) => renderTemplate(source, { hero: maelle }, { rng: createRng(seed) })));
  assert.deepEqual([...seen].sort(), ["Maëlle est contente !", "Maëlle est ravie !", "Quelle nuit pour Maëlle !"]);
});

test("a pipe outside variants is plain text", () => {
  assert.equal(render("a | b", {}), "A | b");
});

test("rendering fails loudly on a missing slot or a form asked of a text", () => {
  assert.throws(() => render("{hero} et {companion}", { hero: aldric }), TemplateError);
  assert.throws(() => render("{quest:de}", { quest: "Sus aux loups" }), TemplateError);
  assert.throws(() => render("{level?un|une}", { level: 3 }), TemplateError);
});

test("malformed templates are refused", () => {
  for (const source of ["{hero", "hero}", "[a|b", "a]", "{hero:du}", "{hero:pl:pl}", "{hero:le:de}", "{:le}", "{hero?a}", "{hero?a|b|c}", "{2x}"]) {
    assert.throws(() => render(source, { hero: aldric }), TemplateError, source);
  }
});

test("templateProblems checks a template against the slots it may use", () => {
  const kinds = { hero: "noun", place: "noun", quest: "text", level: "number" } as const;
  assert.deepEqual(templateProblems("{hero} a quitté {place:le} [au niveau {level}|après « {quest} »], ravi{hero?|e}.", kinds), []);
  assert.deepEqual(templateProblems("{hero} et {monster:le}", kinds), ["Unknown slot {monster}"]);
  assert.equal(templateProblems("{quest:de}", kinds).length, 1);
  assert.equal(templateProblems("{level?un|une}", kinds).length, 1);
  assert.equal(templateProblems("[{monster}|{monster}]", kinds).length, 1, "the same problem is reported once");
  assert.equal(templateProblems("{hero", kinds).length, 1);
});
