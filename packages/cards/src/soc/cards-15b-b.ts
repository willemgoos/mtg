import type { AbilityDef, CardDefinition, CardFilter, EffectDef, TargetSpec } from '@mtg/engine';
import { type Behavior, parseManaCost as mana } from '../build.ts';
import { draw, drain, gain, t0, when, yourCreature } from '../blb/helpers.ts';
import { tapFor, unlessYouControlType } from '../msc/helpers.ts';

/**
 * Strixhaven Brawl (15b, black): the black cards of the Brawl precons that the
 * Quintorius deck didn't need (mostly sacrifice and "whenever a creature dies"
 * engines). Printed characteristics come from Scryfall; only rules text lives
 * here. One-offs are `custom` handlers in packages/engine/src/brawl-15b-b-effects.ts.
 */

const custom = (handler: string): EffectDef => ({ kind: 'custom', handler });
const token = (id: string, count = 1): EffectDef => ({ kind: 'createToken', token: id, count });
const treasure: EffectDef = token('treasure-token');
const tokenDef = (
  id: string,
  name: string,
  colors: CardDefinition['colors'],
  subtypes: string[],
  p: number,
  t: number,
  keywords: CardDefinition['keywords'] = [],
  abilities: AbilityDef[] = [],
  types: CardDefinition['types'] = ['Creature'],
): CardDefinition => ({
  id,
  name,
  manaCost: { generic: 0, colored: {} },
  colors,
  types,
  supertypes: [],
  subtypes,
  power: p,
  toughness: t,
  keywords,
  abilities,
  isToken: true,
});

const SCION = 'soc-15b-b-eldrazi-scion-token';
const SPIRIT = 'soc-15b-b-spirit-token';
const CLERIC = 'soc-15b-b-human-cleric-token';
const SOLDIER = 'soc-15b-b-human-soldier-token';
const SERVO = 'soc-15b-b-servo-token';
const MERCENARY = 'soc-15b-b-mercenary-token';
const FUNGUS = 'soc-15b-b-fungus-token';
const WORM = 'soc-15b-b-worm-token';
const HARPY = 'soc-15b-b-harpy-token';
const WICKED_ROLE = 'soc-15b-b-wicked-role-token';

export const BRAWL_15B_B_TOKENS: CardDefinition[] = [
  tokenDef(
    SCION,
    'Eldrazi Scion',
    [],
    ['Eldrazi', 'Scion'],
    1,
    1,
    [],
    [{ kind: 'mana', cost: { sacrificeSelf: true }, produces: 'C' }],
  ),
  tokenDef(SPIRIT, 'Spirit', ['W'], ['Spirit'], 1, 1),
  tokenDef(CLERIC, 'Human Cleric', ['W', 'B'], ['Human', 'Cleric'], 1, 1),
  tokenDef(SOLDIER, 'Human Soldier', ['W'], ['Human', 'Soldier'], 1, 1),
  tokenDef(SERVO, 'Servo', [], ['Servo'], 1, 1, [], [], ['Artifact', 'Creature']),
  tokenDef(
    MERCENARY,
    'Mercenary',
    ['R'],
    ['Mercenary'],
    1,
    1,
    [],
    [
      {
        kind: 'activated',
        cost: { tapSelf: true },
        sorcerySpeed: true,
        targets: [yourCreature],
        effects: [{ kind: 'pump', to: t0, power: 1, toughness: 0 }],
        label: '{T}: target creature you control gets +1/+0 until end of turn (sorcery speed)',
      },
    ],
  ),
  tokenDef(
    FUNGUS,
    'Fungus',
    ['B'],
    ['Fungus'],
    1,
    1,
    [],
    [{ kind: 'static', effect: { kind: 'cantBlock' } }],
  ),
  tokenDef(WORM, 'Worm', ['B', 'G'], ['Worm'], 1, 1),
  tokenDef(HARPY, 'Harpy', ['B'], ['Harpy'], 1, 1, ['flying']),
  // The Wicked Role: enchanted creature gets +1/+1; when the token is put into a graveyard, each opponent loses 1 life.
  {
    id: WICKED_ROLE,
    name: 'Wicked Role',
    manaCost: { generic: 0, colored: {} },
    colors: ['B'],
    types: ['Enchantment'],
    supertypes: [],
    subtypes: ['Aura', 'Role'],
    keywords: [],
    abilities: [
      { kind: 'static', effect: { kind: 'attached', power: 1, toughness: 1 } },
      when({ on: 'tokenToGraveyard' }, [], { kind: 'loseLife', who: 'eachOpponent', amount: 1 }),
    ],
    isToken: true,
  },
];

