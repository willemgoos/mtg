import type { CardDefinition, EffectDef, TargetSpec } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import { pump, t0, t1, when, yourCreature } from '../blb/helpers.ts';
import { chapter } from '../fin/helpers.ts';
import { HOB_HUMAN_SOLDIER } from '../hob/tokens.ts';
import { subtypecycling } from '../hob-vocab.ts';
import { equip } from '../msc/helpers.ts';
import { secondDraw } from '../msh/helpers.ts';
import { ringTempts } from '../ltr-vocab.ts';

/**
 * The Lord of the Rings (22): white main-set commons and uncommons outside the Jumpstart
 * packets. Printed characteristics come from Scryfall; this file has the rules text. See
 * docs/lord-of-the-rings-plan.md.
 */

const yourCreatures = { each: 'creature', controller: 'you' } as const;
const humanSoldier: EffectDef = { kind: 'createToken', token: HOB_HUMAN_SOLDIER, count: 1 };
/** A spell's targets and effects. */
const sorcery = (targets: TargetSpec[], ...effects: EffectDef[]) => ({ targets, effects });

export const LTR_WHITE_MAIN: Record<string, Behavior> = {
  'Dúnedain Blade': {
    abilities: [
      // "Equipped creature gets +2/+1."
      { kind: 'static', effect: { kind: 'attached', power: 2, toughness: 1 } },
      // "Equip Human {1}"
      equip('{1}', { subtype: 'Human' }, 'Equip Human {1}'),
      // "Equip {3}"
      equip('{3}'),
    ],
  },
  // Flying is printed.
  'Eagles of the North': {
    abilities: [
      // "When this creature enters, creatures you control get +1/+0 and gain first strike until end of turn."
      when({ on: 'etb' }, [], pump(yourCreatures, 1, 0, ['firstStrike'])),
      // "Plainscycling {1}"
      subtypecycling('Plains', '{1}'),
    ],
  },
  // "Put a +1/+1 counter on each creature you control. They gain vigilance until end of turn. The Ring tempts you."
  'Now for Wrath, Now for Ruin!': {
    spell: sorcery(
      [],
      { kind: 'counters', to: yourCreatures, amount: 1 },
      pump(yourCreatures, 0, 0, ['vigilance']),
      ringTempts,
    ),
  },
  'Protector of Gondor': {
    // "When this creature enters, create a 1/1 white Human Soldier creature token."
    abilities: [when({ on: 'etb' }, [], humanSoldier)],
  },
  'Stalwarts of Osgiliath': {
    abilities: [
      // "When this creature enters, the Ring tempts you."
      when({ on: 'etb' }, [], ringTempts),
      // "Whenever you draw your second card each turn, put a +1/+1 counter on this creature."
      secondDraw([], { kind: 'counters', to: 'self', amount: 1 }),
    ],
  },
  'Tale of Tinúviel': {
    saga: 3,
    abilities: [
      // "I — Target creature you control gains indestructible for as long as you control this Saga."
      chapter([1], [yourCreature], {
        ...pump(t0, 0, 0, ['indestructible']),
        whileSource: true,
        whileYouControlSource: true,
      } as EffectDef),
      // "II — Return target creature card from your graveyard to the battlefield."
      chapter(
        [2],
        [{ what: 'graveyardCard', controller: 'you', filter: { types: ['Creature'] } }],
        {
          kind: 'returnToBattlefield',
          what: t0,
        },
      ),
      // "III — Up to two target creatures you control each gain lifelink until end of turn."
      chapter(
        [3],
        [
          { ...yourCreature, optional: true },
          { ...yourCreature, optional: true },
        ],
        pump(t0, 0, 0, ['lifelink']),
        pump(t1, 0, 0, ['lifelink']),
      ),
    ],
  },
  'Westfold Rider': {
    abilities: [
      // "Sacrifice this creature: Destroy target artifact or enchantment. Activate only as a sorcery."
      {
        kind: 'activated',
        cost: { sacrificeSelf: true },
        sorcerySpeed: true,
        targets: [{ what: 'permanent', filter: { types: ['Artifact', 'Enchantment'] } }],
        effects: [{ kind: 'destroy', what: t0 }],
      },
    ],
  },
  // "Destroy target creature that blocked or was blocked by a legendary creature this turn."
  'You Cannot Pass!': {
    spell: sorcery([{ what: 'creature', filter: { blockedWithLegendaryThisTurn: true } }], {
      kind: 'destroy',
      what: t0,
    }),
  },
};

export const LTR_WHITE_MAIN_BACKS: Record<string, Behavior> = {};
export const LTR_WHITE_MAIN_TOKENS: CardDefinition[] = [];
