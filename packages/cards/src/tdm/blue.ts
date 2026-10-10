import type { AbilityDef, CardDefinition, EffectDef, Ref, TargetSpec } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import { draw, mana, onEnter, pump, t0, theirCreature, when } from '../blb/helpers.ts';
import { mode } from '../fin/helpers.ts';
import {
  dragonWasBeheld,
  devoteeMana,
  DRAGON,
  flurry,
  harmonize,
  mayBeholdDragon,
  renew,
  returnWhenDragonEnters,
} from '../tdm-vocab.ts';
import { TDM_BIRD, TDM_ZOMBIE_DRUID } from './tokens.ts';

/**
 * Tarkir: Dragonstorm (19b): blue cards. Printed characteristics come from Scryfall;
 * this file has the rules text. An Omen card's spell side is keyed by its own
 * name in TDM_BLUE_BACKS. See docs/tarkir-dragonstorm-plan.md.
 */

const stunCounter = (to: Ref): EffectDef => ({
  kind: 'namedCounters',
  name: 'stun',
  amount: 1,
  to,
});
const tapAndStun = (to: Ref): EffectDef[] => [{ kind: 'tap', what: to }, stunCounter(to)];
const upToOne = (t: TargetSpec): TargetSpec => ({ ...t, optional: true });
const creature: TargetSpec = { what: 'creature' };
const yourCreature: TargetSpec = { what: 'creature', controller: 'you' };
const NOTHING = { generic: 0, colored: {} };
const loot = (n: number): EffectDef[] => [draw(n), { kind: 'discard', count: 1 }];

/** An Aura: it enchants a creature (`enchant`), and these abilities. */
const aura = (enchant: TargetSpec, ...abilities: AbilityDef[]): Behavior => ({
  enchant,
  abilities,
});

/** "You may exile <count> card(s) from your graveyard. If you do / When you do, <then>." */
const mayExile = (
  count: number,
  title: string,
  then: EffectDef[],
  filter?: Record<string, unknown>,
): EffectDef => ({
  kind: 'chooseCustom',
  handler: 'tdmExileFromGraveyard',
  params: { count, title, then, ...(filter ? { filter } : {}) },
});

