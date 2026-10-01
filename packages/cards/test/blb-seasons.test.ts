import { describe, expect, it } from 'vitest';
import { all, game, handSize, n, settle } from './blb-helpers.ts';

// Bloomburrow's Seasons: up to five {P} worth of modes, repeats allowed.

const castPaws = (g: ReturnType<typeof game>, defId: string, paws: number[], targets = 0) => {
  const a = g
    .legal()
    .find(
      (x) =>
        x.type === 'castSpell' &&
        g.obj(x.card).defId === defId &&
        x.paws?.join() === paws.join() &&
        x.targets.length === targets,
    );
  if (!a) throw new Error(`No cast of ${defId} with ${paws.join()}`);
  return settle(g.do(a));
};

describe('Seasons', () => {
  it('offer every combination worth 1 to 5 paws', () => {
    const g = game({ p1: { hand: ['season-of-the-burrow'], battlefield: n('plains', 5) } });
    const combos = new Set(
      g.legal().flatMap((a) => (a.type === 'castSpell' && a.paws ? [a.paws.join()] : [])),
    );
    // Rabbit ×5 is there, Return ×2 (6 paws) isn't.
    expect(combos.has('0,0,0,0,0')).toBe(true);
    expect(combos.has('2,2')).toBe(false);
  });

  it('Season of the Burrow: five Rabbits', () => {
    const g = game({ p1: { hand: ['season-of-the-burrow'], battlefield: n('plains', 5) } });
    castPaws(g, 'season-of-the-burrow', [0, 0, 0, 0, 0]);
    expect(all(g, 'rabbit-token')).toHaveLength(5);
  });

  it('Season of the Burrow: a Rabbit and an exile in one cast, with targets in order', () => {
    const g = game({
      p1: { hand: ['season-of-the-burrow'], battlefield: n('plains', 5) },
      p2: { battlefield: ['serra-angel'] },
    });
    castPaws(g, 'season-of-the-burrow', [0, 1], 1);
    expect(all(g, 'rabbit-token')).toHaveLength(1);
    expect(all(g, 'serra-angel')).toHaveLength(0);
    expect(handSize(g, 'p2')).toBe(1); // its controller draws
  });

  it('Season of Loss: each player sacrifices, then you draw for yours', () => {
    const g = game({
      p1: {
        hand: ['season-of-loss'],
        battlefield: [...n('swamp', 5), 'bear-cub'],
        library: n('forest', 5),
      },
      p2: { battlefield: ['savannah-lions'] },
    });
    castPaws(g, 'season-of-loss', [0, 1]);
    // The sacrifices ask each player; their only creatures go.
    for (let i = 0; i < 4 && g.decision.kind === 'sacrifice'; i++)
      settle(g.do(g.legal(g.actor)[0]!));
    expect(all(g, 'bear-cub')).toHaveLength(0);
    expect(all(g, 'savannah-lions')).toHaveLength(0);
    expect(handSize(g, 'p1')).toBe(1);
  });

  it('Season of the Bold: later spells deal 2 damage until the end of your next turn', () => {
    const g = game({
      p1: { hand: ['season-of-the-bold', 'playful-shove'], battlefield: n('mountain', 7) },
      p2: { battlefield: ['serra-angel'] },
    });
    castPaws(g, 'season-of-the-bold', [2]);
    expect(g.state.emblems).toHaveLength(1);
    const shove = g.legal().find((a) => a.type === 'castSpell' && 'player' in a.targets[0]!)!;
    g.do(shove);
    settle(g, (legal) => legal.find((a) => a.type === 'chooseTargets' && a.targets.length === 1));
    expect(g.obj(g.id('p2', 'serra-angel')).damage).toBe(2);
  });

  it('Season of Weaving: bounce every nonland, nontoken permanent', () => {
    const g = game({
      p1: { hand: ['season-of-weaving'], battlefield: [...n('island', 6), 'bear-cub'] },
      p2: { battlefield: ['serra-angel'] },
    });
    castPaws(g, 'season-of-weaving', [2]);
    expect(all(g, 'bear-cub')).toHaveLength(0);
    expect(all(g, 'serra-angel')).toHaveLength(0);
    expect(handSize(g, 'p2')).toBe(1);
  });
});
