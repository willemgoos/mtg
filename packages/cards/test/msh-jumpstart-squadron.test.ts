import { getCharacteristics } from '@mtg/engine';
import { describe, expect, it } from 'vitest';
import { cardDb, slug } from '../src/index.ts';
import { all, cast, game, handSize, n, pt, settle } from './blb-helpers.ts';

// Marvel Super Heroes Jumpstart: the Squadron packet (docs/marvel-jumpstart.md).

const PACKET = [
  'Agent of Atlas',
  'Brave Brawler',
  'Nighthawk, Dark Defender',
  'Hero in Training',
  'Zarda, the Power Princess',
  'Doctor Spectrum',
  'Borough Backup',
  'Hyperion, Supreme Hero',
  "Hyperion's Atomic Vision",
  'Heroic Teamwork',
  'Web Up',
  'Blur of Heroism',
  'Thriving Heath',
  'Plains',
];

const AGENT = slug('Agent of Atlas'); // a 2/2 Hero
const NIGHTHAWK = slug('Nighthawk, Dark Defender');
const ZARDA = slug('Zarda, the Power Princess');
const SPECTRUM = slug('Doctor Spectrum');
const HYPERION = slug('Hyperion, Supreme Hero');
const VISION = slug("Hyperion's Atomic Vision");
const BLUR = slug('Blur of Heroism');

type G = ReturnType<typeof game>;

const keywords = (g: G, id: string) => new Set(getCharacteristics(g.state, cardDb, id).keywords);

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

describe('Squadron packet', () => {
  it('has every card implemented', () => {
    expect(PACKET.filter((name) => !cardDb.has(slug(name)))).toEqual([]);
  });
});

describe('Nighthawk, Dark Defender', () => {
  it('pumps a creature when it or another Hero enters, not for a non-Hero', () => {
    const g = game({
      p1: {
        hand: [NIGHTHAWK, AGENT, 'bear-cub'],
        battlefield: ['bear-cub', ...n('plains', 4), ...n('forest', 2)],
      },
    });
    const bear = g.id('p1', 'bear-cub');
    resolve(cast(g, NIGHTHAWK));
    expect(keywords(g, g.id('p1', NIGHTHAWK)).has('flying')).toBe(true);
    expect(pt(g, bear)).toEqual([3, 3]);
    resolve(cast(g, AGENT));
    expect(pt(g, bear)).toEqual([4, 4]);
    resolve(cast(g, 'bear-cub'));
    expect(pt(g, bear)).toEqual([4, 4]);
  });
});

describe('Zarda, the Power Princess', () => {
  it('gives a lone attacker +1/+1 for each other Hero (each has exalted)', () => {
    const g = game({
      step: 'beginCombat',
      p1: { battlefield: [ZARDA, AGENT, AGENT, 'bear-cub'] },
    });
    const bear = g.id('p1', 'bear-cub');
    g.passBoth().attack(bear);
    resolve(g);
    expect(pt(g, bear)).toEqual([4, 4]);
  });

  it('counts the attacking Hero itself but not Zarda', () => {
    const g = game({ step: 'beginCombat', p1: { battlefield: [ZARDA, AGENT] } });
    const agent = g.id('p1', AGENT);
    g.passBoth().attack(agent);
    resolve(g);
    expect(pt(g, agent)).toEqual([3, 3]);
  });

  it('does nothing when two creatures attack', () => {
    const g = game({ step: 'beginCombat', p1: { battlefield: [ZARDA, AGENT, 'bear-cub'] } });
    const bear = g.id('p1', 'bear-cub');
    g.passBoth().attack(bear, g.id('p1', AGENT));
    resolve(g);
    expect(pt(g, bear)).toEqual([2, 2]);
  });
});

describe('Doctor Spectrum', () => {
  const spectrum = (mode: number) => {
    const g = game({
      p1: { hand: [SPECTRUM], battlefield: [AGENT, 'bear-cub', ...n('plains', 5)] },
      p2: { battlefield: [BLUR] },
    });
    cast(g, SPECTRUM);
    settle(g, (legal) => legal.find((a) => a.type === 'chooseTargets' && a.mode === mode));
    return resolve(g);
  };

  it('can make a 0/4 colorless Wall with defender', () => {
    const g = spectrum(0);
    const [wall] = all(g, 'wall-colorless-token');
    expect(wall).toBeDefined();
    expect(pt(g, wall!)).toEqual([0, 4]);
    expect(keywords(g, wall!).has('defender')).toBe(true);
    expect(cardDb.get(g.obj(wall!).defId)!.colors).toEqual([]);
  });

  it('can put a +1/+1 counter on each other Hero you control', () => {
    const g = spectrum(1);
    expect(g.obj(g.id('p1', AGENT)).plusOneCounters).toBe(1);
    expect(g.obj(g.id('p1', SPECTRUM)).plusOneCounters ?? 0).toBe(0);
    expect(g.obj(g.id('p1', 'bear-cub')).plusOneCounters ?? 0).toBe(0);
  });

  it('can destroy an enchantment', () => {
    const g = spectrum(2);
    expect(all(g, BLUR)).toHaveLength(0);
  });
});

