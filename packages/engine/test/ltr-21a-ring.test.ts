import { describe, expect, it } from 'vitest';
import { casts, find, Game, getPower, scenario, supertypes, withRing } from './ltr-fixtures.ts';

// The Lord of the Rings (21a): "the Ring tempts you" (rule 701.54): the emblem, the Ring-bearer and the choice of it.

const castFirst = (g: Game, player: 'p1' | 'p2', defId: string) =>
  g.do(casts(g, player, g.id(player, defId, 'hand'))[0]!);

/** Passes priority until nothing is on the stack and no choice is pending (bounded). */
const settle = (g: Game) => {
  for (let i = 0; i < 30 && g.state.stack.length > 0 && g.decision.kind === 'priority'; i++)
    g.passBoth();
};

/** Answers the "Choose your Ring-bearer" prompt with this creature. */
const choose = (g: Game, id: string) => {
  expect(g.decision.kind).toBe('chooseObject');
  g.do({ type: 'chooseCard', player: 'p1', card: id });
  settle(g);
};

const ring = (g: Game, p: 'p1' | 'p2' = 'p1') => g.state.players[p].ring;
const bearer = (g: Game, p: 'p1' | 'p2' = 'p1') => ring(g, p)?.bearer?.id;
const typeNames = (g: Game, id: string) => [...supertypes(g, id)];

describe('The Ring tempts you', () => {
  it('with no creature: you get the Ring, nobody is chosen, and it still tempted you', () => {
    const g = new Game(scenario({ p1: { hand: ['l-tempt'] } }));
    castFirst(g, 'p1', 'l-tempt');
    settle(g);
    expect(ring(g)).toEqual({ tempted: 1 });
    expect(g.events).toContainEqual({ type: 'ringTempted', player: 'p1', tempted: 1 });
    expect(g.events.some((e) => e.type === 'ringBearerChosen')).toBe(false);
    expect(ring(g, 'p2')).toBeUndefined();
  });

  it('with one creature: it becomes your Ring-bearer without a prompt', () => {
    const g = new Game(scenario({ p1: { hand: ['l-tempt'], battlefield: ['l-bear'] } }));
    castFirst(g, 'p1', 'l-tempt');
    settle(g);
    const bear = g.id('p1', 'l-bear');
    expect(g.decision.kind).toBe('priority');
    expect(bearer(g)).toBe(bear);
    expect(ring(g)?.tempted).toBe(1);
    expect(g.events).toContainEqual({ type: 'ringBearerChosen', player: 'p1', id: bear });
    expect(g.events).toContainEqual({ type: 'ringTempted', player: 'p1', tempted: 1, bearer: bear });
  });

  it('with several creatures: "Choose your Ring-bearer", any of them, and the rest of the spell goes on', () => {
    const g = new Game(
      scenario({
        p1: { hand: ['l-tempt-draw'], battlefield: ['l-bear', 'l-big', 'l-small'] },
        p2: { battlefield: ['l-giant'] },
      }),
    );
    const handBefore = g.state.players.p1.hand.length;
    castFirst(g, 'p1', 'l-tempt-draw');
    g.passBoth();
    const d = g.decision;
    if (d.kind !== 'chooseObject') throw new Error(`expected a choice, got ${d.kind}`);
    expect(d.ringBearer).toBe(true);
    expect(d.player).toBe('p1');
    // Only your own creatures.
    expect(new Set(d.options)).toEqual(
      new Set([g.id('p1', 'l-bear'), g.id('p1', 'l-big'), g.id('p1', 'l-small')]),
    );
    expect(g.legal('p1').filter((a) => a.type === 'chooseCard')).toHaveLength(3);
    // Nothing has been drawn yet, and no Ring-bearer.
    expect(g.state.players.p1.hand.length).toBe(handBefore - 1);
    expect(bearer(g)).toBeUndefined();
    choose(g, g.id('p1', 'l-big'));
    expect(bearer(g)).toBe(g.id('p1', 'l-big'));
    // "...then draw a card" (the effects after the temptation).
    expect(g.state.players.p1.hand.length).toBe(handBefore);
  });

  it('the creature that tempted you can be the Ring-bearer (the source is on offer)', () => {
    const g = new Game(scenario({ p1: { hand: ['l-rohirrim'], battlefield: ['l-small'] } }));
    castFirst(g, 'p1', 'l-rohirrim');
    g.passBoth(); // the creature resolves, its enters trigger goes on the stack
    g.passBoth();
    const d = g.decision;
    if (d.kind !== 'chooseObject') throw new Error(`expected a choice, got ${d.kind}`);
    expect(d.options).toContain(g.id('p1', 'l-rohirrim'));
    choose(g, g.id('p1', 'l-rohirrim'));
    expect(bearer(g)).toBe(g.id('p1', 'l-rohirrim'));
  });

  it('each time you choose, even if you have a Ring-bearer already: a new choice replaces the old Ring-bearer', () => {
    const state = scenario({
      p1: { hand: ['l-tempt', 'l-tempt'], battlefield: ['l-bear', 'l-big'] },
    });
    withRing(state, 'p1', 1, find(state, 'p1', 'l-bear'));
    const g = new Game(state);
    const bear = g.id('p1', 'l-bear');
    const big = g.id('p1', 'l-big');
    castFirst(g, 'p1', 'l-tempt');
    g.passBoth();
    // Both are offered, the current Ring-bearer too.
    const d = g.decision;
    if (d.kind !== 'chooseObject') throw new Error(`expected a choice, got ${d.kind}`);
    expect(new Set(d.options)).toEqual(new Set([bear, big]));
    choose(g, big);
    expect(bearer(g)).toBe(big);
    expect(ring(g)?.tempted).toBe(2);
    // The old one is just a creature again; the new one is legendary.
    expect(typeNames(g, bear)).not.toContain('Legendary');
    expect(typeNames(g, big)).toContain('Legendary');
    // Choosing the same creature again is a choice too.
    castFirst(g, 'p1', 'l-tempt');
    g.passBoth();
    choose(g, big);
    expect(bearer(g)).toBe(big);
    expect(ring(g)?.tempted).toBe(3);
  });

  it('the Ring counts every time it tempts you, past the four abilities', () => {
    const state = scenario({ p1: { hand: ['l-tempt', 'l-tempt', 'l-tempt'] } });
    withRing(state, 'p1', 3);
    const g = new Game(state);
    const counts: number[] = [];
    for (let i = 0; i < 3; i++) {
      castFirst(g, 'p1', 'l-tempt');
      settle(g);
      counts.push(ring(g)!.tempted);
    }
    expect(counts).toEqual([4, 5, 6]);
  });

  it('the opponent has their own Ring', () => {
    const g = new Game(
      scenario({
        p1: { hand: ['l-tempt'], battlefield: ['l-bear'] },
        p2: { battlefield: ['l-big'] },
      }),
    );
    castFirst(g, 'p1', 'l-tempt');
    settle(g);
    expect(bearer(g, 'p1')).toBe(g.id('p1', 'l-bear'));
    expect(ring(g, 'p2')).toBeUndefined();
  });
});

