import { describe, expect, it } from 'vitest';
import { cardDb } from '../src/index.ts';
import { cast, game, n } from './blb-helpers.ts';
import { done, keywords } from './hob-white-helpers.ts';
import { ringOf, tokensOf } from './ltr-white-helpers.ts';
import type { Game } from './ltr-white-helpers.ts';
import {
  chars,
  keepScry,
  life,
  objRef,
  settleStack,
  toTurnOf,
} from './ltr-wu-rare-helpers.ts';

// Lord of the Rings 21d: the blue rares of the packets' random slot, part two.

/** Resolves the stack, giving each trigger its first target that matches `want` (otherwise its first real target). */
function settleWith(g: Game, want?: string): void {
  for (let i = 0; i < 60; i++) {
    const d = g.decision;
    if (d.kind === 'chooseTriggerTargets') {
      const legal = g.legal();
      g.do(
        (want
          ? legal.find(
              (a) =>
                a.type === 'chooseTargets' &&
                a.targets.some((t) => 'object' in t && t.object.id === want),
            )
          : undefined) ??
          [...legal]
            .filter((a) => a.type === 'chooseTargets')
            .sort((a, b) => (b as { targets: unknown[] }).targets.length - (a as { targets: unknown[] }).targets.length)[0] ??
          legal[0]!,
      );
    } else if (d.kind === 'chooseObject') g.do(g.legal()[0]!);
    else if (d.kind === 'chooseOption') g.do({ type: 'chooseOption', player: d.player, index: 0 });
    else if (d.kind === 'priority' && g.state.stack.length) g.pass();
    else return;
  }
  throw new Error('did not settle');
}

