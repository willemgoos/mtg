import { creaturesOnBattlefield, hasKeyword, matchesFilter } from './characteristics.ts';
import { type Ctx, deref, other, refOf } from './context.ts';
import type { ObjectId, PlayerId, TargetChoice, TargetSpec } from './types.ts';
import { PLAYERS } from './types.ts';

export interface TargetingSource {
  controller: PlayerId;
  /** The permanent/card the spell or ability comes from (for "another" and hexproof). */
  sourceId?: ObjectId;
}

function playerOk(ctx: Ctx, spec: TargetSpec, p: PlayerId, src: TargetingSource): boolean {
  if (ctx.s.players[p].lost) return false;
  if (spec.controller === 'you' && p !== src.controller) return false;
  if (spec.controller === 'opponent' && p !== other(src.controller)) return false;
  return true;
}

function creatureOk(ctx: Ctx, spec: TargetSpec, id: ObjectId, src: TargetingSource): boolean {
  const o = ctx.s.objects[id];
  if (!o || o.zone !== 'battlefield') return false;
  if (spec.controller === 'you' && o.controller !== src.controller) return false;
  if (spec.controller === 'opponent' && o.controller === src.controller) return false;
  if (o.controller !== src.controller && hasKeyword(ctx, id, 'hexproof')) return false;
  return matchesFilter(ctx, id, spec.filter, src.sourceId);
}

export function targetCandidates(ctx: Ctx, spec: TargetSpec, src: TargetingSource): TargetChoice[] {
  const out: TargetChoice[] = [];
  if (spec.what === 'creature' || spec.what === 'any') {
    for (const c of creaturesOnBattlefield(ctx)) {
      if (creatureOk(ctx, spec, c.id, src)) out.push({ object: refOf(c) });
    }
  }
  if (spec.what === 'player' || spec.what === 'any') {
    for (const p of PLAYERS) if (playerOk(ctx, spec, p, src)) out.push({ player: p });
  }
  return out;
}

/** Every legal combination of targets (cartesian product over the specs). */
export function targetCombos(
  ctx: Ctx,
  specs: readonly TargetSpec[],
  src: TargetingSource,
): TargetChoice[][] {
  let combos: TargetChoice[][] = [[]];
  for (const spec of specs) {
    const cands = targetCandidates(ctx, spec, src);
    const next: TargetChoice[][] = [];
    for (const c of combos) for (const t of cands) next.push([...c, t]);
    combos = next;
    if (combos.length === 0) break;
  }
  return combos;
}

/** Is a previously chosen target still legal (checked on resolution)? */
export function isTargetLegal(
  ctx: Ctx,
  spec: TargetSpec,
  t: TargetChoice,
  src: TargetingSource,
): boolean {
  if ('player' in t) return spec.what !== 'creature' && playerOk(ctx, spec, t.player, src);
  if (spec.what === 'player') return false;
  const o = deref(ctx, t.object);
  return !!o && creatureOk(ctx, spec, o.id, src);
}
