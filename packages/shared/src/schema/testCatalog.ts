// A tiny valid catalog for the schema tests: one item per collection, every reference used.

export function tinyCatalogData() {
  return {
    zones: [{ id: "bois", name: { text: { fr: "Bois" }, gender: "m" }, weather: { clear: 1, cloudy: 1, rain: 1, storm: 0 }, monsters: ["loup"] }],
    places: [
      { id: "auberge", name: { text: { fr: "Auberge" }, gender: "f" }, zone: "bois", kind: "inn", floor: "wood", ambience: "taverne", enterTransition: "porte" },
    ],
    monsters: [{ id: "loup", name: { text: { fr: "loup" }, gender: "m" }, rank: "normal" }],
    questTemplates: [
      {
        id: "chasse",
        kind: "hunt",
        title: { fr: "{monster:pl:le} {place:de}" },
        zones: ["bois"],
        placeKinds: ["wild"],
        monsterRank: "normal",
        steps: [
          { action: "accept", scene: "combat", transition: "porte" },
          { action: "do", eventTable: "chasse", repeat: { min: 2, max: 4 } },
        ],
        xp: 100,
        weight: 10,
      },
    ],
    sceneTemplates: [{ id: "combat", name: { fr: "Combattre" }, kind: "fight", duration: { min: 30, max: 90 }, intensity: 0.9, actionCategory: "combat" }],
    eventTables: [{ id: "chasse", name: { fr: "Chasse" }, rows: [{ scene: "combat", weight: 1, outcome: "fight" }] }],
    ambiences: [
      {
        id: "taverne",
        name: { fr: "Taverne" },
        layers: [
          { id: "fond", name: { fr: "Brouhaha" }, category: "brouhaha", volume: 0.6, probability: 1, drift: 0.1 },
          { id: "pluie", name: { fr: "Pluie sur le toit" }, category: "brouhaha", volume: 0.3, probability: 1, drift: 0.3, when: { weather: ["rain", "storm"] } },
        ],
        oneShots: [{ category: "voix", when: { daylight: ["day"] } }],
      },
    ],
    soundCategories: [
      { id: "brouhaha", name: { fr: "Brouhaha" }, layer: "ambience", maxVolume: 0.7, volumeJitter: 0.1, rateJitter: 0.03 },
      { id: "combat", name: { fr: "Combat" }, layer: "action", maxVolume: 0.6, volumeJitter: 0.2, rateJitter: 0.08, fallback: "combat" },
      { id: "voix", name: { fr: "Voix" }, layer: "oneShot", maxVolume: 0.4, volumeJitter: 0.2, rateJitter: 0.1, minGap: { min: 20, max: 90 }, burst: { chance: 0.2, count: { min: 2, max: 3 } } },
      { id: "porte", name: { fr: "Porte" }, layer: "transition", maxVolume: 0.5, volumeJitter: 0.1, rateJitter: 0.03 },
    ],
    sounds: [{ id: "brouhaha-01", file: "abc123", category: "brouhaha", places: ["auberge"], loop: true, duration: 61, volume: 0.8, weight: 1 }],
    items: [{ id: "epee", name: { text: { fr: "épée" }, gender: "f" }, slot: "weapon", rarity: "common", power: 1 }],
    companions: [{ id: "brann", name: { text: { fr: "Brann" }, gender: "m", proper: true }, role: "tank", quips: [{ fr: "En route." }] }],
    summarySentences: [{ id: "opening-01", trigger: "opening", text: { fr: "{hero} a quitté {place:le}." }, weight: 10 }],
    settings: {
      xpCurve: { base: 100, growth: 1.15 },
      fightXp: { normal: 35, elite: 90, boss: 250 },
      successBase: { normal: 0.9, elite: 0.65, boss: 0.5 },
      successBounds: { min: 0.4, max: 0.98 },
      gearWeight: 0.02,
      groupBonus: { success: 0.15, loot: 1.25 },
      knownCompanionWeight: 3,
      dropChance: { normal: 0.25, elite: 0.6, boss: 1 },
      lootRates: {
        normal: { common: 88, rare: 11, epic: 1, legendary: 0 },
        elite: { common: 55, rare: 35, epic: 9, legendary: 1 },
        boss: { common: 0, rare: 55, epic: 38, legendary: 7 },
      },
      weatherMinMinutes: 20,
      silentIntensity: 0.5,
      levelUpTransition: "porte",
      noiseBed: { kind: "sound", volume: 0.12, category: "brouhaha" },
    },
  };
}
