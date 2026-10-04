import {
  ARENA_DECKS,
  BLOOMBURROW_DECKS,
  FINAL_FANTASY_DECKS,
  MARVEL_DECKS,
  STRIXHAVEN_DECKS,
  SECRETS_OF_STRIXHAVEN_DECKS,
  REALITY_FRACTURE_DECKS,
  cardDb,
  deckIds,
  isPlayable,
  OPPONENT_DECKS,
  SCRYFALL,
  slug,
} from '@mtg/cards';
import {
  createEngine,
  createRng,
  type Action,
  type GameEvent,
  type GameState,
  type CardDefId,
  type PlayerId,
  type RngState,
} from '@mtg/engine';

export const SEASON_VERSION = 1;
export const PACK_PRICE = 200;
export const STARTER_PRICE = 1000;
export const RARITIES = ['common', 'uncommon', 'rare', 'mythic'] as const;
export type Rarity = (typeof RARITIES)[number];
export type Counts = Record<CardDefId, number>;
export type Wildcards = Record<Rarity, number>;
export interface WildcardMisses {
  common: number;
  uncommon: number;
  rareMythic: number;
}
export type SeasonBot = 'easy' | 'heuristic' | 'search';
export type MatchOutcome = 'win' | 'loss' | 'draw' | 'concede';

/** Stable rules identities, independent of artwork/Scryfall printing IDs. */
export const SEASON_CARDS = new Map(SCRYFALL.map((c) => [slug(c.name), c]));
/** Starter decks on sale: Arena's Foundations ones and our Bloomburrow, Marvel, Final Fantasy, Strixhaven and Reality Fracture ones. */
export const SEASON_STARTERS = [
  ...ARENA_DECKS,
  ...BLOOMBURROW_DECKS,
  ...MARVEL_DECKS,
  ...FINAL_FANTASY_DECKS.filter((d) => d.series === 'starter'),
  ...STRIXHAVEN_DECKS,
  ...SECRETS_OF_STRIXHAVEN_DECKS,
  ...REALITY_FRACTURE_DECKS.filter((d) => d.series === 'starter'),
].filter(isPlayable);
/** Decks a Season bot can play: mostly Jump In pairs, plus the starter and Color Challenge decks. */
export const isSeasonOpponent = (id: string): boolean => OPPONENT_DECKS.some((d) => d.id === id);
const engine = createEngine(cardDb);

export interface SeasonDeck {
  id: string;
  name: string;
  cards: Counts;
}
export interface SeasonPack {
  id: number;
  kind: SeasonPackKind;
}
export type SeasonPackKind =
  | 'foundations'
  | 'bloomburrow'
  | 'marvel'
  | 'finalFantasy'
  | 'strixhaven'
  | 'secrets'
  | 'realityFracture';
export const SEASON_PACK_KINDS: readonly SeasonPackKind[] = [
  'foundations',
  'bloomburrow',
  'marvel',
  'finalFantasy',
  'strixhaven',
  'secrets',
  'realityFracture',
];
export interface SeasonMatch {
  id: number;
  seed: number;
  startingPlayer: PlayerId;
  bot: SeasonBot;
  opponentDeckId: string;
  /** Snapshot label; optional for backups created before the Season UI existed. */
  playerDeckName?: string;
  decks: Record<PlayerId, CardDefId[]>;
  /** Unredacted actions are needed for deterministic restoration. */
  actions: Action[];
}
export interface SeasonResult {
  matchId: number;
  outcome: MatchOutcome;
  coins: number;
}
export interface SeasonSave {
  version: typeof SEASON_VERSION;
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  coins: number;
  collection: Counts;
  purchasedStarters: string[];
  decks: SeasonDeck[];
  selectedDeckId: string;
  wildcards: Wildcards;
  tracks: { uncommon: number; rareMythic: number; rareRewards: number };
  vaultPoints: number;
  packs: SeasonPack[];
  /** Persist the reveal result, so closing an animation cannot lose its contents. */
  lastPack: {
    packId: number;
    rewards: PackReward[];
    bonus?: { coins: number; vaultPoints: number; tracks: Wildcards };
  } | null;
  /** Optional for Phase 1/2 saves; initialized on their first new pack opening. */
  wildcardMisses?: WildcardMisses;
  rng: RngState;
  nextPackId: number;
  nextMatchId: number;
  match: SeasonMatch | null;
  lastResult: SeasonResult | null;
}
export type PackReward = { kind: 'card'; cardId: CardDefId } | { kind: 'wildcard'; rarity: Rarity };
/** The Phase 3 sampler gets a draft RNG and must return eight resolved slots. */
export type PackGenerator = (
  rng: RngState,
  collection: Readonly<Counts>,
  misses: WildcardMisses,
) => PackReward[];

