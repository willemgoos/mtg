import { describe, expect, it } from 'vitest';
import { getCharacteristics } from '@mtg/engine';
import type { GameDriver } from '@mtg/engine/testing';
import { cardDb } from '../src/index.ts';
import { cast, settle } from './blb-helpers.ts';
import { board, done, exile, game, gy, hand, n, passTo, pt, stop } from './ecl-special-helpers.ts';

// Tarkir: Dragonstorm 19b, group clans: the Jeskai cards.

const chars = (g: GameDriver, id: string) => getCharacteristics(g.state, cardDb, id);
const keywords = (g: GameDriver, id: string) => [...chars(g, id).keywords];
const on = (g: GameDriver, defId: string, p: 'p1' | 'p2' = 'p1') => board(g, defId, p);
const lands = (...xs: [string, number][]) => xs.flatMap(([c, k]) => n(c, k));

/** Passes through combat (declaring `attackers` first) up to the second main phase. */
function attackWith(g: GameDriver, ...attackers: string[]): void {
  for (let i = 0; i < 40 && g.decision.kind !== 'declareAttackers'; i++) {
    if (g.decision.kind === 'priority') g.pass();
    else done(g);
  }
  g.attack(...attackers);
  for (let i = 0; i < 40 && g.state.turn.step !== 'main2'; i++) {
    if (g.decision.kind === 'declareBlockers') g.do({ type: 'confirmBlockers', player: g.actor === 'p1' ? 'p2' : 'p1' });
    else if (g.decision.kind === 'priority') g.pass();
    else done(g);
  }
}

