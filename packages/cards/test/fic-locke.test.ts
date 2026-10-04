import { describe, expect, it } from 'vitest';
import { all, cast, game, n, settle } from './blb-helpers.ts';

// Final Fantasy Commander (12g): Brawl Locke — Mug, stealing the top card,
// Thunder Magic's tiers, Sephiroth's fourth death, ninjutsu as sneak.

describe('Brawl Locke (12g)', () => {
  it("Locke's Mug: each player mills; a land makes a Treasure; a spell can be cast", () => {
    const g = game({
      p1: { battlefield: ['locke-treasure-hunter'], library: ['mountain', ...n('swamp', 4)] },
      p2: { library: ['shock', ...n('forest', 4)] },
      step: 'beginCombat',
    });
    g.pass().pass();
    g.attack(g.id('p1', 'locke-treasure-hunter'));
    settle(g);
    expect(all(g, 'treasure-token')).toHaveLength(1);
    const shock = g.state.players.p2.exile.find((id) => g.obj(id).defId === 'shock');
    expect(shock).toBeDefined();
    expect(g.obj(shock!).castableBy).toBe('p1');
  });

  it('Thunder Magic: Thundara deals 4 for {R}+{3}', () => {
    const g = game({
      p1: { hand: ['thunder-magic'], battlefield: n('mountain', 4) },
      p2: { battlefield: ['serra-angel'] },
    });
    const angel = g.id('p2', 'serra-angel');
    cast(g, 'thunder-magic', [g.ref(angel)], { mode: 1 });
    settle(g);
    expect(g.zoneOf(angel)).toBe('graveyard');
  });

  it('Sephiroth transforms on the fourth death of a turn', () => {
    const g = game({
      p1: { hand: ['fire-magic'], battlefield: ['sephiroth-fabled-soldier', 'mountain'] },
      p2: { battlefield: n('savannah-lions', 4) },
    });
    cast(g, 'fire-magic', [], { mode: 0 });
    settle(g);
    expect(g.life('p2')).toBe(16);
    expect(g.obj(g.id('p1', 'sephiroth-one-winged-angel')).defId).toBe(
      'sephiroth-one-winged-angel',
    );
  });
});
