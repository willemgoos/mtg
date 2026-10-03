import { describe, expect, it } from 'vitest';
import { cardDb, slug } from '../src/index.ts';
import { all, cast, game, handSize, n, pt, settle } from './blb-helpers.ts';

// Marvel Super Heroes Jumpstart: the Thor packet (docs/marvel-jumpstart.md).

const PACKET = [
  "K'un-Lun Warrior",
  'Loki Laufeyson',
  "Sif's Spearmaster",
  'Molten Lavamancer',
  'Crimson Operative',
  "Thor, Asgard's Avenger",
  'Kree Sentinel',
  'Asgardian Inspiration',
  'Lightning Bolt',
  'Lightning Strike',
  'Origin of Thor',
  "Mjölnir's Might",
  'Thriving Bluff',
  'Mountain',
];

const SPEARMASTER = slug("Sif's Spearmaster");
const MIGHT = slug("Mjölnir's Might");

type G = ReturnType<typeof game>;

/** Passes priority until the stack and pending triggers are empty, picking targets when asked. */
function resolveAll(g: G, accept = true): G {
  for (let i = 0; i < 60; i++) {
    const d = g.decision;
    if (d.kind === 'priority') {
      if (!g.state.stack.length && !g.state.pendingTriggers.length) return g;
      g.pass();
      continue;
    }
    if (d.kind === 'optionalEffect') {
      g.do({ type: 'chooseEffect', player: g.actor, accept });
      continue;
    }
    const legal = g.legal();
    g.do(legal.find((a) => a.type === 'chooseTargets' && a.targets.length > 0) ?? legal[0]!);
  }
  throw new Error('Did not settle');
}

/** Moves on from the upkeep to the precombat main phase (the Saga's lore counter). */
const toMain = (g: G) => {
  for (let i = 0; i < 10 && g.state.turn.step !== 'main1'; i++) g.pass();
  return g;
};

describe('Thor packet', () => {
  it('has every card implemented', () => {
    expect(PACKET.filter((name) => !cardDb.has(slug(name)))).toEqual([]);
  });
});

describe("Sif's Spearmaster", () => {
  it('taps to deal damage equal to its power to target opponent', () => {
    const g = game({ p1: { battlefield: [SPEARMASTER] } });
    const sif = g.id('p1', SPEARMASTER);
    g.do({
      type: 'activateAbility',
      player: 'p1',
      source: sif,
      abilityIndex: 0,
      targets: [{ player: 'p2' }],
    });
    settle(g);
    expect(g.life('p2')).toBe(19);
    expect(g.obj(sif).tapped).toBe(true);
  });
});

describe('Lightning Bolt', () => {
  it('deals 3 damage to any target', () => {
    const g = game({
      p1: { hand: ['lightning-bolt', 'lightning-bolt'], battlefield: n('mountain', 2) },
      p2: { battlefield: ['rumbling-baloth'] },
    });
    settle(cast(g, 'lightning-bolt', [{ player: 'p2' }]));
    expect(g.life('p2')).toBe(17);
    const baloth = g.id('p2', 'rumbling-baloth');
    settle(cast(g, 'lightning-bolt', [g.ref(baloth)]));
    expect(g.obj(baloth).damage).toBe(3);
  });
});

describe('Molten Lavamancer', () => {
  it('has prowess and makes one Elemental per turn from noncombat damage to an opponent', () => {
    const g = game({
      p1: {
        hand: ['lightning-bolt', 'lightning-bolt'],
        battlefield: ['molten-lavamancer', ...n('mountain', 2)],
      },
    });
    const lava = g.id('p1', 'molten-lavamancer');
    cast(g, 'lightning-bolt', [{ player: 'p2' }]);
    resolveAll(g);
    expect(pt(g, lava)).toEqual([3, 4]);
    expect(all(g, 'red-elemental-token')).toHaveLength(1);
    resolveAll(cast(g, 'lightning-bolt', [{ player: 'p2' }]));
    expect(g.life('p2')).toBe(14);
    expect(all(g, 'red-elemental-token')).toHaveLength(1);
  });

  it("doesn't trigger during an opponent's turn", () => {
    const g = game({
      active: 'p2',
      p1: { hand: ['lightning-bolt'], battlefield: ['molten-lavamancer', 'mountain'] },
    });
    g.pass();
    expect(g.actor).toBe('p1');
    resolveAll(cast(g, 'lightning-bolt', [{ player: 'p2' }]));
    expect(g.life('p2')).toBe(17);
    expect(all(g, 'red-elemental-token')).toHaveLength(0);
  });
});