describe('Hyperion, Supreme Hero', () => {
  it('has flash and flying', () => {
    const g = game({ p1: { battlefield: [HYPERION] } });
    const k = keywords(g, g.id('p1', HYPERION));
    expect(k.has('flash')).toBe(true);
    expect(k.has('flying')).toBe(true);
  });

  it('prevents all but 1 of damage to you and your Heroes, not to other creatures', () => {
    const g = game({
      p1: {
        hand: ['shock', 'shock', 'shock'],
        battlefield: [HYPERION, AGENT, 'bear-cub', ...n('mountain', 3)],
      },
    });
    const agent = g.id('p1', AGENT);
    resolve(cast(g, 'shock', [g.ref(agent)]));
    expect(g.obj(agent).damage).toBe(1);
    resolve(cast(g, 'shock', [{ player: 'p1' }]));
    expect(g.life('p1')).toBe(19);
    resolve(cast(g, 'shock', [g.ref(g.id('p1', 'bear-cub'))]));
    expect(all(g, 'bear-cub')).toHaveLength(0);
  });

  it('caps combat damage to you at 1', () => {
    const g = game({
      active: 'p2',
      step: 'beginCombat',
      p1: { battlefield: [HYPERION] },
      p2: { battlefield: ['serra-angel'] },
    });
    g.passBoth().attack(g.id('p2', 'serra-angel'));
    g.passUntilStep('end');
    expect(g.life('p1')).toBe(19);
  });
});

describe("Hyperion's Atomic Vision", () => {
  it('destroys a tapped creature, and only a tapped one', () => {
    const g = game({
      p1: { hand: [VISION], battlefield: n('plains', 2) },
      p2: { battlefield: ['bear-cub', 'serra-angel'] },
    });
    const bear = g.id('p2', 'bear-cub');
    const angel = g.id('p2', 'serra-angel');
    g.obj(bear).tapped = true;
    const card = g.id('p1', VISION, 'hand');
    const targeted = (id: string) =>
      g
        .legal()
        .some(
          (a) =>
            a.type === 'castSpell' &&
            a.card === card &&
            a.targets.some((t) => 'object' in t && t.object.id === id),
        );
    expect(targeted(angel)).toBe(false);
    expect(targeted(bear)).toBe(true);
    // No Hero to behold.
    expect(g.legal().some((a) => a.type === 'castSpell' && a.card === card && a.kicked)).toBe(
      false,
    );
    resolve(cast(g, VISION, [g.ref(bear)]));
    expect(all(g, 'bear-cub')).toHaveLength(0);
  });

  it('scries 2 if a Hero was beheld', () => {
    const g = game({
      p1: { hand: [VISION, AGENT], battlefield: n('plains', 2), library: n('plains', 3) },
      p2: { battlefield: ['bear-cub'] },
    });
    const bear = g.id('p2', 'bear-cub');
    g.obj(bear).tapped = true;
    cast(g, VISION, [g.ref(bear)], { kicked: true, beholdCard: g.id('p1', AGENT, 'hand') });
    settle(g);
    expect(g.decision.kind).toBe('scry');
    resolve(g);
    expect(all(g, 'bear-cub')).toHaveLength(0);
    // The Hero was only revealed.
    expect(handSize(g, 'p1')).toBe(1);
  });
});

describe('Blur of Heroism', () => {
  it('draws a card and lets you cast Heroes, not other creatures, as though they had flash', () => {
    const g = game({
      p1: {
        hand: [BLUR, AGENT, 'bear-cub'],
        battlefield: n('plains', 7),
        library: n('plains', 2),
      },
    });
    resolve(cast(g, BLUR));
    expect(handSize(g, 'p1')).toBe(3);
    g.passUntilStep('beginCombat');
    const castable = (defId: string) =>
      g.legal().some((a) => a.type === 'castSpell' && a.card === g.id('p1', defId, 'hand'));
    expect(castable(AGENT)).toBe(true);
    expect(castable('bear-cub')).toBe(false);
  });
});
