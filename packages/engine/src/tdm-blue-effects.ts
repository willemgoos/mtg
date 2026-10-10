import { type Ctx, type CustomEffect, def, moveObject } from './context.ts';
import { type Chooser, CHOOSERS } from './stx-13c-a-effects.ts';
import { defMatches } from './triggers.ts';
import type { CardFilter, EffectDef, EffectSource, ObjectId } from './types.ts';

/**
 * Tarkir: Dragonstorm (19b, blue): one-off effects, as custom effects, and the choosers behind `chooseCustom`.
 * Kishla Trawlers and Aegis Sculptor ("you may exile ... from your graveyard"), Stillness in Motion.
 */

const custom = (handler: string, params?: Record<string, unknown>): EffectDef => ({
  kind: 'custom',
  handler,
  ...(params ? { params } : {}),
});

/** One card of each name in `player`'s graveyard (identical cards are one choice), filtered. */
function graveyardChoices(ctx: Ctx, es: EffectSource, filter?: CardFilter): ObjectId[] {
  const seen = new Set<string>();
  const out: ObjectId[] = [];
  for (const id of ctx.s.players[es.controller].graveyard) {
    const o = ctx.s.objects[id]!;
    const d = ctx.db.get(o.defId);
    if (!d || (filter && !defMatches(d, filter))) continue;
    if (seen.has(d.id)) continue;
    seen.add(d.id);
    out.push(id);
  }
  return out;
}

const cardsIn = (ctx: Ctx, es: EffectSource, filter?: CardFilter): number =>
  ctx.s.players[es.controller].graveyard.filter((id) => {
    const d = ctx.db.get(ctx.s.objects[id]!.defId);
    return !!d && (!filter || defMatches(d, filter));
  }).length;

export const TDM_BLUE_EFFECTS: Record<string, CustomEffect> = {
  /** Exile this card from its owner's graveyard (a card chosen earlier in the resolution). */
  tdmExileCard(ctx, _es, params) {
    const { id } = params as { id: ObjectId };
    const o = ctx.s.objects[id];
    if (o && o.zone === 'graveyard') moveObject(ctx, id, 'exile');
  },
  /** Stillness in Motion: put this card from the graveyard on top of the library. */
  tdmPutOnTop(ctx, _es, params) {
    const { id } = params as { id: ObjectId };
    const o = ctx.s.objects[id];
    if (o && o.zone === 'graveyard') moveObject(ctx, id, 'library', { position: 'top' });
  },
};

const TDM_BLUE_CHOOSERS: Record<string, Chooser> = {
  /**
   * "You may exile <count> card(s) matching `filter` from your graveyard. If you do / When you do, <then>": the cards are picked
   * one at a time (params: `count`, `filter`, `then`, `title`; `left` once the choosing has begun).
   */
  tdmExileFromGraveyard(ctx, es, params) {
    const p = params as {
      count: number;
      filter?: CardFilter;
      then: EffectDef[];
      title: string;
      left?: number;
    };
    const picks = graveyardChoices(ctx, es, p.filter);
    const again = (left: number): EffectDef => ({
      kind: 'chooseCustom',
      handler: 'tdmExileFromGraveyard',
      params: { ...p, left },
    });
    if (p.left !== undefined) {
      // Choosing has begun (the player said yes): every card must be picked.
      if (picks.length === 0) return null;
      return {
        title: `${p.title} (${p.left} left)`,
        options: picks.map((id) => ({
          label: `Exile ${def(ctx, id).name}`,
          effects: [
            custom('tdmExileCard', { id }),
            ...(p.left! > 1 ? [again(p.left! - 1)] : p.then),
          ],
        })),
      };
    }
    if (cardsIn(ctx, es, p.filter) < p.count) return null;
    const decline = { label: "Don't exile", effects: [] as EffectDef[] };
    if (p.count === 1)
      return {
        title: p.title,
        options: [
          ...picks.map((id) => ({
            label: `Exile ${def(ctx, id).name}`,
            effects: [custom('tdmExileCard', { id }), ...p.then],
          })),
          decline,
        ],
      };
    return {
      title: p.title,
      options: [
        { label: `Exile ${p.count} cards from your graveyard`, effects: [again(p.count)] },
        decline,
      ],
    };
  },
  /**
   * Stillness in Motion: "if your library has no cards in it, exile this enchantment and put five cards from your graveyard on top
   * of your library in any order." The cards are picked one at a time; the last one picked ends up on top.
   */
  tdmStillness(ctx, es, params) {
    const p = (params ?? {}) as { left?: number };
    const picks = graveyardChoices(ctx, es);
    const exileSelf: EffectDef = { kind: 'exile', what: 'self' };
    if (p.left === undefined) {
      if (ctx.s.players[es.controller].library.length > 0) return null;
      if (picks.length === 0)
        return {
          title: 'Stillness in Motion',
          options: [{ label: 'Exile Stillness in Motion', effects: [exileSelf] }],
        };
    } else if (picks.length === 0) return null;
    const left = p.left ?? Math.min(5, ctx.s.players[es.controller].graveyard.length);
    return {
      title: `Put a card from your graveyard on top of your library (${left} left; the last one you choose ends up on top)`,
      options: picks.map((id) => ({
        label: `Put ${def(ctx, id).name} on top`,
        effects: [
          ...(p.left === undefined ? [exileSelf] : []),
          custom('tdmPutOnTop', { id }),
          ...(left > 1
            ? [
                {
                  kind: 'chooseCustom',
                  handler: 'tdmStillness',
                  params: { left: left - 1 },
                } satisfies EffectDef,
              ]
            : []),
        ],
      })),
    };
  },
};

Object.assign(CHOOSERS, TDM_BLUE_CHOOSERS);
