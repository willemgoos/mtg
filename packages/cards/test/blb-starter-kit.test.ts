import { getCharacteristics } from '@mtg/engine';
import { describe, expect, it } from 'vitest';
import { cardDb } from '../src/index.ts';
import { cast, game, handSize, n, pt, settle } from './blb-helpers.ts';

// The Bloomburrow Starter Kit's cards that no other deck uses (Hare Raising and Otter Limits).

describe('Hare Raising', () => {
  it('Serra Redeemer puts two counters on a creature with power 2 or less that enters', () => {
    const g = game({
      p1: {
        hand: ['bear-cub', 'serra-angel'],
        battlefield: ['serra-redeemer', ...n('plains', 5), ...n('forest', 2)],
      },
    });
    settle(cast(g, 'bear-cub'));
    settle(cast(g, 'serra-angel'));
    expect(g.obj(g.id('p1', 'bear-cub')).plusOneCounters).toBe(2);
    expect(g.obj(g.id('p1', 'serra-angel')).plusOneCounters ?? 0).toBe(0);
  });

  it('Colossification taps the creature and gives it +20/+20', () => {
    const g = game({
      p1: { hand: ['colossification'], battlefield: ['bear-cub', ...n('forest', 7)] },
    });
    const bear = g.id('p1', 'bear-cub');
    settle(cast(g, 'colossification', [g.ref(bear)]));
    expect(g.obj(bear).tapped).toBe(true);
    expect(pt(g, bear)).toEqual([22, 22]);
  });

  it('Byrke puts counters on two creatures and doubles counters on attackers', () => {
    const g = game({
      p1: {
        hand: ['byrke-long-ear-of-the-law'],
        battlefield: ['bear-cub', ...n('plains', 3), ...n('forest', 3)],
      },
    });
    const bear = g.id('p1', 'bear-cub');
    settle(cast(g, 'byrke-long-ear-of-the-law'));
    expect(g.obj(bear).plusOneCounters).toBe(1);
    g.passUntilStep('beginCombat').passBoth().attack(bear);
    settle(g);
    expect(g.obj(bear).plusOneCounters).toBe(2);
  });
});

describe('Otter Limits', () => {
  it('Charmed Sleep taps the creature and keeps it tapped', () => {
    const g = game({
      p1: { hand: ['charmed-sleep'], battlefield: n('island', 3) },
      p2: { battlefield: ['serra-angel'] },
    });
    const angel = g.id('p2', 'serra-angel');
    settle(cast(g, 'charmed-sleep', [g.ref(angel)]));
    expect(g.obj(angel).tapped).toBe(true);
    g.passUntilStep('end').passUntilStep('main1');
    expect(g.state.turn.activePlayer).toBe('p2');
    expect(g.obj(angel).tapped).toBe(true);
  });

  it('Mind Spring draws X cards', () => {
    const g = game({
      p1: { hand: ['mind-spring'], battlefield: n('island', 5), library: n('island', 5) },
    });
    settle(cast(g, 'mind-spring', [], { x: 3 }));
    expect(handSize(g, 'p1')).toBe(3);
  });

  it('Flame Lash deals 4 damage', () => {
    const g = game({ p1: { hand: ['flame-lash'], battlefield: n('mountain', 4) } });
    settle(cast(g, 'flame-lash', [{ player: 'p2' }]));
    expect(g.state.players.p2.life).toBe(16);
  });

  it('Sword of Vengeance gives +2/+0, first strike, vigilance, trample and haste', () => {
    const g = game({ p1: { battlefield: ['sword-of-vengeance', 'bear-cub', ...n('island', 3)] } });
    const bear = g.id('p1', 'bear-cub');
    g.do({
      type: 'activateAbility',
      player: 'p1',
      source: g.id('p1', 'sword-of-vengeance'),
      abilityIndex: 1,
      targets: [g.ref(bear)],
    });
    settle(g);
    expect(pt(g, bear)).toEqual([4, 2]);
    const keywords = getCharacteristics(g.state, cardDb, bear).keywords;
    for (const k of ['firstStrike', 'vigilance', 'trample', 'haste'] as const)
      expect(keywords.has(k), k).toBe(true);
  });

  it('Bria pumps your other creatures and makes one unblockable on a noncreature spell', () => {
    const g = game({
      p1: {
        hand: ['flame-lash'],
        battlefield: ['bria-riptide-rogue', 'bear-cub', ...n('mountain', 4)],
      },
    });
    const bria = g.id('p1', 'bria-riptide-rogue');
    const bear = g.id('p1', 'bear-cub');
    settle(cast(g, 'flame-lash', [{ player: 'p2' }]), (legal) =>
      legal.find(
        (a) =>
          a.type === 'chooseTargets' &&
          a.targets.some((t) => 'object' in t && t.object.id === bear),
      ),
    );
    expect(pt(g, bria)).toEqual([4, 4]);
    expect(pt(g, bear)).toEqual([3, 3]);
  });

  it('Bria gives each other creature its own prowess trigger', () => {
    const g = game({
      p1: {
        hand: ['flame-lash'],
        battlefield: ['bria-riptide-rogue', 'bear-cub', 'savannah-lions', ...n('mountain', 4)],
      },
    });
    const bear = g.id('p1', 'bear-cub');
    const lions = g.id('p1', 'savannah-lions');
    cast(g, 'flame-lash', [{ player: 'p2' }]);
    for (let i = 0; i < 5 && g.decision.kind !== 'priority'; i++) g.do(g.legal()[0]!);
    const sources = g.state.stack.flatMap((x) => (x.kind === 'ability' ? [x.source.id] : []));
    expect(sources.filter((id) => id === bear)).toHaveLength(1);
    expect(sources.filter((id) => id === lions)).toHaveLength(1);
    settle(g);
    expect(pt(g, lions)).toEqual([3, 2]);
  });

  it('Thieving Otter draws on noncombat damage to an opponent too', () => {
    const g = game({
      p1: {
        battlefield: ['thieving-otter', 'origin-of-thor'],
        library: n('island', 3),
      },
    });
    const otter = g.id('p1', 'thieving-otter');
    // Origin of Thor's chapter III: the Otter deals damage equal to its power to each opponent.
    g.obj(g.id('p1', 'origin-of-thor')).counters = { lore: 2 };
    g.passUntilStep('end');
    for (
      let i = 0;
      i < 200 && !(g.state.turn.activePlayer === 'p1' && g.state.turn.step === 'main1');
      i++
    ) {
      if (g.decision.kind === 'priority') g.pass();
      else if (g.decision.kind === 'chooseTriggerTargets')
        g.do(
          g
            .legal()
            .find(
              (a) =>
                a.type === 'chooseTargets' &&
                a.targets.some((t) => 'object' in t && t.object.id === otter),
            ) ?? g.legal()[0]!,
        );
      else g.do(g.legal()[0]!);
    }
    const before = handSize(g, 'p1');
    settle(g, (legal) =>
      legal.find(
        (a) =>
          a.type === 'chooseTargets' &&
          a.targets.some((t) => 'object' in t && t.object.id === otter),
      ),
    );
    expect(g.state.players.p2.life).toBe(18);
    expect(handSize(g, 'p1')).toBe(before + 1);
  });

  it('Thieving Otter draws a card when it deals combat damage to a player', () => {
    const g = game({ p1: { battlefield: ['thieving-otter'], library: n('island', 3) } });
    g.passUntilStep('beginCombat').passBoth().attack(g.id('p1', 'thieving-otter'));
    g.passUntilStep('main2');
    expect(g.state.players.p2.life).toBe(18);
    expect(handSize(g, 'p1')).toBe(1);
  });
});
