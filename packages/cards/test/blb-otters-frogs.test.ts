import { describe, expect, it } from 'vitest';
import { all, cast, game, handSize, n, pt, settle } from './blb-helpers.ts';

// Bloomburrow batch 2c: Izzet Otters and Simic Frogs.

describe('Izzet Otters', () => {
  it('Dazzling Denial counters unless the controller pays {2}', () => {
    const paid = game({
      p1: { hand: ['dazzling-denial'], battlefield: n('island', 2) },
      p2: { hand: ['bear-cub'], battlefield: n('forest', 4) },
      active: 'p2',
    });
    cast(paid, 'bear-cub').pass();
    cast(paid, 'dazzling-denial', [
      {
        object: {
          id: paid.id('p2', 'bear-cub', 'stack'),
          zcc: paid.obj(paid.id('p2', 'bear-cub', 'stack')).zcc,
        },
      },
    ]);
    paid.passBoth();
    expect(paid.decision.kind).toBe('payOrCounter');
    settle(paid.do({ type: 'chooseEffect', player: 'p2', accept: true }));
    expect(all(paid, 'bear-cub')).toHaveLength(1);

    const broke = game({
      p1: { hand: ['dazzling-denial'], battlefield: n('island', 2) },
      p2: { hand: ['bear-cub'], battlefield: n('forest', 2) },
      active: 'p2',
    });
    cast(broke, 'bear-cub').pass();
    const bear = broke.id('p2', 'bear-cub', 'stack');
    settle(cast(broke, 'dazzling-denial', [{ object: { id: bear, zcc: broke.obj(bear).zcc } }]));
    expect(broke.zoneOf(bear)).toBe('graveyard');
  });

  it("Sazacap's Brew discards a card as it's cast", () => {
    const g = game({ p1: { hand: ['sazacaps-brew', 'forest'], battlefield: n('mountain', 2) } });
    const casts = g.legal().filter((a) => a.type === 'castSpell');
    expect(
      casts.every((a) => a.type === 'castSpell' && a.discard === g.id('p1', 'forest', 'hand')),
    ).toBe(true);
    settle(
      g.do(
        casts.find(
          (a) =>
            a.type === 'castSpell' &&
            !a.kicked &&
            'player' in a.targets[0]! &&
            a.targets[0].player === 'p1',
        )!,
      ),
    );
    expect(handSize(g, 'p1')).toBe(2);
    expect(g.state.players.p1.graveyard).toHaveLength(2);
  });

  it('Otterball Antics with flashback makes a bigger Otter', () => {
    const g = game({ p1: { battlefield: n('island', 4), graveyard: ['otterball-antics'] } });
    settle(g.do(g.legal().find((a) => a.type === 'castSpell')!));
    const [token] = all(g, 'otter-token');
    expect(pt(g, token!)).toEqual([2, 2]);
    expect(g.zoneOf(g.id('p1', 'otterball-antics', 'exile'))).toBe('exile');
  });

  it('Valley Floodcaller lets noncreature spells be cast at instant speed', () => {
    const g = game({
      p1: {
        hand: ['pearl-of-wisdom', 'bear-cub'],
        battlefield: [...n('island', 3), 'forest', 'valley-floodcaller'],
      },
      active: 'p2',
    });
    g.pass();
    const casts = g
      .legal('p1')
      .filter((a) => a.type === 'castSpell')
      .map((a) => a.type === 'castSpell' && g.obj(a.card).defId);
    expect(casts).toEqual(['pearl-of-wisdom']);
  });

  it('Eddymurk Crab enters tapped on the opponent’s turn', () => {
    const g = game({
      p1: { hand: ['eddymurk-crab'], battlefield: n('island', 7) },
      active: 'p2',
    });
    g.pass();
    settle(cast(g, 'eddymurk-crab'));
    expect(g.obj(g.id('p1', 'eddymurk-crab')).tapped).toBe(true);
  });
});