describe('Jeskai', () => {
  it('Monastery Messenger: flying, vigilance; puts a noncreature, nonland card from your graveyard on top of your library', () => {
    const g = game({
      p1: {
        hand: ['monastery-messenger'],
        graveyard: ['serra-angel', 'lightning-bolt', 'plains'],
        battlefield: lands(['island', 2], ['mountain', 2], ['plains', 2]),
      },
    });
    cast(g, 'monastery-messenger');
    const legal = settle(g, (l) =>
      l.find(
        (a) =>
          a.type === 'chooseTargets' &&
          a.targets.some((t) => 'object' in t && g.obj(t.object.id).defId === 'lightning-bolt'),
      ),
    );
    done(legal);
    expect(g.state.players.p1.library[0]).toBe(g.id('p1', 'lightning-bolt', 'library'));
    expect(gy(g)).toEqual(['serra-angel', 'plains']);
    expect(keywords(g, g.id('p1', 'monastery-messenger'))).toEqual(
      expect.arrayContaining(['flying', 'vigilance']),
    );
  });

  it('Monastery Messenger cannot take a creature or a land: with only those the trigger has no target', () => {
    const g = game({
      p1: {
        hand: ['monastery-messenger'],
        graveyard: ['serra-angel', 'plains'],
        battlefield: lands(['island', 2], ['mountain', 2], ['plains', 2]),
      },
    });
    cast(g, 'monastery-messenger');
    done(g);
    expect(gy(g)).toEqual(['serra-angel', 'plains']);
  });

  it('Jeskai Shrinekeeper: flying, haste; combat damage to a player gains 1 life and draws a card', () => {
    const g = game({ p1: { hand: ['jeskai-shrinekeeper'], battlefield: lands(['island', 2], ['mountain', 2], ['plains', 2]) } });
    cast(g, 'jeskai-shrinekeeper');
    done(g);
    const before = hand(g).length;
    attackWith(g, g.id('p1', 'jeskai-shrinekeeper'));
    done(g);
    expect(g.life('p2')).toBe(17);
    expect(g.life('p1')).toBe(21);
    expect(hand(g).length).toBe(before + 1);
  });

  it('Jeskai Brushmaster: double strike and prowess', () => {
    const g = game({
      p1: { hand: ['lightning-bolt'], battlefield: ['jeskai-brushmaster', ...lands(['mountain', 1])] },
    });
    const m = g.id('p1', 'jeskai-brushmaster');
    expect(keywords(g, m)).toContain('doubleStrike');
    expect(pt(g, m)).toEqual([2, 4]);
    cast(g, 'lightning-bolt', [{ player: 'p2' }]);
    stop(g);
    expect(pt(g, m)).toEqual([3, 5]);
  });

  it('Jeskai Revelation: bounces a permanent, 4 damage, two prowess Monks, draws two, gains four', () => {
    const g = game({
      p1: { hand: ['jeskai-revelation'], battlefield: lands(['island', 2], ['mountain', 3], ['plains', 2]) },
      p2: { battlefield: ['serra-angel'] },
    });
    const angel = g.id('p2', 'serra-angel');
    cast(g, 'jeskai-revelation', [g.ref(angel), { player: 'p2' }]);
    done(g);
    expect(g.zoneOf(angel)).toBe('hand');
    expect(g.life('p2')).toBe(16);
    expect(g.life('p1')).toBe(24);
    const monks = on(g, 'tdm-monk-token');
    expect(monks).toHaveLength(2);
    expect(keywords(g, monks[0]!)).toEqual([]);
    expect(hand(g).length).toBe(2);
  });

  it('Jeskai Revelation: can return a spell on the stack to its owner\'s hand', () => {
    const g = game({
      p1: { hand: ['jeskai-revelation'], battlefield: lands(['island', 2], ['mountain', 3], ['plains', 2]) },
      p2: { hand: ['serra-angel'], battlefield: lands(['plains', 5]) },
      active: 'p2',
    });
    cast(g, 'serra-angel');
    g.pass();
    const angel = g.state.stack.find((x) => g.obj(x.id).defId === 'serra-angel')!.id;
    cast(g, 'jeskai-revelation', [g.ref(angel), { player: 'p2' }]);
    done(g);
    expect(g.zoneOf(angel)).toBe('hand');
    expect(g.state.stack).toHaveLength(0);
  });

  it('Narset: at your end step you may discard your hand and draw a card for each spell you cast this turn', () => {
    const g = game({
      p1: {
        hand: ['lightning-bolt', 'shock', 'plains', 'island', 'giant-growth'],
        battlefield: ['narset-jeskai-waymaster', ...lands(['mountain', 2], ['island', 1])],
      },
    });
    cast(g, 'lightning-bolt', [{ player: 'p2' }]);
    done(g);
    cast(g, 'shock', [{ player: 'p2' }]);
    done(g);
    passTo(g, 'end');
    done(g);
    expect(hand(g).length).toBe(2);
    expect(gy(g)).toEqual(expect.arrayContaining(['plains', 'island', 'giant-growth']));
  });

  it('Narset: declining keeps your hand', () => {
    const g = game({
      p1: { hand: ['plains', 'island'], battlefield: ['narset-jeskai-waymaster'] },
    });
    passTo(g, 'end');
    done(g, { accept: false });
    expect(hand(g)).toEqual(['plains', 'island']);
  });

  it('Shiko: exiles a nonland card with mana value 3 or less from your graveyard and may cast a copy for free', () => {
    const g = game({
      p1: {
        hand: ['shiko-paragon-of-the-way'],
        graveyard: ['lightning-bolt', 'serra-angel'],
        battlefield: lands(['island', 2], ['mountain', 3], ['plains', 2]),
      },
    });
    cast(g, 'shiko-paragon-of-the-way');
    stop(g);
    settle(g, (l) =>
      l.find(
        (a) =>
          a.type === 'chooseTargets' &&
          a.targets.some((t) => 'object' in t && g.obj(t.object.id).defId === 'lightning-bolt'),
      ),
    );
    stop(g);
    expect(exile(g)).toContain('lightning-bolt');
    expect(g.decision.kind).toBe('castFree');
    const copy = g.legal().find((a) => a.type === 'castSpell' && a.targets.some((t) => 'player' in t && t.player === 'p2'));
    g.do(copy!);
    done(g);
    expect(g.life('p2')).toBe(17);
    // Only the copy ceased to exist; the original card stays exiled.
    expect(exile(g)).toEqual(['lightning-bolt']);
  });

  it('Flamehold Grappler: copies the next spell you cast this turn, with new targets', () => {
    const g = game({
      p1: {
        hand: ['flamehold-grappler', 'lightning-bolt', 'shock'],
        battlefield: lands(['island', 1], ['mountain', 3], ['plains', 1]),
      },
    });
    cast(g, 'flamehold-grappler');
    done(g);
    cast(g, 'lightning-bolt', [{ player: 'p2' }]);
    stop(g);
    // The copy is on the stack above the Bolt; it may choose new targets (here: the same player).
    done(g);
    expect(g.life('p2')).toBe(14);
    // Only the next spell: Shock is not copied.
    cast(g, 'shock', [{ player: 'p2' }]);
    done(g);
    expect(g.life('p2')).toBe(12);
  });

  it('Riverwheel Sweep: taps the creature, three stun counters, exiles two and you may play one until the end of your next turn', () => {
    const g = game({
      p1: {
        hand: ['riverwheel-sweep'],
        library: ['lightning-bolt', 'plains', 'forest'],
        battlefield: lands(['island', 2], ['mountain', 2], ['plains', 2]),
      },
      p2: { battlefield: ['serra-angel'] },
    });
    const angel = g.id('p2', 'serra-angel');
    cast(g, 'riverwheel-sweep', [g.ref(angel)]);
    done(g);
    expect(g.obj(angel).tapped).toBe(true);
    expect(g.obj(angel).counters?.stun).toBe(3);
    expect(exile(g).sort()).toEqual(['lightning-bolt', 'plains'].sort());
    // Exactly one of the two (the chosen one) may be played until the end of your next turn.
    const playable = g.state.players.p1.exile.filter((id) => g.obj(id).playableUntilTurn !== undefined);
    expect(playable).toHaveLength(1);
    expect(g.obj(playable[0]!).playableUntilTurn).toBeGreaterThan(g.state.turn.number);
  });
});
