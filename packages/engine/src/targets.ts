import { cardMatches, hasKeyword, isCreature, matchesFilter } from './characteristics.ts';
import { type Ctx, def, defOf, deref, obj, other, refOf } from './context.ts';
import { manaValue } from './cost.ts';
import { checkCondition } from './triggers.ts';
import type { ObjectId, PlayerId, TargetChoice, TargetSpec } from './types.ts';
import { PLAYERS } from './types.ts';

export interface TargetingSource {
  controller: PlayerId;
  /** The permanent/card the spell or ability comes from (for "another" and hexproof). */
  sourceId?: ObjectId;
  /** What caused a trigger (Clement: "with lesser mana value"). */
  subjectId?: ObjectId;
}

/** "With lesser mana value" than the creature that caused the trigger (Clement, Jackdaw Savior). */
function lesserThanSubject(
  ctx: Ctx,
  spec: TargetSpec,
  id: ObjectId,
  src: TargetingSource,
): boolean {
  if (!spec.filter?.lesserManaValueThanSubject || !src.subjectId) return true;
  const subject = ctx.s.objects[src.subjectId];
  if (!subject) return true;
  return manaValue(def(ctx, id).manaCost) < manaValue(defOf(ctx, subject.defId).manaCost);
}

function playerOk(ctx: Ctx, spec: TargetSpec, p: PlayerId, src: TargetingSource): boolean {
  if (ctx.s.players[p].lost) return false;
  // Dawn's Truce: hexproof against opponents.
  if (p !== src.controller && ctx.s.turn.hexproofPlayers?.includes(p)) return false;
  // Marvel Super Heroes: "you have hexproof" (Captain America, Super-Soldier).
  if (p !== src.controller && youHaveHexproof(ctx, p)) return false;
  if (spec.controller === 'you' && p !== src.controller) return false;
  if (spec.controller === 'opponent' && p !== other(src.controller)) return false;
  return true;
}

function permanentOk(ctx: Ctx, spec: TargetSpec, id: ObjectId, src: TargetingSource): boolean {
  const o = ctx.s.objects[id];
  if (!o || o.zone !== 'battlefield') return false;
  const walker = spec.what === 'any' && def(ctx, id).types.includes('Planeswalker');
  if (spec.what !== 'permanent' && !isCreature(ctx, id) && !walker) return false;
  if (spec.controller === 'you' && o.controller !== src.controller) return false;
  if (spec.controller === 'opponent' && o.controller === src.controller) return false;
  // Whispersilk Cloak: nobody can target it.
  if (hasKeyword(ctx, id, 'shroud')) return false;
  if (o.controller !== src.controller) {
    if (hasKeyword(ctx, id, 'hexproof')) return false;
    if (
      hasKeyword(ctx, id, 'hexproofFromInstants') &&
      src.sourceId &&
      def(ctx, src.sourceId).types.includes('Instant')
    )
      return false;
  }
  if (!lesserThanSubject(ctx, spec, id, src)) return false;
  if (spec.filter?.notSubject && id === src.subjectId) return false;
  return matchesFilter(ctx, id, spec.filter, src.sourceId);
}

/** A spell on the stack (counterspells). */
function spellOk(ctx: Ctx, spec: TargetSpec, id: ObjectId, src: TargetingSource): boolean {
  const o = ctx.s.objects[id];
  if (!o || o.zone !== 'stack' || !ctx.s.stack.some((x) => x.kind === 'spell' && x.id === id))
    return false;
  if (spec.controller === 'you' && o.controller !== src.controller) return false;
  if (spec.controller === 'opponent' && o.controller === src.controller) return false;
  if (id === src.sourceId) return false;
  return !spec.filter || cardMatches(ctx, id, spec.filter, src.sourceId);
}

function graveyardCardOk(ctx: Ctx, spec: TargetSpec, id: ObjectId, src: TargetingSource): boolean {
  const o = ctx.s.objects[id];
  if (!o || o.zone !== 'graveyard') return false;
  if (spec.controller === 'you' && o.owner !== src.controller) return false;
  if (spec.controller === 'opponent' && o.owner === src.controller) return false;
  if (spec.filter?.other && id === src.sourceId) return false;
  if (!lesserThanSubject(ctx, spec, id, src)) return false;
  return !spec.filter || cardMatches(ctx, id, spec.filter, src.sourceId);
}

export function targetCandidates(ctx: Ctx, spec: TargetSpec, src: TargetingSource): TargetChoice[] {
  const out: TargetChoice[] = [];
  if (spec.what === 'creature' || spec.what === 'any' || spec.what === 'permanent') {
    for (const id of ctx.s.battlefield) {
      if (permanentOk(ctx, spec, id, src)) out.push({ object: refOf(obj(ctx, id)) });
    }
  }
  if (spec.what === 'spell') {
    for (const item of ctx.s.stack)
      if (item.kind === 'spell' && spellOk(ctx, spec, item.id, src))
        out.push({ object: refOf(obj(ctx, item.id)) });
  }
  if (spec.what === 'graveyardCard') {
    for (const p of PLAYERS)
      for (const id of ctx.s.players[p].graveyard)
        if (graveyardCardOk(ctx, spec, id, src)) out.push({ object: refOf(obj(ctx, id)) });
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
  const done: TargetChoice[][] = [];
  const same = (a: TargetChoice, b: TargetChoice) =>
    'object' in a && 'object' in b && a.object.id === b.object.id;
  for (const spec of specs) {
    // "Up to": stopping here is allowed too.
    if (spec.optional) done.push(...combos);
    const cands = targetCandidates(ctx, spec, src);
    const next: TargetChoice[][] = [];
    // The same object can't be chosen twice.
    for (const c of combos)
      for (const t of cands) if (!c.some((x) => same(x, t))) next.push([...c, t]);
    combos = next;
    if (combos.length === 0) break;
  }
  return [...done, ...combos];
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
  if (!o) return false;
  if (spec.what === 'spell') return spellOk(ctx, spec, o.id, src);
  return spec.what === 'graveyardCard'
    ? graveyardCardOk(ctx, spec, o.id, src)
    : permanentOk(ctx, spec, o.id, src);
}

/** Marvel Super Heroes: a permanent of theirs says "you have hexproof" (and its condition holds). */
export function youHaveHexproof(ctx: Ctx, p: PlayerId): boolean {
  return ctx.s.battlefield.some((id) => {
    const o = ctx.s.objects[id]!;
    if (o.controller !== p) return false;
    return def(ctx, id).abilities.some(
      (a) =>
        a.kind === 'static' &&
        a.effect.kind === 'youHaveHexproof' &&
        checkCondition(ctx, a.effect.condition, p, o),
    );
  });
}
