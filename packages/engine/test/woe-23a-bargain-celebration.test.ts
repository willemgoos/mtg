import { describe, expect, it } from 'vitest';
import {
  asToken,
  castAt,
  casts,
  Game,
  getPower,
  getToughness,
  onField,
  ROLES,
  scenario,
  settle,
  toAttackers,
} from './woe-fixtures.ts';

// Wilds of Eldraine (23a): bargain (an optional sacrifice as the spell is cast) and celebration.

const lands = (land: string, n: number) => Array<string>(n).fill(land);

describe('Bargain', () => {
  it('the cast menu offers the normal cast and one bargained cast per artifact, enchantment or token', () => {
    const g = new Game(
      scenario({
        p1: {
          hand: ['w-grapple'],
          battlefield: [...lands('swamp', 2), 'w-trinket', 'w-charm', 'w-food', 'bear'],
        },
        p2: { battlefield: ['ogre'] },
      }),
    );
    asToken(g, g.id('p1', 'w-food'));
    const ogre = g.id('p2', 'ogre');
    const all = casts(g, 'p1', g.id('p1', 'w-grapple', 'hand')).filter(
      (a) => a.targets[0] && 'object' in a.targets[0] && a.targets[0].object.id === ogre,
    );
    expect(all.filter((a) => !a.kicked)).toHaveLength(1);
    const sacs = all.filter((a) => a.kicked).map((a) => a.sacrifice);
    // The artifact, the enchantment and the token; not the nontoken creature or a land.
    expect(sacs.sort()).toEqual(
      [g.id('p1', 'w-trinket'), g.id('p1', 'w-charm'), g.id('p1', 'w-food')].sort(),
    );
  });

  it('nothing to sacrifice: only the normal cast', () => {
    const g = new Game(
      scenario({
        p1: { hand: ['w-grapple'], battlefield: [...lands('swamp', 2), 'bear'] },
        p2: { battlefield: ['ogre'] },
      }),
    );
    expect(casts(g, 'p1', g.id('p1', 'w-grapple', 'hand')).some((a) => a.kicked)).toBe(false);
  });

  it('"if this spell was bargained": -5/-5 bargained (the Food is sacrificed), -3/-3 otherwise', () => {
    const g = new Game(
      scenario({
        p1: { hand: ['w-grapple'], battlefield: [...lands('swamp', 2), 'w-food'] },
        p2: { battlefield: ['wurm'] },
      }),
    );
    const food = g.id('p1', 'w-food');
    asToken(g, food);
    const wurm = g.id('p2', 'wurm');
    castAt(g, 'p1', 'w-grapple', [wurm], (a) => !!a.kicked && a.sacrifice === food);
    expect(g.zoneOf(food)).not.toBe('battlefield');
    settle(g);
    expect(getPower(g, wurm)).toBe(2);

    const h = new Game(
      scenario({
        p1: { hand: ['w-grapple'], battlefield: [...lands('swamp', 2), 'w-food'] },
        p2: { battlefield: ['wurm'] },
      }),
    );
    castAt(h, 'p1', 'w-grapple', [h.id('p2', 'wurm')], (a) => !a.kicked);
    settle(h);
    expect(getPower(h, h.id('p2', 'wurm'))).toBe(4);
    expect(onField(h, 'w-food')).toHaveLength(1);
  });

  it('"this spell costs {2} less to cast if it\'s bargained": with five lands only the bargained cast is there', () => {
    const g = new Game(
      scenario({ p1: { hand: ['w-glutton'], battlefield: [...lands('forest', 5), 'w-trinket'] } }),
    );
    const all = casts(g, 'p1', g.id('p1', 'w-glutton', 'hand'));
    expect(all.length).toBeGreaterThan(0);
    expect(all.every((a) => a.kicked && a.sacrifice === g.id('p1', 'w-trinket'))).toBe(true);
    g.do(all[0]!);
    settle(g);
    expect(onField(g, 'w-glutton')).toHaveLength(1);
    expect(g.life('p1')).toBe(23);
  });

  it('"when this creature enters, if it was bargained": the permanent remembers', () => {
    const g = new Game(
      scenario({ p1: { hand: ['w-negotiator'], battlefield: [...lands('swamp', 5), 'w-charm'] } }),
    );
    castAt(g, 'p1', 'w-negotiator', [], (a) => !!a.kicked);
    settle(g);
    expect(g.life('p2')).toBe(17);
    expect(g.life('p1')).toBe(23);

    const h = new Game(
      scenario({ p1: { hand: ['w-negotiator'], battlefield: [...lands('swamp', 5), 'w-charm'] } }),
    );
    castAt(h, 'p1', 'w-negotiator', [], (a) => !a.kicked);
    settle(h);
    expect(h.life('p2')).toBe(20);
    expect(onField(h, 'w-charm')).toHaveLength(1);
  });

  it('a Role is a token and an enchantment: bargaining it away is a Wicked Role going to the graveyard', () => {
    const g = new Game(
      scenario({
        p1: { hand: ['w-wicked-role', 'w-grapple'], battlefield: [...lands('swamp', 3), 'bear'] },
        p2: { battlefield: ['ogre'] },
      }),
    );
    castAt(g, 'p1', 'w-wicked-role', [g.id('p1', 'bear')]);
    settle(g);
    const role = onField(g, ROLES.wicked)[0]!;
    castAt(g, 'p1', 'w-grapple', [g.id('p2', 'ogre')], (a) => a.sacrifice === role);
    settle(g);
    expect(g.life('p2')).toBe(19);
    expect(g.zoneOf(g.id('p2', 'ogre', 'graveyard'))).toBe('graveyard');
  });
});

