import { cardDb, findDeck, SCRYFALL, slug } from '@mtg/cards';
import { describe, expect, it } from 'vitest';
import { ECL_BOOSTER_LIST } from '../../../packages/cards/src/ecl/booster-list.ts';
import { PACK_SET_NAMES, type PackSet, rollPlayBooster, size } from '../src/game/expedition.ts';
import {
  addSealedBasics,
  applySealedSuggestion,
  canPlay,
  colorsName,
  currentOpponent,
  emptySealed,
  grantSealedPool,
  leaveSealed,
  loadSealed,
  markSealedRevealed,
  matchNumber,
  moveSealedCard,
  opponentFor,
  paySealedPrize,
  prizeFor,
  recordSealedMatch,
  registerSealedDecks,
  resignSealed,
  saveSealed,
  SEALED_PRIZES,
  sealedDeckCards,
  sealedPacks,
  sealedPool,
  sealedPromo,
  sealedPlayerDeck,
  SEASON_PACK_OF,
  startSealed,
  startSealedMatch,
  statusOf,
  summarizeSealed,
  type SealedState,
} from '../src/game/sealed.ts';
import {
  openSeasonPack,
  SEASON_CARDS,
  SEASON_STARTERS,
  type SeasonSave,
} from '../src/game/season.ts';
import { packGenerator } from '../src/game/seasonPacks.ts';
import { createSeasonRepository, validateSeasonSave } from '../src/game/seasonStorage.ts';

const SETS = Object.keys(PACK_SET_NAMES) as PackSet[];
const eclRarity = new Map<string, string>(ECL_BOOSTER_LIST);
const known = new Set(SCRYFALL.map((c) => c.name));

/** A Season repository on in-memory storage, with one save "a". */
function seasonFixture() {
  const values = new Map<string, string>();
  const repo = createSeasonRepository({
    getItem: (k) => values.get(k) ?? null,
    setItem: (k, v) => void values.set(k, v),
  });
  repo.create('a', 'First', SEASON_STARTERS[0]!.id, 1, 100);
  return repo;
}
const saveOf = (repo: ReturnType<typeof seasonFixture>, id = 'a'): SeasonSave =>
  repo.load().saves.find((s) => s.id === id)!;

/** An event with a suggested deck, ready for matches. */
const ready = (set: PackSet = 'fdn', seed = 7, save: string | null = 'a'): SealedState =>
  applySealedSuggestion(startSealed(emptySealed(), set, seed, save));

let nextSeed = 1000;
/** Plays one match to the given outcome. */
function play(s: SealedState, outcome: 'win' | 'loss' | 'draw'): SealedState {
  const seed = nextSeed++;
  return recordSealedMatch(startSealedMatch(s, seed), seed, outcome);
}

const installStorage = (store: Map<string, string>) =>
  Object.assign(globalThis, {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    },
  });

