import {
  createEngine,
  redactFor,
  type Action,
  type CardDefinition,
  type ManaCost,
  type PlayerId,
} from '@mtg/engine';
import { buildScenario, GameDriver, type ScenarioSpec } from '@mtg/engine/testing';
import { describe, expect, it } from 'vitest';
import { createHeuristicBot } from '../src/index.ts';

// Wilds of Eldraine (23a): how the bots handle bargain, Roles, celebration and the Restless lands.

const cost = (generic: number, colored: ManaCost['colored'] = {}): ManaCost => ({
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
const land = (id: string, produces: 'W' | 'U' | 'B' | 'R' | 'G') =>
  card({
    id,
    types: ['Land'],
    supertypes: ['Basic'],
    abilities: [{ kind: 'mana', cost: { tapSelf: true }, produces }],
  });
const creature = (id: string, p: number, t: number, extra: Partial<CardDefinition> = {}) =>
  card({ id, types: ['Creature'], power: p, toughness: t, ...extra });
const t0 = { target: 0 } as const;

const DB = new Map(
  [
    land('swamp', 'B'),
    land('forest', 'G'),
    land('mountain', 'R'),
    land('plains', 'W'),
    creature('bear', 2, 2),
    creature('ogre', 3, 3),
    creature('giant', 5, 5),
    card({
      id: 'food',
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
    // Candy Grapple: -3/-3, or -5/-5 if bargained.
    card({
      id: 'grapple',
      types: ['Instant'],
      manaCost: cost(1, { B: 1 }),
      kicker: {
        cost: cost(0),
        as: 'bargain',
        sacrifice: {
          anyOf: [{ types: ['Artifact'] }, { types: ['Enchantment'] }, { token: true }],
        },
      },
      spell: {
        targets: [{ what: 'creature' }],
        effects: [
          {
            kind: 'if',
            condition: { kind: 'wasKicked' },
            then: [{ kind: 'pump', to: t0, power: -5, toughness: -5 }],
            else: [{ kind: 'pump', to: t0, power: -3, toughness: -3 }],
          },
        ],
      },
    }),
    // The Monster and Cursed Roles.
    card({
      id: 'woe-monster-role',
      name: 'Monster Role',
      types: ['Enchantment'],
      subtypes: ['Aura', 'Role'],
      enchant: { what: 'creature' },
      isToken: true,
      abilities: [
        {
          kind: 'static',
          effect: { kind: 'attached', power: 1, toughness: 1, keywords: ['trample'] },
        },
      ],
    }),
    card({
      id: 'woe-cursed-role',
      name: 'Cursed Role',
      types: ['Enchantment'],
      subtypes: ['Aura', 'Role'],
      enchant: { what: 'creature' },
      isToken: true,
      abilities: [
        { kind: 'static', effect: { kind: 'attached', power: 0, toughness: 0, basePT: [1, 1] } },
      ],
    }),
    // Spiteful Hexmage-like sorcery on any creature: a Cursed Role on target creature.
    card({
      id: 'curse',
      types: ['Sorcery'],
      manaCost: cost(0, { B: 1 }),
      spell: {
        targets: [{ what: 'creature' }],
        effects: [{ kind: 'createRole', role: 'woe-cursed-role', to: t0 }],
      },
    }),
    // Monstrous Rage-like: a Monster Role on target creature (any).
    card({
      id: 'monster',
      types: ['Sorcery'],
      manaCost: cost(0, { R: 1 }),
      spell: {
        targets: [{ what: 'creature' }],
        effects: [{ kind: 'createRole', role: 'woe-monster-role', to: t0 }],
      },
    }),
    // Restless Bivouac-like: {1}{R}{W}: a 2/2 Ox until end of turn.
    card({
      id: 'bivouac',
      types: ['Land'],
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
      ],
    }),
  ].map((c) => [c.id, c]),
);

const engine = createEngine(DB);
const bot = createHeuristicBot(DB);
const game = (spec: ScenarioSpec) =>
  new GameDriver(
    engine,
    buildScenario(DB, {
      ...spec,
      p1: { library: Array<string>(10).fill('swamp'), ...spec.p1 },
      p2: { library: Array<string>(10).fill('swamp'), ...spec.p2 },
    }),
  );
const choose = (g: GameDriver, p: PlayerId = g.actor): Action =>
  bot.chooseAction(redactFor(g.state, p), p);
const asToken = (g: GameDriver, defId: string) => {
  g.state.objects[g.id('p1', defId)]!.isToken = true;
};

describe('bots and bargain', () => {
  it('bargains a Food when only the bargained spell kills the creature', () => {
    const g = game({
      p1: { hand: ['grapple'], battlefield: ['swamp', 'swamp', 'food'] },
      p2: { battlefield: ['giant'] },
    });
    asToken(g, 'food');
    const a = choose(g);
    expect(a.type).toBe('castSpell');
    if (a.type !== 'castSpell') return;
    expect(a.kicked).toBe(true);
    expect(a.sacrifice).toBe(g.id('p1', 'food'));
  });

  it("doesn't bargain the Food away when the normal spell already kills", () => {
    const g = game({
      p1: { hand: ['grapple'], battlefield: ['swamp', 'swamp', 'food'] },
      p2: { battlefield: ['ogre'] },
    });
    asToken(g, 'food');
    const a = choose(g);
    expect(a.type).toBe('castSpell');
    if (a.type !== 'castSpell') return;
    expect(a.kicked).toBeFalsy();
  });
});

describe('bots and Roles', () => {
  it("puts a Cursed Role on the opponent's best creature", () => {
    const g = game({
      p1: { hand: ['curse'], battlefield: ['swamp', 'bear'] },
      p2: { battlefield: ['ogre', 'giant'] },
    });
    const a = choose(g);
    expect(a.type).toBe('castSpell');
    if (a.type !== 'castSpell') return;
    const t = a.targets[0];
    expect(t && 'object' in t && t.object.id).toBe(g.id('p2', 'giant'));
  });

  it('puts a Monster Role on its own creature', () => {
    const g = game({
      p1: { hand: ['monster'], battlefield: ['mountain', 'bear'] },
      p2: { battlefield: ['ogre'] },
    });
    const a = choose(g);
    expect(a.type).toBe('castSpell');
    if (a.type !== 'castSpell') return;
    const t = a.targets[0];
    expect(t && 'object' in t && t.object.id).toBe(g.id('p1', 'bear'));
  });
});

describe('bots and the Restless lands', () => {
  it('animates a Restless land in its main phase to attack an open board', () => {
    const g = game({
      p1: { battlefield: ['bivouac', 'mountain', 'plains', 'mountain'] },
      p2: { life: 10 },
    });
    const a = choose(g);
    expect(a.type).toBe('activateAbility');
    if (a.type === 'activateAbility') expect(a.source).toBe(g.id('p1', 'bivouac'));
    // Then it attacks with it.
    g.do(a);
    for (let i = 0; i < 40 && g.state.turn.step !== 'main2' && g.decision.kind !== 'gameOver'; i++)
      g.do(choose(g));
    expect(g.life('p2')).toBe(8);
  });

  it("doesn't animate it into a bigger blocker", () => {
    const g = game({
      p1: { battlefield: ['bivouac', 'mountain', 'plains', 'mountain'] },
      p2: { battlefield: ['giant'] },
    });
    const a = choose(g);
    expect(a.type).toBe('passPriority');
  });
});
