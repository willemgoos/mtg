import { createEngine } from '../src/engine.ts';
import { getCharacteristics } from '../src/index.ts';
import { buildScenario, GameDriver, type ScenarioSpec } from '../src/testing.ts';
import type {
  AbilityDef,
  Action,
  Amount,
  CardDefinition,
  ConditionDef,
  EffectDef,
  GameState,
  Keyword,
  ManaCost,
  ObjectId,
  PlayerId,
  Ref,
  TargetSpec,
} from '../src/types.ts';
import { ECL } from './ecl-fixtures.ts';
import { FIXTURES } from './helpers.ts';

// ---------------------------------------------------------------------------
// Wilds of Eldraine (23a): Roles, bargain, celebration, the Restless and Sphere lands, tapping the opponent's creatures, Adventures.
// The Role tokens are copies of the definitions `roleToken` builds in packages/cards/src/woe-vocab.ts (same ids).
// ---------------------------------------------------------------------------

export const cost = (generic: number, colored: ManaCost['colored'] = {}): ManaCost => ({
  generic,
  colored,
});

function card(d: Partial<CardDefinition> & Pick<CardDefinition, 'id'>): CardDefinition {
  return {
    name: d.id,
    manaCost: cost(0),
    colors: [],
    types: [],
    supertypes: [],
    subtypes: [],
    keywords: [],
    abilities: [],
    ...d,
  };
}

function creature(
  id: string,
  p: number,
  t: number,
  extra: Partial<CardDefinition> = {},
  keywords: Keyword[] = [],
): CardDefinition {
  return card({ id, types: ['Creature'], power: p, toughness: t, keywords, ...extra });
}

const yourCreature: TargetSpec = { what: 'creature', controller: 'you' };
const t0 = { target: 0 } as const;
const etb = (
  effects: EffectDef[],
  targets: TargetSpec[] = [],
  condition?: ConditionDef,
): AbilityDef => ({
  kind: 'triggered',
  trigger: { on: 'etb' },
  targets,
  effects,
  ...(condition ? { condition } : {}),
});
const attacks = (effects: EffectDef[], condition?: ConditionDef): AbilityDef => ({
  kind: 'triggered',
  trigger: { on: 'attacks' },
  targets: [],
  effects,
  ...(condition ? { condition } : {}),
});
const sorcery = (
  id: string,
  c: ManaCost,
  targets: TargetSpec[],
  effects: EffectDef[],
  extra: Partial<CardDefinition> = {},
) => card({ id, types: ['Sorcery'], manaCost: c, spell: { targets, effects }, ...extra });
const instant = (
  id: string,
  c: ManaCost,
  targets: TargetSpec[],
  effects: EffectDef[],
  extra: Partial<CardDefinition> = {},
) => card({ id, types: ['Instant'], manaCost: c, spell: { targets, effects }, ...extra });

// ---- Roles (as roleToken builds them)
const role = (id: string, name: string, abilities: AbilityDef[]): CardDefinition =>
  card({
    id,
    name: `${name} Role`,
    types: ['Enchantment'],
    subtypes: ['Aura', 'Role'],
    enchant: { what: 'creature' },
    isToken: true,
    abilities,
  });
const attached = (power: Amount, toughness: Amount, extra: object = {}): AbilityDef =>
  ({ kind: 'static', effect: { kind: 'attached', power, toughness, ...extra } }) as AbilityDef;
const enchantments: Amount = { count: 'permanentsYouControl', filter: { types: ['Enchantment'] } };

export const ROLES = {
  cursed: 'woe-cursed-role',
  monster: 'woe-monster-role',
  royal: 'woe-royal-role',
  sorcerer: 'woe-sorcerer-role',
  virtuous: 'woe-virtuous-role',
  wicked: 'woe-wicked-role',
  youngHero: 'woe-young-hero-role',
};
const createRole = (r: string, to: Ref = t0): EffectDef => ({ kind: 'createRole', role: r, to });

const BARGAIN: CardDefinition['kicker'] = {
  cost: cost(0),
  as: 'bargain',
  sacrifice: { anyOf: [{ types: ['Artifact'] }, { types: ['Enchantment'] }, { token: true }] },
};
const bargained: ConditionDef = { kind: 'wasKicked' };
const celebration: ConditionDef = { kind: 'celebration' };

