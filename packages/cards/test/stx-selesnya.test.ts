import { describe, expect, it } from 'vitest';
import { createEngine, playRandomGame } from '@mtg/engine';
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

// Strixhaven 13b: Selesnya Overgrowth (G/W).

const ID = 'stx-selesnya-overgrowth';
const activate = (g: GameDriver, source: string) =>
  g.do({ type: 'activateAbility', player: g.actor, source, abilityIndex: 1, targets: [] } as never);
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
    const d = deckById(ID);
    expect(isPlayable(d)).toBe(true);
    expect(deckIds(d)).toHaveLength(60);
    expect(sideboardIds(d)).toHaveLength(4);
    const lands = deckIds(d).filter((id) => cardDb.get(id)?.types.includes('Land'));
    expect(lands).toHaveLength(24);
  });

  it('plays full random games', () => {
    const d = deckById(ID);
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
  it('Star Pupil enters with a counter and passes it on when it dies', () => {
    const g = game({
      p1: { hand: ['star-pupil', 'shock'], battlefield: ['bear-cub', 'plains', 'mountain'] },
    });
    done(cast(g, 'star-pupil'));
    const pupil = g.id('p1', 'star-pupil');
    expect(pt(g, pupil)).toEqual([1, 1]);
    const bear = g.id('p1', 'bear-cub');
    const before = pt(g, bear) as [number, number];
    done(cast(g, 'shock', [g.ref(pupil)]));
    expect(g.zoneOf(pupil)).toBe('graveyard');
    expect(pt(g, bear)).toEqual([before[0] + 1, before[1] + 1]);
  });

  it('Pilgrim of the Ages fetches a basic Plains and comes back from the graveyard for {6}', () => {
    const g = game({
      p1: {
        hand: ['pilgrim-of-the-ages'],
        battlefield: n('plains', 3),
        library: ['plains', 'forest', 'forest'],
      },
    });
    settle(cast(g, 'pilgrim-of-the-ages'));
    const d = g.decision;
    if (d.kind !== 'searchLibrary') throw new Error(`decision is ${d.kind}`);
    g.do({ type: 'chooseCard', player: g.actor, card: d.options[0] ?? null });
    expect(g.state.players.p1.hand.map((id) => g.obj(id).defId)).toEqual(['plains']);
    const h = game({ p1: { graveyard: ['pilgrim-of-the-ages'], battlefield: n('plains', 6) } });
    const id = h.id('p1', 'pilgrim-of-the-ages', 'graveyard');
    h.do({ type: 'activateAbility', player: 'p1', source: id, abilityIndex: 1, targets: [] });
    h.passBoth();
    expect(h.zoneOf(id)).toBe('hand');
  });

  it('Bookwurm gains 3 and draws, then goes back third from the top', () => {
    const g = game({
      p1: {
        hand: ['bookwurm'],
        battlefield: n('forest', 8),
        library: ['plains', 'island', 'swamp', 'mountain', 'forest'],
      },
    });
    done(cast(g, 'bookwurm'));
    expect(g.life('p1')).toBe(23);
    expect(g.state.players.p1.hand).toHaveLength(1);
    const h = game({
      p1: {
        graveyard: ['bookwurm'],
        battlefield: n('forest', 3),
        library: ['plains', 'island', 'swamp', 'mountain', 'forest'],
      },
    });
    const id = h.id('p1', 'bookwurm', 'graveyard');
    activate(h, id);
    h.passBoth();
    expect(h.zoneOf(id)).toBe('library');
    expect(h.state.players.p1.library.indexOf(id)).toBe(2);
  });
});