export function requireSeason(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
export function natural(value: unknown): asserts value is number {
  requireSeason(
    typeof value === 'number' && Number.isSafeInteger(value) && value >= 0,
    'Expected a non-negative safe integer',
  );
}
export function label(value: unknown): asserts value is string {
  requireSeason(
    typeof value === 'string' && value.trim().length > 0 && value.length <= 120,
    'Expected a name of 1–120 characters',
  );
}
export function collectible(id: string) {
  const c = SEASON_CARDS.get(id);
  requireSeason(c, `Unknown collectible card: ${id}`);
  requireSeason(RARITIES.includes(c.rarity as Rarity), `Unknown rarity for ${id}`);
  return c;
}
export function isBasic(id: string): boolean {
  return /^Basic\b.*\bLand\b/.test(collectible(id).typeLine);
}
/** Printed deckbuilding exceptions also determine collection capacity. */
export function copyLimit(id: string): number {
  const text = collectible(id).oracleText;
  if (/A deck can have any number of cards named /i.test(text)) return Infinity;
  const words: Record<string, number> = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
  };
  const match = /A deck can have up to (\w+) cards named /i.exec(text);
  if (match) {
    const n = words[match[1]!.toLowerCase()] ?? Number(match[1]);
    requireSeason(Number.isSafeInteger(n) && n > 0, `Unsupported copy-limit rule for ${id}`);
    return n;
  }
  return 4;
}
export function validateCounts(counts: Counts, collection?: Counts): void {
  for (const [id, n] of Object.entries(counts)) {
    natural(n);
    requireSeason(n > 0, 'Omit zero-count cards');
    const basic = isBasic(id);
    requireSeason(basic || n <= copyLimit(id), `Too many copies of ${id}`);
    if (collection)
      requireSeason(basic || n <= (collection[id] ?? 0), `Not enough owned copies of ${id}`);
    else requireSeason(!basic, 'Basic lands are unlimited and are not stored in the collection');
  }
}
export function deckErrors(save: SeasonSave, deck: SeasonDeck): string[] {
  const errors: string[] = [];
  try {
    validateCounts(deck.cards, save.collection);
  } catch (e) {
    errors.push((e as Error).message);
  }
  const size = Object.values(deck.cards).reduce((a, b) => a + b, 0);
  if (size < 60) errors.push('A Season deck needs at least 60 cards');
  return errors;
}
function draft(save: SeasonSave, now: number): SeasonSave {
  natural(now);
  requireSeason(now >= save.updatedAt, 'Save timestamp cannot move backwards');
  const next = structuredClone(save);
  next.updatedAt = now;
  return next;
}
function addCoins(save: SeasonSave, n: number): void {
  save.coins += n;
  natural(save.coins);
}
function addWildcard(save: SeasonSave, rarity: Rarity, n = 1): void {
  requireSeason(RARITIES.includes(rarity), 'Unknown wildcard rarity');
  save.wildcards[rarity] += n;
  natural(save.wildcards[rarity]);
}
function grantCard(save: SeasonSave, id: string): void {
  const c = collectible(id);
  if (isBasic(id)) return;
  const count = save.collection[id] ?? 0;
  if (count < copyLimit(id)) {
    save.collection[id] = count + 1;
    natural(save.collection[id]);
  } else if (c.rarity === 'rare' || c.rarity === 'mythic')
    addCoins(save, c.rarity === 'rare' ? 20 : 40);
  else {
    save.vaultPoints += c.rarity === 'common' ? 1 : 3;
    natural(save.vaultPoints);
  }
}
function starter(id: string) {
  const deck = SEASON_STARTERS.find((d) => d.id === id);
  requireSeason(deck, 'Unknown or unsupported Season starter');
  return deck;
}
function starterCounts(id: string): Counts {
  return Object.fromEntries(starter(id).cards.map(([name, n]) => [slug(name), n]));
}