// ------------------------------------------------------------ shapes
const anyPlayer: TargetSpec = { what: 'player' };
const opponent: TargetSpec = { what: 'player', controller: 'opponent' };
const creatureOrWalker: TargetSpec = {
  what: 'permanent',
  filter: { types: ['Creature', 'Planeswalker'] },
};
const creatureCardInYourGraveyard = (optional = false): TargetSpec => ({
  what: 'graveyardCard',
  controller: 'you',
  filter: { types: ['Creature'] },
  ...(optional ? { optional: true } : {}),
});
const artifactOrCreature: CardFilter = {
  anyOf: [{ types: ['Artifact'] }, { types: ['Creature'] }],
};

/** "When this creature dies, ..." */
const onDies = (targets: TargetSpec[], ...effects: EffectDef[]): AbilityDef =>
  when({ on: 'dies' }, targets, ...effects);
/** "Whenever this creature or another creature dies, ..." (two abilities). */
const anyCreatureDies = (targets: TargetSpec[], ...effects: EffectDef[]): AbilityDef[] => [
  when({ on: 'dies' }, targets, ...effects),
  when({ on: 'otherCreatureDies', controller: 'any' }, targets, ...effects),
];
/** "Whenever a creature you control dies, ..." (this one included). */
const yourCreatureDies = (targets: TargetSpec[], ...effects: EffectDef[]): AbilityDef =>
  when({ on: 'creatureYouControlDies' }, targets, ...effects);

const equip = (cost: string): AbilityDef => ({
  kind: 'activated',
  cost: { mana: mana(cost) },
  sorcerySpeed: true,
  targets: [yourCreature],
  effects: [{ kind: 'attach', to: t0 }],
  label: `Equip ${cost}`,
});

/** Shock-style MDFC land back face: "As this enters, you may pay 3 life. If you don't, it enters tapped." */
const payLifeLand = (produces: 'B'): Behavior => ({
  entersTapped: true,
  abilities: [
    tapFor(produces),
    when({ on: 'etb' }, [], {
      kind: 'may',
      effects: [
        { kind: 'loseLife', who: 'controller', amount: 3 },
        { kind: 'untap', what: 'self' },
      ],
    }),
  ],
});

