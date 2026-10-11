import { describe, expect, it } from 'vitest';
import {
  casts,
  find,
  Game,
  getPower,
  scenario,
  SOLDIER,
  withRing,
} from './ltr-fixtures.ts';

// The Lord of the Rings (21a): "whenever the Ring tempts you", "whenever you choose a creature as your Ring-bearer", and the
// conditions about the Ring and the Ring-bearer.

const castFirst = (g: Game, player: 'p1' | 'p2', defId: string) =>
  g.do(casts(g, player, g.id(player, defId, 'hand'))[0]!);

const settle = (g: Game) => {
  for (let i = 0; i < 30 && g.state.stack.length > 0 && g.decision.kind === 'priority'; i++)
    g.passBoth();
};

const choose = (g: Game, id: string, player: 'p1' | 'p2' = 'p1') => {
  expect(g.decision.kind).toBe('chooseObject');
  g.do({ type: 'chooseCard', player, card: id });
  settle(g);
};

const count = (g: Game, player: 'p1' | 'p2', defId: string) =>
  g.state.battlefield.filter((id) => {
    const o = g.state.objects[id]!;
    return o.defId === defId && o.controller === player;
  }).length;

describe('Whenever the Ring tempts you', () => {
  it('Faramir: a Ring-bearer other than him makes a Human Soldier; choosing him does not', () => {
    const g = new Game(
      scenario({
        p1: { hand: ['l-tempt', 'l-tempt'], battlefield: ['l-faramir', 'l-bear'] },
      }),
    );
    castFirst(g, 'p1', 'l-tempt');
    g.passBoth();
    choose(g, g.id('p1', 'l-bear'));
    expect(count(g, 'p1', SOLDIER)).toBe(1);
    castFirst(g, 'p1', 'l-tempt');
    g.passBoth();
    choose(g, g.id('p1', 'l-faramir'));
    settle(g);
    expect(count(g, 'p1', SOLDIER)).toBe(1);
  });

  it('triggers after the Ring-bearer is chosen (the trigger sees the choice) and before the spell\'s later effects', () => {
    const g = new Game(
      scenario({
        p1: { hand: ['l-tempt-draw'], battlefield: ['l-galadriel', 'l-bear'] },
      }),
    );
    const hand = g.state.players.p1.hand.length;
    castFirst(g, 'p1', 'l-tempt-draw');
    g.passBoth();
    choose(g, g.id('p1', 'l-bear'));
    // The spell's draw, then the trigger's draw.
    settle(g);
    expect(g.state.players.p1.hand.length).toBe(hand - 1 + 2);
  });

  it('triggers even when there is no creature to choose (the Ring still tempts you), and only for the player it tempted', () => {
    const g = new Game(
      scenario({
        p1: { hand: ['l-tempt'], graveyard: ['l-ringwraiths'] },
        p2: { graveyard: ['l-ringwraiths'] },
      }),
    );
    castFirst(g, 'p1', 'l-tempt');
    settle(g);
    // Ringwraiths: "When the Ring tempts you, return this card from your graveyard to your hand."
    expect(g.state.players.p1.hand.map((id) => g.state.objects[id]!.defId)).toContain('l-ringwraiths');
    expect(g.state.players.p1.graveyard).toHaveLength(1); // the spell
    expect(g.state.players.p2.graveyard.map((id) => g.state.objects[id]!.defId)).toEqual(['l-ringwraiths']);
  });

  it('Nazgûl: its own enters trigger tempts you, and every tempting puts a counter on each Wraith', () => {
    const g = new Game(
      scenario({
        p1: { hand: ['l-nazgul', 'l-tempt'], battlefield: ['l-nazgul'] },
      }),
    );
    const first = g.id('p1', 'l-nazgul');
    castFirst(g, 'p1', 'l-nazgul');
    g.passBoth(); // resolves the creature; its trigger goes on the stack
    g.passBoth(); // the tempt: two creatures to choose from
    choose(g, first);
    settle(g);
    // Both Nazgûl (each has the trigger) put a counter on each Wraith: 2 each, then the new one's too.
    expect(g.state.objects[first]!.plusOneCounters).toBe(2);
    expect(getPower(g, first)).toBe(4);
  });
});