export const TDM_BLUE: Record<string, Behavior> = {
  'Aegis Sculptor': {
    abilities: [
      when(
        { on: 'beginningOfUpkeep', whose: 'yours' },
        [],
        mayExile(2, 'Aegis Sculptor: exile two cards from your graveyard?', [
          { kind: 'counters', to: 'self', amount: 1 },
        ]),
      ),
    ],
  },
  'Agent of Kotis': {
    abilities: [renew(mana('{3}{U}'), [creature], [{ kind: 'counters', to: t0, amount: 2 }])],
  },
  'Ambling Stormshell': {
    abilities: [
      when(
        { on: 'attacks' },
        [],
        { kind: 'namedCounters', name: 'stun', amount: 3, to: 'self' },
        draw(3),
      ),
      when({ on: 'castSpell', filter: 'any', spell: { subtype: 'Turtle' } }, [], {
        kind: 'untap',
        what: 'self',
      }),
    ],
  },
  'Bewildering Blizzard': {
    spell: {
      targets: [],
      effects: [draw(3), pump({ each: 'creature', controller: 'opponent' }, -3, 0)],
    },
  },
  'Constrictor Sage': {
    abilities: [
      when({ on: 'etb' }, [theirCreature], ...tapAndStun(t0)),
      renew(mana('{2}{U}'), [theirCreature], tapAndStun(t0)),
    ],
  },
  'Dirgur Island Dragon': {},
  'Dispelling Exhale': {
    ...mayBeholdDragon(),
    spell: {
      targets: [{ what: 'spell' }],
      effects: [
        {
          kind: 'if',
          condition: dragonWasBeheld,
          then: [{ kind: 'counterUnlessPays', what: t0, cost: mana('{4}') }],
          else: [{ kind: 'counterUnlessPays', what: t0, cost: mana('{2}') }],
        },
      ],
    },
  },
  Dragonologist: {
    abilities: [
      onEnter({
        kind: 'lookAndTake',
        count: 6,
        filter: { anyOf: [{ types: ['Instant'] }, { types: ['Sorcery'] }, DRAGON] },
      }),
      // "Untapped Dragons you control have hexproof."
      {
        kind: 'static',
        effect: {
          kind: 'anthem',
          affects: 'creaturesYouControl',
          filter: { subtype: 'Dragon', tapped: false },
          power: 0,
          toughness: 0,
          keywords: ['hexproof'],
        },
      },
    ],
  },
  'Dragonstorm Forecaster': {
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{2}'), tapSelf: true },
        targets: [],
        effects: [
          {
            kind: 'searchLibrary',
            filter: { anyOf: [{ named: 'dragonstorm-globe' }, { named: 'boulderborn-dragon' }] },
            to: 'hand',
            reveal: true,
          },
        ],
      },
    ],
  },
  'Essence Anchor': {
    abilities: [
      when({ on: 'beginningOfUpkeep', whose: 'yours' }, [], { kind: 'surveil', amount: 1 }),
      {
        kind: 'activated',
        cost: { tapSelf: true },
        condition: { kind: 'all', of: [{ kind: 'yourTurn' }, { kind: 'cardsLeftGraveyardThisTurn' }] },
        targets: [],
        effects: [{ kind: 'createToken', token: TDM_ZOMBIE_DRUID, count: 1 }],
      },
    ],
  },
  'Focus the Mind': {
    costReductionIf: { condition: { kind: 'spellsCastThisTurn', min: 1 }, amount: 2 },
    spell: { targets: [], effects: loot(3) },
  },
  'Fresh Start': aura(creature, {
    kind: 'static',
    effect: { kind: 'attached', power: -5, toughness: 0, loseAbilities: true },
  }),
  'Highspire Bell-Ringer': {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'spellsCostLessIf',
          filter: {},
          condition: { kind: 'spellsCastThisTurn', min: 1, max: 1 },
          amount: 1,
        },
      },
    ],
  },
  'Humbling Elder': {
    abilities: [when({ on: 'etb' }, [theirCreature], pump(t0, -2, 0))],
  },
  'Iceridge Serpent': {
    abilities: [when({ on: 'etb' }, [theirCreature], { kind: 'bounce', what: t0 })],
  },
  'Kishla Trawlers': {
    abilities: [
      // "When this creature enters, you may exile a creature card from your graveyard. When you do, return target instant or
      // sorcery card from your graveyard to your hand." (ability 1 is the reflexive trigger)
      onEnter(
        mayExile(
          1,
          'Kishla Trawlers: exile a creature card from your graveyard?',
          [{ kind: 'reflexiveTrigger', ability: 1 }],
          { types: ['Creature'] },
        ),
      ),
      when(
        { on: 'reflexive' },
        [{ what: 'graveyardCard', controller: 'you', filter: { types: ['Instant', 'Sorcery'] } }],
        { kind: 'returnToHand', what: t0 },
      ),
    ],
  },
  'Marang River Regent': {
    abilities: [
      when(
        { on: 'etb' },
        [
          {
            what: 'permanent',
            filter: { nonland: true, other: true },
            anyNumber: true,
            maxTargets: 2,
          },
        ],
        { kind: 'bounce', what: { targetsFrom: 0 } },
      ),
    ],
  },
  'Naga Fleshcrafter': {
    entersAsCopy: { anyManaValue: true },
    abilities: [
      renew(
        mana('{2}{U}'),
        [{ what: 'creature', controller: 'you', filter: { nonlegendary: true } }],
        [
          { kind: 'counters', to: t0, amount: 1 },
          {
            kind: 'becomeCopy',
            what: { each: 'creature', controller: 'you' },
            of: t0,
            each: true,
          },
        ],
      ),
    ],
  },
  'Ringing Strike Mastery': aura(
    creature,
    onEnter({ kind: 'tap', what: 'attached' }),
    {
      kind: 'static',
      effect: {
        kind: 'attached',
        power: 0,
        toughness: 0,
        doesntUntap: true,
        grantAbilities: [
          {
            kind: 'activated',
            cost: { mana: mana('{5}') },
            targets: [],
            effects: [{ kind: 'untap', what: 'self' }],
          },
        ],
      },
    },
  ),
  'Riverwalk Technique': {
    modes: [
      mode(
        'The owner of target nonland permanent puts it on their choice of the top or bottom of their library',
        [{ what: 'permanent', filter: { nonland: true } }],
        { kind: 'chooseCustom', handler: 'eclLibraryChoice' },
      ),
      mode(
        'Counter target noncreature spell',
        [{ what: 'spell', filter: { notTypes: ['Creature'] } }],
        { kind: 'counter', what: t0 },
      ),
    ],
  },
  'Roiling Dragonstorm': {
    abilities: [onEnter(...loot(2)), returnWhenDragonEnters],
  },
  'Sibsig Appraiser': {
    abilities: [onEnter({ kind: 'lookTakeRestGraveyard', count: 2, take: 1 })],
  },
  'Snowmelt Stag': {
    abilities: [
      // "During your turn, this creature has base power and toughness 5/2."
      {
        kind: 'static',
        effect: {
          kind: 'while',
          condition: { kind: 'yourTurn' },
          power: 0,
          toughness: 0,
          basePT: [5, 2],
        },
      },
      {
        kind: 'activated',
        cost: { mana: mana('{5}{U}{U}') },
        targets: [],
        effects: [{ kind: 'pump', to: 'self', power: 0, toughness: 0, cantBeBlocked: true }],
      },
    ],
  },
  'Spectral Denial': {
    // "This spell costs {1} less to cast for each creature you control with power 4 or greater."
    costReduction: {
      count: 'permanentsYouControl',
      filter: { types: ['Creature'], minPower: 4 },
    },
    spell: {
      targets: [{ what: 'spell' }],
      effects: [{ kind: 'counterUnlessPays', what: t0, cost: NOTHING, xCost: true }],
    },
  },
  'Stillness in Motion': {
    abilities: [
      when({ on: 'beginningOfUpkeep', whose: 'yours' }, [], { kind: 'mill', count: 3 }, {
        kind: 'chooseCustom',
        handler: 'tdmStillness',
      }),
    ],
  },
  'Taigam, Master Opportunist': {
    abilities: [
      flurry([
        { kind: 'copySpell', what: 'subject' },
        { kind: 'suspend', what: 'subject', time: 4 },
      ]),
    ],
  },
  'Temur Devotee': { abilities: [devoteeMana(['G', 'U', 'R'])] },
  'Unending Whisper': {
    ...harmonize(mana('{5}{U}')),
    spell: { targets: [], effects: [draw(1)] },
  },
  "Ureni's Rebuff": {
    ...harmonize(mana('{5}{U}')),
    spell: { targets: [creature], effects: [{ kind: 'bounce', what: t0 }] },
  },
  'Veteran Ice Climber': {
    abilities: [
      { kind: 'static', effect: { kind: 'cantBeBlocked' } },
      when({ on: 'attacks' }, [upToOne({ what: 'player' })], {
        kind: 'mill',
        count: { powerOf: 'self' },
        who: t0,
      }),
    ],
  },
  'Whirlwing Stormbrood': {
    abilities: [
      // "You may cast sorcery spells and Dragon spells as though they had flash."
      {
        kind: 'static',
        effect: { kind: 'flashForAll', filter: { anyOf: [{ types: ['Sorcery'] }, DRAGON] } },
      },
    ],
  },
  'Wingblade Disciple': {
    abilities: [flurry([{ kind: 'createToken', token: TDM_BIRD, count: 1 }])],
  },
  'Wingspan Stride': aura(
    creature,
    { kind: 'static', effect: { kind: 'attached', power: 1, toughness: 1, keywords: ['flying'] } },
    {
      kind: 'activated',
      cost: { mana: mana('{2}{U}') },
      targets: [],
      effects: [{ kind: 'bounce', what: 'self' }],
    },
  ),
  'Winternight Stories': {
    ...harmonize(mana('{4}{U}')),
    spell: {
      targets: [],
      effects: [
        draw(3),
        // "Then discard two cards unless you discard a creature card."
        {
          kind: 'if',
          condition: { kind: 'handHas', filter: { types: ['Creature'] } },
          then: [{ kind: 'chooseCustom', handler: 'eclDiscardCreatureOrTwo' }],
          else: [{ kind: 'discard', count: 2 }],
        },
      ],
    },
  },
};

/** Back faces: the Omen spell sides of Omen creatures, keyed by their own names. */
export const TDM_BLUE_BACKS: Record<string, Behavior> = {
  'Skimming Strike': {
    spell: {
      targets: [upToOne(creature)],
      effects: [{ kind: 'tap', what: t0 }, draw(1)],
    },
  },
  'Coil and Catch': { spell: { targets: [], effects: loot(3) } },
  'Dynamic Soar': {
    spell: { targets: [yourCreature], effects: [{ kind: 'counters', to: t0, amount: 3 }] },
  },
};

/** Tokens only this group's cards make. */
export const TDM_BLUE_TOKENS: CardDefinition[] = [];
