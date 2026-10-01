import {
  collectible,
  createSeasonSave,
  isBasic,
  label,
  natural,
  RARITIES,
  renameSeasonSave,
  replaySeasonMatch,
  requireSeason,
  isSeasonOpponent,
  SEASON_PACK_KINDS,
  SEASON_STARTERS,
  SEASON_VERSION,
  validateCounts,
  type Counts,
  type SeasonMatch,
  type SeasonPackKind,
  type SeasonSave,
} from './season.ts';

export const SEASON_STORAGE_KEY = 'mtg.season.v1';
export interface SeasonLibrary {
  version: typeof SEASON_VERSION;
  activeSaveId: string | null;
  saves: SeasonSave[];
}
type StorageAdapter = Pick<Storage, 'getItem' | 'setItem'>;
type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  requireSeason(
    value !== null && typeof value === 'object' && !Array.isArray(value),
    'Expected an object',
  );
  return value as JsonRecord;
}
function array(value: unknown): unknown[] {
  requireSeason(Array.isArray(value), 'Expected an array');
  return value;
}
function positive(value: unknown): asserts value is number {
  natural(value);
  requireSeason(value > 0, 'Expected a positive integer');
}
function uint32(value: unknown): void {
  natural(value);
  requireSeason(value <= 0xffffffff, 'Expected a uint32');
}
function counts(value: unknown, collection?: Counts): Counts {
  const object = record(value);
  for (const n of Object.values(object)) positive(n);
  validateCounts(object as Counts, collection);
  return object as Counts;
}
function unique(values: unknown[], message: string): void {
  requireSeason(new Set(values).size === values.length, message);
}
function match(value: unknown, save: SeasonSave): void {
  const m = record(value);
  positive(m.id);
  requireSeason(m.id === save.nextMatchId - 1, 'Invalid active match ID');
  uint32(m.seed);
  requireSeason(m.startingPlayer === 'p1' || m.startingPlayer === 'p2', 'Invalid starting player');
  requireSeason(['easy', 'heuristic', 'search'].includes(m.bot as string), 'Invalid bot');
  label(m.opponentDeckId);
  if (m.playerDeckName !== undefined) label(m.playerDeckName);
  requireSeason(isSeasonOpponent(m.opponentDeckId), 'Unknown opponent deck');
  const decks = record(m.decks);
  for (const player of ['p1', 'p2']) {
    const cards = array(decks[player]);
    // Your deck follows Season's 60-card rule; a bot's Jump In pair has 40.
    requireSeason(cards.length >= (player === 'p1' ? 60 : 40), 'Invalid match deck size');
    const quantities: Counts = {};
    for (const id of cards) {
      requireSeason(typeof id === 'string', 'Invalid match card ID');
      collectible(id);
      quantities[id] = (quantities[id] ?? 0) + 1;
    }
    // Snapshot may refer to a deck edited since the match began, but not unowned cards.
    validateCounts(
      quantities,
      player === 'p1'
        ? save.collection
        : Object.fromEntries(Object.entries(quantities).filter(([id]) => !isBasic(id))),
    );
  }
  for (const action of array(m.actions)) record(action);
  replaySeasonMatch(m as unknown as SeasonMatch);
}

