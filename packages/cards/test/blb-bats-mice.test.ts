import { describe, expect, it } from 'vitest';
import { all, cast, game, handSize, n, pt, settle } from './blb-helpers.ts';

// Bloomburrow batch 2a: Orzhov Bats and Boros Mice.

describe('hybrid mana', () => {
  it('Moonrise Cleric ({1}{W/B}{W/B}) can be paid with white, black or both', () => {
    for (const lands of [n('plains', 3), n('swamp', 3), ['plains', 'swamp', 'forest']]) {
      const g = game({ p1: { hand: ['moonrise-cleric'], battlefield: lands } });
      expect(
        g.legal().some((a) => a.type === 'castSpell'),
        lands.join(),
      ).toBe(true);
    }
    const g = game({
      p1: { hand: ['moonrise-cleric'], battlefield: ['plains', ...n('forest', 2)] },
    });
    expect(g.legal().some((a) => a.type === 'castSpell')).toBe(false);
  });
});

describe('life gained and lost', () => {
  it('Starlit Soothsayer surveils at your end step only if your life changed', () => {
    const quiet = game({ p1: { battlefield: ['starlit-soothsayer'] } });
    quiet.passUntilStep('end');
    settle(quiet);
    expect(quiet.decision.kind).not.toBe('scry');

    const g = game({
      p1: { hand: ['diresight'], battlefield: [...n('swamp', 3), 'starlit-soothsayer'] },
    });
    settle(cast(g, 'diresight'));
    if (g.decision.kind === 'scry') settle(g.do(g.legal()[0]!));
    expect(g.life('p1')).toBe(18);
    g.passUntilStep('end');
    settle(g);
    expect(g.decision.kind).toBe('scry');
  });

  it('Moonstone Harbinger triggers only once each turn', () => {
    const g = game({
      p1: { battlefield: [...n('swamp', 4), 'moonstone-harbinger', 'lunar-convocation'] },
    });
    const harbinger = g.id('p1', 'moonstone-harbinger');
    const convocation = g.id('p1', 'lunar-convocation');
    const activate = () =>
      settle(
        g.do({
          type: 'activateAbility',
          player: 'p1',
          source: convocation,
          abilityIndex: 2,
          targets: [],
        }),
      );
    activate();
    expect(g.life('p1')).toBe(18);
    expect(pt(g, harbinger)).toEqual([2, 3]);
    activate();
    expect(pt(g, harbinger)).toEqual([2, 3]);
  });

  it('Essence Channeler flies after you lose life, and passes its counters on when it dies', () => {
    const g = game({
      p1: {
        hand: ['fell'],
        battlefield: [...n('swamp', 4), 'essence-channeler', 'bear-cub', 'lunar-convocation'],
      },
    });
    const channeler = g.id('p1', 'essence-channeler');
    g.state.objects[channeler]!.plusOneCounters = 2;
    settle(
      g.do({
        type: 'activateAbility',
        player: 'p1',
        source: g.id('p1', 'lunar-convocation'),
        abilityIndex: 2,
        targets: [],
      }),
    );
    expect(pt(g, channeler)).toEqual([4, 3]);
    settle(cast(g, 'fell', [g.ref(channeler)]));
    expect(g.obj(g.id('p1', 'bear-cub')).plusOneCounters).toBe(2);
  });
});

