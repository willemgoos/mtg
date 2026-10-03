import type { AbilityDef, EffectDef } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import { equip } from '../msc/helpers.ts';
import { prowess, t0, teamwork } from './helpers.ts';

// Marvel Super Heroes Jumpstart, Young Avengers packet (docs/marvel-jumpstart.md): the cards it
// was missing. Iron Lad (Iron Man, Kang Dynasty), Patriot (Equipped), Stature (Towering) and
// Crossover Collaboration (Runaways) are shared with other packets.

/** "Whenever you cast a noncreature spell, ..." */
const onNoncreature = (
  targets: Extract<AbilityDef, { kind: 'triggered' }>['targets'],
  ...effects: EffectDef[]
): AbilityDef => ({
  kind: 'triggered',
  trigger: { on: 'castSpell', filter: 'noncreature' },
  targets,
  effects,
});

const crossover: EffectDef = { kind: 'exileTopPlayable', count: 2, until: 'endOfNextTurn' };

export const MSH_JUMPSTART_YOUNG_AVENGERS: Record<string, Behavior> = {
  // Reach comes from Scryfall.
  'Stature, Young Avenger': {
    abilities: [
      onNoncreature([], { kind: 'pump', to: 'self', power: 0, toughness: 0, basePT: [4, 4] }),
    ],
  },
  'Patriot, Young Avenger': {
    abilities: [
      prowess,
      {
        kind: 'static',
        effect: {
          kind: 'anthem',
          affects: 'otherCreaturesYouControl',
          condition: { kind: 'custom', handler: 'sourceEquipped' },
          power: 1,
          toughness: 0,
        },
      },
    ],
  },
  // Flying comes from Scryfall.
  'Iron Lad, Young Avenger': {
    abilities: [
      {
        kind: 'static',
        effect: { kind: 'spellsCostLess', filter: { notTypes: ['Creature'] }, amount: 1 },
      },
    ],
  },
  // Flying comes from Scryfall. Ability 0 is the one he keeps while he's a copy.
  'Hulkling, Young Avenger': {
    abilities: [
      onNoncreature([{ what: 'creature', filter: { other: true }, optional: true }], {
        kind: 'becomeCopy',
        of: t0,
        keepName: true,
        keepAbilities: [0],
        asCreature: { power: 4, toughness: 4, subtypes: [], keywords: ['flying'] },
      }),
    ],
  },
  "Hawkeye's Bow": {
    abilities: [
      { kind: 'static', effect: { kind: 'attached', power: 1, toughness: 0, keywords: ['reach'] } },
      {
        kind: 'triggered',
        trigger: { on: 'equippedBecomesTapped' },
        targets: [],
        effects: [{ kind: 'damage', amount: 1, to: 'eachOpponent', from: 'subject' }],
      },
      equip('{1}'),
    ],
  },
  'Crossover Collaboration': teamwork(
    2,
    { targets: [], effects: [crossover] },
    {
      targets: [],
      effects: [crossover, { kind: 'createToken', token: 'treasure-token', count: 1 }],
    },
  ),
};
