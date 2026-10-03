import { getCharacteristics } from '@mtg/engine';
import { describe, expect, it } from 'vitest';
import { cardDb, slug } from '../src/index.ts';
import { all, cast, game, handSize, n, pt, settle } from './blb-helpers.ts';

// Marvel Super Heroes Jumpstart packet: Pym Particles.

const PACKET = [
  'Aerial Doombot',
  'Bold Biochemist',
  "Ant-Man's Air Force",
  'Ant-Man, Reformed Rogue',
  'Wasp, Shrinking Savior',
  'A.I.M. Scientists',
  'Giant-Sized Flying Ant',
  'Pym Particles',
  'Super Suit',
  'Quantum Reduction',
  'Depower',
  'Robotics Mastery',
  'Thriving Isle',
  'Island',
];

const keywords = (g: ReturnType<typeof game>, id: string) =>
  getCharacteristics(g.state, cardDb, id).keywords;

describe('Pym Particles packet', () => {
  it('has every card implemented', () => {
    expect(PACKET.filter((name) => !cardDb.has(slug(name)))).toEqual([]);
  });

  it("Ant-Man's Air Force gives a creature -1/-0 when it attacks", () => {
    const g = game({
      step: 'beginCombat',
      p1: { battlefield: ['ant-mans-air-force'] },
      p2: { battlefield: ['serra-angel'] },
    });
    const angel = g.id('p2', 'serra-angel');
    g.passBoth().attack(g.id('p1', 'ant-mans-air-force'));
    settle(g, (legal) =>
      legal.find(
        (a) =>
          a.type === 'chooseTargets' &&
          a.targets.some((t) => 'object' in t && t.object.id === angel),
      ),
    );
    expect(pt(g, angel)).toEqual([3, 4]);
    expect(keywords(g, g.id('p1', 'ant-mans-air-force')).has('flying')).toBe(true);
  });

  it('Ant-Man grows with green spells and shrinks past blockers with blue ones', () => {
    const g = game({
      p1: {
        hand: ['bear-cub', 'ant-mans-air-force'],
        battlefield: ['ant-man-reformed-rogue', ...n('forest', 2), ...n('island', 2)],
      },
    });
    const ant = g.id('p1', 'ant-man-reformed-rogue');
    settle(cast(g, 'bear-cub'));
    expect(pt(g, ant)).toEqual([3, 3]);
    expect(keywords(g, ant).has('trample')).toBe(true);
    settle(cast(g, 'ant-mans-air-force'));
    expect(pt(g, ant)).toEqual([2, 3]);
  });

  it("Ant-Man can't be blocked after a blue spell and draws on combat damage", () => {
    const g = game({
      p1: {
        hand: ['ant-mans-air-force'],
        battlefield: ['ant-man-reformed-rogue', ...n('island', 2)],
        library: n('island', 3),
      },
      p2: { battlefield: ['bear-cub'] },
    });
    const ant = g.id('p1', 'ant-man-reformed-rogue');
    settle(cast(g, 'ant-mans-air-force'));
    g.passUntilStep('beginCombat').passBoth().attack(ant);
    settle(g).passBoth();
    // The Bear Cub can't block it, so there is no blockers decision at all.
    expect(g.decision.kind).not.toBe('declareBlockers');
    const hand = handSize(g, 'p1');
    g.passUntilStep('end');
    expect(g.life('p2')).toBe(19);
    expect(handSize(g, 'p1')).toBe(hand + 1);
  });

  it('Wasp shrinks a creature until her next turn and draws for each negative power', () => {
    const g = game({
      step: 'beginCombat',
      p1: { battlefield: ['wasp-shrinking-savior'], library: n('island', 5) },
      p2: { battlefield: ['bear-cub'], library: n('forest', 5) },
    });
    const bear = g.id('p2', 'bear-cub');
    const hand = handSize(g, 'p1');
    g.passBoth().attack(g.id('p1', 'wasp-shrinking-savior'));
    settle(g);
    expect(pt(g, bear)).toEqual([-1, 2]);
    expect(handSize(g, 'p1')).toBe(hand + 1);
    // Still shrunk during the opponent's turn.
    g.passUntilStep('end');
    g.passUntilStep('main1');
    expect(g.state.turn.activePlayer).toBe('p2');
    expect(pt(g, bear)).toEqual([-1, 2]);
  });

  it('Wasp draws nothing when no creature has negative power', () => {
    const g = game({
      step: 'beginCombat',
      p1: { battlefield: ['wasp-shrinking-savior'], library: n('island', 5) },
      p2: { battlefield: ['serra-angel'] },
    });
    const hand = handSize(g, 'p1');
    g.passBoth().attack(g.id('p1', 'wasp-shrinking-savior'));
    settle(g);
    expect(pt(g, g.id('p2', 'serra-angel'))).toEqual([1, 4]);
    expect(handSize(g, 'p1')).toBe(hand);
  });

  it('Quantum Reduction: -5/-0 and loses all abilities', () => {
    const g = game({
      p1: { hand: ['quantum-reduction'], battlefield: n('island', 2) },
      p2: { battlefield: ['serra-angel'] },
    });
    const angel = g.id('p2', 'serra-angel');
    settle(cast(g, 'quantum-reduction', [g.ref(angel)]));
    expect(pt(g, angel)).toEqual([-1, 4]);
    expect(keywords(g, angel).has('flying')).toBe(false);
  });

  it('Quantum Reduction has flash only when cast using teamwork', () => {
    const g = game({
      step: 'beginCombat',
      p1: { hand: ['quantum-reduction'], battlefield: [...n('island', 2), 'bear-cub'] },
      p2: { battlefield: ['serra-angel'] },
    });
    const casts = g
      .legal()
      .filter((a) => a.type === 'castSpell' && g.obj(a.card).defId === 'quantum-reduction');
    expect(casts.length).toBeGreaterThan(0);
    expect(casts.every((a) => a.type === 'castSpell' && a.kicked)).toBe(true);
    const bear = g.id('p1', 'bear-cub');
    const angel = g.id('p2', 'serra-angel');
    settle(cast(g, 'quantum-reduction', [g.ref(angel)], { kicked: true, teamwork: [bear] }));
    expect(g.obj(bear).tapped).toBe(true);
    expect(pt(g, angel)).toEqual([-1, 4]);
  });

  it('Quantum Reduction without enough power to tap waits for the main phase', () => {
    const g = game({
      step: 'beginCombat',
      p1: { hand: ['quantum-reduction'], battlefield: n('island', 2) },
      p2: { battlefield: ['serra-angel'] },
    });
    expect(
      g.legal().some((a) => a.type === 'castSpell' && g.obj(a.card).defId === 'quantum-reduction'),
    ).toBe(false);
  });

  it('Robotics Mastery makes two flying Robots and gives +2/+2', () => {
    const g = game({
      step: 'beginCombat',
      p1: { hand: ['robotics-mastery'], battlefield: [...n('island', 5), 'bear-cub'] },
    });
    const bear = g.id('p1', 'bear-cub');
    // Flash: castable outside the main phase.
    settle(cast(g, 'robotics-mastery', [g.ref(bear)]));
    expect(pt(g, bear)).toEqual([4, 4]);
    const robots = all(g, 'robot-flying-token');
    expect(robots).toHaveLength(2);
    expect(pt(g, robots[0]!)).toEqual([1, 1]);
    expect(keywords(g, robots[0]!).has('flying')).toBe(true);
    expect(getCharacteristics(g.state, cardDb, robots[0]!).types).toContain('Artifact');
  });
});
