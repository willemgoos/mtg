import { describe, expect, it } from 'vitest';
import { createEngine } from '../src/engine.ts';
import { buildScenario, GameDriver } from '../src/testing.ts';
import type { Action, CardDefinition, EffectDef, ManaCost } from '../src/types.ts';
import { FIXTURES } from './helpers.ts';

// Wilds of Eldraine (23b, black): paying life and Ashiok's replacement, the `payment` loseLife, and "if you controlled a Faerie as
// you cast this spell". The cards themselves are tested in packages/cards/test/woe-black*.test.ts.

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

const COUNTER: EffectDef = { kind: 'counters', to: { target: 0 }, amount: 1 };
const DB = new Map(
  [
    ...FIXTURES,
    // Ashiok, Wicked Manipulator's replacement effect.
    card({
      id: 'w-ashiok',
      types: ['Planeswalker'],
      loyalty: 5,
      abilities: [{ kind: 'static', effect: { kind: 'woePayLifeExilesLibrary' } }],
    }),
    // "Pay 2 life: this gets +2/+2."
    card({
      id: 'w-payer',
      types: ['Creature'],
      power: 2,
      toughness: 2,
      abilities: [
        {
          kind: 'activated',
          cost: { life: 2 },
          targets: [],
          effects: [{ kind: 'pump', to: 'self', power: 2, toughness: 2 }],
        },
      ],
    }),
    // A shock-land-like "you may pay 2 life" effect, and the same as a plain loss.
    card({
      id: 'w-shock',
      types: ['Instant'],
      manaCost: cost(0),
      spell: {
        targets: [],
        effects: [{ kind: 'loseLife', who: 'controller', amount: 2, payment: true }],
      },
    }),
    card({
      id: 'w-lose',
      types: ['Instant'],
      manaCost: cost(0),
      spell: { targets: [], effects: [{ kind: 'loseLife', who: 'controller', amount: 2 }] },
    }),
    card({ id: 'w-faerie', types: ['Creature'], subtypes: ['Faerie'], power: 1, toughness: 1 }),
    card({ id: 'w-goblin', types: ['Creature'], subtypes: ['Goblin'], power: 1, toughness: 1 }),
    // Faerie Fencing's check: a +1/+1 counter if the caster controlled a Faerie as they cast it.
    card({
      id: 'w-fencing',
      types: ['Instant'],
      manaCost: cost(0),
      spell: {
        targets: [{ what: 'creature' }],
        effects: [
          {
            kind: 'if',
            condition: { kind: 'custom', handler: 'woeFaerieAtCast' },
            then: [COUNTER],
          },
        ],
      },
    }),
  ].map((c) => [c.id, c]),
);
const ASHIOK = { card: 'w-ashiok', loyalty: 5 };
const engine = createEngine(DB);
const game = (spec: Parameters<typeof buildScenario>[1]) =>
  new GameDriver(engine, buildScenario(DB, spec));
const settle = (g: GameDriver) => {
  for (let i = 0; i < 20 && g.state.stack.length > 0 && g.decision.kind === 'priority'; i++)
    g.passBoth();
};
type Activate = Extract<Action, { type: 'activateAbility' }>;

