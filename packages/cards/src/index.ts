import type { CardDb, CardDefId, CardDefinition } from '@mtg/engine';
import { BEHAVIORS, TOKENS } from './behaviors.ts';
import { buildCard, slug } from './build.ts';
import scryfall from './generated/scryfall.json' with { type: 'json' };
import type { ScryfallCard } from './scryfall-types.ts';

export { BEHAVIORS, TOKENS } from './behaviors.ts';
export { buildCard, slug, parseManaCost, parseTypeLine } from './build.ts';
export { GREEN_POOL, RED_POOL } from './pool.ts';
export { describeEvent } from './log.ts';
export type { ScryfallCard } from './scryfall-types.ts';

export const SCRYFALL: readonly ScryfallCard[] = scryfall as ScryfallCard[];

export const CARDS: readonly CardDefinition[] = [
  ...SCRYFALL.map((sc) => buildCard(sc, BEHAVIORS[sc.name])),
  ...TOKENS,
];

export const cardDb: CardDb = new Map(CARDS.map((c) => [c.id, c]));

/** Scryfall data by card id, for image hotlinking in the UI. */
export const scryfallById: ReadonlyMap<CardDefId, ScryfallCard> = new Map(
  SCRYFALL.map((sc) => [slug(sc.name), sc]),
);

export interface Decklist {
  name: string;
  cards: [name: string, count: number][];
}

export const MONO_RED: Decklist = {
  name: 'Mono-Red Aggro',
  cards: [
    ['Mountain', 23],
    ['Shock', 3],
    ['Lightning Strike', 3],
    ['Boltwave', 1],
    ['Kindled Fury', 1],
    ['Sure Strike', 1],
    ['Crash Through', 1],
    ['Dragon Fodder', 1],
    ['Seismic Rupture', 1],
    ['Fanatical Firebrand', 2],
    ['Viashino Pyromancer', 2],
    ['Heartfire Immolator', 2],
    ['Swab Goblin', 2],
    ['Firebrand Archer', 2],
    ['Searslicer Goblin', 1],
    ['Raging Redcap', 1],
    ['Brazen Scourge', 2],
    ['Guttersnipe', 1],
    ['Giant Cindermaw', 1],
    ['Spitfire Lagac', 1],
    ['Battlesong Berserker', 1],
    ['Skyraker Giant', 1],
    ['Ravenous Giant', 1],
    ['Ball Lightning', 1],
    ['Gorehorn Raider', 1],
    ['Fire Elemental', 1],
    ['Dragon Trainer', 1],
    ['Shivan Dragon', 1],
  ],
};

export const MONO_GREEN: Decklist = {
  name: 'Mono-Green Stompy',
  cards: [
    ['Forest', 24],
    ['Giant Growth', 3],
    ['Snakeskin Veil', 1],
    ['Bite Down', 2],
    ['Broken Wings', 1],
    ['Felling Blow', 1],
    ['Overrun', 1],
    ['Bear Cub', 3],
    ['Thornweald Archer', 2],
    ['Druid of the Cowl', 2],
    ["Dwynen's Elite", 2],
    ['Imperious Perfect', 1],
    ['Beast-Kin Ranger', 2],
    ['Magnigoth Sentry', 2],
    ['Treetop Snarespinner', 1],
    ['Gnarlback Rhino', 2],
    ['Wildheart Invoker', 1],
    ['Tajuru Pathwarden', 1],
    ['Elfsworn Giant', 1],
    ["Heroes' Bane", 1],
    ['Rampaging Baloths', 1],
    ['Affectionate Indrik', 1],
    ['Quakestrider Ceratops', 1],
    ['Pelakka Wurm', 1],
    ['Aggressive Mammoth', 1],
    ['Gigantosaurus', 1],
  ],
};

/** Expands a decklist to card ids. */
export function deckIds(list: Decklist): CardDefId[] {
  return list.cards.flatMap(([name, n]) => Array<CardDefId>(n).fill(slug(name)));
}
