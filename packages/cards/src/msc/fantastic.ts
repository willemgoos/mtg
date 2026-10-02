import type {
  AbilityDef,
  Amount,
  CardFilter,
  EffectDef,
  Ref,
  SpellDef,
  TargetSpec,
} from '@mtg/engine';
import type { Behavior } from '../build.ts';
import { creature, draw, mana, onEnter, pump, t0, t1, when, yourCreature } from '../blb/helpers.ts';
import { COLORS, combos, equip, tapFor } from './helpers.ts';

/**
 * The Fantastic Four (W/U/R/G), the Marvel Commander precon led by Invisible
 * Woman (9d in docs/marvel-plan.md): noncreature spells, rebound, cascade,
 * discover and escalate.
 */

const self = 'self' as const;
const yours = { each: 'creature', controller: 'you' } as const;
const counters = (to: Ref, amount: Amount = 1): EffectDef => ({ kind: 'counters', to, amount });
const permanent = (filter: CardFilter, extra: Partial<TargetSpec> = {}): TargetSpec => ({
  what: 'permanent',
  filter,
  ...extra,
});
const noncreatureCast = { on: 'castSpell', filter: 'noncreature' } as const;
const fourColors = mana('{R}{G}{W}{U}');
/** "At the beginning of combat on your turn, if you've cast a noncreature spell this turn, ..." */
const ifNoncreatureAtCombat = (targets: TargetSpec[], ...effects: EffectDef[]): AbilityDef => ({
  kind: 'triggered',
  trigger: { on: 'beginningOfCombat', whose: 'yours' },
  condition: { kind: 'castNoncreatureThisTurn' },
  targets,
  effects,
});
const destroy: EffectDef = { kind: 'destroy', what: t0 };
const artifactOrEnchantment: CardFilter = { types: ['Artifact', 'Enchantment'] };
const mode = (label: string, targets: TargetSpec[], ...effects: EffectDef[]): SpellDef => ({
  label,
  targets,
  effects,
});

