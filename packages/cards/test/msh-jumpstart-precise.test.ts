import { getCharacteristics } from '@mtg/engine';
import { describe, expect, it } from 'vitest';
import { cardDb, slug } from '../src/index.ts';
import { cast, game, n, pt, settle } from './blb-helpers.ts';

// Marvel Super Heroes Jumpstart: the Precise packet (docs/marvel-jumpstart.md).

const PACKET = [
  'Colleen Wing, Street Samurai',
  'Agent of Atlas',
  'Raft Security Officer',
  'Kree Commandos',
  'Hawkeye, Bowslinger',
  'Mockingbird, Ace Agent',
  'Valkyrior Skyrider',
  'Panther Pounce',
  'Stunning Shot',
  'Sudden Strike',
  'Heroic Teamwork',
  'Fall to Earth',
  'Thriving Heath',
  'Plains',
];

const HAWKEYE = slug('Hawkeye, Bowslinger');
const MOCKINGBIRD = slug('Mockingbird, Ace Agent');
const SKYRIDER = slug('Valkyrior Skyrider');
const SHOT = slug('Stunning Shot');
const STRIKE = slug('Sudden Strike');

type G = ReturnType<typeof game>;

/** Resolves the stack, answering any other decision (scry) with its first legal action. */
const resolve = (g: G) => {
  for (let i = 0; i < 40; i++) {
    settle(g);
    const d = g.decision;
    if (d.kind === 'priority' || d.kind === 'declareAttackers' || d.kind === 'declareBlockers')
      return g;
    g.do(g.legal()[0]!);
  }
  return g;
};

const keywords = (g: G, id: string) => new Set(getCharacteristics(g.state, cardDb, id).keywords);

describe('Precise packet', () => {
  it('has every card implemented', () => {
    expect(PACKET.filter((name) => !cardDb.has(slug(name)))).toEqual([]);
  });
});

describe('Hawkeye, Bowslinger', () => {
  it('has reach and vigilance, and grows and scries when you cast a spell targeting any creature', () => {
    const g = game({
      p1: { hand: [SHOT], battlefield: [HAWKEYE, ...n('plains', 2)] },
      p2: { battlefield: ['bear-cub'] },
    });
    const hawk = g.id('p1', HAWKEYE);
    expect(keywords(g, hawk).has('reach')).toBe(true);
    expect(keywords(g, hawk).has('vigilance')).toBe(true);
    // Stun only the opponent's creature: an opposing target still counts.
    resolve(cast(g, SHOT, [g.ref(g.id('p2', 'bear-cub'))], { mode: 1 }));
    expect(g.obj(hawk).plusOneCounters).toBe(1);
    expect(pt(g, hawk)).toEqual([4, 4]);
  });

  it("doesn't trigger on a spell without targets", () => {
    const g = game({
      p1: { hand: [SKYRIDER], battlefield: [HAWKEYE, ...n('plains', 5)] },
    });
    resolve(cast(g, SKYRIDER));
    expect(g.obj(g.id('p1', HAWKEYE)).plusOneCounters ?? 0).toBe(0);
  });
});

describe('Mockingbird, Ace Agent', () => {
  it('grows when you target a creature you control, not an opposing one', () => {
    const g = game({
      p1: { hand: [SHOT, SHOT], battlefield: [MOCKINGBIRD, ...n('plains', 4)] },
      p2: { battlefield: ['bear-cub'] },
    });
    const mock = g.id('p1', MOCKINGBIRD);
    expect(keywords(g, mock).has('doubleStrike')).toBe(true);
    const bear = g.id('p2', 'bear-cub');
    resolve(cast(g, SHOT, [g.ref(bear)], { mode: 1 }));
    expect(g.obj(mock).plusOneCounters ?? 0).toBe(0);
    resolve(cast(g, SHOT, [g.ref(mock)], { mode: 0 }));
    // One from its trigger, two from Stunning Shot.
    expect(g.obj(mock).plusOneCounters).toBe(3);
    expect(pt(g, mock)).toEqual([5, 5]);
  });
});

describe('Valkyrior Skyrider', () => {
  it('flies and gains 4 life when it enters', () => {
    const g = game({ p1: { hand: [SKYRIDER], battlefield: n('plains', 5) } });
    resolve(cast(g, SKYRIDER));
    expect(g.life('p1')).toBe(24);
    expect(keywords(g, g.id('p1', SKYRIDER)).has('flying')).toBe(true);
  });
});

describe('Stunning Shot', () => {
  it('puts two counters on your creature and taps and stuns theirs', () => {
    const g = game({
      p1: { hand: [SHOT], battlefield: ['bear-cub', ...n('plains', 2)] },
      p2: { battlefield: ['bear-cub'] },
    });
    const mine = g.id('p1', 'bear-cub');
    const theirs = g.id('p2', 'bear-cub');
    resolve(cast(g, SHOT, [g.ref(mine), g.ref(theirs)], { mode: 0 }));
    expect(g.obj(mine).plusOneCounters).toBe(2);
    expect(g.obj(theirs).tapped).toBe(true);
    expect(g.obj(theirs).counters?.stun).toBe(1);
    // The stun counter keeps it tapped through its controller's next untap step.
    g.passUntilStep('upkeep');
    expect(g.obj(theirs).tapped).toBe(true);
  });

  it('can stun alone when you have no creature', () => {
    const g = game({
      p1: { hand: [SHOT], battlefield: n('plains', 2) },
      p2: { battlefield: ['bear-cub'] },
    });
    const theirs = g.id('p2', 'bear-cub');
    resolve(cast(g, SHOT, [g.ref(theirs)], { mode: 1 }));
    expect(g.obj(theirs).tapped).toBe(true);
    expect(g.obj(theirs).counters?.stun).toBe(1);
  });
});

describe('Sudden Strike', () => {
  it('destroys an attacking creature, and only an attacking or blocking one', () => {
    const g = game({
      active: 'p2',
      step: 'beginCombat',
      p1: { hand: [STRIKE], battlefield: n('plains', 2) },
      p2: { battlefield: ['bear-cub', 'bear-cub'] },
    });
    const [attacker, other] = g.state.battlefield.filter(
      (id) => g.obj(id).controller === 'p2' && g.obj(id).defId === 'bear-cub',
    ) as [string, string];
    g.passBoth().attack(attacker);
    settle(g);
    for (let i = 0; i < 5 && g.actor !== 'p1'; i++) g.pass();
    expect(g.actor).toBe('p1');
    const casts = g
      .legal('p1')
      .filter((a) => a.type === 'castSpell' && a.card === g.id('p1', STRIKE, 'hand'));
    const targeted = casts.flatMap((a) =>
      a.type === 'castSpell' ? a.targets.map((t) => ('object' in t ? t.object.id : t.player)) : [],
    );
    expect(targeted).toContain(attacker);
    expect(targeted).not.toContain(other);
    resolve(cast(g, STRIKE, [g.ref(attacker)]));
    expect(g.zoneOf(attacker)).toBe('graveyard');
    expect(g.zoneOf(other)).toBe('battlefield');
  });
});
