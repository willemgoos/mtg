import type { AbilityDef, EffectDef, SpellDef, TargetSpec } from '@mtg/engine';
import { combineSpells } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import {
  creature,
  draw,
  mana,
  onEnter,
  powerUp,
  spell,
  t0,
  t1,
  teamworkModes,
  theirCreature,
  yourCreature,
} from './helpers.ts';

// Marvel Super Heroes commons and uncommons that the draft trophy decks
// (BLOOMBURROW_TROPHY_DECKS' Marvel counterpart) play and no deck of ours did.

const when = (
  trigger: Extract<AbilityDef, { kind: 'triggered' }>['trigger'],
  targets: TargetSpec[],
  ...effects: EffectDef[]
): AbilityDef => ({ kind: 'triggered', trigger, targets, effects });

const graveyardCard = (filter: TargetSpec['filter'], optional = false): TargetSpec => ({
  what: 'graveyardCard',
  controller: 'you',
  filter,
  ...(optional ? { optional: true } : {}),
});

const treasure: EffectDef = { kind: 'createToken', token: 'treasure-token', count: 1 };
const yourArtifact: TargetSpec = {
  what: 'permanent',
  controller: 'you',
  filter: { types: ['Artifact'] },
};
const DAMAGE_CONTROL_TYPES = ['Artifact', 'Creature', 'Enchantment', 'Land'] as const;

/**
 * A Plan: each time it advances it gets a plan counter; at the fourth, it is
 * sacrificed and `finale` happens. `step` is what each advance does first.
 */
const planStep = (step: EffectDef[], finale: EffectDef[]): EffectDef[] => [
  ...step,
  { kind: 'namedCounters', name: 'plan', amount: 1, to: 'self' },
  {
    kind: 'if',
    condition: { kind: 'amountAtLeast', amount: { namedCountersOnSource: 'plan' }, min: 4 },
    then: [{ kind: 'sacrifice', what: 'self' }, ...finale],
  },
];

const returnFromGraveyard = (filter: TargetSpec['filter']): SpellDef => ({
  targets: [graveyardCard(filter)],
  effects: [{ kind: 'returnToHand', what: t0 }],
});

