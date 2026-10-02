import { type Ctx, createObject, def, drawCard, emit, moveObject } from './context.ts';
import { createRng, nextInt, shuffleInPlace } from './rng.ts';
import type { CardDefId, GameState, ObjectId, PlayerId, PlayerState } from './types.ts';
import { PLAYERS } from './types.ts';

export const STARTING_LIFE = 20;
export const BRAWL_LIFE = 25;
export const OPENING_HAND = 7;

export interface NewGameOptions {
  decks: Record<PlayerId, readonly CardDefId[]>;
  seed: number;
  startingPlayer?: PlayerId;
  /** Starting life, if not 20. */
  life?: Partial<Record<PlayerId, number>>;
  /** Extra cards in the opening hand (and each mulligan's new hand). */
  extraCards?: Partial<Record<PlayerId, number>>;
  /**
   * Players who start with a basic land from their library on the battlefield;
   * a player listed twice starts with two.
   */
  landInPlay?: readonly PlayerId[];
  /** Brawl: 25 life, the first mulligan free, and each player's commander in the command zone. */
  format?: 'brawl';
  /** Brawl: each player's commander (not part of `decks`). */
  commanders?: Partial<Record<PlayerId, CardDefId>>;
}

/** Cards a player draws for an opening hand. */
export const openingHand = (ps: PlayerState): number => ps.openingHand ?? OPENING_HAND;

function emptyPlayer(id: PlayerId): PlayerState {
  return {
    id,
    life: STARTING_LIFE,
    library: [],
    hand: [],
    graveyard: [],
    exile: [],
    command: [],
    landsPlayedThisTurn: 0,
    attackedThisTurn: false,
    drewFromEmptyLibrary: false,
    mulligans: 0,
    keptHand: false,
    lost: false,
  };
}

export function emptyState(seed: number): GameState {
  return {
    schemaVersion: 1,
    seed,
    rng: createRng(seed),
    nextObjectId: 1,
    nextTimestamp: 1,
    players: { p1: emptyPlayer('p1'), p2: emptyPlayer('p2') },
    objects: {},
    battlefield: [],
    stack: [],
    turn: {
      number: 0,
      activePlayer: 'p1',
      step: 'untap',
      passed: [],
      extraCombats: 0,
      attackers: [],
      lifeGains: { p1: 0, p2: 0 },
      creaturesDied: 0,
      cardsDrawn: { p1: 0, p2: 0 },
      manaSpent: { p1: 0, p2: 0 },
      lifeLost: { p1: 0, p2: 0 },
    },
    combat: null,
    effects: [],
    pendingTriggers: [],
    decision: { kind: 'mulligan', player: 'p1' },
    winner: null,
  };
}

export function shuffleLibrary(ctx: Ctx, player: PlayerId): void {
  shuffleInPlace(ctx.s.rng, ctx.s.players[player].library);
  emit(ctx, { type: 'shuffled', player });
}

/** Builds libraries, shuffles, draws opening hands and asks the starting player to mulligan. */
export function setupGame(ctx: Ctx, opts: NewGameOptions): void {
  const s = ctx.s;
  for (const p of PLAYERS) {
    // Shuffle before creating objects, so ids don't reveal decklist order.
    const deck = [...opts.decks[p]];
    shuffleInPlace(s.rng, deck);
    for (const defId of deck) s.players[p].library.push(createObject(ctx, defId, p, 'library').id);
    emit(ctx, { type: 'shuffled', player: p });
  }
  if (opts.format) s.format = opts.format;
  for (const p of PLAYERS) {
    const ps = s.players[p];
    if (opts.format === 'brawl') ps.life = BRAWL_LIFE;
    const commander = opts.commanders?.[p];
    if (commander) ps.commander = putInCommandZone(ctx, commander, p);
    if (opts.life?.[p] !== undefined) ps.life = opts.life[p]!;
    if (opts.extraCards?.[p]) ps.openingHand = OPENING_HAND + opts.extraCards[p]!;
    for (const _ of opts.landInPlay?.filter((x) => x === p) ?? []) {
      const land = ps.library.find((id) => def(ctx, id).supertypes.includes('Basic'));
      if (land !== undefined) moveObject(ctx, land, 'battlefield', { controller: p });
    }
  }
  const first = opts.startingPlayer ?? (nextInt(s.rng, 2) === 0 ? 'p1' : 'p2');
  s.turn.activePlayer = first;
  for (const p of PLAYERS) for (let i = 0; i < openingHand(s.players[p]); i++) drawCard(ctx, p);
  s.decision = { kind: 'mulligan', player: first };
}

/** Brawl: creates a player's commander in their command zone. */
export function putInCommandZone(ctx: Ctx, defId: CardDefId, player: PlayerId): ObjectId {
  const o = createObject(ctx, defId, player, 'command');
  ctx.s.players[player].command.push(o.id);
  return o.id;
}
