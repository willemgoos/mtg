import type { EffectDef, Ref } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import { onEnter, spell, t0, t1, theirCreature, yourCreature } from './helpers.ts';

// Marvel Super Heroes Jumpstart, Precise packet (docs/marvel-jumpstart.md): the cards it was
// missing. Valkyrior Skyrider is shared with Caretakers.

const counters2 = (to: Ref): EffectDef => ({ kind: 'counters', to, amount: 2 });
/** "Tap it and put a stun counter on it." */
const stun = (what: Ref): EffectDef[] => [
  { kind: 'tap', what },
  { kind: 'namedCounters', name: 'stun', amount: 1, to: what },
];

export const MSH_JUMPSTART_PRECISE: Record<string, Behavior> = {
  // Reach and vigilance come from Scryfall.
  'Hawkeye, Bowslinger': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'castSpell', filter: 'targetsCreature' },
        targets: [],
        effects: [
          { kind: 'counters', to: 'self', amount: 1 },
          { kind: 'scry', amount: 1 },
        ],
      },
    ],
  },
  // Double strike comes from Scryfall.
  'Mockingbird, Ace Agent': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'castSpell', filter: 'targetsYourCreature' },
        targets: [],
        effects: [{ kind: 'counters', to: 'self', amount: 1 }],
      },
    ],
  },
  // Flying comes from Scryfall.
  'Valkyrior Skyrider': {
    abilities: [onEnter({ kind: 'gainLife', who: 'controller', amount: 4 })],
  },
  // Two independent "up to one" targets: the engine's optional targets are a prefix, so the
  // stun alone (no creature of yours targeted) is its own mode, as Decoy Ploy does.
  'Stunning Shot': {
    modes: [
      {
        label: 'Counters on your creature, stun theirs',
        targets: [
          { ...yourCreature, optional: true },
          { ...theirCreature, optional: true },
        ],
        effects: [counters2(t0), ...stun(t1)],
      },
      {
        label: "Only stun a creature you don't control",
        targets: [theirCreature],
        effects: stun(t0),
      },
    ],
  },
  'Sudden Strike': spell([{ what: 'creature', filter: { attackingOrBlocking: true } }], {
    kind: 'destroy',
    what: t0,
  }),
};
