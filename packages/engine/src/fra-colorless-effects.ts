import { type CustomEffect, obj } from './context.ts';

/**
 * Reality Fracture (17a, colorless): one-off effects, as custom effects.
 */
export const FRA_COLORLESS_EFFECTS: Record<string, CustomEffect> = {
  /**
   * Emrakul, the Exigent Doom: "Target land gains '{T}: Add {C}{C}' until this card is cast from exile.
   * You may cast this card for as long as it remains exiled." The card is the source, already exiled
   * as the cost of its ability (a target land that is no longer legal fizzles all of it).
   */
  emrakulMana(ctx, es) {
    const t = es.targets[0];
    if (!t || !('object' in t) || !es.source) return;
    const land = ctx.s.objects[t.object.id];
    if (!land || land.zone !== 'battlefield' || land.zcc !== t.object.zcc) return;
    land.abilitiesUntilCast = [
      ...(land.abilitiesUntilCast ?? []),
      {
        card: es.source.id,
        ability: { kind: 'mana', cost: { tapSelf: true }, produces: 'C', amount: 2 },
      },
    ];
    const card = obj(ctx, es.source.id);
    if (card.zone === 'exile') card.castableWhileExiled = true;
  },

  /** Hall of Echoes: "The legend rule doesn't apply to permanents you control this turn." */
  legendRuleOffThisTurn(ctx, es) {
    const list = ctx.s.turn.noLegendRule ?? [];
    if (!list.includes(es.controller)) ctx.s.turn.noLegendRule = [...list, es.controller];
  },
};
