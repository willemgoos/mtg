import { getCharacteristics } from '@mtg/engine';
import { describe, expect, it } from 'vitest';
import { cardDb, slug } from '../src/index.ts';
import { all, cast, game, handSize, n, pt, settle } from './blb-helpers.ts';

// Marvel Super Heroes Jumpstart: the Incredible packet (docs/marvel-jumpstart.md).

const INCREDIBLE = [
  'Brawn, Amadeus Cho',
  'Guerrilla Gorilla',
  'She-Hulk, Attorney-at-Law',
  'Hulk, Strongest There Is',
  'Abomination, Terrifying Titan',
  'Doc Samson, Super Psychiatrist',
  'Savage Land Dinosaur',
  'Giant Growth',
  "Hulk's Thunderclap",
  'Origin of the Hulk',
  'Go Nuts!',
  'Super Strength',
  'Thriving Grove',
  'Forest',
];

const BRAWN = slug('Brawn, Amadeus Cho');
const HULK = slug('Hulk, Strongest There Is');
const CLAP = slug("Hulk's Thunderclap");
const ORIGIN = slug('Origin of the Hulk');
const STRENGTH = slug('Super Strength');

type G = ReturnType<typeof game>;

const target = (g: G, id: string) => ({ object: { id, zcc: g.obj(id).zcc } });
const keywords = (g: G, id: string) => [...getCharacteristics(g.state, cardDb, id).keywords];

/** Passes priority until the stack and pending triggers are empty, picking targets when asked. */
function resolveAll(g: G): G {
  for (let i = 0; i < 60; i++) {
    const d = g.decision;
    if (d.kind === 'priority') {
      if (!g.state.stack.length && !g.state.pendingTriggers.length) return g;
      g.pass();
      continue;
    }
    const legal = g.legal();
    g.do(legal.find((a) => a.type === 'chooseTargets' && a.targets.length > 0) ?? legal[0]!);
  }
  throw new Error('Did not settle');
}

/** Moves on from the upkeep to the precombat main phase. */
const toMain = (g: G) => {
  for (let i = 0; i < 10 && g.state.turn.step !== 'main1'; i++) g.pass();
  return g;
};

describe('Incredible packet', () => {
  it('has every card implemented', () => {
    expect(INCREDIBLE.filter((name) => !cardDb.has(slug(name)))).toEqual([]);
  });
});

describe('Brawn, Amadeus Cho', () => {
  it('draws a card when he enters', () => {
    const g = game({ p1: { hand: [BRAWN], battlefield: n('forest', 2), library: n('forest', 3) } });
    resolveAll(cast(g, BRAWN));
    expect(all(g, BRAWN)).toHaveLength(1);
    expect(handSize(g, 'p1')).toBe(1);
  });

  it('power-up puts a +1/+1 counter on him for each card in hand, once only', () => {
    const g = game({
      p1: { hand: n('forest', 3), battlefield: [BRAWN, ...n('forest', 10)] },
    });
    const brawn = g.id('p1', BRAWN);
    g.obj(brawn).zoneTurn = 0;
    settle(
      g.do({ type: 'activateAbility', player: 'p1', source: brawn, abilityIndex: 1, targets: [] }),
    );
    expect(g.obj(brawn).plusOneCounters).toBe(3);
    expect(pt(g, brawn)).toEqual([4, 4]);
    expect(g.legal().some((a) => a.type === 'activateAbility' && a.source === brawn)).toBe(false);
  });
});

describe('Hulk, Strongest There Is', () => {
  it('has trample and enters with a +1/+1 counter', () => {
    expect(cardDb.get(HULK)!.keywords).toContain('trample');
    const g = game({ p1: { hand: [HULK], battlefield: n('forest', 4) } });
    resolveAll(cast(g, HULK));
    const hulk = g.id('p1', HULK);
    expect(g.obj(hulk).plusOneCounters).toBe(1);
    expect(pt(g, hulk)).toEqual([4, 4]);
  });

  it('doubles the +1/+1 counters on each Gamma creature you control at your upkeep', () => {
    const g = game({
      step: 'untap',
      turn: 4,
      p1: { battlefield: [HULK, 'bear-cub'], library: n('forest', 3) },
      p2: { battlefield: [HULK] },
    });
    const hulk = g.id('p1', HULK);
    const bear = g.id('p1', 'bear-cub');
    const theirs = g.id('p2', HULK);
    g.obj(hulk).plusOneCounters = 3;
    g.obj(bear).plusOneCounters = 1;
    g.obj(theirs).plusOneCounters = 2;
    resolveAll(toMain(g));
    expect(g.obj(hulk).plusOneCounters).toBe(6);
    expect(g.obj(bear).plusOneCounters).toBe(1);
    expect(g.obj(theirs).plusOneCounters).toBe(2);
  });
});

