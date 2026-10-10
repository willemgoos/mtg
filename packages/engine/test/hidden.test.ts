import { describe, expect, it } from 'vitest';
import { cloneState } from '../src/clone.ts';
import { determinize, HIDDEN_CARD, redactEvents, redactFor } from '../src/hidden.ts';
import { playRandomGame } from '../src/random-play.ts';
import { engine, Game } from './helpers.ts';

const decks = {
  p1: [...Array<string>(20).fill('forest'), ...Array<string>(20).fill('bear')],
  p2: [...Array<string>(20).fill('mountain'), ...Array<string>(20).fill('shock')],
};
const newGame = (seed = 3) => engine.newGame({ decks, seed, startingPlayer: 'p1' });

describe('hidden information', () => {
  it('object ids do not reveal decklist order', () => {
    const s = newGame();
    const byId = Object.values(s.objects)
      .filter((o) => o.owner === 'p1')
      .sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)))
      .map((o) => o.defId);
    expect(byId).not.toEqual(decks.p1);
  });

  it('redactFor hides libraries and the opponent’s hand, and the RNG', () => {
    const s = newGame();
    const r = redactFor(s, 'p1');
    const defs = (ids: string[]) => ids.map((id) => r.objects[id]!.defId);
    expect(defs(r.players.p1.hand)).toEqual(s.players.p1.hand.map((id) => s.objects[id]!.defId));
    expect(new Set(defs(r.players.p2.hand))).toEqual(new Set([HIDDEN_CARD]));
    expect(new Set(defs([...r.players.p1.library, ...r.players.p2.library]))).toEqual(
      new Set([HIDDEN_CARD]),
    );
    expect(r.players.p2.hand).toHaveLength(7);
    expect(r.seed).toBe(0);
    expect(r.rng.s).toEqual([0, 0, 0, 0]);
    // The original is untouched.
    expect(s.objects[s.players.p2.hand[0]!]!.defId).not.toBe(HIDDEN_CARD);
  });

  it('redactEvents hides opponent draws but not public moves', () => {
    const g = new Game(newGame());
    g.do({ type: 'keepHand', player: 'p1' }).do({ type: 'keepHand', player: 'p2' });
    g.passUntilStep('end').passBoth().passUntilStep('main1'); // into p2's turn, past their draw
    const p1View = redactEvents(g.events, g.state, 'p1');
    const p2Draw = p1View.find(
      (e) => e.type === 'objectMoved' && e.to === 'hand' && g.obj(e.id).owner === 'p2',
    );
    expect(p2Draw).toMatchObject({ defId: HIDDEN_CARD });
    const p2View = redactEvents(g.events, g.state, 'p2');
    const ownDraw = p2View.find(
      (e) => e.type === 'objectMoved' && e.to === 'hand' && g.obj(e.id).owner === 'p2',
    );
    expect(ownDraw).not.toMatchObject({ defId: HIDDEN_CARD });
  });

  it('determinize fills hidden cards consistently with the decklists', () => {
    const s = newGame();
    const d = determinize(redactFor(s, 'p1'), decks, 42);
    for (const p of ['p1', 'p2'] as const) {
      const defs = Object.values(d.objects)
        .filter((o) => o.owner === p)
        .map((o) => o.defId)
        .sort();
      expect(defs).toEqual([...decks[p]].sort());
    }
    // The viewer's own hand is kept exactly.
    for (const id of s.players.p1.hand) expect(d.objects[id]!.defId).toBe(s.objects[id]!.defId);
    // Same seed, same sample.
    expect(determinize(redactFor(s, 'p1'), decks, 42)).toEqual(d);
  });

  it('determinize accepts cards from outside the decklist (a Lesson fetched by Learn)', () => {
    const v = redactFor(newGame(), 'p1');
    // p1 shows a card that isn't in the list; p2 has one hidden card more than the list accounts for.
    v.objects[v.players.p1.hand[0]!]!.defId = 'shock';
    const extra = { ...v.objects[v.players.p2.hand[0]!]!, id: 'o999' };
    v.objects.o999 = extra;
    v.players.p2.hand.push('o999');
    const d = determinize(v, decks, 5);
    expect(d.objects[v.players.p1.hand[0]!]!.defId).toBe('shock');
    for (const o of Object.values(d.objects)) expect(o.defId).not.toBe(HIDDEN_CARD);
    expect(decks.p2).toContain(d.objects.o999!.defId);
  });

  it('a determinized mid-game state can be played to completion', () => {
    const r = playRandomGame(engine, newGame(9), 1, { maxActions: 150 });
    const d = determinize(redactFor(r.final, 'p2'), decks, 7);
    const end = playRandomGame(engine, d, 2);
    expect(end.winner).not.toBeNull();
  });
});

describe('state isolation', () => {
  it('applyAction never mutates its input', () => {
    const r = playRandomGame(engine, newGame(5), 4, { maxActions: 200 });
    const s = r.final;
    const snapshot = JSON.stringify(s);
    const d = s.decision;
    if (d.kind === 'gameOver') return;
    for (const a of engine.getLegalActions(s, d.player)) engine.applyAction(s, a);
    expect(JSON.stringify(s)).toBe(snapshot);
  });

  it('cloneState makes an independent copy', () => {
    const s = newGame();
    const c = cloneState(s);
    expect(c).toEqual(s);
    c.players.p1.hand.pop();
    c.objects[s.players.p1.library[0]!]!.tapped = true;
    c.rng.s[0] = 0;
    expect(s.players.p1.hand).toHaveLength(7);
    expect(s.objects[s.players.p1.library[0]!]!.tapped).toBe(false);
    expect(s.rng.s[0]).not.toBe(0);
  });
});
