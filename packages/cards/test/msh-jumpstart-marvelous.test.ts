import { describe, expect, it } from 'vitest';
import { cardDb, slug } from '../src/index.ts';
import { all, cast, game, handSize, n, pt, settle } from './blb-helpers.ts';

// Marvel Super Heroes Jumpstart packet: Marvelous.

const PACKET = [
  'Wakandan Shield Guard',
  'Raft Security Officer',
  'Marvel Boy, Noh-Varr',
  'Hero in Training',
  'Ms. Marvel, Elastic Ally',
  'Photon, Lady of Light',
  'Captain Mar-Vell, Space-Born',
  'Captain Marvel, Shooting Star',
  'Helicarrier Strike',
  'Quantum Entanglement',
  'Super Villain Lockup',
  'Fall to Earth',
  'Thriving Heath',
  'Plains',
];

const MARVEL_BOY = 'marvel-boy-noh-varr';
const MS_MARVEL = 'ms-marvel-elastic-ally';
const PHOTON = 'photon-lady-of-light';
const CAPTAIN = 'captain-marvel-shooting-star';
const ENTANGLEMENT = 'quantum-entanglement';
const FALL = 'fall-to-earth';

describe('Marvelous packet', () => {
  it('has every card implemented', () => {
    expect(PACKET.filter((name) => !cardDb.has(slug(name)))).toEqual([]);
  });
});

describe('Marvel Boy, Noh-Varr', () => {
  it('gets a counter when another creature of yours enters', () => {
    const g = game({
      p1: { hand: ['bear-cub'], battlefield: [MARVEL_BOY, ...n('forest', 2)] },
    });
    const boy = g.id('p1', MARVEL_BOY);
    settle(cast(g, 'bear-cub'));
    expect(pt(g, boy)).toEqual([2, 2]);
  });

  it('gets a counter when you activate a power-up ability', () => {
    const g = game({
      p1: {
        battlefield: [MARVEL_BOY, 'black-panther-most-dangerous', ...n('plains', 7)],
      },
    });
    const boy = g.id('p1', MARVEL_BOY);
    settle(
      g.do({
        type: 'activateAbility',
        player: 'p1',
        source: g.id('p1', 'black-panther-most-dangerous'),
        abilityIndex: 1,
        targets: [],
      }),
    );
    // +1/+1 counter from the power-up, +2/+2 from Black Panther's pump.
    expect(pt(g, boy)).toEqual([4, 4]);
  });
});

describe('Ms. Marvel, Elastic Ally', () => {
  it('pumps a creature as she enters, and it draws once on combat damage', () => {
    const g = game({
      p1: {
        hand: [MS_MARVEL],
        battlefield: [...n('bear-cub', 2), ...n('plains', 3)],
        library: n('plains', 3),
      },
    });
    const [a, b] = all(g, 'bear-cub');
    settle(cast(g, MS_MARVEL, []), (legal) =>
      legal.find(
        (x) =>
          x.type === 'chooseTargets' && x.targets.some((t) => 'object' in t && t.object.id === a),
      ),
    );
    expect(pt(g, a!)).toEqual([4, 2]);
    const hand = handSize(g, 'p1');
    g.passUntilStep('beginCombat').passBoth().attack(a!, b!);
    settle(g);
    g.passUntilStep('main2');
    expect(g.life('p2')).toBe(14);
    // Only the pumped bear has power above its base.
    expect(handSize(g, 'p1')).toBe(hand + 1);
  });

  it('does not draw for creatures at their base power', () => {
    const g = game({
      p1: { battlefield: [MS_MARVEL, 'bear-cub'], library: n('plains', 3) },
    });
    const hand = handSize(g, 'p1');
    g.passUntilStep('beginCombat').passBoth().attack(g.id('p1', 'bear-cub'));
    settle(g);
    g.passUntilStep('main2');
    expect(g.life('p2')).toBe(18);
    expect(handSize(g, 'p1')).toBe(hand);
  });
});

describe('Photon, Lady of Light', () => {
  it('blinks another creature you control as she attacks', () => {
    const g = game({ p1: { battlefield: [PHOTON, 'bear-cub'] } });
    const bear = g.id('p1', 'bear-cub');
    const zcc = g.obj(bear).zcc;
    g.passUntilStep('beginCombat').passBoth().attack(g.id('p1', PHOTON));
    settle(g);
    expect(g.obj(bear).zone).toBe('battlefield');
    expect(g.obj(bear).zcc).toBeGreaterThan(zcc);
  });
});

