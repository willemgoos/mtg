import { createEngine, type CardDefinition, type ManaCost } from '@mtg/engine';
import { buildScenario, GameDriver } from '@mtg/engine/testing';
import { describe, expect, it } from 'vitest';
import {
  castGroups,
  handActions,
  isTargeting,
  pickTarget,
  startTargeting,
  targetsOf,
} from '../src/game/interaction.ts';

// Lorwyn Eclipsed (18a): blight costs are picked on the board like a sacrifice, and are a way of paying of their own.

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
const db = new Map(
  [
    card({
      id: 'mountain',
      types: ['Land'],
      supertypes: ['Basic'],
      abilities: [{ kind: 'mana', cost: { tapSelf: true }, produces: 'R' }],
    }),
    card({ id: 'bear', types: ['Creature'], power: 2, toughness: 2 }),
    card({ id: 'ogre', types: ['Creature'], power: 3, toughness: 3 }),
    card({
      id: 'cinder-strike',
      types: ['Sorcery'],
      colors: ['R'],
      manaCost: cost(0, { R: 1 }),
      kicker: { cost: cost(0), blight: 1 },
      spell: {
        targets: [{ what: 'creature', controller: 'opponent' }],
        effects: [{ kind: 'damage', amount: 2, to: { target: 0 } }],
      },
    }),
    card({
      id: 'gristle',
      types: ['Creature'],
      power: 2,
      toughness: 2,
      abilities: [
        {
          kind: 'activated',
          cost: { tapSelf: true, blight: 1 },
          targets: [],
          effects: [{ kind: 'draw', who: 'controller', amount: 1 }],
        },
      ],
    }),
  ].map((c) => [c.id, c]),
);
const engine = createEngine(db);
const game = () =>
  new GameDriver(
    engine,
    buildScenario(db, {
      p1: {
        hand: ['cinder-strike'],
        battlefield: ['mountain', 'bear', 'ogre', 'gristle'],
        library: Array<string>(5).fill('mountain'),
      },
      p2: { battlefield: ['ogre'], library: Array<string>(5).fill('mountain') },
    }),
  );

describe('blight in the interface', () => {
  it('casts with and without blighting are separate groups', () => {
    const g = game();
    const strike = g.id('p1', 'cinder-strike', 'hand');
    const groups = castGroups(handActions(g.legal(), strike));
    expect(groups).toHaveLength(2);
    expect(groups.map((grp) => grp.every((a) => a.type === 'castSpell' && !!a.blight))).toEqual([
      false,
      true,
    ]);
  });

  it('the creature to blight is picked first, then the target', () => {
    const g = game();
    const strike = g.id('p1', 'cinder-strike', 'hand');
    const withBlight = castGroups(handActions(g.legal(), strike))[1]!;
    const t = startTargeting(strike, 'Cinder Strike', withBlight);
    const first = pickTarget(t, `obj:${g.id('p1', 'ogre')}`);
    expect(first && isTargeting(first)).toBe(true);
    if (!first || !isTargeting(first)) return;
    const done = pickTarget(first, `obj:${g.id('p2', 'ogre')}`);
    expect(done).toMatchObject({ type: 'castSpell', card: strike, blight: g.id('p1', 'ogre') });
    if (done && !isTargeting(done))
      expect(
        targetsOf(done)
          .map((x) => ('object' in x ? x.object.id : ''))
          .slice(0, 2),
      ).toEqual([g.id('p1', 'ogre'), g.id('p2', 'ogre')]);
  });

  it('an ability with a blight cost asks for the creature', () => {
    const g = game();
    const source = g.id('p1', 'gristle');
    const acts = g.legal().filter((a) => a.type === 'activateAbility' && a.source === source);
    expect(castGroups(acts)).toHaveLength(1);
    const t = startTargeting(source, 'Gristle', acts);
    // Any of my three creatures may take the counter.
    expect(acts).toHaveLength(3);
    const picked = pickTarget(t, `obj:${g.id('p1', 'bear')}`);
    expect(picked).toMatchObject({ type: 'activateAbility', blight: g.id('p1', 'bear') });
  });
});
