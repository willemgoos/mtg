import { cardDb, SCRYFALL, slug } from '@mtg/cards';
import { createEngine, nextInt, playRandomGame, type PlayerId } from '@mtg/engine';
import { describe, expect, it } from 'vitest';
import {
  appendSeasonAction,
  beginSeasonMatch,
  buySeasonPack,
  buySeasonStarter,
  claimSeasonVault,
  craftSeasonCard,
  createSeasonSave,
  deckErrors,
  openSeasonPack,
  putSeasonDeck,
  replaySeasonMatch,
  resolveSeasonMatch,
  SEASON_STARTERS,
  SEASON_CARDS,
  copyLimit,
  selectSeasonDeck,
  type PackGenerator,
  type PackReward,
  type Rarity,
} from '../src/game/season.ts';
import { passToTurn } from './seasonFixtures.ts';

const starter = SEASON_STARTERS[0]!.id;
const opponent = SEASON_STARTERS[1]!.id;
const fresh = () => createSeasonSave('save-a', 'My Season', starter, 7, 100);
const engine = createEngine(cardDb);
const cardOf = (rarity: Rarity) =>
  slug(SCRYFALL.find((c) => c.rarity === rarity && !c.typeLine.startsWith('Basic'))!.name);
const wildcardPack: PackGenerator = (rng) => {
  nextInt(rng, 100);
  return Array.from({ length: 8 }, () => ({ kind: 'wildcard', rarity: 'common' }));
};