describe('Captain Marvel, Shooting Star', () => {
  it('exiles a creature as she enters; its controller and she each gain life', () => {
    const g = game({
      p1: { hand: [CAPTAIN], battlefield: n('plains', 7) },
      p2: { battlefield: ['serra-angel'] },
    });
    const angel = g.id('p2', 'serra-angel');
    settle(cast(g, CAPTAIN));
    expect(g.obj(angel).zone).toBe('exile');
    expect(g.life('p2')).toBe(24);
    expect(g.life('p1')).toBe(24);
  });

  it('gains life when another creature is exiled from the battlefield (a blink too)', () => {
    const g = game({ p1: { battlefield: [CAPTAIN, PHOTON, 'bear-cub'] } });
    const bear = g.id('p1', 'bear-cub');
    g.passUntilStep('beginCombat').passBoth().attack(g.id('p1', PHOTON));
    settle(g, (legal) =>
      legal.find(
        (x) =>
          x.type === 'chooseTargets' &&
          x.targets.some((t) => 'object' in t && t.object.id === bear),
      ),
    );
    expect(g.obj(bear).zone).toBe('battlefield');
    expect(g.life('p1')).toBe(22);
  });

  it('her attack trigger exiles an opposing creature', () => {
    const g = game({
      p1: { battlefield: [CAPTAIN] },
      p2: { battlefield: ['bear-cub'] },
    });
    const bear = g.id('p2', 'bear-cub');
    g.passUntilStep('beginCombat').passBoth().attack(g.id('p1', CAPTAIN));
    settle(g, (legal) =>
      legal.find(
        (x) =>
          x.type === 'chooseTargets' &&
          x.targets.some((t) => 'object' in t && t.object.id === bear),
      ),
    );
    expect(g.obj(bear).zone).toBe('exile');
    expect(g.life('p2')).toBe(22);
    expect(g.life('p1')).toBe(22);
  });
});

describe('Quantum Entanglement', () => {
  it('may pay {1}{W} as it enters to blink a creature you control', () => {
    const g = game({
      p1: { hand: [ENTANGLEMENT], battlefield: ['bear-cub', ...n('plains', 4)] },
    });
    const bear = g.id('p1', 'bear-cub');
    const zcc = g.obj(bear).zcc;
    settle(cast(g, ENTANGLEMENT));
    expect(g.obj(bear).zcc).toBeGreaterThan(zcc);
    expect(g.obj(bear).zone).toBe('battlefield');
    expect(g.state.battlefield.filter((id) => g.obj(id).tapped)).toHaveLength(4);
  });

  it('triggers again at the beginning of your end step', () => {
    const g = game({
      p1: { battlefield: [ENTANGLEMENT, 'bear-cub', ...n('plains', 2)] },
    });
    const bear = g.id('p1', 'bear-cub');
    const zcc = g.obj(bear).zcc;
    g.passUntilStep('main2');
    for (let i = 0; i < 10 && g.decision.kind === 'priority'; i++) g.pass();
    expect(g.state.turn.step).toBe('end');
    settle(g);
    expect(g.obj(bear).zcc).toBeGreaterThan(zcc);
  });
});

describe('Fall to Earth', () => {
  it('exiles a creature and each player gains 3 life', () => {
    const g = game({
      p1: { hand: [FALL], battlefield: n('plains', 5) },
      p2: { battlefield: ['serra-angel'] },
    });
    const angel = g.id('p2', 'serra-angel');
    settle(cast(g, FALL, [g.ref(angel)]));
    expect(g.obj(angel).zone).toBe('exile');
    expect(g.life('p1')).toBe(23);
    expect(g.life('p2')).toBe(23);
  });

  it('has basic landcycling {2}', () => {
    const g = game({
      p1: { hand: [FALL], battlefield: n('plains', 2), library: ['plains'] },
    });
    const card = g.id('p1', FALL, 'hand');
    g.do({ type: 'activateAbility', player: 'p1', source: card, abilityIndex: 0, targets: [] });
    for (let i = 0; i < 10 && (g.decision.kind !== 'priority' || g.state.stack.length); i++) {
      if (g.decision.kind === 'priority') g.pass();
      else g.do(g.legal()[0]!);
    }
    expect(g.state.players.p1.graveyard).toContain(card);
    expect(g.state.players.p1.hand.map((id) => g.obj(id).defId)).toEqual(['plains']);
  });
});
