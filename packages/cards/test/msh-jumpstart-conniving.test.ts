import { getCharacteristics } from '@mtg/engine';
import { describe, expect, it } from 'vitest';
import { cardDb, slug } from '../src/index.ts';
import { all, cast, game, handSize, n, pt, settle } from './blb-helpers.ts';

// Marvel Super Heroes Jumpstart: the Conniving packet (docs/marvel-jumpstart.md).

const PACKET = [
  'Kid Loki',
  'Mob Lookout',
  'Flying Octobot',
  'Graviton, Fundamental Force',
  "Doc Ock's Henchmen",
  'Tiger Shark, Abyssal Hunter',
  'Leader, Super-Genius',
  'Doc Ock, Sinister Scientist',
  'Unstable Experiment',
  "Mysterio's Mirage",
  "Trickster's Stratagem",
  'Dismissive Denial',
  'Thriving Isle',
  'Villainous Hideout',
  'Island',
];

const LOOKOUT = slug('Mob Lookout');
const OCTOBOT = slug('Flying Octobot');
const GRAVITON = slug('Graviton, Fundamental Force');
const HENCHMEN = slug("Doc Ock's Henchmen");
const DOC_OCK = slug('Doc Ock, Sinister Scientist');
const MIRAGE = slug("Mysterio's Mirage");
const EXPERIMENT = slug('Unstable Experiment');

type G = ReturnType<typeof game>;

const keywords = (g: G, id: string) => new Set(getCharacteristics(g.state, cardDb, id).keywords);

/** Resolves the stack, answering other decisions with `card` when offered, else the first legal action. */
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

describe('Conniving packet', () => {
  it('has every card implemented', () => {
    expect(PACKET.filter((name) => !cardDb.has(slug(name)))).toEqual([]);
  });
});

describe('Mob Lookout', () => {
  it('makes target creature you control connive when it enters', () => {
    const g = game({
      p1: {
        hand: [LOOKOUT, 'think-twice'],
        battlefield: ['bear-cub', ...n('island', 2)],
        library: n('island', 3),
      },
    });
    const bears = g.id('p1', 'bear-cub');
    cast(g, LOOKOUT);
    for (let i = 0; i < 40; i++) {
      const d = g.decision;
      if (d.kind === 'chooseTriggerTargets') {
        g.do(
          g
            .legal()
            .find(
              (a) =>
                a.type === 'chooseTargets' &&
                a.targets.some((t) => 'object' in t && t.object.id === bears),
            )!,
        );
        continue;
      }
      if (d.kind === 'priority' && g.state.stack.length) {
        g.pass();
        continue;
      }
      if (d.kind === 'discard') {
        g.do({ type: 'discard', player: 'p1', card: g.id('p1', 'think-twice', 'hand') });
        continue;
      }
      break;
    }
    expect(graveyard(g, 'p1')).toContain('think-twice');
    expect(g.obj(bears).plusOneCounters).toBe(1);
    expect(pt(g, g.id('p1', LOOKOUT))).toEqual([0, 3]);
  });
});

describe('Flying Octobot', () => {
  it('has flying and grows once each turn when another Villain enters', () => {
    expect(cardDb.get(OCTOBOT)!.keywords).toContain('flying');
    const g = game({
      p1: {
        hand: [HENCHMEN, LOOKOUT],
        battlefield: [OCTOBOT, ...n('island', 6)],
        library: n('island', 4),
      },
    });
    const octobot = g.id('p1', OCTOBOT);
    resolve(cast(g, HENCHMEN));
    expect(g.obj(octobot).plusOneCounters).toBe(1);
    resolve(cast(g, LOOKOUT));
    expect(g.obj(octobot).plusOneCounters).toBe(1);
  });

  it("doesn't grow for a non-Villain", () => {
    const g = game({
      p1: { hand: ['bear-cub'], battlefield: [OCTOBOT, ...n('forest', 2)] },
    });
    resolve(cast(g, 'bear-cub'));
    expect(g.obj(g.id('p1', OCTOBOT)).plusOneCounters).toBe(0);
  });
});

