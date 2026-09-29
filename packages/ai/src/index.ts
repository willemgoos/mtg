export type { Bot } from './view.ts';
export { viewEngine } from './view.ts';
export { evaluate, creatureValue, lifeValue } from './evaluate.ts';
export { settle, simulate, scoreAction, quickBlocks } from './simulate.ts';
export { createHeuristicBot, planAttacks, planBlocks } from './heuristic.ts';
export { createRandomBot, playMatch } from './match.ts';
export type { MatchResult } from './match.ts';
