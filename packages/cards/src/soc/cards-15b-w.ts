import type { AbilityDef, Amount, CardDefinition, CardFilter, EffectDef, TargetSpec } from '@mtg/engine';
import { type Behavior, parseManaCost as mana, slug } from '../build.ts';
import { draw, t0, when, yourCreature } from '../blb/helpers.ts';

/**
 * Strixhaven Brawl (15b, white): the white cards of the Brawl decks other than Quintorius
 * (enchantment and Aura matters, bestow, Rooms, tokens). Printed characteristics come from
 * Scryfall; only rules text lives here. One-offs are `custom` handlers in
 * packages/engine/src/brawl-15b-w-effects.ts.
 */

export const SOC_15B_ANGEL = 'soc-15b-w-angel';
export const SOC_15B_PEGASUS = 'soc-15b-w-pegasus';
export const SOC_15B_SPIRIT_3_1 = 'soc-15b-w-spirit-3-1';
export const SOC_15B_WARRIOR = 'soc-15b-w-warrior';
export const SOC_15B_SOLDIER_LIFELINK = 'soc-15b-w-soldier-lifelink';
export const SOC_15B_WB_SPIRIT = 'soc-15b-w-wb-spirit';
export const SOC_15B_SPIRIT_CLERIC = 'soc-15b-w-spirit-cleric';
export const SOC_15B_NYMPH = 'soc-15b-w-nymph';
export const SOC_15B_SORCERER_ROLE = 'soc-15b-w-sorcerer-role';
const SPIRIT_FLYING = 'spirit-flying-token';
const SOLDIER = 'soldier-token';

const token = (
  id: string,
  name: string,
  colors: CardDefinition['colors'],
  subtypes: string[],
  p: number,
  t: number,
  keywords: CardDefinition['keywords'] = [],
  extra: Partial<CardDefinition> = {},
): CardDefinition => ({
  id,
  name,
  manaCost: { generic: 0, colored: {} },
  colors,
  types: ['Creature'],
  supertypes: [],
  subtypes,
  power: p,
  toughness: t,
  keywords,
  abilities: [],
  isToken: true,
  ...extra,
});

const spiritCount: Amount = { count: 'permanentsYouControl', filter: { subtype: 'Spirit' } };

export const BRAWL_15B_W_TOKENS: CardDefinition[] = [
  token(SOC_15B_ANGEL, 'Angel', ['W'], ['Angel'], 4, 4, ['flying']),
  token(SOC_15B_PEGASUS, 'Pegasus', ['W'], ['Pegasus'], 2, 2, ['flying']),
  token(SOC_15B_SPIRIT_3_1, 'Spirit', ['W'], ['Spirit'], 3, 1, ['flying']),
  token(SOC_15B_WARRIOR, 'Warrior', ['W'], ['Warrior'], 1, 1, ['vigilance']),
  token(SOC_15B_SOLDIER_LIFELINK, 'Soldier', ['W'], ['Soldier'], 1, 1, ['lifelink']),
  token(SOC_15B_WB_SPIRIT, 'Spirit', ['W', 'B'], ['Spirit'], 1, 1, ['flying']),
  // "This creature's power and toughness are each equal to the number of Spirits you control."
  token(SOC_15B_SPIRIT_CLERIC, 'Spirit Cleric', ['W'], ['Spirit', 'Cleric'], 0, 0, [], {
    ptEquals: spiritCount,
  }),
  token(SOC_15B_NYMPH, 'Nymph', ['W'], ['Nymph'], 2, 2, [], { types: ['Enchantment', 'Creature'] }),
  // The Sorcerer Role (Spellbook Vendor): "Enchanted creature gets +1/+1 and has 'Whenever this creature attacks, scry 1.'"
  // (the scry is the Role's own trigger on its host attacking).
  {
    id: SOC_15B_SORCERER_ROLE,
    name: 'Sorcerer Role',
    manaCost: { generic: 0, colored: {} },
    colors: ['U'],
    types: ['Enchantment'],
    supertypes: [],
    subtypes: ['Aura', 'Role'],
    keywords: [],
    enchant: { what: 'creature' },
    abilities: [
      { kind: 'static', effect: { kind: 'attached', power: 1, toughness: 1 } },
      when(
        { on: 'creatureYouControlAttacks', filter: { hostOfSource: true } },
        [],
        { kind: 'scry', amount: 1 },
      ),
    ],
    isToken: true,
  },
];

