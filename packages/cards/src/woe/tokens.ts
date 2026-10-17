import type { CardDefinition } from '@mtg/engine';
import { WOE_ROLE_TOKENS } from '../woe-vocab.ts';

/**
 * Wilds of Eldraine tokens made by two or more cards. Tokens used by one card only live in
 * that card's group file. Not repeated here: Food ('food-token', shared with Lord of the
 * Rings and The Hobbit). The seven Role tokens come from `woe-vocab.ts` (23a).
 */
export const WOE_SHARED_TOKENS: CardDefinition[] = [...WOE_ROLE_TOKENS];
