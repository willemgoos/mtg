import { getCharacteristics } from '@mtg/engine';
import { describe, expect, it } from 'vitest';
import { cardDb } from '../src/index.ts';
import { all, cast, game, handSize, n, pt, settle } from './blb-helpers.ts';

// Marvel Super Heroes Jumpstart packet: Agents of S.H.I.E.L.D.

const keywords = (g: ReturnType<typeof game>, id: string) =>
  getCharacteristics(g.state, cardDb, id).keywords;

describe('Agents of S.H.I.E.L.D. packet', () => {
  it('has every card implemented', () => {
    for (const id of [
      'agent-phil-coulson',
      'peggy-carter-secret-agent',
      'agent-13-sharon-carter',
      'agents-of-s-h-i-e-l-d',
      'quake-agent-of-s-h-i-e-l-d',
      's-h-i-e-l-d-helicarrier',
      'borough-backup',
      'nick-fury-spymaster',
      's-h-i-e-l-d-spy-kit',
      'helicarrier-strike',
      'strategic-intervention',
      'web-up',
      'thriving-heath',
      'plains',
    ])
      expect(cardDb.get(id), id).toBeDefined();
  });

  it('Peggy Carter makes a lone attacker indestructible', () => {
    const g = game({
      step: 'beginCombat',
      p1: { battlefield: ['peggy-carter-secret-agent', 'bear-cub'] },
    });
    const bear = g.id('p1', 'bear-cub');
    g.passBoth().attack(bear);
    settle(g);
    expect(keywords(g, bear).has('indestructible')).toBe(true);
    expect(keywords(g, g.id('p1', 'peggy-carter-secret-agent')).has('indestructible')).toBe(false);
  });

  it('Peggy Carter does nothing when two creatures attack', () => {
    const g = game({
      step: 'beginCombat',
      p1: { battlefield: ['peggy-carter-secret-agent', 'bear-cub'] },
    });
    const bear = g.id('p1', 'bear-cub');
    g.passBoth().attack(bear, g.id('p1', 'peggy-carter-secret-agent'));
    settle(g);
    expect(keywords(g, bear).has('indestructible')).toBe(false);
  });

  it('S.H.I.E.L.D. Helicarrier makes two Soldiers and crews 6 into a flier', () => {
    const g = game({
      p1: {
        hand: ['s-h-i-e-l-d-helicarrier'],
        battlefield: [...n('plains', 4), 'serra-angel', 'bear-cub'],
      },
    });
    cast(g, 's-h-i-e-l-d-helicarrier');
    settle(g);
    expect(all(g, 'soldier-token')).toHaveLength(2);
    const ship = g.id('p1', 's-h-i-e-l-d-helicarrier');
    expect(keywords(g, ship).has('flying')).toBe(true);
    expect(getCharacteristics(g.state, cardDb, ship).types).not.toContain('Creature');
    const crew = g.legal().find((a) => a.type === 'activateAbility' && a.source === ship);
    expect(crew).toBeDefined();
    g.do(crew!);
    settle(g);
    expect(getCharacteristics(g.state, cardDb, ship).types).toContain('Creature');
    expect(pt(g, ship)).toEqual([4, 5]);
  });

  it('Nick Fury draws, then puts a small creature onto the battlefield attacking and indestructible', () => {
    const g = game({
      step: 'beginCombat',
      p1: {
        hand: ['bear-cub', 'serra-angel'],
        battlefield: ['nick-fury-spymaster'],
        library: n('plains', 3),
      },
    });
    const fury = g.id('p1', 'nick-fury-spymaster');
    const bear = g.id('p1', 'bear-cub', 'hand');
    g.passBoth().attack(fury);
    settle(g);
    expect(g.decision.kind).toBe('searchLibrary');
    const options = g.legal().flatMap((a) => (a.type === 'chooseCard' && a.card ? [a.card] : []));
    // Serra Angel costs 5: not an option.
    expect(options).toEqual([bear]);
    g.do({ type: 'chooseCard', player: 'p1', card: bear });
    settle(g);
    expect(g.zoneOf(bear)).toBe('battlefield');
    expect(g.obj(bear).tapped).toBe(true);
    expect(g.state.combat?.attackers.map((a) => a.id)).toContain(bear);
    expect(keywords(g, bear).has('indestructible')).toBe(true);
    // Drew a card: hand was 2, one drawn, one put onto the battlefield.
    expect(handSize(g, 'p1')).toBe(2);
  });

  it('Nick Fury: the creature can be left in hand', () => {
    const g = game({
      step: 'beginCombat',
      p1: { hand: ['bear-cub'], battlefield: ['nick-fury-spymaster'], library: n('plains', 3) },
    });
    const bear = g.id('p1', 'bear-cub', 'hand');
    g.passBoth().attack(g.id('p1', 'nick-fury-spymaster'));
    settle(g);
    g.do({ type: 'chooseCard', player: 'p1', card: null });
    settle(g);
    expect(g.zoneOf(bear)).toBe('hand');
    expect(handSize(g, 'p1')).toBe(2);
  });

  it('Strategic Intervention pumps the lone attacker and taps a defending creature', () => {
    const g = game({
      step: 'beginCombat',
      p1: { battlefield: ['strategic-intervention', 'bear-cub'] },
      p2: { battlefield: ['serra-angel'] },
    });
    const bear = g.id('p1', 'bear-cub');
    const angel = g.id('p2', 'serra-angel');
    g.passBoth().attack(bear);
    // One trigger.
    expect(g.decision.kind).toBe('chooseTriggerTargets');
    g.do({ type: 'chooseTargets', player: 'p1', targets: [g.ref(angel)] });
    expect(g.state.stack).toHaveLength(1);
    expect(g.state.pendingTriggers).toHaveLength(0);
    settle(g);
    expect(pt(g, bear)).toEqual([3, 3]);
    expect(g.obj(angel).tapped).toBe(true);
  });

  it('Strategic Intervention still pumps when no creature is chosen to tap', () => {
    const g = game({
      step: 'beginCombat',
      p1: { battlefield: ['strategic-intervention', 'bear-cub'] },
      p2: { battlefield: ['serra-angel'] },
    });
    const bear = g.id('p1', 'bear-cub');
    g.passBoth().attack(bear);
    g.do({ type: 'chooseTargets', player: 'p1', targets: [] });
    settle(g);
    expect(pt(g, bear)).toEqual([3, 3]);
    expect(g.obj(g.id('p2', 'serra-angel')).tapped).toBe(false);
  });

  it('Strategic Intervention still pumps with no creature to tap', () => {
    const g = game({
      step: 'beginCombat',
      p1: { battlefield: ['strategic-intervention', 'bear-cub'] },
    });
    const bear = g.id('p1', 'bear-cub');
    g.passBoth().attack(bear);
    settle(g);
    expect(pt(g, bear)).toEqual([3, 3]);
  });
});
