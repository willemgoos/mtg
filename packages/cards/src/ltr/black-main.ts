import type { CardDefinition, EffectDef, TargetSpec } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import { parseManaCost as mana } from '../build.ts';
import { pump, when } from '../blb/helpers.ts';
import { chapter } from '../fin/helpers.ts';
import { subtypecycling } from '../hob-vocab.ts';
import { amassOrcs, legendaryCreature, ringTempts } from '../ltr-vocab.ts';

/**
 * The Lord of the Rings (22): black main-set commons and uncommons outside the Jumpstart
 * packets. Printed characteristics come from Scryfall; this file has the rules text. See
 * docs/lord-of-the-rings-plan.md.
 */

const opponent: TargetSpec = { what: 'player', controller: 'opponent' };
const food = (forOpponent?: boolean): EffectDef => ({
  kind: 'createToken',
  token: 'food-token',
  count: 1,
  ...(forOpponent ? { forOpponent: true } : {}),
});
/** A spell's targets and effects. */
const spell = (targets: TargetSpec[], ...effects: EffectDef[]) => ({ targets, effects });

export const LTR_BLACK_MAIN: Record<string, Behavior> = {
  // "Creatures your opponents control get -1/-1 until end of turn. The Ring tempts you."
  'The Black Breath': {
    spell: spell([], pump({ each: 'creature', controller: 'opponent' }, -1, -1), ringTempts),
  },
  'Haunt of the Dead Marshes': {
    abilities: [
      // "When this creature enters, scry 1."
      when({ on: 'etb' }, [], { kind: 'scry', amount: 1 }),
      // "{2}{B}: Return this card from your graveyard to the battlefield tapped. Activate only if you control a legendary creature."
      {
        kind: 'activated',
        cost: { mana: mana('{2}{B}') },
        fromGraveyard: true,
        condition: { kind: 'controlsCreature', filter: legendaryCreature },
        targets: [],
        effects: [{ kind: 'returnSource', to: 'battlefield', tapped: true }],
        label: '{2}{B}: Return this card from your graveyard to the battlefield tapped',
      },
    ],
  },
  // Enchant creature. "Enchanted creature gets -3/-0 and has 'At the beginning of your upkeep, exile this creature unless you pay
  // 2 life.'" The Aura carries the upkeep trigger; the enchanted creature's controller chooses.
  'Morgul-Knife Wound': {
    enchant: { what: 'creature' },
    abilities: [
      { kind: 'static', effect: { kind: 'attached', power: -3, toughness: 0 } },
      when({ on: 'beginningOfUpkeep', whose: 'enchantedController' }, [], {
        kind: 'chooseCustom',
        handler: 'ltrPayLifeOrExileHost',
        params: { life: 2 },
      }),
    ],
  },
  'Oath of the Grey Host': {
    saga: 3,
    abilities: [
      // "I — You and target opponent each create a Food token."
      chapter([1], [opponent], food(), food(true)),
      // "II — Each opponent loses 3 life. Create a Treasure token."
      chapter(
        [2],
        [],
        { kind: 'loseLife', who: 'eachOpponent', amount: 3 },
        { kind: 'createToken', token: 'treasure-token', count: 1 },
      ),
      // "III — Create three tapped 1/1 white Spirit creature tokens with flying."
      chapter([3], [], { kind: 'createToken', token: 'ltr-spirit-token', count: 3, tapped: true }),
    ],
  },
  // Menace is printed.
  'Snarling Warg': {
    abilities: [
      // "As long as you control a Goblin or Orc, this creature gets +1/+0."
      {
        kind: 'static',
        effect: {
          kind: 'while',
          condition: {
            kind: 'controlsCreature',
            filter: { anyOf: [{ subtype: 'Goblin' }, { subtype: 'Orc' }] },
          },
          power: 1,
          toughness: 0,
        },
      },
    ],
  },
  // "Target opponent reveals their hand. You choose a nonland card from it. That player discards that card. Amass Orcs 2."
  'The Torment of Gollum': {
    spell: spell(
      [opponent],
      { kind: 'chooseFromOpponentHand', filter: { nonland: true }, then: 'discard' },
      amassOrcs(2),
    ),
  },
  'Troll of Khazad-dûm': {
    abilities: [
      // "This creature can't be blocked except by three or more creatures."
      { kind: 'static', effect: { kind: 'minBlockers', count: 3 } },
      // "Swampcycling {1}"
      subtypecycling('Swamp', '{1}'),
    ],
  },
};

export const LTR_BLACK_MAIN_BACKS: Record<string, Behavior> = {};
export const LTR_BLACK_MAIN_TOKENS: CardDefinition[] = [];
