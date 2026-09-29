import type { GameEvent } from '@mtg/engine';
import { describe, expect, it } from 'vitest';
import { soundsFor } from '../src/game/sound.ts';

const names = (events: GameEvent[]) => soundsFor(events, 'p1').map((c) => c.name);

describe('event sounds', () => {
  it('plays a creature spell landing, not a resolve chime', () => {
    expect(
      names([
        { type: 'resolved', id: 'o1' },
        { type: 'objectMoved', id: 'o1', defId: 'shivan-dragon', from: 'stack', to: 'battlefield' },
      ]),
    ).toEqual(['place']);
  });

  it('chimes when an instant resolves, and not for abilities', () => {
    expect(
      names([
        { type: 'resolved', id: 'o2' },
        { type: 'objectMoved', id: 'o2', defId: 'giant-growth', from: 'stack', to: 'graveyard' },
      ]),
    ).toEqual(['chime']);
    expect(names([{ type: 'resolved', id: 'a1' }])).toEqual([]);
  });

  it('plays each sound once per batch', () => {
    const draws: GameEvent[] = [1, 2, 3].map((n) => ({
      type: 'cardDrawn',
      player: 'p1',
      id: `d${n}`,
      nth: n,
    }));
    expect(names(draws)).toEqual(['slide']);
  });

  it('only thuds for creatures dying, and tells hits on players from hits on creatures', () => {
    expect(
      names([
        { type: 'damageDealt', source: 'x', to: { player: 'p2' }, amount: 3, combat: true },
        {
          type: 'objectMoved',
          id: 'c',
          defId: 'shivan-dragon',
          from: 'battlefield',
          to: 'graveyard',
        },
      ]),
    ).toEqual(['hitPlayer', 'die']);
  });

  it('marks the start of my turn and the end of the game', () => {
    expect(names([{ type: 'stepChanged', turn: 3, step: 'upkeep', activePlayer: 'p1' }])).toEqual([
      'turn',
    ]);
    expect(names([{ type: 'stepChanged', turn: 4, step: 'upkeep', activePlayer: 'p2' }])).toEqual(
      [],
    );
    expect(names([{ type: 'gameOver', winner: 'p2' }])).toEqual(['lose']);
  });
});
