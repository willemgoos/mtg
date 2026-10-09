import type {
  CardDefinition,
  CardFilter,
  EffectDef,
  Ref,
  SpellDef,
  TargetSpec,
} from '@mtg/engine';
import type { Behavior } from '../build.ts';
import { atYourCombat, atYourEndStep, mana, onEnter, pump, t0, t1, when } from '../blb/helpers.ts';
import { mode } from '../fin/helpers.ts';
import { blight, entersWithMinusCounters, VIVID, withRemovedCounters } from '../ecl-vocab.ts';
import { ECL_ELF } from './tokens.ts';

/**
 * Lorwyn Eclipsed (18b): gold cards of W/B, U/R, B/G, R/W, G/U and three or more colours. Printed characteristics come from Scryfall;
 * this file has the rules text. A transform card's back face is keyed by its own
 * name in ECL_MULTI_B_BACKS. See docs/lorwyn-eclipsed-plan.md.
 *
 * One-offs are `custom` handlers in packages/engine/src/ecl-multi-b-effects.ts.
 */

export const ECL_WORM = 'ecl-worm-token';

const custom = (handler: string, params?: Record<string, unknown>): EffectDef => ({
  kind: 'custom',
  handler,
  ...(params ? { params } : {}),
});

const elf: CardFilter = { subtype: 'Elf' };
const elfOrFaerie: CardFilter = { anyOf: [{ subtype: 'Elf' }, { subtype: 'Faerie' }] };
const yourElf: TargetSpec = { what: 'creature', controller: 'you', filter: elf };
const targetPlayer: TargetSpec = { what: 'player' };
const PERMANENT_TYPES = ['Creature', 'Artifact', 'Enchantment', 'Land', 'Planeswalker'] as const;

/**
 * "Choose two —" modes: every pair, in printed order. The targets of the mode after the other may be the same as the first mode's
 * (`modeStart`, rule 115.3). A mode whose last target is optional ("one or two target ...") comes last in the target list, so the
 * other mode's targets can follow a short list; the effects stay in printed order.
 */
function chooseTwo(modes: SpellDef[]): SpellDef[] {
  const out: SpellDef[] = [];
  const KEYS = /"(target|targetPlayer|controllerTarget|forControllerOf|ownerOf|controllerOf)":(\d+)/g;
  const shifted = (effects: EffectDef[], by: number): EffectDef[] =>
    effects.map(
      (e) =>
        JSON.parse(
          JSON.stringify(e).replace(KEYS, (_, k, n) => `"${k}":${Number(n) + by}`),
        ) as EffectDef,
    );
  const marked = (targets: TargetSpec[], start: number): TargetSpec[] =>
    start > 0 && targets.length > 0 ? targets.map((t) => ({ ...t, modeStart: start })) : targets;
  for (let i = 0; i < modes.length; i++)
    for (let j = i + 1; j < modes.length; j++) {
      const a = modes[i]!;
      const b = modes[j]!;
      const optionalLast = a.targets.some((t) => t.optional) && b.targets.length > 0;
      const offA = optionalLast ? b.targets.length : 0;
      const offB = optionalLast ? 0 : a.targets.length;
      out.push({
        label: `${a.label} + ${b.label}`,
        targets: optionalLast
          ? [...b.targets, ...marked(a.targets, b.targets.length)]
          : [...a.targets, ...marked(b.targets, a.targets.length)],
        effects: [...shifted(a.effects, offA), ...shifted(b.effects, offB)],
      });
    }
  return out;
}

const mayLoot: EffectDef = {
  kind: 'may',
  effects: [
    {
      kind: 'if',
      condition: { kind: 'handSize', min: 1 },
      then: [
        { kind: 'discard', count: 1 },
        { kind: 'draw', who: 'controller', amount: 1 },
      ],
    },
  ],
};

/** "When this creature enters, look at the top four cards of your library. You may reveal a <types> card from among them ..." */
const lookFour = (filter: CardFilter): Behavior => ({
  abilities: [onEnter({ kind: 'lookAndTake', count: 4, filter })],
});

const copyToken = (what: Ref): EffectDef => ({ kind: 'tokenCopy', of: what });