describe('Graviton, Fundamental Force', () => {
  const setup = () =>
    game({
      p1: {
        hand: [EXPERIMENT, 'bear-cub'],
        battlefield: [GRAVITON, ...n('island', 2)],
        library: n('island', 4),
      },
      p2: { battlefield: ['bear-cub'] },
    });

  it('on your second draw, can tap target creature', () => {
    const g = setup();
    const graviton = g.id('p1', GRAVITON);
    const bears = g.id('p2', 'bear-cub');
    cast(g, EXPERIMENT, [{ player: 'p1' }, g.ref(graviton)]);
    let chose = false;
    for (let i = 0; i < 40; i++) {
      const d = g.decision;
      if (d.kind === 'chooseTriggerTargets') {
        const pick = g
          .legal()
          .find(
            (a) =>
              a.type === 'chooseTargets' &&
              a.mode === 1 &&
              a.targets.some((t) => 'object' in t && t.object.id === bears),
          );
        expect(pick).toBeDefined();
        g.do(pick!);
        chose = true;
        continue;
      }
      if (d.kind === 'discard') {
        g.do({ type: 'discard', player: 'p1', card: g.id('p1', 'bear-cub', 'hand') });
        continue;
      }
      if (d.kind === 'priority' && g.state.stack.length) {
        g.pass();
        continue;
      }
      break;
    }
    expect(chose).toBe(true);
    expect(g.obj(bears).tapped).toBe(true);
  });

  it('on your second draw, can give target creature flying', () => {
    const g = setup();
    const graviton = g.id('p1', GRAVITON);
    cast(g, EXPERIMENT, [{ player: 'p1' }, g.ref(graviton)]);
    for (let i = 0; i < 40; i++) {
      const d = g.decision;
      if (d.kind === 'chooseTriggerTargets') {
        g.do(
          g
            .legal()
            .find(
              (a) =>
                a.type === 'chooseTargets' &&
                a.mode === 0 &&
                a.targets.some((t) => 'object' in t && t.object.id === graviton),
            )!,
        );
        continue;
      }
      if (d.kind === 'discard') {
        g.do({ type: 'discard', player: 'p1', card: g.id('p1', 'bear-cub', 'hand') });
        continue;
      }
      if (d.kind === 'priority' && g.state.stack.length) {
        g.pass();
        continue;
      }
      break;
    }
    expect(keywords(g, graviton).has('flying')).toBe(true);
  });

  it("doesn't trigger on the first draw", () => {
    const g = setup();
    resolve(cast(g, EXPERIMENT, [{ player: 'p1' }]));
    expect(handSize(g, 'p1')).toBe(2);
    expect(g.obj(g.id('p2', 'bear-cub')).tapped).toBe(false);
  });
});

describe("Doc Ock's Henchmen", () => {
  it('has flash and connives when it attacks', () => {
    expect(cardDb.get(HENCHMEN)!.keywords).toContain('flash');
    const g = game({
      p1: {
        hand: ['bear-cub'],
        battlefield: [{ card: HENCHMEN, sick: false }],
        library: n('island', 3),
      },
    });
    const henchmen = g.id('p1', HENCHMEN);
    g.passUntilStep('beginCombat').passBoth().attack(henchmen);
    resolve(g, g.id('p1', 'bear-cub', 'hand'));
    expect(graveyard(g, 'p1')).toContain('bear-cub');
    expect(pt(g, henchmen)).toEqual([3, 2]);
  });
});

describe('Doc Ock, Sinister Scientist', () => {
  it('is 4/5 normally and 8/8 with eight or more cards in your graveyard', () => {
    const small = game({ p1: { battlefield: [DOC_OCK], graveyard: n('island', 7) } });
    expect(pt(small, small.id('p1', DOC_OCK))).toEqual([4, 5]);
    const big = game({ p1: { battlefield: [DOC_OCK], graveyard: n('island', 8) } });
    expect(pt(big, big.id('p1', DOC_OCK))).toEqual([8, 8]);
  });

  it('has hexproof while you control another Villain', () => {
    const alone = game({ p1: { battlefield: [DOC_OCK, 'bear-cub'] } });
    expect(keywords(alone, alone.id('p1', DOC_OCK)).has('hexproof')).toBe(false);
    const g = game({ p1: { battlefield: [DOC_OCK, HENCHMEN] } });
    expect(keywords(g, g.id('p1', DOC_OCK)).has('hexproof')).toBe(true);
  });
});

describe("Mysterio's Mirage", () => {
  it('makes a 3/3 Illusion Villain at your end step if you discarded a card this turn', () => {
    const g = game({
      p1: {
        hand: [EXPERIMENT, 'think-twice'],
        battlefield: [MIRAGE, 'bear-cub', ...n('island', 2)],
        library: n('island', 4),
      },
    });
    resolve(
      cast(g, EXPERIMENT, [{ player: 'p1' }, g.ref(g.id('p1', 'bear-cub'))]),
      g.id('p1', 'think-twice', 'hand'),
    );
    expect(graveyard(g, 'p1')).toContain('think-twice');
    g.passUntilStep('main2');
    for (let i = 0; i < 10 && g.decision.kind === 'priority' && !g.state.stack.length; i++)
      g.pass();
    settle(g);
    const tokens = all(g, 'illusion-villain-token');
    expect(tokens).toHaveLength(1);
    expect(pt(g, tokens[0]!)).toEqual([3, 3]);
    const c = getCharacteristics(g.state, cardDb, tokens[0]!);
    expect(c.subtypes).toEqual(['Illusion', 'Villain']);
  });

  it('makes nothing if you discarded nothing', () => {
    const g = game({ p1: { battlefield: [MIRAGE] } });
    g.passUntilStep('main2');
    for (let i = 0; i < 10 && g.decision.kind === 'priority' && !g.state.stack.length; i++)
      g.pass();
    settle(g);
    expect(all(g, 'illusion-villain-token')).toHaveLength(0);
  });
});
