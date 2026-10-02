import type { AbilityDef, Amount, CardFilter, EffectDef, Ref, TargetSpec } from '@mtg/engine';
import type { Behavior } from '../build.ts';
import { creature, draw, mana, onEnter, pump, t0, when, yourCreature } from '../blb/helpers.ts';
import { COLORS, combos, tapFor } from './helpers.ts';

/**
 * Doom Prevails (U/B/R), the Marvel Commander precon led by Doctor Doom, King
 * of Latveria (9e in docs/marvel-plan.md): Villains, discard, goad, mayhem,
 * unearth, multikicker, overload, melee, sagas and suspend. The connive cards
 * wait for connive (Stream B).
 */

const self = 'self' as const;
const villain: CardFilter = { subtype: 'Villain' };
const commander: CardFilter = { commander: true };
const artifact: CardFilter = { types: ['Artifact'] };
const counters = (to: Ref, amount: Amount = 1): EffectDef => ({ kind: 'counters', to, amount });
const permanent = (filter: CardFilter, extra: Partial<TargetSpec> = {}): TargetSpec => ({
  what: 'permanent',
  filter,
  ...extra,
});
const theirCreature = (optional = false): TargetSpec => ({
  what: 'creature',
  controller: 'opponent',
  ...(optional ? { optional: true } : {}),
});
const destroy: EffectDef = { kind: 'destroy', what: t0 };
const token = (id: string, count: Amount = 1): EffectDef => ({
  kind: 'createToken',
  token: id,
  count,
});
const loseLife = (amount: number): EffectDef => ({ kind: 'loseLife', who: 'controller', amount });
const villainSpellsCostLess: AbilityDef = {
  kind: 'static',
  effect: { kind: 'spellsCostLess', filter: villain, amount: 1 },
};
const enterOrAttack = (...effects: EffectDef[]): AbilityDef[] => [
  onEnter(...effects),
  when({ on: 'attacks' }, [], ...effects),
];
const chapter = (chapters: number[], targets: TargetSpec[], ...effects: EffectDef[]): AbilityDef =>
  when({ on: 'chapter', chapters }, targets, ...effects);