describe('Rangers of Ithilien', () => {
  const RANGERS = 'rangers-of-ithilien';
  const setup = (p2: string[] = ['savannah-lions', 'serra-angel']) =>
    game({
      p1: { hand: [RANGERS], battlefield: n('island', 4) },
      p2: { battlefield: p2 },
    });
  /** The opponent's Lions, found before it changes hands. */
  const lionsOf = (g: Game) => g.id('p2', 'savannah-lions');
  it('has vigilance', () => {
    const g = setup();
    cast(g, RANGERS);
    settleWith(g);
    expect(keywords(g, g.id('p1', RANGERS))).toContain('vigilance');
  });
  it('gains control of a creature with lesser power, then the Ring tempts you', () => {
    const g = setup();
    const lions = lionsOf(g);
    cast(g, RANGERS);
    settleWith(g, lions);
    expect(g.obj(lions).controller).toBe('p1');
    expect(ringOf(g)?.tempted).toBe(1);
  });
  it('can not target a creature with equal or greater power', () => {
    const g = setup(['serra-angel']);
    cast(g, RANGERS);
    expect(g.decision.kind).toBe('priority');
    g.pass();
    g.pass();
    // The only creature is Serra Angel (power 4, Rangers has 3): no target, the Ring still tempts you.
    expect(g.decision.kind).toBe('chooseTriggerTargets');
    expect(g.legal().every((a) => a.type === 'chooseTargets' && a.targets.length === 0)).toBe(true);
    settleWith(g);
    expect(g.obj(g.id('p2', 'serra-angel')).controller).toBe('p2');
    expect(ringOf(g)?.tempted).toBe(1);
  });
  it('offers only creatures with lesser power as targets', () => {
    const g = setup();
    cast(g, RANGERS);
    g.pass();
    g.pass();
    expect(g.decision.kind).toBe('chooseTriggerTargets');
    const offered = g
      .legal()
      .filter((a) => a.type === 'chooseTargets')
      .flatMap((a) => (a as { targets: { object: { id: string } }[] }).targets.map((t) => t.object.id));
    expect(offered).toEqual([lionsOf(g)]);
  });
  it('is up to one target: with none chosen the Ring still tempts you', () => {
    const g = setup();
    cast(g, RANGERS);
    g.pass();
    g.pass();
    const none = g.legal().find((a) => a.type === 'chooseTargets' && a.targets.length === 0);
    expect(none).toBeDefined();
    g.do(none!);
    settleWith(g);
    expect(g.obj(lionsOf(g)).controller).toBe('p2');
    expect(ringOf(g)?.tempted).toBe(1);
  });
  it('ends when Rangers is destroyed', () => {
    const g = game({
      p1: { hand: [RANGERS], battlefield: n('island', 4) },
      p2: { hand: ['bake-into-a-pie'], battlefield: ['savannah-lions', ...n('swamp', 4)] },
    });
    const lions = g.id('p2', 'savannah-lions');
    cast(g, RANGERS);
    settleWith(g, lions);
    expect(g.obj(lions).controller).toBe('p1');
    // p2 kills Rangers at instant speed.
    g.pass();
    expect(g.actor).toBe('p2');
    cast(g, 'bake-into-a-pie', [objRef(g, g.id('p1', RANGERS))]);
    settleWith(g);
    expect(g.zoneOf(g.id('p1', RANGERS, 'graveyard'))).toBe('graveyard');
    expect(g.obj(lions).controller).toBe('p2');
  });
  it("ends if another player gains control of Rangers (it isn't yours any more)", () => {
    const g = setup();
    const lions = lionsOf(g);
    cast(g, RANGERS);
    settleWith(g, lions);
    const rangers = g.id('p1', RANGERS);
    expect(g.obj(lions).controller).toBe('p1');
    g.obj(rangers).controller = 'p2';
    // State-based actions run with the next pass.
    g.pass();
    expect(g.obj(lions).controller).toBe('p2');
  });
  it('does nothing if Rangers has already left when the trigger resolves', () => {
    const g = setup();
    cast(g, RANGERS);
    g.pass();
    g.pass();
    const target = g.legal().find((a) => a.type === 'chooseTargets' && a.targets.length > 0)!;
    g.do(target);
    const rangers = g.id('p1', RANGERS);
    g.state.battlefield = g.state.battlefield.filter((id) => id !== rangers);
    g.obj(rangers).zone = 'graveyard';
    g.obj(rangers).zcc++;
    g.state.players.p1.graveyard.push(rangers);
    settleWith(g);
    expect(g.obj(lionsOf(g)).controller).toBe('p2');
  });
});