describe('Season collection and economy', () => {
  it('honours printed copy-limit exceptions in both collections and decks', () => {
    const id = cardOf('common');
    const original = SEASON_CARDS.get(id)!;
    try {
      for (const [rule, limit] of [
        ['A deck can have any number of cards named Example.', Infinity],
        ['A deck can have up to nine cards named Example.', 9],
      ] as const) {
        SEASON_CARDS.set(id, { ...original, oracleText: rule });
        expect(copyLimit(id)).toBe(limit);
        const save = fresh();
        save.collection[id] = limit === Infinity ? 60 : 9;
        const cards = { [id]: save.collection[id]!, plains: 60 };
        const edited = putSeasonDeck(save, { id: 'exception', name: 'Exception', cards }, 101);
        expect(deckErrors(edited, edited.decks[1]!)).toEqual([]);
        save.wildcards.common = 1;
        if (limit === Infinity) expect(craftSeasonCard(save, id, 101).collection[id]).toBe(61);
        else expect(() => craftSeasonCard(save, id, 101)).toThrow('maximum copies');
      }
    } finally {
      SEASON_CARDS.set(id, original);
    }
  });
  it('starts with the chosen complete starter, 400 coins, and stable collectible identities', () => {
    const save = fresh();
    expect(save.coins).toBe(400);
    expect(save.purchasedStarters).toEqual([starter]);
    expect(deckErrors(save, save.decks[0]!)).toEqual([]);
    expect(save.collection).not.toHaveProperty('plains');
    expect(Object.keys(save.collection).every((id) => cardDb.has(id))).toBe(true);
    expect(save.tracks.uncommon).toBe(3);
  });

  it('reuses owned copies across decks without changing the collection or input', () => {
    const save = fresh();
    const before = structuredClone(save);
    const next = putSeasonDeck(save, { ...save.decks[0]!, id: 'second', name: 'Second' }, 101);
    expect(next.collection).toEqual(save.collection);
    expect(save).toEqual(before);
    const selected = selectSeasonDeck(next, 'second', 102);
    expect(selected.selectedDeckId).toBe('second');
    expect(selected.decks[0]!.cards).toEqual(selected.decks[1]!.cards);
    selected.decks[1]!.cards['plains'] = 1;
    expect(selected.decks[0]!.cards['plains']).not.toBe(1);
  });

  it('allows incomplete deck drafts but blocks unowned, excessive, or unknown cards', () => {
    const save = fresh();
    const draft = putSeasonDeck(save, { id: 'empty', name: 'Work in progress', cards: {} }, 101);
    expect(deckErrors(draft, draft.decks[1]!)).toContain('A Season deck needs at least 60 cards');
    const id = Object.keys(save.collection)[0]!;
    expect(() =>
      putSeasonDeck(save, { id: 'bad', name: 'Bad', cards: { [id]: 5 } }, 101),
    ).toThrow();
    expect(() =>
      putSeasonDeck(save, { id: 'bad', name: 'Bad', cards: { 'absent-card': 1 } }, 101),
    ).toThrow();
    const unowned = SCRYFALL.map((c) => slug(c.name)).find(
      (id) =>
        !save.collection[id] &&
        !id.includes('plains') &&
        !['island', 'swamp', 'mountain', 'forest'].includes(id),
    )!;
    expect(() =>
      putSeasonDeck(save, { id: 'bad', name: 'Bad', cards: { [unowned]: 1 } }, 101),
    ).toThrow();
    const lands = putSeasonDeck(save, { id: 'lands', name: 'Lands', cards: { plains: 60 } }, 101);
    expect(deckErrors(lands, lands.decks[1]!)).toEqual([]);
  });

  it('charges pack purchases exactly and never overspends', () => {
    const a = buySeasonPack(fresh(), 101);
    const b = buySeasonPack(a, 102);
    expect(a.coins).toBe(200);
    expect(b.coins).toBe(0);
    expect(b.packs.map((p) => p.id)).toEqual([1, 2]);
    expect(() => buySeasonPack(b, 103)).toThrow('Not enough coins');
    expect(a.packs).toHaveLength(1);
  });

  it('sells starters once, grants advertised quantities, and converts duplicates', () => {
    let save = fresh();
    expect(() => buySeasonStarter(save, opponent, 101)).toThrow('Not enough coins');
    save = { ...save, coins: 1000 };
    // Completing the advertised cards isolates the compensation calculation.
    const quantities = SEASON_STARTERS[1]!.cards.filter(
      ([name]) => !SCRYFALL.find((c) => c.name === name)!.typeLine.startsWith('Basic'),
    );
    for (const [name] of quantities) save.collection[slug(name)] = 4;
    let coins = 0,
      points = 0;
    for (const [name, n] of quantities) {
      const rarity = SCRYFALL.find((c) => c.name === name)!.rarity;
      if (rarity === 'rare' || rarity === 'mythic') coins += n * (rarity === 'rare' ? 20 : 40);
      else points += n * (rarity === 'common' ? 1 : 3);
    }
    const next = buySeasonStarter(save, opponent, 101);
    expect(next.coins).toBe(coins);
    expect(next.vaultPoints).toBe(points);
    expect(next.collection).toEqual(save.collection);
    expect(next.decks).toHaveLength(2);
    expect(() => buySeasonStarter(next, opponent, 102)).toThrow('Starter already owned');
  });

  it('crafts one copy using its matching rarity, including non-Foundations cards', () => {
    const c = SCRYFALL.find((c) => c.set !== 'fdn' && !c.typeLine.startsWith('Basic'))!;
    const id = slug(c.name),
      rarity = c.rarity as Rarity;
    const save = fresh();
    delete save.collection[id];
    save.wildcards[rarity] = 1;
    const crafted = craftSeasonCard(save, id, 101);
    expect(crafted.collection[id]).toBe(1);
    expect(crafted.wildcards[rarity]).toBe(0);
    expect(() => craftSeasonCard(crafted, id, 102)).toThrow('Not enough matching wildcards');
    expect(() => craftSeasonCard(save, 'plains', 101)).toThrow('already unlimited');
    const full = { ...save, collection: { ...save.collection, [id]: 4 } };
    expect(() => craftSeasonCard(full, id, 101)).toThrow('maximum copies');
  });

  it('commits pack contents and RNG once and rejects invalid rewards atomically', () => {
    const bought = buySeasonPack(fresh(), 101);
    const before = structuredClone(bought);
    const opened = openSeasonPack(bought, 1, wildcardPack, 102);
    expect(opened.packs).toEqual([]);
    expect(opened.wildcards.common).toBe(8);
    expect(opened.lastPack?.rewards).toHaveLength(8);
    expect(opened.rng).not.toEqual(bought.rng);
    expect(
      openSeasonPack(
        opened,
        1,
        () => {
          throw new Error('Must not reroll');
        },
        103,
      ),
    ).toBe(opened);
    expect(() => openSeasonPack(bought, 1, () => [{ kind: 'card', cardId: 'bad' }], 102)).toThrow();
    expect(() =>
      openSeasonPack(
        bought,
        1,
        () => Array<PackReward>(8).fill({ kind: 'card', cardId: 'absent' }),
        102,
      ),
    ).toThrow();
    expect(bought).toEqual(before);
  });

  it('advances guaranteed tracks independently of wildcard drops through a complete cycle', () => {
    let save = { ...fresh(), coins: 6000 };
    for (let i = 1; i <= 30; i++) {
      save = buySeasonPack(save, 100 + i * 2);
      save = openSeasonPack(save, i, wildcardPack, 101 + i * 2);
      if (i === 3) expect(save.wildcards.uncommon).toBe(1);
      if (i === 6) expect(save.wildcards.rare).toBe(1);
    }
    expect(save.wildcards.rare).toBe(4);
    expect(save.wildcards.mythic).toBe(1);
    expect(save.wildcards.uncommon).toBe(5);
    expect(save.tracks).toEqual({ uncommon: 3, rareMythic: 0, rareRewards: 0 });
  });

  it('adds duplicate Vault progress and preserves overflow when claimed', () => {
    const id = cardOf('common');
    let save = fresh();
    save.collection[id] = 4;
    save.vaultPoints = 1998;
    save = buySeasonPack(save, 101);
    save = openSeasonPack(
      save,
      1,
      () => Array<PackReward>(8).fill({ kind: 'card', cardId: id }),
      102,
    );
    expect(save.vaultPoints).toBe(2006);
    save = claimSeasonVault(save, 103);
    expect(save.vaultPoints).toBe(1006);
    save = claimSeasonVault(save, 104);
    expect(save.vaultPoints).toBe(6);
    expect(save.wildcards).toEqual({ common: 0, uncommon: 6, rare: 4, mythic: 2 });
    expect(() => claimSeasonVault(save, 105)).toThrow('not ready');
  });
});