export function createSeasonSave(
  id: string,
  name: string,
  starterId: string,
  seed: number,
  now: number,
): SeasonSave {
  label(id);
  label(name);
  natural(now);
  natural(seed);
  requireSeason(seed <= 0xffffffff, 'Seed must be a uint32');
  const initial = starter(starterId);
  const save: SeasonSave = {
    version: SEASON_VERSION,
    id,
    name: name.trim(),
    createdAt: now,
    updatedAt: now,
    coins: 400,
    collection: {},
    purchasedStarters: [starterId],
    decks: [{ id: 'starter:1', name: initial.name, cards: starterCounts(starterId) }],
    selectedDeckId: 'starter:1',
    wildcards: { common: 0, uncommon: 0, rare: 0, mythic: 0 },
    tracks: { uncommon: 3, rareMythic: 0, rareRewards: 0 },
    vaultPoints: 0,
    packs: [],
    lastPack: null,
    rng: createRng(seed),
    nextPackId: 1,
    nextMatchId: 1,
    match: null,
    lastResult: null,
  };
  for (const card of deckIds(initial)) grantCard(save, card);
  return save;
}
export function renameSeasonSave(save: SeasonSave, name: string, now: number): SeasonSave {
  label(name);
  return { ...draft(save, now), name: name.trim() };
}
export function putSeasonDeck(save: SeasonSave, deck: SeasonDeck, now: number): SeasonSave {
  label(deck.id);
  label(deck.name);
  validateCounts(deck.cards, save.collection);
  const next = draft(save, now);
  const index = next.decks.findIndex((d) => d.id === deck.id);
  const value = structuredClone({ ...deck, name: deck.name.trim() });
  if (index < 0) next.decks.push(value);
  else next.decks[index] = value;
  return next;
}
export function selectSeasonDeck(save: SeasonSave, id: string, now: number): SeasonSave {
  requireSeason(
    save.decks.some((d) => d.id === id),
    'Unknown deck',
  );
  return { ...draft(save, now), selectedDeckId: id };
}
export function buySeasonStarter(save: SeasonSave, starterId: string, now: number): SeasonSave {
  const list = starter(starterId);
  requireSeason(!save.purchasedStarters.includes(starterId), 'Starter already owned');
  requireSeason(save.coins >= STARTER_PRICE, 'Not enough coins');
  const next = draft(save, now);
  next.coins -= STARTER_PRICE;
  next.purchasedStarters.push(starterId);
  for (const id of deckIds(list)) grantCard(next, id);
  let id = `starter:${next.purchasedStarters.length}`;
  while (next.decks.some((d) => d.id === id)) id += ':';
  next.decks.push({ id, name: list.name, cards: starterCounts(starterId) });
  return next;
}
export function buySeasonPack(
  save: SeasonSave,
  now: number,
  kind: SeasonPackKind = 'foundations',
): SeasonSave {
  requireSeason(save.coins >= PACK_PRICE, 'Not enough coins');
  requireSeason(SEASON_PACK_KINDS.includes(kind), 'Unknown pack');
  const next = draft(save, now);
  next.coins -= PACK_PRICE;
  natural(next.nextPackId + 1);
  next.packs.push({ id: next.nextPackId++, kind });
  return next;
}
export function craftSeasonCard(save: SeasonSave, id: string, now: number): SeasonSave {
  const card = collectible(id);
  const rarity = card.rarity as Rarity;
  requireSeason(!isBasic(id), 'Basic lands are already unlimited');
  requireSeason((save.collection[id] ?? 0) < copyLimit(id), 'Already own the maximum copies');
  requireSeason(save.wildcards[rarity] > 0, 'Not enough matching wildcards');
  const next = draft(save, now);
  next.wildcards[rarity]--;
  grantCard(next, id);
  return next;
}
/** Sampler must resolve rare/mythic duplicate protection before returning slots. */
export function openSeasonPack(
  save: SeasonSave,
  packId: number,
  generate: PackGenerator,
  now: number,
): SeasonSave {
  natural(packId);
  requireSeason(packId > 0 && packId < save.nextPackId, 'Unknown pack');
  if (!save.packs.some((p) => p.id === packId)) return save;
  const next = draft(save, now);
  next.wildcardMisses ??= { common: 0, uncommon: 0, rareMythic: 0 };
  const rewards = generate(next.rng, Object.freeze({ ...next.collection }), next.wildcardMisses);
  requireSeason(rewards.length === 8, 'A Season pack must resolve eight slots');
  for (const reward of rewards) {
    if (reward.kind === 'card') {
      requireSeason(!isBasic(reward.cardId), 'Basic lands are not Season pack rewards');
      grantCard(next, reward.cardId);
    } else {
      requireSeason(reward.kind === 'wildcard', 'Unknown reward');
      addWildcard(next, reward.rarity);
    }
  }
  next.packs = next.packs.filter((p) => p.id !== packId);
  next.lastPack = { packId, rewards: structuredClone(rewards) };
  if (++next.tracks.uncommon === 6) {
    next.tracks.uncommon = 0;
    addWildcard(next, 'uncommon');
  }
  if (++next.tracks.rareMythic === 6) {
    next.tracks.rareMythic = 0;
    addWildcard(next, next.tracks.rareRewards === 4 ? 'mythic' : 'rare');
    next.tracks.rareRewards = (next.tracks.rareRewards + 1) % 5;
  }
  const trackRewards: Wildcards = { common: 0, uncommon: 0, rare: 0, mythic: 0 };
  if (next.tracks.uncommon === 0) trackRewards.uncommon++;
  if (next.tracks.rareMythic === 0)
    trackRewards[next.tracks.rareRewards === 0 ? 'mythic' : 'rare']++;
  next.lastPack.bonus = {
    coins: next.coins - save.coins,
    vaultPoints: next.vaultPoints - save.vaultPoints,
    tracks: trackRewards,
  };
  return next;
}
export function claimSeasonVault(save: SeasonSave, now: number): SeasonSave {
  requireSeason(save.vaultPoints >= 1000, 'Vault is not ready');
  const next = draft(save, now);
  next.vaultPoints -= 1000;
  addWildcard(next, 'uncommon', 3);
  addWildcard(next, 'rare', 2);
  addWildcard(next, 'mythic');
  return next;
}