describe('Scroll of Isildur', () => {
  const SCROLL = 'scroll-of-isildur';
  it('chapter I: gains control of an artifact for as long as you control the Saga; the Ring tempts you', () => {
    const g = game({
      p1: { hand: [SCROLL], battlefield: n('island', 3) },
      p2: { battlefield: ['pirates-cutlass', 'serra-angel'] },
    });
    const cutlass = g.id('p2', 'pirates-cutlass');
    cast(g, SCROLL);
    settleWith(g, cutlass);
    expect(g.obj(cutlass).controller).toBe('p1');
    expect(ringOf(g)?.tempted).toBe(1);
    // Only artifacts are targets.
    expect(g.obj(g.id('p2', 'serra-angel')).controller).toBe('p2');
  });
  it('can only target artifacts, and has up to one target', () => {
    const g = game({
      p1: { hand: [SCROLL], battlefield: n('island', 3) },
      p2: { battlefield: ['pirates-cutlass', 'serra-angel', 'plains'] },
    });
    cast(g, SCROLL);
    g.pass();
    g.pass();
    expect(g.decision.kind).toBe('chooseTriggerTargets');
    const offered = g
      .legal()
      .filter((a) => a.type === 'chooseTargets')
      .flatMap((a) => (a as { targets: { object: { id: string } }[] }).targets.map((t) => t.object.id));
    expect(offered).toEqual([g.id('p2', 'pirates-cutlass')]);
    expect(g.legal().some((a) => a.type === 'chooseTargets' && a.targets.length === 0)).toBe(true);
  });
  it('chapter II taps up to two creatures and puts a stun counter on each; III draws for each tapped creature the opponent controls; the artifact goes back after III', () => {
    const g = game({
      p1: { hand: [SCROLL], battlefield: n('island', 3) },
      p2: { battlefield: ['pirates-cutlass', 'serra-angel', 'savannah-lions'] },
    });
    const cutlass = g.id('p2', 'pirates-cutlass');
    const angel = g.id('p2', 'serra-angel');
    const lions = g.id('p2', 'savannah-lions');
    cast(g, SCROLL);
    settleWith(g, cutlass);
    expect(g.obj(cutlass).controller).toBe('p1');
    // Chapter II as the next turn of yours begins: both creatures are tapped and stunned.
    toTurnOf(g, 'p1');
    expect(g.obj(angel).tapped).toBe(true);
    expect(g.obj(lions).tapped).toBe(true);
    expect(g.obj(angel).counters?.stun).toBe(1);
    expect(g.obj(lions).counters?.stun).toBe(1);
    expect(g.obj(cutlass).controller).toBe('p1');
    // Their untap step only removed the stun counters; chapter III on the turn after draws a card for each tapped creature.
    const before = g.state.players.p1.hand.length;
    toTurnOf(g, 'p1');
    expect(g.state.players.p1.hand.length).toBe(before + 2 + 1); // two cards from chapter III, one from the draw step
    expect(g.state.battlefield.some((id) => g.obj(id).defId === SCROLL)).toBe(false);
    expect(g.obj(cutlass).controller).toBe('p2');
  });
  it('chapter II: two creatures are tapped and stunned', () => {
    const g = game({
      p1: { battlefield: [{ card: SCROLL }, 'savannah-lions'] },
      p2: { battlefield: ['serra-angel', 'savannah-lions'] },
    });
    g.obj(g.id('p1', SCROLL)).counters = { lore: 1 };
    toTurnOf(g, 'p1');
    settleWith(g);
    const stunned = g.state.battlefield.filter((id) => (g.obj(id).counters?.stun ?? 0) > 0);
    expect(stunned.length).toBe(2);
    for (const id of stunned) expect(g.obj(id).tapped).toBe(true);
  });
  it('chapter III draws a card for each tapped creature the opponent controls (and none for untapped ones)', () => {
    const g = game({
      p1: { battlefield: [SCROLL, { card: 'savannah-lions', tapped: true }] },
      p2: {
        battlefield: [
          { card: 'serra-angel', tapped: true },
          { card: 'savannah-lions', tapped: true },
          'savannah-lions',
        ],
      },
    });
    g.obj(g.id('p1', SCROLL)).counters = { lore: 2 };
    // Stun counters keep the opponent's two tapped creatures tapped through their untap step.
    for (const id of g.state.battlefield)
      if (g.obj(id).controller === 'p2' && g.obj(id).tapped) g.obj(id).counters = { stun: 2 };
    const before = g.state.players.p1.hand.length;
    toTurnOf(g, 'p1');
    // One card from the draw step, two from chapter III (the opponent's tapped creatures; mine don't count).
    expect(g.state.players.p1.hand.length).toBe(before + 1 + 2);
  });
  it('control of the artifact ends if another player gains control of the Saga', () => {
    const g = game({
      p1: { hand: [SCROLL], battlefield: n('island', 3) },
      p2: { battlefield: ['pirates-cutlass'] },
    });
    const cutlass = g.id('p2', 'pirates-cutlass');
    cast(g, SCROLL);
    settleWith(g, cutlass);
    expect(g.obj(cutlass).controller).toBe('p1');
    g.obj(g.id('p1', SCROLL)).controller = 'p2';
    g.pass();
    expect(g.obj(cutlass).controller).toBe('p2');
  });
});

