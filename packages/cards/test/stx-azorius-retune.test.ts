import { describe, expect, it } from 'vitest';
import { cardDb, deckById } from '../src/index.ts';
import { cast, game, n, pt, settle } from './blb-helpers.ts';

// Strixhaven 13b: the Azorius Skies retune (Elite Spellbinder, Strict Proctor, Mavinda).

describe('retuned Azorius Skies', () => {
  it('has at least 30 of its 36 spells from Strixhaven', () => {
    const d = deckById('stx-azorius-skies');
    // The non-Strixhaven spells (Foundations reprints).
    const foundations = new Set([
      'Serra Angel',
      'Lyra Dawnbringer',
      'Banishing Light',
      'Ancestor Dragon',
    ]);
    let stx = 0;
    let spells = 0;
    for (const [name, count] of d.cards) {
      const card = [...cardDb.values()].find((c) => c.name === name)!;
      if (card.types.includes('Land')) continue;
      spells += count;
      if (!foundations.has(name)) stx += count;
    }
    expect(spells).toBe(36);
    expect(stx).toBeGreaterThanOrEqual(30);
  });

  it('Elite Spellbinder flies and exiles a nonland card from the opponent’s hand', () => {
    const g = game({
      p1: { hand: ['elite-spellbinder'], battlefield: n('plains', 3) },
      p2: { hand: ['forest', 'serra-angel'] },
    });
    cast(g, 'elite-spellbinder');
    settle(g);
    const pick = g
      .legal()
      .find((a) => a.type === 'chooseCard' && a.card === g.id('p2', 'serra-angel', 'hand'));
    if (pick) g.do(pick);
    settle(g);
    const exiled = Object.values(g.state.objects).filter(
      (o) => o.owner === 'p2' && o.zone === 'exile',
    );
    expect(exiled).toHaveLength(1);
    expect(g.state.players.p2.hand).toHaveLength(1);
    expect(pt(g, g.id('p1', 'elite-spellbinder'))).toEqual([3, 1]);
  });

  it('Strict Proctor and Mavinda are flyers with the printed stats', () => {
    const g = game({ p1: { battlefield: ['strict-proctor', 'mavinda-students-advocate'] } });
    expect(pt(g, g.id('p1', 'strict-proctor'))).toEqual([1, 3]);
    expect(pt(g, g.id('p1', 'mavinda-students-advocate'))).toEqual([2, 3]);
  });
});
