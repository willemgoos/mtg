import type { Action } from '@mtg/engine';
import { describe, expect, it } from 'vitest';
import { cardDb, slug } from '../src/index.ts';
import { cast, game, n, pt, settle } from './blb-helpers.ts';

// Marvel Super Heroes Jumpstart: the Blink packet (docs/marvel-jumpstart.md).

const PACKET = [
  "Shi'ar Soldier",
  'Mob Lookout',
  'Imperial Cosmographer',
  'S.H.I.E.L.D. Deployment Drone',
  'Justice, Vance Astrovik',
  'Victor Timely, Wily Tycoon',
  'Shipwreck Patrol',
  'Silver Surfer, Cosmic Voyager',
  'Spaceshift',
  'We Say Thee Nay!',
  "Collector's Case",
  'Dismissive Denial',
  'Thriving Isle',
  'Island',
];

const SOLDIER = slug("Shi'ar Soldier");
const COSMOGRAPHER = slug('Imperial Cosmographer');
const SURFER = slug('Silver Surfer, Cosmic Voyager');
const SPACESHIFT = slug('Spaceshift');
const CASE = slug("Collector's Case");

type G = ReturnType<typeof game>;

const activate = (g: G, source: string, targets: string[] = []) =>
  g.do({
    type: 'activateAbility',
    player: g.actor,
    source,
    abilityIndex: 0,
    targets: targets.map((id) => g.ref(id)),
  });

const targetIds = (a: Action) =>
  a.type === 'chooseTargets' ? a.targets.flatMap((t) => ('object' in t ? [t.object.id] : [])) : [];

describe('Blink packet', () => {
  it('has every card implemented', () => {
    expect(PACKET.filter((name) => !cardDb.has(slug(name)))).toEqual([]);
  });
});

describe("Shi'ar Soldier", () => {
  it('has flying and returns another permanent you control to its owner’s hand', () => {
    expect(cardDb.get(SOLDIER)!.keywords).toContain('flying');
    const g = game({ p1: { battlefield: [SOLDIER, 'bear-cub', 'island'] } });
    const soldier = g.id('p1', SOLDIER);
    const bears = g.id('p1', 'bear-cub');
    const legal = g.legal().filter((a) => a.type === 'activateAbility' && a.source === soldier);
    const targets = legal.flatMap((a) =>
      a.type === 'activateAbility' ? a.targets.map((t) => ('object' in t ? t.object.id : '')) : [],
    );
    // Another permanent you control: the bear and the Island, not itself.
    expect(targets).toContain(bears);
    expect(targets).toContain(g.id('p1', 'island'));
    expect(targets).not.toContain(soldier);
    activate(g, soldier, [bears]);
    settle(g);
    expect(g.state.players.p1.hand.map((id) => g.obj(id).defId)).toContain('bear-cub');
    expect(g.obj(soldier).tapped).toBe(true);
  });

  it("can't target an opponent's permanent", () => {
    const g = game({ p1: { battlefield: [SOLDIER, 'island'] }, p2: { battlefield: ['bear-cub'] } });
    const soldier = g.id('p1', SOLDIER);
    const bears = g.id('p2', 'bear-cub');
    const offered = g
      .legal()
      .some(
        (a) =>
          a.type === 'activateAbility' &&
          a.source === soldier &&
          a.targets.some((t) => 'object' in t && t.object.id === bears),
      );
    expect(offered).toBe(false);
  });

  it('can only be activated during your turn', () => {
    const g = game({
      active: 'p2',
      p1: { battlefield: [SOLDIER, 'bear-cub', 'island'] },
    });
    const soldier = g.id('p1', SOLDIER);
    g.pass(); // p2 passes priority to p1
    expect(g.actor).toBe('p1');
    expect(g.legal('p1').some((a) => a.type === 'activateAbility' && a.source === soldier)).toBe(
      false,
    );
  });
});

describe('Imperial Cosmographer', () => {
  it('has vigilance and grows when another creature you control leaves without dying', () => {
    expect(cardDb.get(COSMOGRAPHER)!.keywords).toContain('vigilance');
    const g = game({ p1: { battlefield: [COSMOGRAPHER, SOLDIER, 'bear-cub', 'island'] } });
    const cosmo = g.id('p1', COSMOGRAPHER);
    activate(g, g.id('p1', SOLDIER), [g.id('p1', 'bear-cub')]);
    settle(g);
    expect(g.obj(cosmo).plusOneCounters).toBe(2);
    expect(pt(g, cosmo)).toEqual([4, 5]);
  });

  it("doesn't grow when a creature dies, or for a noncreature or an opponent's creature", () => {
    const g = game({
      p1: {
        hand: ['shock', SPACESHIFT],
        battlefield: [COSMOGRAPHER, SOLDIER, 'bear-cub', ...n('island', 4), 'mountain'],
      },
      p2: { battlefield: ['bear-cub'] },
    });
    const cosmo = g.id('p1', COSMOGRAPHER);
    // An Island bounced: not a creature.
    activate(g, g.id('p1', SOLDIER), [g.id('p1', 'island')]);
    settle(g);
    expect(g.obj(cosmo).plusOneCounters).toBe(0);
    // An opponent's creature exiled and returned.
    cast(g, SPACESHIFT, [g.ref(g.id('p2', 'bear-cub'))]);
    settle(g);
    expect(g.obj(cosmo).plusOneCounters).toBe(0);
    // Its own bear dies: no counters.
    const bears = g.id('p1', 'bear-cub');
    cast(g, 'shock', [g.ref(bears)]);
    settle(g);
    expect(g.zoneOf(bears)).toBe('graveyard');
    expect(g.obj(cosmo).plusOneCounters).toBe(0);
  });
});