// ---------------------------------------------------------------- shared shapes

const ENCHANTMENT: CardFilter = { types: ['Enchantment'] };
const AURA: CardFilter = { subtype: 'Aura' };
const artifactOrEnchantment: CardFilter = {
  anyOf: [{ types: ['Artifact'] }, { types: ['Enchantment'] }],
};
const enchantmentsYouControl: Amount = { count: 'permanentsYouControl', filter: ENCHANTMENT };
const create = (token: string, count = 1): EffectDef => ({ kind: 'createToken', token, count });
const custom = (handler: string): EffectDef => ({ kind: 'custom', handler });
const onEtb = (targets: TargetSpec[], ...effects: EffectDef[]) =>
  when({ on: 'etb' }, targets, ...effects);
/** Constellation / the enchantment half of eerie: "whenever an enchantment you control enters". */
const constellation = (targets: TargetSpec[], ...effects: EffectDef[]) =>
  when({ on: 'otherPermanentEtb', filter: ENCHANTMENT }, targets, ...effects);
/** The Room half of eerie: "whenever you fully unlock a Room". */
const fullyUnlock = (targets: TargetSpec[], ...effects: EffectDef[]) =>
  when({ on: 'fullyUnlock' }, targets, ...effects);
/** "Whenever you cast a spell that targets this creature." */
const heroic = when(
  { on: 'castSpell', filter: 'targetsSelf' },
  [],
  { kind: 'counters', to: 'self', amount: 1 },
);
/** "Whenever you cast a spell matching the filter, ..." */
const onCast = (spell: CardFilter, targets: TargetSpec[], ...effects: EffectDef[]) =>
  when({ on: 'castSpell', filter: 'any', spell }, targets, ...effects);
const attachedStatic = (
  power: Amount,
  toughness: Amount,
  extra: { keywords?: CardDefinition['keywords'] } = {},
): AbilityDef => ({
  kind: 'static',
  effect: { kind: 'attached', power, toughness, ...extra },
});
const aura = (...abilities: AbilityDef[]): Behavior => ({
  enchant: { what: 'creature' },
  abilities,
});
const yourAuraTarget: TargetSpec = { what: 'creature', controller: 'you' };
const creatureCardInYourGraveyard = (maxManaValue: number): TargetSpec => ({
  what: 'graveyardCard',
  controller: 'you',
  filter: { types: ['Creature'], maxManaValue },
});
const spiritOrEnchantmentCount: Amount = {
  count: 'permanentsYouControl',
  filter: { anyOf: [{ subtype: 'Spirit' }, { types: ['Enchantment'] }] },
};

/**
 * Bestow {cost}: the card is also an Aura (derived into its own definition, `back`, by
 * `bestowAura`); `aura` is what the Aura says on top of the card's own abilities.
 */
function bestow(name: string, cost: string, aura: AbilityDef[], abilities: AbilityDef[]): Behavior {
  return { bestow: mana(cost), bestowAbilities: aura, back: `${slug(name)}-bestow`, abilities };
}

/** The Aura form of a bestow creature (the cards package adds one per card with `bestow`). */
export function bestowAura(front: CardDefinition): CardDefinition {
  return {
    id: front.back!,
    name: front.name,
    ...(front.scryfallId ? { scryfallId: front.scryfallId } : {}),
    manaCost: front.bestow!,
    colors: front.colors,
    types: ['Enchantment'],
    supertypes: [],
    subtypes: ['Aura'],
    keywords: [],
    enchant: { what: 'creature' },
    abilities: [...front.abilities, ...(front.bestowAbilities ?? [])],
    bestowFront: front.id,
    ...(front.colorIdentity ? { colorIdentity: front.colorIdentity } : {}),
  };
}

