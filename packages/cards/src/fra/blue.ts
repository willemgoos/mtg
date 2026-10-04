import type { AbilityDef, CardDefinition, EffectDef, Ref, TargetSpec } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import {
  creature,
  draw,
  mana,
  onEnter,
  prowess,
  pump,
  t0,
  theirCreature,
  when,
} from '../blb/helpers.ts';
import { mode, spell } from '../fin/helpers.ts';
import { FRA_CADET } from './tokens.ts';

/**
 * Reality Fracture (17a): blue. Printed characteristics come from Scryfall;
 * this file has the rules text. A prepare card's spell is keyed "Spell (Creature)"
 * in FRA_BLUE_BACKS. See docs/reality-fracture-plan.md.
 */

/** The 3/3 blue Angel creature token with flying Lyra, Tolarian Archangel makes. */
export const FRA_BLUE_ANGEL = 'fra-blue-angel-token';

const anyPlayer: TargetSpec = { what: 'player' };
const stunCounter = (to: Ref): EffectDef => ({
  kind: 'namedCounters',
  name: 'stun',
  amount: 1,
  to,
});
const tapTarget: EffectDef = { kind: 'tap', what: t0 };
const loot: EffectDef[] = [draw(1), { kind: 'discard', count: 1 }];
const surveil = (amount: number): EffectDef => ({ kind: 'surveil', amount });
const tapAndStun: EffectDef[] = [tapTarget, stunCounter(t0)];

/** "{cost}, Exile this card from your graveyard: ..." */
const fromGraveyard = (
  cost: string,
  targets: TargetSpec[],
  sorcery: boolean,
  ...effects: EffectDef[]
): AbilityDef => ({
  kind: 'activated',
  cost: { mana: mana(cost), exileSelf: true },
  fromGraveyard: true,
  ...(sorcery ? { sorcerySpeed: true } : {}),
  targets,
  effects,
});

/** "Basic landcycling {cost}": discard it to search for a basic land card. */
const basicLandcycling = (cost: string): AbilityDef => ({
  kind: 'activated',
  cost: { mana: mana(cost), discardSelf: true },
  fromHand: true,
  targets: [],
  effects: [{ kind: 'searchLibrary', filter: 'basicLand', to: 'hand' }],
  label: `Basic landcycling ${cost}`,
});