describe('Silver Surfer, Cosmic Voyager', () => {
  it('has flash and flying', () => {
    const kw = cardDb.get(SURFER)!.keywords;
    expect(kw).toContain('flash');
    expect(kw).toContain('flying');
  });

  it('exiles any number of other permanents you control, picked one at a time, and returns them at the next end step', () => {
    const g = game({
      p1: {
        hand: [SURFER],
        battlefield: [COSMOGRAPHER, 'bear-cub', 'treasure-token', ...n('island', 7)],
      },
      p2: { battlefield: ['bear-cub'] },
    });
    const cosmo = g.id('p1', COSMOGRAPHER);
    const bears = g.id('p1', 'bear-cub');
    const token = g.id('p1', 'treasure-token');
    g.obj(token).isToken = true;
    cast(g, SURFER);
    g.pass().pass();
    expect(g.decision.kind).toBe('chooseTriggerTargets');
    const surfer = g.id('p1', SURFER);
    const islands = g.state.battlefield.filter((id) => g.obj(id).defId === 'island');
    const untapped = islands.find((id) => !g.obj(id).tapped)!;
    expect(untapped).toBeDefined();
    // One option per permanent (plus "done"), not every subset.
    let legal = g.legal();
    expect(legal[0]).toMatchObject({ type: 'chooseTargets', targets: [] });
    expect(legal.length).toBe(1 + 10);
    const offered = legal.flatMap(targetIds);
    expect(offered).not.toContain(surfer);
    expect(offered).not.toContain(g.id('p2', 'bear-cub'));
    for (const pick of [bears, untapped, token, cosmo]) {
      legal = g.legal();
      g.do(legal.find((a) => targetIds(a).at(-1) === pick)!);
    }
    // The ones picked aren't offered again.
    legal = g.legal();
    expect(legal.length).toBe(1 + 6);
    expect(legal.flatMap((a) => targetIds(a).slice(4))).not.toContain(bears);
    g.do(legal[0]!); // done
    settle(g);
    expect(g.zoneOf(bears)).toBe('exile');
    expect(g.zoneOf(untapped)).toBe('exile');
    expect(g.zoneOf(cosmo)).toBe('exile');
    // A token ceases to exist.
    expect(g.zoneOf(token)).toBe('gone');
    g.passUntilStep('end');
    settle(g);
    expect(g.zoneOf(bears)).toBe('battlefield');
    expect(g.zoneOf(cosmo)).toBe('battlefield');
    expect(g.zoneOf(untapped)).toBe('battlefield');
    // A land returns tapped; a creature doesn't.
    expect(g.obj(untapped).tapped).toBe(true);
    expect(g.obj(bears).tapped).toBe(false);
    expect(g.obj(bears).controller).toBe('p1');
  });

  it('can choose no targets', () => {
    const g = game({ p1: { hand: [SURFER], battlefield: ['bear-cub', ...n('island', 6)] } });
    cast(g, SURFER);
    g.pass().pass();
    g.do(g.legal()[0]!);
    settle(g);
    expect(g.zoneOf(g.id('p1', 'bear-cub'))).toBe('battlefield');
    expect(g.state.stack.length).toBe(0);
  });

  it('still exiles its other targets when one of them became illegal', () => {
    const g = game({
      p1: { hand: [SURFER, SPACESHIFT], battlefield: ['bear-cub', ...n('island', 9)] },
    });
    const bears = g.id('p1', 'bear-cub');
    cast(g, SURFER);
    g.pass().pass();
    const land = g.state.battlefield.find(
      (id) => g.obj(id).defId === 'island' && !g.obj(id).tapped,
    )!;
    g.do(g.legal().find((a) => targetIds(a).at(-1) === bears)!);
    g.do(g.legal().find((a) => targetIds(a).at(-1) === land)!);
    g.do(g.legal()[0]!);
    expect(g.state.stack).toHaveLength(1);
    // In response, the bear is blinked: a new object, no longer a legal target.
    cast(g, SPACESHIFT, [g.ref(bears)]);
    g.pass().pass();
    expect(g.obj(bears).plusOneCounters).toBe(1);
    g.pass().pass();
    expect(g.zoneOf(bears)).toBe('battlefield');
    expect(g.zoneOf(land)).toBe('exile');
  });

  it('when cast in an end step, returns them at the next turn’s end step', () => {
    const g = game({
      active: 'p2',
      step: 'end',
      p1: { hand: [SURFER], battlefield: ['bear-cub', ...n('island', 6)] },
    });
    const bears = g.id('p1', 'bear-cub');
    g.pass(); // p2 passes, p1 gets priority in p2's end step
    cast(g, SURFER);
    g.pass().pass();
    g.do(g.legal().find((a) => targetIds(a).at(-1) === bears)!);
    g.do(g.legal()[0]!);
    settle(g);
    expect(g.zoneOf(bears)).toBe('exile');
    // Still exiled through p1's next turn until its end step.
    g.passUntilStep('main1');
    expect(g.state.turn.activePlayer).toBe('p1');
    expect(g.zoneOf(bears)).toBe('exile');
    g.passUntilStep('end');
    settle(g);
    expect(g.zoneOf(bears)).toBe('battlefield');
  });
});

