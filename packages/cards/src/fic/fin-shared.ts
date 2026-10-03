import type { Behavior } from '../build.ts';
import { COLORS, tapFor, tapForEither } from '../msc/helpers.ts';
import {
  activated,
  atCombat,
  batch,
  chapter,
  condition,
  creatureCard,
  creatureOrArtifact,
  custom,
  damage,
  destroy,
  drain,
  draw,
  exile,
  gain,
  graveyardCard,
  lose,
  loot,
  mana,
  may,
  mill,
  mode,
  oncePerTurn,
  onEnter,
  permanent,
  permanentCard,
  pump,
  reanimate,
  self,
  spell,
  staticAbility,
  summon,
  surveil,
  t0,
  theirCreature,
  tier,
  token,
  treasure,
  when,
  yourCreature,
  yours,
} from './helpers.ts';

/**
 * Final Fantasy (FIN) booster cards in the Final Fantasy Commander Brawl decks.
 * Phase 11 implements the FIN set in parallel (packages/cards/src/fin/); these
 * live here only, so the merge can reconcile the two.
 */

const town = (...colors: Parameters<typeof tapForEither>): Behavior => ({
  entersTapped: true,
  abilities: tapForEither(...colors),
});

export const FIN_SHARED: Record<string, Behavior> = {
  // ------------------------------------------------------------ Towns
  'Insomnia, Crown City': town('W', 'B'),
  'Rabanastre, Royal City': town('R', 'W'),
  'Vector, Imperial Capital': town('B', 'R'),
  'Starting Town': {
    entersTappedIf: { kind: 'not', condition: condition('firstThreeTurns') },
    // "{T}, Pay 1 life": a pain land's 1 damage (a simplification).
    abilities: [tapFor('C'), ...COLORS.map((c) => tapFor(c, { pain: true }))],
  },
  // ------------------------------------------------------------ artifacts
  Blitzball: {
    abilities: [
      ...COLORS.map((c) => tapFor(c)),
      activated(null, { tapSelf: true, sacrificeSelf: true }, [], [draw(2)], {
        condition: condition('legendHitOpponent'),
      }),
    ],
  },
  'Phoenix Down': {
    abilities: [
      // "Exile this artifact" is part of the cost: here the first thing the ability does.
      activated(
        '{1}{W}',
        { tapSelf: true },
        [creatureCard({ maxManaValue: 4 })],
        [exile(self), ...reanimate(0, { tapped: true })],
        { label: 'Return a creature card' },
      ),
      activated(
        '{1}{W}',
        { tapSelf: true },
        [{ what: 'creature', filter: { subtypes: ['Skeleton', 'Spirit', 'Zombie'] } }],
        [exile(self), exile(t0)],
        { label: 'Exile a Skeleton, Spirit or Zombie' },
      ),
    ],
  },
  // ------------------------------------------------------------ creatures
  'Al Bhed Salvagers': {
    abilities: [
      when(
        { on: 'permanentYouControlDies', filter: creatureOrArtifact, self: true },
        [],
        ...drain(1),
      ),
    ],
  },
  'Ardyn, the Usurper': {
    abilities: [
      staticAbility({
        kind: 'anthem',
        affects: 'creaturesYouControl',
        filter: { subtype: 'Demon' },
        power: 0,
        toughness: 0,
        keywords: ['menace', 'lifelink', 'haste'],
      }),
      atCombat(
        [{ what: 'graveyardCard', filter: { types: ['Creature'] }, optional: true }],
        custom('ardynStarscourge'),
      ),
    ],
  },
  'Dark Confidant': {
    abilities: [
      when({ on: 'beginningOfUpkeep', whose: 'yours' }, [], { kind: 'revealTopToHandLoseLife' }),
    ],
  },
  'Dwarven Castle Guard': {
    abilities: [when({ on: 'dies' }, [], token('hero-1-1-token'))],
  },
  "Fang, Fearless l'Cie": {
    // Meld with Vanille isn't built (Vanille isn't in these decks).
    abilities: [oncePerTurn(batch(when({ on: 'cardsLeaveYourGraveyard' }, [], draw(1), lose(1))))],
  },
  "G'raha Tia": {
    abilities: [
      oncePerTurn(
        batch(when({ on: 'permanentYouControlDies', filter: creatureOrArtifact }, [], draw(1))),
      ),
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
  'Garland, Knight of Cornelia': {
    abilities: [
      when({ on: 'castSpell', filter: 'noncreature' }, [], surveil(1)),
      activated('{3}{B}{B}{R}{R}', {}, [], [custom('returnTransformed')], {
        fromGraveyard: true,
        sorcerySpeed: true,
        label: 'Return transformed',
      }),
    ],
  },
  'Giott, King of the Dwarves': {
    abilities: [
      when({ on: 'selfOrCreatureEtb', filter: { subtype: 'Dwarf' } }, [], loot()),
      when({ on: 'otherPermanentEtb', filter: { subtype: 'Equipment' } }, [], loot()),
    ],
  },
  "Joshua, Phoenix's Dominant": {
    abilities: [
      onEnter([], custom('rummageUpTo', { max: 2 })),
      activated('{3}{R}{W}', { tapSelf: true }, [], [custom('blinkTransformed')], {
        sorcerySpeed: true,
        label: 'Transform',
      }),
    ],
  },
  'Judge Magister Gabranth': {
    abilities: [
      when({ on: 'permanentYouControlDies', filter: creatureOrArtifact }, [], {
        kind: 'counters',
        to: self,
        amount: 1,
      }),
    ],
  },
  'Kain, Traitorous Dragoon': {
    abilities: [
      staticAbility({
        kind: 'while',
        condition: { kind: 'yourTurn' },
        power: 0,
        toughness: 0,
        keywords: ['flying'],
      }),
      when(
        { on: 'combatDamageToPlayer' },
        [],
        { kind: 'giveControl', what: self, to: 'eachOpponent' },
        draw({ event: 'amount' }),
        treasure({ event: 'amount' }, { tapped: true }),
        lose({ event: 'amount' }),
      ),
    ],
  },
  'Namazu Trader': {
    abilities: [
      onEnter([], lose(1), treasure()),
      when(
        { on: 'attacks' },
        [],
        may({
          kind: 'sacrificeSeveral',
          count: 1,
          filter: creatureOrArtifact,
          then: [surveil(2)],
        }),
      ),
    ],
  },
  'Rufus Shinra': {
    abilities: [
      {
        ...when({ on: 'attacks' }, [], token('darkstar-token')),
        condition: {
          kind: 'not',
          condition: { kind: 'controlsPermanents', filter: { named: 'darkstar-token' }, min: 1 },
        },
      },
    ],
  },
  'Shinra Reinforcements': { abilities: [onEnter([], mill(3), gain(3))] },
  'Squall, SeeD Mercenary': {
    abilities: [
      when(
        { on: 'creatureYouControlAttacks', alone: true },
        [],
        pump('subject', 0, 0, ['doubleStrike']),
      ),
      when(
        { on: 'combatDamageToPlayer' },
        [graveyardCard({ ...permanentCard, maxManaValue: 3 })],
        ...reanimate(0),
      ),
    ],
  },
  'Vincent Valentine': {
    abilities: [
      when(
        { on: 'otherCreatureDies', controller: 'opponent' },
        [],
        custom('countersBySubjectPower'),
      ),
      when({ on: 'attacks' }, [], may({ kind: 'transform', what: self })),
    ],
  },
  // ------------------------------------------------------------ Summons (Saga creatures)
  'Summon: Brynhildr': summon(
    3,
    // "During any turn you put a lore counter on this Saga, you may play that card": this turn and your next.
    chapter([1], [], { kind: 'exileTopPlayable', count: 1, until: 'endOfNextTurn' }),
    chapter([2, 3], [], {
      kind: 'emblem',
      until: 'nextSpellThisTurn',
      ability: when({ on: 'castSpell', filter: 'creature' }, [], custom('subjectHasteOnEntry')),
    }),
  ),
  'Summon: G.F. Cerberus': summon(
    3,
    chapter([1], [], surveil(1)),
    chapter([2], [], {
      kind: 'emblem',
      until: 'nextSpellThisTurn',
      ability: when({ on: 'castSpell', filter: 'instantOrSorcery' }, [], {
        kind: 'copySpell',
        what: 'subject',
        retarget: true,
      }),
    }),
    chapter([3], [], {
      kind: 'emblem',
      until: 'nextSpellThisTurn',
      ability: when({ on: 'castSpell', filter: 'instantOrSorcery' }, [], {
        kind: 'copySpell',
        what: 'subject',
        count: 2,
        retarget: true,
      }),
    }),
  ),
  'Summon: G.F. Ifrit': summon(
    4,
    chapter([1, 2], [], loot()),
    chapter([3, 4], [], { kind: 'addMana', mana: [['R']] }),
  ),
  'Summon: Knights of Round': summon(
    5,
    chapter([1, 2, 3, 4], [], token('knight-2-2-token', 3)),
    chapter([5], [], pump(yours({ other: true }), 2, 2), {
      kind: 'namedCounters',
      name: 'indestructible',
      amount: 1,
      to: yours({ other: true }),
    }),
  ),
  'Summon: Primal Garuda': summon(
    3,
    chapter([1], [{ ...theirCreature, filter: { tapped: true } }], {
      kind: 'damage',
      amount: 4,
      to: t0,
      from: self,
    }),
    chapter([2, 3], [{ ...yourCreature, filter: { other: true } }], pump(t0, 1, 0, ['flying'])),
  ),
  'Summon: Primal Odin': summon(
    3,
    chapter([1], [theirCreature], destroy(t0)),
    chapter([3], [], draw(2), { kind: 'loseLife', who: 'eachPlayer', amount: 2 }),
    // II gives it "that player loses the game": an ability that works from chapter II on.
    {
      ...when({ on: 'combatDamageToPlayer' }, [], custom('opponentLosesGame')),
      condition: condition('loreTwo'),
    },
  ),
  // ------------------------------------------------------------ spells
  'Evil Reawakened': spell([creatureCard()], ...reanimate(0, { counters: 2 })),
  'Fire Magic': {
    modes: [
      tier('Fire', '{0}', [], damage(1, { each: 'creature' })),
      tier('Fira', '{2}', [], damage(2, { each: 'creature' })),
      tier('Firaga', '{5}', [], damage(3, { each: 'creature' })),
    ],
  },
  'Laughing Mad': {
    discardToCast: true,
    flashback: mana('{3}{R}'),
    ...spell([], draw(2)),
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
  'Resentful Revelation': {
    flashback: mana('{6}{B}'),
    ...spell([], { kind: 'lookTakeRestGraveyard', count: 3, take: 1 }),
  },
  Suplex: {
    modes: [
      mode(
        '3 damage to a creature',
        [{ what: 'creature' }],
        damage(3, t0),
        pump(t0, 0, 0, [], { exileIfDies: true }),
      ),
      mode('Exile an artifact', [permanent({ types: ['Artifact'] })], exile(t0)),
    ],
  },
  // "End the turn" isn't built: Ultima destroys and the turn goes on (a simplification).
  Ultima: spell([], {
    kind: 'destroyAll',
    filter: { types: ['Artifact', 'Creature'] },
    permanents: true,
  }),
};

/** Back faces of the FIN double-faced cards above. */
export const FIN_SHARED_BACK_FACES: Record<string, Behavior> = {
  'Chaos, the Endless': { abilities: [when({ on: 'dies' }, [], custom('sourceToLibraryBottom'))] },
  'Phoenix, Warden of Fire': summon(
    3,
    chapter([1, 2], [], damage(2, 'eachOpponent')),
    chapter([3], [], custom('phoenixRebirth')),
  ),
  'Galian Beast': {
    abilities: [
      when({ on: 'dies' }, [], { kind: 'returnSource', to: 'battlefield', tapped: true }),
    ],
  },
};
