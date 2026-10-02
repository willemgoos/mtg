import { getCharacteristics } from '@mtg/engine';
import { describe, expect, it } from 'vitest';
import { cardDb } from '../src/index.ts';
import { all, cast, game, handSize, n, pt, settle } from './blb-helpers.ts';

// Marvel Super Heroes 10c: rares and mythics.

describe('lands', () => {
  it('Dark Fortress makes coloured mana only with a basic land, or the turn it entered', () => {
    const lone = game({
      p1: { hand: ['lightning-strike'], battlefield: ['dark-fortress', 'mountain'] },
    });
    lone.obj(lone.id('p1', 'dark-fortress')).zoneTurn = 0;
    expect(lone.legal().some((a) => a.type === 'castSpell')).toBe(true);
    const g = game({
      p1: { hand: ['lightning-strike'], battlefield: ['dark-fortress', 'castle-doom'] },
    });
    g.obj(g.id('p1', 'dark-fortress')).zoneTurn = 0;
    expect(g.legal().some((a) => a.type === 'castSpell')).toBe(false);
  });

  it('basic landcycling finds a basic land', () => {
    const g = game({
      p1: {
        hand: ['kree-sentinel'],
        battlefield: n('mountain', 2),
        library: ['plains', 'agent-of-atlas'],
      },
    });
    g.do({
      type: 'activateAbility',
      player: 'p1',
      source: g.id('p1', 'kree-sentinel', 'hand'),
      abilityIndex: 0,
      targets: [],
    });
    settle(g);
    if (g.decision.kind === 'searchLibrary') g.do(g.legal()[0]!);
    expect(g.state.players.p1.hand.map((id) => g.obj(id).defId)).toEqual(['plains']);
  });
});

describe('creatures', () => {
  it('Doctor Doom makes two Doombots and is indestructible with an artifact creature', () => {
    const g = game({ p1: { hand: ['doctor-doom'], battlefield: n('swamp', 6) } });
    settle(cast(g, 'doctor-doom'));
    expect(all(g, 'doombot-token')).toHaveLength(2);
    const doom = g.id('p1', 'doctor-doom');
    expect(getCharacteristics(g.state, cardDb, doom).keywords.has('indestructible')).toBe(true);
  });

  it('M.O.D.O.K. shrinks the opponent’s creatures', () => {
    const g = game({ p1: { battlefield: ['m-o-d-o-k'] }, p2: { battlefield: ['agent-of-atlas'] } });
    expect(pt(g, g.id('p2', 'agent-of-atlas'))).toEqual([1, 1]);
  });

  it('The Sentry gives the opponent The Void, which attacks each combat', () => {
    const g = game({ p1: { hand: ['the-sentry-golden-guardian'], battlefield: n('plains', 4) } });
    settle(cast(g, 'the-sentry-golden-guardian'));
    const voidToken = g.state.battlefield.find((id) => g.obj(id).defId === 'the-void-token')!;
    expect(g.obj(voidToken).controller).toBe('p2');
  });

  it('Squirrel Girl makes a Squirrel, then doubles them', () => {
    const g = game({ p1: { hand: ['the-unbeatable-squirrel-girl'], battlefield: n('forest', 8) } });
    settle(cast(g, 'the-unbeatable-squirrel-girl'));
    expect(all(g, 'squirrel-token')).toHaveLength(1);
    const girl = g.id('p1', 'the-unbeatable-squirrel-girl');
    g.do({ type: 'activateAbility', player: 'p1', source: girl, abilityIndex: 2, targets: [] });
    settle(g);
    expect(all(g, 'squirrel-token')).toHaveLength(3); // she is a Squirrel too;
  });

  it('Multiversal Incursion copies your nontoken creatures, not legendary', () => {
    const g = game({
      p1: {
        hand: ['multiversal-incursion'],
        battlefield: [...n('island', 7), 'thor-odinson', 'agent-of-atlas'],
      },
    });
    settle(cast(g, 'multiversal-incursion'));
    expect(all(g, 'thor-odinson')).toHaveLength(2);
    expect(all(g, 'agent-of-atlas')).toHaveLength(2);
    expect(handSize(g, 'p1')).toBe(0);
  });
});
