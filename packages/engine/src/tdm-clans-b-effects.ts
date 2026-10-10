import { type Ctx, type CustomEffect, createObject, emit, obj, other } from './context.ts';
import { tokenMultiplier } from './brawl-15a-w-effects.ts';
import { creaturesOnBattlefield } from './characteristics.ts';
import { runEffect } from './effects.ts';
import type { EffectSource, ObjectId, PlayerId } from './types.ts';

/**
 * Tarkir: Dragonstorm (19b, clans-b): one-offs of the Mardu and Temur cards, as custom effects. The vocabulary that lives in
 * types.ts is marked "Tarkir: Dragonstorm (19b, clans-b)".
 */

/** Each of `ids` gets +P/+T until end of turn, P and T being its own power and toughness now ("double its power and toughness"). */
function doubleAll(ctx: Ctx, es: EffectSource, ids: ObjectId[]): void {
  const targets = ids.map((id) => ({ object: { id, zcc: obj(ctx, id).zcc } }));
  for (const t of targets)
    runEffect(
      ctx,
      { ...es, targets: [t] },
      {
        kind: 'pump',
        to: { target: 0 },
        power: { powerOf: { target: 0 } },
        toughness: { toughnessOf: { target: 0 } },
      },
    );
}

export const TDM_CLANS_B_EFFECTS: Record<string, CustomEffect> = {
  /** Roar of Endless Song, chapter III: "Double the power and toughness of each creature you control until end of turn." */
  tdmDoubleYourCreatures(ctx, es) {
    doubleAll(
      ctx,
      es,
      creaturesOnBattlefield(ctx, es.controller).map((c) => c.id),
    );
  },

  /**
   * Mardu Siegebreaker, "Whenever this creature attacks, for each opponent, create a tapped token that's a copy of the exiled
   * card attacking that opponent. At the beginning of your next end step, sacrifice those tokens."
   */
  tdmSiegebreakerCopy(ctx, es) {
    const self = es.source && ctx.s.objects[es.source.id];
    if (!self || self.zone !== 'battlefield' || self.zcc !== es.source!.zcc) return;
    const defender: PlayerId = other(es.controller);
    const times = tokenMultiplier(ctx, es.controller);
    for (const id of self.exiledUntilLeaves ?? []) {
      const card = ctx.s.objects[id];
      if (!card || card.zone !== 'exile') continue;
      for (let i = 0; i < times; i++) {
        const t = createObject(ctx, card.defId, es.controller, 'battlefield', true);
        t.tapped = true;
        ctx.s.battlefield.push(t.id);
        ctx.s.combat?.attackers.push({ id: t.id, defender, blocked: false, blockers: [] });
        (ctx.s.delayed ??= []).push({
          controller: es.controller,
          sourceDefId: es.sourceDefId,
          subject: { id: t.id, zcc: t.zcc },
          effects: [{ kind: 'sacrifice', what: 'subject' }],
          // The beginning of your next end step: this turn's, as it attacks on your own turn.
          fromTurn: ctx.s.turn.number,
          whose: es.controller,
        });
        emit(ctx, { type: 'objectMoved', id: t.id, defId: t.defId, from: null, to: 'battlefield' });
      }
    }
  },
};