export const WOE: CardDefinition[] = [
  role(ROLES.cursed, 'Cursed', [attached(0, 0, { basePT: [1, 1] })]),
  role(ROLES.monster, 'Monster', [attached(1, 1, { keywords: ['trample'] })]),
  role(ROLES.royal, 'Royal', [attached(1, 1, { keywords: ['wardOne'] })]),
  role(ROLES.sorcerer, 'Sorcerer', [
    attached(1, 1, { grantAbilities: [attacks([{ kind: 'scry', amount: 1 }])] }),
  ]),
  role(ROLES.virtuous, 'Virtuous', [attached(enchantments, enchantments)]),
  role(ROLES.wicked, 'Wicked', [
    attached(1, 1),
    {
      kind: 'triggered',
      trigger: { on: 'tokenToGraveyard' },
      targets: [],
      effects: [{ kind: 'loseLife', who: 'eachOpponent', amount: 1 }],
    },
  ]),
  role(ROLES.youngHero, 'Young Hero', [
    attached(0, 0, {
      grantAbilities: [
        attacks([{ kind: 'counters', to: 'self', amount: 1 }], {
          kind: 'not',
          condition: { kind: 'amountAtLeast', amount: { toughnessOf: 'self' }, min: 4 },
        }),
      ],
    }),
  ]),
  // ---- Role makers
  // Guard Change-like: create a Monster Role token attached to target creature you control.
  instant('w-guard-change', cost(0, { G: 1 }), [yourCreature], [createRole(ROLES.monster)]),
  sorcery('w-betroth-royal', cost(0, { W: 1 }), [yourCreature], [createRole(ROLES.royal)]),
  sorcery('w-sorcerer-role', cost(0, { U: 1 }), [yourCreature], [createRole(ROLES.sorcerer)]),
  sorcery('w-virtuous-role', cost(0, { W: 1 }), [yourCreature], [createRole(ROLES.virtuous)]),
  sorcery('w-wicked-role', cost(0, { B: 1 }), [yourCreature], [createRole(ROLES.wicked)]),
  sorcery('w-young-hero-role', cost(0, { R: 1 }), [yourCreature], [createRole(ROLES.youngHero)]),
  // Spiteful Hexmage's text on any creature: a Cursed Role on target creature.
  sorcery('w-curse', cost(0, { B: 1 }), [{ what: 'creature' }], [createRole(ROLES.cursed)]),
  // Asinine Antics: for each creature your opponents control, a Cursed Role attached to that creature.
  sorcery(
    'w-antics',
    cost(0, { U: 1 }),
    [],
    [createRole(ROLES.cursed, { each: 'creature', controller: 'opponent' })],
  ),
  // Cursed Courtier: 3/3 lifelink; when it enters, a Cursed Role attached to it.
  creature(
    'w-courtier',
    3,
    3,
    { manaCost: cost(0, { W: 1 }), abilities: [etb([createRole(ROLES.cursed, 'self')])] },
    ['lifelink'],
  ),
  // Return Triumphant: return target creature card with mana value 3 or less, then a Young Hero Role attached to it.
  sorcery(
    'w-return-triumphant',
    cost(0, { W: 1 }),
    [
      {
        what: 'graveyardCard',
        controller: 'you',
        filter: { types: ['Creature'], maxManaValue: 3 },
      },
    ],
    [{ kind: 'returnToBattlefield', what: t0 }, createRole(ROLES.youngHero, 'chosen')],
  ),
  // Wicked Visitor: whenever an enchantment you control is put into a graveyard from the battlefield, each opponent loses 1 life.
  creature('w-visitor', 2, 2, {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'permanentYouControlDies', filter: { types: ['Enchantment'] } },
        targets: [],
        effects: [{ kind: 'loseLife', who: 'eachOpponent', amount: 1 }],
      },
    ],
  }),
  // Tanglespan Lookout: whenever an Aura you control enters, draw a card.
  creature('w-lookout', 2, 3, {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'otherPermanentEtb', filter: { subtype: 'Aura' } },
        targets: [],
        effects: [{ kind: 'draw', who: 'controller', amount: 1 }],
      },
    ],
  }),
  // A Tale for the Ages: enchanted creatures you control get +2/+2.
  card({
    id: 'w-tale',
    types: ['Enchantment'],
    manaCost: cost(1, { W: 1 }),
    abilities: [
      {
        kind: 'static',
        effect: {
          kind: 'anthem',
          affects: 'creaturesYouControl',
          filter: { enchanted: true },
          power: 2,
          toughness: 2,
        },
      },
    ],
  }),
  // ---- Bargain fodder and cards
  card({
    id: 'w-food',
    name: 'Food',
    types: ['Artifact'],
    subtypes: ['Food'],
    isToken: true,
    abilities: [
      {
        kind: 'activated',
        cost: { mana: cost(2), tapSelf: true, sacrificeSelf: true },
        targets: [],
        effects: [{ kind: 'gainLife', who: 'controller', amount: 3 }],
      },
    ],
  }),
  card({ id: 'w-trinket', types: ['Artifact'], manaCost: cost(1) }),
  card({ id: 'w-charm', types: ['Enchantment'], manaCost: cost(1) }),
  // Candy Grapple: target creature gets -3/-3 until end of turn; bargained, -5/-5 instead.
  instant(
    'w-grapple',
    cost(1, { B: 1 }),
    [{ what: 'creature' }],
    [
      {
        kind: 'if',
        condition: bargained,
        then: [{ kind: 'pump', to: t0, power: -5, toughness: -5 }],
        else: [{ kind: 'pump', to: t0, power: -3, toughness: -3 }],
      },
    ],
    { kicker: BARGAIN },
  ),
  // Hamlet Glutton: {5}{G}{G} 6/6 trample; costs {2} less if bargained; when it enters, you gain 3 life.
  creature(
    'w-glutton',
    6,
    6,
    {
      manaCost: cost(5, { G: 2 }),
      kicker: { ...BARGAIN!, costReduction: 2 },
      abilities: [etb([{ kind: 'gainLife', who: 'controller', amount: 3 }])],
    },
    ['trample'],
  ),
  // High Fae Negotiator: {3}{B}{B} 3/5 flying; when it enters, if it was bargained, each opponent loses 3 life and you gain 3.
  creature(
    'w-negotiator',
    3,
    5,
    {
      manaCost: cost(3, { B: 2 }),
      kicker: BARGAIN,
      abilities: [
        etb(
          [
            { kind: 'loseLife', who: 'eachOpponent', amount: 3 },
            { kind: 'gainLife', who: 'controller', amount: 3 },
          ],
          [],
          bargained,
        ),
      ],
    },
    ['flying'],
  ),
  // ---- Celebration
  creature('w-mice', 3, 1, {
    manaCost: cost(1, { W: 1 }),
    abilities: [
      { kind: 'static', effect: { kind: 'while', condition: celebration, power: 0, toughness: 2 } },
    ],
  }),
  creature('w-pests', 2, 2, {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'beginningOfCombat', whose: 'yours' },
        condition: celebration,
        targets: [],
        effects: [{ kind: 'counters', to: 'self', amount: 1 }],
      },
    ],
  }),
  creature(
    'w-ash',
    2,
    2,
    { abilities: [attacks([{ kind: 'counters', to: 'self', amount: 1 }], celebration)] },
    ['haste'],
  ),
  // ---- The Restless lands, the Sphere lands
  card({
    id: 'w-bivouac',
    name: 'Restless Bivouac',
    types: ['Land'],
    entersTapped: true,
    abilities: [
      { kind: 'mana', cost: { tapSelf: true }, produces: 'R' },
      { kind: 'mana', cost: { tapSelf: true }, produces: 'W' },
      {
        kind: 'activated',
        cost: { mana: cost(1, { R: 1, W: 1 }) },
        targets: [],
        effects: [
          {
            kind: 'animate',
            what: 'self',
            power: 2,
            toughness: 2,
            colors: ['R', 'W'],
            subtype: 'Ox',
          },
        ],
      },
      {
        kind: 'triggered',
        trigger: { on: 'attacks' },
        targets: [yourCreature],
        effects: [{ kind: 'counters', to: t0, amount: 1 }],
      },
    ],
  }),
  card({
    id: 'w-spire',
    name: 'Restless Spire',
    types: ['Land'],
    entersTapped: true,
    abilities: [
      { kind: 'mana', cost: { tapSelf: true }, produces: 'U' },
      { kind: 'mana', cost: { tapSelf: true }, produces: 'R' },
      {
        kind: 'activated',
        cost: { mana: cost(0, { U: 1, R: 1 }) },
        targets: [],
        effects: [
          {
            kind: 'animate',
            what: 'self',
            power: 2,
            toughness: 1,
            colors: ['U', 'R'],
            subtype: 'Elemental',
            abilities: [
              {
                kind: 'static',
                effect: {
                  kind: 'while',
                  condition: { kind: 'yourTurn' },
                  power: 0,
                  toughness: 0,
                  keywords: ['firstStrike'],
                },
              },
            ],
          },
        ],
      },
    ],
  }),
  // Brave the Wilds (its bargained half): target land you control becomes a 3/3 Elemental creature with haste that's still a land.
  sorcery(
    'w-brave',
    cost(0, { G: 1 }),
    [{ what: 'permanent', controller: 'you', filter: { types: ['Land'] } }],
    [
      {
        kind: 'animate',
        what: t0,
        power: 3,
        toughness: 3,
        subtype: 'Elemental',
        keywords: ['haste'],
        permanent: true,
      },
    ],
  ),
  card({
    id: 'w-basilica',
    name: 'The Fair Basilica',
    types: ['Land'],
    subtypes: ['Sphere'],
    entersTapped: true,
    abilities: [
      { kind: 'mana', cost: { tapSelf: true }, produces: 'W' },
      {
        kind: 'activated',
        cost: { mana: cost(1, { W: 1 }), tapSelf: true, sacrificeSelf: true },
        targets: [],
        effects: [{ kind: 'draw', who: 'controller', amount: 1 }],
      },
    ],
  }),
  // ---- Tapping the opponent's creatures
  // Icewrought Sentry's second ability: whenever you tap an untapped creature an opponent controls, it gets +2/+1.
  creature('w-sentry', 2, 3, {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'youTapOpponentCreature' },
        targets: [],
        effects: [{ kind: 'pump', to: 'self', power: 2, toughness: 1 }],
      },
    ],
  }),
  // Sharae: whenever you tap one or more untapped creatures your opponents control, draw a card (once each turn).
  creature('w-sharae', 2, 3, {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'youTapOpponentCreature' },
        batch: true,
        oncePerTurn: true,
        targets: [],
        effects: [{ kind: 'draw', who: 'controller', amount: 1 }],
      },
    ],
  }),
  // Succumb to the Cold: tap one or two target creatures an opponent controls; a stun counter on each.
  instant(
    'w-succumb',
    cost(0, { U: 1 }),
    [
      { what: 'creature', controller: 'opponent' },
      { what: 'creature', controller: 'opponent', optional: true },
    ],
    [
      { kind: 'tap', what: t0 },
      { kind: 'tap', what: { target: 1 } },
      { kind: 'namedCounters', name: 'stun', amount: 1, to: t0 },
      { kind: 'namedCounters', name: 'stun', amount: 1, to: { target: 1 } },
    ],
  ),
  // Frostbridge Guard-like: {T}: tap target creature.
  creature('w-tapper', 2, 2, {
    abilities: [
      {
        kind: 'activated',
        cost: { tapSelf: true },
        targets: [{ what: 'creature' }],
        effects: [{ kind: 'tap', what: t0 }],
      },
    ],
  }),
  // ---- Adventures
  // Besotted Knight // Betroth the Beast: {3}{W} 3/3; Adventure {W}: a Royal Role attached to target creature you control.
  creature('w-knight', 3, 3, { manaCost: cost(3, { W: 1 }), adventure: true, back: 'w-betroth' }),
  card({
    id: 'w-betroth',
    types: ['Sorcery'],
    subtypes: ['Adventure'],
    manaCost: cost(0, { W: 1 }),
    spell: { targets: [yourCreature], effects: [createRole(ROLES.royal)] },
  }),
  // A Tarkir Omen card: has an adventure layout but no Adventure.
  creature('w-omen-beast', 4, 4, { manaCost: cost(3, { G: 1 }), adventure: true, back: 'w-omen' }),
  sorcery('w-omen', cost(0, { G: 1 }), [], [{ kind: 'draw', who: 'controller', amount: 1 }], {
    subtypes: ['Omen'],
  }),
  // Storyteller Pixie: whenever you cast an Adventure spell, draw a card.
  creature('w-pixie', 3, 3, {
    abilities: [
      {
        kind: 'triggered',
        trigger: { on: 'castSpell', filter: 'any', spell: { subtype: 'Adventure' } },
        targets: [],
        effects: [{ kind: 'draw', who: 'controller', amount: 1 }],
      },
    ],
  }),
  // Frantic Firebolt: X damage to target creature, X = 2 + instant, sorcery and Adventure cards in your graveyard.
  instant(
    'w-firebolt',
    cost(2, { R: 1 }),
    [{ what: 'creature' }],
    [
      {
        kind: 'damage',
        amount: {
          count: 'cardsInGraveyard',
          plus: 2,
          filter: { anyOf: [{ types: ['Instant', 'Sorcery'] }, { hasAdventure: true }] },
        },
        to: t0,
      },
    ],
  ),
  // Howling Galefang: haste as long as you own a card in exile that has an Adventure.
  creature(
    'w-galefang',
    4,
    4,
    {
      abilities: [
        {
          kind: 'static',
          effect: {
            kind: 'while',
            condition: { kind: 'ownsInExile', filter: { hasAdventure: true } },
            power: 0,
            toughness: 0,
            keywords: ['haste'],
          },
        },
      ],
    },
    ['vigilance'],
  ),
  // Beluna Grandsquall: permanent spells you cast that have an Adventure cost {1} less.
  creature('w-beluna', 4, 4, {
    abilities: [
      {
        kind: 'static',
        effect: { kind: 'spellsCostLess', filter: { hasAdventure: true }, amount: 1 },
      },
    ],
  }),
  // Witchstalker Frenzy: costs {1} less for each creature that attacked this turn; 5 damage to target creature.
  instant(
    'w-frenzy',
    cost(3, { R: 1 }),
    [{ what: 'creature' }],
    [{ kind: 'damage', amount: 5, to: t0 }],
    {
      costReduction: { count: 'creaturesAttackedThisTurn' },
    },
  ),
];