/** Disturb: the Aura back face is cast from the graveyard for its flashback cost, exiled if it would die. */
const disturbAura = (cost: string, ...abilities: AbilityDef[]): Behavior => ({
  enchant: { what: 'creature' },
  flashback: mana(cost),
  exileInsteadOfGraveyard: true,
  abilities,
});

const ROOM_UNLOCKED = { kind: 'sourceHasCounter', name: 'unlocked' } as const;
const roomLocked = { kind: 'not', condition: ROOM_UNLOCKED } as const;
/** Hospital Room: "Whenever you attack, put a +1/+1 counter on target attacking creature." */
const hospitalRoomTrigger = (gated: boolean): AbilityDef => ({
  kind: 'triggered',
  trigger: { on: 'youAttack' },
  ...(gated ? { condition: ROOM_UNLOCKED } : {}),
  targets: [{ what: 'creature', controller: 'you', filter: { attacking: true } }],
  effects: [{ kind: 'counters', to: t0, amount: 1 }],
});
const unlockDoor = (cost: string, door: string): AbilityDef => ({
  kind: 'activated',
  cost: { mana: mana(cost) },
  sorcerySpeed: true,
  condition: roomLocked,
  targets: [],
  effects: [custom('unlockThisRoom')],
  label: `Unlock ${door} ${cost}`,
});

