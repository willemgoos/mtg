import { cardMatches, isCreature } from './characteristics.ts';
import { type Ctx, type CustomEffect, def, defOf, moveObject, obj } from './context.ts';
import { defsWithStatic } from './ecl-multi-b-effects.ts';
import { celebrating } from './woe-23a.ts';
import { forEachBattlefieldTrigger } from './triggers.ts';
import type {
  AbilityDef,
  CardDb,
  CardDefId,
  CardDefinition,
  CardFilter,
  GameEvent,
  GameObject,
  ObjectId,
} from './types.ts';

/**
 * Wilds of Eldraine (23b, red): the pieces the red cards need that the 23a vocabulary doesn't have. The rules text is in
 * packages/cards/src/woe/red.ts; the types are in types.ts (search "Wilds of Eldraine (23b red)").
 *
 * - Food Fight: "Artifacts you control have '<ability>'" (`artifactsYouControlHave`, read in `def`).
 * - Goddric, Cloaked Reveler: types and abilities while celebrating (`becomesWhileCelebrating`, read in `def`).
 * - Kellan, the Fae-Blooded: the Auras and Equipment attached to the source (`count: 'attachedToSource'`).
 * - Skewer Slinger: "whenever this creature blocks or becomes blocked by a creature" (`blocksOrBecomesBlocked`).
 * - Imodane, the Pyrohammer: a spell that targets only one creature deals damage to it (`yourSpellDamagesItsSingleTarget`; a
 *   resolving spell remembers its targets in `woeSpellTargets`, `dealDamage` calls `noteSpellDamage`).
 * - Korvold and the Noble Thief: chapter III (the `woeKorvoldExile` custom effect).
 * - Gnawing Crescendo needs no code here: its emblem's `otherCreatureDies` trigger now honours `controller` and `nontoken`
 *   (triggers.ts); celebration keywords: `onlyInCelebration` in cards/src/build.ts (Goddric's "flying" is not printed).
 */

// ---------------------------------------------------------------------------
// Kellan: the permanents attached to the source
// ---------------------------------------------------------------------------

/** The permanents (anyone's) attached to `sourceId` that match the filter. */
export function attachedToSourceCount(
  ctx: Ctx,
  filter: CardFilter,
  sourceId: ObjectId | undefined,
): number {
  if (!sourceId) return 0;
  return ctx.s.battlefield.filter(
    (id) => obj(ctx, id).attachedTo === sourceId && cardMatches(ctx, id, filter),
  ).length;
}

// ---------------------------------------------------------------------------
// Food Fight, Goddric: what a permanent has because of a static ability
// ---------------------------------------------------------------------------

const becomersCache = new WeakMap<CardDb, ReadonlySet<CardDefId>>();

/** The cards of this database that become something while celebrating (cached for the database). */
function becomersOf(db: CardDb): ReadonlySet<CardDefId> {
  let set = becomersCache.get(db);
  if (!set) becomersCache.set(db, (set = defsWithStatic(db, 'becomesWhileCelebrating')));
  return set;
}

/** Does `def` have anything to change for this permanent's definition `d`? (A cheap test: `def` is on the hottest path.) */
export function woeRedApplies(ctx: Ctx, d: CardDefinition): boolean {
  return (
    (ctx.s.woeArtifactGrants === true && d.types.includes('Artifact')) ||
    becomersOf(ctx.db).has(d.id)
  );
}

/** Marks the state when a permanent that gives abilities to artifacts is on the battlefield (a position built directly, too). */
export function refreshWoeArtifactGrants(ctx: Ctx): void {
  const givers = defsWithStatic(ctx.db, 'artifactsYouControlHave');
  if (givers.size > 0 && ctx.s.battlefield.some((id) => givers.has(obj(ctx, id).defId)))
    ctx.s.woeArtifactGrants = true;
}

/**
 * `d`, a permanent's definition, with the abilities other permanents give it (Food Fight's "Artifacts you control have ...") and
 * the types and abilities its own celebration gives it (Goddric). Printed definitions are read from the sources, so granting
 * never recurses. Call it only when `woeRedApplies`.
 */