describe('Storm of Saruman', () => {
  const STORM = 'storm-of-saruman';
  it('has ward {3}', () => {
    const g = game({ p1: { battlefield: [STORM] } });
    expect(keywords(g, g.id('p1', STORM))).toContain('ward');
    expect(chars(g, g.id('p1', STORM)).keywords).toContain('ward');
  });
  it('copies the second spell you cast each turn (and not the first or third)', () => {
    const g = game({
      p1: {
        hand: ['lightning-bolt', 'lightning-bolt', 'lightning-bolt'],
        battlefield: [STORM, ...n('mountain', 3)],
      },
      p2: { battlefield: [] },
    });
    const target = [{ player: 'p2' }] as never;
    cast(g, 'lightning-bolt', target);
    settleWith(g);
    expect(life(g, 'p2')).toBe(17);
    cast(g, 'lightning-bolt', target);
    settleWith(g);
    // The second Lightning Bolt was copied: 3 + 3 (the copy kept the target).
    expect(life(g, 'p2')).toBe(11);
    cast(g, 'lightning-bolt', target);
    settleWith(g);
    expect(life(g, 'p2')).toBe(8);
  });
  it("a copy of a legendary permanent spell isn't legendary, so both stay", () => {
    const g = game({
      p1: {
        hand: ['savannah-lions', 'boromir-warden-of-the-tower'],
        battlefield: [STORM, ...n('plains', 4)],
      },
    });
    cast(g, 'savannah-lions');
    settleWith(g);
    cast(g, 'boromir-warden-of-the-tower');
    settleWith(g);
    const boromirs = g.state.battlefield.filter(
      (id) => g.obj(id).defId === 'boromir-warden-of-the-tower',
    );
    expect(boromirs).toHaveLength(2);
    expect(boromirs.filter((id) => g.obj(id).isToken)).toHaveLength(1);
  });
});

