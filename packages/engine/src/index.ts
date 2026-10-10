export * from './types.ts';
export { createEngine, actionKey, IllegalActionError } from './engine.ts';
export type { Engine, EngineOptions, ApplyOptions } from './engine.ts';
export type { NewGameOptions } from './setup.ts';
export { BRAWL_LIFE, STARTING_LIFE } from './setup.ts';
export { colorIdentity } from './brawl.ts';
export type { CustomEffect } from './context.ts';
export { createRng, nextInt } from './rng.ts';
export { cloneState } from './clone.ts';
export { manaValue } from './mana.ts';

import { characteristics as characteristicsOf } from './characteristics.ts';
import { def as defOf, makeCtx } from './context.ts';
import type { AbilityDef, CardDb, Color, GameState, ObjectId } from './types.ts';

/** Current power/toughness/keywords of a permanent, for UIs and bots. */
export function getCharacteristics(state: GameState, db: CardDb, id: ObjectId) {
  return characteristicsOf(makeCtx(state, db), id);
}

/** Reality Fracture (17c): a permanent's current abilities (printed ones plus any granted to it), indexed as `abilityIndex`. */
export function getAbilities(state: GameState, db: CardDb, id: ObjectId): AbilityDef[] {
  return defOf(makeCtx(state, db), id).abilities;
}
/** Lorwyn Eclipsed (18b, multi-b): a permanent's current colors (all five while Tam, Mindful First-Year has made it so). */
export function getColors(state: GameState, db: CardDb, id: ObjectId): readonly Color[] {
  return defOf(makeCtx(state, db), id).colors;
}
export { playRandomGame } from './random-play.ts';
export type { RandomGameResult } from './random-play.ts';
export { HIDDEN_CARD, redactFor, redactEvents, determinize } from './hidden.ts';
export { combineSpells } from './spells.ts';
export { variantIdOf } from './tdm-19a.ts'; // Tarkir: Dragonstorm (19a)
