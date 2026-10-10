import { matchesFilter } from './characteristics.ts';
import { type Ctx, obj } from './context.ts';
import { checkCondition } from './triggers.ts';
import type { AbilityDef, EffectSource, ObjectId, PlayerId } from './types.ts';

/**
 * The Lord of the Rings (21b, black): small engine pieces of the black cards. (The hooks are marked
 * `// Lord of the Rings (21b black)` where they sit.)
 */

/** Is this permanent legendary right now (a Ring-bearer counts)? Read before it is sacrificed as a cost. */
export function isLegendaryNow(ctx: Ctx, id: ObjectId): boolean {
  return matchesFilter(ctx, id, { supertypes: ['Legendary'] });
}

/** Gríma Wormtongue: "Your opponents can't gain life." Does a permanent of a player other than `player` say so? */
export function opponentsCantGainLife(ctx: Ctx, player: PlayerId): boolean {
  return ctx.s.battlefield.some((id) => {
    const o = obj(ctx, id);
    return (
      o.controller !== player &&
      !!ctx.db.get(o.defId)?.abilities.some(
        (a) => a.kind === 'static' && a.effect.kind === 'opponentsCantGainLife',
      )
    );
  });
}

/** Mordor Trebuchet: "Sacrifice that token at end of combat." */
export function sacrificeAtEndOfCombat(
  ctx: Ctx,
  es: EffectSource,
  token: { id: ObjectId; zcc: number },
): void {
  (ctx.s.delayed ??= []).push({
    controller: es.controller,
    sourceDefId: es.sourceDefId,
    subject: { id: token.id, zcc: token.zcc },
    effects: [{ kind: 'sacrifice', what: 'subject' }],
    fromTurn: ctx.s.turn.number,
    at: 'endCombat',
  });
}

/**
 * Grond, the Gatebreaker: "As long as it's your turn and you control an Army, Grond is an artifact creature." Does a static
 * `while` ability with `becomesCreature` of this permanent hold right now?
 */
const hasCreatureStatic = new WeakMap<object, readonly AbilityDef[]>();

export function staticallyCreature(ctx: Ctx, id: ObjectId): boolean {
  const o = obj(ctx, id);
  const d = ctx.db.get(o.defId);
  if (!d) return false;
  // Almost no card has such a static: remember which ones do (per definition).
  let own = hasCreatureStatic.get(d);
  if (!own) {
    own = d.abilities.filter(
      (a) => a.kind === 'static' && a.effect.kind === 'while' && !!a.effect.becomesCreature,
    );
    hasCreatureStatic.set(d, own);
  }
  return own.some(
    (a) =>
      a.kind === 'static' &&
      a.effect.kind === 'while' &&
      checkCondition(ctx, a.effect.condition, o.controller, o),
  );
}
