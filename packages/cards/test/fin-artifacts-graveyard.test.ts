import { describe, expect, it } from 'vitest';
import type { GameDriver } from '@mtg/engine/testing';
import { playRandomGame } from '@mtg/engine';
import { deckById, deckIds } from '../src/index.ts';
import { cast, engine, game, handSize, n, pt, settle } from './blb-helpers.ts';

// Final Fantasy 11b (group A): Highwind Workshop (W/U) and Time Compression (U/B).

/** Passes (settling triggers on the way) until `player`'s next precombat main phase. */
function nextMain(g: GameDriver, player: 'p1' | 'p2' = 'p1') {
  const from = g.state.turn.number;
  for (let i = 0; i < 300; i++) {
    const s = g.state;
    if (s.turn.number > from && s.turn.activePlayer === player && s.turn.step === 'main1')
      if (s.decision.kind === 'priority' && s.stack.length === 0) return g;
    const d = g.decision;
    if (d.kind === 'declareAttackers') g.do({ type: 'confirmAttackers', player: d.player });
    else if (d.kind === 'declareBlockers') g.do({ type: 'confirmBlockers', player: d.player });
    else if (d.kind === 'priority') g.pass();
    else g.do(g.legal()[0]!);
  }
  throw new Error('No next main phase');
}

describe('Highwind Workshop', () => {
  it('Cid pumps artifact creatures and Heroes for each Artificer, on the battlefield and in the graveyard', () => {
    const g = game({
      p1: {
        battlefield: ['cid-timeless-artificer', 'magitek-infantry', 'coeurl'],
        graveyard: ['cid-timeless-artificer'],
      },
    });
    // Magitek Infantry: 1/1, +1/+0 with another artifact (none), +2/+2 from Cid.
    expect(pt(g, g.id('p1', 'magitek-infantry'))).toEqual([3, 3]);
    // Coeurl is neither an artifact creature nor a Hero.
    expect(pt(g, g.id('p1', 'coeurl'))).toEqual([2, 2]);
  });

  it("Dragoon's Wyvern makes a Hero that Cid pumps; Tidus grows when an artifact enters", () => {
    const g = game({
      p1: {
        hand: ['dragoons-wyvern', 'instant-ramen'],
        battlefield: [...n('island', 5), 'cid-timeless-artificer', 'tidus-blitzball-star'],
      },
    });
    settle(cast(g, 'dragoons-wyvern'));
    const hero = g.id('p1', 'fin-hero-token');
    expect(pt(g, hero)).toEqual([2, 2]);
    settle(cast(g, 'instant-ramen'));
    expect(g.obj(g.id('p1', 'tidus-blitzball-star')).plusOneCounters).toBe(1);
  });

  it('Ice Magic: Blizzaga shuffles the creature into its owner’s library', () => {
    const g = game({
      p1: { hand: ['ice-magic'], battlefield: n('island', 8) },
      p2: { battlefield: ['serra-angel'] },
    });
    const angel = g.id('p2', 'serra-angel');
    settle(cast(g, 'ice-magic', [g.ref(angel)], { mode: 2 }));
    expect(g.zoneOf(angel)).toBe('library');
    expect(g.state.players.p2.library.length).toBe(11);
  });

  it('Phoenix Down returns a creature card to the battlefield tapped', () => {
    const g = game({
      p1: { battlefield: [...n('plains', 2), 'phoenix-down'], graveyard: ['dragoons-wyvern'] },
    });
    const card = g.id('p1', 'dragoons-wyvern', 'graveyard');
    g.do({
      type: 'activateAbility',
      player: 'p1',
      source: g.id('p1', 'phoenix-down'),
      abilityIndex: 0,
      targets: [g.ref(card)],
    });
    settle(g);
    expect(g.zoneOf(card)).toBe('battlefield');
    expect(g.obj(card).tapped).toBe(true);
    expect(g.zoneOf(g.id('p1', 'phoenix-down', 'exile'))).toBe('exile');
  });

  it('Retrieve the Esper with flashback makes a 5/5 Robot Warrior', () => {
    const g = game({ p1: { battlefield: n('island', 6), graveyard: ['retrieve-the-esper'] } });
    const card = g.id('p1', 'retrieve-the-esper', 'graveyard');
    settle(g.do(g.legal().find((a) => a.type === 'castSpell' && a.card === card)!));
    expect(pt(g, g.id('p1', 'fin-robot-warrior-token'))).toEqual([5, 5]);
    expect(g.zoneOf(card)).toBe('exile');
  });
});

