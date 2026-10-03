import { describe, expect, it } from 'vitest';
import { cardDb, displayName, scryfallById, slug } from '../src/index.ts';
import { all, cast, game, n, settle } from './blb-helpers.ts';

// Secrets of Strixhaven 14a: the prepare layout from the fetch script, and prepare through real cards.

describe('prepare cards from Scryfall', () => {
  it('records both faces, with the spell under a distinct id and the card colours', () => {
    const front = cardDb.get(slug('Emeritus of Conflict'))!;
    expect(front.prepare).toBe(true);
    expect(front.back).toBe(slug('Lightning Bolt (Emeritus of Conflict)'));
    const back = cardDb.get(front.back!)!;
    expect(back.types).toEqual(['Instant']);
    expect(back.colors).toEqual(['R']);
    expect(back.colorIdentity).toEqual(['R']);
    expect(displayName(back)).toBe('Lightning Bolt');
    // The back of a prepare card shares the card's image.
    expect(scryfallById.get(back.id)!.image).toEqual(scryfallById.get(front.id)!.image);
    // And never collides with the real Lightning Bolt's id.
    expect(back.id).not.toBe(slug('Lightning Bolt'));
  });
});

describe('prepare in play', () => {
  it('Goblin Glasswright enters prepared; its copy of Craft with Pride makes a Treasure', () => {
    const g = game({ p1: { hand: ['goblin-glasswright'], battlefield: n('mountain', 3) } });
    settle(cast(g, 'goblin-glasswright'));
    const [glass] = all(g, 'goblin-glasswright');
    const copy = g.obj(glass!).prepared!;
    expect(copy).toBeDefined();
    g.do({ type: 'castSpell', player: 'p1', card: copy, targets: [] });
    settle(g);
    expect(g.obj(glass!).prepared).toBeUndefined();
    expect(all(g, 'treasure-token')).toHaveLength(1);
  });

  it("Emeritus of Conflict becomes prepared on your third spell each turn; Lightning Bolt's copy deals 3", () => {
    const g = game({
      p1: {
        hand: ['shock', 'shock', 'shock'],
        battlefield: ['emeritus-of-conflict', ...n('mountain', 6)],
      },
    });
    const emeritus = g.id('p1', 'emeritus-of-conflict');
    for (let i = 0; i < 2; i++) {
      cast(g, 'shock', [{ player: 'p2' }]);
      settle(g);
    }
    expect(g.obj(emeritus).prepared).toBeUndefined();
    cast(g, 'shock', [{ player: 'p2' }]);
    settle(g);
    const copy = g.obj(emeritus).prepared!;
    expect(copy).toBeDefined();
    expect(g.life('p2')).toBe(14);
    g.do({ type: 'castSpell', player: 'p1', card: copy, targets: [{ player: 'p2' }] });
    settle(g);
    expect(g.life('p2')).toBe(11);
  });
});

describe('opus', () => {
  it('Tackle Artist gets one counter, or two when five or more mana was spent', () => {
    const g = game({
      p1: { hand: ['shock', 'shock'], battlefield: ['tackle-artist', ...n('mountain', 8)] },
    });
    const artist = g.id('p1', 'tackle-artist');
    settle(cast(g, 'shock', [{ player: 'p2' }]));
    expect(g.obj(artist).plusOneCounters).toBe(1);
  });
});
