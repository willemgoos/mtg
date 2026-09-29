import { describe, expect, it } from 'vitest';
import { createRng, nextInt, shuffleInPlace } from '../src/rng.ts';
import { DB, engine, Game, scenario } from './helpers.ts';

describe('seeded RNG', () => {
  it('is deterministic per seed', () => {
    const a = createRng(123);
    const b = createRng(123);
    const c = createRng(124);
    const seqA = Array.from({ length: 5 }, () => nextInt(a, 1000));
    const seqB = Array.from({ length: 5 }, () => nextInt(b, 1000));
    const seqC = Array.from({ length: 5 }, () => nextInt(c, 1000));
    expect(seqA).toEqual(seqB);
    expect(seqA).not.toEqual(seqC);
  });

  it('shuffles into a permutation', () => {
    const arr = Array.from({ length: 40 }, (_, i) => i);
    shuffleInPlace(createRng(1), arr);
    expect([...arr].sort((x, y) => x - y)).toEqual(Array.from({ length: 40 }, (_, i) => i));
    expect(arr).not.toEqual(Array.from({ length: 40 }, (_, i) => i));
  });
});

describe('game setup and mulligans', () => {
  const decks = { p1: Array(40).fill('forest'), p2: Array(40).fill('mountain') };

  it('deals 7 cards each and asks the starting player first', () => {
    const s = engine.newGame({ decks, seed: 7, startingPlayer: 'p2' });
    expect(s.players.p1.hand).toHaveLength(7);
    expect(s.players.p2.hand).toHaveLength(7);
    expect(s.players.p1.library).toHaveLength(33);
    expect(s.decision).toEqual({ kind: 'mulligan', player: 'p2' });
  });

  it('applies setup options: life, extra cards (also after a mulligan) and a land in play', () => {
    const s = engine.newGame({
      decks,
      seed: 7,
      startingPlayer: 'p1',
      life: { p1: 25 },
      extraCards: { p1: 1 },
      landInPlay: ['p1'],
    });
    expect(s.players.p1.life).toBe(25);
    expect(s.players.p2.life).toBe(20);
    expect(s.players.p1.hand).toHaveLength(8);
    expect(s.players.p2.hand).toHaveLength(7);
    expect(s.battlefield).toHaveLength(1);
    expect(s.objects[s.battlefield[0]!]!.controller).toBe('p1');
    expect(s.players.p1.library).toHaveLength(31);
    const after = engine.applyAction(s, { type: 'mulligan', player: 'p1' }).state;
    expect(after.players.p1.hand).toHaveLength(8);
  });

  it('is reproducible from the seed', () => {
    const mixed = { p1: [...Array(20).fill('forest'), ...Array(20).fill('bear')], p2: decks.p2 };
    const a = engine.newGame({ decks: mixed, seed: 99 });
    const b = engine.newGame({ decks: mixed, seed: 99 });
    expect(a).toEqual(b);
  });

  it('London mulligan: draw 7, then bottom one card per mulligan', () => {
    const g = new Game(engine.newGame({ decks, seed: 1, startingPlayer: 'p1' }));
    g.do({ type: 'mulligan', player: 'p1' });
    expect(g.state.players.p1.hand).toHaveLength(7);
    g.do({ type: 'keepHand', player: 'p1' });
    expect(g.decision).toEqual({ kind: 'bottomCards', player: 'p1', count: 1 });
    const card = g.state.players.p1.hand[0]!;
    g.do({ type: 'bottomCard', player: 'p1', card });
    expect(g.state.players.p1.hand).toHaveLength(6);
    expect(g.state.players.p1.library.at(-1)).toBe(card);
    expect(g.decision).toEqual({ kind: 'mulligan', player: 'p2' });
    g.do({ type: 'keepHand', player: 'p2' });
    // Turn 1 starts; the starting player skips their draw.
    expect(g.state.turn).toMatchObject({ number: 1, activePlayer: 'p1', step: 'upkeep' });
    g.passUntilStep('main1');
    expect(g.state.players.p1.hand).toHaveLength(6);
  });
});