describe('Season match transaction foundation', () => {
  it.each(['p1', 'p2'] as PlayerId[])(
    'uses the human fifth turn, regardless of who starts (%s)',
    (startingPlayer) => {
      const begun = beginSeasonMatch(fresh(), opponent, 'heuristic', 7, startingPlayer, 101);
      const early = passToTurn(begun, 4);
      expect(resolveSeasonMatch(early, 1, 'concede', 102).coins).toBe(400);
      const eligible = passToTurn(begun, 5);
      expect(replaySeasonMatch(eligible.match!).state.turn.number).toBe(
        startingPlayer === 'p1' ? 9 : 10,
      );
      const resolved = resolveSeasonMatch(eligible, 1, 'concede', 102);
      expect(resolved.coins).toBe(450);
      expect(resolved.match).toBeNull();
      expect(resolveSeasonMatch(resolved, 1, 'concede', 103)).toBe(resolved);
      const newer = beginSeasonMatch(resolved, opponent, 'easy', 8, 'p1', 103);
      expect(resolveSeasonMatch(newer, 1, 'concede', 104)).toBe(newer);
    },
  );

  it('rejects manufactured wins and invalid actions without changing a match', () => {
    const begun = beginSeasonMatch(fresh(), opponent, 'easy', 7, 'p1', 101);
    expect(() => resolveSeasonMatch(begun, 1, 'win', 102)).toThrow('Result does not match');
    expect(() =>
      appendSeasonAction(begun, 1, { type: 'playLand', player: 'p1', card: 'absent' }, 102),
    ).toThrow();
    expect(begun.match!.actions).toEqual([]);
    expect(() => beginSeasonMatch(begun, opponent, 'easy', 8, 'p1', 102)).toThrow(
      'Resume or abandon',
    );
  });

  it('resolves actual engine outcomes once from a replayed action history', () => {
    const begun = beginSeasonMatch(fresh(), opponent, 'easy', 3, 'p1', 101);
    const initial = replaySeasonMatch(begun.match!).state;
    const played = playRandomGame(engine, initial, 17);
    const finished = { ...begun, match: { ...begun.match!, actions: played.actions } };
    expect(replaySeasonMatch(finished.match).state).toEqual(played.final);
    const outcome =
      played.final.winner === 'p1' ? 'win' : played.final.winner === 'p2' ? 'loss' : 'draw';
    const resolved = resolveSeasonMatch(finished, 1, outcome, 102);
    expect(resolved.coins).toBe(400 + (outcome === 'win' ? 100 : 50));
    expect(resolveSeasonMatch(resolved, 1, outcome, 103)).toBe(resolved);
  });
});
