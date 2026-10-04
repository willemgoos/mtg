import { type Action, getCharacteristics } from '@mtg/engine';
import { describe, expect, it } from 'vitest';
import { cardDb, slug } from '../src/index.ts';
import { cast, game, n, pt, settle } from './blb-helpers.ts';

// Marvel Super Heroes Jumpstart: the Battalion packet (docs/marvel-jumpstart.md).

const PACKET = [
  'General Thunderbolt Ross',
  'The Howling Commandos',
  'Wakandan Shield Guard',
  'Wild Pack Squad',
  'Falcon, Joaquin Torres',
  'War Machine, James Rhodes',
  'U.S.Agent, John Walker',
  'Captain America, Skybound',
  'Ultimate Alliance',
  'Helicarrier Strike',
  'Heroic Teamwork',
  'Fall to Earth',
  'Thriving Heath',
  'Plains',
];

const ROSS = slug('General Thunderbolt Ross');
const SQUAD = slug('Wild Pack Squad');
const FALCON = slug('Falcon, Joaquin Torres');
const WAR_MACHINE = slug('War Machine, James Rhodes');
const CAP = slug('Captain America, Skybound');

type G = ReturnType<typeof game>;

const keywords = (g: G, id: string) => new Set(getCharacteristics(g.state, cardDb, id).keywords);

/** Picks the trigger target `id` (or no target when undefined). */
const targetOf =
  (g: G, id?: string) =>
  (legal: Action[]): Action | undefined =>
    legal.find(
      (a) =>
        a.type === 'chooseTargets' &&
        (id === undefined
          ? a.targets.length === 0
          : a.targets.some((t) => 'object' in t && t.object.id === id)),
    );

/** A combat with `p1Battlefield`, moved on to declaring attackers. */
const combat = (p1Battlefield: string[], p2Battlefield: string[] = [], library: string[] = []) =>
  game({
    step: 'beginCombat',
    p1: { battlefield: p1Battlefield, library },
    p2: { battlefield: p2Battlefield },
  }).passBoth();

describe('Battalion packet', () => {
  it('has every card implemented', () => {
    expect(PACKET.filter((name) => !cardDb.has(slug(name)))).toEqual([]);
  });
});

describe('General Thunderbolt Ross', () => {
  it('has first strike; with two other attackers, attacking creatures get +1/+0', () => {
    const g = combat([ROSS, 'bear-cub', 'bear-cub', 'bear-cub']);
    const ross = g.id('p1', ROSS);
    const [b1, b2, b3] = g.state.battlefield.filter((id) => g.obj(id).defId === 'bear-cub');
    expect(keywords(g, ross).has('firstStrike')).toBe(true);
    settle(g.attack(ross, b1!, b2!));
    expect(pt(g, ross)).toEqual([2, 1]);
    expect(pt(g, b1!)).toEqual([3, 2]);
    expect(pt(g, b2!)).toEqual([3, 2]);
    // Not attacking: unchanged.
    expect(pt(g, b3!)).toEqual([2, 2]);
  });

  it("doesn't trigger with only one other attacker", () => {
    const g = combat([ROSS, 'bear-cub', 'bear-cub']);
    const ross = g.id('p1', ROSS);
    const bear = g.id('p1', 'bear-cub');
    settle(g.attack(ross, bear));
    expect(g.state.stack).toHaveLength(0);
    expect(pt(g, ross)).toEqual([1, 1]);
    expect(pt(g, bear)).toEqual([2, 2]);
  });

  it("doesn't trigger when three others attack without him", () => {
    const g = combat([ROSS, 'bear-cub', 'bear-cub', 'bear-cub']);
    const bears = g.state.battlefield.filter((id) => g.obj(id).defId === 'bear-cub');
    settle(g.attack(...bears));
    expect(bears.map((b) => pt(g, b))).toEqual([
      [2, 2],
      [2, 2],
      [2, 2],
    ]);
  });
});

describe('Wild Pack Squad', () => {
  it('at the beginning of combat on your turn, gives up to one target creature first strike and vigilance', () => {
    const g = game({ p1: { battlefield: [SQUAD, 'bear-cub'] }, p2: { battlefield: ['bear-cub'] } });
    const bear = g.id('p1', 'bear-cub');
    for (let i = 0; i < 10 && g.decision.kind === 'priority'; i++) g.pass();
    expect(g.decision.kind).toBe('chooseTriggerTargets');
    settle(g, targetOf(g, bear));
    expect(keywords(g, bear).has('firstStrike')).toBe(true);
    expect(keywords(g, bear).has('vigilance')).toBe(true);
    expect(keywords(g, g.id('p1', SQUAD)).has('firstStrike')).toBe(false);
    // Vigilance: it doesn't tap to attack.
    g.passBoth().attack(bear);
    expect(g.obj(bear).tapped).toBe(false);
  });

  it("may target an opponent's creature, or nothing", () => {
    const g = game({ p1: { battlefield: [SQUAD] }, p2: { battlefield: ['bear-cub'] } });
    const theirs = g.id('p2', 'bear-cub');
    for (let i = 0; i < 10 && g.decision.kind === 'priority'; i++) g.pass();
    const legal = g.legal();
    expect(targetOf(g, theirs)(legal)).toBeDefined();
    expect(targetOf(g)(legal)).toBeDefined();
    settle(g, targetOf(g));
    expect(keywords(g, theirs).has('firstStrike')).toBe(false);
  });

  it("doesn't trigger on the opponent's turn", () => {
    const g = game({
      active: 'p2',
      p1: { battlefield: [SQUAD] },
      p2: { battlefield: ['bear-cub'] },
    });
    for (let i = 0; i < 10 && g.state.turn.step !== 'declareAttackers'; i++) {
      expect(g.decision.kind).not.toBe('chooseTriggerTargets');
      g.pass();
    }
    expect(g.state.stack).toHaveLength(0);
  });
});

