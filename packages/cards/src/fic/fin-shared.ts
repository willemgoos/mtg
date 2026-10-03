import type { Behavior } from '../build.ts';
import { prowess } from '../blb/helpers.ts';
import { combos, COLORS, cycling, tapFor, tapForEither } from '../msc/helpers.ts';
import {
  activated,
  atCombat,
  batch,
  chapter,
  condition,
  counters,
  creature,
  creatureCard,
  creatureOrArtifact,
  custom,
  damage,
  destroy,
  drain,
  draw,
  equip,
  equipment,
  equipped,
  exile,
  jobSelect,
  landcycling,
  optional,
  t1,
  yourEquipment,
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

const PERMANENT_TYPES: ('Artifact' | 'Creature' | 'Enchantment' | 'Land' | 'Planeswalker')[] = [
  'Artifact',
  'Creature',
  'Enchantment',
  'Land',
  'Planeswalker',
];

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

  // ============================================================ Limit Break (12b)
  'Gongaga, Reactor Town': town('R', 'G'),
  'Windurst, Federation Center': town('G', 'W'),
  // ------------------------------------------------------------ creatures
  'Adelbert Steiner': {
    abilities: [
      staticAbility({
        kind: 'boost',
        power: { count: 'permanentsYouControl', filter: equipment },
        toughness: { count: 'permanentsYouControl', filter: equipment },
      }),
    ],
  },
  'Aerith Gainsborough': {
    abilities: [
      when({ on: 'youGainLife' }, [], counters(self)),
      when({ on: 'dies' }, [], custom('countersOnLegendsBySourceCounters')),
    ],
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
  'Ashe, Princess of Dalmasca': {
    abilities: [
      when({ on: 'attacks' }, [], {
        kind: 'lookAndTake',
        count: 5,
        filter: { types: ['Artifact'] },
      }),
    ],
  },
  'Barret Wallace': {
    abilities: [
      when({ on: 'attacks' }, [], {
        kind: 'damage',
        amount: { count: 'permanentsYouControl', filter: { types: ['Creature'], equipped: true } },
        to: 'eachOpponent',
      }),
    ],
  },
  'Beatrix, Loyal General': {
    abilities: [
      optional(atCombat([{ ...yourCreature, optional: true }], custom('attachEquipmentToTarget'))),
    ],
  },
  'Delivery Moogle': {
    // Library only: the graveyard isn't searched (a simplification).
    abilities: [
      onEnter([], {
        kind: 'searchLibrary',
        filter: { types: ['Artifact'], maxManaValue: 2 },
        to: 'hand',
      }),
    ],
  },
  'Firion, Wild Rose Warrior': {
    abilities: [
      staticAbility({
        kind: 'anthem',
        affects: 'creaturesYouControl',
        filter: { equipped: true },
        power: 0,
        toughness: 0,
        keywords: ['haste'],
      }),
      when(
        { on: 'otherPermanentEtb', filter: { subtype: 'Equipment', nontoken: true } },
        [],
        custom('firionCopy'),
      ),
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
  'Gilgamesh, Master-at-Arms': {
    abilities: [
      when({ on: 'etb' }, [], custom('gilgamesh')),
      when({ on: 'attacks' }, [], custom('gilgamesh')),
    ],
  },
  'Item Shopkeep': {
    abilities: [
      when(
        { on: 'youAttack' },
        [{ what: 'creature', controller: 'you', filter: { attacking: true, equipped: true } }],
        pump(t0, 0, 0, ['menace']),
      ),
    ],
  },
  'Raubahn, Bull of Ala Mhigo': {
    // "Ward—Pay life equal to Raubahn's power": his printed 2 (a simplification).
    wardCost: { mana: { generic: 0, colored: {} }, life: 2 },
    abilities: [
      when(
        { on: 'attacks' },
        [
          yourEquipment({ optional: true }),
          { what: 'creature', controller: 'you', filter: { attacking: true } },
        ],
        { kind: 'attach', to: t1, what: t0 },
      ),
    ],
  },
  'Rinoa Heartilly': {
    abilities: [
      onEnter([], token('angelo-token')),
      when(
        { on: 'attacks' },
        [{ ...yourCreature, filter: { other: true } }],
        pump(t0, { count: 'creaturesYouControl' }, { count: 'creaturesYouControl' }),
      ),
    ],
  },
  'Weapons Vendor': {
    abilities: [
      onEnter([], draw(1)),
      {
        ...atCombat([yourEquipment(), yourCreature], { kind: 'attach', to: t1, what: t0 }),
        cost: { generic: 1, colored: {} },
        condition: { kind: 'controlsPermanents', filter: equipment, min: 1 },
      },
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
  // ------------------------------------------------------------ Equipment
  'Aettir and Priwen': {
    abilities: [equipped(0, 0, [], { basePTLife: true }), equip('{5}')],
  },
  "Bard's Bow": { abilities: [jobSelect, equipped(2, 2, ['reach']), equip('{6}')] },
  'Buster Sword': {
    abilities: [
      equipped(3, 2),
      when({ on: 'equippedDealsCombatDamageToPlayer' }, [], draw(1), {
        kind: 'castFree',
        what: self,
        from: 'hand',
        maxManaValueAmount: { event: 'amount' },
      }),
      equip('{2}'),
    ],
  },
  'Crystal Fragments': {
    abilities: [
      equipped(1, 1),
      activated('{5}{W}{W}', {}, [], [custom('blinkTransformed')], {
        sorcerySpeed: true,
        label: 'Transform',
      }),
      equip('{1}'),
    ],
  },
  "Dragoon's Lance": {
    // "During your turn, equipped creature has flying": always (a simplification).
    abilities: [jobSelect, equipped(1, 0, ['flying']), equip('{4}')],
  },
  'Genji Glove': {
    abilities: [
      equipped(0, 0, ['doubleStrike']),
      {
        ...when(
          { on: 'equippedAttacks' },
          [],
          { kind: 'untap', what: 'attached' },
          { kind: 'extraCombat' },
        ),
        condition: condition('firstCombat'),
      },
      equip('{3}'),
    ],
  },
  "Machinist's Arsenal": {
    abilities: [
      jobSelect,
      equipped(
        { multiply: 2, amount: { count: 'permanentsYouControl', filter: { types: ['Artifact'] } } },
        { multiply: 2, amount: { count: 'permanentsYouControl', filter: { types: ['Artifact'] } } },
      ),
      equip('{4}'),
    ],
  },
  "Paladin's Arms": { abilities: [jobSelect, equipped(2, 1, ['wardOne']), equip('{4}')] },
  "Samurai's Katana": {
    abilities: [jobSelect, equipped(2, 2, ['trample', 'haste']), equip('{5}')],
  },
  "Summoner's Grimoire": {
    // An enchantment creature card put in this way doesn't enter attacking (a simplification).
    abilities: [
      jobSelect,
      when(
        { on: 'equippedAttacks' },
        [],
        may({ kind: 'putFromHandOrGraveyard', filter: { types: ['Creature'] }, handOnly: true }),
      ),
      equip('{3}'),
    ],
  },
  'Ultima Weapon': {
    abilities: [
      when({ on: 'equippedAttacks' }, [theirCreature], destroy(t0)),
      equipped(7, 7),
      equip('{7}'),
    ],
  },
  "White Mage's Staff": {
    abilities: [
      jobSelect,
      equipped(1, 1),
      when({ on: 'equippedAttacks' }, [], gain(1)),
      equip('{3}'),
    ],
  },
  // ------------------------------------------------------------ spells
  'Airship Crash': {
    abilities: [cycling('{2}')],
    ...spell(
      [
        permanent({
          anyOf: [
            { types: ['Artifact', 'Enchantment'] },
            { types: ['Creature'], hasKeyword: 'flying' },
          ],
        }),
      ],
      destroy(t0),
    ),
  },
  'Commune with Beavers': spell([], {
    kind: 'lookAndTake',
    count: 3,
    filter: { types: ['Artifact', 'Creature', 'Land'] },
  }),

  // ============================================================ Counter Blitz (12c)
  'Guadosalam, Farplane Gateway': town('G', 'U'),
  'Sharlayan, Nation of Scholars': town('W', 'U'),
  // ------------------------------------------------------------ creatures
  "Dion, Bahamut's Dominant": {
    abilities: [
      staticAbility({
        kind: 'anthem',
        affects: 'creaturesYouControl',
        filter: { subtype: 'Knight' },
        condition: { kind: 'yourTurn' },
        power: 0,
        toughness: 0,
        keywords: ['flying'],
      }),
      onEnter([], token('knight-2-2-token')),
      activated('{4}{W}{W}', { tapSelf: true }, [], [custom('blinkTransformed')], {
        sorcerySpeed: true,
        label: 'Transform',
      }),
    ],
  },
  'Garnet, Princess of Alexandria': {
    abilities: [when({ on: 'attacks' }, [], custom('garnet'))],
  },
  'Il Mheg Pixie': { abilities: [when({ on: 'attacks' }, [], surveil(1))] },
  "Jill, Shiva's Dominant": {
    abilities: [
      onEnter([permanent({ nonland: true, other: true }, { optional: true })], {
        kind: 'bounce',
        what: t0,
      }),
      activated('{3}{U}{U}', { tapSelf: true }, [], [custom('blinkTransformed')], {
        sorcerySpeed: true,
        label: 'Transform',
      }),
    ],
  },
  'Rosa, Resolute White Mage': {
    abilities: [atCombat([yourCreature], counters(t0), pump(t0, 0, 0, ['lifelink']))],
  },
  'Sazh Katzroy': {
    abilities: [
      onEnter([], {
        kind: 'may',
        effects: [
          {
            kind: 'searchLibrary',
            filter: { anyOf: [{ subtype: 'Bird' }, { types: ['Land'], supertypes: ['Basic'] }] },
            to: 'hand',
          },
        ],
      }),
      when({ on: 'attacks' }, [{ what: 'creature' }], counters(t0), {
        kind: 'counters',
        to: t0,
        amount: { countersOn: t0 },
      }),
    ],
  },
  "Sazh's Chocobo": { abilities: [when({ on: 'landfall' }, [], counters(self))] },
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
  'Town Greeter': {
    // "If you put a Town card into your hand this way, you gain 2 life" isn't built (a simplification).
    abilities: [onEnter([], { kind: 'millThenTake', count: 4, filter: { types: ['Land'] } })],
  },
  // ------------------------------------------------------------ Summons
  'Summon: Bahamut': summon(
    4,
    chapter([1, 2], [permanent({ nonland: true }, { optional: true })], destroy(t0)),
    chapter([3], [], draw(2)),
    chapter([4], [], {
      kind: 'damage',
      amount: { count: 'totalManaValue', filter: { other: true } },
      to: 'eachOpponent',
      from: self,
    }),
  ),
  'Summon: Choco/Mog': summon(4, chapter([1, 2, 3, 4], [], pump(yours({ other: true }), 1, 0))),
  'Summon: Fat Chocobo': summon(
    4,
    chapter([1], [], token('chocobo-bird-token')),
    chapter([2, 3, 4], [], pump(yours(), 0, 0, ['trample'])),
  ),
  'Summon: Fenrir': summon(
    3,
    chapter([1], [], { kind: 'searchLibrary', filter: 'basicLand', to: 'battlefieldTapped' }),
    chapter([2], [], {
      kind: 'emblem',
      until: 'nextSpellThisTurn',
      ability: when(
        { on: 'castSpell', filter: 'creature' },
        [],
        custom('subjectBonusCounters', { n: 1 }),
      ),
    }),
    chapter([3], [], { kind: 'if', condition: condition('greatestPower'), then: [draw(1)] }),
  ),
  'Summon: Leviathan': summon(
    3,
    chapter([1], [], custom('leviathanWave')),
    // II, III: only Leviathan itself is one of those types in these decks.
    { ...when({ on: 'attacks' }, [], draw(1)), condition: condition('loreTwo') },
  ),
  'Summon: Shiva': summon(
    3,
    chapter(
      [1, 2],
      [theirCreature],
      { kind: 'tap', what: t0 },
      {
        kind: 'namedCounters',
        name: 'stun',
        amount: 1,
        to: t0,
      },
    ),
    chapter(
      [3],
      [],
      draw({ count: 'permanentsOpponentsControl', filter: { types: ['Creature'], tapped: true } }),
    ),
  ),
  'Summon: Titan': summon(
    3,
    chapter([1], [], mill(5)),
    chapter([2], [], { kind: 'returnLandsFromGraveyard' }),
    chapter(
      [3],
      [{ ...yourCreature, filter: { other: true } }],
      pump(t0, { count: 'landsYouControl' }, { count: 'landsYouControl' }, ['trample']),
    ),
  ),
  // ------------------------------------------------------------ other permanents
  'Ride the Shoopuf': {
    // Its {5}{G}{G} "becomes a 7/7 Beast" isn't built (a simplification).
    abilities: [when({ on: 'landfall' }, [yourCreature], counters(t0))],
  },
  'Sleep Magic': {
    // "When enchanted creature is dealt damage, sacrifice this Aura" isn't built (a simplification).
    enchant: { what: 'creature' },
    abilities: [
      onEnter([], { kind: 'tap', what: 'attached' }),
      staticAbility({ kind: 'attached', power: 0, toughness: 0, doesntUntap: true }),
    ],
  },
  'The Earth Crystal': {
    abilities: [
      staticAbility({ kind: 'spellsCostLess', filter: { colors: ['G'] }, amount: 1 }),
      staticAbility({ kind: 'doubleCounters' }),
      // "Distribute two counters among one or two": one on each target (two on a lone target isn't offered).
      activated(
        '{4}{G}{G}',
        { tapSelf: true },
        [yourCreature, { ...yourCreature, optional: true }],
        [counters(t0), counters(t1)],
      ),
    ],
  },
  // ------------------------------------------------------------ spells
  'Clash of the Eikons': {
    modes: combos(
      [
        mode('Fight', [yourCreature, theirCreature], { kind: 'fight', a: t0, b: t1 }),
        mode(
          'Remove a lore counter',
          [permanent({ subtype: 'Saga' }, { controller: 'you' })],
          custom('removeLoreFromTarget'),
        ),
        mode(
          'Add a lore counter',
          [permanent({ subtype: 'Saga' }, { controller: 'you' })],
          custom('addLoreToTarget'),
        ),
      ],
      [1, 2, 3],
    ),
  },
  'Combat Tutorial': spell([{ ...yourCreature, optional: true }], draw(2), counters(t0)),
  'Esper Origins': {
    flashback: mana('{3}{G}'),
    ...spell([], surveil(2), gain(2)),
    flashbackSpell: {
      targets: [],
      effects: [surveil(2), gain(2), custom('markReturnTransformed')],
    },
  },
  "Prishe's Wanderings": spell(
    [{ ...yourCreature, optional: true }],
    {
      kind: 'searchLibrary',
      filter: { anyOf: [{ types: ['Land'], supertypes: ['Basic'] }, { subtype: 'Town' }] },
      to: 'battlefieldTapped',
    },
    counters(t0),
  ),
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
  "The Crystal's Chosen": spell([], token('hero-1-1-token', 4), counters(yours())),

  // ============================================================ Brawl Aerith (12e)
  "Adventurer's Inn": { abilities: [onEnter([], gain(2)), tapFor('C')] },
  'Crossroads Village': {
    entersTapped: true,
    abilities: [
      onEnter([], { kind: 'chooseColor' }),
      ...COLORS.map((c) => tapFor(c, { ifChosen: true })),
    ],
  },
  // ------------------------------------------------------------ creatures
  'Balamb T-Rexaur': { abilities: [onEnter([], gain(3)), landcycling('{2}', 'Forest')] },
  'Cloud, Midgar Mercenary': {
    // Its doubled triggers while equipped aren't built (a simplification).
    abilities: [onEnter([], { kind: 'searchLibrary', filter: equipment, to: 'hand' })],
  },
  'Coliseum Behemoth': {
    abilities: [
      {
        ...onEnter([]),
        modes: [
          mode(
            'Destroy an artifact or enchantment',
            [permanent({ types: ['Artifact', 'Enchantment'] })],
            destroy(t0),
          ),
          mode('Draw a card', [], draw(1)),
        ],
      },
    ],
  },
  'Diamond Weapon': {
    costReduction: { count: 'cardsInGraveyard', types: PERMANENT_TYPES },
    // "Prevent all combat damage dealt to it": all damage to it (a simplification).
    abilities: [staticAbility({ kind: 'preventDamageToSelf' })],
  },
  'Gran Pulse Ochu': {
    abilities: [
      activated(
        '{8}',
        {},
        [],
        [
          pump(
            self,
            { count: 'cardsInGraveyard', types: PERMANENT_TYPES },
            { count: 'cardsInGraveyard', types: PERMANENT_TYPES },
          ),
        ],
      ),
    ],
  },
  'Minwu, White Mage': {
    abilities: [when({ on: 'youGainLife' }, [], counters(yours({ subtype: 'Cleric' })))],
  },
  'Quina, Qu Gourmet': {
    abilities: [
      staticAbility({ kind: 'plusFrogToken' }),
      activated('{2}', { sacrificePermanent: { subtype: 'Frog' } }, [], [counters(self)]),
    ],
  },
  'Serah Farron': {
    abilities: [
      staticAbility({
        kind: 'spellsCostLessIf',
        filter: { types: ['Creature'], supertypes: ['Legendary'] },
        amount: 2,
        condition: condition('noLegendCastThisTurn'),
      }),
      {
        ...atCombat([], may({ kind: 'transform', what: self })),
        condition: {
          kind: 'controlsCreature',
          filter: { supertypes: ['Legendary'], other: true },
          count: 2,
        },
      },
    ],
  },
  'Snow Villiers': { powerEquals: { count: 'creaturesYouControl' } },
  'Stiltzkin, Moogle Merchant': {
    abilities: [
      activated(
        '{2}',
        { tapSelf: true },
        [permanent({ other: true }, { controller: 'you' })],
        [{ kind: 'giveControl', what: t0, to: 'eachOpponent' }, draw(1)],
      ),
    ],
  },
  'Traveling Chocobo': {
    // Its doubled land and Bird triggers aren't built (a simplification).
    abilities: [
      staticAbility({
        kind: 'playFromTop',
        filter: { anyOf: [{ types: ['Land'] }, { subtype: 'Bird' }] },
      }),
    ],
  },
  'Yuna, Hope of Spira': {
    abilities: [
      staticAbility({
        kind: 'anthem',
        affects: 'creaturesYouControl',
        filter: { anyOf: [{ sameNameAsSource: true }, { types: ['Enchantment'] }] },
        condition: { kind: 'yourTurn' },
        power: 0,
        toughness: 0,
        keywords: ['trample', 'lifelink', 'ward'],
      }),
      when(
        { on: 'beginningOfEndStep', whose: 'yours' },
        [graveyardCard({ types: ['Enchantment'] }, { optional: true })],
        { kind: 'returnToBattlefield', what: t0, counter: 'finality' },
      ),
    ],
  },
  // ------------------------------------------------------------ other permanents
  'Chocobo Racetrack': { abilities: [when({ on: 'landfall' }, [], token('chocobo-bird-token'))] },
  'Excalibur II': {
    abilities: [
      when({ on: 'youGainLife' }, [], { kind: 'namedCounters', name: 'charge', amount: 1 }),
      equipped({ namedCountersOnSource: 'charge' }, { namedCountersOnSource: 'charge' }),
      equip('{3}'),
    ],
  },
  'Instant Ramen': {
    abilities: [
      onEnter([], draw(1)),
      activated('{2}', { tapSelf: true, sacrificeSelf: true }, [], [gain(3)]),
    ],
  },
  'Sidequest: Catch a Fish': {
    abilities: [when({ on: 'beginningOfUpkeep', whose: 'yours' }, [], custom('catchAFish'))],
  },
  'Sidequest: Raise a Chocobo': {
    abilities: [
      onEnter([], token('chocobo-bird-token')),
      {
        ...when(
          { on: 'beginningOfMain', which: 1 },
          [],
          { kind: 'transform', what: self },
          // "When this permanent transforms into Black Chocobo": a land onto the battlefield tapped.
          { kind: 'searchLibrary', filter: { types: ['Land'] }, to: 'battlefieldTapped' },
        ),
        condition: { kind: 'controlsPermanents', filter: { subtype: 'Bird' }, min: 4 },
      },
    ],
  },
  'The Wind Crystal': {
    abilities: [
      staticAbility({ kind: 'spellsCostLess', filter: { colors: ['W'] }, amount: 1 }),
      staticAbility({ kind: 'doubleLifeGain' }),
      activated('{4}{W}{W}', { tapSelf: true }, [], [pump(yours(), 0, 0, ['flying', 'lifelink'])]),
    ],
  },
  // ------------------------------------------------------------ spells
  'Chocobo Kick': {
    ...spell([yourCreature, theirCreature], {
      kind: 'damage',
      amount: { powerOf: t0 },
      to: t1,
      from: t0,
    }),
    // Kicker—return a land you control to its owner's hand: paid as the spell resolves here.
    kicker: {
      cost: { generic: 0, colored: {} },
      spell: {
        targets: [yourCreature, theirCreature],
        effects: [
          {
            kind: 'chooseYourPermanent',
            filter: { types: ['Land'] },
            then: [{ kind: 'bounce', what: 'chosen' }],
          },
          { kind: 'damage', amount: { multiply: 2, amount: { powerOf: t0 } }, to: t1, from: t0 },
        ],
      },
    },
  },
  'Gysahl Greens': {
    flashback: mana('{6}{G}'),
    ...spell([], token('chocobo-bird-token')),
  },
  "Moogles' Valor": spell(
    [],
    token('moogle-token', { count: 'creaturesYouControl' }),
    pump(yours(), 0, 0, ['indestructible']),
  ),

  // ============================================================ Brawl Locke (12g)
  'The Gold Saucer': {
    abilities: [
      tapFor('C'),
      activated('{2}', { tapSelf: true }, [], [custom('coinFlipTreasure')]),
      activated('{3}', { tapSelf: true, sacrificeArtifacts: 2 }, [], [draw(1)]),
    ],
  },
  // ------------------------------------------------------------ creatures
  Ahriman: {
    abilities: [
      activated(
        '{3}',
        { sacrificePermanent: { ...creatureOrArtifact, other: true } },
        [],
        [draw(1)],
      ),
    ],
  },
  'Black Waltz No. 3': {
    abilities: [when({ on: 'castSpell', filter: 'noncreature' }, [], damage(2, 'eachOpponent'))],
  },
  'Blazing Bomb': {
    // "At least four mana spent": mana value 4 or more (a simplification).
    abilities: [
      when(
        { on: 'castSpell', filter: 'noncreature', spell: { minManaValue: 4 } },
        [],
        counters(self),
      ),
      activated(
        null,
        { tapSelf: true, sacrificeSelf: true },
        [creature],
        [custom('damageByLkiPower')],
        {
          sorcerySpeed: true,
        },
      ),
    ],
  },
  'Kuja, Genome Sorcerer': {
    abilities: [
      when(
        { on: 'beginningOfEndStep', whose: 'yours' },
        [],
        token('wizard-ping-token', 1, { tapped: true }),
        {
          kind: 'if',
          condition: { kind: 'controlsPermanents', filter: { subtype: 'Wizard' }, min: 4 },
          then: [{ kind: 'transform', what: self }],
        },
      ),
    ],
  },
  'Mysidian Elder': { abilities: [onEnter([], token('wizard-ping-token'))] },
  'Prompto Argentum': {
    abilities: [
      when({ on: 'castSpell', filter: 'noncreature', spell: { minManaValue: 4 } }, [], treasure()),
    ],
  },
  'Queen Brahne': {
    abilities: [prowess, when({ on: 'attacks' }, [], token('wizard-ping-token'))],
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
  'Seifer Almasy': {
    abilities: [
      when(
        { on: 'creatureYouControlAttacks', alone: true },
        [],
        pump('subject', 0, 0, ['doubleStrike']),
      ),
      when(
        { on: 'combatDamageToPlayer' },
        [graveyardCard({ types: ['Instant', 'Sorcery'], maxManaValue: 3 }, { optional: true })],
        { kind: 'castFree', what: t0, exileAfter: true },
      ),
    ],
  },
  'Sephiroth, Fabled SOLDIER': {
    abilities: [
      when(
        { on: 'etb' },
        [],
        may({
          kind: 'sacrificeSeveral',
          count: 1,
          filter: { types: ['Creature'] },
          then: [draw(1)],
        }),
      ),
      when(
        { on: 'attacks' },
        [],
        may({
          kind: 'sacrificeSeveral',
          count: 1,
          filter: { types: ['Creature'] },
          then: [draw(1)],
        }),
      ),
      when(
        { on: 'otherCreatureDies', controller: 'any' },
        [],
        ...drain(1),
        { kind: 'noteResolution' },
        {
          kind: 'if',
          condition: { kind: 'resolvedThisTurn', n: 4 },
          then: [
            { kind: 'transform', what: self },
            // Super Nova: the emblem as it transforms.
            {
              kind: 'emblem',
              until: 'permanent',
              ability: when({ on: 'otherCreatureDies', controller: 'any' }, [], ...drain(1)),
            },
          ],
        },
      ),
    ],
  },
  'Undercity Dire Rat': { abilities: [when({ on: 'dies' }, [], treasure())] },
  'Vaan, Street Thief': {
    // "Whenever you cast a spell you don't own" isn't built (a simplification).
    abilities: [
      when(
        {
          on: 'creaturesYouControlDealCombatDamageToPlayer',
          filter: { subtypes: ['Scout', 'Pirate', 'Rogue'] },
        },
        [],
        custom('stealTop', { orTreasure: true }),
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
  "Monk's Fist": { abilities: [jobSelect, equipped(1, 0), equip('{2}')] },
  'Phantom Train': {
    abilities: [
      activated(
        null,
        { sacrificePermanent: { ...creatureOrArtifact, other: true } },
        [],
        [counters(self), { kind: 'becomeCreature', what: self }],
      ),
    ],
  },
  "Red Mage's Rapier": {
    abilities: [
      jobSelect,
      when({ on: 'castSpell', filter: 'noncreature' }, [], pump('attached', 2, 0)),
      equip('{3}'),
    ],
  },
  'The Masamune': {
    // First strike always (not only attacking); "must be blocked" and the extra death triggers aren't built.
    abilities: [equipped(0, 0, ['firstStrike']), equip('{2}')],
  },
  'The Regalia': {
    abilities: [
      when({ on: 'attacks' }, [], {
        kind: 'revealUntil',
        filter: { types: ['Land'] },
        to: 'battlefieldTapped',
      }),
      activated(null, { crew: 1 }, [], [{ kind: 'becomeCreature', what: self }], {
        label: 'Crew 1',
      }),
    ],
  },
  'World Map': {
    abilities: [
      activated(
        '{1}',
        { tapSelf: true, sacrificeSelf: true },
        [],
        [{ kind: 'searchLibrary', filter: 'basicLand', to: 'hand' }],
      ),
      activated(
        '{3}',
        { tapSelf: true, sacrificeSelf: true },
        [],
        [{ kind: 'searchLibrary', filter: { types: ['Land'] }, to: 'hand' }],
      ),
    ],
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
  'Summon: Anima': summon(
    4,
    chapter([1, 2, 3], [], draw(1), lose(1)),
    chapter(
      [4],
      [],
      { kind: 'opponentSacrifices' },
      { kind: 'loseLife', who: 'eachOpponent', amount: 3 },
    ),
  ),
  // ------------------------------------------------------------ spells
  'Call the Mountain Chocobo': {
    flashback: mana('{5}{R}'),
    ...spell(
      [],
      { kind: 'searchLibrary', filter: { types: ['Land'], subtype: 'Mountain' }, to: 'hand' },
      token('chocobo-bird-token'),
    ),
  },
  'Choco-Comet': spell([{ what: 'any' }], damage({ x: true }, t0), token('chocobo-bird-token')),
  'Nibelheim Aflame': {
    flashback: mana('{5}{R}{R}'),
    ...spell([yourCreature], custom('nibelheim')),
    flashbackSpell: {
      targets: [yourCreature],
      effects: [custom('nibelheim'), { kind: 'discardHand' }, draw(4)],
    },
  },
  'Opera Love Song': {
    modes: [
      mode('Exile the top two; play them until your next end step', [], {
        kind: 'exileTopPlayable',
        count: 2,
        until: 'endOfNextTurn',
      }),
      mode(
        'One or two creatures get +2/+0',
        [creature, { what: 'creature', optional: true }],
        pump(t0, 2, 0),
        pump(t1, 2, 0),
      ),
    ],
  },
  "Sorceress's Schemes": {
    flashback: mana('{4}{R}'),
    // Exiled flashback cards aren't offered: the graveyard only.
    ...spell(
      [graveyardCard({ types: ['Instant', 'Sorcery'] })],
      { kind: 'returnToHand', what: t0 },
      {
        kind: 'addMana',
        mana: [['R']],
      },
    ),
  },
  'Thunder Magic': {
    modes: [
      tier('Thunder', '{0}', [creature], damage(2, t0)),
      tier('Thundara', '{3}', [creature], damage(4, t0)),
      tier('Thundaga', '{5}{R}', [creature], damage(8, t0)),
    ],
  },

  // ============================================================ Brawl Emet-Selch (12f)
  'Jidoor, Aristocratic Capital': { entersTapped: true, abilities: [tapFor('U')] },
  // ------------------------------------------------------------ creatures
  'Demon Wall': {
    abilities: [
      staticAbility({ kind: 'attacksWithCounterDespiteDefender' }),
      activated('{5}{B}', {}, [], [counters(self, 2)]),
    ],
  },
  "Dragoon's Wyvern": { abilities: [onEnter([], token('hero-1-1-token'))] },
  'Gogo, Master of Mimicry': {
    // "Copy target activated or triggered ability you control X times": the top triggered one (abilities aren't targets).
    abilities: [
      activated(
        '{X}{X}',
        { tapSelf: true },
        [],
        [{ kind: 'repeat', count: { x: true }, effects: [{ kind: 'copyTopTrigger', count: 1 }] }],
      ),
    ],
  },
  Hecteyes: { abilities: [onEnter([], { kind: 'discard', count: 1, who: 'eachOpponent' })] },
  'Ice Flan': {
    abilities: [
      onEnter(
        [permanent({ types: ['Artifact', 'Creature'] }, { controller: 'opponent' })],
        { kind: 'tap', what: t0 },
        { kind: 'namedCounters', name: 'stun', amount: 1, to: t0 },
      ),
      landcycling('{2}', 'Island'),
    ],
  },
  'Jecht, Reluctant Guardian': {
    abilities: [when({ on: 'combatDamageToPlayer' }, [], may(custom('blinkTransformed')))],
  },
  Malboro: {
    abilities: [
      onEnter(
        [],
        { kind: 'discard', count: 1, who: 'eachOpponent' },
        { kind: 'loseLife', who: 'eachOpponent', amount: 2 },
        custom('exileTopOfOpponent', { n: 3 }),
      ),
      landcycling('{2}', 'Swamp'),
    ],
  },
  Sahagin: {
    // "At least four mana spent": mana value 4 or more (a simplification).
    abilities: [
      when(
        { on: 'castSpell', filter: 'noncreature', spell: { minManaValue: 4 } },
        [],
        counters(self),
        pump(self, 0, 0, [], { cantBeBlocked: true }),
      ),
    ],
  },
  'Scorpion Sentinel': {
    abilities: [
      staticAbility({
        kind: 'while',
        condition: { kind: 'controlsPermanents', filter: { types: ['Land'] }, min: 7 },
        power: 3,
        toughness: 0,
      }),
    ],
  },
  "Sephiroth, Planet's Heir": {
    abilities: [
      onEnter([], pump({ each: 'creature', controller: 'opponent' }, -2, -2)),
      when({ on: 'otherCreatureDies', controller: 'opponent' }, [], counters(self)),
    ],
  },
  "Y'shtola Rhul": {
    // The additional end step isn't built (a simplification).
    abilities: [
      when({ on: 'beginningOfEndStep', whose: 'yours' }, [yourCreature], {
        kind: 'blink',
        what: t0,
      }),
    ],
  },
  'Zenos yae Galvus': {
    abilities: [
      onEnter([theirCreature], custom('zenos')),
      when({ on: 'chosenLeaves' }, [], { kind: 'transform', what: self }),
    ],
  },
  // ------------------------------------------------------------ other permanents
  "Black Mage's Rod": {
    abilities: [
      jobSelect,
      equipped(1, 0),
      when({ on: 'castSpell', filter: 'noncreature' }, [], {
        kind: 'damage',
        amount: 1,
        to: 'eachOpponent',
        from: 'attached',
      }),
      equip('{3}'),
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
  'The Prima Vista': {
    abilities: [
      when({ on: 'castSpell', filter: 'noncreature', spell: { minManaValue: 4 } }, [], {
        kind: 'becomeCreature',
        what: self,
      }),
      activated(null, { crew: 2 }, [], [{ kind: 'becomeCreature', what: self }], {
        label: 'Crew 2',
      }),
    ],
  },
  // ------------------------------------------------------------ spells
  'Deadly Embrace': spell([theirCreature], destroy(t0), custom('drawPerCreatureDied')),
  'Fight On!': spell(
    [creatureCard({}, { optional: true }), creatureCard({}, { optional: true })],
    { kind: 'returnToHand', what: t0 },
    { kind: 'returnToHand', what: t1 },
  ),
  'Magic Damper': spell([yourCreature], pump(t0, 1, 1, ['hexproof']), { kind: 'untap', what: t0 }),
  'Retrieve the Esper': {
    flashback: mana('{5}{U}'),
    ...spell([], token('robot-warrior-token')),
    flashbackSpell: { targets: [], effects: [token('robot-warrior-token', 1, { counters: 2 })] },
  },
  "Sephiroth's Intervention": spell([creature], destroy(t0), gain(2)),
  'The Final Days': {
    flashback: mana('{4}{B}{B}'),
    ...spell([], token('horror-token', 2, { tapped: true })),
    flashbackSpell: {
      targets: [],
      effects: [
        token('horror-token', { count: 'cardsInGraveyard', types: ['Creature'] }, { tapped: true }),
      ],
    },
  },
  "Vayne's Treachery": {
    ...spell([creature], pump(t0, -2, -2)),
    // Kicker—sacrifice an artifact or creature: sacrificed as the spell resolves here.
    kicker: {
      cost: { generic: 0, colored: {} },
      spell: {
        targets: [creature],
        effects: [
          {
            kind: 'chooseYourPermanent',
            filter: { types: ['Artifact', 'Creature'] },
            then: [{ kind: 'sacrifice', what: 'chosen' }],
          },
          pump(t0, -6, -6),
        ],
      },
    },
  },

  // ============================================================ Scions & Spellcraft (12d)
  'Treno, Dark City': town('U', 'B'),
  // ------------------------------------------------------------ creatures
  'Emet-Selch, Unsundered': {
    abilities: [
      when({ on: 'etb' }, [], draw(1), { kind: 'discard', count: 1 }),
      when({ on: 'attacks' }, [], draw(1), { kind: 'discard', count: 1 }),
      {
        ...when(
          { on: 'beginningOfUpkeep', whose: 'yours' },
          [],
          may({ kind: 'transform', what: self }),
        ),
        condition: { kind: 'graveyardCount', min: 14 },
      },
    ],
  },
  'Locke Cole': {
    abilities: [when({ on: 'combatDamageToPlayer' }, [], draw(1), { kind: 'discard', count: 1 })],
  },
  'Matoya, Archon Elder': { abilities: [when({ on: 'youScryOrSurveil' }, [], draw(1))] },
  'Noctis, Prince of Lucis': {
    abilities: [staticAbility({ kind: 'castArtifactsFromGraveyard' })],
  },
  'Quistis Trepe': {
    // Castable this turn rather than right away (a simplification).
    abilities: [
      onEnter(
        [{ what: 'graveyardCard', filter: { types: ['Instant', 'Sorcery'] }, optional: true }],
        custom('quistis'),
      ),
    ],
  },
  'Ultimecia, Time Sorceress': {
    abilities: [
      when({ on: 'etb' }, [], surveil(2)),
      when({ on: 'attacks' }, [], surveil(2)),
      {
        ...when(
          { on: 'beginningOfEndStep', whose: 'yours' },
          [],
          custom('exileFromGraveyard', { n: 8 }),
          { kind: 'transform', what: self },
          // Time Compression: the extra turn as it transforms.
          { kind: 'extraTurn' },
        ),
        cost: mana('{4}{U}{U}{B}{B}'),
        condition: { kind: 'graveyardCount', min: 8 },
      },
    ],
  },
  'Ultros, Obnoxious Octopus': {
    // "Mana spent to cast it": its mana value here (a simplification).
    abilities: [
      when(
        { on: 'castSpell', filter: 'noncreature', spell: { minManaValue: 4 } },
        [theirCreature],
        { kind: 'tap', what: t0 },
        { kind: 'namedCounters', name: 'stun', amount: 1, to: t0 },
      ),
      when(
        { on: 'castSpell', filter: 'noncreature', spell: { minManaValue: 8 } },
        [],
        counters(self, 8),
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
  // ------------------------------------------------------------ artifacts
  "Astrologian's Planisphere": {
    // "Whenever you draw your third card each turn" isn't built (a simplification).
    abilities: [
      jobSelect,
      when({ on: 'castSpell', filter: 'noncreature' }, [], counters('attached')),
      equip('{2}'),
    ],
  },
  Ether: {
    abilities: [
      activated(
        null,
        { tapSelf: true },
        [],
        [
          exile(self),
          { kind: 'addMana', mana: [['U']] },
          {
            kind: 'emblem',
            until: 'nextSpellThisTurn',
            ability: when({ on: 'castSpell', filter: 'instantOrSorcery' }, [], {
              kind: 'copySpell',
              what: 'subject',
              retarget: true,
            }),
          },
        ],
      ),
    ],
  },
  'Magitek Armor': {
    abilities: [
      onEnter([], token('hero-1-1-token')),
      activated(null, { crew: 1 }, [], [{ kind: 'becomeCreature', what: self }], {
        label: 'Crew 1',
      }),
    ],
  },
  "Ninja's Blades": {
    abilities: [
      jobSelect,
      equipped(1, 1),
      when({ on: 'equippedDealsCombatDamageToPlayer' }, [], custom('ninjaLoot')),
      equip('{2}'),
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
  "Sage's Nouliths": {
    abilities: [
      jobSelect,
      equipped(1, 0),
      when({ on: 'equippedAttacks' }, [{ what: 'creature', filter: { attacking: true } }], {
        kind: 'untap',
        what: t0,
      }),
      equip('{3}'),
    ],
  },
  'The Lunar Whale': {
    abilities: [
      staticAbility({
        kind: 'playFromTop',
        filter: {},
        condition: condition('sourceAttackedThisTurn'),
      }),
      activated(null, { crew: 1 }, [], [{ kind: 'becomeCreature', what: self }], {
        label: 'Crew 1',
      }),
    ],
  },
  'White Auracite': {
    abilities: [
      onEnter([permanent({ nonland: true }, { controller: 'opponent' })], {
        kind: 'exileUntilSourceLeaves',
        what: t0,
      }),
      tapFor('W'),
    ],
  },
  // ------------------------------------------------------------ spells
  'Battle Menu': {
    modes: [
      mode('Attack — a 2/2 Knight', [], token('knight-2-2-token')),
      mode('Ability — +0/+4', [creature], pump(t0, 0, 4)),
      mode(
        'Magic — destroy power 4+',
        [{ what: 'creature', filter: { minPower: 4 } }],
        destroy(t0),
      ),
      mode('Item — gain 4 life', [], gain(4)),
    ],
  },
  'Circle of Power': spell(
    [],
    draw(2),
    lose(2),
    token('wizard-ping-token'),
    pump(yours({ subtype: 'Wizard' }), 1, 0, ['lifelink']),
  ),
  'Cornered by Black Mages': spell([], { kind: 'opponentSacrifices' }, token('wizard-ping-token')),
  'Dreams of Laguna': {
    flashback: mana('{3}{U}'),
    ...spell([], surveil(1), draw(1)),
  },
  Eject: spell([permanent({ nonland: true })], { kind: 'bounce', what: t0 }, draw(1)),
  'Fate of the Sun-Cryst': {
    costReductionIfTarget: { filter: { tapped: true }, amount: 2 },
    ...spell([permanent({ nonland: true })], destroy(t0)),
  },
  'Ice Magic': {
    modes: [
      tier('Blizzard', '{0}', [creature], { kind: 'bounce', what: t0 }),
      // The owner's choice of top or bottom: the top (a simplification).
      tier('Blizzara', '{2}', [creature], { kind: 'putInLibrary', what: t0, position: 'top' }),
      tier('Blizzaga', '{5}{U}', [creature], custom('shuffleIntoLibrary')),
    ],
  },
  "Louisoix's Sacrifice": {
    // Abilities can't be targeted here: a noncreature spell only.
    sacrificeOrPay: mana('{2}'),
    sacrificeToCastFilter: { supertypes: ['Legendary'] },
    ...spell([{ what: 'spell', filter: { notTypes: ['Creature'] } }], {
      kind: 'counter',
      what: t0,
    }),
  },
  'Memories Returning': {
    flashback: mana('{7}{U}{U}'),
    ...spell([], custom('memoriesReturning')),
  },
  Overkill: spell([creature], pump(t0, 0, -9999)),
  "Relm's Sketching": spell([permanent({ types: ['Artifact', 'Creature', 'Land'] })], {
    kind: 'tokenCopy',
    of: t0,
  }),
  'Restoration Magic': {
    modes: [
      tier('Cure', '{0}', [permanent()], pump(t0, 0, 0, ['hexproof', 'indestructible'])),
      tier('Cura', '{1}', [permanent()], pump(t0, 0, 0, ['hexproof', 'indestructible']), gain(3)),
      tier(
        'Curaga',
        '{3}{W}',
        [],
        pump({ each: 'permanent', controller: 'you' }, 0, 0, ['hexproof', 'indestructible']),
        gain(6),
      ),
    ],
  },
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
  // "Prevent all damage to creatures you control this turn": indestructible this turn (a simplification).
  'Bahamut, Warden of Light': summon(
    3,
    chapter(
      [1, 2],
      [],
      counters(yours({ other: true })),
      pump(yours({ other: true }), 0, 0, ['flying']),
    ),
    chapter([3], [permanent()], destroy(t0), custom('blinkFront')),
  ),
  'Shiva, Warden of Ice': summon(
    3,
    chapter([1, 2], [creature], pump(t0, 0, 0, [], { cantBeBlocked: true })),
    chapter(
      [3],
      [],
      {
        kind: 'tap',
        what: { each: 'permanent', controller: 'opponent', filter: { types: ['Land'] } },
      },
      custom('blinkFront'),
    ),
  ),
  'Summon: Esper Maduin': summon(
    3,
    chapter([1], [], custom('revealTopPermanentToHand')),
    chapter([2], [], { kind: 'addMana', mana: [['G'], ['G']] }),
    chapter([3], [], pump(yours({ other: true }), 2, 2, ['trample'])),
  ),
  'Trance Kuja, Fate Defied': {
    // "Wizards deal double damage": +1 damage from Wizards (their pings deal 1, so the same; a simplification).
    abilities: [staticAbility({ kind: 'damageBonus', amount: 1, source: { subtype: 'Wizard' } })],
  },
  'Sephiroth, One-Winged Angel': {
    // "Sacrifice any number of other creatures": one, for a card (a simplification).
    abilities: [
      when(
        { on: 'attacks' },
        [],
        may({
          kind: 'sacrificeSeveral',
          count: 1,
          filter: { types: ['Creature'] },
          then: [draw(1)],
        }),
      ),
    ],
  },
  'World Champion, Celestial Weapon': {
    abilities: [equipped(2, 0, ['doubleStrike']), equip('{3}')],
  },
  "Braska's Final Aeon": summon(
    3,
    chapter([1, 2], [], { kind: 'discard', count: 1, who: 'eachOpponent' }, draw(1)),
    chapter([3], [], { kind: 'opponentSacrifices' }, { kind: 'opponentSacrifices' }),
  ),
  // Jidoor's Adventure.
  Overture: spell([], custom('millHalf')),
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
  // "When the chosen player loses the game, you win the game": always so in a duel.
  'Shinryu, Transcendent Rival': {},
  'Crystallized Serah': {
    abilities: [
      staticAbility({
        kind: 'spellsCostLessIf',
        filter: { types: ['Creature'], supertypes: ['Legendary'] },
        amount: 2,
        condition: condition('noLegendCastThisTurn'),
      }),
      staticAbility({
        kind: 'anthem',
        affects: 'creaturesYouControl',
        filter: { supertypes: ['Legendary'] },
        power: 2,
        toughness: 2,
      }),
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
  'Black Chocobo': {
    abilities: [when({ on: 'landfall' }, [], pump(yours({ subtype: 'Bird' }), 1, 0))],
  },
  'Hades, Sorcerer of Eld': {
    abilities: [
      staticAbility({ kind: 'playFromGraveyardOnYourTurn' }),
      staticAbility({ kind: 'graveyardToExile' }),
    ],
  },
  // Time Compression's extra turn comes with Ultimecia's transform (front face).
  'Ultimecia, Omnipotent': {},
  'Summon: Alexander': summon(
    3,
    chapter([1, 2], [], pump(yours(), 0, 0, ['indestructible'])),
    chapter([3], [], { kind: 'tap', what: { each: 'creature', controller: 'opponent' } }),
  ),
};
