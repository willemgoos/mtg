import type {
  AbilityDef,
  Amount,
  CardDefinition,
  CardFilter,
  EffectDef,
  Ref,
  TargetSpec,
} from '@mtg/engine';
import type { Behavior } from '../build.ts';
import {
  atYourCombat,
  draw,
  mana,
  onEnter,
  prowess,
  pump,
  t0,
  t1,
  when,
  yours,
} from '../blb/helpers.ts';
import { tapFor } from '../msc/helpers.ts';

/**
 * Strixhaven Brawl (15b, red and blue-red): the cards of the red and Izzet part of the other seven
 * Brawl decks (Rootha's, Galazeth's and the rest). One-offs are custom effects in
 * packages/engine/src/brawl-15b-r-effects.ts. Already implemented elsewhere (skipped): Abrade,
 * Flashback, Guttersnipe, Talisman of Creativity, Sulfur Falls, Swiftwater Cliffs, Izzet Guildgate.
 */

const custom = (handler: string): EffectDef => ({ kind: 'custom', handler });
const ELEMENTAL = 'brawl-elemental-1-1-red-token';
const DINOSAUR = 'soc-15b-r-dinosaur-token';
const HUMAN_SOLDIER = 'soc-15b-r-human-soldier-token';
const SPAWN = 'soc-15b-r-eldrazi-spawn-token';
const SERVO = 'soc-15b-r-servo-token';
const SOLDIER = 'soc-15b-r-soldier-token';
const WEIRD = 'soc-15b-r-weird-token';
const ROOTHA_ELEMENTAL = 'soc-15b-r-rootha-elemental-token';
const STORM_ELEMENTAL = 'soc-15b-r-storm-elemental-token';

const token = (
  id: string,
  count = 1,
  extra: Partial<EffectDef & { kind: 'createToken' }> = {},
): EffectDef => ({ kind: 'createToken', token: id, count, ...extra }) as EffectDef;
const treasure = (count = 1, tapped = false): EffectDef =>
  token('treasure-token', count, tapped ? { tapped: true } : {});
const damage = (amount: Amount, to: Ref = t0): EffectDef => ({ kind: 'damage', amount, to });
const burn = (amount: number, target: TargetSpec = { what: 'any' }): Behavior => ({
  spell: { targets: [target], effects: [damage(amount)] },
});
const artifact: CardFilter = { types: ['Artifact'] };
const artifactsYouControl = { count: 'permanentsYouControl', filter: artifact } as const;
const instantOrSorceryCard: CardFilter = { types: ['Instant', 'Sorcery'] };
const COMBAT_STEPS = [
  'beginCombat',
  'declareAttackers',
  'declareBlockers',
  'firstStrikeDamage',
  'combatDamage',
  'endCombat',
] as const;
const anyTarget: TargetSpec = { what: 'any' };

/** "Whenever an artifact you control enters, ..." (the permanent itself isn't one of these creatures). */
const artifactEnters = (targets: TargetSpec[], ...effects: EffectDef[]): AbilityDef =>
  when({ on: 'otherPermanentEtb', filter: artifact }, targets, ...effects);

const instantOrSorceryCast = (...effects: EffectDef[]): AbilityDef =>
  when({ on: 'castSpell', filter: 'instantOrSorcery' }, [], ...effects);

const izzetPair = [tapFor('U'), tapFor('R')];
const shockTrigger: AbilityDef = {
  kind: 'triggered',
  trigger: { on: 'etb' },
  targets: [],
  effects: [{ kind: 'chooseCustom', handler: 'shockLand' }],
};

/** Dowsing Device: up to one target creature gets +1/+0 and haste; then transform if you control four or more artifacts. */
const dowsingTrigger = (
  trigger: { on: 'etb' } | { on: 'otherPermanentEtb'; filter: CardFilter },
): AbilityDef =>
  when(
    trigger,
    [{ what: 'creature', controller: 'you', optional: true }],
    pump(t0, 1, 0, ['haste']),
    {
      kind: 'if',
      condition: { kind: 'controlsPermanents', filter: artifact, min: 4 },
      then: [{ kind: 'transform', what: 'self' }],
    },
  );

const spreeMode = (
  cost: string,
  label: string,
  targets: TargetSpec[],
  ...effects: EffectDef[]
) => ({
  paws: 1,
  cost: mana(cost),
  spell: { label: `+ ${cost}: ${label}`, targets, effects },
});

