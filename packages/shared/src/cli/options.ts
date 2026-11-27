// The options of `npm run simulate`, read from the command line.

import { parseArgs } from "node:util";
import { GENDERS, type Gender } from "../schema/common";

export type SimulateOptions = {
  seed: number;
  /** The sound timer, in minutes. */
  soundMinutes: number;
  /** Bedtime and wake time on the clock, in minutes since midnight. */
  start: number;
  wake: number;
  /** When the app is opened again, in minutes since midnight; the night is cut there. */
  cut?: number;
  level: number;
  name: string;
  gender: Gender;
  zone?: string;
  /** Print the night as JSON instead of the report. */
  json: boolean;
  /** List every scene of the silent part instead of one line per quest. */
  all: boolean;
};

export const USAGE = `Simule une nuit et l’affiche.

  npm run simulate --workspace packages/shared -- [options]

  --seed <n>       la graine de l’aventure (4821)
  --sound <min>    la minuterie du son, en minutes (30)
  --start <hh:mm>  l’heure du coucher (23:00)
  --wake <hh:mm>   l’heure du réveil (07:00)
  --level <n>      le niveau du perso, équipé d’objets communs de son niveau (5)
  --cut <hh:mm>    l’heure où l’app est rouverte : la nuit est coupée là
  --name <nom>     le nom du perso (Aldric)
  --gender <m|f>   son genre, pour les accords du résumé (m)
  --zone <id>      la zone, au lieu d’une zone au hasard
  --all            toutes les scènes de la partie silencieuse, pas une ligne par quête
  --json           la nuit en JSON, telle que l’app la reçoit
  --help           cette aide`;

/** Thrown for an option the command cannot use; its message is shown to the user, in French. */
export class OptionError extends Error {}

const DAY = 24 * 60;

/** "23:00" as minutes since midnight. */
export function parseClock(text: string, option: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(text.trim());
  const hours = Number(match?.[1]);
  const minutes = Number(match?.[2]);
  if (!match || hours > 23 || minutes > 59) throw new OptionError(`--${option} : « ${text} » n’est pas une heure (attendu : 23:00)`);
  return hours * 60 + minutes;
}

function parseCount(text: string, option: string, least: number): number {
  const value = Number(text);
  if (!Number.isInteger(value) || value < least) throw new OptionError(`--${option} : « ${text} » n’est pas un nombre entier d’au moins ${least}`);
  return value;
}

/** Minutes from one time on the clock to the next occurrence of another: a whole day when they are the same. */
export function minutesBetween(from: number, to: number): number {
  return ((to - from + DAY - 1) % DAY) + 1;
}

export function parseOptions(args: readonly string[]): SimulateOptions | "help" {
  let values;
  try {
    ({ values } = parseArgs({
      args: [...args],
      options: {
        seed: { type: "string", default: "4821" },
        sound: { type: "string", default: "30" },
        start: { type: "string", default: "23:00" },
        wake: { type: "string", default: "07:00" },
        level: { type: "string", default: "5" },
        cut: { type: "string" },
        name: { type: "string", default: "Aldric" },
        gender: { type: "string", default: "m" },
        zone: { type: "string" },
        all: { type: "boolean", default: false },
        json: { type: "boolean", default: false },
        help: { type: "boolean", default: false },
      },
    }));
  } catch (error) {
    throw new OptionError(`Option inconnue ou incomplète (${(error as Error).message})`);
  }
  if (values.help) return "help";

  const start = parseClock(values.start, "start");
  const wake = parseClock(values.wake, "wake");
  const cut = values.cut === undefined ? undefined : parseClock(values.cut, "cut");
  if (cut !== undefined && minutesBetween(start, cut) > minutesBetween(start, wake)) {
    throw new OptionError(`--cut : ${values.cut} tombe après le réveil (${values.wake})`);
  }
  if (!(values.gender in GENDERS)) throw new OptionError(`--gender : « ${values.gender} » n’est ni m ni f`);

  return {
    seed: parseCount(values.seed, "seed", 0),
    soundMinutes: parseCount(values.sound, "sound", 1),
    start,
    wake,
    ...(cut === undefined ? {} : { cut }),
    level: parseCount(values.level, "level", 1),
    name: values.name,
    gender: values.gender as Gender,
    ...(values.zone === undefined ? {} : { zone: values.zone }),
    all: values.all,
    json: values.json,
  };
}
