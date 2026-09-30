import { describe, expect, it } from 'vitest';
import {
  beginSeasonMatch,
  buySeasonPack,
  craftSeasonCard,
  openSeasonPack,
  putSeasonDeck,
  renameSeasonSave,
  replaySeasonMatch,
  resolveSeasonMatch,
  SEASON_CARDS,
  SEASON_STARTERS,
  type SeasonSave,
} from '../src/game/season.ts';
import {
  createSeasonRepository,
  SEASON_STORAGE_KEY,
  validateSeasonSave,
} from '../src/game/seasonStorage.ts';
import { passToTurn } from './seasonFixtures.ts';

const starter = SEASON_STARTERS[0]!.id;
const opponent = SEASON_STARTERS[1]!.id;
function fixture() {
  const values = new Map<string, string>();
  let fail = false;
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (fail) throw new Error('Quota exceeded');
      values.set(key, value);
    },
  };
  const repository = createSeasonRepository(storage);
  repository.create('a', 'First', starter, 1, 100);
  return {
    repository,
    values,
    storage,
    failWrites: () => {
      fail = true;
    },
  };
}

describe('Season storage and backups', () => {
  it('creates, switches, renames, and reloads distinct saves without touching existing modes', () => {
    const { repository, storage, values } = fixture();
    values.set('mtg.savedGame', 'existing match');
    repository.create('b', 'Second', opponent, 2, 101);
    repository.update('a', (s) => buySeasonPack(s, 102));
    repository.rename('b', 'Renamed', 102);
    repository.switchSave('a');
    const loaded = createSeasonRepository(storage).load();
    expect(loaded.activeSaveId).toBe('a');
    expect(loaded.saves.map((s) => [s.id, s.name, s.coins])).toEqual([
      ['a', 'First', 200],
      ['b', 'Renamed', 400],
    ]);
    expect(values.get('mtg.savedGame')).toBe('existing match');
    expect(() => repository.create('a', 'Collision', starter, 1, 103)).toThrow('already exists');
    expect(() => repository.switchSave('absent')).toThrow('Unknown save');
  });

  it('imports backups as separate saves, preserving collection, RNG, packs, and progress', () => {
    const { repository } = fixture();
    const card = [...SEASON_CARDS.keys()].find((id) => SEASON_CARDS.get(id)!.rarity === 'rare')!;
    repository.update('a', (s) => {
      let next = buySeasonPack(s, 101);
      next.wildcards.rare = 3;
      next.collection[card] = 1;
      next.vaultPoints = 1002;
      next = craftSeasonCard(next, card, 102);
      next = putSeasonDeck(next, { ...next.decks[0]!, id: 'custom', name: 'Custom' }, 103);
      return next;
    });
    const original = repository.load().saves[0]!;
    const imported = repository.importSave(repository.exportSave('a'), 'imported', 'Backup copy');
    expect(imported.saves[0]).toEqual(original);
    expect(imported.saves[1]).toEqual({ ...original, id: 'imported', name: 'Backup copy' });
    repository.update('imported', (s) => renameSeasonSave(s, 'Independent', 104));
    expect(repository.load().saves[0]).toEqual(original);
  });

  it('round-trips an unfinished game and preserves the turn-based concession gate', () => {
    const { repository } = fixture();
    repository.update('a', (s) =>
      passToTurn(beginSeasonMatch(s, opponent, 'search', 4, 'p2', 101), 5),
    );
    const before = repository.load().saves[0]!;
    repository.importSave(repository.exportSave('a'), 'copy');
    const restored = repository.load().saves[1]!;
    expect(replaySeasonMatch(restored.match!)).toEqual(replaySeasonMatch(before.match!));
    repository.update('copy', (s) => resolveSeasonMatch(s, 1, 'concede', 102));
    repository.update('copy', (s) => resolveSeasonMatch(s, 1, 'concede', 103));
    expect(repository.load().saves[1]!.coins).toBe(450);
    expect(repository.load().saves[0]!.match).not.toBeNull();
  });

  it('preserves committed pack contents on reload and does not grant them twice', () => {
    const { repository, storage } = fixture();
    repository.update('a', (s) => buySeasonPack(s, 101));
    repository.update('a', (s) =>
      openSeasonPack(
        s,
        1,
        () => Array.from({ length: 8 }, () => ({ kind: 'wildcard', rarity: 'rare' })),
        102,
      ),
    );
    const reopened = createSeasonRepository(storage);
    reopened.update('a', (s) =>
      openSeasonPack(
        s,
        1,
        () => {
          throw new Error('Reroll');
        },
        103,
      ),
    );
    const save = reopened.load().saves[0]!;
    expect(save.wildcards.rare).toBe(8);
    expect(save.lastPack!.rewards).toHaveLength(8);
    expect(save.packs).toEqual([]);
  });

  it('requires confirmed reset, resets only the target, and invalidates old transaction callbacks', () => {
    const { repository } = fixture();
    repository.create('b', 'Second', opponent, 2, 101);
    repository.update('a', (s) =>
      beginSeasonMatch(buySeasonPack(s, 101), opponent, 'easy', 1, 'p1', 102),
    );
    const second = repository.load().saves[1]!;
    expect(() => repository.reset('a', opponent, 3, 103, false)).toThrow('confirmation');
    const reset = repository.reset('a', opponent, 3, 103, true).saves[0]!;
    expect(reset.coins).toBe(400);
    expect(reset.purchasedStarters).toEqual([opponent]);
    expect(reset.match).toBeNull();
    expect(reset.packs).toEqual([]);
    expect(reset.nextMatchId).toBe(2);
    expect(reset.nextPackId).toBe(2);
    repository.update('a', (s) => beginSeasonMatch(s, starter, 'easy', 4, 'p1', 104));
    repository.update('a', (s) => resolveSeasonMatch(s, 1, 'concede', 105));
    expect(repository.load().saves[0]!.match!.id).toBe(2);
    expect(repository.load().saves[0]!.coins).toBe(400);
    expect(repository.load().saves[1]).toEqual(second);
  });

  it.each([
    [
      'version',
      (s: SeasonSave) => {
        (s as { version: number }).version = 999;
      },
    ],
    [
      'card references',
      (s: SeasonSave) => {
        s.collection['unknown-card'] = 1;
      },
    ],
    [
      'quantities',
      (s: SeasonSave) => {
        s.coins = -1;
      },
    ],
    [
      'copy limits',
      (s: SeasonSave) => {
        s.collection[Object.keys(s.collection)[0]!] = 5;
      },
    ],
    [
      'selected deck',
      (s: SeasonSave) => {
        s.selectedDeckId = 'missing';
      },
    ],
    [
      'duplicate IDs',
      (s: SeasonSave) => {
        s.decks.push(structuredClone(s.decks[0]!));
      },
    ],
    [
      'wildcards',
      (s: SeasonSave) => {
        s.wildcards.rare = 1.5;
      },
    ],
    [
      'RNG',
      (s: SeasonSave) => {
        s.rng.s = [0, 0, 0, 0];
      },
    ],
    [
      'tracks',
      (s: SeasonSave) => {
        s.tracks.uncommon = 6;
      },
    ],
    [
      'pack IDs',
      (s: SeasonSave) => {
        s.packs.push({ id: 1, kind: 'foundations' });
      },
    ],
  ])('rejects malformed %s without overwriting stored saves or the backup', (_name, damage) => {
    const { repository, values } = fixture();
    const backup = JSON.parse(repository.exportSave('a'));
    damage(backup.save);
    const raw = JSON.stringify(backup);
    const stored = values.get(SEASON_STORAGE_KEY);
    expect(() => repository.importSave(raw, 'copy')).toThrow();
    expect(values.get(SEASON_STORAGE_KEY)).toBe(stored);
    expect(JSON.stringify(backup)).toBe(raw);
  });

  it('rejects invalid match actions and unknown match card references', () => {
    const { repository } = fixture();
    const begun = beginSeasonMatch(repository.load().saves[0]!, opponent, 'easy', 1, 'p1', 101);
    begun.match!.actions.push({ type: 'playLand', player: 'p1', card: 'missing' });
    expect(() => validateSeasonSave(begun)).toThrow();
    begun.match!.actions = [];
    begun.match!.decks.p2[0] = 'missing';
    expect(() => validateSeasonSave(begun)).toThrow();
  });

  it('surfaces write failures and preserves the previous durable state', () => {
    const { repository, values, failWrites } = fixture();
    const before = values.get(SEASON_STORAGE_KEY);
    failWrites();
    expect(() => repository.update('a', (s) => buySeasonPack(s, 101))).toThrow(
      'could not be saved',
    );
    expect(values.get(SEASON_STORAGE_KEY)).toBe(before);
    expect(repository.load().saves[0]!.coins).toBe(400);
    expect(() => repository.importSave(repository.exportSave('a'), 'copy')).toThrow(
      'could not be saved',
    );
  });

  it('keeps a finished reward eligible for retry if its storage write fails', () => {
    const { repository, storage, failWrites } = fixture();
    repository.update('a', (s) =>
      passToTurn(beginSeasonMatch(s, opponent, 'easy', 4, 'p1', 101), 5),
    );
    const durable = storage.getItem(SEASON_STORAGE_KEY);
    failWrites();
    expect(() => repository.update('a', (s) => resolveSeasonMatch(s, 1, 'concede', 102))).toThrow(
      'could not be saved',
    );
    expect(storage.getItem(SEASON_STORAGE_KEY)).toBe(durable);
    const saved = repository.load().saves[0]!;
    expect(saved.coins).toBe(400);
    expect(saved.match!.id).toBe(1);
    // The pure transition can still resolve the unchanged durable match exactly once.
    const paid = resolveSeasonMatch(saved, 1, 'concede', 102);
    expect(paid.coins).toBe(450);
    expect(resolveSeasonMatch(paid, 1, 'concede', 103)).toBe(paid);
  });

  it('preserves unreadable or unsupported local data instead of starting over', () => {
    const { repository, values } = fixture();
    for (const corrupt of [
      'broken json',
      JSON.stringify({ version: 999, saves: [], activeSaveId: null }),
    ]) {
      values.set(SEASON_STORAGE_KEY, corrupt);
      expect(() => repository.load()).toThrow('preserved');
      expect(() => repository.create('b', 'New', starter, 2, 102)).toThrow('preserved');
      expect(values.get(SEASON_STORAGE_KEY)).toBe(corrupt);
    }
  });
});
