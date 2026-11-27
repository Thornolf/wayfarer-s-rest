// The report `npm run simulate` prints: the night as its owner would read it, in French.

import type { Gear, ItemInstance, NightWarning, QuestRun, TimelineEvent } from "../generator/types";
import { localize } from "../locale";
import type { Night } from "../night";
import { equipBetter } from "../progression/gear";
import { nightTotals } from "../progression/totals";
import { xpToNextLevel } from "../progression/xp";
import { DAYLIGHTS, HIGHLIGHT_KINDS, ITEM_SLOTS, QUEST_KINDS, RARITIES, SOUND_LAYERS, WEATHER_KINDS, type ItemSlot, type Noun, type Rarity } from "../schema";
import { joinList, nounPhrase, wholeNumber } from "../text/french";
import type { World } from "../world";

export type ReportContext = {
  world: World;
  /** The gear worn at bedtime. */
  gear: Gear;
  /** Bedtime, wake time and the time of the cut on the clock, in minutes since midnight. */
  start: number;
  wake: number;
  cut?: number;
  /** List every scene of the silent part instead of one line per quest. */
  all: boolean;
};

const NBSP = " ";
const UNKNOWN: Noun = { text: { fr: "?" }, gender: "m", proper: true };
const two = (value: number) => String(value).padStart(2, "0");

