import { tokenMultiplier } from './brawl-15a-w-effects.ts';
import { isCreature } from './characteristics.ts';
import { type Ctx, def, obj } from './context.ts';
import { objectsOf, resolveAmount } from './effects.ts';
import type { EffectDef, EffectSource, PlayerId } from './types.ts';

// Lorwyn Eclipsed (18b, special): Mirrormind Crown. "As long as this Equipment is attached to a creature, the first time you would
// create one or more tokens each turn, you may instead create that many tokens that are copies of equipped creature."

/** The creatures equipped with one of `player`'s Mirrormind Crowns (the Crown first, then the creature). */
function crownHosts(ctx: Ctx, player: PlayerId): { crown: string; creature: string }[] {
  const out: { crown: string; creature: string }[] = [];
  for (const id of ctx.s.battlefield) {
    const o = obj(ctx, id);
    if (o.controller !== player || o.attachedTo === undefined) continue;
    if (!def(ctx, id).abilities.some((a) => a.kind === 'static' && a.effect.kind === 'firstTokensCopyEquipped'))
      continue;
    const host = ctx.s.objects[o.attachedTo];
    if (host && host.zone === 'battlefield' && isCreature(ctx, host.id))
      out.push({ crown: id, creature: host.id });
  }
  return out;
}

/**
 * If `e` (a token-creating effect) is the first time its controller would create tokens this turn and they have a Mirrormind Crown on a
 * creature, the effect to run in its place: a choice between the tokens as they were and the copies of the equipped creature (one choice
 * per Crown). The turn's first creation is used up either way. Null if nothing is replaced.
 */
export function crownReplacement(
  ctx: Ctx,
  es: EffectSource,
  e: Extract<EffectDef, { kind: 'createToken' | 'tokenCopy' }>,
): EffectDef | null {
  const player = es.controller;
  // Tokens made for someone else (Beast Within, an opponent's token) are that player's own creation event.
  if (e.kind === 'createToken' && (e.forOpponent || e.forControllerOf !== undefined)) return null;
  if (e.kind === 'tokenCopy' && e.underTarget !== undefined) return null;
  if (ctx.s.turn.firstTokensDone?.includes(player)) return null;
  const hosts = crownHosts(ctx, player);
  if (hosts.length === 0) return null;
  const count =
    e.kind === 'createToken'
      ? resolveAmount(ctx, es, e.count) * tokenMultiplier(ctx, player)
      : (e.count !== undefined ? resolveAmount(ctx, es, e.count) : 1) *
        objectsOf(ctx, es, e.of).length;
  if (count <= 0) return null;
  ctx.s.turn.firstTokensDone = [...(ctx.s.turn.firstTokensDone ?? []), player];
  return {
    kind: 'choose',
    options: [
      { label: `Create ${count === 1 ? 'the token' : 'the tokens'}`, effects: [e] },
      ...hosts.map(({ crown, creature }) => ({
        label: `Mirrormind Crown: create ${count} ${count === 1 ? 'copy' : 'copies'} of ${def(ctx, creature).name} instead`,
        effects: [{ kind: 'custom', handler: 'eclCrownCopies', params: { crown, creature, count } } as EffectDef],
      })),
    ],
  };
}
