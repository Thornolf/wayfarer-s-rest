import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { test } from "node:test";
import type { Night } from "../night";
import { nightTotals } from "../progression/totals";
import { withSounds } from "../sound/testSounds";
import { loadStarterCatalog } from "../starter";
import { OptionError, USAGE, minutesBetween, parseClock, parseOptions, type SimulateOptions } from "./options";
import { clock, elapsed, length, number } from "./report";
import { run, simulate } from "./run";

const catalog = loadStarterCatalog();
const options = (...args: string[]) => parseOptions(args) as SimulateOptions;
const section = (report: string, title: string) => (report.split(`— ${title} —`)[1] ?? "").split("\n— ")[0] as string;

test("options: the defaults of the plan, and every option read", () => {
  assert.deepEqual(options(), { seed: 4821, soundMinutes: 30, start: 23 * 60, wake: 7 * 60, level: 5, name: "Aldric", gender: "m", all: false, json: false });
  assert.deepEqual(
    options("--seed", "7", "--sound", "60", "--start", "22:30", "--wake", "6:15", "--level", "12", "--cut", "02:15", "--name", "Lyra", "--gender", "f", "--zone", "bois-des-murmures", "--all", "--json"),
    { seed: 7, soundMinutes: 60, start: 22 * 60 + 30, wake: 6 * 60 + 15, cut: 135, level: 12, name: "Lyra", gender: "f", zone: "bois-des-murmures", all: true, json: true },
  );
  assert.equal(parseOptions(["--help"]), "help");
  assert.match(run(["--help"], catalog), /--seed/);
  assert.equal(run(["--help"], catalog), USAGE);
});

test("options: what cannot be used is refused, in French", () => {
  const refused: string[][] = [
    ["--seed", "abc"],
    ["--seed", "-3"],
    ["--sound", "0"],
    ["--level", "0"],
    ["--level", "2.5"],
    ["--start", "25:00"],
    ["--wake", "7h"],
    ["--gender", "x"],
    ["--cut", "08:00"],
    ["--cut", "22:00"],
    ["--speed", "2"],
  ];
  for (const args of refused) assert.throws(() => parseOptions(args), OptionError, args.join(" "));
  assert.throws(() => run(["--zone", "nulle-part"], catalog), /nulle-part.*bois-des-murmures/);
});

test("clock times: a night runs past midnight, and never lasts nothing", () => {
  assert.equal(parseClock("23:05", "start"), 23 * 60 + 5);
  assert.equal(minutesBetween(23 * 60, 7 * 60), 8 * 60);
  assert.equal(minutesBetween(13 * 60, 14 * 60 + 30), 90);
  assert.equal(minutesBetween(7 * 60, 7 * 60), 24 * 60);
});

test("the report writes times and numbers the French way", () => {
  assert.equal(elapsed(0), "0:00:00");
  assert.equal(elapsed(3723), "1:02:03");
  assert.equal(clock(23 * 60 + 5), "23:05");
  assert.equal(clock(25 * 60), "01:00");
  assert.equal(length(45), "45\u00a0s");
  assert.equal(length(90), "1\u00a0min 30");
  assert.equal(length(120), "2\u00a0min");
  assert.equal(length(8 * 3600), "8\u00a0h");
  assert.equal(length(5400), "1\u00a0h 30");
  assert.equal(number(12345), "12\u202f345");
  assert.equal(number(0.8, 2), "0,80");
});

test("simulate: the options make the night, and the hero wears plain gear of its level", () => {
  const { night, character } = simulate(options("--seed", "12", "--sound", "15", "--start", "22:00", "--wake", "04:00", "--level", "9", "--name", "Lyra", "--gender", "f", "--zone", "marais-de-noirjonc"), catalog);
  assert.equal(night.seed, 12);
  assert.equal(night.soundSeconds, 900);
  assert.equal(night.duration, 6 * 3600);
  assert.equal(night.zone, "marais-de-noirjonc");
  assert.deepEqual(night.hero, { name: "Lyra", gender: "f", level: 9, xp: 0 });
  assert.equal(Object.keys(character.gear).length, 6);
  assert.ok(Object.values(character.gear).every((item) => item.rarity === "common" && item.level === 9));
});