export const BRAWL_15B_B: Record<string, Behavior> = {
  // ------------------------------------------------------------ creatures
  // Front of Boggart Trawler // Boggart Bog.
  'Boggart Trawler': {
    back: 'boggart-bog',
    abilities: [when({ on: 'etb' }, [anyPlayer], { kind: 'exileGraveyard', who: t0 })],
  },
  'Hateful Eidolon': {
    abilities: [
      when({ on: 'otherCreatureDies', controller: 'any' }, [], custom('eidolonDraw')),
      onDies([], custom('eidolonDraw')),
    ],
  },
  'Abhorrent Overlord': {
    abilities: [
      when({ on: 'etb' }, [], custom('harpies')),
      when({ on: 'beginningOfUpkeep', whose: 'yours' }, [], {
        kind: 'sacrificeSeveral',
        count: 1,
        filter: { types: ['Creature'] },
        includeSource: true,
        then: [],
      }),
    ],
  },
  'Accursed Marauder': {
    abilities: [
      when(
        { on: 'etb' },
        [],
        {
          kind: 'opponentSacrifices',
          you: true,
          filter: { types: ['Creature'], nontoken: true },
        },
        { kind: 'opponentSacrifices', filter: { types: ['Creature'], nontoken: true } },
      ),
    ],
  },
  'Carrier Thrall': { abilities: [onDies([], token(SCION))] },
  'Changeling Outcast': {
    abilities: [
      { kind: 'static', effect: { kind: 'cantBlock' } },
      { kind: 'static', effect: { kind: 'cantBeBlocked' } },
    ],
  },
  // Simplified: drafting from the spellbook is drawing a card.
  'Cursebound Witch': { abilities: [onDies([], draw(1))] },
  'Enduring Tenacity': {
    abilities: [
      when({ on: 'youGainLife' }, [opponent], {
        kind: 'loseLife',
        who: t0,
        amount: { event: 'amount' },
      }),
      onDies([], custom('enduringReturn')),
    ],
  },
  'Gixian Infiltrator': {
    abilities: [
      when({ on: 'youSacrifice', filter: { other: true } }, [], {
        kind: 'counters',
        to: 'self',
        amount: 1,
      }),
    ],
  },
  'Greedy Freebooter': { abilities: [onDies([], { kind: 'scry', amount: 1 }, treasure)] },
  'Legion Vanguard': {
    abilities: [
      {
        kind: 'activated',
        cost: {
          mana: mana('{1}'),
          sacrificePermanent: { other: true, types: ['Creature'] },
        },
        targets: [],
        effects: [{ kind: 'explore', what: 'self' }],
        label: '{1}, Sacrifice another creature: this creature explores',
      },
    ],
  },
  'Nested Shambler': {
    abilities: [
      onDies([], {
        kind: 'createToken',
        token: 'squirrel-token',
        count: { powerOf: 'self' },
        tapped: true,
      }),
    ],
  },
  'Synapse Necromage': { abilities: [onDies([], token(FUNGUS, 2))] },
  'Umbral Collar Zealot': {
    abilities: [
      {
        kind: 'activated',
        cost: { sacrificePermanent: { ...artifactOrCreature, other: true } },
        targets: [],
        effects: [{ kind: 'surveil', amount: 1 }],
        label: 'Sacrifice another creature or artifact: surveil 1',
      },
    ],
  },
  'Vein Ripper': {
    abilities: [...anyCreatureDies([opponent], { kind: 'loseLife', who: t0, amount: 2 }, gain(2))],
  },
  'Blood Artist': {
    abilities: [...anyCreatureDies([anyPlayer], { kind: 'loseLife', who: t0, amount: 1 }, gain(1))],
  },
  'Marionette Apprentice': {
    abilities: [
      when({ on: 'etb' }, [], {
        kind: 'choose',
        options: [
          {
            label: 'Put a +1/+1 counter on it',
            effects: [{ kind: 'counters', to: 'self', amount: 1 }],
          },
          { label: 'Create a 1/1 Servo', effects: [token(SERVO)] },
        ],
      }),
      when(
        { on: 'permanentYouControlDies', filter: { types: ['Creature', 'Artifact'] }, other: true },
        [],
        { kind: 'loseLife', who: 'eachOpponent', amount: 1 },
      ),
    ],
  },
  'Nezumi Linkbreaker': { abilities: [onDies([], token(MERCENARY))] },
  'Shambling Ghast': {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'dies' },
        targets: [],
        effects: [],
        modes: [
          {
            label: 'Target creature an opponent controls gets -1/-1 until end of turn',
            targets: [{ what: 'creature', controller: 'opponent' }],
            effects: [{ kind: 'pump', to: t0, power: -1, toughness: -1 }],
          },
          { label: 'Create a Treasure token', targets: [], effects: [treasure] },
        ],
      },
    ],
  },
  'Terrors of the Track': {
    abilities: [
      when({ on: 'attacks' }, [], custom('doubleTeam')),
      {
        ...when({ on: 'dies' }, [], { kind: 'loseLife', who: 'eachOpponent', amount: 1 }, gain(1)),
        oncePerTurn: true,
      } as AbilityDef,
      {
        ...when(
          { on: 'otherCreatureDies', controller: 'any' },
          [],
          { kind: 'loseLife', who: 'eachOpponent', amount: 1 },
          gain(1),
        ),
        oncePerTurn: true,
      } as AbilityDef,
    ],
  },
  'Wriggling Grub': { abilities: [onDies([], token(WORM, 2))] },
  'Zulaport Cutthroat': { abilities: [yourCreatureDies([], ...drain(1))] },

  // ------------------------------------------------------------ planeswalker
  'Liliana, Dreadhorde General': {
    abilities: [
      yourCreatureDies([], draw(1)),
      {
        kind: 'activated',
        cost: { loyalty: 1 },
        targets: [],
        effects: [token('zombie-token')],
        label: '+1: create a 2/2 black Zombie creature token',
      },
      {
        kind: 'activated',
        cost: { loyalty: -4 },
        targets: [],
        effects: [{ kind: 'repeat', count: 2, effects: [{ kind: 'eachPlayerSacrifices' }] }],
        label: '−4: each player sacrifices two creatures of their choice',
      },
      {
        kind: 'activated',
        cost: { loyalty: -9 },
        targets: [],
        effects: [custom('lilianaUltimate')],
        label: '−9: each opponent chooses a permanent of each type and sacrifices the rest',
      },
    ],
  },

  // ------------------------------------------------------------ auras and enchantments
  'Demonic Embrace': {
    enchant: { what: 'creature' },
    castFromGraveyardWithDiscard: true,
    graveyardCastLife: 3,
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'attached',
          power: 3,
          toughness: 1,
          keywords: ['flying'],
          addSubtypes: ['Demon'],
        },
      },
    ],
  },
  // Simplified: it enchants only a creature you control, and returns it only when it dies (not when exiled).
  "Kaya's Ghostform": {
    enchant: { what: 'creature', controller: 'you' },
    abilities: [when({ on: 'attachedDies' }, [], custom('returnEnchanted'))],
  },
  "Minion's Return": {
    enchant: { what: 'creature' },
    abilities: [when({ on: 'attachedDies' }, [], custom('returnEnchanted'))],
  },
  "Lord Skitter's Blessing": {
    abilities: [
      when({ on: 'etb' }, [yourCreature], token(WICKED_ROLE), {
        kind: 'attach',
        what: 'chosen',
        to: t0,
      }),
      {
        ...when(
          { on: 'beginningOfDraw' },
          [],
          { kind: 'loseLife', who: 'controller', amount: 1 },
          draw(1),
        ),
        condition: { kind: 'controlsCreature', filter: { enchanted: true } },
      } as AbilityDef,
    ],
  },
  'Nowhere to Run': {
    abilities: [
      when({ on: 'etb' }, [{ what: 'creature', controller: 'opponent' }], {
        kind: 'pump',
        to: t0,
        power: -3,
        toughness: -3,
      }),
      { kind: 'static', effect: { kind: 'ignoreHexproofWard' } },
    ],
  },
  'Grave Pact': { abilities: [yourCreatureDies([], { kind: 'opponentSacrifices' })] },
  // Simplified: X is the target's mana value, and the creature you control with the greatest toughness is blighted.
  'Blighted Nightmare': {
    abilities: [
      when({ on: 'etb' }, [], custom('perpetualBoost')),
      {
        kind: 'activated',
        cost: { returnSelf: true },
        sorcerySpeed: true,
        condition: { kind: 'controlsCreature', filter: {} },
        targets: [creatureCardInYourGraveyard()],
        effects: [custom('blightReturn')],
        label:
          'Blight X, return this enchantment to its owner’s hand: return a creature card with mana value X or less',
      },
    ],
  },
  'Spectacle of Destruction': {
    abilities: [
      {
        ...when({ on: 'otherCreatureDies', controller: 'any' }, [], {
          kind: 'namedCounters',
          name: 'wreck',
          amount: 1,
        }),
        batch: true,
      } as AbilityDef,
      {
        ...when({ on: 'beginningOfUpkeep', whose: 'yours' }, [], custom('spectacleUpkeep')),
        condition: { kind: 'sourceNamedCounters', name: 'wreck', min: 1 },
      } as AbilityDef,
    ],
  },

  // ------------------------------------------------------------ instants and sorceries
  'Infernal Grasp': {
    spell: {
      targets: [{ what: 'creature' }],
      effects: [
        { kind: 'destroy', what: t0 },
        { kind: 'loseLife', who: 'controller', amount: 2 },
      ],
    },
  },
  'Go for the Throat': {
    spell: {
      targets: [{ what: 'creature', filter: { notTypes: ['Artifact'] } }],
      effects: [{ kind: 'destroy', what: t0 }],
    },
  },
  'Deadly Dispute': {
    sacrificeCreatureToCast: true,
    sacrificeToCastFilter: artifactOrCreature,
    spell: { targets: [], effects: [draw(2), treasure] },
  },
  'Corrupted Conviction': {
    sacrificeCreatureToCast: true,
    spell: { targets: [], effects: [draw(2)] },
  },
  'Annihilating Glare': {
    sacrificeOrPay: mana('{4}'),
    sacrificeToCastFilter: artifactOrCreature,
    spell: { targets: [creatureOrWalker], effects: [{ kind: 'destroy', what: t0 }] },
  },
  'Bone Shards': {
    discardOrSacrifice: true,
    spell: { targets: [creatureOrWalker], effects: [{ kind: 'destroy', what: t0 }] },
  },
  'Bitter Triumph': {
    discardOrLife: 3,
    spell: { targets: [creatureOrWalker], effects: [{ kind: 'destroy', what: t0 }] },
  },
  // Front of Fell the Profane // Fell Mire.
  'Fell the Profane': {
    back: 'fell-mire',
    spell: { targets: [creatureOrWalker], effects: [{ kind: 'destroy', what: t0 }] },
  },
  'Soul Shatter': {
    spell: {
      targets: [],
      effects: [
        {
          kind: 'opponentSacrifices',
          filter: { types: ['Creature', 'Planeswalker'] },
          greatestManaValue: true,
        },
      ],
    },
  },
  'Blasphemous Edict': {
    costReductionIf: {
      condition: { kind: 'amountAtLeast', amount: { count: 'creaturesOnBattlefield' }, min: 13 },
      amount: 3,
      alsoColored: 'B',
    },
    spell: {
      targets: [],
      effects: [{ kind: 'repeat', count: 13, effects: [{ kind: 'eachPlayerSacrifices' }] }],
    },
  },
  "Auntie's Sentence": {
    modes: [
      {
        label:
          'Target opponent reveals their hand; you choose a nonland permanent card from it; they discard it',
        targets: [opponent],
        effects: [
          {
            kind: 'chooseFromOpponentHand',
            filter: { nonland: true, notTypes: ['Instant', 'Sorcery'] },
            then: 'discard',
          },
        ],
      },
      {
        label: 'Target creature gets -2/-2 until end of turn',
        targets: [{ what: 'creature' }],
        effects: [{ kind: 'pump', to: t0, power: -2, toughness: -2 }],
      },
    ],
  },
  // Front of Malakir Rebirth // Malakir Mire.
  'Malakir Rebirth': {
    back: 'malakir-mire',
    spell: {
      targets: [{ what: 'creature' }],
      effects: [
        { kind: 'loseLife', who: 'controller', amount: 2 },
        {
          kind: 'pump',
          to: t0,
          power: 0,
          toughness: 0,
          returnWhenDies: { counters: 0, treasure: false },
        },
      ],
    },
  },
  Victimize: {
    spell: {
      targets: [creatureCardInYourGraveyard(), creatureCardInYourGraveyard()],
      effects: [
        {
          kind: 'sacrificeSeveral',
          count: 1,
          filter: { types: ['Creature'] },
          then: [
            { kind: 'returnToBattlefield', what: t0, tapped: true },
            { kind: 'returnToBattlefield', what: { target: 1 }, tapped: true },
          ],
        },
      ],
    },
  },
  // Front of Ghost Lantern // Bind Spirit: an Adventure.
  'Ghost Lantern': {
    back: 'bind-spirit',
    abilities: [
      yourCreatureDies([], { kind: 'counters', to: 'attached', amount: 1 }),
      equip('{1}'),
    ],
  },

  // ------------------------------------------------------------ lands
  'Gate of the Black Dragon': {
    entersTapped: true,
    abilities: [
      tapFor('B'),
      {
        kind: 'activated',
        cost: { mana: mana('{3}{B}'), tapSelf: true },
        once: true,
        targets: [],
        effects: [custom('seekNonland')],
        label: '{3}{B}, {T}: seek a nonland card (once)',
      },
    ],
  },
  'Great Arashin City': {
    entersTappedIf: unlessYouControlType('G', 'W'),
    abilities: [
      tapFor('B'),
      {
        kind: 'activated',
        cost: { mana: mana('{1}{B}'), tapSelf: true, exileFromGraveyard: { types: ['Creature'] } },
        targets: [],
        effects: [token(SPIRIT)],
        label: '{1}{B}, {T}, exile a creature card from your graveyard: create a 1/1 Spirit',
      },
    ],
  },
  // Simplified: the second ability uses the stack and adds the mana to your pool.
  'Phyrexian Tower': {
    abilities: [
      tapFor('C'),
      {
        kind: 'activated',
        cost: { tapSelf: true, sacrificeCreature: true },
        targets: [],
        effects: [{ kind: 'addMana', mana: [['B'], ['B']] }],
        label: '{T}, Sacrifice a creature: add {B}{B}',
      },
    ],
  },
  // Front of Westvale Abbey // Ormendahl, Profane Prince.
  'Westvale Abbey': {
    back: 'ormendahl-profane-prince',
    abilities: [
      tapFor('C'),
      {
        kind: 'activated',
        cost: { mana: mana('{5}'), tapSelf: true, life: 1 },
        targets: [],
        effects: [token(CLERIC)],
        label: '{5}, {T}, pay 1 life: create a 1/1 Human Cleric',
      },
      {
        kind: 'activated',
        cost: { mana: mana('{5}'), tapSelf: true },
        condition: { kind: 'controlsCreature', filter: {}, count: 5 },
        targets: [],
        effects: [
          {
            kind: 'sacrificeSeveral',
            count: 5,
            filter: { types: ['Creature'] },
            then: [
              { kind: 'transform', what: 'self' },
              { kind: 'untap', what: 'self' },
            ],
          },
        ],
        label: '{5}, {T}, sacrifice five creatures: transform this land, then untap it',
      },
    ],
  },
  "Witch's Cottage": {
    entersTappedIf: {
      kind: 'not',
      condition: { kind: 'controlsPermanents', filter: { subtype: 'Swamp' }, min: 3 },
    },
    abilities: [
      tapFor('B'),
      {
        ...when({ on: 'etb' }, [creatureCardInYourGraveyard(true)], custom('cottageTopdeck')),
        condition: { kind: 'not', condition: { kind: 'sourceTapped' } },
      } as AbilityDef,
    ],
  },
  // Simplified: "choose a colour other than black" also offers black (which adds nothing).
  'Thriving Moor': {
    entersTapped: true,
    abilities: [
      when({ on: 'etb' }, [], { kind: 'chooseColor' }),
      tapFor('B'),
      ...(['W', 'U', 'R', 'G'] as const).map((c) => tapFor(c, { ifChosen: true })),
    ],
  },
  'Snow-Covered Swamp': {},
};

/** Back faces: the lands of the MDFCs and the Adventure of Ghost Lantern. */
export const BRAWL_15B_B_BACKS: Record<string, Behavior> = {
  'Boggart Bog': payLifeLand('B'),
  'Fell Mire': payLifeLand('B'),
  'Malakir Mire': { entersTapped: true, abilities: [tapFor('B')] },
  'Bind Spirit': {
    spell: {
      targets: [creatureCardInYourGraveyard()],
      effects: [{ kind: 'returnToHand', what: t0 }],
    },
  },
};
