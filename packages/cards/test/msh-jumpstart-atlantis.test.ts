import { getCharacteristics } from '@mtg/engine';
import { describe, expect, it } from 'vitest';
import { cardDb, slug } from '../src/index.ts';
import { all, cast, game, handSize, n, pt, settle } from './blb-helpers.ts';

// Marvel Super Heroes Jumpstart: the Atlantis packet (docs/marvel-jumpstart.md).

const PACKET = [
  'Mist-Cloaked Herald',
  'Daughter of the Deep',
  'Atlantean Skirmisher',
  'Atlantean Cavalry',
  'Namora, the Sea Queen',
  'Attuma, Atlantean Warlord',
  'Shipwreck Patrol',
  'Namor, Scourge of the Seas',
  'Quantum Reduction',
  'Unstable Experiment',
  'Frozen in Ice',
  'Atlantis Attacks',
  'Thriving Isle',
  'Island',
];

const HERALD = slug('Mist-Cloaked Herald');
const DAUGHTER = slug('Daughter of the Deep');
const SKIRMISHER = slug('Atlantean Skirmisher');
const PATROL = slug('Shipwreck Patrol');
const NAMOR = slug('Namor, Scourge of the Seas');
const EXPERIMENT = slug('Unstable Experiment');

type G = ReturnType<typeof game>;

const keywords = (g: G, id: string) => new Set(getCharacteristics(g.state, cardDb, id).keywords);

/** Resolves the stack, answering discard decisions with `card` when offered. */
const resolve = (g: G, card?: string) => {
  for (let i = 0; i < 40; i++) {
    settle(g);
    const d = g.decision;
    if (d.kind === 'priority' || d.kind === 'declareAttackers' || d.kind === 'declareBlockers')
      return g;
    const legal = g.legal();
    g.do((card !== undefined && legal.find((a) => Object.values(a).includes(card))) || legal[0]!);
  }
  return g;
};

const graveyard = (g: G, p: 'p1' | 'p2') =>
  g.state.players[p].graveyard.map((id) => g.obj(id).defId);

describe('Atlantis packet', () => {
  it('has every card implemented', () => {
    expect(PACKET.filter((name) => !cardDb.has(slug(name)))).toEqual([]);
  });
});

describe('Mist-Cloaked Herald', () => {
  it("can't be blocked", () => {
    const g = game({
      step: 'beginCombat',
      p1: { battlefield: [HERALD] },
      p2: { battlefield: ['bear-cub'] },
    });
    g.passBoth().attack(g.id('p1', HERALD));
    settle(g).passBoth();
    expect(g.decision.kind).not.toBe('declareBlockers');
    g.passUntilStep('main2');
    expect(g.life('p2')).toBe(19);
  });
});

describe('Daughter of the Deep', () => {
  it('makes a Merfolk token when you draw your second card each turn', () => {
    const g = game({
      p1: {
        hand: [EXPERIMENT],
        battlefield: [DAUGHTER, ...n('island', 2)],
        library: n('island', 4),
      },
    });
    // Unstable Experiment with nothing conniving: only one card drawn.
    resolve(cast(g, EXPERIMENT, [{ player: 'p1' }]));
    expect(handSize(g, 'p1')).toBe(1);
    expect(all(g, 'merfolk-token')).toHaveLength(0);
  });

  it('makes a token on the second draw (draw, then connive)', () => {
    const g = game({
      p1: {
        hand: [EXPERIMENT, 'bear-cub'],
        battlefield: [DAUGHTER, ...n('island', 2)],
        library: n('island', 4),
      },
    });
    const daughter = g.id('p1', DAUGHTER);
    resolve(
      cast(g, EXPERIMENT, [{ player: 'p1' }, g.ref(daughter)]),
      g.id('p1', 'bear-cub', 'hand'),
    );
    expect(all(g, 'merfolk-token')).toHaveLength(1);
    expect(g.obj(daughter).plusOneCounters).toBe(1);
  });

  it("{U}, {T}: target Merfolk can't be blocked this turn", () => {
    const g = game({
      p1: { battlefield: [DAUGHTER, SKIRMISHER, 'island'], library: n('island', 3) },
      p2: { battlefield: ['bear-cub'] },
    });
    const skirm = g.id('p1', SKIRMISHER);
    g.do({
      type: 'activateAbility',
      player: 'p1',
      source: g.id('p1', DAUGHTER),
      abilityIndex: 1,
      targets: [g.ref(skirm)],
    });
    settle(g);
    g.passUntilStep('beginCombat').passBoth().attack(skirm);
    resolve(g);
    g.passBoth();
    expect(g.decision.kind).not.toBe('declareBlockers');
  });
});

