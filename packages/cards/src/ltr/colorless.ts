import type { CardDefinition } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import { anyColor, mana, when } from '../blb/helpers.ts';
import { equip } from '../fin/helpers.ts';
import { legendaryCreature, ringTempts } from '../ltr-vocab.ts';

/**
 * The Lord of the Rings (21b): colorless cards. Printed characteristics come
 * from Scryfall; this file has the rules text. A back face (adventure spell side, other
 * face) is keyed by its own name in LTR_COLORLESS_BACKS. See docs/lord-of-the-rings-plan.md.
 */
export const LTR_COLORLESS: Record<string, Behavior> = {
  'Barrow-Blade': {
    abilities: [
      // "Equipped creature gets +1/+1."
      { kind: 'static', effect: { kind: 'attached', power: 1, toughness: 1 } },
      // "Whenever equipped creature blocks or becomes blocked by a creature, that creature loses all abilities until end of turn."
      when({ on: 'equippedBlocksOrBlocked' }, [], {
        kind: 'loseAbilities',
        what: 'subject',
        untilEndOfTurn: true,
      }),
      // "Equip {1}"
      equip('{1}'),
    ],
  },
  'Ent-Draught Basin': {
    abilities: [
      // "{X}, {T}: Put a +1/+1 counter on target creature with power X. Activate only as a sorcery."
      {
        kind: 'activated',
        cost: { mana: mana('{X}'), tapSelf: true },
        sorcerySpeed: true,
        targets: [{ what: 'creature', filter: { powerEqualsX: true } }],
        effects: [{ kind: 'custom', handler: 'ltrPowerXCounter' }],
      },
    ],
  },
  'Inherited Envelope': {
    abilities: [
      // "When this artifact enters, the Ring tempts you."
      when({ on: 'etb' }, [], ringTempts),
      // "{T}: Add one mana of any color."
      ...anyColor(),
    ],
  },
  Lembas: {
    abilities: [
      // "When this artifact enters, scry 1, then draw a card."
      when(
        { on: 'etb' },
        [],
        { kind: 'scry', amount: 1 },
        { kind: 'draw', who: 'controller', amount: 1 },
      ),
      // "{2}, {T}, Sacrifice this artifact: You gain 3 life."
      {
        kind: 'activated',
        cost: { mana: mana('{2}'), tapSelf: true, sacrificeSelf: true },
        targets: [],
        effects: [{ kind: 'gainLife', who: 'controller', amount: 3 }],
      },
      // "When this artifact is put into a graveyard from the battlefield, its owner shuffles it into their library."
      when({ on: 'selfToGraveyard' }, [], { kind: 'custom', handler: 'ltrShuffleSelfIntoLibrary' }),
    ],
  },
  'Mirror of Galadriel': {
    abilities: [
      // "{5}, {T}: Scry 1, then draw a card. This ability costs {1} less to activate for each legendary creature you control."
      {
        kind: 'activated',
        cost: { mana: mana('{5}'), tapSelf: true },
        costReduction: { count: 'permanentsYouControl', filter: legendaryCreature },
        targets: [],
        effects: [
          { kind: 'scry', amount: 1 },
          { kind: 'draw', who: 'controller', amount: 1 },
        ],
      },
    ],
  },
};

/** Back faces: keyed by their own names. */
export const LTR_COLORLESS_BACKS: Record<string, Behavior> = {};

/** Tokens only this group's cards make. */
export const LTR_COLORLESS_TOKENS: CardDefinition[] = [];
