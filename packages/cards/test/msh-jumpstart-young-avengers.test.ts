import { getCharacteristics } from '@mtg/engine';
import { describe, expect, it } from 'vitest';
import { cardDb, slug } from '../src/index.ts';
import { all, cast, game, n, pt, settle } from './blb-helpers.ts';

// Marvel Super Heroes Jumpstart packet: Young Avengers.

const PACKET = [
  'Stature, Young Avenger',
  'Speed, Young Avenger',
  'Patriot, Young Avenger',
  'Iron Lad, Young Avenger',
  'Wiccan, Young Avenger',
  'Hawkeye, Young Avenger',
  'Hulkling, Young Avenger',
  "Hawkeye's Bow",
  'Team Tactics',
  'Lightning Strike',
  'Crossover Collaboration',
  'Marvelous Melee',
  'Thriving Bluff',
  'Mountain',
];

type G = ReturnType<typeof game>;
const chars = (g: G, id: string) => getCharacteristics(g.state, cardDb, id);
const p2 = { player: 'p2' as const };

/** Equips Hawkeye's Bow (equip is its third ability) to a creature. */
const equipBow = (g: G, to: string) =>
  settle(
    g.do({
      type: 'activateAbility',
      player: 'p1',
      source: g.id('p1', 'hawkeyes-bow'),
      abilityIndex: 2,
      targets: [g.ref(to)],
    }),
  );

describe('Young Avengers packet', () => {
  it('has every card implemented', () => {
    expect(PACKET.filter((name) => !cardDb.has(slug(name)))).toEqual([]);
  });

  it('Stature has base power and toughness 4/4 after a noncreature spell', () => {
    const g = game({
      p1: { hand: ['shock'], battlefield: ['stature-young-avenger', 'mountain'] },
    });
    const stature = g.id('p1', 'stature-young-avenger');
    expect(pt(g, stature)).toEqual([2, 2]);
    expect(chars(g, stature).keywords.has('reach')).toBe(true);
    settle(cast(g, 'shock', [p2]));
    expect(pt(g, stature)).toEqual([4, 4]);
    g.passUntilStep('end');
    g.passUntilStep('main1');
    expect(pt(g, stature)).toEqual([2, 2]);
  });

  it('Patriot has prowess, and pumps the others while equipped', () => {
    const g = game({
      p1: {
        hand: ['shock'],
        battlefield: ['patriot-young-avenger', 'hawkeyes-bow', 'bear-cub', ...n('mountain', 2)],
      },
    });
    const patriot = g.id('p1', 'patriot-young-avenger');
    const bear = g.id('p1', 'bear-cub');
    expect(pt(g, bear)).toEqual([2, 2]);
    equipBow(g, patriot);
    expect(pt(g, bear)).toEqual([3, 2]);
    expect(pt(g, patriot)).toEqual([4, 2]);
    settle(cast(g, 'shock', [p2]));
    expect(pt(g, patriot)).toEqual([5, 3]);
    expect(pt(g, bear)).toEqual([3, 2]);
  });

  it('Iron Lad makes noncreature spells cost {1} less, but not creature spells', () => {
    const g = game({
      p1: {
        hand: ['crossover-collaboration', 'hulkling-young-avenger'],
        battlefield: ['iron-lad-young-avenger', ...n('mountain', 2)],
        library: n('mountain', 3),
      },
    });
    expect(chars(g, g.id('p1', 'iron-lad-young-avenger')).keywords.has('flying')).toBe(true);
    const castable = (defId: string) =>
      g.legal().some((a) => a.type === 'castSpell' && a.card === g.id('p1', defId, 'hand'));
    expect(castable('crossover-collaboration')).toBe(true);
    expect(castable('hulkling-young-avenger')).toBe(false);
    settle(cast(g, 'crossover-collaboration'));
    expect(g.state.players.p1.exile).toHaveLength(2);
  });

  it('Hulkling becomes a 4/4 flying copy, keeps his ability, and turns back at end of turn', () => {
    const g = game({
      p1: {
        hand: n('shock', 2),
        battlefield: ['hulkling-young-avenger', ...n('mountain', 2)],
      },
      p2: { battlefield: ['serra-angel', 'bear-cub'] },
    });
    const hulk = g.id('p1', 'hulkling-young-avenger');
    const angel = g.id('p2', 'serra-angel');
    const bear = g.id('p2', 'bear-cub');
    const targeting = (id: string) => (legal: ReturnType<G['legal']>) =>
      legal.find(
        (a) =>
          a.type === 'chooseTargets' && a.targets.some((t) => 'object' in t && t.object.id === id),
      );
    settle(cast(g, 'shock', [p2]), targeting(angel));
    expect(g.obj(hulk).defId).toBe('serra-angel');
    expect(pt(g, hulk)).toEqual([4, 4]);
    expect(chars(g, hulk).keywords.has('vigilance')).toBe(true);
    expect(chars(g, hulk).keywords.has('flying')).toBe(true);
    // He still has his ability: a second noncreature spell copies the bear instead.
    settle(cast(g, 'shock', [p2]), targeting(bear));
    expect(g.obj(hulk).defId).toBe('bear-cub');
    expect(pt(g, hulk)).toEqual([4, 4]);
    expect(chars(g, hulk).keywords.has('flying')).toBe(true);
    g.passUntilStep('end');
    g.passUntilStep('main1');
    expect(g.obj(hulk).defId).toBe('hulkling-young-avenger');
    expect(pt(g, hulk)).toEqual([4, 4]);
  });

  it("Hawkeye's Bow: +1/+0 and reach; the equipped creature pings each opponent as it taps", () => {
    const g = game({
      p1: { battlefield: ['hawkeyes-bow', 'bear-cub', 'mountain'] },
    });
    const bear = g.id('p1', 'bear-cub');
    equipBow(g, bear);
    expect(pt(g, bear)).toEqual([3, 2]);
    expect(chars(g, bear).keywords.has('reach')).toBe(true);
    g.passUntilStep('beginCombat').passBoth().attack(bear);
    settle(g);
    expect(g.life('p2')).toBe(19);
    g.passUntilStep('end');
    expect(g.life('p2')).toBe(16);
  });

  it('Crossover Collaboration exiles two playable cards, and makes a Treasure with teamwork', () => {
    const g = game({
      p1: {
        hand: n('crossover-collaboration', 2),
        battlefield: ['bear-cub', ...n('mountain', 6)],
        library: n('mountain', 5),
      },
    });
    settle(cast(g, 'crossover-collaboration'));
    const exiled = g.state.players.p1.exile;
    expect(exiled).toHaveLength(2);
    expect(g.obj(exiled[0]!).playableUntilTurn).toBe(g.state.turn.number + 2);
    expect(all(g, 'treasure-token')).toHaveLength(0);
    const bear = g.id('p1', 'bear-cub');
    settle(cast(g, 'crossover-collaboration', [], { kicked: true, teamwork: [bear] }));
    expect(g.obj(bear).tapped).toBe(true);
    expect(g.state.players.p1.exile).toHaveLength(4);
    expect(all(g, 'treasure-token')).toHaveLength(1);
  });
});