export const DB = new Map([...FIXTURES, ...ECL, ...WOE].map((c) => [c.id, c]));
export const engine = createEngine(DB);

export class Game extends GameDriver {
  constructor(state: GameState) {
    super(engine, state);
  }
}

export const scenario = (spec: ScenarioSpec = {}) => buildScenario(DB, spec);

export const casts = (g: Game, player: PlayerId, id: ObjectId) =>
  g
    .legal(player)
    .filter(
      (a): a is Extract<Action, { type: 'castSpell' }> => a.type === 'castSpell' && a.card === id,
    );

export const getPower = (g: Game, id: ObjectId) => getCharacteristics(g.state, DB, id).power;
export const getToughness = (g: Game, id: ObjectId) =>
  getCharacteristics(g.state, DB, id).toughness;

/** Passes priority until the stack is empty and no choice is pending. */
export const settle = (g: Game) => {
  for (let i = 0; i < 30 && g.state.stack.length > 0 && g.decision.kind === 'priority'; i++)
    g.passBoth();
};

/** The permanents with this definition on the battlefield. */
export const onField = (g: Game, defId: string) =>
  g.state.battlefield.filter((id) => g.state.objects[id]?.defId === defId);

/** Makes a permanent the scenario put on the battlefield a token (scenarios make cards). */
export const asToken = (g: Game, id: ObjectId) => {
  g.state.objects[id]!.isToken = true;
};

/** Casts `defId` from `player`'s hand at the given targets (the first cast that matches). */
export function castAt(
  g: Game,
  player: PlayerId,
  defId: string,
  targets: ObjectId[] = [],
  pick: (a: Extract<Action, { type: 'castSpell' }>) => boolean = () => true,
) {
  const id = g.id(player, defId, 'hand');
  const a = casts(g, player, id).find(
    (c) =>
      pick(c) &&
      targets.every((t, i) => {
        const x = c.targets[i];
        return !!x && 'object' in x && x.object.id === t;
      }),
  );
  if (!a) throw new Error(`No cast of ${defId} at ${targets.join(', ')}`);
  return g.do(a);
}

/** Passes priority until the active player declares attackers. */
export const toAttackers = (g: Game) => {
  for (let i = 0; i < 20 && g.decision.kind !== 'declareAttackers'; i++) g.pass();
};
