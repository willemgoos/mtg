import type { AbilityDef, CardDefinition, ConditionDef, ManaType, TargetSpec } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import {
  anyColor,
  creature,
  draw,
  gain,
  mana,
  onEnter,
  pump,
  t0,
  when,
  yourCreature,
  yours,
} from '../blb/helpers.ts';
import { equip, tapFor } from '../fin/helpers.ts';

/**
 * Reality Fracture (17a): colourless cards and nonbasic lands. Printed characteristics come from Scryfall;
 * this file has the rules text. A prepare card's spell is keyed "Spell (Creature)"
 * in FRA_COLORLESS_BACKS. See docs/reality-fracture-plan.md.
 */

const aLand: TargetSpec = { what: 'permanent', filter: { types: ['Land'] } };

/** "This land enters tapped unless you control a planeswalker." */
const unlessPlaneswalker: ConditionDef = {
  kind: 'not',
  condition: { kind: 'controlsPermanents', filter: { types: ['Planeswalker'] }, min: 1 },
};

/** A "Commons" or "Annex" land: enters tapped unless you control a planeswalker, taps for one of two colours. */
const planeswalkerLand = (a: ManaType, b: ManaType): Behavior => ({
  entersTappedIf: unlessPlaneswalker,
  abilities: tapFor(a, b),
});

/** "Target creature becomes prepared." */
const makePrepared = (
  cost: string,
  label: string,
  target: TargetSpec,
  sorcery = false,
): AbilityDef => ({
  kind: 'activated',
  cost: { mana: mana(cost), tapSelf: true },
  ...(sorcery ? { sorcerySpeed: true } : {}),
  targets: [target],
  effects: [{ kind: 'prepare', what: t0 }],
  label,
});