export const FRA_BLUE: Record<string, Behavior> = {
  'Arni, Humble Scribe': {
    abilities: [
      when({ on: 'otherCreatureEtb', controller: 'you', filter: { nontoken: true } }, [], {
        kind: 'untap',
        what: 'self',
      }),
      { kind: 'activated', cost: { tapSelf: true }, targets: [], effects: loot },
    ],
  },
  'Cruel Calculations': spell([anyPlayer], {
    kind: 'draw',
    who: 'controller',
    amount: { milledThisTurn: t0 },
  }),
  'Cryotheory Adept': {
    abilities: [prowess, fromGraveyard('{3}{U}', [creature], true, ...tapAndStun)],
  },
  'Diviner of Victory': {
    entersPrepared: true,
    abilities: [when({ on: 'youScryOrSurveil' }, [], pump('self', 1, 1))],
  },
  'Divining Duelist': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        targets: [],
        effects: [],
        modes: [
          mode('Tap target creature', [creature], tapTarget),
          mode('Untap target creature', [creature], { kind: 'untap', what: t0 }),
          mode('Draw a card, then discard a card', [], ...loot),
        ],
      },
    ],
  },
  'Fblthp, Impossibly Lost': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'creaturesYouControlDealCombatDamageToPlayer' },
        batch: true,
        targets: [],
        effects: [
          draw(2),
          {
            kind: 'if',
            condition: {
              kind: 'not',
              condition: { kind: 'amountAtLeast', amount: { count: 'cardsInLibrary' }, min: 1 },
            },
            then: [{ kind: 'winGame' }],
          },
          { kind: 'putInLibrary', what: 'self', position: 'top', shuffle: true },
        ],
      },
    ],
  },
  'Geist of Saint Thalia': {
    abilities: [
      {
        kind: 'static',
        effect: { kind: 'spellsCostLess', filter: { notTypes: ['Creature'] }, amount: 1 },
      },
    ],
  },
  'Hapatra, the Desert Frost': {
    abilities: [
      // "For each opponent, tap up to one target creature that player controls."
      when({ on: 'etb' }, [{ ...theirCreature, optional: true }], ...tapAndStun),
      {
        kind: 'activated',
        cost: { mana: mana('{2}{U}') },
        targets: [creature],
        effects: [{ kind: 'untap', what: t0 }],
      },
    ],
  },
  'Icy Reception': {
    modes: [
      mode(
        'Counter target creature or legendary spell unless its controller pays {3}',
        [
          {
            what: 'spell',
            filter: { anyOf: [{ types: ['Creature'] }, { supertypes: ['Legendary'] }] },
          },
        ],
        { kind: 'counterUnlessPays', what: t0, cost: mana('{3}') },
      ),
      mode('Target creature gets -5/-0 until end of turn', [creature], pump(t0, -5, 0)),
    ],
  },
  'Infinite Coursework': {
    enchant: creature,
    abilities: [
      onEnter({ kind: 'tap', what: 'attached' }, { kind: 'unprepare', what: 'attached' }),
      {
        kind: 'static',
        effect: {
          kind: 'attached',
          power: 0,
          toughness: 0,
          loseAbilities: true,
          doesntUntap: true,
        },
      },
    ],
  },
  'Lyra, Tolarian Archangel': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'beginningOfEndStep', whose: 'each' },
        condition: { kind: 'cardsDrawnThisTurn', min: 3 },
        targets: [],
        effects: [{ kind: 'createToken', token: FRA_BLUE_ANGEL, count: 1 }],
      },
      {
        kind: 'activated',
        cost: { mana: mana('{3}{U}{U}') },
        targets: [],
        effects: [
          {
            kind: 'grantAbility',
            to: 'self',
            stacking: true,
            ability: when({ on: 'combatDamageToPlayer' }, [], draw(2)),
          },
        ],
      },
    ],
  },
  'Perfected Theory': {
    modes: [
      mode('Target creature has base power and toughness 1/1 until end of turn', [creature], {
        kind: 'pump',
        to: t0,
        power: 1,
        toughness: 1,
        setBase: true,
      }),
      mode('Target creature has base power and toughness 4/5 until end of turn', [creature], {
        kind: 'pump',
        to: t0,
        power: 4,
        toughness: 5,
        setBase: true,
      }),
    ],
  },
  'Precise Redaction': spell([{ what: 'spell', filter: { colors: ['W', 'B'] } }], {
    kind: 'counter',
    what: t0,
  }),
  'Proft, Consulting Detective': {
    abilities: [
      // "Draw after you scry or surveil": the trigger resolves once the scry or surveil is done.
      when({ on: 'youScryOrSurveil' }, [], {
        kind: 'may',
        cost: mana('{2}'),
        effects: [{ kind: 'counters', to: 'self', amount: 1 }, draw(1)],
      }),
    ],
  },
  'Ruric Thar, Biomagus': {
    abilities: [prowess, prowess, when({ on: 'targetedByOpponent' }, [], draw(1))],
  },
  'Samut, Tyrant of Naktamun': {
    abilities: [{ kind: 'static', effect: { kind: 'instantsSorceriesSplitSecond' } }],
  },
  'Seasoned Cryomancer': {
    abilities: [
      // "When you discard one or more nonland cards this way" is the reflexive ability at index 1.
      onEnter(draw(2), { kind: 'discard', count: 2, reflexiveOnNonland: 1 }),
      {
        kind: 'triggered',
        trigger: { on: 'reflexive' },
        targets: [{ what: 'creature', anyNumber: true, maxFromAmount: true }],
        effects: [{ kind: 'tap', what: { targetsFrom: 0 } }, stunCounter({ targetsFrom: 0 })],
      },
      fromGraveyard('{3}{U}{U}', [], false, draw(2)),
    ],
  },
  'Semester Foreseer': {
    entersPrepared: true,
    abilities: [onEnter(surveil(1))],
  },
  'Sphinx of False Conclusions': {
    abilities: [
      when({ on: 'attacks' }, [], ...loot),
      {
        kind: 'triggered',
        trigger: { on: 'dies' },
        condition: { kind: 'sourceNotToken' },
        targets: [],
        effects: [{ kind: 'tokenCopyOfSource' }],
      },
    ],
  },
  "Sphinx's Approach": spell([], draw(2), {
    kind: 'if',
    condition: {
      kind: 'amountAtLeast',
      amount: { count: 'cardsInGraveyard', named: 'sphinxs-approach' },
      min: 4,
    },
    then: [
      {
        kind: 'may',
        effects: [
          { kind: 'exileSelfAndSameNameFromGraveyard', count: 4 },
          {
            kind: 'searchLibrary',
            filter: { types: ['Creature'], subtype: 'Sphinx' },
            to: 'battlefield',
          },
        ],
      },
    ],
  }),
  'Surveillance Phantasm': {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'canAttackDespiteDefender',
          condition: { kind: 'scriedOrSurveilledThisTurn' },
        },
      },
      {
        kind: 'activated',
        cost: { mana: mana('{3}{U}') },
        targets: [],
        effects: [surveil(1)],
      },
    ],
  },
  'Tetsuko Umezawa, Fugitive': {
    abilities: [
      {
        kind: 'static',
        effect: { kind: 'grantsCantBeBlocked', filter: { maxPowerOrToughness: 1 } },
      },
    ],
  },
  'Traxos, Academy Guardian': {
    costReductionIf: { condition: { kind: 'castNoncreatureThisTurn' }, amount: 2 },
    abilities: [prowess],
  },
  'Undulating Witness': {
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{2}') },
        targets: [],
        effects: [pump('self', 1, -1)],
      },
      basicLandcycling('{2}'),
    ],
  },
  'Variable Chaser': {
    entersPrepared: true,
    abilities: [prowess],
  },
  'Yargle, Goliath of Otaria': {},
  'Yuriko, Hope from the Shadows': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        targets: [],
        effects: [],
        modes: [
          mode(
            'Target creature gets -X/-0 until end of turn, where X is the number of cards in your graveyard',
            [creature],
            pump(t0, { multiply: -1, amount: { count: 'cardsInGraveyard' } }, 0),
          ),
          mode('Surveil 2', [], surveil(2)),
        ],
      },
    ],
  },
};

