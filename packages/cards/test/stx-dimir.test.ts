import { describe, expect, it } from 'vitest';
import { createEngine, getCharacteristics, playRandomGame } from '@mtg/engine';
import {
  cardDb,
  deckById,
  deckGameOptions,
  deckIds,
  isPlayable,
  sideboardIds,
} from '../src/index.ts';
import { cast, game, n, pt, settle } from './blb-helpers.ts';
import type { GameDriver } from '@mtg/engine/testing';

// Strixhaven 13b: Dimir Tide (U/B).

/** Resolves the stack, declining any Learn offer (the last option) and answering scries. */
function done(g: GameDriver): GameDriver {
  for (let i = 0; i < 40; i++) {
    const d = g.decision;
    if (d.kind === 'chooseOption')
      g.do({ type: 'chooseOption', player: d.player, index: d.options.length - 1 });
    else if (d.kind === 'priority' && !g.state.stack.length) break;
    else if (d.kind !== 'priority' && d.kind !== 'gameOver' && d.kind !== 'chooseTriggerTargets')
      g.do(g.legal()[0]!);
    else if (d.kind === 'priority' && g.state.stack.length) g.pass();
    else if (d.kind === 'chooseTriggerTargets') settle(g);
    else break;
  }
  return g;
}

describe('the deck', () => {
  it('is 60 cards with 24 lands, a Lesson sideboard, 36 spells, and playable', () => {
    const d = deckById('stx-dimir-tide');
    expect(isPlayable(d)).toBe(true);
    expect(deckIds(d)).toHaveLength(60);
    expect(sideboardIds(d)).toHaveLength(4);
    const lands = deckIds(d).filter((id) => cardDb.get(id)?.types.includes('Land'));
    expect(lands).toHaveLength(24);
  });

  it('plays full random games', () => {
    const d = deckById('stx-dimir-tide');
    const engine = createEngine(cardDb);
    const other = deckById('stx-azorius-skies');
    for (let seed = 1; seed <= 6; seed++) {
      const r = playRandomGame(
        engine,
        engine.newGame({ ...deckGameOptions(seed % 2 ? d : other, seed % 2 ? other : d), seed }),
        seed * 7919,
      );
      expect(r.truncated).toBe(false);
      expect(r.final.decision.kind).toBe('gameOver');
    }
  });
});

describe('Dimir cards', () => {
  it('Promising Duskmage draws only if it had a +1/+1 counter', () => {
    const run = (counters: number) => {
      const g = game({
        p1: { battlefield: ['promising-duskmage'], library: n('swamp', 5) },
        p2: { hand: ['fell'], battlefield: ['swamp', 'swamp'] },
        active: 'p2',
      });
      g.obj(g.id('p1', 'promising-duskmage')).plusOneCounters = counters;
      const before = g.state.players.p1.hand.length;
      cast(g, 'fell', [g.ref(g.id('p1', 'promising-duskmage'))]);
      done(g);
      return g.state.players.p1.hand.length - before;
    };
    expect(run(0)).toBe(0);
    expect(run(1)).toBe(1);
  });

  it('Campus Guide puts a basic land on top of the library', () => {
    const g = game({
      p1: {
        hand: ['campus-guide'],
        battlefield: n('swamp', 2),
        library: ['serra-angel', 'island'],
      },
    });
    cast(g, 'campus-guide');
    done(g);
    const top = g.state.players.p1.library[0]!;
    expect(g.obj(top).defId).toMatch(/swamp|island/);
  });

  it('Go Blank makes the opponent discard two and exiles their graveyard', () => {
    const g = game({
      p1: { hand: ['go-blank'], battlefield: n('swamp', 3) },
      p2: { hand: ['serra-angel', 'shock', 'island'], graveyard: ['serra-angel'] },
    });
    cast(g, 'go-blank');
    done(g);
    expect(g.state.players.p2.graveyard).toHaveLength(0);
    expect(g.state.players.p2.hand.length).toBeLessThanOrEqual(1);
  });

  it('Snow Day taps two creatures that then stay tapped, and loots', () => {
    const g = game({
      p1: { hand: ['snow-day'], battlefield: n('island', 6), library: n('island', 4) },
      p2: { battlefield: ['serra-angel', 'bear-cub'] },
    });
    const a = g.id('p2', 'serra-angel');
    const b = g.id('p2', 'bear-cub');
    cast(g, 'snow-day', [g.ref(a), g.ref(b)]);
    done(g);
    expect(g.obj(a).tapped).toBe(true);
    expect(g.obj(b).tapped).toBe(true);
    expect(g.obj(a).counters?.stun).toBe(1);
    expect(g.state.players.p1.hand).toHaveLength(1);
  });

  it('Ingenious Mastery: X draws X cards', () => {
    const g = game({
      p1: { hand: ['ingenious-mastery'], battlefield: n('island', 5), library: n('island', 6) },
    });
    cast(g, 'ingenious-mastery', [], { x: 2 });
    done(g);
    expect(g.state.players.p1.hand).toHaveLength(2);
  });

  it('Ingenious Mastery for {2}{U}: draw three, the opponent gets two Treasures and scries', () => {
    const g = game({
      p1: { hand: ['ingenious-mastery'], battlefield: n('island', 3), library: n('island', 6) },
      p2: { library: n('swamp', 6) },
    });
    cast(g, 'ingenious-mastery', [], { kicked: true, x: 0 });
    for (let i = 0; i < 6 && g.decision.kind !== 'scry'; i++) g.pass();
    expect(g.decision.kind).toBe('scry');
    if (g.decision.kind === 'scry') expect(g.decision.player).toBe('p2');
    done(g);
    expect(g.state.players.p1.hand).toHaveLength(3);
    const treasures = g.state.battlefield.filter(
      (id) => g.obj(id).defId === 'treasure-token' && g.obj(id).controller === 'p2',
    );
    expect(treasures).toHaveLength(2);
  });

  it("Poet's Quill learns, gives +1/+1 and lifelink, and equips for {1}{B}", () => {
    const g = game({
      p1: {
        hand: ['poets-quill'],
        battlefield: ['bear-cub', ...n('swamp', 4)],
        sideboard: ['introduction-to-prophecy'],
      },
    });
    cast(g, 'poets-quill');
    g.passBoth();
    g.passBoth();
    expect(g.decision.kind).toBe('chooseOption');
    done(g);
    const quill = g.id('p1', 'poets-quill');
    const bear = g.id('p1', 'bear-cub');
    g.do({
      type: 'activateAbility',
      player: 'p1',
      source: quill,
      abilityIndex: 2,
      targets: [g.ref(bear)],
    } as never);
    done(g);
    expect(pt(g, bear)).toEqual([3, 3]);
    expect(getCharacteristics(g.state, cardDb, bear).keywords).toContain('lifelink');
  });
});
