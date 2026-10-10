import { createEngine } from '@mtg/engine';
import { cardDb } from '@mtg/cards';
import { describe, expect, it } from 'vitest';
import { createHeuristicBot, playMatch } from '../src/index.ts';

// Tarkir: Dragonstorm (19b, clans): seeded bot-vs-bot games with three-colour decks of the Abzan, Jeskai and Sultai cards.

const engine = createEngine(cardDb);
const n = (card: string, count: number) => Array<string>(count).fill(card);

const ABZAN = [
  'skirmish-rhino',
  'reputable-merchant',
  'severance-priest',
  'felothar-dawn-of-the-abzan',
  'yathan-roadwatcher',
  'armament-dragon',
  'perennation',
  'revival-of-the-ancestors',
  'betor-kin-to-all',
];
const JESKAI = [
  'monastery-messenger',
  'jeskai-shrinekeeper',
  'jeskai-brushmaster',
  'jeskai-revelation',
  'narset-jeskai-waymaster',
  'shiko-paragon-of-the-way',
  'flamehold-grappler',
  'riverwheel-sweep',
  'new-way-forward',
  'rediscover-the-way',
];
const SULTAI = [
  'death-begets-life',
  'awaken-the-honored-dead',
  'teval-arbiter-of-virtue',
  'rakshasas-bargain',
  'fangkeepers-familiar',
  'lotuslight-dancers',
  'kheru-goldkeeper',
  'lie-in-wait',
  'kotis-the-fangkeeper',
  'gurmag-nightwatch',
];
const FIVE = ['call-the-spirit-dragons'];

const lands = (...colors: string[]) => colors.flatMap((c) => n(c, 8)).slice(0, 24);
const build = (cards: string[], colors: string[]) => [
  ...lands(...colors),
  ...cards.flatMap((c) => n(c, 2)).slice(0, 36),
];
const DECKS: Record<string, string[]> = {
  abzan: build(ABZAN, ['plains', 'swamp', 'forest']),
  jeskai: build(JESKAI, ['island', 'mountain', 'plains']),
  sultai: build([...SULTAI, ...FIVE], ['swamp', 'forest', 'island']),
};

describe('bot-vs-bot games with the clans cards', () => {
  it.each([
    ['abzan', 'jeskai'],
    ['jeskai', 'sultai'],
    ['sultai', 'abzan'],
    ['sultai', 'sultai'],
  ])('%s vs %s plays to a result, error-free', (a, b) => {
    for (let seed = 1; seed <= 3; seed++) {
      const r = playMatch(
        engine,
        { p1: DECKS[a]!, p2: DECKS[b]! },
        { p1: createHeuristicBot(cardDb), p2: createHeuristicBot(cardDb) },
        seed,
        { startingPlayer: seed % 2 ? 'p1' : 'p2' },
      );
      expect(r.winner, `seed ${seed}`).not.toBeNull();
      expect(r.actions.length, `seed ${seed}`).toBeLessThan(5000);
    }
  }, 240_000);
});