test("simulate --cut: the night stops when the app is opened, and is the beginning of the whole night", () => {
  const whole = simulate(options("--seed", "99"), catalog).night;
  const cut = simulate(options("--seed", "99", "--cut", "02:15"), catalog).night;
  assert.equal(cut.duration, 3 * 3600 + 15 * 60);
  assert.ok(cut.events.length > 0 && cut.events.length < whole.events.length);
  assert.deepEqual(cut.events, whole.events.slice(0, cut.events.length));
  assert.ok(nightTotals(cut).xp < nightTotals(whole).xp);
  assert.notEqual(cut.summary.text, whole.summary.text);
});

test("--json prints the night itself", () => {
  const args = ["--seed", "31", "--wake", "00:30"];
  const night = JSON.parse(run([...args, "--json"], catalog)) as Night;
  assert.deepEqual(night, simulate(options(...args), catalog).night);
});

test("the report tells the whole night: timeline, summary, gains, sound and warnings", () => {
  const args = ["--seed", "4821", "--wake", "02:00"];
  const { night } = simulate(options(...args), catalog);
  const report = run(args, catalog);
  const totals = nightTotals(night);

  assert.match(report, /^Aventure #4821 — Aldric, niveau 5\n/);
  assert.match(report, /Coucher 23:00, réveil 02:00 · son 30\u00a0min · nuit de 3\u00a0h/);
  for (const title of ["La partie silencieuse", "Le résumé du matin", "Les gains", "Le son", "Les avertissements"]) {
    assert.ok(report.includes(`— ${title} —`), title);
  }
  assert.ok(report.includes("— fin du son (fondu depuis 0:28:00) —"));
  for (const quest of night.quests) assert.ok(report.includes(`« ${quest.title} »`), quest.title);
  assert.ok(report.includes(night.summary.text));
  assert.ok(section(report, "Les gains").includes(`XP : +${number(totals.xp)} · niveau 5 → ${totals.level} `));
  assert.ok(section(report, "Les gains").includes(`Quêtes rendues : ${totals.questsDone} `));
  assert.match(section(report, "Les avertissements"), /Catégories sans aucun son, même en repli \(\d+\) : /);
  assert.doesNotMatch(report, /undefined|NaN|\[object|\?/, "nothing unresolved in the report");
});

test("the report never guesses the hero's gender, and names a noise bed that fell back on generated noise", () => {
  const short = ["--seed", "5", "--gender", "f", "--name", "Ysolde", "--level", "1", "--wake", "23:12", "--sound", "10"];
  assert.match(section(run(short, catalog), "Les gains"), /Équipé au réveil : rien de mieux que l’équipement du coucher/);
  assert.doesNotMatch(run(short, catalog), /qu’il portait/);

  const windBed = { ...catalog, settings: { ...catalog.settings, noiseBed: { kind: "sound" as const, volume: 0.1, category: "vent" } } };
  assert.match(section(run(["--seed", "4821"], windBed), "Les avertissements"), /Fond sonore continu : aucun son dans la catégorie « vent », un bruit brun joue à la place/);
});

test("the report details the heard part scene by scene, and the silent part quest by quest unless --all", () => {
  const args = ["--seed", "4821", "--wake", "02:00"];
  const { night } = simulate(options(...args), catalog);
  const sceneLines = (report: string) => report.split("\n").filter((line) => /^ {2}\d:\d\d:\d\d {2}\d,\d\d {2}/.test(line)).length;
  const heard = night.events.filter((event) => event.at < night.soundSeconds).length;
  assert.equal(sceneLines(run(args, catalog)), heard);
  assert.equal(sceneLines(run([...args, "--all"], catalog)), night.events.length);
});

test("with sounds in every category the report has no warning, and counts what will play", () => {
  const report = run(["--seed", "4821", "--wake", "00:00"], withSounds(catalog));
  assert.equal(section(report, "Les avertissements").trim(), "Aucun.");
  assert.match(section(report, "Le son"), /\d+ lectures prévues \(ambiance \d+, action \d+, ponctuel \d+, transition \d+, fond continu 1\)/);
});

test("end to end: the npm script prints a night, and refuses a wrong option with a message", () => {
  const cli = join(import.meta.dirname, "simulate.ts");
  const tsx = ["--import", "tsx", cli];
  const output = execFileSync(process.execPath, [...tsx, "--seed", "5", "--wake", "23:40"], { encoding: "utf8" });
  assert.equal(output, `${run(["--seed", "5", "--wake", "23:40"], catalog)}\n`);
  assert.throws(
    () => execFileSync(process.execPath, [...tsx, "--wake", "midi"], { encoding: "utf8", stdio: "pipe" }),
    (error: { status: number; stderr: string }) => error.status === 1 && /--wake : « midi » n’est pas une heure/.test(error.stderr),
  );
});
