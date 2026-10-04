import { getCharacteristics } from '@mtg/engine';
import { describe, expect, it } from 'vitest';
import { cardDb, slug } from '../src/index.ts';
import { all, cast, game, handSize, n, pt, settle } from './blb-helpers.ts';

// Marvel Super Heroes Jumpstart: the Soaring packet (docs/marvel-jumpstart.md).

const SOARING = [
  'Aerial Doombot',
  'Rescue, Pepper Potts',
  'Flying Drone',
  'Namora, the Sea Queen',
  'S.H.I.E.L.D. Deployment Drone',
  'Justice, Vance Astrovik',
  'Vulture, Feathered Fiend',
  'Falcon, Winged Wonder',
  'Whoosh!',
  "Falcon's Wing Harness",
  'I Am Iron Man',
  'Dismissive Denial',
  'Thriving Isle',
  'Island',
];

type G = ReturnType<typeof game>;

const kw = (g: G, id: string) => [...getCharacteristics(g.state, cardDb, id).keywords];
const activations = (g: G, source: string) =>
  g
    .legal()
    .filter((a) => a.type === 'activateAbility' && a.source === source)
    .map((a) => (a.type === 'activateAbility' ? a.abilityIndex : -1));
/** Resolves the stack, answering any other decision with its first legal action. */
const resolve = (g: G) => {
  for (let i = 0; i < 30; i++) {
    settle(g);
    if (g.decision.kind === 'priority') return g;
    g.do(g.legal()[0]!);
  }
  return g;
};

describe('Soaring packet', () => {
  it('has every card implemented', () => {
    for (const name of SOARING) expect(cardDb.has(slug(name)), name).toBe(true);
  });
});

describe('Flying Drone', () => {
  it('loots for {1}{U}, or for free once another flyer entered this turn', () => {
    const g = game({
      p1: {
        battlefield: ['flying-drone', 'namora-the-sea-queen', ...n('island', 2)],
        hand: ['mountain'],
        library: ['forest'],
      },
    });
    const drone = g.id('p1', 'flying-drone');
    const namora = g.id('p1', 'namora-the-sea-queen');
    g.obj(drone).zoneTurn = 0;
    expect(cardDb.get('flying-drone')!.keywords).toEqual(
      expect.arrayContaining(['flying', 'vigilance']),
    );
    // Namora entered this turn: only the free version.
    g.obj(namora).zoneTurn = g.state.turn.number;
    expect(activations(g, drone)).toEqual([1]);
    g.obj(namora).zoneTurn = 0;
    expect(activations(g, drone)).toEqual([0]);
    g.obj(namora).zoneTurn = g.state.turn.number;
    g.do({ type: 'activateAbility', player: 'p1', source: drone, abilityIndex: 1, targets: [] });
    resolve(g);
    expect(handSize(g, 'p1')).toBe(1);
    expect(g.state.players.p1.graveyard).toHaveLength(1);
    expect(g.obj(drone).tapped).toBe(true);
    // No mana spent.
    expect(g.state.battlefield.filter((id) => g.obj(id).tapped)).toHaveLength(1);
  });
});

describe('Namora, the Sea Queen', () => {
  it('powers up for a +1/+1 counter and two Merfolk', () => {
    const g = game({ p1: { battlefield: ['namora-the-sea-queen', ...n('island', 6)] } });
    const namora = g.id('p1', 'namora-the-sea-queen');
    g.obj(namora).zoneTurn = 0;
    expect(cardDb.get('namora-the-sea-queen')!.keywords).toContain('flying');
    g.do({ type: 'activateAbility', player: 'p1', source: namora, abilityIndex: 0, targets: [] });
    resolve(g);
    expect(pt(g, namora)).toEqual([3, 4]);
    expect(all(g, 'merfolk-token')).toHaveLength(2);
  });
});

