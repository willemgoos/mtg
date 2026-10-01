import type { AbilityDef, CardFilter, EffectDef, Ref, TargetSpec } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import {
  creature,
  draw,
  food,
  gain,
  gift,
  mana,
  offspring,
  onEnter,
  prowess,
  pump,
  t0,
  t1,
  theirCreature,
  when,
  youControl,
  yourCreature,
  yourCreaturesOf,
} from './helpers.ts';

// Izzet Otters (noncreature spells) and Simic Frogs (bounce and blink).

const noncreature: CardFilter = { notTypes: ['Creature'] };
const onNoncreatureSpell = (...effects: EffectDef[]): AbilityDef =>
  when({ on: 'castSpell', filter: 'noncreature' }, [], ...effects);
const anyPlayer: TargetSpec = { what: 'player' };
const opponent: TargetSpec = { what: 'player', controller: 'opponent' };
const upTo = (spec: TargetSpec): TargetSpec => ({ ...spec, optional: true });
const otter = (counters = 0): EffectDef => ({
  kind: 'createToken',
  token: 'otter-token',
  count: 1,
  ...(counters ? { counters } : {}),
});
const stun = (amount: number, to: Ref): EffectDef => ({
  kind: 'namedCounters',
  name: 'stun',
  amount,
  to,
});
const birdsFrogsOttersRats = yourCreaturesOf('Bird', 'Frog', 'Otter', 'Rat');