describe('payLife (Ashiok, Wicked Manipulator)', () => {
  it('an ability cost of life: life is paid without the replacement', () => {
    const g = game({ p1: { battlefield: ['w-payer'] } });
    g.do({
      type: 'activateAbility',
      player: 'p1',
      source: g.id('p1', 'w-payer'),
      abilityIndex: 0,
      targets: [],
    } as Activate);
    settle(g);
    expect(g.life('p1')).toBe(18);
    expect(g.state.players.p1.library).toHaveLength(10);
  });

  it('with the replacement and enough cards the top cards are exiled instead, not optionally', () => {
    const g = game({ p1: { battlefield: ['w-payer', ASHIOK] } });
    const top = g.state.players.p1.library.slice(0, 2);
    g.do({
      type: 'activateAbility',
      player: 'p1',
      source: g.id('p1', 'w-payer'),
      abilityIndex: 0,
      targets: [],
    } as Activate);
    settle(g);
    expect(g.life('p1')).toBe(20);
    expect(g.state.players.p1.exile).toEqual(top);
    expect(g.state.players.p1.library).toHaveLength(8);
    expect(g.state.turn.exiledCards).toBe(2);
  });

  it('a library with fewer cards than the payment: pay life as normal', () => {
    const g = game({ p1: { battlefield: ['w-payer', ASHIOK], library: ['forest'] } });
    g.do({
      type: 'activateAbility',
      player: 'p1',
      source: g.id('p1', 'w-payer'),
      abilityIndex: 0,
      targets: [],
    } as Activate);
    settle(g);
    expect(g.life('p1')).toBe(18);
    expect(g.state.players.p1.library).toHaveLength(1);
  });

  it('only its controller gets the replacement; Ashiok does not allow paying more life than you have', () => {
    const g = game({ p1: { battlefield: ['w-payer'] }, p2: { battlefield: [ASHIOK] } });
    g.do({
      type: 'activateAbility',
      player: 'p1',
      source: g.id('p1', 'w-payer'),
      abilityIndex: 0,
      targets: [],
    } as Activate);
    settle(g);
    expect(g.life('p1')).toBe(18);
    const h = game({ p1: { life: 1, battlefield: ['w-payer', ASHIOK] } });
    expect(
      h.legal().some((a) => a.type === 'activateAbility' && a.source === h.id('p1', 'w-payer')),
    ).toBe(false);
  });

  it('"pay N life" as an effect (payment) is replaced; plain life loss is not', () => {
    const g = game({ p1: { hand: ['w-shock', 'w-lose'], battlefield: [ASHIOK] } });
    const castOf = (id: string) =>
      g.legal().find((a) => a.type === 'castSpell' && a.card === g.id('p1', id, 'hand'))!;
    g.do(castOf('w-shock'));
    settle(g);
    expect(g.life('p1')).toBe(20);
    expect(g.state.players.p1.library).toHaveLength(8);
    g.do(castOf('w-lose'));
    settle(g);
    expect(g.life('p1')).toBe(18);
    expect(g.state.players.p1.library).toHaveLength(8);
  });
});

describe('"if you controlled a Faerie as you cast this spell"', () => {
  const fence = (g: GameDriver, target: string) =>
    g.do(
      g
        .legal()
        .find(
          (a) =>
            a.type === 'castSpell' &&
            a.card === g.id('p1', 'w-fencing', 'hand') &&
            a.targets.some((t) => 'object' in t && t.object.id === target),
        )!,
    );

  it('counts the Faerie at cast time, even if it is gone by resolution', () => {
    const g = game({
      p1: { hand: ['w-fencing'], battlefield: ['w-faerie', 'w-goblin'] },
    });
    const goblin = g.id('p1', 'w-goblin');
    fence(g, goblin);
    expect(g.state.objects[g.state.stack[0]!.id]!.controlledFaerieAtCast).toBe(true);
    // The Faerie dies in response.
    const faerie = g.id('p1', 'w-faerie');
    g.state.battlefield = g.state.battlefield.filter((x) => x !== faerie);
    g.state.players.p1.graveyard.push(faerie);
    g.state.objects[faerie]!.zone = 'graveyard';
    settle(g);
    expect(g.obj(goblin).plusOneCounters).toBe(1);
  });

  it('without a Faerie as it is cast it does not count, and one that arrives later is no use', () => {
    const g = game({ p1: { hand: ['w-fencing'], battlefield: ['w-goblin'] } });
    const goblin = g.id('p1', 'w-goblin');
    fence(g, goblin);
    expect(g.state.objects[g.state.stack[0]!.id]!.controlledFaerieAtCast).toBeUndefined();
    settle(g);
    expect(g.obj(goblin).plusOneCounters).toBe(0);
  });
});
