import { describe, expect, it } from 'vitest';
import { cardDb } from '../src/index.ts';
import { game } from './blb-helpers.ts';

// Marvel Super Heroes Jumpstart packets (docs/marvel-jumpstart.md).

describe('Thriving lands', () => {
  it('enter tapped and tap for their colour or the chosen one', () => {
    for (const [id, color] of [
      ['thriving-heath', 'W'],
      ['thriving-isle', 'U'],
      ['thriving-moor', 'B'],
      ['thriving-bluff', 'R'],
      ['thriving-grove', 'G'],
    ] as const) {
      const d = cardDb.get(id)!;
      expect(d.entersTapped, id).toBe(true);
      const mana = d.abilities.flatMap((a) => (a.kind === 'mana' ? [a] : []));
      expect(mana.find((a) => !a.ifChosen)?.produces, id).toBe(color);
      expect(mana.filter((a) => a.ifChosen)).toHaveLength(4);
    }
  });

  it('choose a colour other than their own as they enter', () => {
    for (const [id, own] of [
      ['thriving-heath', 'White'],
      ['thriving-isle', 'Blue'],
      ['thriving-moor', 'Black'],
      ['thriving-bluff', 'Red'],
      ['thriving-grove', 'Green'],
    ] as const) {
      const g = game({ p1: { hand: [id] } });
      g.do({ type: 'playLand', player: 'p1', card: g.id('p1', id, 'hand') });
      for (let i = 0; i < 4 && g.decision.kind === 'priority' && g.state.stack.length; i++)
        g.pass();
      const d = g.decision;
      if (d.kind !== 'chooseOption') throw new Error(`${id}: no colour choice`);
      expect(
        d.options.map((o) => o.label),
        id,
      ).not.toContain(own);
      expect(d.options, id).toHaveLength(4);
    }
  });
});