/** Seconds since the start of the night, as 1:02:03. */
export function elapsed(seconds: number): string {
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 3600)}:${two(Math.floor(whole / 60) % 60)}:${two(whole % 60)}`;
}

/** Minutes since midnight, as 23:05; past midnight it wraps. */
export function clock(minutes: number): string {
  const inDay = ((Math.floor(minutes) % 1440) + 1440) % 1440;
  return `${two(Math.floor(inDay / 60))}:${two(inDay % 60)}`;
}

/** 45 as "45 s", 90 as "1 min 30", 28800 as "8 h", 5400 as "1 h 30". */
export function length(seconds: number): string {
  if (seconds < 60) return `${seconds}${NBSP}s`;
  if (seconds >= 3600 && seconds % 60 === 0) {
    const minutes = (seconds / 60) % 60;
    return `${Math.floor(seconds / 3600)}${NBSP}h${minutes === 0 ? "" : ` ${two(minutes)}`}`;
  }
  const rest = seconds % 60;
  return `${Math.floor(seconds / 60)}${NBSP}min${rest === 0 ? "" : ` ${two(rest)}`}`;
}

/** 12345 as "12 345", 0.8 as "0,80" when decimals are asked. */
export function number(value: number, decimals = 0): string {
  const [whole = "0", fraction] = value.toFixed(decimals).split(".");
  const grouped = wholeNumber(Number(whole));
  return fraction === undefined ? grouped : `${grouped},${fraction}`;
}

const many = (count: number, one: string, several: string) => `${number(count)} ${count > 1 ? several : one}`;

export function renderReport(night: Night, context: ReportContext): string {
  const { world } = context;
  const nameOf = (collection: "places" | "zones" | "monsters" | "items" | "companions", id: string | undefined): Noun =>
    (id === undefined ? undefined : world.byId[collection].get(id)?.name) ?? UNKNOWN;
  const sceneName = (id: string) => {
    const scene = world.byId.sceneTemplates.get(id);
    return scene ? localize(scene.name) : id;
  };
  const itemLabel = (instance: ItemInstance) =>
    `${nounPhrase(nameOf("items", instance.item))} (${RARITIES[instance.rarity].toLowerCase()}, niv. ${instance.level})`;
  const clockAt = (seconds: number) => clock(context.start + seconds / 60);
  const lines: string[] = [];

  // --- Header ---
  const worldHour = `${Math.floor(night.startHour)}${NBSP}h${NBSP}${two(Math.floor((night.startHour % 1) * 60))}`;
  lines.push(
    `Aventure #${night.seed} — ${night.hero.name}, niveau ${night.hero.level}`,
    `Zone : ${nounPhrase(nameOf("zones", night.zone), "le")} · il est ${worldHour} dans le monde au départ`,
    `Coucher ${clock(context.start)}, réveil ${clock(context.wake)}${context.cut === undefined ? "" : `, app rouverte à ${clock(context.cut)}`} · son ${length(night.soundSeconds)} · nuit de ${length(night.duration)}`,
    "",
  );

  // --- Timeline ---
  const questHeader = (quest: QuestRun) => {
    const group = quest.companions.length > 0 ? `, avec ${joinList(quest.companions.map((id) => nounPhrase(nameOf("companions", id))))}` : "";
    return `${elapsed(quest.at)}  « ${quest.title} » (${QUEST_KINDS[quest.kind].toLowerCase()}), ${nounPhrase(nameOf("places", quest.giver), "a")}${group}`;
  };
  const gainsOf = (event: TimelineEvent): string[] => {
    const gains = event.gains;
    if (!gains) return [];
    return [
      ...(gains.xp > 0 ? [`+${number(gains.xp)} XP`] : []),
      ...gains.items.map(itemLabel),
      ...(gains.levelUp ? [`niveau ${gains.level} !`] : []),
    ];
  };
  const eventLine = (event: TimelineEvent) => {
    const fight = event.fight
      ? [`${nounPhrase(nameOf("monsters", event.fight.monster))}${event.fight.rank === "normal" ? "" : ` (${event.fight.rank === "elite" ? "élite" : "boss"})`} → ${event.fight.result === "win" ? "victoire" : "fuite"}`]
      : [];
    const quest = event.questDone === undefined ? [] : [event.questDone ? "quête rendue" : "quête échouée"];
    const sounds = event.transitions.length > 0 ? [`[${event.transitions.join(", ")}]`] : [];
    const parts = [`${sceneName(event.scene)}, ${length(event.duration)}`, nounPhrase(nameOf("places", event.place), "le"), ...fight, ...quest, ...gainsOf(event), ...sounds];
    return `  ${elapsed(event.at)}  ${number(event.intensity, 2)}  ${parts.join(" · ")}`;
  };
  const questLine = (quest: QuestRun, events: TimelineEvent[]) => {
    const won = events.filter((event) => event.fight?.result === "win").length;
    const fled = events.filter((event) => event.fight?.result === "flee").length;
    const xp = events.reduce((sum, event) => sum + (event.gains?.xp ?? 0), 0);
    const items = events.flatMap((event) => event.gains?.items ?? []);
    const level = [...events].reverse().find((event) => event.gains?.levelUp)?.gains?.level;
    const end = events.find((event) => event.questDone !== undefined);
    const parts = [
      many(events.length, "scène", "scènes"),
      ...(won > 0 ? [many(won, "victoire", "victoires")] : []),
      ...(fled > 0 ? [many(fled, "fuite", "fuites")] : []),
      ...(end ? [end.questDone ? "rendue" : "échouée"] : ["en cours"]),
      ...(xp > 0 ? [`+${number(xp)} XP`] : []),
      ...items.map(itemLabel),
      ...(level === undefined ? [] : [`niveau ${level} !`]),
    ];
    return `${questHeader(quest)} · ${parts.join(" · ")}`;
  };

  const heardEnd = Math.min(night.soundSeconds, night.duration);
  lines.push("— La partie entendue — (heure · intensité · scène)");
  let previous: TimelineEvent | undefined;
  let silent = false;
  for (const quest of night.quests) {
    const events = night.events.filter((event) => event.quest === quest.index);
    const detailed = events.filter((event) => event.at < heardEnd || context.all);
    const summed = events.filter((event) => !detailed.includes(event));
    const startsSilent = quest.at >= heardEnd;
    const announce = () => {
      if (silent) return;
      silent = true;
      lines.push(
        "",
        `${elapsed(heardEnd)}  — fin du son (fondu depuis ${elapsed(night.finalFade.at)}) —`,
        "",
        `— La partie silencieuse —${context.all ? "" : " (une ligne par quête ; --all pour toutes les scènes)"}`,
      );
    };
    if (startsSilent) announce();
    if (detailed.length > 0) lines.push(questHeader(quest));
    for (const event of detailed) {
      if (event.at >= heardEnd) announce();
      if (!previous || previous.weather !== event.weather || previous.daylight !== event.daylight) {
        lines.push(`  ${elapsed(event.at)}        ~ ${DAYLIGHTS[event.daylight].toLowerCase()}, ${WEATHER_KINDS[event.weather].toLowerCase()}`);
      }
      lines.push(eventLine(event));
      previous = event;
    }
    if (summed.length > 0) {
      announce();
      lines.push(startsSilent ? questLine(quest, summed) : `  …la suite en silence : ${questLine(quest, summed).split(" · ").slice(1).join(" · ")}`);
      previous = summed[summed.length - 1];
    }
  }
  const lastEvent = night.events[night.events.length - 1];
  if (lastEvent) {
    lines.push("", `${elapsed(night.duration)}  — ${context.cut === undefined ? "réveil" : "app rouverte"} à ${clockAt(night.duration)} — ${many(night.events.length, "scène", "scènes")}, ${many(night.quests.length, "quête", "quêtes")}`);
  }

  // --- Summary ---
  lines.push("", "— Le résumé du matin —", night.summary.text, "");
  for (const line of night.summary.lines) {
    lines.push(`  ${elapsed(line.highlight.at)}  ${HIGHLIGHT_KINDS[line.highlight.kind].replace(/ \(.*/, "")} [${line.sentence}]`);
  }

  // --- Gains ---
  const totals = nightTotals(night);
  const byRarity = (Object.keys(RARITIES) as Rarity[])
    .map((rarity) => ({ rarity, count: totals.items.filter((item) => item.rarity === rarity).length }))
    .filter(({ count }) => count > 0)
    .map(({ rarity, count }) => `${count} ${RARITIES[rarity].toLowerCase()}${count > 1 ? "s" : ""}`);
  const notable = totals.items.filter((item) => item.rarity !== "common");
  const worn = equipBetter(context.gear, totals.items, world);
  const changed = (Object.keys(ITEM_SLOTS) as ItemSlot[]).filter((slot) => worn[slot] !== undefined && worn[slot] !== context.gear[slot]);
  lines.push(
    "",
    "— Les gains —",
    `XP : +${number(totals.xp)} · niveau ${night.hero.level} → ${totals.level} (${number(totals.levelXp)} / ${number(xpToNextLevel(totals.level, world.catalog.settings.xpCurve))} XP vers le suivant)`,
    `Quêtes rendues : ${number(totals.questsDone)} · combats : ${many(totals.fightsWon, "victoire", "victoires")}, ${many(totals.fightsFled, "fuite", "fuites")}`,
    `Butin : ${many(totals.items.length, "objet", "objets")}${byRarity.length > 0 ? ` (${byRarity.join(", ")})` : ""}`,
    ...notable.map((item) => `  ${itemLabel(item)}`),
    `Compagnons : ${totals.companions.length > 0 ? joinList(totals.companions.map((id) => nounPhrase(nameOf("companions", id)))) : "aucun"}`,
    changed.length > 0 ? "Équipé au réveil :" : "Équipé au réveil : rien de mieux que l’équipement du coucher",
    ...changed.map((slot) => `  ${ITEM_SLOTS[slot]} : ${itemLabel(worn[slot] as ItemInstance)}`),
  );

  // --- Sound ---
  const layers = [...(Object.keys(SOUND_LAYERS) as (keyof typeof SOUND_LAYERS)[]), "noiseBed" as const];
  const perLayer = layers
    .map((layer) => ({ label: layer === "noiseBed" ? "fond continu" : SOUND_LAYERS[layer].toLowerCase(), count: night.cues.filter((cue) => cue.layer === layer).length }))
    .filter(({ count }) => count > 0)
    .map(({ label, count }) => `${label} ${count}`);
  lines.push("", "— Le son —", `${many(night.cues.length, "lecture prévue", "lectures prévues")}${perLayer.length > 0 ? ` (${perLayer.join(", ")})` : ""}`);

  // --- Warnings ---
  lines.push("", "— Les avertissements —", ...(night.warnings.length > 0 ? warningLines(night.warnings) : ["Aucun."]));
  return lines.join("\n");
}

function warningLines(warnings: readonly NightWarning[]): string[] {
  const empty = warnings.flatMap((warning) => (warning.kind === "emptyCategory" ? [warning] : []));
  const mute = empty.filter((warning) => warning.fallback === undefined).map((warning) => warning.category);
  return [
    ...(mute.length > 0 ? [`Catégories sans aucun son, même en repli (${mute.length}) : ${mute.join(", ")}`] : []),
    ...empty.filter((warning) => warning.fallback !== undefined).map((warning) => `Catégorie « ${warning.category} » sans son : repli sur « ${warning.fallback} »`),
    ...warnings.flatMap((warning) => {
      if (warning.kind === "noNoiseBedSound") return [`Fond sonore continu : aucun son dans la catégorie « ${warning.category} », un bruit brun joue à la place`];
      if (warning.kind === "noRestQuest") return [`Aucune quête de pause dans la zone « ${warning.zone} » : la partie entendue ne finit pas par un repos`];
      if (warning.kind === "noSentence") return [`Aucune phrase du résumé ne convient au temps fort « ${HIGHLIGHT_KINDS[warning.highlight].replace(/ \(.*/, "")} »`];
      return [];
    }),
  ];
}
