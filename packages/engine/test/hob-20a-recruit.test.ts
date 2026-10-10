import { describe, expect, it } from 'vitest';
import { casts, Game, getPower, scenario } from './hob-fixtures.ts';

const castFirst = (g: Game, player: 'p1' | 'p2', defId: string) =>
  g.do(casts(g, player, g.id(player, defId, 'hand'))[0]!);

const settle = (g: Game) => {
  for (let i = 0; i < 20 && g.state.stack.length > 0 && g.decision.kind === 'priority'; i++)
    g.passBoth();
};

const soldiers = (g: Game, player: 'p1' | 'p2' = 'p1') =>
  g.state.battlefield.filter(
    (id) =>
      g.state.objects[id]!.defId === 'hob-human-soldier-token' &&
      g.state.objects[id]!.controller === player,
  );

// Recruit — draw a card, then discard a card. If you discarded a nonland card, create a 1/1 white Human Soldier creature token.

describe('Recruit', () => {
  const setup = (library: string[], hand: string[] = []) =>
    new Game(
      scenario({
        p1: { hand: ['h-instructor', ...hand], library, battlefield: ['plains', 'plains'] },
        p2: {},
      }),
    );

  it('draws a card, then asks you to discard one (your choice, from the new hand too)', () => {
    const g = setup(['h-spare-spell', 'forest', 'forest'], ['h-relic']);
    castFirst(g, 'p1', 'h-instructor');
    settle(g);
    expect(g.decision.kind).toBe('discard');
    if (g.decision.kind !== 'discard') return;
    expect(g.decision.player).toBe('p1');
    expect(g.decision.count).toBe(1);
    // The drawn card is in the hand to choose from: the relic and the spell.
    expect(g.state.players.p1.hand).toHaveLength(2);
    expect(g.events.filter((e) => e.type === 'cardDrawn')).toHaveLength(1);
  });

  it('discarding a nonland card creates a 1/1 white Human Soldier creature token', () => {
    const g = setup(['h-spare-spell', 'forest', 'forest'], ['h-relic']);
    castFirst(g, 'p1', 'h-instructor');
    settle(g);
    g.do({ type: 'discard', player: 'p1', card: g.id('p1', 'h-relic', 'hand') });
    expect(g.zoneOf(g.id('p1', 'h-relic', 'graveyard'))).toBe('graveyard');
    const [soldier] = soldiers(g);
    expect(soldiers(g)).toHaveLength(1);
    expect(getPower(g, soldier!)).toBe(1);
    expect(g.obj(soldier!).isToken).toBe(true);
    expect(g.decision.kind).toBe('priority');
  });

  it('discarding the card just drawn works too', () => {
    const g = setup(['h-spare-spell', 'forest', 'forest']);
    castFirst(g, 'p1', 'h-instructor');
    settle(g);
    g.do({ type: 'discard', player: 'p1', card: g.id('p1', 'h-spare-spell', 'hand') });
    expect(soldiers(g)).toHaveLength(1);
  });

  it('discarding a land card makes no token', () => {
    const g = setup(['h-spare-land', 'forest', 'forest'], ['h-spare-land']);
    castFirst(g, 'p1', 'h-instructor');
    settle(g);
    g.do({ type: 'discard', player: 'p1', card: g.state.players.p1.hand[0]! });
    expect(soldiers(g)).toHaveLength(0);
    expect(g.state.players.p1.graveyard).toHaveLength(1);
  });

  it('the discard is not optional: the only way on is to discard', () => {
    const g = setup(['h-spare-land', 'forest', 'forest']);
    castFirst(g, 'p1', 'h-instructor');
    settle(g);
    expect(g.decision.kind).toBe('discard');
    const actions = g.legal('p1');
    expect(actions.every((a) => a.type === 'discard')).toBe(true);
  });

  it('works from a death trigger (Lake-town Lookout)', () => {
    const g = new Game(
      scenario({
        p1: {
          hand: ['shock', 'h-relic'],
          library: ['h-spare-land', 'forest'],
          battlefield: ['mountain', 'h-lookout'],
        },
      }),
    );
    const lookout = g.id('p1', 'h-lookout');
    g.do(
      casts(g, 'p1', g.id('p1', 'shock', 'hand')).find((a) =>
        a.targets.some((t) => 'object' in t && t.object.id === lookout),
      )!,
    );
    settle(g);
    expect(g.decision.kind).toBe('discard');
    g.do({ type: 'discard', player: 'p1', card: g.id('p1', 'h-relic', 'hand') });
    expect(soldiers(g)).toHaveLength(1);
  });

  it('is only for you: the opponent keeps their hand and gets no token', () => {
    const g = setup(['h-spare-spell', 'forest', 'forest'], ['h-relic']);
    castFirst(g, 'p1', 'h-instructor');
    settle(g);
    g.do({ type: 'discard', player: 'p1', card: g.id('p1', 'h-relic', 'hand') });
    expect(soldiers(g, 'p2')).toHaveLength(0);
    expect(g.state.players.p2.hand).toHaveLength(0);
  });

  it('with an empty library the draw loses the game at the next state-based check, and nothing is discarded from an empty hand', () => {
    const g = new Game(
      scenario({
        p1: { hand: ['h-instructor'], library: [], battlefield: ['plains', 'plains'] },
      }),
    );
    castFirst(g, 'p1', 'h-instructor');
    settle(g);
    expect(soldiers(g)).toHaveLength(0);
    expect(g.state.players.p1.lost).toBe(true);
  });
});