describe('Celebration', () => {
  it('two nonland permanents entering under your control this turn turn it on (tokens count, lands do not)', () => {
    const g = new Game(
      scenario({
        p1: {
          hand: ['w-trinket', 'plains', 'w-guard-change'],
          battlefield: ['w-mice', 'forest', 'forest'],
        },
      }),
    );
    const mice = g.id('p1', 'w-mice');
    expect(getToughness(g, mice)).toBe(1);
    g.do({ type: 'playLand', player: 'p1', card: g.id('p1', 'plains', 'hand') });
    castAt(g, 'p1', 'w-trinket');
    settle(g);
    // A land and one nonland permanent: not yet.
    expect(getToughness(g, mice)).toBe(1);
    // A Role token is a second nonland permanent.
    castAt(g, 'p1', 'w-guard-change', [mice]);
    settle(g);
    expect(getToughness(g, mice)).toBe(1 + 1 + 2);
  });

  it("the opponent's permanents don't count, and it is over the next turn", () => {
    const g = new Game(
      scenario({
        p1: { hand: ['w-trinket', 'w-charm'], battlefield: ['w-mice', 'forest', 'forest'] },
        p2: { battlefield: ['ogre'] },
      }),
    );
    const mice = g.id('p1', 'w-mice');
    g.state.turn.nonlandEntered = { p2: 5 };
    expect(getToughness(g, mice)).toBe(1);
    castAt(g, 'p1', 'w-trinket');
    settle(g);
    castAt(g, 'p1', 'w-charm');
    settle(g);
    expect(getToughness(g, mice)).toBe(3);
    g.passUntilStep('end');
    g.passBoth();
    g.passUntilStep('upkeep');
    expect(g.state.turn.activePlayer).toBe('p2');
    expect(getToughness(g, mice)).toBe(1);
  });

  it('at the beginning of combat, if celebrating: Pests of Honor gets its counter', () => {
    const g = new Game(
      scenario({
        p1: { hand: ['w-trinket', 'w-charm'], battlefield: ['w-pests', 'forest', 'forest'] },
      }),
    );
    castAt(g, 'p1', 'w-trinket');
    settle(g);
    castAt(g, 'p1', 'w-charm');
    settle(g);
    g.passBoth(); // to beginning of combat: the trigger
    settle(g);
    expect(g.obj(g.id('p1', 'w-pests')).plusOneCounters).toBe(1);
  });

  it('no celebration: no beginning-of-combat counter', () => {
    const g = new Game(
      scenario({ p1: { hand: ['w-trinket'], battlefield: ['w-pests', 'forest'] } }),
    );
    castAt(g, 'p1', 'w-trinket');
    settle(g);
    g.passBoth();
    settle(g);
    expect(g.obj(g.id('p1', 'w-pests')).plusOneCounters).toBe(0);
  });

  it('Ash, Party Crasher: whenever it attacks, if celebrating, a +1/+1 counter', () => {
    const g = new Game(
      scenario({
        p1: { hand: ['w-trinket', 'w-charm'], battlefield: ['w-ash', 'forest', 'forest'] },
      }),
    );
    castAt(g, 'p1', 'w-trinket');
    settle(g);
    castAt(g, 'p1', 'w-charm');
    settle(g);
    toAttackers(g);
    g.attack(g.id('p1', 'w-ash'));
    settle(g);
    expect(g.obj(g.id('p1', 'w-ash')).plusOneCounters).toBe(1);
  });
});