describe('Spaceshift', () => {
  it("exiles target creature and returns it under its owner's control with a +1/+1 counter", () => {
    const g = game({
      p1: { hand: [SPACESHIFT], battlefield: ['island', 'island'] },
      p2: { battlefield: [{ card: 'bear-cub', tapped: true }] },
    });
    const bears = g.id('p2', 'bear-cub');
    const zcc = g.obj(bears).zcc;
    cast(g, SPACESHIFT, [g.ref(bears)]);
    settle(g);
    expect(g.zoneOf(bears)).toBe('battlefield');
    expect(g.obj(bears).zcc).toBeGreaterThan(zcc);
    expect(g.obj(bears).controller).toBe('p2');
    expect(g.obj(bears).tapped).toBe(false);
    expect(g.obj(bears).plusOneCounters).toBe(1);
  });

  it("can target an artifact (re-triggering Collector's Case) but not a land", () => {
    const g = game({
      p1: { hand: [SPACESHIFT], battlefield: [CASE, 'island', 'island'] },
      p2: { battlefield: ['bear-cub'] },
    });
    const box = g.id('p1', CASE);
    const casts = g.legal().filter((a) => a.type === 'castSpell');
    const targets = casts.flatMap((a) =>
      a.type === 'castSpell' ? a.targets.map((t) => ('object' in t ? t.object.id : '')) : [],
    );
    expect(targets).toContain(box);
    expect(targets).not.toContain(g.id('p1', 'island'));
    cast(g, SPACESHIFT, [g.ref(box)]);
    settle(g);
    const bears = g.id('p2', 'bear-cub');
    expect(g.obj(bears).tapped).toBe(true);
    expect(g.obj(bears).counters?.stun).toBe(2);
  });
});

describe("Collector's Case", () => {
  it('taps up to one target creature and puts two stun counters on it', () => {
    const g = game({
      p1: { hand: [CASE], battlefield: ['island', 'island'] },
      p2: { battlefield: ['bear-cub'] },
    });
    cast(g, CASE);
    g.pass().pass();
    // "Up to one": choosing nothing is allowed.
    expect(g.legal().some((a) => a.type === 'chooseTargets' && a.targets.length === 0)).toBe(true);
    settle(g);
    const bears = g.id('p2', 'bear-cub');
    expect(g.obj(bears).tapped).toBe(true);
    expect(g.obj(bears).counters?.stun).toBe(2);
    // p2's untap steps: a stun counter comes off instead, twice; then it untaps.
    g.passUntilStep('end').passUntilStep('main1');
    expect(g.state.turn.activePlayer).toBe('p2');
    expect(g.obj(bears).tapped).toBe(true);
    expect(g.obj(bears).counters?.stun).toBe(1);
    g.passUntilStep('end').passUntilStep('main1');
    g.passUntilStep('end').passUntilStep('main1');
    expect(g.state.turn.activePlayer).toBe('p2');
    expect(g.obj(bears).tapped).toBe(true);
    expect(g.obj(bears).counters?.stun ?? 0).toBe(0);
    g.passUntilStep('end').passUntilStep('main1');
    g.passUntilStep('end').passUntilStep('main1');
    expect(g.obj(bears).tapped).toBe(false);
  });

  it('{3}{U}, {T}: taps target creature', () => {
    const g = game({
      p1: { battlefield: [CASE, ...n('island', 4)] },
      p2: { battlefield: ['bear-cub'] },
    });
    const box = g.id('p1', CASE);
    const bears = g.id('p2', 'bear-cub');
    g.do({
      type: 'activateAbility',
      player: 'p1',
      source: box,
      abilityIndex: 1,
      targets: [g.ref(bears)],
    });
    settle(g);
    expect(g.obj(bears).tapped).toBe(true);
    expect(g.obj(box).tapped).toBe(true);
    expect(
      g.state.battlefield.filter((id) => g.obj(id).tapped && g.obj(id).defId === 'island'),
    ).toHaveLength(4);
  });
});
