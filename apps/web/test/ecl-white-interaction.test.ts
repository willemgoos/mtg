import { createEngine, type Action, type CardDefinition } from '@mtg/engine';
import { buildScenario, GameDriver } from '@mtg/engine/testing';
import { describe, expect, it } from 'vitest';
import {
  isTargeting,
  pickTarget,
  startTargeting,
  targetOptions,
  targetsOf,
  type Targeting,
} from '../src/game/interaction.ts';

// Lorwyn Eclipsed (18b, white): "Tap three untapped creatures you control" (Kithkeeper) is picked on the board, in any order.

function card(d: Partial<CardDefinition> & Pick<CardDefinition, 'id'>): CardDefinition {
  return {
    name: d.id,
    manaCost: { generic: 0, colored: {} },
    colors: [],
    types: [],
    supertypes: [],
    subtypes: [],
    keywords: [],
    abilities: [],
    ...d,
  };
}
const db = new Map(
  [
    card({ id: 'forest', types: ['Land'], supertypes: ['Basic'] }),
    card({ id: 'bear', types: ['Creature'], power: 2, toughness: 2 }),
    card({ id: 'ogre', types: ['Creature'], power: 3, toughness: 3 }),
    card({
      id: 'keeper',
      types: ['Creature'],
      power: 3,
      toughness: 3,
      abilities: [
        {
          kind: 'activated',
          cost: { tapCreatures: 2 },
          targets: [],
          effects: [{ kind: 'pump', to: 'self', power: 3, toughness: 0 }],
        },
      ],
    }),
  ].map((c) => [c.id, c]),
);
const engine = createEngine(db);

describe('tap N untapped creatures as a cost', () => {
  const setup = () => {
    const g = new GameDriver(
      engine,
      buildScenario(db, { p1: { battlefield: ['keeper', 'bear', 'ogre'] } }),
    );
    const acts = g
      .legal()
      .filter(
        (a): a is Extract<Action, { type: 'activateAbility' }> => a.type === 'activateAbility',
      );
    return { g, acts };
  };

  it('offers one action for each different set of creatures, each a set of two', () => {
    const { acts } = setup();
    // {keeper, bear}, {keeper, ogre}, {bear, ogre}.
    expect(acts).toHaveLength(3);
    for (const a of acts) expect(a.tapCreatures).toHaveLength(2);
  });

  it('is picked on the board in any order', () => {
    const { g, acts } = setup();
    const bear = g.id('p1', 'bear');
    const keeper = g.id('p1', 'keeper');
    let t: Action | Targeting = startTargeting(keeper, 'Keeper', acts);
    expect(isTargeting(t)).toBe(true);
    // Every creature in some set can be clicked first.
    const first = [...targetOptions(t as Targeting).keys()].sort();
    expect(first).toEqual([bear, g.id('p1', 'ogre'), keeper].map((id) => `obj:${id}`).sort());
    // The Bear, then the Keeper -- though the action lists the Keeper first.
    t = pickTarget(t as Targeting, `obj:${bear}`)!;
    expect(isTargeting(t)).toBe(true);
    // Clicking the Bear again isn't offered; the Keeper and the Ogre are.
    expect([...targetOptions(t as Targeting).keys()].sort()).toEqual(
      [keeper, g.id('p1', 'ogre')].map((id) => `obj:${id}`).sort(),
    );
    t = pickTarget(t as Targeting, `obj:${keeper}`)!;
    expect(isTargeting(t)).toBe(false);
    const done = t as Action;
    expect(done.type).toBe('activateAbility');
    expect(targetsOf(done).map((x) => ('object' in x ? x.object.id : ''))).toHaveLength(2);
    expect(
      (done as Extract<Action, { type: 'activateAbility' }>).tapCreatures?.slice().sort(),
    ).toEqual([bear, keeper].sort());
  });
});
