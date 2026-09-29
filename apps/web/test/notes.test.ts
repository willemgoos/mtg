import { cardDb } from '@mtg/cards';
import { createEngine } from '@mtg/engine';
import { buildScenario, GameDriver } from '@mtg/engine/testing';
import { describe, expect, it } from 'vitest';
import { cardNotes } from '../src/game/notes.ts';

const engine = createEngine(cardDb);
const titles = (notes: { title: string }[]) => notes.map((n) => n.title);

describe('card notes (hover tooltips)', () => {
  it('explains printed keywords and mechanics', () => {
    const s = buildScenario(cardDb, {});
    expect(titles(cardNotes(s, 'shivan-dragon'))).toEqual(['Flying']);
    expect(titles(cardNotes(s, 'thornweald-archer'))).toEqual(['Reach', 'Deathtouch']);
    expect(titles(cardNotes(s, 'heartfire-immolator'))).toContain('Prowess');
    expect(titles(cardNotes(s, 'rampaging-baloths'))).toEqual(['Trample', 'Landfall']);
  });

  it('explains keywords a spell grants or mentions', () => {
    const s = buildScenario(cardDb, {});
    expect(titles(cardNotes(s, 'kindled-fury'))).toEqual(['First strike']);
    expect(titles(cardNotes(s, 'snakeskin-veil'))).toEqual(['Hexproof']);
    expect(titles(cardNotes(s, 'shock'))).toEqual([]);
  });

  it('shows live effects, counters, lord bonuses, damage and summoning sickness', () => {
    const g = new GameDriver(
      engine,
      buildScenario(cardDb, {
        p1: {
          hand: ['giant-growth', 'snakeskin-veil'],
          battlefield: [
            'forest',
            'forest',
            'imperious-perfect',
            { card: 'thornweald-archer', damage: 1 },
            { card: 'bear-cub', sick: true },
          ],
        },
      }),
    );
    const archer = g.id('p1', 'thornweald-archer');
    g.do({
      type: 'castSpell',
      player: 'p1',
      card: g.id('p1', 'giant-growth', 'hand'),
      targets: [g.ref(archer)],
    });
    g.passBoth();
    g.do({
      type: 'castSpell',
      player: 'p1',
      card: g.id('p1', 'snakeskin-veil', 'hand'),
      targets: [g.ref(archer)],
    });
    g.passBoth();

    const notes = cardNotes(g.state, 'thornweald-archer', archer);
    const byTitle = Object.fromEntries(notes.map((n) => [n.title, n.text]));
    expect(byTitle['Hexproof']).toBeDefined();
    expect(byTitle['Until end of turn']).toBe('+3/+3 and gains hexproof.');
    expect(byTitle['Counters']).toBe('1 +1/+1 counter (+1/+1).');
    expect(byTitle['Continuous effect']).toBe('+1/+1 from another permanent’s ability.');
    expect(byTitle['Damaged']).toMatch(/^1 damage/);

    expect(titles(cardNotes(g.state, 'bear-cub', g.id('p1', 'bear-cub')))).toEqual([
      'Summoning sickness',
    ]);
  });
});
