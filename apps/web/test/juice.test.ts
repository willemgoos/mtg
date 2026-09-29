import type { GameEvent, GameState } from '@mtg/engine';
import { describe, expect, it } from 'vitest';
import { juiceFor } from '../src/game/juice.ts';

const view = {
  players: { p1: {}, p2: {} },
  objects: {
    o1: { id: 'o1', defId: 'shivan-dragon', controller: 'p1' },
    o2: { id: 'o2', defId: 'forest', controller: 'p1' },
    o3: { id: 'o3', defId: 'lightning-strike', controller: 'p2' },
  },
} as unknown as GameState;

const cues = (events: GameEvent[]) => juiceFor(events, view, 'p1');

describe('event effects', () => {
  it('lands a creature spell hard, by its mana value, after its flight', () => {
    expect(
      cues([
        { type: 'resolved', id: 'o1' },
        { type: 'objectMoved', id: 'o1', defId: 'shivan-dragon', from: 'stack', to: 'battlefield' },
      ]),
    ).toEqual([{ kind: 'land', id: 'o1', hue: 'R', weight: 6, flew: true }]);
  });

  it('colours lands by their basic type and sparks them when tapped', () => {
    expect(cues([{ type: 'tapped', id: 'o2' }])).toEqual([{ kind: 'mana', id: 'o2', hue: 'G' }]);
    expect(cues([{ type: 'tapped', id: 'o1' }])).toEqual([]);
  });

  it('bursts a resolving instant off the stack, and smokes a fizzle', () => {
    const done = (type: 'resolved' | 'fizzled'): GameEvent[] => [
      { type, id: 'o3' },
      { type: 'objectMoved', id: 'o3', defId: 'lightning-strike', from: 'stack', to: 'graveyard' },
    ];
    expect(cues(done('resolved'))).toEqual([
      { kind: 'resolve', id: 'o3', hue: 'R', fizzled: false },
    ]);
    expect(cues(done('fizzled'))[0]).toMatchObject({ kind: 'resolve', fizzled: true });
  });

  it('sends attackers at the other player and burns up creatures that die', () => {
    expect(cues([{ type: 'attackersDeclared', attackers: ['o1'] }])).toEqual([
      { kind: 'attack', id: 'o1', defender: 'p2' },
    ]);
    expect(
      cues([
        {
          type: 'objectMoved',
          id: 'o1',
          defId: 'shivan-dragon',
          from: 'battlefield',
          to: 'graveyard',
        },
      ]),
    ).toEqual([{ kind: 'die', id: 'o1', hue: 'R' }]);
  });

  it('only celebrates your own win, and skips zero damage', () => {
    expect(cues([{ type: 'gameOver', winner: 'p1' }])).toEqual([{ kind: 'win' }]);
    expect(cues([{ type: 'gameOver', winner: 'p2' }])).toEqual([]);
    expect(
      cues([{ type: 'damageDealt', source: 'o3', to: { player: 'p1' }, amount: 0, combat: false }]),
    ).toEqual([]);
  });
});
