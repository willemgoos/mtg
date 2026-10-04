import { describe, expect, it } from 'vitest';
import { cardDb, slug } from '../src/index.ts';
import { all, cast, game, handSize, n, pt, settle } from './blb-helpers.ts';

// Marvel Super Heroes Jumpstart packet: Tricksters.

const PACKET = [
  'Kid Loki',
  'Living Lies of Loki',
  "Ant-Man's Air Force",
  'Impossible Man',
  'Ghost, Spectral Saboteur',
  'Loki, Lord of Misrule',
  'A.I.M. Scientists',
  'We Say Thee Nay!',
  'Quantum Reduction',
  "Trickster's Stratagem",
  'Multiversal Recruitment',
  'The Clone Saga',
  'Thriving Isle',
  'Island',
];

type G = ReturnType<typeof game>;

/** Resolves everything, answering any decision (surveil, targets) with the first legal choice. */
function resolveAll(g: G): G {
  for (let i = 0; i < 40; i++) {
    if (g.decision.kind === 'priority') {
      if (!g.state.stack.length && !g.state.pendingTriggers.length) return g;
      g.pass();
      continue;
    }
    const legal = g.legal();
    g.do(legal.find((a) => a.type === 'chooseTargets' && a.targets.length > 0) ?? legal[0]!);
  }
  throw new Error('Did not settle');
}

