import { describe, expect, it } from 'vitest';
import type { Action } from '@mtg/engine';
import type { GameDriver } from '@mtg/engine/testing';
import { cast, game, n, pt, settle } from './blb-helpers.ts';
import { bf, counters, done, gy, hand, keywords } from './tdm-green-helpers.ts';

// The Lord of the Rings 21d: the green rares of the packets' random slot, part 2 (Legolas, Radagast, The Ring Goes South).

/** Resolves everything (bounded): scries keep the cards on top, triggers take their first real target, options take `option`. */
function run(g: GameDriver): GameDriver {
  for (let i = 0; i < 80; i++) {
    const d = g.decision;
    if (d.kind === 'scry') g.do(g.legal().find((a) => a.type === 'scry') as Action);
    else if (d.kind === 'chooseOption') g.do({ type: 'chooseOption', player: d.player, index: 0 });
    else if (d.kind === 'chooseTriggerTargets') settle(g);
    else if (d.kind === 'priority' && g.state.stack.length) g.pass();
    else if (d.kind === 'chooseObject')
      g.do(g.legal().find((a) => a.type === 'chooseCard' && a.card) as Action);
    else break;
  }
  return g;
}
const library = (g: GameDriver, p: 'p1' | 'p2' = 'p1') =>
  g.state.players[p].library.map((id) => g.obj(id).defId);
const legolasGame = (extra: { p1?: Record<string, unknown>; p2?: Record<string, unknown> } = {}) =>
  game({
    p1: {
      hand: ['giant-growth', 'ents-fury'],
      battlefield: ['legolas-master-archer', 'savannah-lions', ...n('forest', 4)],
      ...extra.p1,
    },
    p2: { battlefield: ['serra-angel', 'mountain'], hand: ['giant-growth', 'shock'], ...extra.p2 },
  });

describe('Legolas, Master Archer', () => {
  it('is a 1/4 with reach', () => {
    const g = legolasGame();
    const l = g.id('p1', 'legolas-master-archer');
    expect(pt(g, l)).toEqual([1, 4]);
    expect(keywords(g, l)).toContain('reach');
  });
  it('gets a +1/+1 counter when you cast a spell that targets it', () => {
    const g = legolasGame();
    const l = g.id('p1', 'legolas-master-archer');
    cast(g, 'giant-growth', [g.ref(l)]);
    run(g);
    expect(counters(g, l)).toBe(1);
    expect(pt(g, l)).toEqual([5, 8]); // 1/4 + counter + Giant Growth
  });
  it("doesn't get one when an opponent's spell targets it", () => {
    const g = legolasGame();
    const l = g.id('p1', 'legolas-master-archer');
    g.pass();
    cast(g, 'shock', [g.ref(l)]);
    run(g);
    expect(counters(g, l)).toBe(0);
  });
  it("deals damage equal to its power to up to one target creature when you cast a spell that targets a creature you don't control", () => {
    const g = legolasGame();
    const l = g.id('p1', 'legolas-master-archer');
    const angel = g.id('p2', 'serra-angel');
    cast(g, 'giant-growth', [g.ref(angel)]);
    // The trigger asks for its target: the Angel.
    expect(g.decision.kind).toBe('chooseTriggerTargets');
    g.do({ type: 'chooseTargets', player: 'p1', targets: [g.ref(angel)] });
    run(g);
    expect(g.obj(angel).damage).toBe(1);
    expect(counters(g, l)).toBe(0);
  });
  it('can choose another creature, or none, for the damage', () => {
    const g = legolasGame();
    const angel = g.id('p2', 'serra-angel');
    const lions = g.id('p1', 'savannah-lions');
    cast(g, 'giant-growth', [g.ref(angel)]);
    g.do({ type: 'chooseTargets', player: 'p1', targets: [g.ref(lions)] });
    run(g);
    expect(gy(g)).toContain('savannah-lions'); // 1 damage kills the 2/1
    const g2 = legolasGame();
    cast(g2, 'giant-growth', [g2.ref(g2.id('p2', 'serra-angel'))]);
    g2.do({ type: 'chooseTargets', player: 'p1', targets: [] });
    run(g2);
    expect(g2.obj(g2.id('p2', 'serra-angel')).damage).toBe(0);
    expect(pt(g2, g2.id('p2', 'serra-angel'))).toEqual([7, 7]); // the spell itself still resolved
  });
  it("doesn't trigger for a spell that targets your own other creature or a player", () => {
    const g = legolasGame();
    cast(g, 'giant-growth', [g.ref(g.id('p1', 'savannah-lions'))]);
    expect(g.decision.kind).toBe('priority');
    expect(g.state.stack).toHaveLength(1);
    const g2 = legolasGame({
      p1: { hand: ['shock'], battlefield: ['legolas-master-archer', 'mountain'] },
    });
    g2.do({
      type: 'castSpell',
      player: 'p1',
      card: g2.id('p1', 'shock', 'hand'),
      targets: [{ player: 'p2' }],
    });
    expect(g2.state.stack).toHaveLength(1);
  });
  it("both abilities trigger for a spell that targets Legolas and a creature you don't control", () => {
    const g = legolasGame();
    const l = g.id('p1', 'legolas-master-archer');
    const angel = g.id('p2', 'serra-angel');
    cast(g, 'ents-fury', [g.ref(l), g.ref(angel)]);
    // The damage trigger asks for its target (the Angel); the counter trigger needs none.
    expect(g.decision.kind).toBe('chooseTriggerTargets');
    g.do({ type: 'chooseTargets', player: 'p1', targets: [g.ref(angel)] });
    expect(g.state.stack).toHaveLength(3);
    run(g);
    expect(counters(g, l)).toBeGreaterThanOrEqual(1);
    // 1 damage from the trigger (power 1 counters resolved first: 2), then Legolas (3/6 by then) fights the 4/4 Angel: it dies.
    expect(gy(g, 'p2')).toContain('serra-angel');
  });
});

