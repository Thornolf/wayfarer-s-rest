// The fill-in-the-blanks sentences of the content (summary sentences, quest titles).
//
//   {hero}               a slot: the name alone, or a text or a number
//   {place:de}           a name with a form: le, un, de, a (or à), d, ce — see text/french.ts
//   {monster:pl:le}      `pl` puts the name in the plural first
//   {hero?parti|partie}  agreement: the first text for a masculine name, the second for a feminine
//   [a|b|c]              one variant among several; a variant may hold slots and other variants
//
// The first letter of each sentence is capitalised, so "{place:le} dormait." gives "L’auberge dormait."

import type { Locale } from "../locale";
import type { Noun } from "../schema/common";
import type { Rng } from "../rng";
import { NOUN_FORMS, nounPhrase, type NounForm } from "./french";

export type SlotValue = Noun | string | number;
export type SlotKind = "noun" | "text" | "number";

type TemplateNode =
  | { type: "text"; value: string }
  | { type: "slot"; name: string; form: NounForm; plural: boolean }
  | { type: "agreement"; name: string; masculine: string; feminine: string }
  | { type: "choice"; options: TemplateNode[][] };

export type RenderOptions = {
  /** Picks among `[a|b]` variants. Without it the first variant is always taken. */
  rng?: Pick<Rng, "int">;
  locale?: Locale;
};

export class TemplateError extends Error {}

const SLOT_NAME = /^[a-zA-Z][a-zA-Z0-9]*$/;
const FORM_ALIASES: Record<string, NounForm> = { à: "a" };

function parseSlot(body: string): TemplateNode {
  const agreement = body.indexOf("?");
  if (agreement >= 0) {
    const name = body.slice(0, agreement);
    const forms = body.slice(agreement + 1).split("|");
    if (!SLOT_NAME.test(name) || forms.length !== 2) {
      throw new TemplateError(`Invalid agreement {${body}}: expected {slot?masculine|feminine}`);
    }
    return { type: "agreement", name, masculine: forms[0] as string, feminine: forms[1] as string };
  }

  const [name = "", ...filters] = body.split(":");
  if (!SLOT_NAME.test(name)) throw new TemplateError(`Invalid slot name in {${body}}`);
  let form: NounForm | undefined;
  let plural = false;
  for (const filter of filters) {
    const asForm = FORM_ALIASES[filter] ?? filter;
    if (filter === "pl" && !plural) plural = true;
    else if (form === undefined && asForm !== "bare" && (NOUN_FORMS as readonly string[]).includes(asForm)) {
      form = asForm as NounForm;
    } else throw new TemplateError(`Unknown or repeated filter "${filter}" in {${body}}`);
  }
  return { type: "slot", name, form: form ?? "bare", plural };
}

/** Parses from `start` until the end of the source, or until the `|` or `]` that ends a variant. */
function parseSequence(source: string, start: number, inChoice: boolean): { nodes: TemplateNode[]; end: number } {
  const nodes: TemplateNode[] = [];
  let text = "";
  let i = start;
  const flushText = () => {
    if (text) nodes.push({ type: "text", value: text });
    text = "";
  };

  while (i < source.length) {
    const char = source.charAt(i);
    if (inChoice && (char === "|" || char === "]")) break;
    if (char === "{") {
      const close = source.indexOf("}", i);
      if (close < 0) throw new TemplateError(`Unclosed { at position ${i}`);
      flushText();
      nodes.push(parseSlot(source.slice(i + 1, close)));
      i = close + 1;
    } else if (char === "[") {
      flushText();
      const options: TemplateNode[][] = [];
      do {
        const option = parseSequence(source, i + 1, true);
        options.push(option.nodes);
        i = option.end;
      } while (source.charAt(i) === "|");
      if (source.charAt(i) !== "]") throw new TemplateError("Unclosed [");
      nodes.push({ type: "choice", options });
      i += 1;
    } else if (char === "}" || char === "]") {
      throw new TemplateError(`Unexpected ${char} at position ${i}`);
    } else {
      text += char;
      i += 1;
    }
  }
  flushText();
  return { nodes, end: i };
}

function parseTemplate(source: string): TemplateNode[] {
  return parseSequence(source, 0, false).nodes;
}

function isNoun(value: SlotValue): value is Noun {
  return typeof value === "object";
}

/** Upper-cases the first letter of the text and of every sentence after a full stop, `!` or `?`. */
function capitalizeSentences(text: string): string {
  return text.replace(/(^|[.!?]\s+)([«“]\s?)?(\p{Ll})/gu, (_match, before: string, quote: string | undefined, letter: string) =>
    `${before}${quote ?? ""}${letter.toUpperCase()}`,
  );
}

function renderNodes(nodes: TemplateNode[], slots: Record<string, SlotValue>, options: RenderOptions): string {
  return nodes
    .map((node) => {
      if (node.type === "text") return node.value;
      if (node.type === "choice") {
        const index = options.rng ? options.rng.int(0, node.options.length - 1) : 0;
        return renderNodes(node.options[index] as TemplateNode[], slots, options);
      }
      const value = slots[node.name];
      if (value === undefined) throw new TemplateError(`No value for slot {${node.name}}`);
      if (node.type === "agreement") {
        if (!isNoun(value)) throw new TemplateError(`{${node.name}?…} needs a name, got a ${typeof value}`);
        return value.gender === "m" ? node.masculine : node.feminine;
      }
      if (isNoun(value)) {
        return nounPhrase(value, node.form, { plural: node.plural, ...(options.locale ? { locale: options.locale } : {}) });
      }
      if (node.form !== "bare" || node.plural) {
        throw new TemplateError(`{${node.name}} has a filter but its value is a ${typeof value}, not a name`);
      }
      return String(value);
    })
    .join("");
}

/** Fills a template. Throws a TemplateError when the template is malformed or a slot has no value. */
export function renderTemplate(source: string, slots: Record<string, SlotValue>, options: RenderOptions = {}): string {
  return capitalizeSentences(renderNodes(parseTemplate(source), slots, options));
}

/**
 * Checks a template without rendering it: its syntax, that it only uses the slots given, and that
 * forms and agreements are only asked of slots that hold a name. Returns the problems found, in
 * English, for the schema to report; an empty list means the template is fine.
 */
export function templateProblems(source: string, slotKinds: Readonly<Record<string, SlotKind>>): string[] {
  let nodes: TemplateNode[];
  try {
    nodes = parseTemplate(source);
  } catch (error) {
    if (error instanceof TemplateError) return [error.message];
    throw error;
  }

  const problems = new Set<string>();
  const visit = (node: TemplateNode): void => {
    if (node.type === "text") return;
    if (node.type === "choice") {
      node.options.flat().forEach(visit);
      return;
    }
    const kind = slotKinds[node.name];
    const needsNoun = node.type === "agreement" || node.form !== "bare" || node.plural;
    if (kind === undefined) problems.add(`Unknown slot {${node.name}}`);
    else if (needsNoun && kind !== "noun") problems.add(`{${node.name}} is a ${kind}: it takes no form or agreement`);
  };
  nodes.forEach(visit);
  return [...problems];
}