describe('Orzhov Bats', () => {
  it('Zoraline can pay {W}{B} and 2 life to return a card with a finality counter', () => {
    const g = game({
      p1: {
        hand: ['zoraline-cosmos-caller'],
        battlefield: [...n('plains', 3), ...n('swamp', 2)],
        graveyard: ['bear-cub'],
      },
    });
    cast(g, 'zoraline-cosmos-caller');
    settle(g);
    const bear = g.id('p1', 'bear-cub');
    expect(g.obj(bear).counters?.finality).toBe(1);
    expect(g.life('p1')).toBe(18);
    // Finality: it's exiled instead of dying.
    g.state.objects[bear]!.damage = 5;
    g.pass();
    expect(g.zoneOf(bear)).toBe('exile');
  });

  it('Starfall Invocation with the gift returns one of your creatures', () => {
    const g = game({
      p1: { hand: ['starfall-invocation'], battlefield: [...n('plains', 5), 'serra-angel'] },
      p2: { battlefield: ['bear-cub'] },
    });
    cast(g, 'starfall-invocation', [], { kicked: true });
    settle(g);
    expect(g.decision.kind).toBe('searchLibrary');
    g.do(g.legal().find((a) => a.type === 'chooseCard' && a.card)!);
    settle(g);
    expect(all(g, 'serra-angel')).toHaveLength(1);
    expect(all(g, 'bear-cub')).toHaveLength(0);
    expect(handSize(g, 'p2')).toBe(1);
  });

  it('Star Charter can take a small creature from the top four', () => {
    const g = game({
      p1: {
        hand: ['diresight'],
        battlefield: [...n('swamp', 3), 'star-charter'],
        // Diresight draws the two forests; the end-step look sees the rest.
        library: ['forest', 'forest', 'serra-angel', 'bear-cub', 'forest', 'forest', 'forest'],
      },
    });
    settle(cast(g, 'diresight'));
    if (g.decision.kind === 'scry')
      settle(g.do({ type: 'scry', player: 'p1', top: g.decision.cards, bottom: [] }));
    g.passUntilStep('end');
    settle(g);
    expect(g.decision.kind).toBe('searchLibrary');
    const options = g
      .legal()
      .flatMap((a) => (a.type === 'chooseCard' && a.card ? [g.obj(a.card).defId] : []));
    expect(options).toEqual(['bear-cub']);
  });
});

describe('Boros Mice', () => {
  it('Heartfire Hero grows when targeted and deals its power when it dies', () => {
    const g = game({
      p1: {
        hand: ['might-of-the-meek', 'fell'],
        battlefield: [...n('mountain', 3), 'swamp', 'heartfire-hero'],
      },
    });
    const hero = g.id('p1', 'heartfire-hero');
    settle(cast(g, 'might-of-the-meek', [g.ref(hero)]));
    expect(g.obj(hero).plusOneCounters).toBe(1);
    expect(pt(g, hero)).toEqual([3, 2]);
    settle(cast(g, 'fell', [g.ref(hero)]));
    expect(g.life('p2')).toBe(17);
  });

  it('Blooming Blast with the gift also hits the creature’s controller', () => {
    const g = game({
      p1: { hand: ['blooming-blast'], battlefield: n('mountain', 2) },
      p2: { battlefield: ['bear-cub'] },
    });
    settle(cast(g, 'blooming-blast', [g.ref(g.id('p2', 'bear-cub'))], { kicked: true }));
    expect(g.life('p2')).toBe(17);
    expect(all(g, 'treasure-token').map((id) => g.obj(id).controller)).toEqual(['p2']);
  });

  it('Emberheart Challenger exiles the top card, playable this turn', () => {
    const g = game({
      p1: {
        hand: ['might-of-the-meek'],
        battlefield: ['mountain', 'emberheart-challenger'],
        library: ['forest', 'plains'],
      },
    });
    settle(cast(g, 'might-of-the-meek', [g.ref(g.id('p1', 'emberheart-challenger'))]));
    const exiled = g.id('p1', 'forest', 'exile');
    expect(g.legal().some((a) => a.type === 'playLand' && a.card === exiled)).toBe(true);
  });

  it('Mabel makes Cragflame and pumps other Mice', () => {
    const g = game({
      p1: {
        hand: ['mabel-heir-to-cragflame'],
        battlefield: [...n('mountain', 2), 'plains', 'heartfire-hero'],
      },
    });
    settle(cast(g, 'mabel-heir-to-cragflame'));
    expect(all(g, 'cragflame-token')).toHaveLength(1);
    expect(pt(g, g.id('p1', 'heartfire-hero'))).toEqual([2, 2]);
  });
});