describe('Falcon, Joaquin Torres', () => {
  it('has flying and lifelink; battalion puts a +1/+1 counter on him and scries 1', () => {
    const g = combat([FALCON, 'bear-cub', 'bear-cub'], [], ['plains', 'island']);
    const falcon = g.id('p1', FALCON);
    expect(keywords(g, falcon).has('flying')).toBe(true);
    expect(keywords(g, falcon).has('lifelink')).toBe(true);
    const bears = g.state.battlefield.filter((id) => g.obj(id).defId === 'bear-cub');
    settle(g.attack(falcon, ...bears));
    expect(g.decision.kind).toBe('scry');
    const top = g.state.players.p1.library[0]!;
    settle(g.do({ type: 'scry', player: 'p1', top: [], bottom: [top] }));
    expect(g.obj(falcon).plusOneCounters).toBe(1);
    expect(pt(g, falcon)).toEqual([3, 3]);
    expect(g.state.players.p1.library.at(-1)).toBe(top);
  });

  it("doesn't trigger with one other attacker", () => {
    const g = combat([FALCON, 'bear-cub'], [], ['plains']);
    const falcon = g.id('p1', FALCON);
    settle(g.attack(falcon, g.id('p1', 'bear-cub')));
    expect(g.decision.kind).not.toBe('scry');
    expect(g.obj(falcon).plusOneCounters ?? 0).toBe(0);
  });
});

describe('War Machine, James Rhodes', () => {
  it('costs {3}{W/U}: castable with Islands, and has flying', () => {
    const g = game({ p1: { hand: [WAR_MACHINE], battlefield: n('island', 4) } });
    settle(cast(g, WAR_MACHINE));
    const wm = g.id('p1', WAR_MACHINE);
    expect(keywords(g, wm).has('flying')).toBe(true);
  });

  it('whenever he attacks, taps up to one target creature', () => {
    const g = combat([WAR_MACHINE], ['bear-cub']);
    const blocker = g.id('p2', 'bear-cub');
    g.attack(g.id('p1', WAR_MACHINE));
    expect(g.decision.kind).toBe('chooseTriggerTargets');
    settle(g, targetOf(g, blocker));
    expect(g.obj(blocker).tapped).toBe(true);
  });

  it('may choose no target', () => {
    const g = combat([WAR_MACHINE], ['bear-cub']);
    const blocker = g.id('p2', 'bear-cub');
    g.attack(g.id('p1', WAR_MACHINE));
    settle(g, targetOf(g));
    expect(g.obj(blocker).tapped).toBe(false);
  });
});

describe('Captain America, Skybound', () => {
  it('has flying and vigilance; battalion: a counter on each attacker, and they gain indestructible', () => {
    const g = combat([CAP, 'bear-cub', 'bear-cub', 'bear-cub'], ['bear-cub']);
    const cap = g.id('p1', CAP);
    expect(keywords(g, cap).has('flying')).toBe(true);
    expect(keywords(g, cap).has('vigilance')).toBe(true);
    const [b1, b2, b3] = g.state.battlefield.filter(
      (id) => g.obj(id).defId === 'bear-cub' && g.obj(id).controller === 'p1',
    );
    settle(g.attack(cap, b1!, b2!));
    for (const id of [cap, b1!, b2!]) {
      expect(g.obj(id).plusOneCounters).toBe(1);
      expect(keywords(g, id).has('indestructible')).toBe(true);
    }
    expect(pt(g, cap)).toEqual([4, 6]);
    // Not attacking: no counter, no indestructible; the opponent's creature neither.
    const theirs = g.id('p2', 'bear-cub');
    for (const id of [b3!, theirs]) {
      expect(g.obj(id).plusOneCounters ?? 0).toBe(0);
      expect(keywords(g, id).has('indestructible')).toBe(false);
    }
  });

  it("doesn't trigger with one other attacker", () => {
    const g = combat([CAP, 'bear-cub']);
    const cap = g.id('p1', CAP);
    settle(g.attack(cap, g.id('p1', 'bear-cub')));
    expect(g.obj(cap).plusOneCounters ?? 0).toBe(0);
    expect(keywords(g, cap).has('indestructible')).toBe(false);
  });
});
