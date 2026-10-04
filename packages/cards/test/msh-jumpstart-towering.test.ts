import { describe, expect, it } from 'vitest';
import { cardDb, slug } from '../src/index.ts';
import { all, cast, game, handSize, n, pt, settle } from './blb-helpers.ts';

// Marvel Super Heroes Jumpstart: the Towering packet (docs/marvel-jumpstart.md).

const TOWERING = [
  'Reptil, Dinomorpher',
  'Stature, Young Avenger',
  'Goliath, Mass Manipulator',
  'Ms. Marvel, Elastic Ally',
  'Ant-Man, Reformed Rogue',
  'Atlas, Sizable Stooge',
  'Giant-Man, Gargantuan Genius',
  'Spider-Rex, Daring Dino',
  'Giant Growth',
  'Rapid Rescue',
  'Terrific Team-Up',
  'Colossal Collision',
  'Thriving Grove',
  'Forest',
];

const GOLIATH = slug('Goliath, Mass Manipulator');
const GIANT_MAN = slug('Giant-Man, Gargantuan Genius');
const REX = slug('Spider-Rex, Daring Dino');
const TEAM_UP = slug('Terrific Team-Up');

type G = ReturnType<typeof game>;
const target = (g: G, id: string) => ({ object: { id, zcc: g.obj(id).zcc } });
const canCast = (g: G, defId: string) =>
  g.legal().some((a) => a.type === 'castSpell' && a.card === g.id('p1', defId, 'hand'));

describe('Towering packet', () => {
  it('has every card implemented', () => {
    expect(TOWERING.filter((name) => !cardDb.has(slug(name)))).toEqual([]);
  });
});

describe('Goliath, Mass Manipulator', () => {
  it('power-up: two +1/+1 counters, then a card per creature with power 4 or greater', () => {
    const g = game({
      p1: {
        battlefield: [GOLIATH, GIANT_MAN, 'bear-cub', ...n('forest', 5)],
        library: n('forest', 5),
      },
    });
    const goliath = g.id('p1', GOLIATH);
    g.obj(goliath).zoneTurn = 0;
    expect(cardDb.get(GOLIATH)!.keywords).toContain('reach');
    settle(
      g.do({
        type: 'activateAbility',
        player: 'p1',
        source: goliath,
        abilityIndex: 0,
        targets: [],
      }),
    );
    expect(pt(g, goliath)).toEqual([4, 4]);
    // Goliath (now 4/4) and Giant-Man count; the bear doesn't.
    expect(handSize(g, 'p1')).toBe(2);
    expect(g.legal().some((a) => a.type === 'activateAbility' && a.source === goliath)).toBe(false);
  });
});

describe('Giant-Man, Gargantuan Genius', () => {
  it('adds {G} for each creature with power 4 or greater at your first main phase', () => {
    const g = game({
      step: 'draw',
      p1: { battlefield: [GIANT_MAN, REX, 'bear-cub'], library: n('forest', 3) },
    });
    g.passUntilStep('main1');
    settle(g);
    expect(g.state.players.p1.pool?.map((p) => p.produces.join())).toEqual(['G', 'G']);
  });
});

describe('Spider-Rex, Daring Dino', () => {
  it('is a 6/6 with reach, trample and ward', () => {
    const def = cardDb.get(REX)!;
    expect([def.power, def.toughness]).toEqual([6, 6]);
    expect(def.keywords).toEqual(expect.arrayContaining(['reach', 'trample', 'ward']));
    const g = game({ p1: { hand: [REX], battlefield: n('forest', 6) } });
    settle(cast(g, REX));
    expect(all(g, REX)).toHaveLength(1);
  });
});

describe('Terrific Team-Up', () => {
  it('costs {2} less with a permanent of mana value 4 or greater', () => {
    const without = game({
      p1: { hand: [TEAM_UP], battlefield: ['bear-cub', ...n('forest', 2)] },
      p2: { battlefield: ['bear-cub'] },
    });
    expect(canCast(without, TEAM_UP)).toBe(false);
    const withBig = game({
      p1: { hand: [TEAM_UP], battlefield: [GIANT_MAN, ...n('forest', 2)] },
      p2: { battlefield: ['bear-cub'] },
    });
    expect(canCast(withBig, TEAM_UP)).toBe(true);
  });

  it('two of your creatures get +1/+0 and each deal damage equal to their power', () => {
    const g = game({
      p1: { hand: [TEAM_UP], battlefield: ['bear-cub', 'bear-cub', ...n('forest', 4)] },
      p2: { battlefield: [GIANT_MAN] },
    });
    const [a, b] = all(g, 'bear-cub');
    const giant = g.id('p2', GIANT_MAN);
    settle(cast(g, TEAM_UP, [target(g, a!), target(g, giant), target(g, b!)]));
    expect(pt(g, a!)).toEqual([3, 2]);
    expect(pt(g, b!)).toEqual([3, 2]);
    expect(g.zoneOf(giant)).toBe('graveyard');
  });

  it('works with just one of your creatures', () => {
    const g = game({
      p1: { hand: [TEAM_UP], battlefield: ['bear-cub', ...n('forest', 4)] },
      p2: { battlefield: ['bear-cub'] },
    });
    const mine = g.id('p1', 'bear-cub');
    const theirs = g.id('p2', 'bear-cub');
    settle(cast(g, TEAM_UP, [target(g, mine), target(g, theirs)]));
    expect(pt(g, mine)).toEqual([3, 2]);
    expect(g.zoneOf(theirs)).toBe('graveyard');
  });
});
