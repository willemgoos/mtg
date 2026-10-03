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
    // "Target player creates" a Leviathan: always you.
    { targets: [], effects: [{ kind: 'createToken', token: 'leviathan-token', count: 1 }] },
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
    // Her copy ability isn't modelled; artifact spells cost {1} less.
    abilities: [
      {
        kind: 'static',
        effect: { kind: 'spellsCostLess', filter: { types: ['Artifact'] }, amount: 1 },
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
      // Creatures only: "another nonland permanent you control is returned to its owner's hand".
      when({ on: 'leavesWithoutDying', who: 'other' }, [], {
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
    // Hexproof for creatures you put +1/+1 counters on this turn isn't modelled.
    abilities: [when({ on: 'drawSecondCard' }, [], { kind: 'counters', to: 'self', amount: 1 })],
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
    // You see their whole hand rather than the cards they reveal.
    abilities: [
      when({ on: 'etb' }, [], {
        kind: 'chooseFromOpponentHand',
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
          },
        ],
      },
    ],
  },
  'Titania, Rugged Rumbler': {
    // The additional cost is always the discard, and ward is always {2}.
    discardToCast: true,
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
              // Mana value up to his printed power, 2 (not raised by counters).
              trigger: { on: 'castSpell', filter: 'instantOrSorcery', spell: { maxManaValue: 2 } },
              targets: [],
              effects: [{ kind: 'copySpell', what: 'subject', retarget: true }],
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
    // Draws one card: the discard paying for it (earlier discards this turn don't count).
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{2}'), tapSelf: true, discard: true },
        targets: [],
        effects: [draw(1)],
      },
    ],
  },
  'Iron Fist, Living Weapon': {
    // Deals the damage straight away (tapping him) instead of granting a tap ability.
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'castSpell', filter: 'targetsYourCreature' },
        condition: { kind: 'not', condition: { kind: 'sourceTapped' } },
        targets: [{ what: 'any', filter: { other: true }, optional: true }],
        effects: [
          { kind: 'tap', what: 'self' },
          { kind: 'damage', amount: { powerOf: 'self' }, to: t0 },
        ],
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
    // The target for the 7 damage is chosen as each spell triggers it, and takes all 7.
    abilities: [
      when(
        { on: 'castSpell', filter: 'noncreature' },
        [{ what: 'any', optional: true }],
        ...planStep(
          [{ kind: 'createToken', token: 'treasure-token', count: 1, tapped: true }],
          [{ kind: 'damage', amount: 7, to: t0 }],
        ),
      ),
    ],
  },

  // ------------------------------------------------------------------ green
  'Doc Samson, Super Psychiatrist': {
    abilities: [
      { kind: 'static', effect: { kind: 'extraCounters', amount: 1 } },
      // X mana of one colour: green only.
      {
        kind: 'activated',
        cost: { tapSelf: true },
        targets: [],
        effects: [{ kind: 'addMana', mana: [['G']], count: { powerOf: 'self' } }],
      },
    ],
  },
  'Call Damage Control': spell(
    // Up to two permanent cards; that they are of different types isn't enforced.
    [
      graveyardCard({ notTypes: ['Instant', 'Sorcery'] }, true),
      graveyardCard({ notTypes: ['Instant', 'Sorcery'] }, true),
    ],
    { kind: 'returnToHand', what: t0 },
    { kind: 'returnToHand', what: t1 },
  ),
  'Claim the Kingdom': {
    abilities: [
      when(
        { on: 'landfall' },
        [yourCreature],
        ...planStep(
          [{ kind: 'counters', to: t0, amount: 1 }],
          // The indestructible counter goes on the same creature.
          [{ kind: 'namedCounters', name: 'indestructible', amount: 1, to: t0 }],
        ),
      ),
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
    // She comes back with a counter and haste; losing her abilities isn't modelled.
    abilities: [when({ on: 'dies' }, [], { kind: 'returnSource', to: 'battlefield', counters: 1 })],
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
