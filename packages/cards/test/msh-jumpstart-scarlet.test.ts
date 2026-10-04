import { describe, expect, it } from 'vitest';
import { cardDb, slug } from '../src/index.ts';
import { all, cast, game, handSize, n, pt, settle } from './blb-helpers.ts';

// Marvel Super Heroes Jumpstart: the Scarlet packet (docs/marvel-jumpstart.md).

const PACKET = [
  'Stark Industries Executive',
  'Loki Laufeyson',
  'Speed, Young Avenger',
  'Molten Lavamancer',
  'Wiccan, Young Avenger',
  'The Vision and Scarlet Witch',
  'Kree Sentinel',
  'Lightning Bolt',
  'Vision of Love',
  'Grapeshot',
  'Hex Magic',
  "Wanda's Vision",
  'Thriving Bluff',
  'Mountain',
];

const WICCAN = slug('Wiccan, Young Avenger');
const VSW = slug('The Vision and Scarlet Witch');
const GRAPESHOT = slug('Grapeshot');
const HEX = slug('Hex Magic');
const WANDA = slug("Wanda's Vision");

type G = ReturnType<typeof game>;

/** Passes priority until the stack and pending triggers are empty (bounded). */
function resolveAll(g: G): G {
  for (let i = 0; i < 60; i++) {
    const d = g.decision;
    if (d.kind === 'priority') {
      if (!g.state.stack.length && !g.state.pendingTriggers.length) return g;
      g.pass();
      continue;
    }
    if (d.kind === 'castFree') return g;
    const legal = g.legal();
    g.do(legal.find((a) => a.type === 'chooseTargets' && a.targets.length > 0) ?? legal[0]!);
  }
  throw new Error('Did not settle');
}

describe('Scarlet packet', () => {
  it('has every card implemented', () => {
    expect(PACKET.filter((name) => !cardDb.has(slug(name)))).toEqual([]);
  });
});

describe('Wiccan, Young Avenger', () => {
  it('exiles the top card on a noncreature spell; it stays playable until your end step', () => {
    const g = game({
      p1: {
        hand: ['lightning-bolt'],
        battlefield: [WICCAN, 'mountain'],
        library: ['mountain', 'island'],
      },
    });
    resolveAll(cast(g, 'lightning-bolt', [{ player: 'p2' }]));
    expect(g.life('p2')).toBe(17);
    const top = g.state.players.p1.exile[0]!;
    expect(g.obj(top).defId).toBe('mountain');
    expect(g.obj(top).playableUntilTurn).toBe(g.state.turn.number);
    expect(g.legal().some((a) => a.type === 'playLand' && a.card === top)).toBe(true);
  });

  it('the card stops being playable as your end step begins', () => {
    const g = game({
      p1: {
        hand: ['lightning-bolt'],
        battlefield: [WICCAN, 'mountain', 'mountain'],
        library: ['lightning-bolt', 'island'],
      },
    });
    resolveAll(cast(g, 'lightning-bolt', [{ player: 'p2' }]));
    const top = g.state.players.p1.exile[0]!;
    const castable = () => g.legal().some((a) => a.type === 'castSpell' && a.card === top);
    expect(castable()).toBe(true);
    g.passUntilStep('end');
    expect(g.state.turn.step).toBe('end');
    expect(castable()).toBe(false);
  });

  it("doesn't trigger on creature spells", () => {
    const g = game({
      p1: {
        hand: [WICCAN],
        battlefield: [WICCAN, ...n('mountain', 4)],
        library: ['mountain'],
      },
    });
    resolveAll(cast(g, WICCAN));
    expect(g.state.players.p1.exile).toHaveLength(0);
  });

  it("on an opponent's turn, the card stays playable until your next turn", () => {
    const g = game({
      active: 'p2',
      p1: { hand: ['lightning-bolt'], battlefield: [WICCAN, 'mountain'], library: ['mountain'] },
    });
    g.pass();
    resolveAll(cast(g, 'lightning-bolt', [{ player: 'p2' }]));
    const top = g.state.players.p1.exile[0]!;
    expect(g.obj(top).playableUntilTurn).toBe(g.state.turn.number + 1);
  });
});

describe('The Vision and Scarlet Witch', () => {
  it('adds {R} and gets a +1/+1 counter whenever you cast a spell', () => {
    const g = game({
      p1: { hand: ['lightning-bolt', 'lightning-bolt'], battlefield: [VSW, 'mountain'] },
    });
    const vsw = g.id('p1', VSW);
    resolveAll(cast(g, 'lightning-bolt', [{ player: 'p2' }]));
    expect(pt(g, vsw)).toEqual([4, 4]);
    // The {R} it added pays for the second Bolt.
    resolveAll(cast(g, 'lightning-bolt', [{ player: 'p2' }]));
    expect(g.life('p2')).toBe(14);
    expect(pt(g, vsw)).toEqual([5, 5]);
  });
});