describe('Vulture, Feathered Fiend', () => {
  it('puts a counter on each flyer that hit and draws one card', () => {
    const g = game({
      p1: {
        battlefield: ['vulture-feathered-fiend', 'namora-the-sea-queen', 'bear-cub'],
        library: n('island', 3),
      },
    });
    const vulture = g.id('p1', 'vulture-feathered-fiend');
    const namora = g.id('p1', 'namora-the-sea-queen');
    const bear = g.id('p1', 'bear-cub');
    for (const id of [vulture, namora, bear]) g.obj(id).zoneTurn = 0;
    g.passUntilStep('beginCombat').passBoth().attack(vulture, namora, bear);
    g.passUntilStep('combatDamage');
    resolve(g);
    expect(g.life('p2')).toBe(20 - 2 - 2 - 2);
    expect(pt(g, vulture)).toEqual([3, 5]);
    expect(pt(g, namora)).toEqual([3, 4]);
    expect(pt(g, bear)).toEqual([2, 2]);
    expect(handSize(g, 'p1')).toBe(1);
  });
});

describe('Whoosh!', () => {
  it('returns a nonland permanent to its owner’s hand', () => {
    const g = game({
      p1: { hand: ['whoosh'], battlefield: n('island', 2), library: ['forest'] },
      p2: { battlefield: ['bear-cub'] },
    });
    const bear = g.id('p2', 'bear-cub');
    settle(cast(g, 'whoosh', [g.ref(bear)]));
    expect(g.zoneOf(bear)).toBe('hand');
    expect(handSize(g, 'p1')).toBe(0);
  });

  it('draws a card when kicked', () => {
    const g = game({
      p1: { hand: ['whoosh'], battlefield: n('island', 4), library: ['forest'] },
      p2: { battlefield: ['bear-cub'] },
    });
    const bear = g.id('p2', 'bear-cub');
    settle(cast(g, 'whoosh', [g.ref(bear)], { kicked: true }));
    expect(g.zoneOf(bear)).toBe('hand');
    expect(handSize(g, 'p1')).toBe(1);
  });
});

describe("Falcon's Wing Harness", () => {
  it('attaches as it enters: +1/+1, flying and ward {1}; equip {2}{U}', () => {
    const g = game({
      p1: { hand: ['falcons-wing-harness'], battlefield: ['bear-cub', ...n('island', 5)] },
    });
    const bear = g.id('p1', 'bear-cub');
    resolve(cast(g, 'falcons-wing-harness'));
    expect(pt(g, bear)).toEqual([3, 3]);
    expect(kw(g, bear)).toEqual(expect.arrayContaining(['flying', 'wardOne']));
    const harness = g.id('p1', 'falcons-wing-harness');
    expect(g.obj(harness).attachedTo).toBe(bear);
    expect(activations(g, harness)).toContain(2);
  });
});

describe('Dismissive Denial', () => {
  it('counters target spell', () => {
    const g = game({
      p1: { hand: ['bear-cub'], battlefield: n('forest', 2) },
      p2: { hand: ['dismissive-denial'], battlefield: n('island', 4) },
    });
    const bear = g.id('p1', 'bear-cub', 'hand');
    cast(g, 'bear-cub').pass();
    cast(g, 'dismissive-denial', [g.ref(bear)]).passBoth();
    expect(g.zoneOf(bear)).toBe('graveyard');
    expect(g.state.stack).toHaveLength(0);
  });

  it('has basic landcycling {2}', () => {
    const g = game({
      p1: { hand: ['dismissive-denial'], battlefield: n('island', 2), library: ['island'] },
    });
    const card = g.id('p1', 'dismissive-denial', 'hand');
    g.do({ type: 'activateAbility', player: 'p1', source: card, abilityIndex: 0, targets: [] });
    resolve(g);
    expect(g.state.players.p1.graveyard).toContain(card);
    expect(g.state.players.p1.hand.map((id) => g.obj(id).defId)).toEqual(['island']);
  });
});