describe('Tricksters packet', () => {
  it('has every card implemented', () => {
    expect(PACKET.filter((name) => !cardDb.has(slug(name)))).toEqual([]);
  });

  it('Living Lies of Loki gets +1/+0 per other Illusion and draws when it dies', () => {
    const g = game({
      p1: {
        battlefield: ['living-lies-of-loki', { card: 'living-lies-of-loki', damage: 3 }],
        library: n('island', 3),
      },
    });
    const [a] = all(g, 'living-lies-of-loki');
    expect(pt(g, a!)).toEqual([2, 3]);
    const before = handSize(g, 'p1');
    // State-based actions kill the damaged one; its trigger draws.
    resolveAll(g.pass());
    expect(all(g, 'living-lies-of-loki')).toHaveLength(1);
    expect(pt(g, all(g, 'living-lies-of-loki')[0]!)).toEqual([1, 3]);
    expect(handSize(g, 'p1')).toBe(before + 1);
  });

  it('Impossible Man becomes a copy until end of turn, keeping his name', () => {
    const g = game({
      p1: { battlefield: ['impossible-man', 'kid-loki', ...n('island', 3)] },
      p2: { battlefield: ['serra-angel'] },
    });
    const man = g.id('p1', 'impossible-man');
    const angel = g.id('p2', 'serra-angel');
    g.do({
      type: 'activateAbility',
      player: 'p1',
      source: man,
      abilityIndex: 0,
      targets: [g.ref(angel)],
    });
    settle(g);
    expect(g.obj(man).defId).toBe('serra-angel');
    expect(pt(g, man)).toEqual([4, 4]);
    g.passUntilStep('end');
    g.passUntilStep('main1');
    expect(g.obj(man).defId).toBe('impossible-man');
  });

  it('Impossible Man copying a legendary creature of yours keeps both (different names)', () => {
    const g = game({
      p1: { battlefield: ['impossible-man', 'kid-loki', ...n('island', 3)] },
    });
    const man = g.id('p1', 'impossible-man');
    const kid = g.id('p1', 'kid-loki');
    g.do({
      type: 'activateAbility',
      player: 'p1',
      source: man,
      abilityIndex: 0,
      targets: [g.ref(kid)],
    });
    settle(g);
    expect(g.obj(man).defId).toBe('kid-loki');
    expect(all(g, 'kid-loki')).toHaveLength(2);
  });

  it('Loki, Lord of Misrule turns your other creatures into nonlegendary copies', () => {
    const g = game({
      p1: {
        battlefield: [
          { card: 'loki-lord-of-misrule', sick: false },
          'kid-loki',
          'bear-cub',
          'island',
        ],
      },
    });
    const loki = g.id('p1', 'loki-lord-of-misrule');
    const kid = g.id('p1', 'kid-loki');
    g.do({
      type: 'activateAbility',
      player: 'p1',
      source: loki,
      abilityIndex: 0,
      targets: [g.ref(kid)],
    });
    settle(g);
    // Loki and the Bear Cub become Kid Loki copies; the legend rule doesn't apply to them.
    expect(all(g, 'kid-loki')).toHaveLength(3);
    expect(g.obj(loki).defId).toBe('kid-loki');
    g.passUntilStep('end');
    g.passUntilStep('main1');
    expect(g.obj(loki).defId).toBe('loki-lord-of-misrule');
    expect(all(g, 'bear-cub')).toHaveLength(1);
  });

  it('Multiversal Recruitment copies a legendary creature as a nonlegendary token, and has flashback', () => {
    const g = game({
      p1: {
        hand: ['multiversal-recruitment'],
        battlefield: ['kid-loki', ...n('island', 11)],
      },
    });
    const kid = g.id('p1', 'kid-loki');
    settle(cast(g, 'multiversal-recruitment', [g.ref(kid)]));
    expect(all(g, 'kid-loki')).toHaveLength(2);
    const card = g.id('p1', 'multiversal-recruitment', 'graveyard');
    const flashback = g
      .legal()
      .find((a) => a.type === 'castSpell' && a.card === card && a.targets.length > 0);
    expect(flashback).toBeDefined();
    settle(g.do(flashback!));
    expect(all(g, 'kid-loki')).toHaveLength(3);
    expect(g.zoneOf(card)).toBe('exile');
  });

  it('The Clone Saga chapter I surveils 3', () => {
    const g = game({
      p1: { hand: ['the-clone-saga'], battlefield: n('island', 4), library: n('island', 5) },
    });
    cast(g, 'the-clone-saga');
    resolveAll(g);
    const saga = g.id('p1', 'the-clone-saga');
    expect(g.obj(saga).counters?.lore).toBe(1);
    // The first legal surveil answer is made; the library has been looked at (no cards drawn).
    expect(g.state.players.p1.library.length + g.state.players.p1.graveyard.length).toBe(5);
  });

  it('The Clone Saga chapter II copies the next creature spell, not legendary', () => {
    const g = game({
      step: 'upkeep',
      p1: {
        hand: ['kid-loki'],
        battlefield: ['the-clone-saga', 'island'],
        library: n('island', 3),
      },
    });
    g.obj(g.id('p1', 'the-clone-saga')).counters = { lore: 1 };
    for (let i = 0; i < 10 && g.state.turn.step !== 'main1'; i++) g.pass();
    resolveAll(g);
    resolveAll(cast(g, 'kid-loki'));
    const kids = all(g, 'kid-loki');
    expect(kids).toHaveLength(2);
    expect(kids.filter((id) => g.obj(id).isToken)).toHaveLength(1);
  });

  it('The Clone Saga chapter III: creatures with the chosen name draw on combat damage', () => {
    const g = game({
      step: 'upkeep',
      p1: {
        battlefield: ['the-clone-saga', { card: 'bear-cub', sick: false }],
        library: n('island', 5),
      },
    });
    g.obj(g.id('p1', 'the-clone-saga')).counters = { lore: 2 };
    for (let i = 0; i < 10 && g.state.turn.step !== 'main1'; i++) g.pass();
    resolveAll(g);
    expect(all(g, 'the-clone-saga')).toHaveLength(0);
    const hand = handSize(g, 'p1');
    g.passUntilStep('beginCombat').passBoth().attack(g.id('p1', 'bear-cub'));
    for (let i = 0; i < 20 && g.state.turn.step !== 'main2'; i++) resolveAll(g).pass();
    expect(g.life('p2')).toBe(18);
    expect(handSize(g, 'p1')).toBe(hand + 1);
  });
});
