import { describe, expect, it } from 'vitest';
import { Game, scenario } from './helpers.ts';

describe('teamwork', () => {
  const casts = (g: Game) =>
    g
      .legal('p1')
      .filter((a) => a.type === 'castSpell' && a.card === g.id('p1', 'team-bolt', 'hand'));

  it('is offered only with enough untapped power', () => {
    const g = new Game(
      scenario({
        p1: { hand: ['team-bolt'], battlefield: ['mountain', 'bear'] },
        p2: { battlefield: ['wurm'] },
      }),
    );
    expect(casts(g).length).toBeGreaterThan(0);
    expect(casts(g).some((a) => a.type === 'castSpell' && a.kicked)).toBe(false);
  });

  it('taps creatures with total power N and improves the spell', () => {
    const g = new Game(
      scenario({
        p1: { hand: ['team-bolt'], battlefield: ['mountain', 'bear', 'elf', 'ogre'] },
        p2: { battlefield: ['ogre'] },
      }),
    );
    const target = g.id('p2', 'ogre');
    const bear = g.id('p1', 'bear');
    const elf = g.id('p1', 'elf');
    g.do({
      type: 'castSpell',
      player: 'p1',
      card: g.id('p1', 'team-bolt', 'hand'),
      targets: [g.ref(target)],
      kicked: true,
      teamwork: [bear, elf],
    });
    expect(g.obj(bear).tapped).toBe(true);
    expect(g.obj(elf).tapped).toBe(true);
    expect(g.obj(g.id('p1', 'ogre')).tapped).toBe(false);
    g.passBoth();
    expect(g.zoneOf(target)).toBe('graveyard');
  });

  it('rejects creatures without enough power', () => {
    const g = new Game(
      scenario({
        p1: { hand: ['team-bolt'], battlefield: ['mountain', 'bear', 'ogre'] },
        p2: { battlefield: ['ogre'] },
      }),
    );
    expect(() =>
      g.do({
        type: 'castSpell',
        player: 'p1',
        card: g.id('p1', 'team-bolt', 'hand'),
        targets: [g.ref(g.id('p2', 'ogre'))],
        kicked: true,
        teamwork: [g.id('p1', 'bear')],
      }),
    ).toThrow();
  });

  it('the engine picks when no creatures are given, and Maria Hill triggers', () => {
    const g = new Game(
      scenario({
        p1: { hand: ['team-bolt'], battlefield: ['mountain', 'maria', 'ogre'], library: ['ogre'] },
        p2: { battlefield: ['ogre'] },
      }),
    );
    const maria = g.id('p1', 'maria');
    g.do({
      type: 'castSpell',
      player: 'p1',
      card: g.id('p1', 'team-bolt', 'hand'),
      targets: [g.ref(g.id('p2', 'ogre'))],
      kicked: true,
    });
    // Maria Hill is tapped first (she wants to be); she alone isn't enough, so the ogre joins.
    expect(g.obj(maria).tapped).toBe(true);
    g.passBoth(); // her trigger
    expect(g.obj(maria).plusOneCounters).toBe(1);
    expect(g.state.players.p1.hand).toHaveLength(1);
  });
});