export const ECL_MULTI_B: Record<string, Behavior> = {
  // "When Abigale enters, up to one other target creature loses all abilities. Put a flying counter, a first strike counter,
  // and a lifelink counter on that creature."
  'Abigale, Eloquent First-Year': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        targets: [{ what: 'creature', optional: true, filter: { other: true } }],
        effects: [
          { kind: 'loseAbilities', what: t0, permanent: true },
          { kind: 'namedCounters', name: 'flying', amount: 1, to: t0 },
          { kind: 'namedCounters', name: 'firstStrike', amount: 1, to: t0 },
          { kind: 'namedCounters', name: 'lifelink', amount: 1, to: t0 },
        ],
      },
    ],
  },

  "Ashling's Command": {
    modes: chooseTwo([
      mode(
        "Create a token that's a copy of target Elemental you control",
        [{ what: 'creature', controller: 'you', filter: { subtype: 'Elemental' } }],
        copyToken(t0),
      ),
      mode('Target player draws two cards', [targetPlayer], {
        kind: 'draw',
        who: t0,
        amount: 2,
      }),
      mode('2 damage to each creature target player controls', [targetPlayer], {
        kind: 'damage',
        amount: 2,
        to: { each: 'creature', targetPlayer: 0 },
      }),
      mode('Target player creates two Treasure tokens', [targetPlayer], {
        kind: 'createToken',
        token: 'treasure-token',
        count: 2,
        forControllerOf: 0,
      }),
    ]),
  },

  'Bre of Clan Stoutarm': {
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{1}{W}'), tapSelf: true },
        targets: [{ what: 'creature', controller: 'you', filter: { other: true } }],
        effects: [pump(t0, 0, 0, ['flying', 'lifelink'])],
      },
      atYourEndStep(
        { kind: 'lifeThisTurn', who: 'you', gained: true },
        [],
        custom('breEndStep'),
      ),
    ],
  },

  'Chitinous Graspling': {},

  'Doran, Besieged by Time': {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'spellsCostLess',
          filter: { types: ['Creature'], toughnessGreaterThanPower: true },
          amount: 1,
        },
      },
      when({ on: 'creatureYouControlAttacks' }, [], custom('doranPump')),
      when({ on: 'creatureYouControlBlocks' }, [], custom('doranPump')),
    ],
  },

  'Eclipsed Elf': lookFour({
    anyOf: [{ subtype: 'Elf' }, { subtype: 'Swamp' }, { subtype: 'Forest' }],
  }),

  'Eclipsed Flamekin': lookFour({
    anyOf: [{ subtype: 'Elemental' }, { subtype: 'Island' }, { subtype: 'Mountain' }],
  }),

  'Feisty Spikeling': {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'while',
          condition: { kind: 'yourTurn' },
          power: 0,
          toughness: 0,
          keywords: ['firstStrike'],
        },
      },
    ],
  },

  'Flaring Cinder': {
    abilities: [
      onEnter(mayLoot),
      when({ on: 'castSpell', filter: 'any', spell: { minManaValue: 4 } }, [], mayLoot),
    ],
  },

  'Glister Bairn': {
    abilities: [
      atYourCombat(
        [{ what: 'creature', controller: 'you', filter: { other: true } }],
        pump(t0, VIVID, VIVID),
      ),
    ],
  },

  'High Perfect Morcant': {
    abilities: [
      when({ on: 'selfOrCreatureEtb', filter: elf }, [], blight(1, { who: 'eachOpponent' })),
      {
        kind: 'activated',
        cost: { tapUntapped: { count: 3, filter: elf } },
        sorcerySpeed: true,
        targets: [],
        effects: [{ kind: 'proliferate' }],
      },
    ],
  },

  'Hovel Hurler': {
    ...entersWithMinusCounters(2),
    abilities: [
      {
        kind: 'activated',
        cost: withRemovedCounters(1, { mana: mana('{R/W}{R/W}') }),
        sorcerySpeed: true,
        targets: [{ what: 'creature', controller: 'you', filter: { other: true } }],
        effects: [pump(t0, 1, 0, ['flying'])],
      },
    ],
  },

  'Kirol, Attentive First-Year': {
    abilities: [
      {
        kind: 'activated',
        cost: { tapUntapped: { count: 2, filter: {} } },
        oncePerTurn: true,
        targets: [{ what: 'spell', controller: 'you', abilitiesOnly: true, triggeredOnly: true }],
        effects: [{ kind: 'custom', handler: 'copyTargetStackAbility' }, { kind: 'chooseNewTargets' }],
        label: 'Copy a triggered ability',
      },
    ],
  },

  'Lluwen, Imperfect Naturalist': {
    abilities: [
      onEnter(custom('lluwenMill')),
      {
        kind: 'activated',
        cost: {
          mana: mana('{2}{B/G}{B/G}{B/G}'),
          tapSelf: true,
          discard: true,
          discardFilter: { types: ['Land'] },
        },
        targets: [],
        effects: [
          {
            kind: 'createToken',
            token: ECL_WORM,
            count: { count: 'cardsInGraveyard', types: ['Land'] },
          },
        ],
      },
    ],
  },

  'Maralen, Fae Ascendant': {
    abilities: [
      when(
        { on: 'selfOrCreatureEtb', filter: elfOrFaerie },
        [{ what: 'player', controller: 'opponent' }],
        custom('maralenExile'),
      ),
      {
        kind: 'static',
        effect: {
          kind: 'castFreeFromThisTurnsExile',
          maxManaValue: { count: 'permanentsYouControl', filter: elfOrFaerie },
        },
      },
    ],
  },

  "Morcant's Loyalist": {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'anthem',
          affects: 'otherCreaturesYouControl',
          filter: elf,
          power: 1,
          toughness: 1,
        },
      },
      when(
        { on: 'dies' },
        [{ what: 'graveyardCard', controller: 'you', filter: { subtype: 'Elf', other: true } }],
        { kind: 'returnToHand', what: t0 },
      ),
    ],
  },

  'Prideful Feastling': {},

  'Reaping Willow': {
    ...entersWithMinusCounters(2),
    abilities: [
      {
        kind: 'activated',
        cost: withRemovedCounters(2, { mana: mana('{1}{W/B}') }),
        sorcerySpeed: true,
        targets: [
          {
            what: 'graveyardCard',
            controller: 'you',
            filter: { types: ['Creature'], maxManaValue: 3 },
          },
        ],
        effects: [{ kind: 'returnToBattlefield', what: t0 }],
      },
    ],
  },

  'Sanar, Innovative First-Year': {
    abilities: [when({ on: 'beginningOfMain', which: 1 }, [], custom('sanarReveal'))],
  },

  'Stoic Grove-Guide': {
    abilities: [
      {
        kind: 'activated',
        fromGraveyard: true,
        cost: { mana: mana('{1}{B/G}'), exileSelf: true },
        sorcerySpeed: true,
        targets: [],
        effects: [{ kind: 'createToken', token: ECL_ELF, count: 1 }],
      },
    ],
  },

  'Tam, Mindful First-Year': {
    abilities: [
      { kind: 'static', effect: { kind: 'hexproofFromOwnColors' } },
      {
        kind: 'activated',
        cost: { tapSelf: true },
        targets: [{ what: 'creature', controller: 'you' }],
        effects: [custom('tamAllColors')],
      },
    ],
  },

  "Trystan's Command": {
    modes: chooseTwo([
      mode(
        "Create a token that's a copy of target Elf you control",
        [yourElf],
        copyToken(t0),
      ),
      mode(
        'Return one or two target permanent cards from your graveyard to your hand',
        [
          {
            what: 'graveyardCard',
            controller: 'you',
            filter: { types: [...PERMANENT_TYPES] },
          },
          {
            what: 'graveyardCard',
            controller: 'you',
            filter: { types: [...PERMANENT_TYPES] },
            optional: true,
          },
        ],
        { kind: 'returnToHand', what: t0 },
        { kind: 'returnToHand', what: t1 },
      ),
      mode(
        'Destroy target creature or enchantment',
        [{ what: 'permanent', filter: { types: ['Creature', 'Enchantment'] } }],
        { kind: 'destroy', what: t0 },
      ),
      mode(
        'Creatures target player controls get +3/+3 until end of turn. Untap them',
        [targetPlayer],
        pump({ each: 'creature', targetPlayer: 0 }, 3, 3),
        { kind: 'untap', what: { each: 'creature', targetPlayer: 0 } },
      ),
    ]),
  },

  'Twinflame Travelers': {
    abilities: [{ kind: 'static', effect: { kind: 'elementalTriggersTwice' } }],
  },
};

/** Back faces: the transformed sides of two-faced cards, keyed by their own names. */
export const ECL_MULTI_B_BACKS: Record<string, Behavior> = {};

/** Tokens only this group's cards make. */
export const ECL_MULTI_B_TOKENS: CardDefinition[] = [
  // A 1/1 black and green Worm creature token.
  {
    id: ECL_WORM,
    name: 'Worm',
    manaCost: { generic: 0, colored: {} },
    colors: ['B', 'G'],
    types: ['Creature'],
    supertypes: [],
    subtypes: ['Worm'],
    power: 1,
    toughness: 1,
    keywords: [],
    abilities: [],
    isToken: true,
  },
];