/** Rebuild and validate a match without trusting imported opaque GameState. */
export function replaySeasonMatch(
  match: SeasonMatch,
  onStep?: (state: GameState, events: GameEvent[]) => void,
) {
  let state = engine.newGame({
    decks: match.decks,
    seed: match.seed,
    startingPlayer: match.startingPlayer,
  });
  let playerTurnsBegun = state.turn.number > 0 && state.turn.activePlayer === 'p1' ? 1 : 0;
  for (const action of match.actions) {
    const previousTurn = state.turn.number;
    const result = engine.applyAction(state, action);
    state = result.state;
    onStep?.(state, result.events);
    if (state.turn.number !== previousTurn && state.turn.activePlayer === 'p1') playerTurnsBegun++;
  }
  return { state, playerTurnsBegun };
}
export function beginSeasonMatch(
  save: SeasonSave,
  opponentDeckId: string,
  bot: SeasonBot,
  seed: number,
  startingPlayer: PlayerId,
  now: number,
): SeasonSave {
  requireSeason(!save.match, 'Resume or abandon the current match first');
  requireSeason(['easy', 'heuristic', 'search'].includes(bot), 'Unknown bot');
  requireSeason(startingPlayer === 'p1' || startingPlayer === 'p2', 'Unknown starting player');
  natural(seed);
  requireSeason(seed <= 0xffffffff, 'Seed must be a uint32');
  const own = save.decks.find((d) => d.id === save.selectedDeckId)!;
  requireSeason(own, 'Unknown selected deck');
  requireSeason(deckErrors(save, own).length === 0, deckErrors(save, own).join('; '));
  const opponent = OPPONENT_DECKS.find((d) => d.id === opponentDeckId);
  requireSeason(opponent, 'Unknown opponent deck');
  const next = draft(save, now);
  natural(next.nextMatchId + 1);
  next.match = {
    id: next.nextMatchId++,
    seed,
    startingPlayer,
    bot,
    opponentDeckId,
    playerDeckName: own.name,
    decks: {
      p1: Object.entries(own.cards).flatMap(([id, n]) => Array<string>(n).fill(id)),
      p2: deckIds(opponent),
    },
    actions: [],
  };
  return next;
}
export function appendSeasonAction(
  save: SeasonSave,
  matchId: number,
  action: Action,
  now: number,
): SeasonSave {
  requireSeason(save.match?.id === matchId, 'Unknown active match');
  const next = draft(save, now);
  next.match!.actions.push(structuredClone(action));
  replaySeasonMatch(next.match!);
  return next;
}
export function resolveSeasonMatch(
  save: SeasonSave,
  matchId: number,
  outcome: MatchOutcome,
  now: number,
): SeasonSave {
  natural(matchId);
  requireSeason(matchId > 0 && matchId < save.nextMatchId, 'Unknown match');
  // Old callbacks cannot pay again, including when a newer match is active.
  if (save.match?.id !== matchId) return save;
  const { state, playerTurnsBegun } = replaySeasonMatch(save.match);
  requireSeason(['win', 'loss', 'draw', 'concede'].includes(outcome), 'Unknown outcome');
  if (outcome === 'concede')
    requireSeason(state.winner === null, 'Completed games must use their actual result');
  else
    requireSeason(
      state.winner === (outcome === 'win' ? 'p1' : outcome === 'loss' ? 'p2' : 'draw'),
      'Result does not match the game',
    );
  const coins = outcome === 'win' ? 100 : outcome === 'concede' && playerTurnsBegun < 5 ? 0 : 50;
  const next = draft(save, now);
  addCoins(next, coins);
  next.lastResult = { matchId, outcome, coins };
  next.match = null;
  return next;
}