export function woeRedDef(ctx: Ctx, o: GameObject, d: CardDefinition): CardDefinition {
  let out = d;
  if (ctx.s.woeArtifactGrants && d.types.includes('Artifact')) {
    const givers = defsWithStatic(ctx.db, 'artifactsYouControlHave');
    const granted: AbilityDef[] = [];
    for (const srcId of ctx.s.battlefield) {
      const src = obj(ctx, srcId);
      if (src.controller !== o.controller || !givers.has(src.defId)) continue;
      for (const a of defOf(ctx, src.defId).abilities)
        if (a.kind === 'static' && a.effect.kind === 'artifactsYouControlHave')
          granted.push(a.effect.ability);
    }
    if (granted.length) out = { ...out, abilities: [...out.abilities, ...granted] };
  }
  if (becomersOf(ctx.db).has(d.id) && celebrating(ctx, o.controller)) {
    for (const a of d.abilities) {
      if (a.kind !== 'static' || a.effect.kind !== 'becomesWhileCelebrating') continue;
      out = {
        ...out,
        subtypes: a.effect.subtypes,
        abilities: [...out.abilities, ...a.effect.abilities],
      };
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Triggers: blocking, and a spell damaging its single target
// ---------------------------------------------------------------------------

/**
 * Imodane, the Pyrohammer: "Whenever an instant or sorcery spell you control that targets only a single creature deals damage to
 * that creature". Called as damage is dealt (`dealDamage`), while the spell is still on the stack; `amount` is the damage dealt.
 */
export function noteSpellDamage(ctx: Ctx, sourceId: ObjectId, hit: ObjectId, amount: number): void {
  const spell = ctx.s.objects[sourceId];
  if (!spell || spell.zone !== 'stack' || !spell.woeSpellTargets?.length) return;
  const types = def(ctx, spell.id).types;
  if (!types.includes('Instant') && !types.includes('Sorcery')) return;
  if (!spell.woeSpellTargets.every((t) => 'object' in t && t.object.id === hit)) return;
  if (!isCreature(ctx, hit)) return;
  forEachBattlefieldTrigger(
    ctx,
    (o, a) =>
      a.trigger.on === 'yourSpellDamagesItsSingleTarget' && o.controller === spell.controller,
    undefined,
    amount,
  );
}

/** The events Food Fight (it came into play) and Skewer Slinger (blockers declared) look at. */
export function detectWoeRed(ctx: Ctx, ev: GameEvent): void {
  const s = ctx.s;
  switch (ev.type) {
    case 'objectMoved': {
      // Food Fight (or a token copy of it) came onto the battlefield: `def` has abilities to hand out from now on.
      if (
        ev.to === 'battlefield' &&
        defsWithStatic(ctx.db, 'artifactsYouControlHave').has(ev.defId)
      )
        s.woeArtifactGrants = true;
      return;
    }
    case 'blockersDeclared': {
      // "Whenever this creature blocks or becomes blocked by a creature": once for each creature on the other side.
      for (const b of ev.blocks) {
        const blocker = s.objects[b.blocker];
        const attacker = s.objects[b.attacker];
        if (!blocker || !attacker) continue;
        for (const [mine, other] of [
          [blocker, attacker],
          [attacker, blocker],
        ] as const)
          forEachBattlefieldTrigger(
            ctx,
            (o, a) => a.trigger.on === 'blocksOrBecomesBlocked' && o.id === mine.id,
            other,
          );
      }
      return;
    }
    default:
      return;
  }
}

// ---------------------------------------------------------------------------
// Custom effects
// ---------------------------------------------------------------------------

export const WOE_RED_EFFECTS: Record<string, CustomEffect> = {
  /**
   * Korvold and the Noble Thief, chapter III: "Exile the top three cards of target opponent's library. You may play those cards
   * this turn." The cards are the opponent's, so they are playable by the saga's controller only (`castableBy`), lands included.
   */
  woeKorvoldExile(ctx, es) {
    const t = es.targets[0];
    if (!t || !('player' in t)) return;
    for (const id of [...ctx.s.players[t.player].library.slice(0, 3)]) {
      moveObject(ctx, id, 'exile');
      const o = obj(ctx, id);
      if (o.zone !== 'exile') continue;
      if (o.owner === es.controller) o.playableUntilTurn = ctx.s.turn.number;
      else {
        o.castableBy = es.controller;
        o.castableUntilTurn = ctx.s.turn.number;
      }
    }
  },
};