describe('Asgardian Inspiration', () => {
  it('exiles the top card, playable this turn', () => {
    const g = game({
      p1: { hand: ['asgardian-inspiration'], battlefield: ['mountain'], library: ['mountain'] },
    });
    resolveAll(cast(g, 'asgardian-inspiration'));
    const top = g.state.players.p1.exile[0]!;
    expect(g.obj(top).defId).toBe('mountain');
    expect(g.legal().some((a) => a.type === 'playLand' && a.card === top)).toBe(true);
  });

  it('returns from the graveyard for {2} when you deal noncombat damage to an opponent', () => {
    const g = game({
      p1: {
        hand: ['lightning-bolt'],
        graveyard: ['asgardian-inspiration'],
        battlefield: n('mountain', 3),
      },
    });
    const card = g.id('p1', 'asgardian-inspiration', 'graveyard');
    resolveAll(cast(g, 'lightning-bolt', [{ player: 'p2' }]));
    expect(g.zoneOf(card)).toBe('hand');
    expect(g.state.battlefield.filter((id) => g.obj(id).tapped)).toHaveLength(3);
  });

  it('stays in the graveyard if you decline to pay', () => {
    const g = game({
      p1: {
        hand: ['lightning-bolt'],
        graveyard: ['asgardian-inspiration'],
        battlefield: n('mountain', 3),
      },
    });
    const card = g.id('p1', 'asgardian-inspiration', 'graveyard');
    resolveAll(cast(g, 'lightning-bolt', [{ player: 'p2' }]), false);
    expect(g.zoneOf(card)).toBe('graveyard');
  });
});

describe('Origin of Thor', () => {
  it('chapter I: may discard a card to draw two', () => {
    const g = game({
      p1: {
        hand: ['origin-of-thor', 'forest'],
        battlefield: n('mountain', 3),
        library: n('mountain', 5),
      },
    });
    resolveAll(cast(g, 'origin-of-thor'));
    expect(g.state.players.p1.graveyard.map((id) => g.obj(id).defId)).toEqual(['forest']);
    expect(handSize(g, 'p1')).toBe(2);
  });

  it('chapter II: each spell cast this turn puts a +1/+1 counter on a creature you control', () => {
    const g = game({
      step: 'upkeep',
      p1: {
        hand: ['lightning-bolt', 'lightning-bolt'],
        battlefield: ['origin-of-thor', 'molten-lavamancer', ...n('mountain', 2)],
        library: n('mountain', 3),
      },
    });
    g.obj(g.id('p1', 'origin-of-thor')).counters = { lore: 1 };
    resolveAll(toMain(g));
    const lava = g.id('p1', 'molten-lavamancer');
    resolveAll(cast(g, 'lightning-bolt', [{ player: 'p2' }]));
    resolveAll(cast(g, 'lightning-bolt', [{ player: 'p2' }]));
    expect(g.obj(lava).plusOneCounters).toBe(2);
  });

  it('chapter III: a creature you control deals damage equal to its power to each opponent', () => {
    const g = game({
      step: 'upkeep',
      p1: {
        battlefield: ['origin-of-thor', 'molten-lavamancer'],
        library: n('mountain', 3),
      },
    });
    g.obj(g.id('p1', 'origin-of-thor')).counters = { lore: 2 };
    g.obj(g.id('p1', 'molten-lavamancer')).plusOneCounters = 2;
    resolveAll(toMain(g));
    expect(g.life('p2')).toBe(16);
    // The Saga is sacrificed after chapter III; the damage made an Elemental.
    expect(all(g, 'origin-of-thor')).toHaveLength(0);
    expect(all(g, 'red-elemental-token')).toHaveLength(1);
  });
});

describe("Mjölnir's Might", () => {
  it('deals 4 damage to target player and exiles the top card, playable until your next turn ends', () => {
    const g = game({
      p1: { hand: [MIGHT], battlefield: n('mountain', 4), library: ['mountain', 'mountain'] },
    });
    resolveAll(cast(g, MIGHT, [{ player: 'p2' }]));
    expect(g.life('p2')).toBe(16);
    const top = g.state.players.p1.exile[0]!;
    expect(g.obj(top).defId).toBe('mountain');
    expect(g.legal().some((a) => a.type === 'playLand' && a.card === top)).toBe(true);
  });
});