describe('Simic Frogs', () => {
  it('Lilysplash Mentor blinks a creature with a +1/+1 counter; Three Tree Scribe notices', () => {
    const g = game({
      p1: {
        battlefield: [
          ...n('forest', 2),
          'island',
          'lilysplash-mentor',
          'three-tree-scribe',
          'bear-cub',
        ],
      },
    });
    const bear = g.id('p1', 'bear-cub');
    g.do({
      type: 'activateAbility',
      player: 'p1',
      source: g.id('p1', 'lilysplash-mentor'),
      abilityIndex: 0,
      targets: [g.ref(bear)],
    });
    settle(g, (legal) =>
      legal.find(
        (a) =>
          a.type === 'chooseTargets' &&
          a.targets.some((t) => 'object' in t && t.object.id === bear),
      ),
    );
    // +1 from the blink, +1 from Three Tree Scribe ("leaves without dying").
    expect(g.obj(bear).plusOneCounters).toBe(2);
  });

  it('Dour Port-Mage draws once when several creatures leave together', () => {
    const g = game({
      p1: {
        hand: ['calamitous-tide'],
        battlefield: [...n('island', 6), 'dour-port-mage', 'bear-cub', 'savannah-lions'],
        library: n('forest', 10),
      },
    });
    settle(
      cast(g, 'calamitous-tide', [
        g.ref(g.id('p1', 'bear-cub')),
        g.ref(g.id('p1', 'savannah-lions')),
      ]),
    );
    if (g.decision.kind === 'discard') settle(g.do(g.legal()[0]!));
    // Two creatures back in hand, two drawn by the Tide, one by the Port-Mage, one discarded.
    expect(handSize(g, 'p1')).toBe(4);
  });

  it('Mistbreath Elder returns another creature and grows, or may return itself', () => {
    const g = game({ p1: { battlefield: ['mistbreath-elder', 'bear-cub'] }, step: 'upkeep' });
    // On to p1's next upkeep (the scenario starts there, so its trigger didn't fire).
    g.passUntilStep('draw').passUntilStep('upkeep').passUntilStep('draw').passUntilStep('upkeep');
    settle(g);
    expect(g.decision.kind).toBe('chooseObject');
    settle(g.do(g.legal()[0]!));
    expect(g.zoneOf(g.id('p1', 'bear-cub', 'hand'))).toBe('hand');
    expect(g.obj(g.id('p1', 'mistbreath-elder')).plusOneCounters).toBe(1);
  });

  it("Clement's Frogs tap for creature spells only", () => {
    const g = game({
      p1: {
        hand: ['bear-cub', 'pearl-of-wisdom'],
        battlefield: ['clement-the-worrywort', 'pond-prophet', 'forest'],
      },
    });
    const casts = g
      .legal()
      .filter((a) => a.type === 'castSpell')
      .map((a) => a.type === 'castSpell' && g.obj(a.card).defId);
    expect(casts).toEqual(['bear-cub']);
  });

  it('Clifftop Lookout puts the first land onto the battlefield tapped', () => {
    const g = game({
      p1: {
        hand: ['clifftop-lookout'],
        battlefield: n('forest', 3),
        library: ['bear-cub', 'island', 'forest'],
      },
    });
    settle(cast(g, 'clifftop-lookout'));
    expect(g.obj(g.id('p1', 'island')).tapped).toBe(true);
    const lib = g.state.players.p1.library.map((id) => g.obj(id).defId);
    expect(lib).toEqual(['forest', 'bear-cub']);
  });

  it('Dreamdew Entrancer stuns an opponent’s creature with three counters', () => {
    const g = game({
      p1: { hand: ['dreamdew-entrancer'], battlefield: [...n('forest', 2), ...n('island', 2)] },
      p2: { battlefield: ['serra-angel'] },
    });
    const angel = g.id('p2', 'serra-angel');
    settle(cast(g, 'dreamdew-entrancer'), (legal) =>
      legal.find(
        (a) =>
          a.type === 'chooseTargets' &&
          a.targets.some((t) => 'object' in t && t.object.id === angel),
      ),
    );
    expect(g.obj(angel).tapped).toBe(true);
    expect(g.obj(angel).counters?.stun).toBe(3);
    expect(handSize(g, 'p1')).toBe(0);
  });
});