describe('turn structure', () => {
  it('walks through every step and hands the turn over', () => {
    const g = new Game(scenario({ step: 'upkeep', turn: 2 }));
    const steps: string[] = [];
    while (g.state.turn.activePlayer === 'p1') {
      steps.push(g.state.turn.step);
      g.passBoth();
    }
    // No attackers: blockers and damage steps are skipped (rule 508.8).
    expect(steps).toEqual([
      'upkeep',
      'draw',
      'main1',
      'beginCombat',
      'declareAttackers',
      'endCombat',
      'main2',
      'end',
    ]);
    expect(g.state.turn).toMatchObject({ number: 3, activePlayer: 'p2', step: 'upkeep' });
  });

  it('draws in the draw step', () => {
    const g = new Game(scenario({ step: 'upkeep' }));
    g.passBoth();
    expect(g.state.turn.step).toBe('draw');
    expect(g.state.players.p1.hand).toHaveLength(1);
  });

  it('untaps and clears summoning sickness for the active player only', () => {
    const g = new Game(
      scenario({
        step: 'end',
        p1: { battlefield: [{ card: 'bear', tapped: true }] },
        p2: { battlefield: [{ card: 'bear', tapped: true, sick: true }] },
      }),
    );
    g.passBoth(); // end → cleanup → p2's untap → upkeep
    expect(g.state.turn.activePlayer).toBe('p2');
    expect(g.obj(g.id('p2', 'bear')).tapped).toBe(false);
    expect(g.obj(g.id('p2', 'bear')).summoningSick).toBe(false);
    expect(g.obj(g.id('p1', 'bear')).tapped).toBe(true);
  });

  it('allows one land per turn, only at sorcery speed', () => {
    const g = new Game(scenario({ p1: { hand: ['forest', 'forest'] } }));
    const lands = g.legal().filter((a) => a.type === 'playLand');
    expect(lands).toHaveLength(2);
    g.do(lands[0]!);
    expect(g.legal().some((a) => a.type === 'playLand')).toBe(false);

    const g2 = new Game(scenario({ step: 'upkeep', p1: { hand: ['forest'] } }));
    expect(g2.legal().some((a) => a.type === 'playLand')).toBe(false);
  });

  it('discards down to 7 in cleanup', () => {
    const g = new Game(scenario({ step: 'end', p1: { hand: Array(9).fill('bear') } }));
    g.passBoth();
    expect(g.decision).toEqual({ kind: 'discardToHandSize', player: 'p1', count: 2 });
    g.do(g.legal()[0]!).do(g.legal()[0]!);
    expect(g.state.players.p1.hand).toHaveLength(7);
    expect(g.state.players.p1.graveyard).toHaveLength(2);
    expect(g.state.turn.activePlayer).toBe('p2');
  });

  it('removes damage and until-end-of-turn effects in cleanup', () => {
    const g = new Game(
      scenario({
        p1: { hand: ['giant-growth'], battlefield: ['forest', { card: 'ogre', damage: 2 }] },
      }),
    );
    const ogre = g.id('p1', 'ogre');
    g.do({
      type: 'castSpell',
      player: 'p1',
      card: g.id('p1', 'giant-growth', 'hand'),
      targets: [g.ref(ogre)],
    });
    g.passBoth();
    expect(g.state.effects).toHaveLength(1);
    g.passUntilStep('end').passBoth();
    expect(g.state.effects).toHaveLength(0);
    expect(g.obj(ogre).damage).toBe(0);
  });

  it('rejects illegal actions', () => {
    const g = new Game(scenario({ p1: { hand: ['forest'] } }));
    expect(() => g.do({ type: 'passPriority', player: 'p2' })).toThrow(/Illegal/);
    expect(() =>
      g.do({ type: 'castSpell', player: 'p1', card: g.id('p1', 'forest', 'hand'), targets: [] }),
    ).toThrow(/Illegal/);
  });

  it('concede ends the game', () => {
    const g = new Game(scenario());
    g.do({ type: 'concede', player: 'p2' });
    expect(g.state.winner).toBe('p1');
    expect(g.decision.kind).toBe('gameOver');
    expect(engine.getLegalActions(g.state, 'p1')).toEqual([]);
  });

  it('state stays plain serializable data', () => {
    const g = new Game(scenario({ p1: { hand: ['shock'], battlefield: ['mountain'] } }));
    g.do(g.legal().find((a) => a.type === 'castSpell')!);
    expect(JSON.parse(JSON.stringify(g.state))).toEqual(g.state);
    expect(DB.size).toBeGreaterThan(0);
  });
});
