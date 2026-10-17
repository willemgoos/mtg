import type { CardDefinition } from '@mtg/engine';

// Wilds of Eldraine (23a): the cast menu and prompt texts for bargain (Arena: "Bargain" / "Don't bargain", then the board asks for
// the permanent to sacrifice).

/** The cast menu entry of a bargain card: the bargained cast or the normal one. */
export function bargainCastLabel(
  kicker: NonNullable<CardDefinition['kicker']>,
  bargained: boolean,
): string {
  if (!bargained) return "Don't bargain";
  const less = kicker.costReduction ? ` (costs {${kicker.costReduction}} less)` : '';
  return `Bargain: sacrifice an artifact, enchantment, or token${less}`;
}

/** What the board asks for once the bargained cast is picked ("Choose ..."). */
export const BARGAIN_PROMPT = 'an artifact, enchantment, or token to sacrifice (bargain)';
