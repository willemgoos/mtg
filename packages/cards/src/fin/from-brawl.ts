import type { Behavior } from '../build.ts';
import { COLORS, tapFor } from '../msc/helpers.ts';
import {
  activated,
  atCombat,
  batch,
  chapter,
  condition,
  counters,
  creatureOrArtifact,
  custom,
  damage,
  destroy,
  drain,
  draw,
  equip,
  equipment,
  equipped,
  jobSelect,
  optional,
  t1,
  yourEquipment,
  graveyardCard,
  lose,
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
  summon,
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
  "Fang, Fearless l'Cie": {
    // Meld with Vanille isn't built (Vanille isn't in these decks).
    abilities: [oncePerTurn(batch(when({ on: 'cardsLeaveYourGraveyard' }, [], draw(1), lose(1))))],
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
  "Joshua, Phoenix's Dominant": {
    abilities: [
      onEnter([], custom('rummageUpTo', { max: 2 })),
      activated(
        '{3}{R}{W}',
        { tapSelf: true },
        [],
        [{ kind: 'blink', what: self, transformed: true }],
        {
          sorcerySpeed: true,
          label: 'Transform',
        },
      ),
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
  'Summon: Knights of Round': summon(
    5,
    chapter([1, 2, 3, 4], [], token('fin-knight-token', 3)),
    chapter([5], [], pump(yours({ other: true }), 2, 2), {
      kind: 'namedCounters',
      name: 'indestructible',
      amount: 1,
      to: yours({ other: true }),
    }),
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
  // "End the turn" isn't built: Ultima destroys and the turn goes on (a simplification).
  Ultima: spell([], {
    kind: 'destroyAll',
    filter: { types: ['Artifact', 'Creature'] },
    permanents: true,
  }),

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
  'Beatrix, Loyal General': {
    abilities: [
      optional(atCombat([{ ...yourCreature, optional: true }], custom('attachEquipmentToTarget'))),
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
  'Summon: Leviathan': summon(
    3,
    chapter([1], [], custom('leviathanWave')),
    // II, III: only Leviathan itself is one of those types in these decks.
    { ...when({ on: 'attacks' }, [], draw(1)), condition: condition('loreTwo') },
  ),
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

  'Cloud, Midgar Mercenary': {
    // Its doubled triggers while equipped aren't built (a simplification).
    abilities: [onEnter([], { kind: 'searchLibrary', filter: equipment, to: 'hand' })],
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
  'Excalibur II': {
    abilities: [
      when({ on: 'youGainLife' }, [], { kind: 'namedCounters', name: 'charge', amount: 1 }),
      equipped({ namedCountersOnSource: 'charge' }, { namedCountersOnSource: 'charge' }),
      equip('{3}'),
    ],
  },
  'Sidequest: Catch a Fish': {
    abilities: [when({ on: 'beginningOfUpkeep', whose: 'yours' }, [], custom('catchAFish'))],
  },
  'The Wind Crystal': {
    abilities: [
      staticAbility({ kind: 'spellsCostLess', filter: { colors: ['W'] }, amount: 1 }),
      staticAbility({ kind: 'doubleLifeGain' }),
      activated('{4}{W}{W}', { tapSelf: true }, [], [pump(yours(), 0, 0, ['flying', 'lifelink'])]),
    ],
  },
  "Moogles' Valor": spell(
    [],
    token('moogle-token', { count: 'creaturesYouControl' }),
    pump(yours(), 0, 0, ['indestructible']),
  ),

  'Kuja, Genome Sorcerer': {
    abilities: [
      when(
        { on: 'beginningOfEndStep', whose: 'yours' },
        [],
        token('fin-wizard-token', 1, { tapped: true }),
        {
          kind: 'if',
          condition: { kind: 'controlsPermanents', filter: { subtype: 'Wizard' }, min: 4 },
          then: [{ kind: 'transform', what: self }],
        },
      ),
    ],
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
  'Nibelheim Aflame': {
    flashback: mana('{5}{R}{R}'),
    ...spell([yourCreature], custom('nibelheim')),
    flashbackSpell: {
      targets: [yourCreature],
      effects: [custom('nibelheim'), { kind: 'discardHand' }, draw(4)],
    },
  },

  // ------------------------------------------------------------ creatures
  'Demon Wall': {
    abilities: [
      staticAbility({ kind: 'attacksWithCounterDespiteDefender' }),
      activated('{5}{B}', {}, [], [counters(self, 2)]),
    ],
  },
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
  'Jecht, Reluctant Guardian': {
    abilities: [
      when(
        { on: 'combatDamageToPlayer' },
        [],
        may({ kind: 'blink', what: self, transformed: true }),
      ),
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
  "Relm's Sketching": spell([permanent({ types: ['Artifact', 'Creature', 'Land'] })], {
    kind: 'tokenCopy',
    of: t0,
  }),
};

/** Back faces of the FIN double-faced cards above. */
export const FROM_BRAWL_BACKS: Record<string, Behavior> = {
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
  'Hades, Sorcerer of Eld': {
    abilities: [
      staticAbility({ kind: 'playFromGraveyardOnYourTurn' }),
      staticAbility({ kind: 'graveyardToExile' }),
    ],
  },
};