describe('The Ring-bearer', () => {
  it('is legendary (the first ability): "a legendary creature you control" counts it', () => {
    const state = scenario({ p1: { battlefield: ['l-esquire', 'l-bear'] } });
    const g0 = new Game(state);
    // No legendary creature yet: the Esquire is a 1/1.
    expect(getPower(g0, g0.id('p1', 'l-esquire'))).toBe(1);
    withRing(state, 'p1', 1, find(state, 'p1', 'l-bear'));
    const g = new Game(state);
    const [esquire, bear] = [g.id('p1', 'l-esquire'), g.id('p1', 'l-bear')];
    expect(typeNames(g, bear)).toContain('Legendary');
    expect(typeNames(g, esquire)).not.toContain('Legendary');
    expect(getPower(g, esquire)).toBe(2);
    // The Esquire as the Ring-bearer: legendary itself, and counts itself.
    const state2 = scenario({ p1: { battlefield: ['l-esquire'] } });
    withRing(state2, 'p1', 1, find(state2, 'p1', 'l-esquire'));
    const g2 = new Game(state2);
    expect(getPower(g2, g2.id('p1', 'l-esquire'))).toBe(2);
  });

  it('is legendary only while it is the Ring-bearer, and only the Ring-bearer', () => {
    const state = scenario({ p1: { battlefield: ['l-bear', 'l-bear-2'] } });
    withRing(state, 'p1', 2, find(state, 'p1', 'l-bear'));
    const g = new Game(state);
    expect(typeNames(g, g.id('p1', 'l-bear'))).toContain('Legendary');
    expect(typeNames(g, g.id('p1', 'l-bear-2'))).not.toContain('Legendary');
  });

  it('stops being the Ring-bearer when it leaves the battlefield, and does not come back as one', () => {
    const state = scenario({
      p1: { hand: ['l-blink'], battlefield: ['l-bear'] },
    });
    withRing(state, 'p1', 1, find(state, 'p1', 'l-bear'));
    const g = new Game(state);
    const bear = g.id('p1', 'l-bear');
    g.do(casts(g, 'p1', g.id('p1', 'l-blink', 'hand')).find((a) => a.targets.some((t) => 'object' in t && t.object.id === bear))!);
    settle(g);
    expect(g.zoneOf(bear)).toBe('battlefield'); // it came back
    expect(bearer(g)).toBeUndefined();
    expect(ring(g)?.tempted).toBe(1); // the emblem stays
    expect(typeNames(g, bear)).not.toContain('Legendary');
  });

  it('stops being the Ring-bearer when another player gains control of it', () => {
    const state = scenario({
      p1: { battlefield: ['l-bear'] },
      p2: { hand: ['l-steal'], battlefield: [] },
      active: 'p2',
    });
    withRing(state, 'p1', 1, find(state, 'p1', 'l-bear'));
    const g = new Game(state);
    const bear = g.id('p1', 'l-bear');
    g.do(casts(g, 'p2', g.id('p2', 'l-steal', 'hand')).find((a) => a.targets.some((t) => 'object' in t && t.object.id === bear))!);
    for (let i = 0; i < 4 && g.state.stack.length > 0; i++) g.passBoth();
    expect(g.state.objects[bear]!.controller).toBe('p2');
    expect(bearer(g, 'p1')).toBeUndefined();
    expect(bearer(g, 'p2')).toBeUndefined();
  });

  it('"your Ring-bearer" can be named by an effect (a Ref), and is nothing without one', () => {
    const state = scenario({ p1: { hand: ['l-bearer-pump'], battlefield: ['l-bear', 'l-small'] } });
    withRing(state, 'p1', 1, find(state, 'p1', 'l-small'));
    const g = new Game(state);
    castFirst(g, 'p1', 'l-bearer-pump');
    settle(g);
    const power = (id: string) => g.state.effects.filter((e) => e.affected.id === id).reduce((n, e) => n + e.power, 0);
    expect(power(g.id('p1', 'l-small'))).toBe(3);
    expect(power(g.id('p1', 'l-bear'))).toBe(0);
  });
});