export const FANTASTIC: Record<string, Behavior> = {
  // ------------------------------------------------------------ commander
  'Invisible Woman': {
    abilities: [
      ifNoncreatureAtCombat([], { kind: 'createToken', token: 'wall-0-3-token', count: 1 }),
      when({ on: 'youAttack' }, [creature], {
        kind: 'may',
        cost: fourColors,
        effects: [
          {
            kind: 'pump',
            to: t0,
            power: { count: 'creaturesYouControl' },
            toughness: 0,
            cantBeBlocked: true,
          },
        ],
      }),
    ],
  },
  // ------------------------------------------------------------ creatures
  'Power Pack': {
    abilities: [
      when({ on: 'combatDamageToPlayer' }, [], {
        kind: 'exileRandomToCastNextUpkeep',
        filter: { types: ['Instant', 'Sorcery'] },
      }),
    ],
  },
  'Franklin Richards, Ascendant': {
    abilities: [ifNoncreatureAtCombat([], { kind: 'revealUntilCastable', max: 6, orHand: true })],
  },
  'Mister Fantastic, Reed Richards': {
    abilities: [
      {
        ...when({ on: 'otherPermanentEtb', filter: { token: true } }, [], {
          kind: 'may',
          effects: [draw(1)],
        }),
        batch: true,
      } as AbilityDef,
    ],
  },
  'Black Bolt, Inhuman King': {
    abilities: [
      when(noncreatureCast, [], pump(self, 2, 2)),
      when(
        { on: 'targetedByOpponent' },
        [permanent({ nonland: true }, { controller: 'opponent' })],
        destroy,
      ),
    ],
  },
  'Crystal, Inhuman Princess': {
    abilities: [
      when(noncreatureCast, [], {
        kind: 'damage',
        amount: { count: 'subjectColors' },
        to: 'eachOpponent',
      }),
      ...(['R', 'G', 'W', 'U'] as const).map((c) => tapFor(c)),
    ],
  },
  'Willie Lumpkin, Postman': {
    abilities: [
      { kind: 'static', effect: { kind: 'cantBeBlocked' } },
      // "That player may draw a card": they never take it (a simplification).
      when({ on: 'combatDamageToPlayer' }, [], draw(1)),
    ],
  },
  'Council of Reeds': {
    abilities: [
      { kind: 'static', effect: { kind: 'noLegendRule' } },
      ifNoncreatureAtCombat([], { kind: 'tokenCopy', of: self }),
    ],
  },
  'Human Torch': {
    // "Each other opponent": nothing in a 1v1 game.
    abilities: [ifNoncreatureAtCombat([], pump(self, 0, 0, ['flying', 'doubleStrike', 'haste']))],
  },
  'Medusa, Inhuman Queen': {
    abilities: [when({ ...noncreatureCast, caster: 'any' }, [], counters(self))],
  },
  'Galactus, Devourer of Worlds': {
    abilities: [
      when({ on: 'etb' }, [permanent({})], { kind: 'exile', what: t0 }),
      {
        kind: 'static',
        effect: {
          kind: 'attacksEachCombat',
          condition: {
            kind: 'not',
            condition: {
              kind: 'controlsCreature',
              filter: { named: 'silver-surfer-galactuss-herald' },
            },
          },
        },
      },
    ],
  },
  'Alicia Masters, Skilled Sculptor': {
    abilities: [
      ifNoncreatureAtCombat([], { kind: 'createToken', token: 'treasure-token', count: 1 }),
      when({ on: 'beginningOfEndStep', whose: 'yours' }, [], { kind: 'ownersRegainControl' }),
    ],
  },
  'The Thing': {
    abilities: [
      ifNoncreatureAtCombat([], counters(self, 4)),
      // "Double the counters on any number of target permanents": its own +1/+1 counters (a simplification).
      when({ on: 'attacks' }, [], {
        kind: 'may',
        cost: fourColors,
        effects: [counters(self, { countersOn: self })],
      }),
    ],
  },
  'Dragon Man, Reformed Robot': {
    powerEquals: { count: 'greatestNoncreatureManaValue' },
    castFromGraveyardWithDiscard: true,
  },
  'Valeria Richards, Precocious': {
    abilities: [
      {
        kind: 'static',
        effect: { kind: 'spellsCostLess', filter: { notTypes: ['Creature'] }, amount: 1 },
      },
      when({ on: 'castSpell', filter: 'firstNoncreature' }, [], draw(1)),
    ],
  },
  'H.E.R.B.I.E., Lovable Robot': {
    abilities: [
      ifNoncreatureAtCombat([], { kind: 'surveil', amount: 1 }),
      tapFor('C'),
      {
        kind: 'activated',
        cost: { mana: mana('{1}'), tapSelf: true },
        targets: [],
        effects: [{ kind: 'addMana', mana: [[...COLORS]] }],
        label: '{1}, {T}: one mana of any color',
      },
    ],
  },
  'Mister Fantastic': {
    abilities: [
      ifNoncreatureAtCombat([], draw(1)),
      {
        kind: 'activated',
        cost: { mana: fourColors, tapSelf: true },
        targets: [],
        // "Copy target triggered ability you control twice": the top one (a simplification).
        effects: [{ kind: 'copyTopTrigger', count: 2 }],
      },
    ],
  },
  "Silver Surfer, Galactus's Herald": {
    abilities: [
      onEnter({
        kind: 'searchLibrary',
        filter: { named: 'galactus-devourer-of-worlds' },
        to: 'hand',
      }),
      when({ on: 'combatDamageToPlayer' }, [creature], { kind: 'mustAttack', what: t0 }),
    ],
  },
  'Namor, Atlantean King': {
    abilities: [
      when(noncreatureCast, [], { kind: 'createToken', token: 'merfolk-token', count: 1 }),
      {
        ...when(
          { on: 'attacks' },
          [],
          pump(
            { each: 'creature', controller: 'you', filter: { attacking: true, other: true } },
            2,
            0,
          ),
        ),
        condition: { kind: 'opponentHasMore', what: 'life' },
      } as AbilityDef,
    ],
  },
  'Lockjaw, Slobbering Teleporter': {
    abilities: [
      ifNoncreatureAtCombat(
        [{ ...yourCreature, filter: { other: true }, optional: true }],
        counters(self),
        { kind: 'pump', to: self, power: 0, toughness: 0, cantBeBlocked: true },
        { kind: 'pump', to: t0, power: 0, toughness: 0, cantBeBlocked: true },
      ),
    ],
  },
  // ------------------------------------------------------------ artifacts
  'Lightning Greaves': {
    abilities: [
      {
        kind: 'static',
        effect: { kind: 'attached', power: 0, toughness: 0, keywords: ['haste', 'shroud'] },
      },
      equip('{0}'),
    ],
  },
  'Chromatic Lantern': {
    abilities: [
      { kind: 'static', effect: { kind: 'landsTapForAnyColor' } },
      ...COLORS.map((c) => tapFor(c)),
    ],
  },
  'Mirage Mirror': {
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{2}') },
        targets: [permanent({ types: ['Artifact', 'Creature', 'Enchantment', 'Land'] }, {})],
        effects: [{ kind: 'becomeCopy', of: t0 }],
      },
    ],
  },
  'Negative Zone Portal': {
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{2}'), tapSelf: true },
        targets: [{ what: 'graveyardCard', controller: 'opponent' }],
        effects: [{ kind: 'exileGraveyardCard', what: t0, track: true, ifCreature: [draw(1)] }],
      },
      when({ on: 'beginningOfUpkeep', whose: 'yours' }, [], { kind: 'negativeZoneFlip' }),
    ],
  },
  'Unstable Molecule Suit': {
    abilities: [
      {
        kind: 'static',
        effect: { kind: 'attached', power: 2, toughness: 2, keywords: ['indestructible'] },
      },
      equip('{2}', { commander: true }, 'Equip commander {2}'),
      equip('{4}'),
    ],
  },
  'The Fantasticar': {
    abilities: [
      when(noncreatureCast, [], {
        kind: 'may',
        effects: [{ kind: 'becomeCreature', what: self }],
      }),
      when({ on: 'castSpell', filter: 'fourthNoncreature' }, [], {
        kind: 'may',
        effects: [
          { kind: 'sacrifice', what: self },
          { kind: 'createToken', token: 'construct-4-4-token', count: 4 },
        ],
      }),
    ],
  },
  // ------------------------------------------------------------ enchantments
  'Whirlwind of Thought': { abilities: [when(noncreatureCast, [], draw(1))] },
  'Annie Joins Up': {
    abilities: [
      when(
        { on: 'etb' },
        [permanent({ types: ['Creature', 'Planeswalker'] }, { controller: 'opponent' })],
        { kind: 'damage', amount: 5, to: t0 },
      ),
      { kind: 'static', effect: { kind: 'legendaryTriggersTwice' } },
    ],
  },
  'Path of Discovery': {
    abilities: [
      when({ on: 'otherCreatureEtb', controller: 'you' }, [], { kind: 'explore', what: 'subject' }),
    ],
  },
  'Monologue Tax': {
    abilities: [
      when({ on: 'anyPlayerSecondSpell', opponentOnly: true }, [], {
        kind: 'createToken',
        token: 'treasure-token',
        count: 1,
      }),
    ],
  },
  "Mind's Dilation": {
    abilities: [
      when(
        { on: 'castSpell', filter: 'first', caster: 'opponent' },
        [],
        { kind: 'exileTopWithSource', count: 1, who: 'eachOpponent' },
        { kind: 'castFree', what: self, from: 'lastExiledWithSource' },
      ),
    ],
  },
  'Cosmic Crucible': {
    abilities: [
      when({ on: 'beginningOfMain', which: 1 }, [], {
        kind: 'addMana',
        mana: [[...COLORS]],
        count: 4,
      }),
      {
        ...when(noncreatureCast, [], {
          kind: 'may',
          effects: [{ kind: 'copySpell', what: 'subject', retarget: true }],
        }),
        oncePerTurn: true,
      } as AbilityDef,
    ],
  },
  // ------------------------------------------------------------ instants and sorceries
  'Deep Analysis': {
    flashback: mana('{1}{U}'),
    flashbackLife: 3,
    spell: {
      targets: [{ what: 'player' }],
      effects: [{ kind: 'draw', who: t0, amount: 2 }],
    },
  },
  'Path to Exile': {
    spell: {
      targets: [creature],
      effects: [
        { kind: 'exile', what: t0 },
        { kind: 'searchLibrary', filter: 'basicLand', to: 'battlefieldTapped', forControllerOf: 0 },
      ],
    },
  },
  'Quantum Misalignment': {
    rebound: true,
    spell: {
      targets: [yourCreature],
      effects: [{ kind: 'tokenCopy', of: t0, notLegendary: true }],
    },
  },
  'Expressive Iteration': { spell: { targets: [], effects: [{ kind: 'expressiveIteration' }] } },
  Farseek: {
    spell: {
      targets: [],
      effects: [
        {
          kind: 'searchLibrary',
          filter: { subtypes: ['Plains', 'Island', 'Swamp', 'Mountain'] },
          to: 'battlefieldTapped',
        },
      ],
    },
  },
  Cultivate: {
    spell: {
      targets: [],
      effects: [
        { kind: 'searchLibrary', filter: 'basicLand', to: 'battlefieldTapped' },
        { kind: 'searchLibrary', filter: 'basicLand', to: 'hand' },
      ],
    },
  },
  'Three Visits': {
    spell: {
      targets: [],
      effects: [{ kind: 'searchLibrary', filter: { subtype: 'Forest' }, to: 'battlefield' }],
    },
  },
  'Cut a Deal': {
    spell: {
      targets: [],
      effects: [{ kind: 'draw', who: 'eachOpponent', amount: 1 }, draw(1)],
    },
  },
  'Genesis Ultimatum': {
    afterResolving: 'exile',
    spell: { targets: [], effects: [{ kind: 'lookPutPermanents', count: 5 }] },
  },
  'Seize the Day': {
    flashback: mana('{2}{R}'),
    spell: { targets: [creature], effects: [{ kind: 'untap', what: t0 }, { kind: 'extraCombat' }] },
  },
  'Cleansing Nova': {
    modes: [
      mode('Destroy all creatures', [], { kind: 'destroyAll' }),
      mode('Destroy all artifacts and enchantments', [], {
        kind: 'destroyAll',
        permanents: true,
        filter: artifactOrEnchantment,
      }),
    ],
  },
  Terramorph: {
    rebound: true,
    spell: {
      targets: [],
      effects: [{ kind: 'searchLibrary', filter: 'basicLand', to: 'battlefield' }],
    },
  },
  'Hull Breach': {
    modes: [
      mode('Destroy target artifact', [permanent({ types: ['Artifact'] })], destroy),
      mode('Destroy target enchantment', [permanent({ types: ['Enchantment'] })], destroy),
      mode(
        'Destroy target artifact and target enchantment',
        [permanent({ types: ['Artifact'] }), permanent({ types: ['Enchantment'] })],
        destroy,
        { kind: 'destroy', what: t1 },
      ),
    ],
  },
  'Tragic Arrogance': { spell: { targets: [], effects: [{ kind: 'keepOneOfEachType' }] } },
  'Nova Flame': {
    spell: {
      targets: [yourCreature],
      effects: [
        { kind: 'counters', to: t0, amount: { x: true } },
        {
          kind: 'damage',
          amount: { powerOf: t0 },
          from: t0,
          to: { each: 'creature' },
          exceptFrom: true,
        },
      ],
    },
  },
  'First Family': {
    spell: {
      targets: [],
      effects: [
        { kind: 'draw', who: 'controller', amount: { count: 'colorsAmongPermanentsAndSpells' } },
        {
          kind: 'gainLife',
          who: 'controller',
          amount: { count: 'colorsAmongPermanentsAndSpells' },
        },
      ],
    },
  },
  'Taunt from the Rampart': {
    spell: {
      targets: [],
      effects: [
        {
          kind: 'mustAttack',
          what: { each: 'creature', controller: 'opponent' },
          cantBlock: true,
        },
      ],
    },
  },
  'Bovine Intervention': {
    spell: {
      targets: [permanent({ types: ['Artifact', 'Creature'] })],
      effects: [destroy, { kind: 'createToken', token: 'ox-token', count: 1, forControllerOf: 0 }],
    },
  },
  'Promise of Loyalty': { spell: { targets: [], effects: [{ kind: 'promiseOfLoyalty' }] } },
  "It's Clobberin' Time!": {
    rebound: true,
    modes: [
      mode(
        'Your creature deals damage equal to its power to their creature',
        [yourCreature, { what: 'creature', controller: 'opponent' }],
        { kind: 'damage', amount: { powerOf: t0 }, from: t0, to: t1 },
      ),
      mode('Destroy target artifact or enchantment', [permanent(artifactOrEnchantment)], destroy),
    ],
  },
  'Invisible Force Field': {
    rebound: true,
    // "Up to four target permanents you control": every creature you control, untargeted (a
    // simplification: thousands of target combinations are too many for the bots to weigh).
    spell: {
      targets: [],
      effects: [pump(yours, 0, 0, ['indestructible'])],
    },
  },
  'Fantastic Elasticity': {
    rebound: true,
    modes: [
      mode('Return target nonland permanent to its owner’s hand', [permanent({ nonland: true })], {
        kind: 'bounce',
        what: t0,
      }),
      mode(
        'Return target instant or sorcery card from your graveyard to your hand',
        [{ what: 'graveyardCard', controller: 'you', filter: { types: ['Instant', 'Sorcery'] } }],
        { kind: 'returnToHand', what: t0 },
      ),
    ],
  },
  'Collective Effort': {
    // Escalate: tap an untapped creature for each mode beyond the first.
    modes: combos(
      [
        mode(
          'Destroy target creature with power 4 or greater',
          [{ what: 'creature', filter: { minPower: 4 } }],
          destroy,
        ),
        mode('Destroy target enchantment', [permanent({ types: ['Enchantment'] })], destroy),
        mode('A +1/+1 counter on each creature target player controls', [{ what: 'player' }], {
          kind: 'counters',
          to: { each: 'creature', controller: 'you' },
          amount: 1,
        }),
      ],
      [1, 2, 3],
    ).map((m) => ({ ...m, escalate: (m.label?.split(' + ').length ?? 1) - 1 })),
  },
  'Clever Concealment': {
    convoke: true,
    // "Any number of target nonland permanents you control": all of them (a simplification).
    spell: {
      targets: [],
      effects: [
        {
          kind: 'phaseOut',
          what: { each: 'permanent', controller: 'you', filter: { nonland: true } },
        },
      ],
    },
  },
  'Ultimate Nullification': {
    sacrificeCreatureToCast: true,
    sacrificeToCastFilter: { supertypes: ['Legendary'] },
    afterResolving: 'libraryBottom',
    spell: {
      targets: [],
      effects: [
        { kind: 'exile', what: { each: 'creature' } },
        { kind: 'exileGraveyard', who: 'eachPlayer' },
      ],
    },
  },
  'Galvanic Iteration': {
    flashback: mana('{1}{U}{R}'),
    spell: {
      targets: [],
      effects: [
        {
          kind: 'emblem',
          until: 'nextSpellThisTurn',
          ability: {
            kind: 'triggered',
            trigger: { on: 'castSpell', filter: 'instantOrSorcery' },
            targets: [],
            effects: [{ kind: 'copySpell', what: 'subject', retarget: true }],
          },
        },
      ],
    },
  },
  'Recurring Insight': {
    rebound: true,
    spell: {
      targets: [],
      effects: [{ kind: 'draw', who: 'controller', amount: { count: 'opponentHandSize' } }],
    },
  },
  'Into the Time Vortex': {
    rebound: true,
    spell: { targets: [], effects: [] },
    abilities: [
      // Cascade: "When you cast this spell, ...".
      when({ on: 'castSelf' }, [], { kind: 'revealUntilCastable', max: 'belowSource' }),
    ],
  },
  'Flame On!': {
    rebound: true,
    spell: {
      targets: [creature],
      effects: [
        {
          kind: 'counters',
          to: t0,
          amount: {
            count: 'cardsInGraveyard',
            types: ['Instant', 'Sorcery', 'Artifact', 'Enchantment', 'Planeswalker'],
          },
        },
        pump(t0, 0, 0, ['flying']),
      ],
    },
  },
  // ------------------------------------------------------------ lands
  'Baxter Building': {
    abilities: [
      tapFor('C'),
      {
        kind: 'activated',
        cost: { mana: mana('{4}'), tapSelf: true },
        targets: [],
        effects: [{ kind: 'addMana', mana: [[...COLORS]], count: 4 }],
        label: '{4}, {T}: four mana in any colors',
      },
      {
        kind: 'activated',
        cost: { mana: mana('{4}'), tapSelf: true },
        condition: { kind: 'controlsCreature', filter: { minToughness: 4 } },
        targets: [],
        effects: [draw(1)],
      },
    ],
  },
};
