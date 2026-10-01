import type { AbilityDef, EffectDef, TargetSpec } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import {
  anyColor,
  atYourEndStep,
  classCard,
  creature,
  draw,
  gain,
  gift,
  mana,
  offspring,
  onEnter,
  pump,
  t0,
  t1,
  theirCreature,
  when,
  yourCreature,
  yourCreaturesOf,
} from './helpers.ts';

// Azorius Birds (flyers lifting the rest) and Gruul Raccoons (expend).

const yourGrounded: TargetSpec = {
  what: 'creature',
  controller: 'you',
  filter: { lacksKeyword: 'flying' },
};
const upTo = (spec: TargetSpec): TargetSpec => ({ ...spec, optional: true });
const fish: EffectDef = { kind: 'createToken', token: 'fish-token', count: 1 };
const expend = (amount: number, ...effects: EffectDef[]): AbilityDef =>
  when({ on: 'expend', amount }, [], ...effects);
const expendTargeting = (targets: TargetSpec[], ...effects: EffectDef[]): AbilityDef =>
  when({ on: 'expend', amount: 4 }, targets, ...effects);
const tapFor = (...colors: ('R' | 'G')[]): AbilityDef[] =>
  colors.map((produces) => ({ kind: 'mana', cost: { tapSelf: true }, produces }));