export const FRA_COLORLESS: Record<string, Behavior> = {
  // ------------------------------------------------------------ artifacts
  'Afterthought Sentry': {
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{2}') },
        targets: [],
        effects: [pump('self', 0, 0, ['flying'])],
        label: '{2}: Gains flying until end of turn',
      },
      when({ on: 'attacks' }, [{ what: 'graveyardCard', optional: true }], {
        kind: 'exileGraveyardCard',
        what: t0,
      }),
    ],
  },
  'Archive Arbiter': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        targets: [],
        effects: [],
        modes: [
          {
            label: 'Destroy target noncreature, nonland permanent',
            targets: [{ what: 'permanent', filter: { nonland: true, notTypes: ['Creature'] } }],
            effects: [{ kind: 'destroy', what: t0 }],
          },
          { label: 'You gain 4 life', targets: [], effects: [gain(4)] },
        ],
      },
    ],
  },
  'Codie, Ravenous Codex': {
    abilities: [
      // "Whenever you cast a prepared spell, copy it. You may choose new targets for the copy."
      when({ on: 'castSpell', filter: 'any', prepared: true }, [], {
        kind: 'copySpell',
        what: 'subject',
        newTargets: true,
      }),
      {
        kind: 'activated',
        cost: { mana: mana('{W}{U}{B}{R}{G}'), tapSelf: true },
        targets: [],
        effects: [{ kind: 'prepare', what: yours }],
        label: '{W}{U}{B}{R}{G}, {T}: Each creature you control becomes prepared',
      },
    ],
  },
  'Eye of Jace': {
    abilities: [
      when(
        { on: 'beginningOfUpkeep', whose: 'yours' },
        [],
        { kind: 'surveil', amount: 1 },
        {
          kind: 'if',
          condition: {
            kind: 'amountAtLeast',
            amount: { count: 'cardsInGraveyard' },
            min: 7,
          },
          then: [
            { kind: 'sacrifice', what: 'self' },
            { kind: 'damage', amount: 2, to: 'eachOpponent' },
            gain(2),
          ],
        },
      ),
    ],
  },
  'Karn, Argent Defender': {
    abilities: [{ kind: 'static', effect: { kind: 'etbDoesntTrigger' } }],
  },
  'Living Library': {
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{6}'), sacrificeSelf: true },
        targets: [
          {
            what: 'permanent',
            controller: 'opponent',
            filter: { types: ['Creature', 'Planeswalker'] },
          },
        ],
        effects: [{ kind: 'putInLibrary', what: t0, position: 'top', shuffle: true }],
        label:
          "{6}, Sacrifice this creature: Shuffle target creature or planeswalker an opponent controls into its owner's library",
      },
    ],
  },
  "Medic's Kitesail": {
    abilities: [
      {
        kind: 'static',
        effect: { kind: 'attached', power: 1, toughness: 0, keywords: ['flying'] },
      },
      // "...and has 'Whenever this creature attacks, you gain 1 life.'"
      when({ on: 'equippedAttacks', creatureAbility: true }, [], gain(1)),
      equip('{2}'),
    ],
  },
  'Murmuring Volume': {
    abilities: [
      ...anyColor(),
      {
        kind: 'activated',
        cost: { mana: mana('{2}'), tapSelf: true, discard: true },
        targets: [],
        effects: [draw(1)],
        label: '{2}, {T}, Discard a card: Draw a card',
      },
    ],
  },
  'The Echoverse Fulcrum': {
    abilities: [
      onEnter(draw(1), { kind: 'discard', count: 1 }),
      {
        kind: 'activated',
        cost: { mana: mana('{5}'), tapSelf: true, exileSelf: true },
        sorcerySpeed: true,
        targets: [],
        effects: [{ kind: 'destroy', what: { each: 'creature' } }],
        label: '{5}, {T}, Exile The Echoverse Fulcrum: Destroy all creatures',
      },
    ],
  },
  'Traxos, Scourge Eternal': {
    abilities: [
      { kind: 'static', effect: { kind: 'doesntUntap' } },
      when({ on: 'castSpell', filter: 'any', spell: { types: ['Artifact', 'Creature'] } }, [], {
        kind: 'untap',
        what: 'self',
      }),
    ],
  },

  // ------------------------------------------------------------ creature
  'Emrakul, the Exigent Doom': {
    abilities: [
      when({ on: 'castSelf' }, [], {
        kind: 'untap',
        what: { each: 'permanent', controller: 'you', filter: { types: ['Land'] } },
      }),
      {
        kind: 'activated',
        fromHand: true,
        cost: { mana: mana('{3}'), exileSelf: true },
        targets: [aLand],
        effects: [{ kind: 'custom', handler: 'emrakulMana' }],
        label: '{3}, Exile this card from your hand: Target land gains "{T}: Add {C}{C}"',
      },
    ],
  },

  // ------------------------------------------------------------ lands
  'Dedicated Commons': planeswalkerLand('R', 'W'),
  'Fatehold Annex': planeswalkerLand('W', 'U'),
  'Formidable Commons': planeswalkerLand('B', 'G'),
  'Innovative Commons': planeswalkerLand('U', 'R'),
  'Konstrari Annex': planeswalkerLand('R', 'G'),
  'Meticulous Commons': planeswalkerLand('W', 'B'),
  'Stingerquill Annex': planeswalkerLand('B', 'R'),
  'Theorix Annex': planeswalkerLand('U', 'B'),
  'Transformative Commons': planeswalkerLand('G', 'U'),
  'Vigorbloom Annex': planeswalkerLand('G', 'W'),
  'Hall of Echoes': {
    abilities: [
      ...tapFor('C'),
      {
        kind: 'activated',
        cost: { mana: mana('{5}') },
        targets: [yourCreature],
        effects: [
          { kind: 'becomeCopy', of: t0 },
          { kind: 'custom', handler: 'legendRuleOffThisTurn' },
        ],
        label: '{5}: This land becomes a copy of target creature you control until end of turn',
      },
    ],
  },
  'Hexhaven Dueling Arena': {
    abilities: [
      ...tapFor('C'),
      makePrepared(
        '{2}',
        '{2}, {T}: Target creature that attacked this turn becomes prepared',
        { what: 'creature', filter: { attackedThisTurn: true } },
        true,
      ),
      makePrepared('{4}', '{4}, {T}: Target creature becomes prepared', creature),
    ],
  },
  'Roiling Canopy': {
    entersTapped: true,
    abilities: [
      // "Whenever a Forest you control enters, if you control at least five other Forests": six with the one entering.
      {
        kind: 'triggered',
        trigger: { on: 'otherPermanentEtb', filter: { subtype: 'Forest' } },
        condition: { kind: 'controlsPermanents', filter: { subtype: 'Forest' }, min: 6 },
        targets: [yourCreature],
        effects: [pump(t0, 3, 3)],
      },
      ...tapFor('G'),
    ],
  },
  'Room of Refuge': {
    entersTapped: true,
    abilities: [
      onEnter({ kind: 'chooseColor' }),
      ...(['W', 'U', 'B', 'R', 'G'] as const).map((produces): AbilityDef => ({
        kind: 'mana',
        cost: { tapSelf: true },
        produces,
        ifChosen: true,
      })),
      {
        kind: 'activated',
        cost: { mana: mana('{5}'), tapSelf: true, sacrificeSelf: true },
        sorcerySpeed: true,
        targets: [creature],
        effects: [{ kind: 'counters', to: t0, amount: 2 }],
        label: '{5}, {T}, Sacrifice this land: Put two +1/+1 counters on target creature',
      },
    ],
  },
};

/** Back faces: the prepare spells, named "Spell (Creature)". */
export const FRA_COLORLESS_BACKS: Record<string, Behavior> = {};

/** Tokens only this group's cards make. */
export const FRA_COLORLESS_TOKENS: CardDefinition[] = [];
