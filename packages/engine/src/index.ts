export * from './types.ts';
export { createEngine, actionKey, IllegalActionError } from './engine.ts';
export type { Engine, EngineOptions, ApplyOptions } from './engine.ts';
export type { NewGameOptions } from './setup.ts';
export type { CustomEffect } from './context.ts';
export { createRng, nextInt } from './rng.ts';
export { cloneState } from './clone.ts';
export { manaValue } from './mana.ts';

import { characteristics as characteristicsOf } from './characteristics.ts';
import { makeCtx } from './context.ts';
import type { CardDb, GameState, ObjectId } from './types.ts';

/** Current power/toughness/keywords of a permanent, for UIs and bots. */
export function getCharacteristics(state: GameState, db: CardDb, id: ObjectId) {
  return characteristicsOf(makeCtx(state, db), id);
}
export { playRandomGame } from './random-play.ts';
export type { RandomGameResult } from './random-play.ts';
export { HIDDEN_CARD, redactFor, redactEvents, determinize } from './hidden.ts';
export { combineSpells } from './spells.ts';
