import type { CardDefinition, EffectDef } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import { atYourEndStep, mana, pump, t0, when, yours } from '../blb/helpers.ts';
import { chapter } from '../fin/helpers.ts';
import { legendaryCreature, ringTempts } from '../ltr-vocab.ts';

/**
 * The Lord of the Rings (21d): white rare cards. Printed characteristics come
 * from Scryfall; this file has the rules text. A back face (adventure spell side, other
 * face) is keyed by its own name in LTR_WHITE_RARE_BACKS. See docs/lord-of-the-rings-plan.md.
 */

const custom = (handler: string, params?: Record<string, unknown>): EffectDef => ({
  kind: 'custom',
  handler,
  ...(params ? { params } : {}),
});

/** "Legendary" as a creature filter for the anthem ("legendary creatures you control"; a Ring-bearer counts). */
const legendary = { supertypes: ['Legendary' as const] };

const hope = { kind: 'sourceHadNamedCounter', name: 'hope' } as const;

export const LTR_WHITE_RARE: Record<string, Behavior> = {
  // Vigilance is printed.
  'Boromir, Warden of the Tower': {
    abilities: [
      // "Whenever an opponent casts a spell, if no mana was spent to cast it, counter that spell."
      when(
        { on: 'castSpell', filter: 'any', caster: 'opponent', maxManaSpent: 0 },
        [],
        custom('ltrCounterSubject'),
      ),
      // "Sacrifice Boromir: Creatures you control gain indestructible until end of turn. The Ring tempts you."
      {
        kind: 'activated',
        cost: { sacrificeSelf: true },
        targets: [],
        effects: [pump(yours, 0, 0, ['indestructible']), ringTempts],
      },
    ],
  },
  'Dawn of a New Age': {
    // "This enchantment enters with a hope counter on it for each creature you control."
    entersWithNamedCountersAmount: { name: 'hope', amount: { count: 'creaturesYouControl' } },
    abilities: [
      // "At the beginning of your end step, remove a hope counter from this enchantment. If you do, draw a card. Then if this
      // enchantment has no hope counters on it, sacrifice it and you gain 4 life."
      atYourEndStep(
        undefined,
        [],
        {
          kind: 'if',
          condition: hope,
          then: [
            { kind: 'removeCounters', from: 'self', name: 'hope', count: 1 },
            { kind: 'draw', who: 'controller', amount: 1 },
          ],
        },
        {
          kind: 'if',
          condition: { kind: 'not', condition: hope },
          then: [
            { kind: 'sacrifice', what: 'self' },
            { kind: 'gainLife', who: 'controller', amount: 4 },
          ],
        },
      ),
    ],
  },
  'Flowering of the White Tree': {
    abilities: [
      // "Legendary creatures you control get +2/+1 and have ward {1}."
      {
        kind: 'static',
        effect: {
          kind: 'anthem',
          affects: 'creaturesYouControl',
          filter: legendary,
          power: 2,
          toughness: 1,
          keywords: ['wardOne'],
        },
      },
      // "Nonlegendary creatures you control get +1/+1."
      {
        kind: 'static',
        effect: {
          kind: 'anthem',
          affects: 'creaturesYouControl',
          filter: { nonlegendary: true },
          power: 1,
          toughness: 1,
        },
      },
    ],
  },
  'Forge Anew': {
    abilities: [
      // "When this enchantment enters, return target Equipment card from your graveyard to the battlefield."
      when(
        { on: 'etb' },
        [{ what: 'graveyardCard', controller: 'you', filter: { subtype: 'Equipment' } }],
        { kind: 'returnToBattlefield', what: t0 },
      ),
      // "During your turn, you may activate equip abilities any time you could cast an instant."
      {
        kind: 'static',
        effect: { kind: 'ltrEquipAtInstantSpeed', condition: { kind: 'yourTurn' } },
      },
      // "You may pay {0} rather than pay the equip cost of the first equip ability you activate during each of your turns."
      // (Paying {0} is never worse, so the first equip ability on your turn costs {0}, as for Kíli the Resourceful.)
      { kind: 'static', effect: { kind: 'firstEquipFree', condition: { kind: 'yourTurn' } } },
    ],
  },
  "Frodo, Sauron's Bane": {
    abilities: [
      // "{W/B}{W/B}: If Frodo is a Citizen, it becomes a Halfling Scout with base power and toughness 2/3 and lifelink."
      {
        kind: 'activated',
        cost: { mana: mana('{W/B}{W/B}') },
        targets: [],
        effects: [custom('ltrFrodoScout')],
      },
      // "{B}{B}{B}: If Frodo is a Scout, it becomes a Halfling Rogue with 'Whenever this creature deals combat damage to a player,
      // that player loses the game if the Ring has tempted you four or more times this game. Otherwise, the Ring tempts you.'"
      {
        kind: 'activated',
        cost: { mana: mana('{B}{B}{B}') },
        targets: [],
        effects: [custom('ltrFrodoRogue')],
      },
    ],
  },
  'Gandalf the White': {
    abilities: [
      // Flash is printed.
      // "You may cast legendary spells and artifact spells as though they had flash."
      {
        kind: 'static',
        effect: {
          kind: 'flashForAll',
          filter: { anyOf: [{ supertypes: ['Legendary'] }, { types: ['Artifact'] }] },
        },
      },
      // "If a legendary permanent or an artifact entering or leaving the battlefield causes a triggered ability of a permanent you
      // control to trigger, that ability triggers an additional time."
      { kind: 'static', effect: { kind: 'ltrLegendaryArtifactTriggersTwice' } },
    ],
  },
  'The Battle of Bywater': {
    // "Destroy all creatures with power 3 or greater. Then create a Food token for each creature you control."
    spell: {
      targets: [],
      effects: [
        { kind: 'destroyAll', filter: { minPower: 3 } },
        { kind: 'createToken', token: 'food-token', count: { count: 'creaturesYouControl' } },
      ],
    },
  },
  'War of the Last Alliance': {
    saga: 3,
    abilities: [
      // "I, II — Search your library for a legendary creature card, reveal it, put it into your hand, then shuffle."
      chapter([1, 2], [], {
        kind: 'searchLibrary',
        filter: legendaryCreature,
        to: 'hand',
        reveal: true,
      }),
      // "III — Creatures you control gain double strike until end of turn. The Ring tempts you."
      chapter([3], [], pump(yours, 0, 0, ['doubleStrike']), ringTempts),
    ],
  },
};

/** Back faces: keyed by their own names. */
export const LTR_WHITE_RARE_BACKS: Record<string, Behavior> = {};

/** Tokens only this group's cards make. */
export const LTR_WHITE_RARE_TOKENS: CardDefinition[] = [];
