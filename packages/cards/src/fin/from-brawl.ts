import type { Behavior } from '../build.ts';
import { COLORS, tapFor } from '../msc/helpers.ts';
import {
  activated,
  atCombat,
  condition,
  counters,
  creatureOrArtifact,
  custom,
  damage,
  destroy,
  draw,
  equip,
  equipped,
  jobSelect,
  optional,
  mana,
  may,
  mode,
  oncePerTurn,
  onEnter,
  permanent,
  pump,
  self,
  spell,
  staticAbility,
  surveil,
  t0,
  theirCreature,
  token,
  treasure,
  when,
  yourCreature,
  yours,
} from '../fic/helpers.ts';

/**
 * Final Fantasy (FIN) booster cards first implemented for the Final Fantasy
 * Commander Brawl decks (phase 12), moved here when phase 12 merged with
 * phase 11. Cards phase 11 already had were dropped (its versions stay); the
 * rest (mostly rares and mythics, plus Zack Fair) use phase-11 vocabulary.
 * Phase 11c dedupes the rares against its own.
 */

export const FROM_BRAWL: Record<string, Behavior> = {
  // ------------------------------------------------------------ artifacts
  Blitzball: {
    abilities: [
      ...COLORS.map((c) => tapFor(c)),
      activated(null, { tapSelf: true, sacrificeSelf: true }, [], [draw(2)], {
        condition: condition('legendHitOpponent'),
      }),
    ],
  },
  'Gaius van Baelsar': {
    abilities: [
      {
        ...onEnter([]),
        modes: [
          mode(
            'Each player sacrifices a creature token',
            [],
            { kind: 'opponentSacrifices', filter: { types: ['Creature'], token: true } },
            { kind: 'opponentSacrifices', filter: { types: ['Creature'], token: true }, you: true },
          ),
          mode(
            'Each player sacrifices a nontoken creature',
            [],
            { kind: 'opponentSacrifices', filter: { types: ['Creature'], nontoken: true } },
            {
              kind: 'opponentSacrifices',
              filter: { types: ['Creature'], nontoken: true },
              you: true,
            },
          ),
          mode(
            'Each player sacrifices an enchantment',
            [],
            { kind: 'opponentSacrifices', filter: { types: ['Enchantment'] } },
            { kind: 'opponentSacrifices', filter: { types: ['Enchantment'] }, you: true },
          ),
        ],
      },
    ],
  },
  'Poison the Waters': {
    modes: [
      mode('All creatures get -1/-1', [], pump({ each: 'creature' }, -1, -1)),
      mode('Discard an artifact or creature card', [], {
        kind: 'chooseFromOpponentHand',
        filter: { types: ['Artifact', 'Creature'] },
        then: 'discard',
      }),
    ],
  },
  'Random Encounter': {
    flashback: mana('{6}{R}{R}'),
    ...spell([], custom('randomEncounter')),
  },

  'Ambrosia Whiteheart': {
    abilities: [
      onEnter([permanent({ other: true }, { controller: 'you', optional: true })], {
        kind: 'bounce',
        what: t0,
      }),
      when({ on: 'landfall' }, [], pump(self, 1, 0)),
    ],
  },
  'Beatrix, Loyal General': {
    abilities: [
      optional(atCombat([{ ...yourCreature, optional: true }], custom('attachEquipmentToTarget'))),
    ],
  },
  'Freya Crescent': {
    abilities: [
      staticAbility({
        kind: 'while',
        condition: { kind: 'yourTurn' },
        power: 0,
        toughness: 0,
        keywords: ['flying'],
      }),
      tapFor('R', { onlyFor: 'Equipment' }),
    ],
  },
  'Zack Fair': {
    entersWithCounters: 1,
    abilities: [
      activated(
        '{1}',
        { sacrificeSelf: true },
        [yourCreature],
        [pump(t0, 0, 0, ['indestructible']), custom('zackFair')],
      ),
    ],
  },
  'Ultima Weapon': {
    abilities: [
      when({ on: 'equippedAttacks' }, [theirCreature], destroy(t0)),
      equipped(7, 7),
      equip('{7}'),
    ],
  },

  'Rosa, Resolute White Mage': {
    abilities: [atCombat([yourCreature], counters(t0), pump(t0, 0, 0, ['lifelink']))],
  },
  'Torgal, A Fine Hound': {
    abilities: [
      oncePerTurn(
        when(
          { on: 'castSpell', filter: 'creature', spell: { subtype: 'Human' } },
          [],
          custom('subjectBonusCounters', { dogsAndWolves: true }),
        ),
      ),
      ...COLORS.map((c) => tapFor(c)),
    ],
  },
  'Sleep Magic': {
    // "When enchanted creature is dealt damage, sacrifice this Aura" isn't built (a simplification).
    enchant: { what: 'creature' },
    abilities: [
      onEnter([], { kind: 'tap', what: 'attached' }),
      staticAbility({ kind: 'attached', power: 0, toughness: 0, doesntUntap: true }),
    ],
  },
  'Swallowed by Leviathan': spell([{ what: 'spell' }], surveil(2), {
    kind: 'counterUnlessPays',
    what: t0,
    cost: { generic: 0, colored: {} },
    costAmount: { count: 'cardsInGraveyard' },
  }),
  // "Exile it instead of putting it into its owner's graveyard" isn't built (a simplification).
  Syncopate: spell([{ what: 'spell' }], {
    kind: 'counterUnlessPays',
    what: t0,
    cost: { generic: 0, colored: {} },
    costAmount: { x: true },
  }),
  "The Crystal's Chosen": spell([], token('fin-hero-token', 4), counters(yours())),

  'Quina, Qu Gourmet': {
    abilities: [
      staticAbility({ kind: 'plusFrogToken' }),
      activated('{2}', { sacrificePermanent: { subtype: 'Frog' } }, [], [counters(self)]),
    ],
  },
  'Sidequest: Catch a Fish': {
    abilities: [when({ on: 'beginningOfUpkeep', whose: 'yours' }, [], custom('catchAFish'))],
  },

  'Reno and Rude': {
    abilities: [
      when(
        { on: 'combatDamageToPlayer' },
        [],
        may({
          kind: 'sacrificeSeveral',
          count: 1,
          filter: creatureOrArtifact,
          then: [custom('stealTop')],
        }),
      ),
    ],
  },
  // ------------------------------------------------------------ artifacts
  "Dark Knight's Greatsword": {
    abilities: [
      jobSelect,
      equipped(3, 0),
      activated(null, { life: 3 }, [yourCreature], [{ kind: 'attach', to: t0 }], {
        sorcerySpeed: true,
        oncePerTurn: true,
        label: 'Equip—Pay 3 life',
      }),
    ],
  },
  'Lion Heart': {
    abilities: [onEnter([{ what: 'any' }], damage(2, t0)), equipped(2, 1), equip('{2}')],
  },
  'Sidequest: Play Blitzball': {
    abilities: [
      atCombat([yourCreature], pump(t0, 2, 0)),
      // "At end of combat, if a player was dealt 6 or more combat damage this turn": at your end step,
      // if an opponent lost 6 or more life this turn (a simplification).
      {
        ...when({ on: 'beginningOfEndStep', whose: 'yours' }, [], custom('blitzballChampion')),
        condition: condition('opponentLostSix'),
      },
    ],
  },

  // ------------------------------------------------------------ creatures
  'Demon Wall': {
    abilities: [
      staticAbility({ kind: 'attacksWithCounterDespiteDefender' }),
      activated('{5}{B}', {}, [], [counters(self, 2)]),
    ],
  },
  "Sephiroth, Planet's Heir": {
    abilities: [
      onEnter([], pump({ each: 'creature', controller: 'opponent' }, -2, -2)),
      when({ on: 'otherCreatureDies', controller: 'opponent' }, [], counters(self)),
    ],
  },
  'Sidequest: Card Collection': {
    abilities: [
      onEnter([], draw(3), { kind: 'discard', count: 2 }),
      {
        ...when({ on: 'beginningOfEndStep', whose: 'yours' }, [], {
          kind: 'transform',
          what: self,
        }),
        condition: { kind: 'graveyardCount', min: 8 },
      },
    ],
  },
  'Sidequest: Hunt the Mark': {
    abilities: [
      onEnter([{ what: 'creature', optional: true }], destroy(t0)),
      {
        ...when({ on: 'beginningOfEndStep', whose: 'yours' }, [], treasure(), {
          kind: 'if',
          condition: { kind: 'controlsPermanents', filter: { subtype: 'Treasure' }, min: 3 },
          then: [{ kind: 'transform', what: self }],
        }),
        condition: condition('opponentCreatureDied'),
      },
    ],
  },
  // ------------------------------------------------------------ spells
  'Deadly Embrace': spell([theirCreature], destroy(t0), custom('drawPerCreatureDied')),

  'Quistis Trepe': {
    // Castable this turn rather than right away (a simplification).
    abilities: [
      onEnter(
        [{ what: 'graveyardCard', filter: { types: ['Instant', 'Sorcery'] }, optional: true }],
        custom('quistis'),
      ),
    ],
  },
  'Xande, Dark Mage': {
    abilities: [
      staticAbility({
        kind: 'boost',
        power: {
          count: 'cardsInGraveyard',
          types: ['Instant', 'Sorcery', 'Artifact', 'Enchantment', 'Planeswalker'],
        },
        toughness: {
          count: 'cardsInGraveyard',
          types: ['Instant', 'Sorcery', 'Artifact', 'Enchantment', 'Planeswalker'],
        },
      }),
    ],
  },
  'Ring of the Lucii': {
    abilities: [
      tapFor('C', { amount: 2 }),
      activated(
        '{2}',
        { tapSelf: true, life: 1 },
        [permanent({ nonland: true })],
        [{ kind: 'tap', what: t0 }],
      ),
    ],
  },
  "Relm's Sketching": spell([permanent({ types: ['Artifact', 'Creature', 'Land'] })], {
    kind: 'tokenCopy',
    of: t0,
  }),
};

/** Back faces of the FIN double-faced cards above. */
export const FROM_BRAWL_BACKS: Record<string, Behavior> = {
  'World Champion, Celestial Weapon': {
    abilities: [equipped(2, 0, ['doubleStrike']), equip('{3}')],
  },
  'Magicked Card': {
    abilities: [
      activated(null, { crew: 1 }, [], [{ kind: 'becomeCreature', what: self }], {
        label: 'Crew 1',
      }),
    ],
  },
  'Yiazmat, Ultimate Mark': {
    abilities: [
      activated(
        '{1}{B}',
        { sacrificePermanent: { types: ['Artifact', 'Creature'], other: true } },
        [],
        [pump(self, 0, 0, ['indestructible']), { kind: 'tap', what: self }],
      ),
    ],
  },
  'Cooking Campsite': {
    abilities: [
      tapFor('W'),
      activated(
        '{3}',
        { tapSelf: true, sacrificePermanent: { types: ['Artifact'] } },
        [],
        [counters(yours())],
        {
          sorcerySpeed: true,
        },
      ),
    ],
  },
};
