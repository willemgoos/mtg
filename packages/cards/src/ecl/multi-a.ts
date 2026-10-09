import type { AbilityDef, CardDefinition, EffectDef, SpellDef, TargetSpec } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import { atYourEndStep, mana, onEnter, pump, t0, t1, when } from '../blb/helpers.ts';
import { blight } from '../ecl-vocab.ts';
import { ECL_KITHKIN, ECL_MERFOLK } from './tokens.ts';

/**
 * Lorwyn Eclipsed (18b): gold cards of W/U, U/B, B/R, R/G and G/W. Printed characteristics come from Scryfall;
 * this file has the rules text. A transform card's back face is keyed by its own
 * name in ECL_MULTI_A_BACKS. See docs/lorwyn-eclipsed-plan.md.
 */

const treasure: EffectDef = { kind: 'createToken', token: 'treasure-token', count: 1 };
const player: TargetSpec = { what: 'player' };
const yourCreature: TargetSpec = { what: 'creature', controller: 'you' };
const yourOfType = (subtype: string): TargetSpec => ({
  what: 'creature',
  controller: 'you',
  filter: { subtype },
});
const custom = (handler: string, params?: Record<string, unknown>): EffectDef => ({
  kind: 'custom',
  handler,
  ...(params ? { params } : {}),
});
const mode = (label: string, targets: TargetSpec[], ...effects: EffectDef[]): SpellDef => ({
  label,
  targets,
  effects,
});

/** The "look at the top four ... reveal a <type>, <land> or <land> card" Eclipsed creatures. */
const eclipsed = (a: string, b: string, c: string): Behavior => ({
  abilities: [
    onEnter({
      kind: 'lookAndTake',
      count: 4,
      filter: { anyOf: [{ subtype: a }, { subtype: b }, { subtype: c }] },
    }),
  ],
});

/**
 * The "Choose two" Commands: every pair of modes in printed order, with each mode's target numbers moved past the targets of
 * the modes before it (this includes the numbers in `forControllerOf`, `controllerTarget` and `targetIndex`).
 */
const chooseTwo = (modes: SpellDef[]): SpellDef[] => {
  const out: SpellDef[] = [];
  for (let i = 0; i < modes.length; i++)
    for (let j = i + 1; j < modes.length; j++) {
      const picked = [modes[i]!, modes[j]!];
      const targets: TargetSpec[] = [];
      const effects: EffectDef[] = [];
      for (const [k, m] of picked.entries()) {
        const shift = targets.length;
        // Each mode's targets are their own instances of "target": they may be the same object as another mode's.
        targets.push(...m.targets.map((t) => ({ ...t, ofMode: k })));
        effects.push(
          ...m.effects.map(
            (e) =>
              JSON.parse(
                JSON.stringify(e).replace(
                  /"(target|forControllerOf|controllerTarget|targetIndex)":(\d+)/g,
                  (_, k: string, n: string) => `"${k}":${Number(n) + shift}`,
                ),
              ) as EffectDef,
          ),
        );
      }
      out.push({ label: picked.map((m) => m.label).join(' + '), targets, effects });
    }
  return out;
};

/** Figure of Fable's three level-up abilities. */
const fableLevel = (
  cost: string,
  params: {
    requires?: string;
    subtypes: string[];
    power: number;
    toughness: number;
    protection?: boolean;
  },
  label: string,
): AbilityDef => ({
  kind: 'activated',
  cost: { mana: mana(cost) },
  targets: [],
  effects: [custom('figureOfFable', params)],
  label,
});