export const DOOM: Record<string, Behavior> = {
  // ------------------------------------------------------------ creatures
  'The Squadron Sinister': {
    mayhem: mana('{3}{U}{R}'),
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'anthem',
          affects: 'otherCreaturesYouControl',
          filter: villain,
          power: 2,
          toughness: 2,
          keywords: ['flying', 'haste'],
        },
      },
    ],
  },
  'Containment Construct': {
    abilities: [
      when({ on: 'youDiscard' }, [], {
        kind: 'may',
        effects: [{ kind: 'exileDiscarded', playable: true }],
      }),
    ],
  },
  'Tombstone, Career Criminal': {
    abilities: [
      when({ on: 'etb' }, [{ what: 'graveyardCard', controller: 'you', filter: villain }], {
        kind: 'returnToHand',
        what: t0,
      }),
      villainSpellsCostLess,
    ],
  },
  'Spark Double': {
    entersAsCopy: { yours: true, counter: true, notLegendary: true },
  },
  'Killmonger, Ruthless Usurper': {
    abilities: [
      when(
        { on: 'attacks' },
        [],
        pump(self, { count: 'permanentsOpponentsControl', filter: artifact }, 0),
      ),
      when(
        { on: 'combatDamageToPlayer' },
        [],
        { kind: 'opponentSacrifices', filter: artifact },
        token('treasure-token'),
      ),
    ],
  },
  'Chameleon, Master of Disguise': {
    // "Except his name is Chameleon": it isn't the legendary card it copies.
    entersAsCopy: { yours: true, notLegendary: true },
    mayhem: mana('{2}{U}'),
  },
  'Helmut Zemo, Mastermind': {
    abilities: [
      when(
        { on: 'attacks' },
        [
          {
            what: 'graveyardCard',
            controller: 'you',
            filter: { types: ['Instant', 'Sorcery'], maxManaValue: 'sourcePower' },
          },
        ],
        // Cast free (a simplification: it's paid for), and the counter comes either way.
        { kind: 'castFree', what: t0, exileAfter: true },
        counters(self),
      ),
    ],
  },
  'Superior Foes of Spider-Man': {
    abilities: [
      when({ on: 'castSpell', filter: 'any', spell: { minManaValue: 4 } }, [], {
        kind: 'may',
        effects: [{ kind: 'exileTopPlayableUntilNext' }],
      }),
    ],
  },
  'Titania, Proud Pummeler': {
    abilities: [
      // Melee for each creature you control (Titania included): +1/+1 as it attacks the one opponent.
      when({ on: 'creatureYouControlAttacks' }, [], pump('subject', 1, 1)),
    ],
  },
  'Red Ghost, Intangible Genius': {
    abilities: [
      { kind: 'static', effect: { kind: 'cantBeBlocked' } },
      when({ on: 'drawSecondCard' }, [], token('ape-villain-token')),
    ],
  },
  'Molecule Man': {
    abilities: [{ kind: 'static', effect: { kind: 'miracleZero' } }],
  },
  'The Frightful Four': {
    abilities: [
      when({ on: 'castSpell', filter: 'firstNoncreature', caster: 'opponent' }, [], {
        kind: 'loseLife',
        who: 'eachOpponent',
        amount: { event: 'amount' },
      }),
    ],
  },
  'Lady Loki, Agent of Chaos': {
    abilities: [
      when({ on: 'castSpell', filter: 'firstInstantSorceryOrVillain' }, [], { kind: 'ladyLoki' }),
    ],
  },
  'Titan of Littjara': {
    abilities: [
      onEnter(
        { kind: 'chooseCreatureType' },
        { kind: 'custom', handler: 'addChosenSubtype' },
        {
          kind: 'may',
          effects: [
            {
              kind: 'draw',
              who: 'controller',
              amount: { count: 'creaturesOfChosenType', other: true },
            },
            { kind: 'discard', count: 1 },
          ],
        },
      ),
      when({ on: 'attacks' }, [], {
        kind: 'may',
        effects: [
          {
            kind: 'draw',
            who: 'controller',
            amount: { count: 'creaturesOfChosenType', other: true },
          },
          { kind: 'discard', count: 1 },
        ],
      }),
    ],
  },
  'Abomination, World Ravager': { mayhem: mana('{4}{R}') },
  'Living Laser': {
    abilities: [
      when({ on: 'attacks' }, [], {
        kind: 'tokenCopy',
        of: self,
        count: { count: 'cardsDiscardedThisTurn' },
        notLegendary: true,
        attacking: true,
        exileAtEndStep: true,
      }),
    ],
  },
  'Klaw, Master of Sound': {
    abilities: [
      when(
        { on: 'castSpell', filter: 'any', fromExile: true },
        [],
        pump(self, 0, 0, ['indestructible']),
      ),
      when({ on: 'combatDamageToPlayer' }, [], {
        kind: 'exileTopWithSource',
        count: 1,
        who: 'eachOpponent',
        castable: true,
      }),
    ],
  },
  'Typhoid Mary, Fractured': {
    abilities: [
      {
        // "Choose one at random": you choose (a simplification).
        kind: 'triggered',
        trigger: { on: 'attacks' },
        targets: [],
        effects: [],
        modes: [
          { label: 'Mary: a Treasure', targets: [], effects: [token('treasure-token')] },
          { label: 'Typhoid Mary: draw a card', targets: [], effects: [draw(1)] },
          {
            label: 'Bloody Mary: drain 2',
            targets: [],
            effects: [
              { kind: 'loseLife', who: 'eachOpponent', amount: 2 },
              { kind: 'gainLife', who: 'controller', amount: 2 },
            ],
          },
        ],
      },
    ],
  },
  'Stilt-Man, Towering Terror': {
    abilities: [
      {
        ...when(
          { on: 'creaturesYouControlDealCombatDamageToPlayer', filter: villain },
          [permanent({ nonland: true, notTypes: ['Creature'] }, { controller: 'opponent' })],
          { kind: 'gainControl', what: t0, untilYourNextTurn: true },
        ),
        batch: true,
      } as AbilityDef,
    ],
  },
  'Kang Prime': {
    abilities: enterOrAttack({ kind: 'suspend', what: 'nextNonlandFromLibrary', time: 2 }),
  },
  'Loki, the Deceiver': {
    abilities: [
      when(
        { on: 'attacks' },
        [{ what: 'creature', controller: 'you', filter: { ...villain, other: true } }],
        {
          kind: 'tokenCopy',
          of: t0,
          notLegendary: true,
          attacking: true,
          addSubtype: 'Illusion',
          exileAtEndStep: true,
        },
      ),
      {
        ...when(
          { on: 'creaturesYouControlDealCombatDamageToPlayer', filter: villain },
          [],
          draw(1),
        ),
        batch: true,
      } as AbilityDef,
    ],
  },
  'Tri-Sentinel, Act of Vengeance': {
    abilities: [
      when({ on: 'etb' }, [theirCreature(true)], { kind: 'damage', amount: 3, to: t0 }),
      {
        // Unearth {7}.
        kind: 'activated',
        cost: { mana: mana('{7}') },
        fromGraveyard: true,
        sorcerySpeed: true,
        targets: [],
        effects: [{ kind: 'unearth' }],
        label: 'Unearth {7}',
      },
    ],
  },
  'Puppet Master, String Puller': {
    // "Whenever goaded creatures deal combat damage to one of your opponents": never in 1v1.
    abilities: [
      when({ on: 'youAttack' }, [theirCreature()], {
        kind: 'mustAttack',
        what: t0,
        cantBlock: true,
      }),
    ],
  },
  'Batroc the Leaper': {
    multikicker: mana('{2}'),
    abilities: [
      // "Each of up to X targets": up to two here (a simplification).
      {
        ...when({ on: 'etb' }, [{ what: 'any', optional: true }], {
          kind: 'damage',
          amount: { powerOf: self },
          to: t0,
        }),
        condition: { kind: 'kickedAtLeast', n: 1 },
      } as AbilityDef,
      {
        ...when({ on: 'etb' }, [{ what: 'any', optional: true }], {
          kind: 'damage',
          amount: { powerOf: self },
          to: t0,
        }),
        condition: { kind: 'kickedAtLeast', n: 2 },
      } as AbilityDef,
    ],
  },
  // ------------------------------------------------------------ artifacts and vehicles
  Skullclamp: {
    abilities: [
      { kind: 'static', effect: { kind: 'attached', power: 1, toughness: -1 } },
      when({ on: 'attachedDies' }, [], draw(2)),
      {
        kind: 'activated',
        cost: { mana: mana('{1}') },
        sorcerySpeed: true,
        targets: [yourCreature],
        effects: [{ kind: 'attach', to: t0 }],
      },
    ],
  },
  'Currency Converter': {
    abilities: [
      when({ on: 'youDiscard' }, [], {
        kind: 'may',
        effects: [{ kind: 'exileDiscarded', track: true }],
      }),
      {
        kind: 'activated',
        cost: { mana: mana('{2}'), tapSelf: true },
        targets: [],
        effects: [draw(1), { kind: 'discard', count: 1 }],
      },
      {
        kind: 'activated',
        cost: { tapSelf: true },
        condition: { kind: 'sourceHasExiled' },
        targets: [],
        effects: [{ kind: 'converterReturn' }],
      },
    ],
  },
  "Progenitor's Icon": {
    abilities: [
      onEnter({ kind: 'chooseCreatureType' }),
      ...COLORS.map((c) => tapFor(c)),
      {
        kind: 'activated',
        cost: { tapSelf: true },
        targets: [],
        effects: [{ kind: 'flashForChosenType' }],
        label: 'Flash for the chosen type this turn',
      },
    ],
  },
  "Loki's Scepter": {
    abilities: [
      when(
        { on: 'etb' },
        [creature],
        { kind: 'gainControl', what: t0 },
        { kind: 'untap', what: t0 },
        pump(t0, 0, 0, ['haste']),
      ),
      ...COLORS.map((c) => tapFor(c)),
    ],
  },
  "Doom's Time Platform": {
    abilities: [
      when(
        { on: 'youAttack' },
        [{ what: 'graveyardCard', controller: 'you', filter: { nonland: true } }],
        { kind: 'suspend', what: t0, time: 2 },
      ),
    ],
  },
  'Damocles Base, Sword of Kang': {
    abilities: [
      when({ on: 'combatDamageToPlayer' }, [], {
        kind: 'choose',
        opponent: true,
        options: [
          {
            label: 'Sacrifice a nontoken creature',
            effects: [{ kind: 'opponentSacrifices', filter: { nontoken: true } }],
          },
          {
            label: 'Lose 2 life; they draw two cards',
            effects: [{ kind: 'loseLife', who: 'eachOpponent', amount: 2 }, draw(2)],
          },
        ],
      }),
      {
        kind: 'activated',
        cost: { crew: 3 },
        targets: [],
        effects: [{ kind: 'becomeCreature', what: self }],
        label: 'Crew 3',
      },
    ],
  },
  // ------------------------------------------------------------ enchantments
  Propaganda: { abilities: [{ kind: 'static', effect: { kind: 'attackTax', amount: 2 } }] },
  Archnemesis: {
    // "Enchant opponent": it sits on the battlefield; in 1v1 it's always on the one opponent.
    enchantPlayer: true,
    abilities: [
      when({ on: 'youAttack' }, [], { kind: 'loseLife', who: 'eachOpponent', amount: 2 }, draw(1), {
        kind: 'gainLife',
        who: 'controller',
        amount: 2,
      }),
    ],
  },
  'Black Market Connections': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'beginningOfMain', which: 1 },
        targets: [],
        effects: [],
        modes: combos(
          [
            {
              label: 'Sell Contraband',
              targets: [],
              effects: [token('treasure-token'), loseLife(1)],
            },
            { label: 'Buy Information', targets: [], effects: [draw(1), loseLife(2)] },
            {
              label: 'Hire a Mercenary',
              targets: [],
              effects: [token('shapeshifter-3-2-token'), loseLife(3)],
            },
          ],
          [1, 2, 3],
        ),
      },
    ],
  },
  'Age of Ultron': {
    saga: 3,
    abilities: [
      chapter([1], [{ ...theirCreature(true), filter: { notTypes: ['Artifact'] } }], destroy),
      chapter([2], [], token('robot-villain-token')),
      chapter(
        [3],
        [],
        pump({ each: 'creature', controller: 'you', filter: artifact }, 0, 0, ['deathtouch']),
        counters({ each: 'creature', controller: 'you', filter: artifact }),
      ),
    ],
  },
  'Kang Dynasty': {
    saga: 3,
    abilities: [
      chapter(
        [1, 2],
        [theirCreature(true)],
        { kind: 'tap', what: t0 },
        { kind: 'mustAttack', what: t0, draws: true },
      ),
      chapter([3], [yourCreature], {
        kind: 'pump',
        to: t0,
        power: { count: 'cardsInHand' },
        toughness: { count: 'cardsInHand' },
        cantBeBlocked: true,
      }),
    ],
  },
  // ------------------------------------------------------------ instants and sorceries
  Vandalblast: {
    spell: {
      targets: [permanent(artifact, { controller: 'opponent' })],
      effects: [destroy],
    },
    // Overload {4}{R}: {R} plus {4}.
    kicker: {
      cost: mana('{4}'),
      as: 'overload',
      spell: {
        targets: [],
        effects: [
          {
            kind: 'destroy',
            what: { each: 'permanent', controller: 'opponent', filter: artifact },
          },
        ],
      },
    },
  },
  'Chaos Warp': {
    spell: { targets: [permanent({})], effects: [{ kind: 'chaosWarp', what: t0 }] },
  },
  Terminate: { spell: { targets: [creature], effects: [destroy] } },
  Bedevil: {
    spell: {
      targets: [permanent({ types: ['Artifact', 'Creature', 'Planeswalker'] })],
      effects: [destroy],
    },
  },
  'Withering Torment': {
    spell: {
      targets: [permanent({ types: ['Creature', 'Enchantment'] })],
      effects: [destroy, loseLife(2)],
    },
  },
  'Syphon Mind': {
    // "You draw a card for each card discarded this way": one in 1v1.
    spell: {
      targets: [],
      effects: [{ kind: 'discard', count: 1, who: 'eachOpponent' }, draw(1)],
    },
  },
  'Blasphemous Act': {
    costReduction: { count: 'creaturesOnBattlefield' },
    spell: { targets: [], effects: [{ kind: 'damage', amount: 13, to: { each: 'creature' } }] },
  },
  'Extract Power': { spell: { targets: [], effects: [{ kind: 'exileTopsPlayableFree' }] } },
  "Night's Whisper": { spell: { targets: [], effects: [draw(2), loseLife(2)] } },
  'Kindred Dominance': {
    spell: {
      targets: [],
      effects: [
        { kind: 'chooseCreatureType' },
        { kind: 'destroyAll', filter: { notChosenTypeOfSource: true } },
      ],
    },
  },
  'Endless Ranks of HYDRA': {
    spell: { targets: [], effects: [token('villain-2-1-token')] },
    abilities: [
      ...(
        [
          { on: 'otherCreatureEtb', controller: 'you', filter: commander },
          { on: 'youAttack', filter: commander },
        ] as const
      ).map((trigger): AbilityDef => ({
        kind: 'triggered',
        trigger,
        fromGraveyard: true,
        targets: [],
        effects: [
          {
            kind: 'may',
            cost: mana('{1}{B}'),
            effects: [{ kind: 'returnSource', to: 'hand' }],
          },
        ],
      })),
    ],
  },
  'Toxic Deluge': {
    payXLife: true,
    spell: {
      targets: [],
      effects: [
        {
          kind: 'pump',
          to: { each: 'creature' },
          power: { x: true, times: -1 },
          toughness: { x: true, times: -1 },
        },
      ],
    },
  },
};