describe('Atlantean Skirmisher', () => {
  it('connives when it attacks', () => {
    const g = game({
      p1: { hand: ['bear-cub'], battlefield: [SKIRMISHER], library: ['island'] },
    });
    const skirm = g.id('p1', SKIRMISHER);
    g.passUntilStep('beginCombat').passBoth().attack(skirm);
    resolve(g, g.id('p1', 'bear-cub', 'hand'));
    expect(graveyard(g, 'p1')).toEqual(['bear-cub']);
    expect(pt(g, skirm)).toEqual([2, 3]);
  });
});

describe('Shipwreck Patrol', () => {
  it('taps an opposing creature and stuns it', () => {
    const g = game({
      p1: { hand: [PATROL], battlefield: n('island', 4) },
      p2: { battlefield: ['bear-cub'] },
    });
    const bear = g.id('p2', 'bear-cub');
    settle(cast(g, PATROL));
    expect(g.obj(bear).tapped).toBe(true);
    expect(g.obj(bear).counters?.stun).toBe(1);
    g.passUntilStep('upkeep');
    expect(g.obj(bear).tapped).toBe(true);
    expect(g.obj(bear).counters?.stun).toBe(0);
  });
});

describe('Namor, Scourge of the Seas', () => {
  it('gives other Merfolk with a +1/+1 counter flying', () => {
    const g = game({
      p1: { battlefield: [NAMOR, HERALD, 'merfolk-token', 'bear-cub'] },
    });
    const herald = g.id('p1', HERALD);
    const token = g.id('p1', 'merfolk-token');
    const bear = g.id('p1', 'bear-cub');
    g.obj(herald).plusOneCounters = 1;
    g.obj(bear).plusOneCounters = 1;
    expect(keywords(g, herald).has('flying')).toBe(true);
    expect(keywords(g, token).has('flying')).toBe(false);
    expect(keywords(g, bear).has('flying')).toBe(false);
    expect(keywords(g, g.id('p1', NAMOR)).has('flying')).toBe(true);
  });

  it('makes a creature you control connive at the beginning of combat', () => {
    const g = game({
      p1: { hand: ['bear-cub'], battlefield: [NAMOR, HERALD], library: ['island'] },
    });
    const herald = g.id('p1', HERALD);
    for (let i = 0; i < 10 && g.decision.kind === 'priority'; i++) g.pass();
    expect(g.decision.kind).toBe('chooseTriggerTargets');
    g.do({ type: 'chooseTargets', player: 'p1', targets: [g.ref(herald)] });
    resolve(g, g.id('p1', 'bear-cub', 'hand'));
    expect(graveyard(g, 'p1')).toEqual(['bear-cub']);
    expect(g.obj(herald).plusOneCounters).toBe(1);
    // The Herald is a Merfolk with a counter now, so Namor gives it flying.
    expect(keywords(g, herald).has('flying')).toBe(true);
  });
});

describe('Unstable Experiment', () => {
  it('target player draws, then up to one creature you control connives', () => {
    const g = game({
      p1: {
        hand: [EXPERIMENT, 'bear-cub'],
        battlefield: [HERALD, ...n('island', 2)],
        library: ['island'],
      },
      p2: { library: ['forest'] },
    });
    const herald = g.id('p1', HERALD);
    const p2Hand = handSize(g, 'p2');
    resolve(cast(g, EXPERIMENT, [{ player: 'p2' }, g.ref(herald)]), g.id('p1', 'bear-cub', 'hand'));
    expect(handSize(g, 'p2')).toBe(p2Hand + 1);
    expect(graveyard(g, 'p1')).toContain('bear-cub');
    expect(pt(g, herald)).toEqual([2, 2]);
  });
});
