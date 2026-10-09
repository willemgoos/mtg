import { planeswalkersHexproof } from './brawl-15a-w-effects.ts';
import { ignoresHexproofAndWard } from './brawl-15b-b-effects.ts';
import { landsHaveHexproof } from './fra-green-effects.ts';
import { protectedFrom } from './brawl-15b-w-effects.ts';
import { cardMatches, hasKeyword, isCreature, matchesFilter } from './characteristics.ts';
import { type Ctx, def, defOf, deref, obj, other, refOf } from './context.ts';
import { manaValue } from './cost.ts';
import { fromCreatureSource } from './msh-analyzed.ts';
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
  // Mystical Archive (16): Teferi's Protection, "protection from everything".
  if (p !== src.controller && ctx.s.players[p].lifeFrozen) return false;
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
  // Strixhaven Brawl (15b, w): Alseid of Life's Bounty, protection from a colour.
  if (src.sourceId && protectedFrom(ctx, id, src.sourceId)) return false;
  if (o.controller !== src.controller) {
    // Strixhaven Brawl (15b, b): Nowhere to Run: hexproof is ignored for its controller's opponents' creatures.
    const ignoreHexproof = isCreature(ctx, id) && ignoresHexproofAndWard(ctx, o.controller);
    if (hasKeyword(ctx, id, 'hexproof') && !ignoreHexproof) return false;
    // Strixhaven Brawl (15a): Deification.
    if (def(ctx, id).types.includes('Planeswalker') && planeswalkersHexproof(ctx, o.controller))
      return false;
    // Reality Fracture (17a): Marwyn, the Preserver.
    if (def(ctx, id).types.includes('Land') && landsHaveHexproof(ctx, o.controller)) return false;
    if (
      !ignoreHexproof &&
      hasKeyword(ctx, id, 'hexproofFromInstants') &&
      src.sourceId &&
      def(ctx, src.sourceId).types.includes('Instant')
    )
      return false;
    if (
      hasKeyword(ctx, id, 'hexproofFromWhite') &&
      src.sourceId &&
      def(ctx, src.sourceId).colors.includes('W')
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
  // Strixhaven Brawl (15b, u): Wash Away, "that wasn't cast from its owner's hand".
  if (
    spec.filter?.notCastFromHand &&
    ctx.s.stack.some((x) => x.kind === 'spell' && x.id === id && x.fromHand)
  )
    return false;
  return !spec.filter || cardMatches(ctx, id, spec.filter, src.sourceId);
}

/** Final Fantasy (11c): an activated or triggered ability on the stack (not this one's own). */
function abilityOk(ctx: Ctx, spec: TargetSpec, id: ObjectId, src: TargetingSource): boolean {
  const item = ctx.s.stack.find((x) => x.kind === 'ability' && x.id === id);
  if (!item || item.kind !== 'ability') return false;
  if (spec.controller === 'you' && item.controller !== src.controller) return false;
  if (spec.controller === 'opponent' && item.controller === src.controller) return false;
  // Marvel Super Heroes Jumpstart (Analyzed): "from a creature source" (Echo, which may copy its own).
  if (spec.creatureSource) return fromCreatureSource(ctx, item);
  // An ability of the targeting source (Gogo copying its own ability).
  if (src.sourceId && item.source.id === src.sourceId && !item.inline && !item.emblem) {
    const a = defOf(ctx, item.sourceDefId).abilities[item.abilityIndex];
    if (a?.kind === 'activated' && a.targets.some((t) => t.abilitiesOnly)) return false;
  }
  return true;
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
  // Reality Fracture (17c): "target spell or creature".
  if (spec.what === 'spell' && spec.orCreature)
    for (const id of ctx.s.battlefield)
      if (permanentOk(ctx, { ...spec, what: 'creature' }, id, src))
        out.push({ object: refOf(obj(ctx, id)) });
  if (spec.what === 'spell') {
    for (const item of ctx.s.stack)
      if (item.kind === 'spell' && !spec.abilitiesOnly && spellOk(ctx, spec, item.id, src))
        out.push({ object: refOf(obj(ctx, item.id)) });
    // Final Fantasy (11c): activated and triggered abilities on the stack.
    if (spec.abilities || spec.abilitiesOnly)
      for (const item of ctx.s.stack)
        if (item.kind === 'ability' && abilityOk(ctx, spec, item.id, src))
          out.push({ object: { id: item.id, zcc: 0 } });
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
  // Strixhaven (13c): Explosive Welcome ("any other target") also covers players.
  const same = (a: TargetChoice, b: TargetChoice) =>
    ('object' in a && 'object' in b && a.object.id === b.object.id) ||
    ('player' in a && 'player' in b && a.player === b.player);
  for (const spec of specs) {
    // "Up to": stopping here is allowed too.
    // Marvel Super Heroes Jumpstart (Blink): "any number" is picked one at a time; here, none or one.
    if (spec.optional || spec.anyNumber) done.push(...combos);
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

/**
 * Lorwyn Eclipsed (18b, white): the target specs a spell is cast with. A trailing "any number of target ..." spec
 * (Morningtide's Light) is picked one at a time afterwards (the `spellTargets` decision), not listed here.
 */
export const castTargetSpecs = (specs: TargetSpec[]): TargetSpec[] =>
  specs[specs.length - 1]?.anyNumber ? specs.slice(0, -1) : specs;

/**
 * Reality Fracture (17a): Uldaros Theorix, "one target card of each card type". Can each of these cards
 * stand for a different one of its own card types (a card with two types takes either)?
 */
export function standForDistinctTypes(ctx: Ctx, ids: readonly ObjectId[]): boolean {
  const taken = new Map<string, number>();
  const place = (i: number, seen: Set<string>): boolean => {
    for (const t of def(ctx, ids[i]!).types) {
      if (t === 'Land' || seen.has(t)) continue;
      seen.add(t);
      const holder = taken.get(t);
      if (holder === undefined || place(holder, seen)) {
        taken.set(t, i);
        return true;
      }
    }
    return false;
  };
  return ids.every((_, i) => place(i, new Set()));
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
  // Final Fantasy (11c): an ability on the stack (it has no object).
  if (
    spec.what === 'spell' &&
    (spec.abilities || spec.abilitiesOnly) &&
    !ctx.s.objects[t.object.id]
  )
    return abilityOk(ctx, spec, t.object.id, src);
  const o = deref(ctx, t.object);
  if (!o) return false;
  if (spec.what === 'spell' && spec.orCreature && o.zone === 'battlefield')
    return permanentOk(ctx, { ...spec, what: 'creature' }, o.id, src);
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