describe('sealed pool', () => {
  it('is deterministic from the seed and holds six boosters', () => {
    const a = startSealed(emptySealed(), 'fdn', 42, null);
    const b = startSealed(emptySealed(), 'fdn', 42, null);
    expect(a.event).toEqual(b.event);
    expect(sealedPacks(a.event!)).toEqual(sealedPacks(b.event!));
    expect(sealedPacks(a.event!)).toHaveLength(6);
    expect(sealedPacks(startSealed(emptySealed(), 'fdn', 43, null).event!)).not.toEqual(
      sealedPacks(a.event!),
    );
    expect(a.event!.main).toEqual({});
  });

  it.each(SETS)('%s: six 14-card Play Boosters of known cards and a promo rare', (set) => {
    const e = startSealed(emptySealed(), set, 9, null).event!;
    const packs = sealedPacks(e);
    for (const p of packs) expect(p).toHaveLength(14);
    const promo = sealedPromo(e);
    expect(sealedPromo(e)).toBe(promo);
    expect(['rare', 'mythic']).toContain(SCRYFALL.find((c) => c.name === promo)?.rarity);
    const basics = new Set(['Plains', 'Island', 'Swamp', 'Mountain', 'Forest']);
    const kept = [promo, ...packs.flat()].filter((n) => !basics.has(n));
    expect(sealedPool(e)).toEqual(kept);
    expect(size(e.side)).toBe(kept.length);
    expect(kept.length).toBeGreaterThanOrEqual(79);
    for (const name of kept) {
      expect(known.has(name)).toBe(true);
      expect(cardDb.has(slug(name))).toBe(true);
    }
  });

  it.each(SETS)('%s: a Play Booster has the slots of a real one', (set) => {
    for (let seed = 1; seed <= 40; seed++) {
      const { cards, foil } = rollPlayBooster(seed, set);
      expect(cards).toHaveLength(14);
      // ECL's reprints keep an earlier printing's card data, so its rarities come from the booster list.
      const rarity = (n: string) =>
        (set === 'ecl' ? eclRarity.get(n) : undefined) ??
        (SCRYFALL.find((c) => c.name === n && c.set === set) ?? SCRYFALL.find((c) => c.name === n))
          ?.rarity;
      const archive = set === 'stx' || set === 'sos';
      // Seven commons, three uncommons. STX and SOS reprint commons and archive cards whose
      // card data comes from other printings, so only the other sets can check rarity here.
      if (!archive) expect(cards.slice(0, 7).every((n) => rarity(n) === 'common')).toBe(true);
      if (!archive) expect(cards.slice(7, 10).every((n) => rarity(n) === 'uncommon')).toBe(true);
      if (!archive) expect(['rare', 'mythic']).toContain(rarity(cards[11]!));
      expect(foil).toBe(12);
      // The land slot: a basic or a land.
      expect(SCRYFALL.find((c) => c.name === cards[13])?.typeLine ?? 'Basic Land').toMatch(/Land/);
      // The fixed slots don't repeat a card.
      const fixed = [...cards.slice(0, 10), cards[11]];
      expect(new Set(fixed).size).toBe(fixed.length);
    }
  });

  it('keeps the pool in side and lets you build a deck', () => {
    let s = startSealed(emptySealed(), 'fdn', 5, null);
    const pool = size(s.event!.side);
    const [name] = Object.keys(s.event!.side);
    s = moveSealedCard(s, name!, 'main');
    expect(s.event!.main[name!]).toBe(1);
    expect(size(s.event!.side)).toBe(pool - 1);
    s = moveSealedCard(s, name!, 'side');
    expect(s.event!.main[name!]).toBeUndefined();
    expect(size(s.event!.side)).toBe(pool);
    // a card you don't hold can't move
    expect(moveSealedCard(s, name!, 'side')).toEqual(s);
    // basics are free and never in side
    s = addSealedBasics(s, 'G', 17);
    expect(s.event!.main.Forest).toBe(17);
    s = moveSealedCard(s, 'Forest', 'side');
    expect(s.event!.main.Forest).toBe(16);
    expect(s.event!.side.Forest).toBeUndefined();
    s = addSealedBasics(s, 'G', -100);
    expect(s.event!.main.Forest).toBeUndefined();
    expect(canPlay(s.event!)).toBe(false);
  });

  it.each(SETS)('%s: Suggest a deck makes a playable deck from the pool', (set) => {
    const s = ready(set, 11, null);
    expect(canPlay(s.event!)).toBe(true);
    expect(sealedDeckCards(s.event!)).toHaveLength(size(s.event!.main));
    for (const id of sealedDeckCards(s.event!)) expect(cardDb.has(id)).toBe(true);
    const deck = sealedPlayerDeck(s.event!);
    expect(deck.id).toBe(`sealed:${s.event!.id}:you`);
    expect(findDeck(deck.id)).toBe(deck);
    expect(deck.series).toBe('sealed');
  });
});