export const BRAWL_15B_W: Record<string, Behavior> = {
  // ------------------------------------------------------------ creatures
  'Akroan Skyguard': { abilities: [heroic] },
  "Alseid of Life's Bounty": {
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{1}'), sacrificeSelf: true },
        targets: [
          {
            what: 'permanent',
            controller: 'you',
            filter: { anyOf: [{ types: ['Creature'] }, { types: ['Enchantment'] }] },
          },
        ],
        effects: [{ kind: 'chooseCustom', handler: 'alseidColor' }],
        label: '{1}, Sacrifice: protection from the color of your choice',
      },
    ],
  },
  "Archon of Sun's Grace": {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'anthem',
          affects: 'creaturesYouControl',
          filter: { subtype: 'Pegasus' },
          power: 0,
          toughness: 0,
          keywords: ['lifelink'],
        },
      },
      constellation([], create(SOC_15B_PEGASUS)),
    ],
  },
  'Danitha Capashen, Paragon': {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'spellsCostLess',
          filter: { anyOf: [{ subtype: 'Aura' }, { subtype: 'Equipment' }] },
          amount: 1,
        },
      },
    ],
  },
  Flutterfox: {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'while',
          condition: { kind: 'controlsPermanents', filter: artifactOrEnchantment, min: 1 },
          power: 0,
          toughness: 0,
          keywords: ['flying'],
        },
      },
    ],
  },
  'Ghostly Dancers': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'etb' },
        targets: [],
        effects: [],
        modes: [
          {
            label: 'Return an enchantment card from your graveyard to your hand',
            targets: [{ what: 'graveyardCard', controller: 'you', filter: ENCHANTMENT }],
            effects: [{ kind: 'returnToHand', what: t0 }],
          },
          {
            label: 'Unlock a locked door of a Room you control',
            targets: [],
            effects: [custom('unlockOneDoor')],
          },
        ],
      },
      constellation([], create(SOC_15B_SPIRIT_3_1)),
      fullyUnlock([], create(SOC_15B_SPIRIT_3_1)),
    ],
  },
  'Glyph Elemental': bestow(
    'Glyph Elemental',
    '{1}{W}',
    [attachedStatic({ countersOn: 'self' }, { countersOn: 'self' })],
    [when({ on: 'landfall' }, [], { kind: 'counters', to: 'self', amount: 1 })],
  ),
  "Heliod's Pilgrim": {
    abilities: [onEtb([], { kind: 'searchLibrary', filter: AURA, to: 'hand' })],
  },
  'Hero of Iroas': {
    abilities: [
      { kind: 'static', effect: { kind: 'spellsCostLess', filter: AURA, amount: 1 } },
      heroic,
    ],
  },
  'Hopeful Eidolon': bestow(
    'Hopeful Eidolon',
    '{3}{W}',
    [attachedStatic(1, 1, { keywords: ['lifelink'] })],
    [],
  ),
  'Indebted Spirit': bestow(
    'Indebted Spirit',
    '{2}{W}',
    [attachedStatic(1, 1)],
    [
      // Afterlife 1: when this permanent is put into a graveyard from the battlefield.
      when({ on: 'selfToGraveyard' }, [], create(SOC_15B_WB_SPIRIT)),
      // "Enchanted creature has afterlife 1" (kept on the creature face so it still fires once the
      // bestowed Aura has become a creature again).
      when({ on: 'attachedDies' }, [], create(SOC_15B_WB_SPIRIT)),
    ],
  ),
  // Protection from Vampires isn't modelled (see simplifications).
  'Katilda, Dawnhart Martyr': {
    back: 'katildas-rising-dawn',
    disturb: true,
    ptEquals: spiritOrEnchantmentCount,
    abilities: [],
  },
  'Kor Spiritdancer': {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'boost',
          power: {
            multiply: 2,
            amount: {
              count: 'permanentsYouControl',
              filter: { subtype: 'Aura', attachedToSource: true },
            },
          },
          toughness: {
            multiply: 2,
            amount: {
              count: 'permanentsYouControl',
              filter: { subtype: 'Aura', attachedToSource: true },
            },
          },
        },
      },
      {
        kind: 'triggered',
        trigger: { on: 'castSpell', filter: 'any', spell: AURA },
        optional: true,
        targets: [],
        effects: [draw(1)],
      },
    ],
  },
  'Nyxborn Unicorn': bestow(
    'Nyxborn Unicorn',
    '{3}{W}',
    [
      attachedStatic(2, 2),
      // "Enchanted creature has mentor."
      when(
        { on: 'creatureYouControlAttacks', filter: { hostOfSource: true } },
        [
          {
            what: 'creature',
            controller: 'you',
            filter: { attacking: true, lesserPowerThanSource: true },
          },
        ],
        { kind: 'counters', to: t0, amount: 1 },
      ),
    ],
    // Mentor.
    [
      when(
        { on: 'attacks' },
        [
          {
            what: 'creature',
            controller: 'you',
            filter: { attacking: true, lesserPowerThanSource: true },
          },
        ],
        { kind: 'counters', to: t0, amount: 1 },
      ),
    ],
  ),
  'Optimistic Scavenger': {
    abilities: [
      constellation([{ what: 'creature' }], { kind: 'counters', to: t0, amount: 1 }),
      fullyUnlock([{ what: 'creature' }], { kind: 'counters', to: t0, amount: 1 }),
    ],
  },
  'Pearl-Ear, Imperial Advisor': {
    abilities: [
      // Enchantment spells you cast have affinity for Auras.
      {
        kind: 'static',
        effect: {
          kind: 'spellsCostLess',
          filter: ENCHANTMENT,
          amount: { count: 'permanentsYouControl', filter: AURA },
        },
      },
      {
        kind: 'triggered',
        trigger: {
          on: 'castSpell',
          filter: 'any',
          spell: AURA,
          targetFilter: { modified: true },
        },
        targets: [],
        effects: [draw(1)],
      },
    ],
  },
  'Pious Wayfarer': {
    abilities: [
      constellation([{ what: 'creature' }], { kind: 'pump', to: t0, power: 1, toughness: 1 }),
    ],
  },
  'Psemilla, Meletian Poet': {
    abilities: [
      when({ on: 'castSpell', filter: 'firstEnchantment' }, [], create(SOC_15B_NYMPH)),
      {
        kind: 'triggered',
        trigger: { on: 'beginningOfCombat', whose: 'each' },
        condition: { kind: 'controlsPermanents', filter: ENCHANTMENT, min: 5 },
        targets: [],
        effects: [{ kind: 'pump', to: 'self', power: 4, toughness: 4, keywords: ['lifelink'] }],
      },
    ],
  },
  'Restoration Specialist': {
    abilities: [
      {
        kind: 'activated',
        cost: { mana: mana('{W}'), sacrificeSelf: true },
        targets: [
          {
            what: 'graveyardCard',
            controller: 'you',
            optional: true,
            filter: { types: ['Artifact'] },
          },
          {
            what: 'graveyardCard',
            controller: 'you',
            optional: true,
            filter: ENCHANTMENT,
          },
        ],
        effects: [
          { kind: 'returnToHand', what: t0 },
          { kind: 'returnToHand', what: { target: 1 } },
        ],
        label: '{W}, Sacrifice: return up to one artifact and up to one enchantment card',
      },
      {
        // "Up to" targets can only be left out from the end, so an enchantment alone is its own option.
        kind: 'activated',
        cost: { mana: mana('{W}'), sacrificeSelf: true },
        targets: [{ what: 'graveyardCard', controller: 'you', filter: ENCHANTMENT }],
        effects: [{ kind: 'returnToHand', what: t0 }],
        label: '{W}, Sacrifice: return an enchantment card',
      },
    ],
  },
  'Sky-Blessed Samurai': { costReduction: enchantmentsYouControl, abilities: [] },
  'Slumbering Keepguard': {
    abilities: [
      constellation([], { kind: 'scry', amount: 1 }),
      {
        kind: 'activated',
        cost: { mana: mana('{2}{W}') },
        targets: [],
        effects: [
          {
            kind: 'pump',
            to: 'self',
            power: enchantmentsYouControl,
            toughness: enchantmentsYouControl,
          },
        ],
        label: '{2}{W}: +1/+1 for each enchantment you control',
      },
    ],
  },
  'Spellbook Vendor': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'beginningOfCombat', whose: 'yours' },
        cost: mana('{1}'),
        targets: [yourCreature],
        effects: [custom('createRole')],
      },
    ],
  },
  'Spirited Companion': { abilities: [onEtb([], draw(1))] },
  'Sram, Senior Edificer': {
    abilities: [
      onCast({ anyOf: [{ subtype: 'Aura' }, { subtype: 'Equipment' }, { subtype: 'Vehicle' }] }, [], draw(1)),
    ],
  },
  'Starfield Mystic': {
    abilities: [
      { kind: 'static', effect: { kind: 'spellsCostLess', filter: ENCHANTMENT, amount: 1 } },
      when(
        { on: 'permanentYouControlDies', filter: ENCHANTMENT },
        [],
        { kind: 'counters', to: 'self', amount: 1 },
      ),
    ],
  },
  'Twinblade Geist': { back: 'twinblade-invocation', disturb: true, abilities: [] },
  'Doomed Traveler': { abilities: [when({ on: 'dies' }, [], create(SPIRIT_FLYING))] },
  'Hunted Witness': { abilities: [when({ on: 'dies' }, [], create(SOC_15B_SOLDIER_LIFELINK))] },
  'Mondrak, Glory Dominus': {
    abilities: [
      { kind: 'static', effect: { kind: 'doubleTokens' } },
      {
        // {1}{W/P}{W/P}, Sacrifice two other artifacts and/or creatures: an indestructible counter.
        kind: 'activated',
        cost: { mana: mana('{1}{W}{W}') },
        condition: {
          kind: 'amountAtLeast',
          amount: {
            count: 'permanentsYouControl',
            filter: { anyOf: [{ types: ['Artifact'] }, { types: ['Creature'] }] },
            other: true,
          },
          min: 2,
        },
        targets: [],
        effects: [
          {
            kind: 'sacrificeSeveral',
            count: 2,
            filter: { anyOf: [{ types: ['Artifact'] }, { types: ['Creature'] }] },
            then: [{ kind: 'namedCounters', name: 'indestructible', amount: 1 }],
          },
        ],
        label: '{1}{W/P}{W/P}, Sacrifice two other artifacts and/or creatures: indestructible counter',
      },
    ],
  },
  'Welcoming Vampire': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'otherCreatureEtb', controller: 'you', filter: { maxPower: 2 } },
        oncePerTurn: true,
        targets: [],
        effects: [draw(1)],
      },
    ],
  },
  'Elspeth, Storm Slayer': {
    abilities: [
      { kind: 'static', effect: { kind: 'doubleTokens' } },
      {
        kind: 'activated',
        cost: { loyalty: 1 },
        targets: [],
        effects: [create(SOLDIER)],
        label: '+1: create a 1/1 white Soldier creature token',
      },
      {
        kind: 'activated',
        cost: { loyalty: 0 },
        targets: [],
        effects: [
          { kind: 'counters', to: { each: 'creature', controller: 'you' }, amount: 1 },
          {
            kind: 'pump',
            to: { each: 'creature', controller: 'you' },
            power: 0,
            toughness: 0,
            keywords: ['flying'],
            untilYourNextTurn: true,
          },
        ],
        label: '0: +1/+1 counter on each creature you control; they gain flying until your next turn',
      },
      {
        kind: 'activated',
        cost: { loyalty: -3 },
        targets: [
          { what: 'creature', controller: 'opponent', filter: { minManaValue: 3 } },
        ],
        effects: [{ kind: 'destroy', what: t0 }],
        label: '−3: destroy target creature an opponent controls with mana value 3 or greater',
      },
    ],
  },
  // ------------------------------------------------------------ instants and sorceries
  Condemn: {
    spell: {
      targets: [{ what: 'creature', filter: { attacking: true } }],
      effects: [
        { kind: 'gainLife', who: { controllerOf: 0 }, amount: { toughnessOf: t0 } },
        { kind: 'putInLibrary', what: t0, position: 'bottom' },
      ],
    },
  },
  "Eriette's Lullaby": {
    spell: {
      targets: [{ what: 'creature', filter: { tapped: true } }],
      effects: [
        { kind: 'destroy', what: t0 },
        { kind: 'gainLife', who: 'controller', amount: 2 },
      ],
    },
  },
  'Divine Reckoning': {
    spell: {
      targets: [],
      effects: [
        { kind: 'chooseCustom', handler: 'divineChoose', params: { who: 'you' } },
        { kind: 'chooseCustom', handler: 'divineChoose', params: { who: 'opponent' } },
        custom('divineDestroy'),
      ],
    },
    flashback: mana('{5}{W}{W}'),
  },
  'Raise the Alarm': { spell: { targets: [], effects: [create(SOLDIER, 2)] } },
  // ------------------------------------------------------------ auras
  'All That Glitters': aura(
    attachedStatic(
      { count: 'permanentsYouControl', filter: artifactOrEnchantment },
      { count: 'permanentsYouControl', filter: artifactOrEnchantment },
    ),
  ),
  'Cartouche of Solidarity': {
    enchant: yourAuraTarget,
    abilities: [
      onEtb([], create(SOC_15B_WARRIOR)),
      attachedStatic(1, 1, { keywords: ['firstStrike'] }),
    ],
  },
  'Chosen by Heliod': aura(onEtb([], draw(1)), attachedStatic(0, 2)),
  'Ethereal Armor': aura(
    attachedStatic(enchantmentsYouControl, enchantmentsYouControl, { keywords: ['firstStrike'] }),
  ),
  Reprobation: aura(
    // Simplified: it loses its abilities and is 0/1, but keeps its creature types.
    onEtb([], { kind: 'loseAbilities', what: 'attached', basePT: [0, 1], whileSource: true }),
  ),
  "Sage's Reverie": aura(
    onEtb([], {
      kind: 'draw',
      who: 'controller',
      amount: { count: 'permanentsYouControl', filter: { subtype: 'Aura', attachedToCreature: true } },
    }),
    attachedStatic(
      { count: 'permanentsYouControl', filter: { subtype: 'Aura', attachedToCreature: true } },
      { count: 'permanentsYouControl', filter: { subtype: 'Aura', attachedToCreature: true } },
    ),
  ),
  "Shardmage's Rescue": {
    enchant: yourAuraTarget,
    abilities: [
      // "As long as this Aura entered this turn, enchanted creature has hexproof."
      onEtb([], { kind: 'pump', to: 'attached', power: 0, toughness: 0, keywords: ['hexproof'] }),
      attachedStatic(1, 1),
    ],
  },
  'Sheltered by Ghosts': {
    enchant: yourAuraTarget,
    abilities: [
      onEtb(
        [{ what: 'permanent', controller: 'opponent', filter: { nonland: true } }],
        { kind: 'exileUntilSourceLeaves', what: t0 },
      ),
      attachedStatic(1, 0, { keywords: ['lifelink', 'ward'] }),
    ],
  },
  "Skyblade's Boon": aura(
    attachedStatic(1, 1, { keywords: ['flying'] }),
    {
      kind: 'activated',
      cost: { mana: mana('{2}{W}') },
      targets: [],
      effects: [{ kind: 'bounce', what: 'self' }],
      label: '{2}{W}: return Skyblade\'s Boon to its owner\'s hand',
    },
    {
      kind: 'activated',
      cost: { mana: mana('{2}{W}') },
      fromGraveyard: true,
      targets: [],
      effects: [{ kind: 'returnSource', to: 'hand' }],
      label: '{2}{W}: return Skyblade\'s Boon to its owner\'s hand (from your graveyard)',
    },
  ),
  // ------------------------------------------------------------ enchantments
  'Hallowed Haunting': {
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'anthem',
          affects: 'creaturesYouControl',
          power: 0,
          toughness: 0,
          keywords: ['flying', 'vigilance'],
          condition: { kind: 'controlsPermanents', filter: ENCHANTMENT, min: 7 },
        },
      },
      onCast(ENCHANTMENT, [], create(SOC_15B_SPIRIT_CLERIC)),
    ],
  },
  'Seal Away': {
    abilities: [
      onEtb(
        [{ what: 'creature', controller: 'opponent', filter: { tapped: true } }],
        { kind: 'exileUntilSourceLeaves', what: t0 },
      ),
    ],
  },
  'Sigil of the Empty Throne': { abilities: [onCast(ENCHANTMENT, [], create(SOC_15B_ANGEL))] },
  'Muster the Departed': {
    abilities: [
      onEtb([], create(SPIRIT_FLYING)),
      {
        kind: 'triggered',
        trigger: { on: 'beginningOfEndStep', whose: 'yours' },
        condition: { kind: 'creatureDiedThisTurn' },
        targets: [],
        effects: [custom('populate')],
      },
    ],
  },
  // A Room: cast as either half; the other door unlocks later for its cost (a counter marks both unlocked).
  'Surgical Suite': {
    abilities: [
      onEtb([creatureCardInYourGraveyard(3)], { kind: 'returnToBattlefield', what: t0 }),
      hospitalRoomTrigger(true),
      unlockDoor('{3}{W}', 'Hospital Room'),
    ],
  },
  'Snow-Covered Plains': {},
};

/** Back faces: the Aura sides of the disturb cards and the second Room door. */
export const BRAWL_15B_W_BACKS: Record<string, Behavior> = {
  "Katilda's Rising Dawn": disturbAura(
    '{3}{W}{W}',
    // Simplified: no protection from Vampires.
    attachedStatic(spiritOrEnchantmentCount, spiritOrEnchantmentCount, {
      keywords: ['flying', 'lifelink'],
    }),
  ),
  'Twinblade Invocation': disturbAura(
    '{2}{W}',
    attachedStatic(0, 0, { keywords: ['doubleStrike'] }),
  ),
  'Hospital Room': {
    abilities: [
      hospitalRoomTrigger(false),
      {
        kind: 'triggered',
        trigger: { on: 'doorUnlocked', door: 'front' },
        targets: [creatureCardInYourGraveyard(3)],
        effects: [{ kind: 'returnToBattlefield', what: t0 }],
      },
      unlockDoor('{1}{W}', 'Surgical Suite'),
    ],
  },
};
