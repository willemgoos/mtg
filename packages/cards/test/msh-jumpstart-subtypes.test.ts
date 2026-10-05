import { createEngine, getCharacteristics, type CardDefinition, type EffectDef } from '@mtg/engine';
import { buildScenario, GameDriver } from '@mtg/engine/testing';
import { describe, expect, it } from 'vitest';
import {
  cardMatches,
  hasSubtype,
  matchesFilter,
  NON_CREATURE_SUBTYPES,
} from '../../engine/src/characteristics.ts';
import { makeCtx, moveObject } from '../../engine/src/context.ts';
import { runEffects } from '../../engine/src/effects.ts';
import { cardDb, slug } from '../src/index.ts';

const DONALD = slug('Donald Blake, Guise of Thor');
const permanent: EffectDef = {
  kind: 'setCreatureTypes',
  what: 'self',
  subtypes: ['God', 'Warrior', 'Hero'],
};
const animate: EffectDef = {
  kind: 'pump',
  to: 'self',
  power: 0,
  toughness: 0,
  basePT: [5, 5],
  becomesCreature: true,
  creatureSubtype: 'Construct',
};
const setup = (changeling = false, preserved = ['Equipment']) => {
  const d: CardDefinition = {
    ...cardDb.get(DONALD)!,
    types: ['Artifact', 'Creature'],
    subtypes: [...preserved, 'Human', 'Doctor'],
    keywords: changeling ? ['changeling'] : ['lifelink'],
  };
  const db = new Map(cardDb).set(DONALD, d),
    g = new GameDriver(createEngine(db), buildScenario(db, { p1: { battlefield: [DONALD] } }));
  const id = g.id('p1', DONALD),
    ctx = makeCtx(g.state, db);
  const apply = (effect: EffectDef) =>
    runEffects(
      ctx,
      { controller: 'p1', source: { id, zcc: g.obj(id).zcc }, sourceDefId: DONALD, targets: [] },
      [effect],
      { kind: 'ability', id: 'test-type-change' },
    );
  return { g, id, ctx, db, apply };
};
const assertTypes = (s: ReturnType<typeof setup>, types: string[]) => {
  expect(getCharacteristics(s.g.state, s.db, s.id).subtypes).toEqual(['Equipment', ...types]);
  for (const subtype of [
    'Equipment',
    'Human',
    'Doctor',
    'God',
    'Warrior',
    'Hero',
    'Construct',
    'Dragon',
  ]) {
    const expected = subtype === 'Equipment' || types.includes(subtype);
    expect(hasSubtype(s.ctx, s.id, subtype), subtype).toBe(expected);
    expect(matchesFilter(s.ctx, s.id, { subtype }), subtype).toBe(expected);
    expect(cardMatches(s.ctx, s.id, { subtypes: [subtype] }), subtype).toBe(expected);
  }
};
describe('Caretakers / Iron Man creature-type setter integration', () => {
  it('a newer permanent setter overrides an older animation', () => {
    const s = setup();
    s.apply(animate);
    s.apply(permanent);
    assertTypes(s, ['God', 'Warrior', 'Hero']);
  });
  it('a newer animation overrides the permanent setter until it expires', () => {
    const s = setup();
    s.apply(permanent);
    s.apply(animate);
    assertTypes(s, ['Construct']);
    s.g.state.effects = [];
    assertTypes(s, ['God', 'Warrior', 'Hero']);
  });
  it('takes the newest timestamp even if the effects array is reordered', () => {
    const s = setup();
    s.apply(animate);
    s.apply(permanent);
    s.apply({ ...animate, creatureSubtype: 'Angel' });
    s.g.state.effects.reverse();
    assertTypes(s, ['Angel']);
  });
  it.each([permanent, animate])(
    'explicit type setters override changeling, which returns after the setter ends',
    (effect) => {
      const s = setup(true);
      expect(hasSubtype(s.ctx, s.id, 'Dragon')).toBe(true);
      s.apply(effect);
      assertTypes(
        s,
        effect.kind === 'setCreatureTypes' ? ['God', 'Warrior', 'Hero'] : ['Construct'],
      );
      moveObject(s.ctx, s.id, 'exile');
      moveObject(s.ctx, s.id, 'battlefield');
      expect(hasSubtype(s.ctx, s.id, 'Dragon')).toBe(true);
      expect(getCharacteristics(s.g.state, s.db, s.id).subtypes).toEqual([
        'Equipment',
        'Human',
        'Doctor',
      ]);
    },
  );
});

describe('noncreature subtype preservation', () => {
  it.each(['Saga', 'Clue', 'Shrine', 'Room', 'Jace', 'Cave', 'Adventure', 'Siege'])(
    'preserves %s through permanent and temporary creature-type setters',
    (subtype) => {
      const s = setup(false, [subtype]);
      s.apply(permanent);
      expect(getCharacteristics(s.g.state, s.db, s.id).subtypes).toEqual([
        subtype,
        'God',
        'Warrior',
        'Hero',
      ]);
      s.apply(animate);
      expect(getCharacteristics(s.g.state, s.db, s.id).subtypes).toEqual([subtype, 'Construct']);
      expect(hasSubtype(s.ctx, s.id, subtype)).toBe(true);
      expect(cardMatches(s.ctx, s.id, { subtypes: [subtype] })).toBe(true);
    },
  );
  it('preserves noncreature types granted before the permanent replacement', () => {
    const s = setup();
    s.g.obj(s.id).addedSubtypes = ['Clue', 'Saga', 'Human'];
    s.apply(permanent);
    expect(getCharacteristics(s.g.state, s.db, s.id).subtypes).toEqual([
      'Equipment',
      'God',
      'Warrior',
      'Hero',
      'Clue',
      'Saga',
    ]);
  });
  it('does not give a changeling noncreature subtypes', () => {
    const s = setup(true);
    for (const subtype of NON_CREATURE_SUBTYPES) {
      if (subtype === 'Equipment') continue;
      expect(hasSubtype(s.ctx, s.id, subtype), subtype).toBe(false);
    }
    expect(hasSubtype(s.ctx, s.id, 'Dragon')).toBe(true);
  });
  it('covers every printed noncreature subtype in the supported card pool', () => {
    const missing = new Set<string>();
    for (const d of cardDb.values()) {
      if (d.types.some((t) => ['Creature', 'Kindred', 'Tribal'].includes(t))) continue;
      for (const subtype of d.subtypes)
        if (!NON_CREATURE_SUBTYPES.has(subtype)) missing.add(subtype);
    }
    expect([...missing]).toEqual([]);
  });
});