describe('The Watcher in the Water', () => {
  const WATCHER = 'the-watcher-in-the-water';
  it('enters tapped with nine stun counters', () => {
    const g = game({ p1: { hand: [WATCHER], battlefield: n('island', 5) } });
    cast(g, WATCHER);
    done(g);
    const w = g.id('p1', WATCHER);
    expect(g.obj(w).tapped).toBe(true);
    expect(g.obj(w).counters?.stun).toBe(9);
  });
  it('is a 9/9 legendary Kraken', () => {
    const g = game({ p1: { battlefield: [WATCHER] } });
    const c = chars(g, g.id('p1', WATCHER));
    expect([c.power, c.toughness]).toEqual([9, 9]);
    expect(c.subtypes).toContain('Kraken');
    expect(cardDb.get(WATCHER)?.supertypes).toContain('Legendary');
  });
  it('a stun counter is removed instead of untapping', () => {
    const g = game({ p1: { battlefield: [{ card: WATCHER, tapped: true }] } });
    const w = g.id('p1', WATCHER);
    g.obj(w).counters = { stun: 2 };
    toTurnOf(g, 'p1');
    expect(g.obj(w).tapped).toBe(true);
    expect(g.obj(w).counters?.stun).toBe(1);
  });
  it("creates a Tentacle whenever you draw a card during an opponent's turn", () => {
    const g = game({
      p1: { hand: ['opt'], battlefield: [WATCHER, 'island'] },
      p2: { battlefield: [] },
      active: 'p2',
    });
    g.pass();
    expect(g.actor).toBe('p1');
    cast(g, 'opt');
    settleStack(g);
    keepScry(g);
    settleStack(g);
    expect(tokensOf(g, 'ltr-tentacle-token')).toHaveLength(1);
    const t = tokensOf(g, 'ltr-tentacle-token')[0]!;
    const c = chars(g, t);
    expect([c.power, c.toughness, c.subtypes]).toEqual([1, 1, ['Tentacle']]);
    expect(cardDb.get('ltr-tentacle-token')?.colors).toEqual(['U']);
  });
  it('does not create one when you draw during your own turn or the opponent draws', () => {
    const g = game({
      p1: { hand: ['opt'], battlefield: [WATCHER, 'island'] },
      p2: { hand: ['opt'], battlefield: ['island'] },
    });
    cast(g, 'opt');
    settleStack(g);
    keepScry(g);
    settleStack(g);
    expect(tokensOf(g, 'ltr-tentacle-token')).toHaveLength(0);
    const h = game({
      p1: { battlefield: [WATCHER] },
      p2: { hand: ['opt'], battlefield: ['island'] },
      active: 'p2',
    });
    cast(h, 'opt');
    settleStack(h);
    keepScry(h);
    settleStack(h);
    expect(tokensOf(h, 'ltr-tentacle-token')).toHaveLength(0);
  });
  describe('when a Tentacle you control dies', () => {
    const setup = () => {
      const g = game({
        p1: {
          hand: ['bake-into-a-pie'],
          battlefield: [
            { card: WATCHER, tapped: true },
            'ltr-tentacle-token',
            ...n('swamp', 4),
          ],
        },
        p2: { battlefield: ['serra-angel'] },
      });
      g.obj(g.id('p1', WATCHER)).counters = { stun: 3 };
      return g;
    };
    it('untaps the Kraken (a stun counter is removed instead) and puts a stun counter on a nonland permanent', () => {
      const g = setup();
      const w = g.id('p1', WATCHER);
      const angel = g.id('p2', 'serra-angel');
      cast(g, 'bake-into-a-pie', [objRef(g, g.id('p1', 'ltr-tentacle-token'))]);
      settleStack(g);
      // Trigger targets: the Watcher for the Kraken, the Angel for the stun counter.
      expect(g.decision.kind).toBe('chooseTriggerTargets');
      const both = g
        .legal()
        .find(
          (a) =>
            a.type === 'chooseTargets' &&
            a.targets.length === 2 &&
            a.targets.some((t) => 'object' in t && t.object.id === w) &&
            a.targets.some((t) => 'object' in t && t.object.id === angel),
        );
      expect(both).toBeDefined();
      g.do(both!);
      settleStack(g);
      expect(g.obj(w).counters?.stun).toBe(2);
      expect(g.obj(w).tapped).toBe(true);
      expect(g.obj(angel).counters?.stun).toBe(1);
    });
    it('untaps a Kraken with no stun counters', () => {
      const g = setup();
      const w = g.id('p1', WATCHER);
      g.obj(w).counters = { stun: 0 };
      cast(g, 'bake-into-a-pie', [objRef(g, g.id('p1', 'ltr-tentacle-token'))]);
      settleStack(g);
      settleWith(g, w);
      expect(g.obj(w).tapped).toBe(false);
    });
    it('both targets are optional', () => {
      const g = setup();
      cast(g, 'bake-into-a-pie', [objRef(g, g.id('p1', 'ltr-tentacle-token'))]);
      settleStack(g);
      expect(g.decision.kind).toBe('chooseTriggerTargets');
      const none = g.legal().find((a) => a.type === 'chooseTargets' && a.targets.length === 0);
      expect(none).toBeDefined();
      g.do(none!);
      settleStack(g);
      expect(g.obj(g.id('p1', WATCHER)).counters?.stun).toBe(3);
    });
    it('does not trigger for a creature that is not a Tentacle', () => {
      const lionsGame = game({
        p1: {
          hand: ['bake-into-a-pie'],
          battlefield: [{ card: WATCHER, tapped: true }, 'savannah-lions', ...n('swamp', 4)],
        },
      });
      lionsGame.obj(lionsGame.id('p1', WATCHER)).counters = { stun: 3 };
      cast(lionsGame, 'bake-into-a-pie', [objRef(lionsGame, lionsGame.id('p1', 'savannah-lions'))]);
      settleStack(lionsGame);
      expect(lionsGame.decision.kind).toBe('priority');
      expect(lionsGame.obj(lionsGame.id('p1', WATCHER)).counters?.stun).toBe(3);
    });
  });
});
