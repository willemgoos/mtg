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

// Strixhaven 13b: Gruul Stampede (R/G).

const activate = (g: GameDriver, source: string, index = 0, target?: string) =>
  g.do(
    g
      .legal()
      .find(
        (a) =>
          a.type === 'activateAbility' &&
          a.source === source &&
          a.abilityIndex === index &&
          (target === undefined ||
            JSON.stringify((a as { targets?: unknown }).targets).includes(target)),
      )!,
  );
/** Resolves the stack, declining any Learn offer (the last option). */
function done(g: GameDriver): GameDriver {
  for (let i = 0; i < 40; i++) {
    const d = g.decision;
    if (d.kind === 'chooseOption')
      g.do({ type: 'chooseOption', player: d.player, index: d.options.length - 1 });
    else if (d.kind === 'priority' && g.state.stack.length) g.pass();
    else if (d.kind === 'chooseTriggerTargets') settle(g);
    else break;
  }
  return g;
}

describe('the deck', () => {
  it('is 60 cards with 24 lands, a Lesson sideboard, and playable', () => {
    const d = deckById('stx-gruul-stampede');
    expect(isPlayable(d)).toBe(true);
    expect(deckIds(d)).toHaveLength(60);
    expect(sideboardIds(d)).toHaveLength(4);
    const lands = deckIds(d).filter((id) => cardDb.get(id)?.types.includes('Land'));
    expect(lands).toHaveLength(24);
  });

  it('plays full random games', () => {
    const d = deckById('stx-gruul-stampede');
    const other = deckById('stx-quandrix-equation');
    const engine = createEngine(cardDb);
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

describe('new cards', () => {
  it('Hall Monitor stops a creature blocking this turn', () => {
    const g = game({
      p1: { battlefield: ['hall-monitor', 'mountain', 'mountain'] },
      p2: { battlefield: ['serra-angel'] },
    });
    const angel = g.id('p2', 'serra-angel');
    expect(getCharacteristics(g.state, cardDb, angel).cantBlock).toBe(false);
    activate(g, g.id('p1', 'hall-monitor'), 0, angel);
    settle(g);
    done(g);
    expect(getCharacteristics(g.state, cardDb, angel).cantBlock).toBe(true);
  });

  it('Reckless Amplimancer doubles its power and toughness', () => {
    const g = game({
      p1: { battlefield: ['reckless-amplimancer', ...n('forest', 5)] },
    });
    const id = g.id('p1', 'reckless-amplimancer');
    const [p, t] = pt(g, id);
    activate(g, id);
    done(g);
    expect(pt(g, id)).toEqual([p! * 2, t! * 2]);
  });

  it('Mascot Interception steals a creature with haste and +2/+0', () => {
    const g = game({
      p1: { hand: ['mascot-interception'], battlefield: n('mountain', 4) },
      p2: { battlefield: ['serra-angel'] },
    });
    const angel = g.id('p2', 'serra-angel');
    const [p] = pt(g, angel);
    cast(g, 'mascot-interception', [g.ref(angel)]);
    done(g);
    expect(g.obj(angel).controller).toBe('p1');
    expect(getCharacteristics(g.state, cardDb, angel).keywords).toContain('haste');
    expect(pt(g, angel)[0]).toBe(p! + 2);
  });

  it('Mascot Interception costs {3} less when it targets a creature token', () => {
    const g = game({
      p1: {
        hand: ['professor-of-zoomancy', 'mascot-interception'],
        battlefield: [...n('forest', 4), 'mountain'],
      },
    });
    done(cast(g, 'professor-of-zoomancy'));
    const pest = g.state.battlefield.find((id) => g.obj(id).defId === 'stx-pest-token')!;
    cast(g, 'mascot-interception', [g.ref(pest)]);
    done(g);
    expect(g.zoneOf(g.id('p1', 'mascot-interception', 'graveyard'))).toBe('graveyard');
  });

  it('Team Pennant gives +1/+1, vigilance and trample; equipping a non-token costs {3}', () => {
    const g = game({
      p1: { battlefield: ['team-pennant', 'twinscroll-shaman', ...n('mountain', 3)] },
    });
    const guy = g.id('p1', 'twinscroll-shaman');
    const [p, t] = pt(g, guy);
    // The {1} equip only targets tokens, so the shaman needs the {3} equip (index 2).
    expect(g.legal().some((a) => a.type === 'activateAbility' && a.abilityIndex === 1)).toBe(false);
    activate(g, g.id('p1', 'team-pennant'), 2);
    settle(g);
    expect(pt(g, guy)).toEqual([p! + 1, t! + 1]);
    const kw = getCharacteristics(g.state, cardDb, guy).keywords;
    expect(kw).toContain('vigilance');
    expect(kw).toContain('trample');
  });
});
