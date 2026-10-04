import { describe, expect, it } from 'vitest';
import { cardDb, slug } from '../src/index.ts';
import { cast, game, handSize, n, pt, settle } from './blb-helpers.ts';

// Marvel Super Heroes Jumpstart: the Trained packet (docs/marvel-jumpstart.md).

const TRAINED = [
  'Serpent Specialist',
  'White Tiger, Ava Ayala',
  'Undercover Skrull',
  'Hercules, Prince of Power',
  'She-Hulk, Attorney-at-Law',
  'Pet Avengers',
  'Shang-Chi, Martial Mentor',
  'Wakandan Royal Guard',
  'Advancing the Spirit',
  'Restorative Technique',
  'Punishing Punch',
  'Colossal Collision',
  'Thriving Grove',
  'Forest',
];

const activate = (g: ReturnType<typeof game>, source: string, abilityIndex: number) =>
  g.do({ type: 'activateAbility', player: g.actor, source, abilityIndex, targets: [] });

const canActivate = (g: ReturnType<typeof game>, source: string, abilityIndex: number) =>
  g
    .legal()
    .some(
      (a) => a.type === 'activateAbility' && a.source === source && a.abilityIndex === abilityIndex,
    );

describe('Trained packet', () => {
  it('has every card implemented', () => {
    for (const name of TRAINED) expect(cardDb.has(slug(name)), name).toBe(true);
  });
});

describe('She-Hulk, Attorney-at-Law', () => {
  it('power-up puts a counter on her, then doubles the counters on each creature you control', () => {
    const g = game({
      p1: { battlefield: ['she-hulk-attorney-at-law', 'bear-cub', ...n('forest', 7)] },
      p2: { battlefield: ['bear-cub'] },
    });
    const she = g.id('p1', 'she-hulk-attorney-at-law');
    const bear = g.id('p1', 'bear-cub');
    const theirs = g.id('p2', 'bear-cub');
    g.obj(she).zoneTurn = 0;
    g.obj(bear).plusOneCounters = 2;
    g.obj(theirs).plusOneCounters = 1;
    settle(activate(g, she, 0));
    expect(g.obj(she).plusOneCounters).toBe(2);
    expect(g.obj(bear).plusOneCounters).toBe(4);
    expect(g.obj(theirs).plusOneCounters).toBe(1);
    expect(pt(g, she)).toEqual([5, 5]);
    // Once only.
    expect(canActivate(g, she, 0)).toBe(false);
  });

  it('costs {4} the turn she entered', () => {
    const g = game({
      p1: { battlefield: ['she-hulk-attorney-at-law', ...n('forest', 4)] },
    });
    const she = g.id('p1', 'she-hulk-attorney-at-law');
    g.obj(she).zoneTurn = g.state.turn.number;
    settle(activate(g, she, 0));
    expect(g.obj(she).plusOneCounters).toBe(2);
  });
});

describe('Shang-Chi, Martial Mentor', () => {
  it('doubles +1/+1 counters put on your creatures, including his own power-up', () => {
    const g = game({
      p1: { battlefield: ['shang-chi-martial-mentor', ...n('forest', 7)] },
    });
    const shang = g.id('p1', 'shang-chi-martial-mentor');
    g.obj(shang).zoneTurn = 0;
    settle(activate(g, shang, 1));
    expect(g.obj(shang).plusOneCounters).toBe(6);
    expect(pt(g, shang)).toEqual([10, 10]);
  });

  it("doesn't double counters on an opponent's creatures", () => {
    const g = game({
      p1: { battlefield: ['shang-chi-martial-mentor'] },
      p2: { battlefield: ['serpent-specialist', ...n('forest', 4)] },
      active: 'p2',
    });
    const s = g.id('p2', 'serpent-specialist');
    g.obj(s).zoneTurn = 0;
    settle(activate(g, s, 0));
    expect(g.obj(s).plusOneCounters).toBe(2);
  });
});

describe('Advancing the Spirit', () => {
  it('draws a card when it enters', () => {
    const g = game({ p1: { hand: ['advancing-the-spirit'], battlefield: n('forest', 3) } });
    settle(cast(g, 'advancing-the-spirit'));
    expect(handSize(g, 'p1')).toBe(1);
  });

  it('makes the first power-up each of your turns free, and only the first', () => {
    const g = game({
      p1: {
        battlefield: ['advancing-the-spirit', 'serpent-specialist', 'shang-chi-martial-mentor'],
      },
    });
    const s = g.id('p1', 'serpent-specialist');
    const shang = g.id('p1', 'shang-chi-martial-mentor');
    g.obj(s).zoneTurn = 0;
    g.obj(shang).zoneTurn = 0;
    expect(canActivate(g, shang, 1)).toBe(true);
    settle(activate(g, s, 0));
    // Two counters, doubled by Shang-Chi.
    expect(g.obj(s).plusOneCounters).toBe(4);
    expect(canActivate(g, shang, 1)).toBe(false);
  });

  it("doesn't apply on an opponent's turn", () => {
    const g = game({
      p1: { battlefield: ['advancing-the-spirit', 'serpent-specialist'] },
      active: 'p2',
    });
    const s = g.id('p1', 'serpent-specialist');
    g.obj(s).zoneTurn = 0;
    g.pass();
    expect(g.actor).toBe('p1');
    expect(canActivate(g, s, 0)).toBe(false);
  });
});

describe('Colossal Collision', () => {
  it('puts a counter on your creature, which then deals damage equal to its power', () => {
    const g = game({
      p1: { hand: ['colossal-collision'], battlefield: ['bear-cub', ...n('forest', 4)] },
      p2: { battlefield: ['rumbling-baloth'] },
    });
    const bear = g.id('p1', 'bear-cub');
    const baloth = g.id('p2', 'rumbling-baloth');
    settle(cast(g, 'colossal-collision', [g.ref(bear), g.ref(baloth)]));
    expect(pt(g, bear)).toEqual([3, 3]);
    expect(g.obj(baloth).damage).toBe(3);
    expect(g.obj(bear).damage).toBe(0);
  });

  it('has basic landcycling {2}', () => {
    const g = game({
      p1: { hand: ['colossal-collision'], battlefield: n('forest', 2), library: ['forest'] },
    });
    const card = g.id('p1', 'colossal-collision', 'hand');
    g.do({ type: 'activateAbility', player: 'p1', source: card, abilityIndex: 0, targets: [] });
    for (let i = 0; i < 10 && (g.decision.kind !== 'priority' || g.state.stack.length); i++) {
      if (g.decision.kind === 'priority') g.pass();
      else g.do(g.legal()[0]!);
    }
    expect(g.state.players.p1.graveyard).toContain(card);
    expect(g.state.players.p1.hand.map((id) => g.obj(id).defId)).toEqual(['forest']);
  });
});