export const BRAWL_15B_R: Record<string, Behavior> = {
  // ------------------------------------------------------------ red creatures
  'Young Pyromancer': { abilities: [instantOrSorceryCast(token(ELEMENTAL))] },
  'Goldspan Dragon': {
    abilities: [
      when({ on: 'attacks' }, [], treasure()),
      when({ on: 'castSpell', filter: 'targetsSelf', caster: 'any' }, [], treasure()),
      { kind: 'static', effect: { kind: 'treasuresTapForTwo' } },
    ],
  },
  'Magda, Brazen Outlaw': {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'anthem',
          affects: 'otherCreaturesYouControl',
          filter: { subtype: 'Dwarf' },
          power: 1,
          toughness: 0,
        },
      },
      when({ on: 'creatureYouControlBecomesTapped', filter: { subtype: 'Dwarf' } }, [], treasure()),
      {
        kind: 'activated',
        cost: { sacrificeArtifacts: 5, sacrificeArtifactsFilter: { subtype: 'Treasure' } },
        targets: [],
        effects: [
          {
            kind: 'searchLibrary',
            filter: { anyOf: [artifact, { subtype: 'Dragon' }] },
            to: 'battlefield',
          },
        ],
        label:
          'Sacrifice five Treasures: search for an artifact or Dragon card, put it onto the battlefield',
      },
    ],
  },
  'Reckless Fireweaver': { abilities: [artifactEnters([], damage(1, 'eachOpponent'))] },
  // ------------------------------------------------------------ red spells
  'Great Train Heist': {
    spree: true,
    pawprints: [
      spreeMode(
        '{2}{R}',
        'untap all creatures you control; if it is your combat phase, an additional combat phase follows',
        [],
        { kind: 'untap', what: yours },
        {
          kind: 'if',
          condition: { kind: 'yourStep', steps: [...COMBAT_STEPS] },
          then: [{ kind: 'extraCombat' }],
        },
      ),
      spreeMode(
        '{2}',
        'creatures you control get +1/+0 and first strike until end of turn',
        [],
        pump(yours, 1, 0, ['firstStrike']),
      ),
      spreeMode(
        '{R}',
        'whenever a creature you control deals combat damage to the opponent this turn, create a tapped Treasure',
        [],
        {
          kind: 'emblem',
          until: 'thisTurn',
          ability: {
            kind: 'triggered',
            trigger: { on: 'creatureYouControlDealsCombatDamage', toPlayer: true },
            targets: [],
            effects: [treasure(1, true)],
          },
        },
      ),
    ],
  },
  Sear: burn(4, { what: 'permanent', filter: { types: ['Creature', 'Planeswalker'] } }),
  'Stoke the Flames': { convoke: true, ...burn(4) },
  'Flame Slash': burn(4, { what: 'creature' }),
  'Lightning Bolt': burn(3),
  'Seize the Storm': {
    spell: { targets: [], effects: [token(STORM_ELEMENTAL)] },
    flashback: mana('{6}{R}'),
  },
  'Return the Favor': {
    spree: true,
    pawprints: [
      spreeMode(
        '{1}',
        'copy target instant or sorcery spell (abilities cannot be copied here)',
        [{ what: 'spell', filter: instantOrSorceryCard }],
        { kind: 'copySpell', what: t0 },
      ),
      spreeMode(
        '{1}',
        'change the target of target spell with a single target',
        [{ what: 'spell' }],
        { kind: 'chooseCustom', handler: 'changeTarget' },
      ),
    ],
  },
  "Mizzix's Mastery": {
    afterResolving: 'exile',
    spell: {
      targets: [{ what: 'graveyardCard', controller: 'you', filter: instantOrSorceryCard }],
      effects: [{ kind: 'chooseCustom', handler: 'mizzixMastery' }],
    },
    // Overload {5}{R}{R}{R}.
    kicker: {
      cost: mana('{5}{R}{R}{R}'),
      replacesCost: true,
      as: 'overload',
      altLabel: 'Overload {5}{R}{R}{R}',
      spell: {
        targets: [],
        effects: [{ kind: 'chooseCustom', handler: 'mizzixMastery', params: { overload: true } }],
      },
    },
  },
  'Forbidden Friendship': {
    spell: { targets: [], effects: [token(DINOSAUR), token(HUMAN_SOLDIER)] },
  },
  'Glimpse the Impossible': { spell: { targets: [], effects: [custom('glimpseExile')] } },
  'Demand Answers': {
    sacrificeArtifactOrDiscardToCast: true,
    spell: { targets: [], effects: [draw(2)] },
  },
  'Torch the Tower': {
    spell: {
      targets: [{ what: 'permanent', filter: { types: ['Creature', 'Planeswalker'] } }],
      effects: [{ kind: 'pump', to: t0, power: 0, toughness: 0, exileIfDies: true }, damage(2)],
    },
    // Bargain: sacrifice an artifact, enchantment or token as you cast it.
    kicker: {
      cost: { generic: 0, colored: {} },
      sacrifice: { anyOf: [artifact, { types: ['Enchantment'] }, { token: true }] },
      spell: {
        targets: [{ what: 'permanent', filter: { types: ['Creature', 'Planeswalker'] } }],
        effects: [
          { kind: 'pump', to: t0, power: 0, toughness: 0, exileIfDies: true },
          damage(3),
          { kind: 'scry', amount: 1 },
        ],
      },
    },
  },
  'Unexpected Windfall': {
    discardToCast: true,
    spell: { targets: [], effects: [draw(2), treasure(2)] },
  },
  'Welding Sparks': {
    spell: {
      targets: [{ what: 'creature' }],
      effects: [damage({ sum: [3, artifactsYouControl] })],
    },
  },
  'Strike It Rich': {
    spell: { targets: [], effects: [treasure()] },
    flashback: mana('{2}{R}'),
  },
  'Weaponize the Monsters': {
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{2}'), sacrificeCreature: true },
        targets: [anyTarget],
        effects: [damage(2)],
        label: '{2}, sacrifice a creature: 2 damage to any target',
      },
    ],
  },
  'Arcane Bombardment': {
    abilities: [
      when({ on: 'castSpell', filter: 'firstInstantOrSorcery' }, [], {
        kind: 'chooseCustom',
        handler: 'arcaneBombardment',
      }),
    ],
  },
  // ------------------------------------------------------------ red artifacts, lands
  'Dowsing Device': {
    abilities: [
      dowsingTrigger({ on: 'etb' }),
      dowsingTrigger({ on: 'otherPermanentEtb', filter: artifact }),
    ],
  },
  'Snow-Covered Mountain': {},
  'Gate to Tumbledown': {
    entersTapped: true,
    abilities: [
      tapFor('R'),
      {
        kind: 'activated',
        cost: { mana: mana('{3}{R}'), tapSelf: true },
        once: true,
        targets: [],
        effects: [custom('seekNonland')],
        label: '{3}{R}, {T}: seek a nonland card (once)',
      },
    ],
  },
  // ------------------------------------------------------------ blue-red
  'Rootha, Mastering the Moment': {
    abilities: [
      {
        ...atYourCombat(
          [],
          token(ROOTHA_ELEMENTAL, 1, { counters: { count: 'greatestInstantSorceryCastThisTurn' } }),
        ),
        condition: { kind: 'castInstantOrSorceryThisTurn' },
      } as AbilityDef,
    ],
  },
  'Frolicking Familiar': {
    abilities: [when({ on: 'castSpell', filter: 'instantOrSorcery' }, [], pump('self', 1, 1))],
  },
  'Goblin Electromancer': {
    abilities: [{ kind: 'static', effect: { kind: 'instantsAndSorceriesCostLess', amount: 1 } }],
  },
  'Muddle, the Ever-Changing': {
    // Myriad only matters with more than one opponent, so it is left out.
    abilities: [
      when(
        { on: 'castSpell', filter: 'instantOrSorcery' },
        [{ what: 'creature', controller: 'you', filter: { nonlegendary: true }, optional: true }],
        { kind: 'becomeCopy', of: t0 },
      ),
    ],
  },
  'Sapphire Collector': {
    abilities: [
      prowess,
      {
        kind: 'triggered',
        trigger: { on: 'castSpell', filter: 'secondNoncreature' },
        condition: { kind: 'not', condition: { kind: 'sourceHasCounter', name: 'conjured' } },
        targets: [],
        effects: [
          { kind: 'namedCounters', name: 'conjured', amount: 1 },
          custom('conjureMoxSapphire'),
        ],
      },
      {
        kind: 'activated',
        cost: { mana: mana('{2}{U}') },
        targets: [{ what: 'graveyardCard', controller: 'you', filter: instantOrSorceryCard }],
        effects: [custom('grantFlashback')],
        label:
          '{2}{U}: target instant or sorcery card in your graveyard gains flashback until end of turn',
      },
    ],
  },
  // Conjured by Sapphire Collector (an Alchemy card), so it is in the pool but not in any deck.
  'Mox Sapphire': { abilities: [tapFor('U')] },
  'Third Path Iconoclast': {
    abilities: [when({ on: 'castSpell', filter: 'noncreature' }, [], token(SOLDIER))],
  },
  'Experimental Overload': {
    afterResolving: 'exile',
    spell: {
      targets: [],
      effects: [
        token(WEIRD, 1, { counters: { count: 'cardsInGraveyard', types: ['Instant', 'Sorcery'] } }),
        { kind: 'may', effects: [{ kind: 'returnFromGraveyard', types: ['Instant', 'Sorcery'] }] },
      ],
    },
  },
  'Illuminating Lash': {
    spell: { targets: [anyTarget], effects: [damage(3), custom('lashBoon')] },
  },
  'Izzet Signet': {
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{1}'), tapSelf: true },
        targets: [],
        effects: [{ kind: 'addMana', mana: [['U'], ['R']] }],
        label: '{1}, {T}: Add {U}{R}',
      },
    ],
  },
  'Frostcliff Siege': {
    abilities: [
      onEnter({
        kind: 'choose',
        options: [
          { label: 'Jeskai', effects: [{ kind: 'namedCounters', name: 'jeskai', amount: 1 }] },
          { label: 'Temur', effects: [{ kind: 'namedCounters', name: 'temur', amount: 1 }] },
        ],
      }),
      {
        ...when({ on: 'creaturesYouControlDealCombatDamageToPlayer' }, [], draw(1)),
        batch: true,
        condition: { kind: 'sourceHasCounter', name: 'jeskai' },
      } as AbilityDef,
      {
        kind: 'static',
        effect: {
          kind: 'anthem',
          affects: 'creaturesYouControl',
          power: 1,
          toughness: 0,
          keywords: ['trample', 'haste'],
          condition: { kind: 'sourceHasCounter', name: 'temur' },
        },
      },
    ],
  },
  "Mm'menon, Uthros Exile": {
    abilities: [artifactEnters([{ what: 'creature' }], { kind: 'counters', to: t0, amount: 1 })],
  },
  'Niv-Mizzet, Parun': {
    abilities: [
      when({ on: 'drawCard', whose: 'yours' }, [anyTarget], damage(1)),
      when({ on: 'castSpell', filter: 'instantOrSorcery', caster: 'any' }, [], draw(1)),
    ],
  },
  'Izzet Charm': {
    modes: [
      {
        label: 'Counter target noncreature spell unless its controller pays {2}',
        targets: [{ what: 'spell', filter: { notTypes: ['Creature'] } }],
        effects: [{ kind: 'counterUnlessPays', what: t0, cost: mana('{2}') }],
      },
      {
        label: 'Izzet Charm deals 2 damage to target creature',
        targets: [{ what: 'creature' }],
        effects: [damage(2)],
      },
      {
        label: 'Draw two cards, then discard two cards',
        targets: [],
        effects: [draw(2), { kind: 'discard', count: 2 }],
      },
    ],
  },
  'Saheeli, Sublime Artificer': {
    abilities: [
      when({ on: 'castSpell', filter: 'noncreature' }, [], token(SERVO)),
      {
        // Simplified: the copy has only the copied permanent's types (not also an artifact).
        kind: 'activated',
        cost: { loyalty: -2 },
        targets: [
          { what: 'permanent', controller: 'you', filter: artifact },
          {
            what: 'permanent',
            controller: 'you',
            filter: { anyOf: [artifact, { types: ['Creature'] }] },
          },
        ],
        effects: [{ kind: 'becomeCopy', what: t0, of: t1 }],
        label:
          '−2: target artifact you control becomes a copy of another target artifact or creature you control until end of turn',
      },
    ],
  },
  // ------------------------------------------------------------ lands
  'Shivan Reef': {
    abilities: [tapFor('C'), tapFor('U', { pain: true }), tapFor('R', { pain: true })],
  },
  'Steam Vents': { entersTapped: true, abilities: [...izzetPair, shockTrigger] },
  'Thundering Falls': {
    entersTapped: true,
    abilities: [...izzetPair, onEnter({ kind: 'surveil', amount: 1 })],
  },
  'Molten Tributary': { entersTapped: true, abilities: izzetPair },
  'Riverpyre Verge': {
    abilities: [
      tapFor('R'),
      tapFor('U', {
        condition: {
          kind: 'controlsPermanents',
          filter: { types: ['Land'], subtypes: ['Island', 'Mountain'] },
          min: 1,
        },
      }),
    ],
  },
  'Surtland Frostpyre': {
    entersTapped: true,
    abilities: [
      tapFor('R'),
      {
        kind: 'activated',
        cost: { mana: mana('{2}{U}{U}{R}'), tapSelf: true, sacrificeSelf: true },
        sorcerySpeed: true,
        targets: [],
        effects: [{ kind: 'scry', amount: 2 }, damage(2, { each: 'creature' })],
        label: '{2}{U}{U}{R}, {T}, sacrifice: scry 2; 2 damage to each creature (sorcery speed)',
      },
    ],
  },
};