/** "Each player may discard their hand and draw seven cards": the choices come first, then it happens at once. */
const handSwapChoice = (opponent: boolean): EffectDef => ({
  kind: 'choose',
  ...(opponent ? { opponent: true } : {}),
  options: [
    {
      label: 'Discard your hand, then draw seven cards',
      effects: [{ kind: 'markHandSwap', who: opponent ? 'eachOpponent' : 'controller' }],
    },
    { label: 'Keep your hand', effects: [] },
  ],
});

/** Back faces: the prepare spells, named "Spell (Creature)". */
export const FRA_BLUE_BACKS: Record<string, Behavior> = {
  'Unwind History (Diviner of Victory)': spell(
    [{ what: 'creature', controller: 'opponent', filter: { maxManaValue: 3 } }],
    { kind: 'bounce', what: t0 },
    surveil(1),
  ),
  'Peer Review (Semester Foreseer)': spell(
    [],
    { kind: 'createToken', token: FRA_CADET, count: 1 },
    surveil(1),
  ),
  'Arc of Fortune (Variable Chaser)': spell([], handSwapChoice(false), handSwapChoice(true), {
    kind: 'handSwap',
    count: 7,
  }),
};

/** Tokens only this group's cards make. */
export const FRA_BLUE_TOKENS: CardDefinition[] = [
  // "A 3/3 blue Angel creature token with flying."
  {
    id: FRA_BLUE_ANGEL,
    name: 'Angel',
    manaCost: { generic: 0, colored: {} },
    colors: ['U'],
    types: ['Creature'],
    supertypes: [],
    subtypes: ['Angel'],
    power: 3,
    toughness: 3,
    keywords: ['flying'],
    abilities: [],
    isToken: true,
  },
];