describe('Radagast the Brown', () => {
  const lib = (...top: string[]) => [...top, ...n('forest', 6)];
  it('is a 2/5', () => {
    const g = game({ p1: { battlefield: ['radagast-the-brown'] } });
    expect(pt(g, g.id('p1', 'radagast-the-brown'))).toEqual([2, 5]);
  });
  it('looks at the top X cards when it enters (X its mana value), takes a creature that shares no type with yours', () => {
    const g = game({
      p1: {
        hand: ['radagast-the-brown'],
        battlefield: n('forest', 4),
        library: lib('giant-growth', 'enraged-huorn', 'savannah-lions', 'mountain'),
      },
    });
    cast(g, 'radagast-the-brown');
    run(g);
    const d = g.decision;
    expect(d.kind).toBe('searchLibrary');
    if (d.kind !== 'searchLibrary') return;
    expect(d.looked).toHaveLength(4);
    expect(d.options.map((id) => g.obj(id).defId).sort()).toEqual([
      'enraged-huorn',
      'savannah-lions',
    ]);
    g.do({ type: 'chooseCard', player: 'p1', card: g.id('p1', 'enraged-huorn', 'library') });
    done(g);
    expect(hand(g)).toContain('enraged-huorn');
    // The rest went to the bottom.
    expect(library(g)).toHaveLength(9);
    expect(library(g).slice(-3).sort()).toEqual(['giant-growth', 'mountain', 'savannah-lions']);
  });
  it("doesn't offer a creature card that shares a creature type with a creature you control", () => {
    const g = game({
      p1: {
        hand: ['radagast-the-brown'],
        battlefield: [...n('forest', 4), 'savannah-lions'],
        library: lib('savannah-lions', 'enraged-huorn', 'forest', 'forest'),
      },
    });
    cast(g, 'radagast-the-brown');
    run(g);
    const d = g.decision;
    expect(d.kind).toBe('searchLibrary');
    if (d.kind !== 'searchLibrary') return;
    expect(d.options.map((id) => g.obj(id).defId)).toEqual(['enraged-huorn']);
  });
  it("doesn't offer a card sharing a type with Radagast himself (Avatar or Wizard)", () => {
    const g = game({
      p1: {
        hand: ['radagast-the-brown'],
        battlefield: n('forest', 4),
        library: lib('radagast-the-brown', 'forest', 'forest', 'forest'),
      },
    });
    cast(g, 'radagast-the-brown');
    run(g);
    const d = g.decision;
    // The other Radagast (a legend Avatar Wizard) can't be taken: no options at all.
    if (d.kind === 'searchLibrary') expect(d.options).toHaveLength(0);
  });
  it("triggers for another nontoken creature entering, with that creature's mana value", () => {
    const g = game({
      p1: {
        hand: ['savannah-lions'],
        battlefield: ['radagast-the-brown', 'plains'],
        library: lib('enraged-huorn', 'forest'),
      },
    });
    cast(g, 'savannah-lions');
    run(g);
    const d = g.decision;
    expect(d.kind).toBe('searchLibrary');
    if (d.kind !== 'searchLibrary') return;
    // Mana value 1: only the top card is looked at.
    expect(d.looked).toHaveLength(1);
    expect(d.options.map((id) => g.obj(id).defId)).toEqual(['enraged-huorn']);
  });
  it("doesn't trigger for a token, or for a creature an opponent controls", () => {
    const g = game({
      p1: {
        hand: ['horn-of-gondor'],
        battlefield: ['radagast-the-brown', ...n('forest', 3)],
        library: lib('enraged-huorn'),
      },
    });
    cast(g, 'horn-of-gondor');
    run(g);
    expect(bf(g, 'hob-human-soldier-token')).toHaveLength(1);
    expect(g.decision.kind).toBe('priority');
    expect(g.state.stack).toHaveLength(0);
    expect(library(g)[0]).toBe('enraged-huorn');
    // An opponent's creature entering doesn't trigger it either.
    const g2 = game({
      p1: { battlefield: ['radagast-the-brown'], library: lib('enraged-huorn') },
      p2: { hand: ['savannah-lions'], battlefield: ['plains'] },
      active: 'p2',
    });
    cast(g2, 'savannah-lions');
    run(g2);
    expect(g2.state.stack).toHaveLength(0);
    expect(library(g2)[0]).toBe('enraged-huorn');
  });
});

