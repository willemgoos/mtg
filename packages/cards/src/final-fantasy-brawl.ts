import type { CardDefinition, Color, Keyword } from '@mtg/engine';
import type { Behavior } from './build.ts';
import { FIC_SHARED, FIC_SHARED_BACK_FACES } from './fic/shared.ts';
import { AERITH } from './fic/aerith.ts';
import { CLOUD } from './fic/cloud.ts';
import { EMET_SELCH } from './fic/emet-selch.ts';
import { LOCKE } from './fic/locke.ts';
import { TERRA } from './fic/terra.ts';
import { TIDUS } from './fic/tidus.ts';
import { YSHTOLA, YSHTOLA_BACK_FACES } from './fic/yshtola.ts';

/**
 * Final Fantasy Commander (FIC) card behaviour for the Arena Store Brawl decks
 * (phase 12 in docs/final-fantasy-plan.md): shared lands, the FIN booster
 * cards they use, then one file per deck. Printed characteristics come from
 * Scryfall; only rules text lives here.
 */
export const FINAL_FANTASY_BRAWL_BEHAVIORS: Record<string, Behavior> = {
  ...FIC_SHARED,
  ...TERRA,
  ...CLOUD,
  ...TIDUS,
  ...YSHTOLA,
  ...AERITH,
  ...EMET_SELCH,
  ...LOCKE,
};

/** Back faces of double-faced cards: not cards of their own, so not in the pool. */
export const FINAL_FANTASY_BRAWL_BACK_FACES: Record<string, Behavior> = {
  ...FIC_SHARED_BACK_FACES,
  ...YSHTOLA_BACK_FACES,
};

const creatureToken = (
  id: string,
  name: string,
  colors: Color[],
  subtypes: string[],
  power: number,
  toughness: number,
  keywords: Keyword[] = [],
): CardDefinition => ({
  id,
  name,
  manaCost: { generic: 0, colored: {} },
  colors,
  types: ['Creature'],
  supertypes: [],
  subtypes,
  power,
  toughness,
  keywords,
  abilities: [],
  isToken: true,
});

/**
 * Tokens the FIC decks make that the other sets don't. The FIN tokens (Hero,
 * Knight, Darkstar, Angelo, Horror, Robot Warrior, Wizard, Bird) are phase 11's
 * (FINAL_FANTASY_TOKENS).
 */
export const FINAL_FANTASY_BRAWL_TOKENS: CardDefinition[] = [
  creatureToken('human-soldier-token', 'Human Soldier', ['W'], ['Human', 'Soldier'], 1, 1),
  creatureToken('wolf-2-2-token', 'Wolf', ['G'], ['Wolf'], 2, 2),
  creatureToken('frog-token', 'Frog', ['G'], ['Frog'], 1, 1),
  // Islandwalk isn't built.
  creatureToken('squid-token', 'Squid', ['U'], ['Squid'], 1, 1),
];
