import { deckById } from '@mtg/cards';
import { describe, expect, it } from 'vitest';
import {
  costSymbols,
  deckColumns,
  deckEntries,
  deckSections,
  manaValue,
  total,
} from '../src/game/deckView.ts';
import { ruleNotes } from '../src/game/notes.ts';

describe('deck view', () => {
  it('reads mana costs', () => {
    expect(manaValue('{2}{W}{W}')).toBe(4);
    expect(manaValue('{X}{R}')).toBe(1);
    expect(manaValue('')).toBe(0);
    expect(costSymbols('{1}{W/U}')).toEqual(['1', 'W/U']);
  });

  it('groups a deck into mana value columns with lands last', () => {
    const entries = deckEntries(deckById('path-of-power'));
    expect(total(entries)).toBe(60);
    const cols = deckColumns(entries);
    expect(cols.at(-1)!.label).toBe('Lands');
    expect(cols.reduce((n, c) => n + total(c.cards), 0)).toBe(60);
    for (const c of cols.slice(0, -1))
      for (const e of c.cards)
        expect(c.label).toBe(
          e.manaValue >= 6 ? '6+' : e.manaValue <= 1 ? '0–1' : String(e.manaValue),
        );
  });

  it('lists creatures, then spells, then lands', () => {
    const sections = deckSections(deckEntries(deckById('cat-attack')));
    expect(sections.map((s) => s.title)).toEqual(['Creatures', 'Spells', 'Lands']);
    expect(sections.reduce((n, s) => n + total(s.cards), 0)).toBe(60);
  });

  it('explains printed keywords without a game', () => {
    expect(ruleNotes('shivan-dragon').map((n) => n.title)).toEqual(['Flying']);
  });
});
