import { getCharacteristics } from '@mtg/engine';
import { describe, expect, it } from 'vitest';
import { cardDb } from '../src/index.ts';
import { all, cast, game, handSize, n, pt, settle } from './blb-helpers.ts';

// Bloomburrow batch 2d: Azorius Birds and Gruul Raccoons.

describe('delayed triggers', () => {
  it('Parting Gust without the gift returns the creature at the next end step with a counter', () => {
    const g = game({
      p1: { hand: ['parting-gust'], battlefield: n('plains', 2) },
      p2: { battlefield: ['serra-angel'] },
    });
    const angel = g.id('p2', 'serra-angel');
    settle(cast(g, 'parting-gust', [g.ref(angel)]));
    expect(g.zoneOf(angel)).toBe('exile');
    g.passUntilStep('end');
    settle(g);
    expect(g.zoneOf(angel)).toBe('battlefield');
    expect(g.obj(angel).plusOneCounters).toBe(1);
    expect(g.obj(angel).controller).toBe('p2');
  });

  it('Salvation Swan gives a returning creature a flying counter', () => {
    const g = game({
      p1: { hand: ['salvation-swan'], battlefield: [...n('plains', 4), 'bear-cub'] },
    });
    const bear = g.id('p1', 'bear-cub');
    settle(cast(g, 'salvation-swan'), (legal) =>
      legal.find((a) => a.type === 'chooseTargets' && a.targets.length === 1),
    );
    expect(g.zoneOf(bear)).toBe('exile');
    g.passUntilStep('end');
    settle(g);
    expect(g.zoneOf(bear)).toBe('battlefield');
    expect([...getCharacteristics(g.state, cardDb, bear).keywords]).toContain('flying');
  });
});

describe('mana pool', () => {
  it('Brazen Collector adds {R} that lasts through combat', () => {
    const g = game({
      step: 'beginCombat',
      p1: { hand: ['might-of-the-meek'], battlefield: ['brazen-collector'] },
    });
    const collector = g.id('p1', 'brazen-collector');
    g.passBoth().attack(collector);
    settle(g);
    expect(g.state.players.p1.pool).toHaveLength(1);
    // Might of the Meek ({R}) is castable with the floating mana.
    settle(cast(g, 'might-of-the-meek', [g.ref(collector)]));
    expect(g.state.players.p1.pool).toHaveLength(0);
  });

  it('Muerra adds {R} or {G} for each Raccoon at the start of the main phase', () => {
    const g = game({
      step: 'draw',
      p1: { battlefield: ['muerra-trash-tactician', 'brazen-collector'] },
    });
    g.passUntilStep('main1');
    settle(g);
    expect(g.state.players.p1.pool?.map((p) => p.produces.join())).toEqual(['R,G', 'R,G']);
    g.passUntilStep('beginCombat');
    expect(g.state.players.p1.pool).toHaveLength(0);
  });
});

describe('Classes', () => {
  it("Hunter's Talent levels up as a sorcery and its level 2 trigger only works after", () => {
    const g = game({
      step: 'main1',
      p1: { hand: ['hunters-talent'], battlefield: [...n('forest', 4), 'bear-cub'] },
      p2: { battlefield: ['savannah-lions'] },
    });
    settle(cast(g, 'hunters-talent'), (legal) =>
      legal.find((a) => a.type === 'chooseTargets' && a.targets.length === 2),
    );
    expect(all(g, 'savannah-lions')).toHaveLength(0); // the bear dealt 2
    const talent = g.id('p1', 'hunters-talent');
    const levelUp = g.legal().find((a) => a.type === 'activateAbility' && a.source === talent);
    expect(levelUp).toBeDefined();
    settle(g.do(levelUp!));
    expect(g.obj(talent).level).toBe(2);
    // Level 3 needs {3}{G}: only one land left.
    expect(g.legal().some((a) => a.type === 'activateAbility' && a.source === talent)).toBe(false);
    g.passUntilStep('beginCombat').passBoth().attack(g.id('p1', 'bear-cub'));
    settle(g);
    expect(pt(g, g.id('p1', 'bear-cub'))).toEqual([3, 2]);
  });
});

describe('Azorius Birds', () => {
  it('Jackdaw Savior returns a creature card with lesser mana value when a flyer dies', () => {
    const g = game({
      p1: {
        hand: ['fell'],
        battlefield: [...n('swamp', 2), 'jackdaw-savior', 'serra-angel'],
        graveyard: ['bear-cub', 'pileated-provisioner'],
      },
    });
    settle(cast(g, 'fell', [g.ref(g.id('p1', 'serra-angel'))]));
    // Serra Angel has mana value 5: Bear Cub (2) qualifies, Pileated Provisioner (5) doesn't.
    expect(all(g, 'bear-cub')).toHaveLength(1);
    expect(g.zoneOf(g.id('p1', 'pileated-provisioner', 'graveyard'))).toBe('graveyard');
  });

  it('Kastral triggers once when several Birds hit and can draw', () => {
    const g = game({
      step: 'beginCombat',
      p1: { battlefield: ['kastral-the-windcrested', 'shrike-force'] },
    });
    g.passBoth().attack(g.id('p1', 'kastral-the-windcrested'), g.id('p1', 'shrike-force'));
    for (let i = 0; i < 40 && g.decision.kind !== 'chooseTriggerTargets'; i++) g.pass();
    expect(g.decision.kind).toBe('chooseTriggerTargets');
    settle(g.do({ type: 'chooseTargets', player: 'p1', targets: [], mode: 2 }));
    expect(handSize(g, 'p1')).toBe(1);
    expect(g.state.pendingTriggers).toHaveLength(0);
  });
});

describe('Gruul Raccoons', () => {
  it("Hoarder's Overflow draws one card per stash counter", () => {
    const g = game({
      p1: {
        hand: ['hoarders-overflow', 'forest', 'forest'],
        battlefield: n('mountain', 4),
        library: n('forest', 10),
      },
    });
    settle(cast(g, 'hoarders-overflow'));
    const overflow = g.id('p1', 'hoarders-overflow');
    g.state.objects[overflow]!.counters = { stash: 3 };
    settle(
      g.do({
        type: 'activateAbility',
        player: 'p1',
        source: overflow,
        abilityIndex: 2,
        targets: [],
      }),
    );
    expect(handSize(g, 'p1')).toBe(3);
  });
});