describe("Hulk's Thunderclap", () => {
  it('your creature deals damage equal to its power to another creature', () => {
    const g = game({
      p1: { hand: [CLAP], battlefield: ['bear-cub', ...n('forest', 2)] },
      p2: { battlefield: ['bear-cub', ORIGIN] },
    });
    const mine = g.id('p1', 'bear-cub');
    const theirs = g.id('p2', 'bear-cub');
    // No Gamma creature to behold: only the plain spell.
    expect(
      g
        .legal()
        .some((a) => a.type === 'castSpell' && a.card === g.id('p1', CLAP, 'hand') && a.kicked),
    ).toBe(false);
    resolveAll(cast(g, CLAP, [target(g, mine), target(g, theirs)]));
    expect(all(g, 'bear-cub')).toEqual([mine]);
    expect(all(g, ORIGIN)).toHaveLength(1);
  });

  it('beholding a Gamma creature also destroys a noncreature artifact or enchantment', () => {
    const g = game({
      p1: { hand: [CLAP, HULK], battlefield: ['bear-cub', ...n('forest', 2)] },
      p2: { battlefield: ['bear-cub', ORIGIN] },
    });
    const mine = g.id('p1', 'bear-cub');
    const theirs = g.id('p2', 'bear-cub');
    const saga = g.id('p2', ORIGIN);
    // Hulk in hand can be beheld.
    expect(
      g
        .legal()
        .some((a) => a.type === 'castSpell' && a.card === g.id('p1', CLAP, 'hand') && a.kicked),
    ).toBe(true);
    // The player picks which card to behold (Hulk in hand), and it is revealed.
    const hulk = g.id('p1', HULK, 'hand');
    resolveAll(
      cast(g, CLAP, [target(g, mine), target(g, theirs), target(g, saga)], {
        kicked: true,
        beholdCard: hulk,
      }),
    );
    expect(all(g, 'bear-cub')).toEqual([mine]);
    expect(all(g, ORIGIN)).toHaveLength(0);
    // Hulk was only revealed.
    expect(g.state.players.p1.hand).toHaveLength(1);
    expect(g.events.filter((e) => e.type === 'cardsRevealed')).toEqual([
      { type: 'cardsRevealed', player: 'p1', cards: [{ id: hulk, defId: HULK }] },
    ]);
  });
});

describe('Origin of the Hulk', () => {
  it('chapter I makes a 1/1 green and white Citizen', () => {
    const g = game({ p1: { hand: [ORIGIN], battlefield: n('forest', 3) } });
    resolveAll(cast(g, ORIGIN));
    const [citizen] = all(g, 'citizen-gw-token');
    expect(citizen).toBeDefined();
    expect(pt(g, citizen!)).toEqual([1, 1]);
    expect(cardDb.get(g.obj(citizen!).defId)!.colors).toEqual(['G', 'W']);
  });

  it('chapter II puts two +1/+1 counters on a creature you control', () => {
    const g = game({
      step: 'upkeep',
      p1: { battlefield: [ORIGIN, 'bear-cub'], library: n('forest', 3) },
    });
    g.obj(g.id('p1', ORIGIN)).counters = { lore: 1 };
    resolveAll(toMain(g));
    expect(g.obj(g.id('p1', 'bear-cub')).plusOneCounters).toBe(2);
  });

  it('chapter III gives a creature you control +3/+3 and trample, then the Saga goes', () => {
    const g = game({
      step: 'upkeep',
      p1: { battlefield: [ORIGIN, 'bear-cub'], library: n('forest', 3) },
    });
    g.obj(g.id('p1', ORIGIN)).counters = { lore: 2 };
    resolveAll(toMain(g));
    const bear = g.id('p1', 'bear-cub');
    expect(pt(g, bear)).toEqual([5, 5]);
    expect(keywords(g, bear)).toContain('trample');
    expect(all(g, ORIGIN)).toHaveLength(0);
  });
});

describe('Super Strength', () => {
  it('gives the enchanted creature +4/+4, trample and ward {1}', () => {
    const g = game({ p1: { hand: [STRENGTH], battlefield: ['bear-cub', ...n('forest', 5)] } });
    const bear = g.id('p1', 'bear-cub');
    resolveAll(cast(g, STRENGTH, [target(g, bear)]));
    expect(pt(g, bear)).toEqual([6, 6]);
    expect(keywords(g, bear)).toEqual(expect.arrayContaining(['trample', 'wardOne']));
  });
});
