import { cardMatches, matchesFilter } from './characteristics.ts';
import { type Ctx, type CustomEffect, def, emit, obj } from './context.ts';
import { type Chooser, CHOOSERS } from './stx-13c-a-effects.ts';
import type { CardFilter, ObjectId, PlayerId } from './types.ts';

/**
 * Reality Fracture (17c, uncommons): behold ("choose a Jace you control or reveal a Jace card from your hand") as a
 * choice with a reveal, shared by Countersculpt, a kicker that beholds and Theorist's Sanctum.
 */

/**
 * What `player` can behold: a permanent they control matching the filter, or another matching card in their hand (it is
 * revealed). Each distinct card is a choice; cards with the same name are one choice (the permanents first).
 */
export function beholdOptions(
  ctx: Ctx,
  player: PlayerId,
  card: ObjectId,
  filter: CardFilter,
): ObjectId[] {
  const seen = new Set<string>();
  const pick = (id: ObjectId, zone: string): ObjectId[] => {
    const key = `${zone}:${obj(ctx, id).defId}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [id];
  };
  return [
    ...ctx.s.battlefield
      .filter((id) => obj(ctx, id).controller === player && matchesFilter(ctx, id, filter))
      .flatMap((id) => pick(id, 'battlefield')),
    ...ctx.s.players[player].hand
      .filter((id) => id !== card && cardMatches(ctx, id, filter))
      .flatMap((id) => pick(id, 'hand')),
  ];
}

/** Beholding a card in your hand reveals it to the table. */
export function revealBeheld(ctx: Ctx, player: PlayerId, id: ObjectId): void {
  const o = ctx.s.objects[id];
  if (o && o.zone === 'hand' && o.owner === player)
    emit(ctx, { type: 'cardsRevealed', player, cards: [{ id, defId: o.defId }] });
}

export const FRA_PW_B_EFFECTS: Record<string, CustomEffect> = {
  /** "Behold" as part of an effect: the chosen card (a permanent or one in hand) is revealed if it is in hand. */
  revealBeheld(ctx, es, params) {
    revealBeheld(ctx, es.controller, (params as { id: ObjectId }).id);
  },
};

const FRA_PW_B_CHOOSERS: Record<string, Chooser> = {
  /**
   * Theorist's Sanctum: "As this land enters, you may behold a Jace. If you don't, it enters tapped." The land enters
   * tapped (the way shock lands do) and beholding untaps it; the player picks which Jace, and one in hand is revealed.
   */
  beholdToEnterUntapped(ctx, es, params) {
    const self = es.source && ctx.s.objects[es.source.id];
    if (!self || self.zone !== 'battlefield' || !self.tapped) return null;
    const filter = (params as { filter: CardFilter }).filter;
    const options = beholdOptions(ctx, es.controller, self.id, filter);
    if (options.length === 0) return null;
    return {
      title: `${def(ctx, self.id).name}: behold a card to have it enter untapped?`,
      options: [
        ...options.map((id) => ({
          label: `Behold ${def(ctx, id).name}${obj(ctx, id).zone === 'hand' ? ' (reveal it from your hand)' : ''}`,
          effects: [
            { kind: 'custom', handler: 'revealBeheld', params: { id } } as const,
            { kind: 'untap', what: 'self' } as const,
          ],
        })),
        { label: 'Enter tapped', effects: [] },
      ],
    };
  },
};
Object.assign(CHOOSERS, FRA_PW_B_CHOOSERS);
