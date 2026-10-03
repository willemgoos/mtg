import type { Behavior } from '../build.ts';
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
  'Summon: Alexander': summon(
    3,
    chapter([1, 2], [], pump(yours(), 0, 0, ['indestructible'])),
    chapter([3], [], { kind: 'tap', what: { each: 'creature', controller: 'opponent' } }),
  ),
};