describe('Time Compression', () => {
  it("Vayne's Treachery kicked: sacrifice an artifact for -6/-6", () => {
    const g = game({
      p1: { hand: ['vaynes-treachery'], battlefield: [...n('swamp', 2), 'phoenix-down'] },
      p2: { battlefield: ['serra-angel'] },
    });
    const angel = g.id('p2', 'serra-angel');
    const down = g.id('p1', 'phoenix-down');
    const kicked = g
      .legal()
      .find(
        (a) =>
          a.type === 'castSpell' &&
          a.kicked &&
          a.sacrifice === down &&
          a.targets.some((t) => 'object' in t && t.object.id === angel),
      );
    expect(kicked).toBeDefined();
    settle(g.do(kicked!));
    expect(g.zoneOf(down)).toBe('graveyard');
    expect(g.zoneOf(angel)).toBe('graveyard');
  });

  it('Ultimecia transforms at your end step with eight cards in your graveyard and takes an extra turn', () => {
    const g = game({
      p1: {
        battlefield: [...n('island', 4), ...n('swamp', 4), 'ultimecia-time-sorceress'],
        graveyard: n('forest', 9),
      },
    });
    const u = g.id('p1', 'ultimecia-time-sorceress');
    g.passUntilStep('end');
    for (let i = 0; i < 10 && g.decision.kind !== 'optionalEffect'; i++) g.pass();
    g.do({ type: 'chooseEffect', player: 'p1', accept: true });
    settle(g);
    expect(g.obj(u).defId).toBe('ultimecia-omnipotent');
    expect(g.state.players.p1.graveyard.length).toBe(1);
    nextMain(g, 'p1');
    expect(g.state.turn.activePlayer).toBe('p1');
  });

  it('Jill bounces a permanent, then becomes Shiva, whose chapter III taps lands and returns Jill', () => {
    const g = game({
      p1: { hand: ['jill-shivas-dominant'], battlefield: n('island', 8) },
      p2: { battlefield: ['serra-angel', ...n('plains', 2)] },
    });
    const angel = g.id('p2', 'serra-angel');
    settle(cast(g, 'jill-shivas-dominant'), (legal) =>
      legal.find(
        (a) =>
          a.type === 'chooseTargets' &&
          a.targets.some((t) => 'object' in t && t.object.id === angel),
      ),
    );
    expect(g.zoneOf(angel)).toBe('hand');
    const jill = g.id('p1', 'jill-shivas-dominant');
    g.obj(jill).summoningSick = false;
    g.do(g.legal().find((a) => a.type === 'activateAbility' && a.source === jill)!);
    settle(g);
    expect(g.obj(jill).defId).toBe('shiva-warden-of-ice');
    for (let i = 0; i < 2; i++) nextMain(g);
    expect(g.obj(jill).defId).toBe('jill-shivas-dominant');
    expect(
      g.state.battlefield
        .filter((id) => g.obj(id).defId === 'plains')
        .every((id) => g.obj(id).tapped),
    ).toBe(true);
  });

  it('Locke Cole loots on combat damage', () => {
    const g = game({ p1: { battlefield: ['locke-cole'], hand: ['forest'] } });
    g.passUntilStep('beginCombat').passBoth();
    g.attack(g.id('p1', 'locke-cole'));
    for (let i = 0; i < 20 && g.state.turn.step !== 'end'; i++)
      if (g.decision.kind === 'discard') g.do(g.legal()[0]!);
      else g.pass();
    expect(g.life('p2')).toBe(18);
    expect(g.life('p1')).toBe(22);
    expect(handSize(g, 'p1')).toBe(1);
  });

  it('The Final Days with flashback makes a Horror for each creature card in your graveyard', () => {
    const g = game({
      p1: {
        battlefield: n('swamp', 6),
        graveyard: ['the-final-days', 'coeurl', 'coeurl', 'serra-angel'],
      },
    });
    const card = g.id('p1', 'the-final-days', 'graveyard');
    settle(g.do(g.legal().find((a) => a.type === 'castSpell' && a.card === card)!));
    const horrors = g.state.battlefield.filter((id) => g.obj(id).defId === 'fin-horror-token');
    expect(horrors.length).toBe(3);
    expect(horrors.every((id) => g.obj(id).tapped)).toBe(true);
  });
});

describe('random games', () => {
  it('Highwind Workshop and Time Compression play random games to completion', () => {
    const workshop = deckIds(deckById('fin-highwind-workshop'));
    const compression = deckIds(deckById('fin-time-compression'));
    const starter = deckIds(deckById('vampiric-hunger'));
    const pairings = [
      { p1: workshop, p2: compression },
      { p1: compression, p2: starter },
      { p1: starter, p2: workshop },
    ];
    for (let seed = 1; seed <= 24; seed++) {
      const decks = pairings[seed % 3]!;
      const r = playRandomGame(engine, engine.newGame({ decks, seed }), seed * 7919);
      expect(r.truncated, `seed ${seed}`).toBe(false);
      expect(r.final.decision.kind).toBe('gameOver');
    }
  }, 60_000);
});