export const BIRDS_RACCOONS: Record<string, Behavior> = {
  // ------------------------------------------------------------------ Azorius Birds
  'Plumecreed Escort': {
    abilities: [when({ on: 'etb' }, [yourCreature], pump(t0, 0, 0, ['hexproof']))],
  },
  'Finch Formation': offspring(
    '{3}',
    when({ on: 'etb' }, [yourCreature], pump(t0, 0, 0, ['flying'])),
  ),
  'Shrike Force': {},
  'Jackdaw Savior': {
    abilities: [
      when(
        { on: 'creatureYouControlDies', filter: { hasKeyword: 'flying' } },
        [
          {
            what: 'graveyardCard',
            controller: 'you',
            filter: { types: ['Creature'], lesserManaValueThanSubject: true },
          },
        ],
        { kind: 'returnToBattlefield', what: t0 },
      ),
    ],
  },
  'Plumecreed Mentor': {
    abilities: [
      when({ on: 'selfOrCreatureEtb', filter: { hasKeyword: 'flying' } }, [yourGrounded], {
        kind: 'counters',
        to: t0,
        amount: 1,
      }),
    ],
  },
  'Seedpod Squire': {
    abilities: [when({ on: 'attacks' }, [yourGrounded], pump(t0, 1, 1))],
  },
  'Salvation Swan': {
    abilities: [
      when({ on: 'selfOrCreatureEtb', filter: { subtype: 'Bird' } }, [upTo(yourGrounded)], {
        kind: 'exileUntilEndStep',
        what: t0,
        named: 'flying',
      }),
    ],
  },
  'Pileated Provisioner': {
    abilities: [when({ on: 'etb' }, [yourGrounded], { kind: 'counters', to: t0, amount: 1 })],
  },
  'Skyskipper Duo': {
    abilities: [
      when(
        { on: 'etb' },
        [upTo({ what: 'creature', controller: 'you', filter: { other: true } })],
        { kind: 'exileUntilEndStep', what: t0 },
      ),
    ],
  },
  Knightfisher: {
    abilities: [
      when(
        { on: 'otherCreatureEtb', controller: 'you', filter: { subtype: 'Bird', nontoken: true } },
        [],
        fish,
      ),
    ],
  },
  'Kastral, the Windcrested': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'creaturesYouControlDealCombatDamageToPlayer', filter: { subtype: 'Bird' } },
        batch: true,
        targets: [],
        effects: [],
        modes: [
          {
            label: 'Put a Bird from your hand or graveyard onto the battlefield',
            targets: [],
            effects: [
              {
                kind: 'putFromHandOrGraveyard',
                filter: { types: ['Creature'], subtype: 'Bird' },
                counter: 'finality',
              },
            ],
          },
          {
            label: '+1/+1 counter on each Bird',
            targets: [],
            effects: [{ kind: 'counters', to: yourCreaturesOf('Bird'), amount: 1 }],
          },
          { label: 'Draw a card', targets: [], effects: [draw(1)] },
        ],
      },
    ],
  },
  'Feather of Flight': {
    enchant: creature,
    abilities: [
      onEnter(draw(1)),
      {
        kind: 'static',
        effect: { kind: 'attached', power: 1, toughness: 0, keywords: ['flying'] },
      },
    ],
  },
  'Parting Gust': gift(
    'fish',
    {
      targets: [{ what: 'creature', filter: { nontoken: true } }],
      effects: [{ kind: 'exileUntilEndStep', what: t0, counters: 1 }],
    },
    {
      targets: [{ what: 'creature', filter: { nontoken: true } }],
      effects: [{ kind: 'exile', what: t0 }],
    },
  ),
  'Driftgloom Coyote': {
    abilities: [
      when(
        { on: 'etb' },
        [theirCreature],
        {
          kind: 'if',
          condition: { kind: 'targetMatches', target: 0, filter: { maxPower: 2 } },
          then: [{ kind: 'counters', to: 'self', amount: 1 }],
        },
        { kind: 'exileUntilSourceLeaves', what: t0 },
      ),
    ],
  },

  // ------------------------------------------------------------------ Gruul Raccoons
  'Three Tree Rootweaver': { abilities: anyColor() },
  'Bark-Knuckle Boxer': { abilities: [expend(4, pump('self', 0, 0, ['indestructible']))] },
  'Wandertale Mentor': {
    abilities: [expend(4, { kind: 'counters', to: 'self', amount: 1 }), ...tapFor('R', 'G')],
  },
  'Brazen Collector': {
    abilities: [
      when({ on: 'attacks' }, [], { kind: 'addMana', mana: [['R']], untilEndOfTurn: true }),
    ],
  },
  'Raccoon Rallier': {
    abilities: [
      {
        kind: 'activated',
        cost: { tapSelf: true },
        sorcerySpeed: true,
        targets: [yourCreature],
        effects: [pump(t0, 0, 0, ['haste'])],
      },
    ],
  },
  'Brambleguard Veteran': {
    abilities: [expend(4, pump(yourCreaturesOf('Raccoon'), 1, 1, ['vigilance']))],
  },
  'Roughshod Duo': {
    abilities: [expendTargeting([yourCreature], pump(t0, 1, 1, ['trample']))],
  },
  'Byway Barterer': {
    abilities: [{ ...expend(4, { kind: 'discardHand' }, draw(2)), optional: true } as AbilityDef],
  },
  'Muerra, Trash Tactician': {
    abilities: [
      when({ on: 'beginningOfMain', which: 1 }, [], {
        kind: 'addMana',
        mana: [['R', 'G']],
        count: { count: 'creaturesYouControl', subtype: 'Raccoon' },
      }),
      expend(4, gain(3)),
      expend(8, { kind: 'exileTopPlayable', count: 2, until: 'endOfNextTurn' }),
    ],
  },
  'Rust-Shield Rampager': offspring('{2}', {
    kind: 'static',
    effect: { kind: 'cantBeBlockedBy', filter: { maxPower: 2 } },
  }),
  'Teapot Slinger': {
    abilities: [expend(4, { kind: 'damage', amount: 2, to: 'eachOpponent' })],
  },
  'Junkblade Bruiser': { abilities: [expend(4, pump('self', 2, 1))] },
  Overprotect: {
    spell: {
      targets: [yourCreature],
      effects: [pump(t0, 3, 3, ['trample', 'hexproof', 'indestructible'])],
    },
  },
  "Hunter's Talent": classCard(
    [
      when({ on: 'etb' }, [yourCreature, theirCreature], {
        kind: 'damage',
        amount: { powerOf: t0 },
        to: t1,
        from: t0,
      }),
    ],
    {
      cost: '{1}{G}',
      abilities: [
        when(
          { on: 'youAttack' },
          [{ what: 'creature', controller: 'you', filter: { attacking: true } }],
          pump(t0, 1, 0, ['trample']),
        ),
      ],
    },
    {
      cost: '{3}{G}',
      abilities: [
        atYourEndStep({ kind: 'controlsCreature', filter: { minPower: 4 } }, [], draw(1)),
      ],
    },
  ),
  "Hoarder's Overflow": {
    abilities: [
      onEnter({ kind: 'namedCounters', name: 'stash', amount: 1 }),
      expend(4, { kind: 'namedCounters', name: 'stash', amount: 1 }),
      {
        kind: 'activated',
        cost: { mana: mana('{1}{R}'), sacrificeSelf: true },
        targets: [],
        effects: [
          { kind: 'discardHand' },
          { kind: 'draw', who: 'controller', amount: { namedCountersOnSource: 'stash' } },
        ],
      },
    ],
  },
  'Heaped Harvest': {
    abilities: [
      onEnter({
        kind: 'may',
        effects: [{ kind: 'searchLibrary', filter: 'basicLand', to: 'battlefieldTapped' }],
      }),
      when({ on: 'sacrificed' }, [], {
        kind: 'may',
        effects: [{ kind: 'searchLibrary', filter: 'basicLand', to: 'battlefieldTapped' }],
      }),
      {
        kind: 'activated',
        cost: { mana: mana('{2}'), tapSelf: true, sacrificeSelf: true },
        targets: [],
        effects: [gain(3)],
      },
    ],
  },
  'Tender Wildguide': offspring('{2}', ...anyColor(), {
    kind: 'activated',
    cost: { tapSelf: true },
    targets: [],
    effects: [{ kind: 'counters', to: 'self', amount: 1 }],
  }),
};