describe('sealed opponents', () => {
  it.each(SETS)('%s: decks are legal, deterministic and registered', (set) => {
    const e = ready(set, 21).event!;
    for (const n of [0, 1, 2]) {
      const a = opponentFor(e, n);
      const b = opponentFor(e, n);
      expect(a).toEqual(b);
      expect(a.deck.id).toBe(`sealed:${e.id}:${n}`);
      expect(findDeck(a.deck.id)).toBe(b.deck);
      expect(a.deck.cards.reduce((t, [, k]) => t + k, 0)).toBeGreaterThanOrEqual(40);
      for (const [name] of a.deck.cards) expect(cardDb.has(slug(name))).toBe(true);
      expect(['easy', 'heuristic', 'search']).toContain(a.bot);
      expect(a.deck.name).toMatch(/^[A-Z][a-z]+$/);
      expect(a.deck.cards.map(([c]) => c)).toContain(a.deck.face);
      expect(a.deck.set).toBe(set === 'fdn' ? undefined : set);
    }
    expect(opponentFor(e, 0).deck.cards).not.toEqual(opponentFor(e, 1).deck.cards);
  });

  it('differ between events', () => {
    const a = ready('fdn', 1).event!;
    const b = ready('fdn', 2).event!;
    expect(opponentFor(a, 0).deck.cards).not.toEqual(opponentFor(b, 0).deck.cards);
  });

  it('lean tougher with wins', () => {
    const e = ready('fdn', 3).event!;
    const share = (wins: number) => {
      let tough = 0;
      for (let n = 0; n < 300; n++)
        if (opponentFor({ ...e, seed: n, wins }, n).bot === 'search') tough++;
      return tough / 300;
    };
    expect(share(6)).toBeGreaterThan(share(0));
  });

  it('start gently: no Master before 2 wins, no Novice from 3 wins', () => {
    const e = ready('fdn', 3).event!;
    for (let n = 0; n < 200; n++) {
      expect(opponentFor({ ...e, seed: n, wins: 0 }, n).bot).not.toBe('search');
      expect(opponentFor({ ...e, seed: n, wins: 1 }, n).bot).not.toBe('search');
      expect(opponentFor({ ...e, seed: n, wins: 3 }, n).bot).not.toBe('easy');
    }
  });

  it('are named after their colours', () => {
    expect(colorsName(['W', 'U'])).toBe('Azorius');
    expect(colorsName(['U', 'W'])).toBe('Azorius');
    expect(colorsName(['R'])).toBe('Red');
    // Tarkir: Dragonstorm (19a): three colours are a clan or shard, in any order.
    expect(colorsName(['G', 'W', 'B'])).toBe('Abzan');
    expect(colorsName(['R', 'U', 'W'])).toBe('Jeskai');
    expect(colorsName(['B', 'R', 'W'])).toBe('Mardu');
    expect(colorsName(['G', 'U', 'B'])).toBe('Sultai');
    expect(colorsName(['U', 'R', 'G'])).toBe('Temur');
    expect(colorsName(['W', 'U', 'B', 'R'])).toBe('Four colours');
    expect(colorsName([])).toBe('Colourless');
  });

  it('are registered again after a reload', () => {
    installStorage(new Map());
    const s = ready('blb', 77);
    saveSealed(s);
    const next = currentOpponent(s.event!);
    const loaded = loadSealed();
    expect(loaded).toEqual(s);
    expect(findDeck(next.deck.id)?.cards).toEqual(next.deck.cards);
    expect(findDeck(`sealed:${s.event!.id}:you`)).toBeDefined();
    expect(() => registerSealedDecks(loaded)).not.toThrow();
  });
});

describe('sealed results', () => {
  it('counts wins and losses, and ignores stale or repeated results', () => {
    let s = ready();
    s = startSealedMatch(s, 5);
    expect(s.event!.match).toBe(5);
    expect(recordSealedMatch(s, 6, 'win')).toBe(s);
    s = recordSealedMatch(s, 5, 'win');
    expect(s.event).toMatchObject({ wins: 1, losses: 0, match: null });
    expect(recordSealedMatch(s, 5, 'win')).toBe(s);
    s = play(s, 'loss');
    expect(s.event).toMatchObject({ wins: 1, losses: 1 });
    expect(matchNumber(s.event!)).toBe(2);
  });

  it('replays draws without changing the record', () => {
    let s = ready();
    s = play(s, 'win');
    s = play(s, 'draw');
    expect(s.event).toMatchObject({ wins: 1, losses: 0, draws: 1, finished: false });
    expect(matchNumber(s.event!)).toBe(2);
    expect(statusOf(s.event!)).toBe('playing');
  });

  it('ends at seven wins', () => {
    let s = ready();
    for (let i = 0; i < 6; i++) s = play(s, 'win');
    expect(s.event!.finished).toBe(false);
    s = play(s, 'win');
    expect(s.event).toMatchObject({ wins: 7, finished: true, resigned: false });
    expect(statusOf(s.event!)).toBe('won');
    expect(s.records.fdn).toEqual({ events: 1, best: 7, sevenWins: 1 });
    expect(startSealedMatch(s, 99)).toBe(s);
    expect(recordSealedMatch(s, 99, 'win')).toBe(s);
  });

  it('ends at three losses', () => {
    let s = ready();
    s = play(s, 'win');
    s = play(s, 'loss');
    s = play(s, 'loss');
    expect(s.event!.finished).toBe(false);
    s = play(s, 'loss');
    expect(s.event).toMatchObject({ wins: 1, losses: 3, finished: true });
    expect(statusOf(s.event!)).toBe('out');
    expect(s.records.fdn).toEqual({ events: 1, best: 1, sevenWins: 0 });
  });

  it('needs a playable deck to start a match', () => {
    const s = startSealed(emptySealed(), 'fdn', 1, null);
    expect(startSealedMatch(s, 3)).toBe(s);
  });

  it('resigns with the current record', () => {
    let s = ready();
    s = play(s, 'win');
    s = play(s, 'win');
    s = startSealedMatch(s, 5);
    s = resignSealed(s);
    expect(s.event).toMatchObject({ wins: 2, finished: true, resigned: true, match: null });
    expect(statusOf(s.event!)).toBe('resigned');
    expect(summarizeSealed(s.event!).prize).toEqual({ coins: 100, packs: 0 });
    expect(recordSealedMatch(s, 5, 'win')).toBe(s);
    expect(moveSealedCard(s, 'Forest', 'main')).toBe(s);
  });

  it('allows one event at a time, and a new one after leaving', () => {
    const s = ready('fdn', 1);
    expect(startSealed(s, 'blb', 2, null)).toBe(s);
    expect(leaveSealed(s)).toBe(s);
    const next = startSealed(leaveSealed(resignSealed(s)), 'blb', 2, null);
    expect(next.event!.set).toBe('blb');
    expect(next.records.fdn!.events).toBe(1);
    expect(next.records.blb!.events).toBe(1);
  });

  it('keeps the best result per set', () => {
    let s = play(play(ready('fdn', 1), 'win'), 'win');
    s = resignSealed(s);
    s = applySealedSuggestion(startSealed(leaveSealed(s), 'fdn', 2, null));
    s = resignSealed(play(s, 'win'));
    expect(s.records.fdn).toEqual({ events: 2, best: 2, sevenWins: 0 });
  });
});