describe('Grapeshot', () => {
  it('deals 1 damage, copied once for each spell cast before it this turn', () => {
    const g = game({
      p1: {
        hand: ['lightning-bolt', 'lightning-bolt', GRAPESHOT],
        battlefield: n('mountain', 4),
      },
    });
    resolveAll(cast(g, 'lightning-bolt', [{ player: 'p2' }]));
    resolveAll(cast(g, 'lightning-bolt', [{ player: 'p2' }]));
    expect(g.life('p2')).toBe(14);
    resolveAll(cast(g, GRAPESHOT, [{ player: 'p2' }]));
    expect(g.life('p2')).toBe(11);
  });

  it('with no earlier spells, deals just 1 damage', () => {
    const g = game({
      p1: { hand: [GRAPESHOT], battlefield: n('mountain', 2) },
      p2: { battlefield: ['rumbling-baloth'] },
    });
    const baloth = g.id('p2', 'rumbling-baloth');
    resolveAll(cast(g, GRAPESHOT, [g.ref(baloth)]));
    expect(g.obj(baloth).damage).toBe(1);
  });

  it('may choose a new target for each copy', () => {
    const g = game({
      p1: {
        hand: ['lightning-bolt', 'lightning-bolt', GRAPESHOT],
        battlefield: n('mountain', 4),
      },
      p2: { battlefield: ['bear-cub', 'rumbling-baloth'] },
    });
    const bear = g.id('p2', 'bear-cub');
    const baloth = g.id('p2', 'rumbling-baloth');
    resolveAll(cast(g, 'lightning-bolt', [{ player: 'p2' }]));
    resolveAll(cast(g, 'lightning-bolt', [{ player: 'p2' }]));
    cast(g, GRAPESHOT, [{ player: 'p2' }]);
    // Two copies, each with its own choice: one at the Bear Cub, one at the Baloth.
    const picks = ["Bear Cub (opponent's)", "Rumbling Baloth (opponent's)"];
    for (let i = 0; i < 10 && g.state.stack.length; i++) {
      const d = g.decision;
      if (d.kind === 'chooseOption') {
        const index = d.options.findIndex((o) => o.label === picks[0]);
        expect(index).toBeGreaterThan(0);
        picks.shift();
        g.do({ type: 'chooseOption', player: 'p1', index });
      } else if (d.kind === 'priority') g.pass();
      else g.do(g.legal()[0]!);
    }
    expect(picks).toEqual([]);
    expect(g.life('p2')).toBe(13);
    expect(g.obj(bear).damage).toBe(1);
    expect(g.obj(baloth).damage).toBe(1);
  });
});

describe('Hex Magic', () => {
  it('exiles your hand, draws that many, and the exiled cards are playable until your next turn ends', () => {
    const g = game({
      p1: {
        hand: [HEX, 'mountain', 'lightning-bolt'],
        battlefield: n('mountain', 3),
        library: ['island', 'island', 'island'],
      },
    });
    resolveAll(cast(g, HEX));
    expect(handSize(g, 'p1')).toBe(2);
    const exiled = g.state.players.p1.exile;
    expect(exiled.map((id) => g.obj(id).defId).sort()).toEqual(['lightning-bolt', 'mountain']);
    expect(g.obj(exiled[0]!).playableUntilTurn).toBe(g.state.turn.number + 2);
    const land = exiled.find((id) => g.obj(id).defId === 'mountain')!;
    expect(g.legal().some((a) => a.type === 'playLand' && a.card === land)).toBe(true);
  });
});

describe("Wanda's Vision", () => {
  it('on your second spell, exiles until a nonland card and lets you cast it free', () => {
    const g = game({
      p1: {
        hand: ['lightning-bolt', 'lightning-bolt'],
        battlefield: [WANDA, ...n('mountain', 2)],
        library: ['island', 'lightning-bolt', 'mountain'],
      },
    });
    resolveAll(cast(g, 'lightning-bolt', [{ player: 'p2' }]));
    expect(g.state.players.p1.exile).toHaveLength(0);
    cast(g, 'lightning-bolt', [{ player: 'p2' }]);
    for (let i = 0; i < 30 && g.decision.kind !== 'castFree'; i++) settle(g.pass());
    expect(g.decision.kind).toBe('castFree');
    const free = g
      .legal()
      .find(
        (a) => a.type === 'castSpell' && a.targets.some((t) => 'player' in t && t.player === 'p2'),
      )!;
    g.do(free);
    resolveAll(g);
    expect(g.life('p2')).toBe(11);
    // The Island it passed stays in exile; the Mountain is still on top.
    expect(g.state.players.p1.exile.map((id) => g.obj(id).defId)).toEqual(['island']);
    expect(g.obj(g.state.players.p1.library[0]!).defId).toBe('mountain');
  });

  it("doesn't trigger on an opponent's second spell", () => {
    const g = game({
      active: 'p2',
      p1: { battlefield: [WANDA], library: ['lightning-bolt'] },
      p2: { hand: ['lightning-bolt', 'lightning-bolt'], battlefield: n('mountain', 2) },
    });
    resolveAll(cast(g, 'lightning-bolt', [{ player: 'p1' }]));
    resolveAll(cast(g, 'lightning-bolt', [{ player: 'p1' }]));
    expect(g.life('p1')).toBe(14);
    expect(g.state.players.p1.exile).toHaveLength(0);
    expect(all(g, WANDA)).toHaveLength(1);
  });
});
