import type { CardDefinition, Color, Keyword } from '@mtg/engine';
import type { Behavior } from './build.ts';
import { FIN_SHARED, FIN_SHARED_BACK_FACES } from './fic/fin-shared.ts';
import { FIC_SHARED, FIC_SHARED_BACK_FACES } from './fic/shared.ts';
import { AERITH } from './fic/aerith.ts';
import { CLOUD } from './fic/cloud.ts';
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
  ...FIN_SHARED,
  ...TERRA,
  ...CLOUD,
  ...TIDUS,
  ...YSHTOLA,
  ...AERITH,
};

/** Back faces of double-faced cards: not cards of their own, so not in the pool. */
export const FINAL_FANTASY_BRAWL_BACK_FACES: Record<string, Behavior> = {
  ...FIC_SHARED_BACK_FACES,
  ...FIN_SHARED_BACK_FACES,
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

/** Tokens the FIC decks make that the other sets don't. */
export const FINAL_FANTASY_BRAWL_TOKENS: CardDefinition[] = [
  creatureToken('human-soldier-token', 'Human Soldier', ['W'], ['Human', 'Soldier'], 1, 1),
  // FIN's Hero: a 1/1 colourless Hero (phase 11 may share it).
  creatureToken('hero-1-1-token', 'Hero', [], ['Hero'], 1, 1),
  creatureToken('knight-2-2-token', 'Knight', ['W'], ['Knight'], 2, 2),
  {
    ...creatureToken('darkstar-token', 'Darkstar', ['W', 'B'], ['Dog'], 2, 2),
    supertypes: ['Legendary'],
  },
  {
    ...creatureToken('angelo-token', 'Angelo', ['G', 'W'], ['Dog'], 1, 1),
    supertypes: ['Legendary'],
  },
  creatureToken('wolf-2-2-token', 'Wolf', ['G'], ['Wolf'], 2, 2),
  creatureToken('frog-token', 'Frog', ['G'], ['Frog'], 1, 1),
  creatureToken('moogle-token', 'Moogle', ['W'], ['Moogle'], 1, 2, ['lifelink']),
  {
    // Black Mage Wizard: "Whenever you cast a noncreature spell, this token deals 1 damage to each opponent."
    ...creatureToken('wizard-ping-token', 'Wizard', ['B'], ['Wizard'], 0, 1),
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'castSpell', filter: 'noncreature' },
        targets: [],
        effects: [{ kind: 'damage', amount: 1, to: 'eachOpponent' }],
      },
    ],
  },
  // Islandwalk isn't built.
  creatureToken('squid-token', 'Squid', ['U'], ['Squid'], 1, 1),
  {
    // Summon: Fat Chocobo's Bird: "Whenever a land you control enters, this token gets +1/+0 until end of turn."
    ...creatureToken('chocobo-bird-token', 'Bird', ['G'], ['Bird'], 2, 2),
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'landfall' },
        targets: [],
        effects: [{ kind: 'pump', to: 'self', power: 1, toughness: 0 }],
      },
    ],
  },
];