/** Reject corrupt/unsupported data before changing storage or exposing progress. */
export function validateSeasonSave(value: unknown): SeasonSave {
  const s = record(value);
  requireSeason(s.version === SEASON_VERSION, 'Unsupported Season save version');
  label(s.id);
  label(s.name);
  natural(s.createdAt);
  natural(s.updatedAt);
  requireSeason(s.updatedAt >= s.createdAt, 'Invalid save timestamps');
  natural(s.coins);
  natural(s.vaultPoints);
  positive(s.nextPackId);
  positive(s.nextMatchId);
  const collection = counts(s.collection);
  const starters = array(s.purchasedStarters);
  requireSeason(starters.length > 0, 'Save needs a starting deck');
  for (const id of starters)
    requireSeason(
      SEASON_STARTERS.some((d) => d.id === id),
      'Unknown starter',
    );
  unique(starters, 'Duplicate purchased starters');
  const decks = array(s.decks);
  requireSeason(decks.length > 0, 'Save needs at least one deck');
  for (const value of decks) {
    const d = record(value);
    label(d.id);
    label(d.name);
    counts(d.cards, collection);
  }
  const deckIds = decks.map((d) => record(d).id);
  unique(deckIds, 'Duplicate deck IDs');
  requireSeason(deckIds.includes(s.selectedDeckId), 'Unknown selected deck');
  const wildcards = record(s.wildcards);
  for (const rarity of RARITIES) natural(wildcards[rarity]);
  if (s.wildcardMisses !== undefined) {
    const misses = record(s.wildcardMisses);
    for (const [key, max] of [
      ['common', 5],
      ['uncommon', 9],
      ['rareMythic', 29],
    ] as const) {
      natural(misses[key]);
      requireSeason((misses[key] as number) < max, 'Invalid wildcard misses');
    }
  }
  const tracks = record(s.tracks);
  for (const key of ['uncommon', 'rareMythic', 'rareRewards']) natural(tracks[key]);
  requireSeason(
    (tracks.uncommon as number) < 6 &&
      (tracks.rareMythic as number) < 6 &&
      (tracks.rareRewards as number) < 5,
    'Invalid wildcard track',
  );
  const rng = array(record(s.rng).s);
  requireSeason(rng.length === 4, 'Invalid RNG');
  rng.forEach(uint32);
  requireSeason(
    rng.some((n) => n !== 0),
    'Invalid zero RNG',
  );
  const packs = array(s.packs);
  for (const value of packs) {
    const p = record(value);
    positive(p.id);
    requireSeason(
      p.id < s.nextPackId && SEASON_PACK_KINDS.includes(p.kind as SeasonPackKind),
      'Invalid pack',
    );
  }
  unique(
    packs.map((p) => record(p).id),
    'Duplicate pack IDs',
  );
  if (s.lastPack !== null) {
    const receipt = record(s.lastPack);
    positive(receipt.packId);
    requireSeason(
      receipt.packId < s.nextPackId && !packs.some((p) => record(p).id === receipt.packId),
      'Invalid pack receipt ID',
    );
    const rewards = array(receipt.rewards);
    if (receipt.bonus !== undefined) {
      const bonus = record(receipt.bonus);
      natural(bonus.coins);
      natural(bonus.vaultPoints);
      const tracks = record(bonus.tracks);
      for (const rarity of RARITIES) natural(tracks[rarity]);
    }
    requireSeason(rewards.length === 8, 'Invalid pack receipt');
    for (const value of rewards) {
      const reward = record(value);
      if (reward.kind === 'card') {
        requireSeason(typeof reward.cardId === 'string', 'Invalid reward card');
        requireSeason(!isBasic(reward.cardId), 'Invalid basic land reward');
      } else
        requireSeason(
          reward.kind === 'wildcard' && RARITIES.some((rarity) => rarity === reward.rarity),
          'Invalid wildcard reward',
        );
    }
  }
  const save = s as unknown as SeasonSave;
  requireSeason(
    s.match === null || (s.match !== undefined && typeof s.match === 'object'),
    'Invalid match',
  );
  if (s.match !== null) match(s.match, save);
  if (s.lastResult !== null) {
    const result = record(s.lastResult);
    positive(result.matchId);
    requireSeason(
      result.matchId < s.nextMatchId && result.matchId !== save.match?.id,
      'Invalid result ID',
    );
    requireSeason(
      ['win', 'loss', 'draw', 'concede'].includes(result.outcome as string),
      'Invalid result',
    );
    natural(result.coins);
    requireSeason(
      result.coins ===
        (result.outcome === 'win'
          ? 100
          : result.outcome === 'concede' && result.coins === 0
            ? 0
            : 50),
      'Invalid result reward',
    );
  }
  return structuredClone(save);
}
function validateLibrary(value: unknown): SeasonLibrary {
  const library = record(value);
  requireSeason(library.version === SEASON_VERSION, 'Unsupported Season library version');
  const saves = array(library.saves).map(validateSeasonSave);
  unique(
    saves.map((s) => s.id),
    'Duplicate save IDs',
  );
  requireSeason(
    library.activeSaveId === null || saves.some((s) => s.id === library.activeSaveId),
    'Unknown active save',
  );
  requireSeason(
    saves.length === 0 ? library.activeSaveId === null : library.activeSaveId !== null,
    'Invalid active save',
  );
  return { version: SEASON_VERSION, activeSaveId: library.activeSaveId as string | null, saves };
}