describe('Whenever you choose a creature as your Ring-bearer', () => {
  it('every time: with several creatures, with only one, and when it is the same creature again', () => {
    const g = new Game(
      scenario({
        p1: { hand: ['l-tempt', 'l-tempt'], battlefield: ['l-call', 'l-bear'], library: ['forest', 'forest', 'forest', 'forest'] },
      }),
    );
    const hand = () => g.state.players.p1.hand.length;
    const h0 = hand();
    // One creature: chosen without a prompt, and the trigger fires.
    castFirst(g, 'p1', 'l-tempt');
    settle(g);
    expect(hand()).toBe(h0 - 1 + 1);
    // The same creature again.
    castFirst(g, 'p1', 'l-tempt');
    settle(g);
    expect(hand()).toBe(h0 - 2 + 2);
  });

  it('not when there is no creature to choose', () => {
    const g = new Game(scenario({ p1: { hand: ['l-tempt'], battlefield: ['l-call'] } }));
    const h0 = g.state.players.p1.hand.length;
    castFirst(g, 'p1', 'l-tempt');
    settle(g);
    expect(g.state.players.p1.hand.length).toBe(h0 - 1);
  });
});

describe('Conditions about the Ring-bearer', () => {
  it('"as long as this is your Ring-bearer" (isRingBearer)', () => {
    const state = scenario({ p1: { battlefield: ['l-necromancer', 'l-bear'] } });
    const g0 = new Game(state);
    expect(getPower(g0, g0.id('p1', 'l-necromancer'))).toBe(3);
    withRing(state, 'p1', 1, find(state, 'p1', 'l-necromancer'));
    const g = new Game(state);
    expect(getPower(g, g.id('p1', 'l-necromancer'))).toBe(5);
    withRing(state, 'p1', 1, find(state, 'p1', 'l-bear'));
    const g2 = new Game(state);
    expect(getPower(g2, g2.id('p1', 'l-necromancer'))).toBe(3);
  });

  it('Dúnedain Rangers: landfall tempts you only when you don\'t control a Ring-bearer', () => {
    const state = scenario({
      p1: { hand: ['forest', 'forest'], battlefield: ['l-dunedain'] },
    });
    const g = new Game(state);
    g.do(g.legal('p1').find((a) => a.type === 'playLand')!);
    settle(g);
    // The only creature is chosen as the Ring-bearer.
    expect(g.state.players.p1.ring?.tempted).toBe(1);
    expect(g.state.players.p1.ring?.bearer?.id).toBe(g.id('p1', 'l-dunedain'));
    // With a Ring-bearer, no more.
    state.turn.number = 3;
    g.state.players.p1.landsPlayedThisTurn = 0;
    g.do(g.legal('p1').find((a) => a.type === 'playLand')!);
    settle(g);
    expect(g.state.players.p1.ring?.tempted).toBe(1);
  });

  it('"the Ring has tempted you N or more times"', () => {
    const state = scenario({ p1: { hand: ['l-frodo'] } });
    withRing(state, 'p1', 3);
    const g = new Game(state);
    castFirst(g, 'p1', 'l-frodo');
    settle(g);
    // Three times so far: it tempts a fourth time.
    expect(g.state.players.p1.ring?.tempted).toBe(4);
    expect(g.life('p1')).toBe(20);
    const state2 = scenario({ p1: { hand: ['l-frodo'] } });
    withRing(state2, 'p1', 4);
    const g2 = new Game(state2);
    castFirst(g2, 'p1', 'l-frodo');
    settle(g2);
    expect(g2.state.players.p1.ring?.tempted).toBe(4);
    expect(g2.life('p1')).toBe(15);
  });

  it('"your Ring-bearer\'s power" (One Ring to Rule Them All: each player mills that many)', () => {
    const g = new Game(
      scenario({
        p1: { hand: ['l-one-ring'], battlefield: ['l-big'] },
        p2: {},
      }),
    );
    const l1 = g.state.players.p1.library.length;
    const l2 = g.state.players.p2.library.length;
    castFirst(g, 'p1', 'l-one-ring');
    settle(g);
    expect(g.state.players.p1.library.length).toBe(l1 - 4);
    expect(g.state.players.p2.library.length).toBe(l2 - 4);
  });

  it('with no Ring-bearer, "your Ring-bearer\'s power" is 0', () => {
    const g = new Game(scenario({ p1: { hand: ['l-one-ring'] }, p2: {} }));
    const l2 = g.state.players.p2.library.length;
    castFirst(g, 'p1', 'l-one-ring');
    settle(g);
    expect(g.state.players.p2.library.length).toBe(l2);
  });
});