export const OTTERS_FROGS: Record<string, Behavior> = {
  // ------------------------------------------------------------------ Izzet Otters
  'Stormcatch Mentor': {
    abilities: [
      prowess,
      { kind: 'static', effect: { kind: 'instantsAndSorceriesCostLess', amount: 1 } },
    ],
  },
  'Kindlespark Duo': {
    abilities: [
      {
        kind: 'activated',
        cost: { tapSelf: true },
        targets: [opponent],
        effects: [{ kind: 'damage', amount: 1, to: t0 }],
      },
      onNoncreatureSpell({ kind: 'untap', what: 'self' }),
    ],
  },
  'Coruscation Mage': offspring(
    '{2}',
    onNoncreatureSpell({ kind: 'damage', amount: 1, to: 'eachOpponent' }),
  ),
  'Tempest Angler': {
    abilities: [onNoncreatureSpell({ kind: 'counters', to: 'self', amount: 1 })],
  },
  'Thundertrap Trainer': offspring(
    '{4}',
    onEnter({ kind: 'lookAndTake', count: 4, filter: { ...noncreature, nonland: true } }),
  ),
  'Harnesser of Storms': {
    abilities: [
      {
        kind: 'triggered',
        trigger: {
          on: 'castSpell',
          filter: 'any',
          spell: { anyOf: [noncreature, { subtype: 'Otter' }] },
        },
        optional: true,
        oncePerTurn: true,
        targets: [],
        effects: [{ kind: 'exileTopPlayable', count: 1, until: 'endOfTurn' }],
      },
    ],
  },
  'Valley Floodcaller': {
    abilities: [
      { kind: 'static', effect: { kind: 'flashForAll', filter: noncreature } },
      onNoncreatureSpell(pump(birdsFrogsOttersRats, 1, 1), {
        kind: 'untap',
        what: birdsFrogsOttersRats,
      }),
    ],
  },
  "Alania's Pathmaker": {
    abilities: [onEnter({ kind: 'exileTopPlayable', count: 1, until: 'endOfNextTurn' })],
  },
  'Eddymurk Crab': {
    costReduction: { count: 'cardsInGraveyard', types: ['Instant', 'Sorcery'] },
    entersTappedIf: { kind: 'opponentsTurn' },
    abilities: [
      when(
        { on: 'etb' },
        [upTo(creature), upTo(creature)],
        { kind: 'tap', what: t0 },
        { kind: 'tap', what: t1 },
      ),
    ],
  },
  'Pearl of Wisdom': {
    costReduction: { count: 'creaturesYouControl', subtype: 'Otter', max: 1 },
    spell: { targets: [], effects: [draw(2)] },
  },
  'Otterball Antics': {
    spell: { targets: [], effects: [otter()] },
    // "If this spell was cast from anywhere other than your hand, put a +1/+1 counter on that creature."
    flashbackSpell: { targets: [], effects: [otter(1)] },
    flashback: mana('{3}{U}'),
  },
  'Dazzling Denial': {
    spell: {
      targets: [{ what: 'spell' }],
      effects: [
        {
          kind: 'if',
          condition: youControl('Bird'),
          then: [{ kind: 'counterUnlessPays', what: t0, cost: mana('{4}') }],
          else: [{ kind: 'counterUnlessPays', what: t0, cost: mana('{2}') }],
        },
      ],
    },
  },
  'Shore Up': {
    spell: {
      targets: [yourCreature],
      effects: [pump(t0, 1, 1, ['hexproof']), { kind: 'untap', what: t0 }],
    },
  },
  "Sazacap's Brew": {
    discardToCast: true,
    ...gift(
      'fish',
      { targets: [anyPlayer], effects: [{ kind: 'draw', who: t0, amount: 2 }] },
      {
        targets: [anyPlayer, yourCreature],
        effects: [{ kind: 'draw', who: t0, amount: 2 }, pump(t1, 2, 0)],
      },
    ),
  },
  'Take Out the Trash': {
    spell: {
      targets: [creature],
      effects: [
        { kind: 'damage', amount: 3, to: t0 },
        {
          kind: 'if',
          condition: { kind: 'all', of: [youControl('Raccoon'), { kind: 'handSize', min: 1 }] },
          then: [{ kind: 'may', effects: [{ kind: 'discard', count: 1 }, draw(1)] }],
        },
      ],
    },
  },
  'Quaketusk Boar': {},
  'Calamitous Tide': {
    spell: {
      targets: [upTo(creature), upTo(creature)],
      effects: [
        { kind: 'bounce', what: t0 },
        { kind: 'bounce', what: t1 },
        draw(2),
        { kind: 'discard', count: 1 },
      ],
    },
  },

  // ------------------------------------------------------------------ Simic Frogs
  'Sunshower Druid': {
    abilities: [when({ on: 'etb' }, [creature], { kind: 'counters', to: t0, amount: 1 }, gain(1))],
  },
  'Mistbreath Elder': {
    abilities: [
      when({ on: 'beginningOfUpkeep', whose: 'yours' }, [], {
        kind: 'chooseYourPermanent',
        filter: { types: ['Creature'] },
        then: [
          { kind: 'bounce', what: 'chosen' },
          { kind: 'counters', to: 'self', amount: 1 },
        ],
        otherwise: [{ kind: 'may', effects: [{ kind: 'bounce', what: 'self' }] }],
      }),
    ],
  },
  'Valley Mightcaller': {
    abilities: [
      when(
        {
          on: 'otherCreatureEtb',
          controller: 'you',
          filter: { subtypes: ['Frog', 'Rabbit', 'Raccoon', 'Squirrel'] },
        },
        [],
        { kind: 'counters', to: 'self', amount: 1 },
      ),
    ],
  },
  'Bellowing Crier': { abilities: [onEnter(draw(1), { kind: 'discard', count: 1 })] },
  'Pond Prophet': { abilities: [onEnter(draw(1))] },
  'Three Tree Scribe': {
    abilities: [
      when({ on: 'leavesWithoutDying', who: 'selfOrOther' }, [yourCreature], {
        kind: 'counters',
        to: t0,
        amount: 1,
      }),
    ],
  },
  'Dour Port-Mage': {
    abilities: [
      {
        ...when({ on: 'leavesWithoutDying', who: 'other' }, [], draw(1)),
        batch: true,
      } as AbilityDef,
      {
        kind: 'activated',
        cost: { mana: mana('{1}{U}'), tapSelf: true },
        targets: [{ what: 'creature', controller: 'you', filter: { other: true } }],
        effects: [{ kind: 'bounce', what: t0 }],
      },
    ],
  },
  'Stickytongue Sentinel': {
    abilities: [
      when(
        { on: 'etb' },
        [upTo({ what: 'permanent', controller: 'you', filter: { other: true } })],
        { kind: 'bounce', what: t0 },
      ),
    ],
  },
  'Long River Lurker': {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'anthem',
          affects: 'otherCreaturesYouControl',
          filter: { subtype: 'Frog' },
          power: 0,
          toughness: 0,
          keywords: ['wardOne'],
        },
      },
      when(
        { on: 'etb' },
        [yourCreature],
        { kind: 'pump', to: t0, power: 0, toughness: 0, cantBeBlocked: true },
        { kind: 'blinkOnCombatDamage', what: t0 },
      ),
    ],
  },
  'Waterspout Warden': {
    abilities: [
      {
        ...when({ on: 'attacks' }, [], pump('self', 0, 0, ['flying'])),
        condition: { kind: 'controlsCreature', filter: { enteredThisTurn: true, other: true } },
      } as AbilityDef,
    ],
  },
  'Clement, the Worrywort': {
    abilities: [
      when(
        { on: 'selfOrCreatureEtb', filter: {} },
        [
          upTo({
            what: 'creature',
            controller: 'you',
            filter: { lesserManaValueThanSubject: true },
          }),
        ],
        { kind: 'bounce', what: t0 },
      ),
      {
        kind: 'static',
        effect: {
          kind: 'grantMana',
          filter: { subtype: 'Frog' },
          produces: ['G', 'U'],
          onlyForCreatures: true,
        },
      },
    ],
  },
  'Clifftop Lookout': {
    abilities: [
      onEnter({ kind: 'revealUntil', filter: { types: ['Land'] }, to: 'battlefieldTapped' }),
    ],
  },
  'Splash Lasher': offspring(
    '{1}{U}',
    when({ on: 'etb' }, [upTo(creature)], { kind: 'tap', what: t0 }, stun(1, t0)),
  ),
  'Lilysplash Mentor': {
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{1}{G}{U}') },
        sorcerySpeed: true,
        targets: [{ what: 'creature', controller: 'you', filter: { other: true } }],
        effects: [{ kind: 'blink', what: t0, counters: 1 }],
      },
    ],
  },
  'Dreamdew Entrancer': {
    abilities: [
      when({ on: 'etb' }, [upTo(creature)], { kind: 'tap', what: t0 }, stun(3, t0), {
        kind: 'if',
        condition: { kind: 'targetControlledByYou', target: 0 },
        then: [draw(2)],
      }),
    ],
  },
  'Splash Portal': {
    spell: {
      targets: [yourCreature],
      effects: [
        {
          kind: 'if',
          condition: {
            kind: 'targetMatches',
            target: 0,
            filter: { subtypes: ['Bird', 'Frog', 'Otter', 'Rat'] },
          },
          then: [draw(1)],
        },
        { kind: 'blink', what: t0 },
      ],
    },
  },
  Polliwallop: {
    costReduction: { count: 'creaturesYouControl', subtype: 'Frog' },
    spell: {
      targets: [yourCreature, theirCreature],
      effects: [
        { kind: 'damage', amount: { multiply: 2, amount: { powerOf: t0 } }, to: t1, from: t0 },
      ],
    },
  },
  'Galewind Moose': {},
  'Hivespine Wolverine': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        targets: [],
        effects: [],
        modes: [
          {
            label: '+1/+1 counter on your creature',
            targets: [yourCreature],
            effects: [{ kind: 'counters', to: t0, amount: 1 }],
          },
          {
            label: 'Fight a creature token',
            targets: [{ what: 'creature', filter: { token: true } }],
            effects: [{ kind: 'fight', a: 'self', b: t0 }],
          },
          {
            label: 'Destroy an artifact or enchantment',
            targets: [{ what: 'permanent', filter: { types: ['Artifact', 'Enchantment'] } }],
            effects: [{ kind: 'destroy', what: t0 }],
          },
        ],
      },
    ],
  },
  'High Stride': {
    spell: {
      targets: [creature],
      effects: [pump(t0, 1, 3, ['reach']), { kind: 'untap', what: t0 }],
    },
  },
  'Pawpatch Formation': {
    modes: [
      {
        label: 'Destroy a creature with flying',
        targets: [{ what: 'creature', filter: { hasKeyword: 'flying' } }],
        effects: [{ kind: 'destroy', what: t0 }],
      },
      {
        label: 'Destroy an enchantment',
        targets: [{ what: 'permanent', filter: { types: ['Enchantment'] } }],
        effects: [{ kind: 'destroy', what: t0 }],
      },
      { label: 'Draw a card and make a Food', targets: [], effects: [draw(1), food] },
    ],
  },
};
