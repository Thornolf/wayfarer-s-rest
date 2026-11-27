// Writing the summary: one sentence per highlight kept, drawn from a shuffle bag that remembers
// the nights before, then filled with the names of the night.

import type { QuestRun, TimelineEvent } from "../generator/types";
import { DEFAULT_LOCALE, localize, type Locale } from "../locale";
import { ShuffleBag, copiesByWeight, createRng } from "../rng";
import type { Gender, Noun } from "../schema/common";
import { HIGHLIGHT_SLOTS, type HighlightKind, type SummarySentence } from "../schema/summary";
import { joinList, properNoun } from "../text/french";
import { renderTemplate, type SlotValue } from "../text/template";
import type { World } from "../world";
import { selectHighlights, siftHighlights } from "./highlights";
import type { Highlight, Summary, SummaryLine } from "./types";

export type SummaryRequest = {
  seed: number;
  world: World;
  /** The night as far as it was played: cut it before asking for its summary. */
  events: readonly TimelineEvent[];
  quests: readonly QuestRun[];
  zone: string;
  hero: { name: string; gender: Gender };
  /** The sentence bags kept in the character. */
  served: Summary["served"];
  locale?: Locale;
};

/** A stand-in for a name the catalog no longer has, so that a sentence can still be written. */
const UNKNOWN: Noun = { text: { fr: "?" }, gender: "m", proper: true };

function suits(sentence: SummarySentence, highlight: Highlight): boolean {
  const when = sentence.when;
  if (!when) return true;
  if (when.weather?.length && !when.weather.includes(highlight.weather)) return false;
  if (when.daylight?.length && !when.daylight.includes(highlight.daylight)) return false;
  if (when.outcome !== undefined && when.outcome !== highlight.outcome) return false;
  if (when.companion !== undefined && when.companion !== (highlight.companions ?? []).length > 0) return false;
  return when.minCount === undefined || (highlight.count ?? 0) >= when.minCount;
}

/** The value of every slot a sentence of this kind may use. */
function slotsFor(highlight: Highlight, request: SummaryRequest, locale: Locale): Record<string, SlotValue> {
  const { world } = request;
  const nameOf = (collection: "places" | "zones" | "monsters" | "items" | "companions", id: string | undefined): Noun =>
    (id === undefined ? undefined : world.byId[collection].get(id)?.name) ?? UNKNOWN;
  const values: Record<string, SlotValue> = {
    hero: properNoun(request.hero.name, request.hero.gender),
    place: nameOf("places", highlight.place),
    zone: nameOf("zones", request.zone),
    quest: highlight.quest ?? "",
    count: highlight.count ?? 0,
    level: highlight.level ?? 0,
    xp: highlight.xp ?? 0,
    monster: nameOf("monsters", highlight.monster),
    item: nameOf("items", highlight.item?.item),
    companion: nameOf("companions", highlight.companion),
    quip: highlight.quip ?? "",
    companions: joinList((highlight.companions ?? []).map((id) => localize(nameOf("companions", id).text, locale))),
  };
  return Object.fromEntries(Object.keys(HIGHLIGHT_SLOTS[highlight.kind]).map((slot) => [slot, values[slot] as SlotValue]));
}

/** Sifts the night, keeps its best moments and writes them. Also lists the kinds no sentence could tell. */
export function summarize(request: SummaryRequest): { summary: Summary; untold: HighlightKind[] } {
  const { world } = request;
  const locale = request.locale ?? DEFAULT_LOCALE;
  const rng = createRng(request.seed).fork("summary");
  const sentencesOf = (kind: HighlightKind) => world.active.summarySentences.filter((sentence) => sentence.trigger === kind && sentence.weight > 0);
  const suitableFor = (highlight: Highlight) => sentencesOf(highlight.kind).filter((sentence) => suits(sentence, highlight));

  // A moment no sentence can tell leaves its place to another, and the hole is reported.
  const moments = siftHighlights(request, world, rng.fork("sift"), locale);
  const untold = new Set(moments.filter((highlight) => suitableFor(highlight).length === 0).map((highlight) => highlight.kind));
  const highlights = selectHighlights(moments.filter((highlight) => suitableFor(highlight).length > 0));

  const bags = new Map<HighlightKind, ShuffleBag<string>>();
  const bagOf = (kind: HighlightKind): ShuffleBag<string> => {
    let bag = bags.get(kind);
    if (!bag) {
      const weights = new Map(sentencesOf(kind).map((sentence) => [sentence.id, sentence.weight]));
      const state = request.served[kind];
      bag = new ShuffleBag([...weights.keys()], rng.fork(`bag-${kind}`), { copies: copiesByWeight(weights), ...(state ? { state } : {}) });
      bags.set(kind, bag);
    }
    return bag;
  };

  const lines = highlights.map((highlight, position): SummaryLine => {
    const suitable = new Map(suitableFor(highlight).map((sentence) => [sentence.id, sentence]));
    const id = bagOf(highlight.kind).next((candidate) => suitable.has(candidate));
    const sentence = suitable.get(id) as SummarySentence;
    const text = renderTemplate(localize(sentence.text, locale), slotsFor(highlight, request, locale), { rng: rng.fork(`line-${position}`), locale });
    return { highlight, sentence: id, text };
  });

  const served: Summary["served"] = { ...request.served };
  for (const [kind, bag] of bags) served[kind] = bag.state;
  return { summary: { text: lines.map((line) => line.text).join(" "), lines, served }, untold: [...untold] };
}
