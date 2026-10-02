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

describe('batch 2 engine pieces', () => {
  it('a shield counter is removed instead of damage, and Captain America gives hexproof', () => {
    const g = game({
      p1: { hand: ['captain-america-super-soldier'], battlefield: n('plains', 3) },
      p2: { hand: ['lightning-strike'], battlefield: n('mountain', 2) },
    });
    settle(cast(g, 'captain-america-super-soldier'));
    const cap = g.id('p1', 'captain-america-super-soldier');
    expect(g.obj(cap).counters?.shield).toBe(1);
    g.state.turn.activePlayer = 'p2';
    g.state.decision = { kind: 'priority', player: 'p2' };
    const targets = g
      .legal('p2')
      .filter((a) => a.type === 'castSpell')
      .flatMap((a) => (a.type === 'castSpell' ? a.targets : []));
    expect(targets.some((t) => 'player' in t && t.player === 'p1')).toBe(false);
    cast(g, 'lightning-strike', [g.ref(cap)]);
    settle(g);
    expect(g.obj(cap).damage).toBe(0);
    expect(g.obj(cap).counters?.shield).toBe(0);
  });

  it('Kang the Conqueror takes an extra turn without power-up', () => {
    const g = game({ p1: { battlefield: ['kang-the-conqueror', ...n('island', 8)] } });
    const kang = g.id('p1', 'kang-the-conqueror');
    g.obj(kang).zoneTurn = 0;
    g.do({ type: 'activateAbility', player: 'p1', source: kang, abilityIndex: 0, targets: [] });
    settle(g);
    const turn = g.state.turn.number;
    g.passUntilStep('upkeep');
    expect(g.state.turn.number).toBe(turn + 1);
    expect(g.state.turn.activePlayer).toBe('p1');
    expect(g.state.turn.noPowerUp).toBe(true);
  });

  it('Bruce Banner draws X for {X}{X}', () => {
    const g = game({ p1: { battlefield: ['bruce-banner', ...n('island', 4)] } });
    const acts = g.legal().filter((a) => a.type === 'activateAbility' && a.abilityIndex === 0);
    expect(acts.map((a) => (a.type === 'activateAbility' ? (a.x ?? 0) : -1))).toEqual([0, 1, 2]);
    g.do(acts[2]!);
    settle(g);
    expect(handSize(g, 'p1')).toBe(2);
  });

  it('Elektra sneaks in by returning an unblocked attacker; she enters attacking', () => {
    const g = game({
      step: 'beginCombat',
      p1: {
        hand: ['elektra-daughter-of-the-hand'],
        battlefield: [...n('swamp', 3), 'agent-of-atlas'],
      },
    });
    const atlas = g.id('p1', 'agent-of-atlas');
    g.passBoth().attack(atlas);
    settle(g);
    g.passUntilStep('declareBlockers');
    if (g.decision.kind === 'declareBlockers') g.do({ type: 'confirmBlockers', player: 'p2' });
    const sneak = g.legal('p1').find((a) => a.type === 'castSpell' && a.sneak === atlas);
    expect(sneak).toBeDefined();
    g.do(sneak!);
    settle(g);
    const elektra = g.id('p1', 'elektra-daughter-of-the-hand');
    expect(g.zoneOf(atlas)).toBe('hand');
    expect(g.state.combat?.attackers.some((a) => a.id === elektra)).toBe(true);
    expect(g.obj(elektra).tapped).toBe(true);
  });

  it('Jennifer Walters stops the opponent casting spells during your turn', () => {
    const g = game({
      p1: { battlefield: ['jennifer-walters'] },
      p2: { hand: ['lightning-strike'], battlefield: n('mountain', 2) },
    });
    g.do({ type: 'passPriority', player: 'p1' });
    expect(g.legal('p2').some((a) => a.type === 'castSpell')).toBe(false);
  });

  it('Arc Reactor taps artifacts to help pay (improvise)', () => {
    const g = game({
      p1: {
        hand: ['arc-reactor'],
        battlefield: [...n('island', 3), 'aerial-doombot', 'ultron-drone'],
      },
    });
    expect(g.legal().some((a) => a.type === 'castSpell')).toBe(true);
    settle(cast(g, 'arc-reactor'));
    expect(g.obj(g.id('p1', 'ultron-drone')).tapped).toBe(true);
  });

  it('Leader, Super-Genius draws an extra card when a creature connives', () => {
    const g = game({
      p1: {
        hand: ['red-room-recruit'],
        battlefield: ['leader-super-genius', ...n('swamp', 2)],
        library: ['plains', 'plains', 'plains'],
      },
    });
    cast(g, 'red-room-recruit');
    settle(g);
    expect(handSize(g, 'p1')).toBe(2);
  });
});