export const ECL_MULTI_A: Record<string, Behavior> = {
  // ---- W/U: Merfolk ----
  'Deepchannel Duelist': {
    abilities: [
      atYourEndStep(undefined, [yourOfType('Merfolk')], { kind: 'untap', what: t0 }),
      {
        kind: 'static',
        effect: {
          kind: 'anthem',
          affects: 'otherCreaturesYouControl',
          filter: { subtype: 'Merfolk' },
          power: 1,
          toughness: 1,
        },
      },
    ],
  },
  'Deepway Navigator': {
    abilities: [
      onEnter({
        kind: 'untap',
        what: { each: 'creature', controller: 'you', filter: { subtype: 'Merfolk', other: true } },
      }),
      {
        kind: 'static',
        effect: {
          kind: 'anthem',
          affects: 'creaturesYouControl',
          filter: { subtype: 'Merfolk' },
          condition: { kind: 'attackedWithAtLeast', filter: { subtype: 'Merfolk' }, count: 3 },
          power: 1,
          toughness: 0,
        },
      },
    ],
  },
  'Eclipsed Merrow': eclipsed('Merfolk', 'Plains', 'Island'),
  'Merrow Skyswimmer': {
    convoke: true,
    abilities: [onEnter({ kind: 'createToken', token: ECL_MERFOLK, count: 1 })],
  },
  "Sygg's Command": {
    modes: chooseTwo([
      mode('Create a token that’s a copy of target Merfolk you control', [yourOfType('Merfolk')], {
        kind: 'tokenCopy',
        of: t0,
      }),
      mode(
        'Creatures target player controls gain lifelink until end of turn',
        [player],
        pump({ each: 'creature', controllerTarget: 0 }, 0, 0, ['lifelink']),
      ),
      mode('Target player draws a card', [player], { kind: 'draw', who: t0, amount: 1 }),
      mode(
        'Tap target creature. Put a stun counter on it',
        [{ what: 'creature' }],
        { kind: 'tap', what: t0 },
        { kind: 'namedCounters', name: 'stun', amount: 1, to: t0 },
      ),
    ]),
  },

  // ---- U/B: Faeries and Shapeshifters ----
  'Dream Harvest': { spell: { targets: [], effects: [custom('dreamHarvest')] } },
  'Mischievous Sneakling': {},
  'Voracious Tome-Skimmer': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'castSpell', filter: 'any' },
        condition: { kind: 'opponentsTurn' },
        targets: [],
        effects: [
          {
            kind: 'may',
            effects: [
              { kind: 'loseLife', who: 'controller', amount: 1 },
              { kind: 'draw', who: 'controller', amount: 1 },
            ],
          },
        ],
      },
    ],
  },

  // ---- B/R: Goblins ----
  'Boggart Cursecrafter': {
    abilities: [
      when({ on: 'permanentYouControlDies', filter: { subtype: 'Goblin' }, other: true }, [], {
        kind: 'damage',
        amount: 1,
        to: 'eachOpponent',
      }),
    ],
  },
  'Chaos Spewer': {
    abilities: [
      onEnter({
        kind: 'payOrElse',
        who: 'controller',
        cost: mana('{2}'),
        otherwise: [blight(2)],
      }),
    ],
  },
  'Eclipsed Boggart': eclipsed('Goblin', 'Swamp', 'Mountain'),
  'Shadow Urchin': {
    abilities: [
      when({ on: 'attacks' }, [], blight(1)),
      when({ on: 'creatureYouControlDies', filter: { hasCounters: true } }, [], {
        kind: 'exileTopPlayable',
        count: { event: 'amount' },
        until: 'yourNextEndStep',
      }),
    ],
  },
  "Grub's Command": {
    modes: chooseTwo([
      mode('Create a token that’s a copy of target Goblin you control', [yourOfType('Goblin')], {
        kind: 'tokenCopy',
        of: t0,
      }),
      mode(
        'Creatures target player controls get +1/+1 and gain haste until end of turn',
        [player],
        pump({ each: 'creature', controllerTarget: 0 }, 1, 1, ['haste']),
      ),
      mode(
        'Destroy target artifact or creature',
        [{ what: 'permanent', filter: { types: ['Artifact', 'Creature'] } }],
        { kind: 'destroy', what: t0 },
      ),
      mode(
        'Target player mills five cards, then puts each Goblin card milled this way into their hand',
        [player],
        custom('millGoblinsToHand', { targetIndex: 0 }),
      ),
    ]),
  },

  // ---- R/G: Noggles and changelings ----
  'Gangly Stompling': {},
  'Noggle Robber': {
    abilities: [onEnter(treasure), when({ on: 'dies' }, [], treasure)],
  },
  'Raiding Schemes': {
    abilities: [{ kind: 'static', effect: { kind: 'noncreatureSpellsHaveConspire' } }],
  },

  // ---- G/W: Kithkin ----
  'Eclipsed Kithkin': eclipsed('Kithkin', 'Forest', 'Plains'),
  'Figure of Fable': {
    abilities: [
      fableLevel(
        '{G/W}',
        { subtypes: ['Kithkin', 'Scout'], power: 2, toughness: 3 },
        '{G/W}: This creature becomes a Kithkin Scout with base power and toughness 2/3',
      ),
      fableLevel(
        '{1}{G/W}{G/W}',
        { requires: 'Scout', subtypes: ['Kithkin', 'Soldier'], power: 4, toughness: 5 },
        '{1}{G/W}{G/W}: If this creature is a Scout, it becomes a Kithkin Soldier with base power and toughness 4/5',
      ),
      fableLevel(
        '{3}{G/W}{G/W}{G/W}',
        {
          requires: 'Soldier',
          subtypes: ['Kithkin', 'Avatar'],
          power: 7,
          toughness: 8,
          protection: true,
        },
        '{3}{G/W}{G/W}{G/W}: If this creature is a Soldier, it becomes a Kithkin Avatar with base power and toughness 7/8 and protection from each of your opponents',
      ),
    ],
  },
  'Thoughtweft Lieutenant': {
    abilities: [
      when(
        { on: 'selfOrCreatureEtb', filter: { subtype: 'Kithkin' } },
        [yourCreature],
        pump(t0, 1, 1, ['trample']),
      ),
    ],
  },
  'Wary Farmer': {
    abilities: [
      atYourEndStep({ kind: 'otherCreatureEnteredThisTurn' }, [], { kind: 'surveil', amount: 1 }),
    ],
  },
  "Brigid's Command": {
    modes: chooseTwo([
      mode('Create a token that’s a copy of target Kithkin you control', [yourOfType('Kithkin')], {
        kind: 'tokenCopy',
        of: t0,
      }),
      mode('Target player creates a 1/1 green and white Kithkin creature token', [player], {
        kind: 'createToken',
        token: ECL_KITHKIN,
        count: 1,
        forControllerOf: 0,
      }),
      mode(
        'Target creature you control gets +3/+3 until end of turn',
        [yourCreature],
        pump(t0, 3, 3),
      ),
      mode(
        'Target creature you control fights target creature an opponent controls',
        [yourCreature, { what: 'creature', controller: 'opponent' }],
        { kind: 'fight', a: t0, b: t1 },
      ),
    ]),
  },
};

/** Back faces: the transformed sides of two-faced cards, keyed by their own names. */
export const ECL_MULTI_A_BACKS: Record<string, Behavior> = {};

/** Tokens only this group's cards make. */
export const ECL_MULTI_A_TOKENS: CardDefinition[] = [];