describe('Radagast with Last March of the Ents (creatures that enter together)', () => {
  it('sees the creature that enters at the same time, and itself', () => {
    const g = game({
      p1: {
        hand: ['last-march-of-the-ents', 'radagast-the-brown', 'enraged-huorn'],
        battlefield: [...n('forest', 8), 'ordinary-bear'],
        library: n('forest', 12),
      },
    });
    cast(g, 'last-march-of-the-ents');
    for (let i = 0; i < 5 && g.decision.kind === 'priority'; i++) g.pass();
    // Enraged Huorn first, then Radagast: the Huorn is chosen before Radagast but they enter together.
    const pick = (name: string) => {
      const d = g.decision;
      if (d.kind !== 'chooseOption') throw new Error('no prompt');
      g.do({
        type: 'chooseOption',
        player: 'p1',
        index: d.options.findIndex((o) => o.label === name),
      });
    };
    pick('Enraged Huorn');
    pick('Radagast the Brown'); // no creature card is left: nothing more to ask
    // Both Radagast's own trigger and the one for the Huorn (and the Huorn's Ring trigger) are on the stack.
    expect(bf(g, 'radagast-the-brown')).toHaveLength(1);
    expect(bf(g, 'enraged-huorn')).toHaveLength(1);
    const lookTriggers = g.state.stack.filter(
      (i) => i.kind === 'ability' && g.state.objects[i.source.id]?.defId === 'radagast-the-brown',
    );
    expect(lookTriggers).toHaveLength(2);
  });
});

describe('The Ring Goes South', () => {
  it('tempts you, then puts X lands (X the legendary creatures you control) onto the battlefield tapped, the rest on the bottom', () => {
    const g = game({
      p1: {
        hand: ['the-ring-goes-south'],
        battlefield: [...n('forest', 4), 'legolas-master-archer', 'fangorn-tree-shepherd'],
        library: ['savannah-lions', 'forest', 'giant-growth', 'mountain', 'plains', 'island'],
      },
    });
    cast(g, 'the-ring-goes-south');
    run(g);
    expect(g.state.players.p1.ring?.tempted).toBe(1);
    // Two legendary creatures: the Forest and the Mountain.
    const lands = g.state.battlefield.filter((id) => g.obj(id).defId === 'mountain');
    expect(lands).toHaveLength(1);
    expect(g.obj(lands[0]!).tapped).toBe(true);
    expect(bf(g, 'forest').length).toBe(5);
    const newForest = g.state.battlefield.filter(
      (id) => g.obj(id).defId === 'forest' && g.obj(id).zoneTurn === g.state.turn.number,
    );
    expect(newForest.some((id) => g.obj(id).tapped)).toBe(true);
    // Lions and Giant Growth (revealed, not lands) are on the bottom; the Plains and Island stay on top.
    expect(library(g)).toHaveLength(4);
    expect(library(g).slice(0, 2)).toEqual(['plains', 'island']);
    expect(library(g).slice(2).sort()).toEqual(['giant-growth', 'savannah-lions']);
  });
  it('counts the Ring-bearer the Ring just gave you (it is legendary)', () => {
    const g = game({
      p1: {
        hand: ['the-ring-goes-south'],
        battlefield: [...n('forest', 4), 'savannah-lions'],
        library: ['forest', 'mountain', 'plains'],
      },
    });
    cast(g, 'the-ring-goes-south');
    run(g);
    expect(g.state.players.p1.ring?.bearer?.id).toBe(g.id('p1', 'savannah-lions'));
    // X = 1.
    expect(bf(g, 'forest')).toHaveLength(5);
    expect(bf(g, 'mountain')).toHaveLength(0);
    expect(library(g)).toEqual(['mountain', 'plains']);
  });
  it('with no legendary creature (and no creature at all) reveals nothing', () => {
    const g = game({
      p1: {
        hand: ['the-ring-goes-south'],
        battlefield: n('forest', 4),
        library: ['forest', 'mountain'],
      },
    });
    cast(g, 'the-ring-goes-south');
    run(g);
    expect(g.state.players.p1.ring?.tempted).toBe(1);
    expect(library(g)).toEqual(['forest', 'mountain']);
    expect(bf(g, 'forest')).toHaveLength(4);
  });
  it('reveals the whole library when it has fewer lands than X', () => {
    const g = game({
      p1: {
        hand: ['the-ring-goes-south'],
        battlefield: [...n('forest', 4), 'legolas-master-archer', 'fangorn-tree-shepherd'],
        library: ['savannah-lions', 'forest', 'giant-growth'],
      },
    });
    cast(g, 'the-ring-goes-south');
    run(g);
    expect(bf(g, 'forest')).toHaveLength(5);
    expect(library(g).sort()).toEqual(['giant-growth', 'savannah-lions']);
    expect(gy(g)).toContain('the-ring-goes-south');
  });
});