/** One complete library write per transaction; failed writes leave the caller's state unchanged. */
export function createSeasonRepository(storage: StorageAdapter) {
  function load(): SeasonLibrary {
    const raw = storage.getItem(SEASON_STORAGE_KEY);
    if (raw === null) return { version: SEASON_VERSION, activeSaveId: null, saves: [] };
    try {
      return validateLibrary(JSON.parse(raw));
    } catch (e) {
      throw new Error('Cannot read Season saves; existing data has been preserved', { cause: e });
    }
  }
  function commit(library: SeasonLibrary): SeasonLibrary {
    const checked = validateLibrary(library);
    try {
      storage.setItem(SEASON_STORAGE_KEY, JSON.stringify(checked));
    } catch (e) {
      throw new Error('Season progress could not be saved', { cause: e });
    }
    return checked;
  }
  function insert(library: SeasonLibrary, save: SeasonSave): SeasonLibrary {
    requireSeason(!library.saves.some((s) => s.id === save.id), 'Save ID already exists');
    return commit({ ...library, activeSaveId: save.id, saves: [...library.saves, save] });
  }
  function update(id: string, change: (save: SeasonSave) => SeasonSave) {
    const library = load();
    const index = library.saves.findIndex((s) => s.id === id);
    requireSeason(index >= 0, 'Unknown save');
    const before = library.saves[index]!;
    const after = change(structuredClone(before));
    requireSeason(
      after.id === before.id &&
        after.createdAt === before.createdAt &&
        after.updatedAt >= before.updatedAt,
      'Cannot change save identity or move timestamps backwards',
    );
    library.saves[index] = after;
    return commit(library);
  }
  return {
    load,
    create(id: string, name: string, starter: string, seed: number, now: number) {
      return insert(load(), createSeasonSave(id, name, starter, seed, now));
    },
    switchSave(id: string) {
      const library = load();
      requireSeason(
        library.saves.some((s) => s.id === id),
        'Unknown save',
      );
      return commit({ ...library, activeSaveId: id });
    },
    update,
    rename(id: string, name: string, now: number) {
      return update(id, (save) => renameSeasonSave(save, name, now));
    },
    reset(id: string, starter: string, seed: number, now: number, confirmed: boolean) {
      requireSeason(confirmed === true, 'Reset requires explicit confirmation');
      const library = load();
      const index = library.saves.findIndex((s) => s.id === id);
      requireSeason(index >= 0, 'Unknown save');
      requireSeason(
        now >= library.saves[index]!.updatedAt,
        'Reset timestamp cannot move backwards',
      );
      const before = library.saves[index]!;
      const fresh = createSeasonSave(id, before.name, starter, seed, now);
      // Keep transaction IDs monotonic so pre-reset callbacks cannot target a new match/pack.
      fresh.nextMatchId = before.nextMatchId;
      fresh.nextPackId = before.nextPackId;
      library.saves[index] = fresh;
      return commit(library);
    },
    exportSave(id: string) {
      const save = load().saves.find((s) => s.id === id);
      requireSeason(save, 'Unknown save');
      return JSON.stringify({ kind: 'mtg-season-backup', version: SEASON_VERSION, save }, null, 2);
    },
    importSave(raw: string, newId: string, name?: string) {
      const library = load();
      const backup = record(JSON.parse(raw));
      requireSeason(
        backup.kind === 'mtg-season-backup' && backup.version === SEASON_VERSION,
        'Unsupported Season backup',
      );
      const save = validateSeasonSave(backup.save);
      label(newId);
      if (name !== undefined) label(name);
      save.id = newId;
      if (name !== undefined) save.name = name.trim();
      return insert(library, save);
    },
  };
}
