import type { ScryfallCard } from '@mtg/cards';
import { isRemoval } from './deckCompletion.ts';

/*
 * What a card does for a deck, read from its rules text, so a player can look
 * for "removal" or "card draw" in the collection. A heuristic, like
 * limitedRating: it reads the wording, not the card's implementation.
 */

export type CardRole =
  'removal' | 'wipe' | 'counter' | 'draw' | 'ramp' | 'tokens' | 'trick' | 'lifegain';

export const ROLES: { id: CardRole; label: string; hint: string }[] = [
  { id: 'removal', label: 'Removal', hint: 'Destroys, exiles, damages or shrinks a creature' },
  { id: 'wipe', label: 'Board wipe', hint: 'Deals with every creature at once' },
  { id: 'counter', label: 'Counterspell', hint: 'Counters a spell or ability' },
  { id: 'draw', label: 'Card draw', hint: 'Draws you cards' },
  { id: 'ramp', label: 'Ramp', hint: 'Makes extra mana or fetches lands' },
  { id: 'tokens', label: 'Tokens', hint: 'Creates tokens' },
  { id: 'trick', label: 'Combat trick', hint: 'An instant that pumps or protects a creature' },
  { id: 'lifegain', label: 'Life gain', hint: 'Gains you life' },
];

const WIPE =
  /(?:destroy|exile) (?:all|each) (?:other )?(?:\w+ )?(?:creatures|permanents)|deals? (?:\d+|x) damage to each (?:other )?creature|(?:all|each) (?:other )?creatures? (?:get|gets) -\d+\/-\d+|return all (?:other )?(?:nonland )?(?:creatures|permanents)/;
const COUNTER = /\bcounter target\b/;
const DRAW = /\bdraws? (?:a|one|two|three|four|five|x|that many) (?:additional )?cards?\b/;
const RAMP =
  /search your library for (?:a|an|up to \w+|two) (?:basic )?(?:\w+ )?lands?|\badd (?:\{[wubrgc\d]\}|one mana|two mana|three mana|\w+ mana of)/;
const TOKENS = /\bcreate\b[^.]*\btokens?\b/;
const TRICK =
  /target (?:creature|creatures)[^.]*\b(?:gets?|get) \+\d+\/\+\d+|target creature[^.]*\bgains? (?:hexproof|indestructible|protection)/;
const LIFE = /\bgain (?:\d+|x|that much) life\b|\blifelink\b/;

/** The roles a card plays; empty for one that does none of these (a plain creature, a land). */
export function cardRoles(c: ScryfallCard): CardRole[] {
  const text = (c.oracleText ?? '').toLowerCase();
  const type = c.typeLine ?? '';
  const roles: CardRole[] = [];
  if (isRemoval(c.name)) roles.push('removal');
  if (WIPE.test(text)) roles.push('wipe');
  if (COUNTER.test(text)) roles.push('counter');
  if (DRAW.test(text)) roles.push('draw');
  // Every land makes mana; ramp is the rest.
  if (!/\bLand\b/.test(type) && RAMP.test(text)) roles.push('ramp');
  if (TOKENS.test(text)) roles.push('tokens');
  if (/\bInstant\b/.test(type) && TRICK.test(text)) roles.push('trick');
  if (LIFE.test(text)) roles.push('lifegain');
  return roles;
}