/** The back faces: Geode Grotto (Dowsing Device) and Blow Off Steam (Frolicking Familiar's Adventure). */
export const BRAWL_15B_R_BACKS: Record<string, Behavior> = {
  'Geode Grotto': {
    abilities: [
      tapFor('R'),
      {
        kind: 'activated',
        cost: { mana: mana('{2}{R}'), tapSelf: true },
        sorcerySpeed: true,
        targets: [{ what: 'creature' }],
        effects: [pump(t0, artifactsYouControl, 0, ['haste'])],
        label: '{2}{R}, {T}: target creature gains haste and gets +X/+0, X = artifacts you control',
      },
    ],
  },
  'Blow Off Steam': { spell: { targets: [anyTarget], effects: [damage(1)] } },
};

const makeToken = (
  id: string,
  name: string,
  colors: CardDefinition['colors'],
  types: CardDefinition['types'],
  subtypes: string[],
  power: number,
  toughness: number,
  extra: Partial<CardDefinition> = {},
): CardDefinition => ({
  id,
  name,
  manaCost: { generic: 0, colored: {} },
  colors,
  types,
  supertypes: [],
  subtypes,
  power,
  toughness,
  keywords: [],
  abilities: [],
  isToken: true,
  ...extra,
});

export const BRAWL_15B_R_TOKENS: CardDefinition[] = [
  makeToken(DINOSAUR, 'Dinosaur', ['R'], ['Creature'], ['Dinosaur'], 1, 1, { keywords: ['haste'] }),
  makeToken(HUMAN_SOLDIER, 'Human Soldier', ['W'], ['Creature'], ['Human', 'Soldier'], 1, 1),
  makeToken(SPAWN, 'Eldrazi Spawn', [], ['Creature'], ['Eldrazi', 'Spawn'], 0, 1, {
    abilities: [
      {
        kind: 'activated',
        cost: { sacrificeSelf: true },
        targets: [],
        effects: [{ kind: 'addMana', mana: [['C']] }],
        label: 'Sacrifice this creature: Add {C}',
      },
    ],
  }),
  makeToken(SERVO, 'Servo', [], ['Artifact', 'Creature'], ['Servo'], 1, 1),
  makeToken(SOLDIER, 'Soldier', [], ['Artifact', 'Creature'], ['Soldier'], 1, 1),
  makeToken(WEIRD, 'Weird', ['U', 'R'], ['Creature'], ['Weird'], 0, 0),
  makeToken(ROOTHA_ELEMENTAL, 'Elemental', ['U', 'R'], ['Creature'], ['Elemental'], 0, 0, {
    keywords: ['flying', 'haste'],
  }),
  makeToken(STORM_ELEMENTAL, 'Elemental', ['R'], ['Creature'], ['Elemental'], 0, 0, {
    keywords: ['trample'],
    ptEquals: { count: 'instantsSorceriesInGraveyardPlusFlashbackInExile' },
  }),
];