describe('sealed prizes', () => {
  it('follow the plan', () => {
    expect(SEALED_PRIZES.map((p) => p.coins)).toEqual([0, 50, 100, 150, 250, 350, 500, 700]);
    expect(SEALED_PRIZES.map((p) => p.packs)).toEqual([0, 0, 0, 1, 1, 1, 2, 3]);
    expect(prizeFor(7)).toEqual({ coins: 700, packs: 3 });
    expect(prizeFor(99)).toEqual({ coins: 700, packs: 3 });
    expect(prizeFor(-1)).toEqual({ coins: 0, packs: 0 });
  });

  it('every set maps to a Season pack that opens', () => {
    for (const set of SETS) {
      const repo = seasonFixture();
      const kind = SEASON_PACK_OF[set];
      repo.update('a', (save) => ({
        ...save,
        packs: [{ id: save.nextPackId, kind }],
        nextPackId: save.nextPackId + 1,
      }));
      const save = saveOf(repo);
      const opened = openSeasonPack(save, save.packs[0]!.id, packGenerator(kind), save.updatedAt);
      expect(opened.packs).toHaveLength(0);
      expect(opened.lastPack!.rewards).toHaveLength(8);
    }
  });
});

describe('sealed and the Season save', () => {
  it('adds the pool once, to the right save', () => {
    const repo = seasonFixture();
    repo.create('b', 'Second', SEASON_STARTERS[1]!.id, 2, 100);
    const before = saveOf(repo, 'b');
    let s = startSealed(emptySealed(), 'blb', 31, 'a');
    const a0 = saveOf(repo);
    s = grantSealedPool(s, repo, 200);
    expect(s.event!.poolGranted).toBe(true);
    const a1 = saveOf(repo);
    const pool = sealedPacks(s.event!).flat();
    for (const name of new Set(pool)) {
      const id = slug(name);
      const copies = pool.filter((n) => n === name).length;
      // Copies past the limit pay out instead, so never more than were opened.
      const gained = (a1.collection[id] ?? 0) - (a0.collection[id] ?? 0);
      expect(gained).toBeGreaterThanOrEqual(0);
      expect(gained).toBeLessThanOrEqual(copies);
    }
    const total = (c: Record<string, number>) => Object.values(c).reduce((n, k) => n + k, 0);
    expect(total(a1.collection)).toBeGreaterThan(total(a0.collection));
    expect(saveOf(repo, 'b')).toEqual(before);
    // once
    expect(grantSealedPool(s, repo, 300)).toBe(s);
    expect(saveOf(repo)).toEqual(a1);
  });

  it('pays the prize once, after the event ends', () => {
    const repo = seasonFixture();
    let s = ready('fin', 41, 'a');
    s = grantSealedPool(s, repo, 150);
    const before = saveOf(repo);
    // not while the event runs
    expect(paySealedPrize(s, repo, 200)).toBe(s);
    for (let i = 0; i < 6; i++) s = play(s, 'win');
    s = resignSealed(s);
    s = paySealedPrize(s, repo, 200);
    expect(s.event!.prizePaid).toBe(true);
    const after = saveOf(repo);
    expect(after.coins).toBe(before.coins + 500);
    expect(after.packs.map((p) => p.kind)).toEqual(['finalFantasy', 'finalFantasy']);
    expect(new Set(after.packs.map((p) => p.id)).size).toBe(2);
    expect(after.nextPackId).toBe(before.nextPackId + 2);
    expect(paySealedPrize(s, repo, 300)).toBe(s);
    expect(saveOf(repo)).toEqual(after);
  });

  it('pays nothing but is done for an event without wins', () => {
    const repo = seasonFixture();
    let s = resignSealed(ready('fdn', 2, 'a'));
    const before = saveOf(repo);
    s = paySealedPrize(s, repo, 200);
    expect(s.event!.prizePaid).toBe(true);
    expect(saveOf(repo).coins).toBe(before.coins);
  });

  it('is a no-op without a save, or when the save is gone, and does not throw', () => {
    const repo = seasonFixture();
    for (const id of [null, 'gone']) {
      let s = ready('fdn', 5, id);
      expect(() => (s = grantSealedPool(s, repo, 200))).not.toThrow();
      expect(s.event!.poolGranted).toBe(false);
      s = resignSealed(play(play(play(s, 'win'), 'win'), 'win'));
      expect(() => (s = paySealedPrize(s, repo, 200))).not.toThrow();
      expect(s.event!.prizePaid).toBe(false);
    }
    expect(saveOf(repo).packs).toEqual([]);
    const broken = {
      update: () => {
        throw new Error('Season progress could not be saved');
      },
    };
    expect(() => grantSealedPool(ready('fdn', 5, 'a'), broken, 200)).not.toThrow();
  });

  it('leaves a Season save valid, and its prize packs open, for every set', () => {
    for (const set of SETS) {
      const repo = seasonFixture();
      let s = ready(set, 61, 'a');
      s = grantSealedPool(s, repo, 200);
      for (let i = 0; i < 7; i++) s = play(s, 'win');
      paySealedPrize(s, repo, 300);
      let save = saveOf(repo);
      expect(() => validateSeasonSave(structuredClone(save))).not.toThrow();
      expect(save.packs).toHaveLength(3);
      for (const id of Object.keys(save.collection)) expect(SEASON_CARDS.has(id)).toBe(true);
      while (save.packs.length) {
        const p = save.packs[0]!;
        expect(p.kind).toBe(SEASON_PACK_OF[set]);
        save = openSeasonPack(save, p.id, packGenerator(p.kind), save.updatedAt);
      }
      expect(() => validateSeasonSave(structuredClone(save))).not.toThrow();
    }
  });
});

