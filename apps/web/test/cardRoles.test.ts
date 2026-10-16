import { scryfallById, slug } from '@mtg/cards';
import { describe, expect, it } from 'vitest';
import { cardRoles } from '../src/game/cardRoles.ts';
import { FOUNDATIONS_SHEETS, packsWith, STRIXHAVEN_SHEETS } from '../src/game/seasonPacks.ts';

const roles = (name: string) => cardRoles(scryfallById.get(slug(name))!);

describe('card roles', () => {
  it('reads what a card does from its text', () => {
    expect(roles('Shock')).toEqual(['removal']);
    expect(roles('Banishing Light')).toContain('removal');
    expect(roles('Day of Judgment')).toEqual(['wipe']);
    expect(roles('Cancel')).toEqual(['counter']);
    expect(roles('Opt')).toContain('draw');
    expect(roles('Llanowar Elves')).toEqual(['ramp']);
    expect(roles('Giant Growth')).toEqual(['trick']);
    expect(roles('Vampire Nighthawk')).toEqual(['lifegain']);
    expect(roles('Dragon Fodder')).toEqual(['tokens']);
  });

  it('gives plain creatures and lands no role', () => {
    expect(roles('Evolving Wilds')).toEqual([]);
    expect(roles('Gnarlid Colony')).toEqual([]);
  });
});

describe('packs with a card', () => {
  it('names the boosters a card comes from', () => {
    expect(packsWith(FOUNDATIONS_SHEETS.common[0]!)).toContain('foundations');
    expect(packsWith(STRIXHAVEN_SHEETS.rare[0]!)).toContain('strixhaven');
    expect(packsWith('not-a-card')).toEqual([]);
  });
});
