import { describe, expect, it } from 'vitest';
import { cardDb } from '../src/index.ts';

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
});