export const MSH_DRAFT: Record<string, Behavior> = {
  // ------------------------------------------------------------------ white
  'Night Nurse, Healer of Heroes': {
    abilities: [
      when(
        { on: 'etb' },
        [graveyardCard({ notTypes: ['Instant', 'Sorcery'], enteredThisTurn: true })],
        { kind: 'returnToHand', what: t0 },
      ),
    ],
  },
  'Quake, Agent of S.H.I.E.L.D.': {
    abilities: [
      when(
        { on: 'castSpell', filter: 'noncreature' },
        [{ what: 'permanent', filter: { types: ['Creature', 'Land'] } }],
        { kind: 'tap', what: t0 },
      ),
    ],
  },
  'S.H.I.E.L.D. Spy Kit': {
    abilities: [
      { kind: 'static', effect: { kind: 'attached', power: 1, toughness: 1 } },
      when(
        { on: 'equippedAttacks', alone: true },
        [],
        { kind: 'untap', what: 'attached' },
        { kind: 'scry', amount: 1 },
      ),
      {
        kind: 'activated',
        cost: { mana: mana('{1}') },
        sorcerySpeed: true,
        targets: [yourCreature],
        effects: [{ kind: 'attach', to: t0 }],
      },
    ],
  },
  'Colleen Wing, Street Samurai': {
    abilities: [
      when(
        { on: 'castSpell', filter: 'targetsYourCreature' },
        [],
        { kind: 'counters', to: 'self', amount: 1 },
        { kind: 'scry', amount: 1 },
      ),
    ],
  },
  'Political Triumph': {
    abilities: [
      when(
        { on: 'otherCreatureEtb', controller: 'you' },
        [],
        ...planStep(
          [{ kind: 'scry', amount: 1 }],
          [draw(1), { kind: 'counters', to: { each: 'creature', controller: 'you' }, amount: 1 }],
        ),
      ),
    ],
  },
  'Spider-Woman, Secret Agent': {
    abilities: [
      when(
        { on: 'etb' },
        [theirCreature],
        { kind: 'tap', what: t0 },
        { kind: 'doesntUntapWhileSource', what: t0 },
      ),
    ],
  },

  // ------------------------------------------------------------------- blue
  'Atlantis Attacks': teamworkModes(
    4,
    {
      targets: [{ what: 'player' }],
      effects: [{ kind: 'createToken', token: 'leviathan-token', count: 1, forControllerOf: 0 }],
    },
    {
      targets: [
        { what: 'permanent', filter: { nonland: true } },
        { what: 'permanent', filter: { nonland: true }, optional: true },
      ],
      effects: [
        { kind: 'bounce', what: t0 },
        { kind: 'bounce', what: t1 },
      ],
    },
  ),
  'Hydraulic Helper': {
    abilities: [{ kind: 'mana', cost: { tapSelf: true }, produces: 'U', onlyFor: 'Artifact' }],
  },
  'Shuri, Wakandan Inventor': {
    abilities: [
      {
        kind: 'static',
        effect: { kind: 'spellsCostLess', filter: { types: ['Artifact'] }, amount: 1 },
      },
      {
        kind: 'activated',
        cost: { mana: mana('{1}'), tapSelf: true },
        sorcerySpeed: true,
        targets: [yourArtifact, yourArtifact],
        effects: [{ kind: 'becomeCopy', what: t0, of: t1, notLegendary: true }],
        label: 'Copy an artifact',
      },
    ],
  },
  'I Am Iron Man': spell(
    [{ what: 'permanent', filter: { types: ['Artifact', 'Creature'] } }],
    {
      kind: 'pump',
      to: t0,
      power: 0,
      toughness: 0,
      keywords: ['flying'],
      basePT: [4, 4],
      becomesCreature: true,
    },
    draw(1),
  ),
  'Frozen in Ice': {
    enchant: creature,
    abilities: [
      onEnter({ kind: 'tap', what: 'attached' }),
      { kind: 'static', effect: { kind: 'attached', power: 0, toughness: 0, doesntUntap: true } },
      onEnter({ kind: 'loseAbilities', what: 'attached', whileSource: true }),
    ],
  },
  'Justice, Vance Astrovik': {
    abilities: [
      when(
        { on: 'etb' },
        [{ what: 'permanent', filter: { nonland: true, nontoken: true }, optional: true }],
        { kind: 'bounce', what: t0 },
      ),
      when({ on: 'yourPermanentReturnedToHand' }, [], {
        kind: 'counters',
        to: 'self',
        amount: 1,
      }),
    ],
  },
  'Attuma, Atlantean Warlord': {
    abilities: [
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
      when({ on: 'youAttack', filter: { subtype: 'Merfolk' } }, [], draw(1)),
    ],
  },
  'Kid Loki': {
    abilities: [
      // Counters put on them this turn by anyone count, not only yours.
      {
        kind: 'static',
        effect: {
          kind: 'anthem',
          affects: 'creaturesYouControl',
          filter: { countersPutThisTurn: true },
          power: 0,
          toughness: 0,
          keywords: ['hexproof'],
        },
      },
      when({ on: 'drawSecondCard' }, [], { kind: 'counters', to: 'self', amount: 1 }),
    ],
  },

  // ------------------------------------------------------------------ black
  'Decoy Ploy': {
    modes: [
      returnFromGraveyard({ subtype: 'Villain' }),
      returnFromGraveyard({ subtype: 'Hero' }),
      combineSpells([
        returnFromGraveyard({ subtype: 'Villain' }),
        returnFromGraveyard({ subtype: 'Hero' }),
      ]),
    ],
  },
  'Klaw, Sonic Subjugator': {
    // The opponent reveals the cards, picked for them (the cheapest); "target player" is always them.
    abilities: [
      when({ on: 'etb' }, [], {
        kind: 'chooseFromOpponentHand',
        reveal: { count: 'cardsInGraveyard', types: ['Creature'], plus: 1 },
        then: 'discard',
      }),
    ],
  },
  'Grim Reaper, Lethal Legionnaire': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'attacks' },
        cost: mana('{3}{B}'),
        targets: [graveyardCard({ types: ['Creature'] })],
        effects: [
          {
            kind: 'returnToBattlefield',
            what: t0,
            counter: 'finality',
            tapped: true,
            attacking: true,
          },
        ],
      },
    ],
  },
  'Titania, Rugged Rumbler': {
    // Ward is always {2} (never the discard).
    discardOrPay: mana('{2}'),
  },

  // -------------------------------------------------------------------- red
  'Loki Laufeyson': {
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{1}'), tapSelf: true },
        targets: [],
        effects: [
          {
            kind: 'emblem',
            until: 'nextSpellThisTurn',
            ability: {
              kind: 'triggered',
              // Mana value up to Loki's power as the spell is cast.
              trigger: {
                on: 'castSpell',
                filter: 'instantOrSorcery',
                spell: { maxManaValue: 'sourcePower' },
              },
              targets: [],
              effects: [{ kind: 'copySpell', what: 'subject', newTargets: true }],
            },
          },
        ],
      },
      powerUp('{4}{R}', { kind: 'counters', to: 'self', amount: 2 }),
    ],
  },
  'Stark Industries Executive': {
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{2}'), tapSelf: true },
        targets: [],
        effects: [treasure],
      },
    ],
  },
  'Misty Knight, Hero for Hire': {
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{2}'), tapSelf: true, discard: true },
        targets: [],
        // The discard paying for it counts.
        effects: [{ kind: 'draw', who: 'controller', amount: { count: 'cardsDiscardedThisTurn' } }],
      },
    ],
  },
  'Iron Fist, Living Weapon': {
    // The trigger marks that he has the tap ability this turn; the ability is there while it's marked.
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'castSpell', filter: 'targetsYourCreature' },
        targets: [],
        effects: [{ kind: 'noteResolution' }],
      },
      {
        kind: 'activated',
        cost: { tapSelf: true },
        condition: { kind: 'resolvedThisTurn', n: 1, orMore: true },
        targets: [{ what: 'any', filter: { other: true } }],
        effects: [{ kind: 'damage', amount: { powerOf: 'self' }, to: t0 }],
        label: 'Deal damage equal to his power',
      },
    ],
  },
  'Jessica Jones, Private Eye': {
    abilities: [
      {
        kind: 'activated',
        cost: { tapSelf: true },
        targets: [],
        effects: [
          { kind: 'namedCounters', name: 'stun', amount: 1, to: 'self' },
          { kind: 'exileTopPlayable', count: { powerOf: 'self' }, until: 'endOfTurn' },
        ],
      },
    ],
  },
  'Hawkeye, Young Avenger': {
    abilities: [
      {
        kind: 'static',
        effect: { kind: 'damageBonus', amount: 'sourcePower', noncombat: true, toOpponents: true },
      },
    ],
  },
  'Truck Toss': {
    costReductionIf: {
      condition: { kind: 'controlsPermanents', filter: { subtype: 'Vehicle' }, min: 1 },
      amount: 2,
    },
    spell: { targets: [{ what: 'any' }], effects: [{ kind: 'damage', amount: 4, to: t0 }] },
  },
  'Death to Our Enemies': {
    /**
     * "7 damage divided as you choose among one or two targets": with two, 6/1,
     * 5/2 or 4/3 (order the targets to choose which gets more).
     */
    abilities: [
      when(
        { on: 'castSpell', filter: 'noncreature' },
        [],
        ...planStep([{ kind: 'createToken', token: 'treasure-token', count: 1, tapped: true }], []),
      ),
      // "When you do": the reflexive trigger as it's sacrificed.
      when({ on: 'sacrificed' }, [{ what: 'any' }, { what: 'any', optional: true }], {
        kind: 'if',
        condition: { kind: 'targetChosen', target: 1 },
        then: [
          {
            kind: 'choose',
            options: ([6, 5, 4] as const).map((n) => ({
              label: `${n} damage to the first target, ${7 - n} to the second`,
              effects: [
                { kind: 'damage', amount: n, to: t0 },
                { kind: 'damage', amount: 7 - n, to: t1 },
              ],
            })),
          },
        ],
        else: [{ kind: 'damage', amount: 7, to: t0 }],
      }),
    ],
  },

  // ------------------------------------------------------------------ green
  'Doc Samson, Super Psychiatrist': {
    abilities: [
      { kind: 'static', effect: { kind: 'extraCounters', amount: 1 } },
      // X mana of any one colour (an activated ability rather than a mana ability).
      {
        kind: 'activated',
        cost: { tapSelf: true },
        targets: [],
        effects: [
          {
            kind: 'choose',
            options: (['W', 'U', 'B', 'R', 'G'] as const).map((c) => ({
              label: `Add {${c}} for each point of his power`,
              effects: [{ kind: 'addMana', mana: [[c]], count: { powerOf: 'self' } }],
            })),
          },
        ],
      },
    ],
  },
  // "Choose up to two" of four modes: each single mode, and each pair of different modes.
  'Call Damage Control': {
    modes: DAMAGE_CONTROL_TYPES.flatMap((a, i) => [
      { ...returnFromGraveyard({ types: [a] }), label: `${a} card` },
      ...DAMAGE_CONTROL_TYPES.slice(i + 1).map((b) => ({
        ...combineSpells([
          returnFromGraveyard({ types: [a] }),
          returnFromGraveyard({ types: [b] }),
        ]),
        label: `${a} card and ${b.toLowerCase()} card`,
      })),
    ]),
  },
  'Claim the Kingdom': {
    abilities: [
      when(
        { on: 'landfall' },
        [yourCreature],
        ...planStep([{ kind: 'counters', to: t0, amount: 1 }], []),
      ),
      // "When you do": the reflexive trigger as it's sacrificed.
      when({ on: 'sacrificed' }, [yourCreature], {
        kind: 'namedCounters',
        name: 'indestructible',
        amount: 1,
        to: t0,
      }),
    ],
  },
  'Reptil, Dinomorpher': {
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{3}') },
        targets: [],
        label: 'Brontosaurus',
        effects: [
          {
            kind: 'pump',
            to: 'self',
            power: 0,
            toughness: 0,
            basePT: [3, 5],
            keywords: ['reach', 'vigilance'],
          },
        ],
      },
      {
        kind: 'activated',
        cost: { mana: mana('{6}') },
        targets: [],
        label: 'Tyrannosaurus Rex',
        effects: [
          {
            kind: 'pump',
            to: 'self',
            power: 0,
            toughness: 0,
            basePT: [6, 6],
            keywords: ['trample'],
          },
        ],
      },
    ],
  },
  'Hellcat, Undying Vigilante': {
    abilities: [
      when({ on: 'dies' }, [], {
        kind: 'returnSource',
        to: 'battlefield',
        counters: 1,
        losesAbilitiesGains: ['haste'],
      }),
    ],
  },
  'Mister Hyde, Monster Within': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'beginningOfUpkeep', whose: 'yours' },
        targets: [],
        effects: [],
        modes: [
          { targets: [], effects: [{ kind: 'counters', to: 'self', amount: 1 }] },
          {
            // Removes a +1/+1 counter from himself.
            targets: [],
            effects: [
              {
                kind: 'if',
                condition: { kind: 'sourceCounters', min: 1 },
                then: [{ kind: 'counters', to: 'self', amount: -1 }, draw(1)],
              },
            ],
          },
        ],
      },
    ],
  },

  // ------------------------------------------------- multicolour and others
  'Viv Vision, Teen Synthezoid': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'attacks' },
        condition: { kind: 'sourcePowerAtLeast', min: 4 },
        targets: [],
        effects: [draw(1)],
      },
      powerUp('{7}', { kind: 'counters', to: 'self', amount: 2 }),
    ],
  },
  'Surveillance Room': {
    abilities: [
      onEnter({ kind: 'surveil', amount: 1 }),
      { kind: 'mana', cost: { tapSelf: true }, produces: 'C' },
      ...(['W', 'U', 'B', 'R', 'G'] as const).map((c): AbilityDef => ({
        kind: 'mana',
        cost: { tapSelf: true, mana: mana('{1}') },
        produces: c,
      })),
    ],
  },
};