describe('sealed storage', () => {
  it('round-trips an event and records', () => {
    const store = new Map<string, string>();
    installStorage(store);
    const s = play(ready('stx', 8, 'a'), 'win');
    saveSealed(s);
    expect(store.has('mtg.sealed.v1')).toBe(true);
    expect(loadSealed()).toEqual(s);
  });

  it('remembers that the reveal was done, and treats older saves as past it', () => {
    const store = new Map<string, string>();
    installStorage(store);
    const s = startSealed(emptySealed(), 'fdn', 5, null);
    expect(s.event!.revealed).toBe(false);
    const r = markSealedRevealed(s);
    expect(r.event!.revealed).toBe(true);
    expect(markSealedRevealed(r)).toBe(r);
    saveSealed(r);
    expect(loadSealed().event!.revealed).toBe(true);
    const old = JSON.parse(store.get('mtg.sealed.v1')!);
    delete old.event.revealed;
    store.set('mtg.sealed.v1', JSON.stringify(old));
    expect(loadSealed().event!.revealed).toBe(true);
    old.event.revealed = 'yes';
    store.set('mtg.sealed.v1', JSON.stringify(old));
    expect(loadSealed().event).toBeNull();
  });

  it('tolerates missing, blocked and bad storage', () => {
    Object.assign(globalThis, { localStorage: undefined });
    expect(loadSealed()).toEqual(emptySealed());
    expect(() => saveSealed(emptySealed())).not.toThrow();
    const blocked = () => {
      throw new Error('blocked');
    };
    Object.assign(globalThis, { localStorage: { getItem: blocked, setItem: blocked } });
    expect(loadSealed()).toEqual(emptySealed());
    expect(() => saveSealed(emptySealed())).not.toThrow();
    const store = new Map([['mtg.sealed.v1', '{"v":1,"event":{"set":"nope"},"records":{}}']]);
    installStorage(store);
    expect(loadSealed().event).toBeNull();
    store.set('mtg.sealed.v1', 'not json');
    expect(loadSealed()).toEqual(emptySealed());
  });
});
