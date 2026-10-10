import { hasSubtype, matchesFilter, NON_CREATURE_SUBTYPES } from './characteristics.ts';
import {
  type Ctx,
  type CustomEffect,
  def,
  defOf,
  emit,
  newTimestamp,
  obj,
  onBattlefield,
} from './context.ts';
import { manaValue } from './cost.ts';
import { counterSpell, runEffect } from './effects.ts';
import { type Chooser, type ChooserResult, CHOOSERS } from './stx-13c-a-effects.ts';
import { checkCondition } from './triggers.ts';
import type {
  AbilityDef,
  EffectDef,
  EffectSource,
  GameEvent,
  GameObject,
  ObjectId,
  PlayerId,
} from './types.ts';
import { PLAYERS } from './types.ts';

/**
 * The Lord of the Rings (21d, white and blue rares): one-off effects as custom effects, the chooser behind Goldberry's second
 * ability, Gandalf the White's trigger doubling, Forge Anew's instant-speed equip, and the "for as long as you control this"
 * control effects (Rangers of Ithilien, Scroll of Isildur). See "Phase 21d: white and blue rares" in
 * docs/lord-of-the-rings-plan.md.
 */

const custom = (handler: string, params?: Record<string, unknown>): EffectDef => ({
  kind: 'custom',
  handler,
  ...(params ? { params } : {}),
});

/** The permanent a target slot points at, if it is still there (same object, still on the battlefield). */
function targetOnBattlefield(ctx: Ctx, es: EffectSource, i: number): GameObject | undefined {
  const t = es.targets[i];
  if (!t || !('object' in t)) return undefined;
  const o = ctx.s.objects[t.object.id];
  return o && o.zone === 'battlefield' && o.zcc === t.object.zcc ? o : undefined;
}

const selfOnBattlefield = (ctx: Ctx, es: EffectSource): GameObject | undefined =>
  es.source ? onBattlefield(ctx, es.source) : undefined;

// ---------------------------------------------------------------------------
// Frodo, Sauron's Bane
// ---------------------------------------------------------------------------

/** The ability a Rogue Frodo has: "Whenever this creature deals combat damage to a player, that player loses the game if the Ring has tempted you four or more times this game. Otherwise, the Ring tempts you." */
const FRODO_ROGUE_ABILITY: AbilityDef = {
  kind: 'triggered',
  trigger: { on: 'combatDamageToPlayer' },
  targets: [],
  effects: [
    {
      kind: 'if',
      condition: { kind: 'ringTemptedAtLeast', min: 4 },
      then: [custom('ltrOpponentLoses')],
      else: [{ kind: 'ringTempts' }],
    },
  ],
};

/** Replaces the creature types of a permanent for good (the other subtypes stay). */
function setCreatureTypes(ctx: Ctx, o: GameObject, types: string[]): void {
  o.addedSubtypes = (o.addedSubtypes ?? []).filter((t) => NON_CREATURE_SUBTYPES.has(t));
  o.creatureTypes = [...types];
  o.creatureTypesTimestamp = newTimestamp(ctx);
}

// ---------------------------------------------------------------------------
// Counters (Goldberry)
// ---------------------------------------------------------------------------

/** The counters on a permanent, by kind ('+1/+1' and every named kind with at least one). */
function counterTable(o: GameObject): Record<string, number> {
  const out: Record<string, number> = {};
  if (o.plusOneCounters > 0) out['+1/+1'] = o.plusOneCounters;
  for (const [k, n] of Object.entries(o.counters ?? {})) if (n > 0) out[k] = n;
  return out;
}

/**
 * Moves one counter of this kind from one permanent to another. Moving a counter is not putting a new one on, so "twice as many
 * counters" and "an additional counter" replacements don't apply; the counter does arrive, so the "counters were put on" events
 * fire.
 */
function moveOneCounter(ctx: Ctx, ctxFrom: GameObject, to: GameObject, kind: string): void {
  if (kind === '+1/+1') {
    if (ctxFrom.plusOneCounters <= 0) return;
    ctxFrom.plusOneCounters--;
    to.plusOneCounters++;
    emit(ctx, { type: 'countersAdded', id: to.id, count: 1, player: to.controller });
  } else {
    if (!ctxFrom.counters?.[kind]) return;
    ctxFrom.counters[kind]!--;
    (to.counters ??= {})[kind] = (to.counters[kind] ?? 0) + 1;
    if (kind === 'loyalty')
      emit(ctx, {
        type: 'loyaltyCountersAdded',
        id: to.id,
        count: 1,
        player: to.controller,
        by: ctx.puttingPlayer ?? to.controller,
      });
  }
  if (def(ctx, to.id).types.includes('Creature'))
    emit(ctx, {
      type: 'anyCountersAdded',
      id: to.id,
      count: 1,
      player: to.controller,
      by: ctx.puttingPlayer ?? to.controller,
    });
}

// ---------------------------------------------------------------------------
// Custom effects
// ---------------------------------------------------------------------------

export const LTR_WU_RARE_EFFECTS: Record<string, CustomEffect> = {
  /**
   * Frodo, Sauron's Bane: "If Frodo is a Citizen, it becomes a Halfling Scout with base power and toughness 2/3 and lifelink."
   * (For good; it stops when he leaves the battlefield.)
   */
  ltrFrodoScout(ctx, es) {
    const self = selfOnBattlefield(ctx, es);
    if (!self || !hasSubtype(ctx, self.id, 'Citizen')) return;
    setCreatureTypes(ctx, self, ['Halfling', 'Scout']);
    ctx.s.effects.push({
      timestamp: newTimestamp(ctx),
      affected: { id: self.id, zcc: self.zcc },
      power: 0,
      toughness: 0,
      keywords: ['lifelink'],
      basePT: [2, 3],
      expires: 'permanent',
    });
  },

  /**
   * Frodo, Sauron's Bane: "If Frodo is a Scout, it becomes a Halfling Rogue with 'Whenever this creature deals combat damage to
   * a player, that player loses the game if the Ring has tempted you four or more times this game. Otherwise, the Ring tempts
   * you.'" (Its base power and toughness and lifelink from the first ability stay.)
   */
  ltrFrodoRogue(ctx, es) {
    const self = selfOnBattlefield(ctx, es);
    if (!self || !hasSubtype(ctx, self.id, 'Scout')) return;
    setCreatureTypes(ctx, self, ['Halfling', 'Rogue']);
    self.perpetualAbilities = [...(self.perpetualAbilities ?? []), FRODO_ROGUE_ABILITY];
  },

  /** "That player loses the game" (the player dealt combat damage: the opponent). A player who can't lose this turn doesn't. */
  ltrOpponentLoses(ctx, es) {
    const opponent: PlayerId = es.controller === 'p1' ? 'p2' : 'p1';
    if (ctx.s.turn.cantLose?.includes(opponent)) return;
    ctx.s.players[opponent].lost = true;
  },

  /**
   * Goldberry, River-Daughter: "Move a counter of each kind not on Goldberry from another target permanent you control onto
   * Goldberry."
   */
  ltrGoldberryGather(ctx, es) {
    const self = selfOnBattlefield(ctx, es);
    const from = targetOnBattlefield(ctx, es, 0);
    if (!self || !from || from.id === self.id || from.controller !== es.controller) return;
    const have = counterTable(self);
    for (const kind of Object.keys(counterTable(from)))
      if (!have[kind]) moveOneCounter(ctx, from, self, kind);
  },

  /**
   * Goldberry, River-Daughter's second ability, one counter at a time: moves one counter of this kind from Goldberry onto the
   * target; with none left, "if you do, draw a card" happens now.
   */
  ltrGoldberryMove(ctx, es, params) {
    const self = selfOnBattlefield(ctx, es);
    const to = targetOnBattlefield(ctx, es, 0);
    if (!self || !to || to.id === self.id || to.controller !== es.controller) return;
    moveOneCounter(ctx, self, to, (params as { kind: string }).kind);
    if (Object.keys(counterTable(self)).length === 0)
      runEffect(ctx, es, { kind: 'draw', who: 'controller', amount: 1 });
  },

  /**
   * Press the Enemy: "Return target spell or nonland permanent an opponent controls to its owner's hand." The mana value it had
   * (a spell on the stack has its X) is remembered for "equal or lesser mana value".
   */
  ltrPressBounce(ctx, es) {
    const t = es.targets[0];
    ctx.s.turn.ltrPressMv = -1;
    if (!t || !('object' in t)) return;
    const o = ctx.s.objects[t.object.id];
    if (!o) return;
    const item = ctx.s.stack.find((x) => x.kind === 'spell' && x.id === o.id);
    const cost = def(ctx, o.id).manaCost;
    const x = item && item.kind === 'spell' ? (item.x ?? 0) : 0;
    const before = o.zone;
    runEffect(ctx, es, { kind: 'returnSpellToHand', what: { target: 0 }, orPermanent: true });
    if (before !== 'hand' && ctx.s.objects[o.id]?.zone === 'hand')
      ctx.s.turn.ltrPressMv = manaValue(cost) + x * (cost.x ?? 0);
  },

  /** Boromir, Warden of the Tower: "counter that spell" (the spell that triggered it). */
  ltrCounterSubject(ctx, es) {
    if (es.subject) counterSpell(ctx, es.subject.id);
  },

  /** Borne Upon a Wind: "You may cast spells this turn as though they had flash." */
  ltrFlashAll(ctx, es) {
    ctx.s.turn.ltrFlashAll = [...(ctx.s.turn.ltrFlashAll ?? []), es.controller];
  },

  /**
   * Rangers of Ithilien, Scroll of Isildur: "Gain control of up to one target <thing> for as long as you control this <source>."
   * (Nothing happens if the source is already gone or someone else controls it.) The effect also ends if another player gains
   * control of the source (see `endLapsedControlEffects`).
   */
  ltrGainControlWhileControlled(ctx, es) {
    const src = selfOnBattlefield(ctx, es);
    if (!src || src.controller !== es.controller) return;
    es.targets.forEach((_t, i) => {
      const o = targetOnBattlefield(ctx, es, i);
      if (!o || o.controller === es.controller) return;
      ctx.s.effects.push({
        timestamp: newTimestamp(ctx),
        affected: { id: o.id, zcc: o.zcc },
        power: 0,
        toughness: 0,
        keywords: [],
        previousController: o.controller,
        expires: 'whileSource',
        whileSourceId: src.id,
        whileControlledBy: es.controller,
      });
      o.controller = es.controller;
      o.summoningSick = true;
    });
  },
};

// ---------------------------------------------------------------------------
// Choosers
// ---------------------------------------------------------------------------

const LTR_WU_RARE_CHOOSERS: Record<string, Chooser> = {
  /**
   * Goldberry, River-Daughter: "Move one or more counters from Goldberry onto another target permanent you control. If you do,
   * draw a card." One counter at a time: the first prompt offers each kind on Goldberry, later ones also "Done" (and the draw).
   */
  ltrGoldberryPick: (ctx, es, params): ChooserResult | null => {
    const self = selfOnBattlefield(ctx, es);
    const to = targetOnBattlefield(ctx, es, 0);
    if (!self || !to || to.id === self.id || to.controller !== es.controller) return null;
    const moved = !!(params as { moved?: boolean } | undefined)?.moved;
    const table = counterTable(self);
    const options: ChooserResult['options'] = Object.entries(table).map(([kind, n]) => ({
      label: `Move a ${kind} counter (${n} on Goldberry)`,
      effects: [
        custom('ltrGoldberryMove', { kind }),
        { kind: 'chooseCustom', handler: 'ltrGoldberryPick', params: { moved: true } },
      ],
    }));
    if (options.length === 0) return null;
    if (moved)
      options.push({
        label: 'Done: draw a card',
        effects: [{ kind: 'draw', who: 'controller', amount: 1 }],
      });
    return { title: `Goldberry: move counters onto ${def(ctx, to.id).name}`, options };
  },
};
Object.assign(CHOOSERS, LTR_WU_RARE_CHOOSERS);

// ---------------------------------------------------------------------------
// State-based: "for as long as you control this"
// ---------------------------------------------------------------------------

/**
 * Control effects that last "for as long as you control <source>" (Rangers of Ithilien, Scroll of Isildur) end when another
 * player gains control of the source; control goes back to the previous controller. (Leaving the battlefield is handled where
 * `whileSource` effects end.) Called with the state-based actions.
 */
export function endLapsedControlEffects(ctx: Ctx): void {
  if (!ctx.s.effects.some((e) => e.whileControlledBy !== undefined)) return;
  const lapsed = ctx.s.effects.filter((e) => {
    if (e.whileControlledBy === undefined || e.whileSourceId === undefined) return false;
    const src = ctx.s.objects[e.whileSourceId];
    return !!src && src.zone === 'battlefield' && src.controller !== e.whileControlledBy;
  });
  if (lapsed.length === 0) return;
  ctx.s.effects = ctx.s.effects.filter((e) => !lapsed.includes(e));
  for (const e of lapsed) {
    const o = ctx.s.objects[e.affected.id];
    if (o && o.zone === 'battlefield' && o.zcc === e.affected.zcc && e.previousController)
      o.controller = e.previousController;
  }
}

// ---------------------------------------------------------------------------
// Forge Anew: equip at instant speed
// ---------------------------------------------------------------------------

/**
 * Forge Anew: "During your turn, you may activate equip abilities any time you could cast an instant." Is this an equip ability
 * (an Equipment's only effect is attaching it) that `player` may activate at instant speed?
 */
export function equipAtInstantSpeed(
  ctx: Ctx,
  player: PlayerId,
  source: ObjectId,
  a: { effects: EffectDef[]; cost: { mana?: unknown } },
): boolean {
  if (
    !a.cost.mana ||
    !def(ctx, source).subtypes.includes('Equipment') ||
    a.effects.length !== 1 ||
    a.effects[0]!.kind !== 'attach'
  )
    return false;
  return ctx.s.battlefield.some((id) => {
    const o = obj(ctx, id);
    return (
      o.controller === player &&
      def(ctx, id).abilities.some(
        (s) =>
          s.kind === 'static' &&
          s.effect.kind === 'ltrEquipAtInstantSpeed' &&
          checkCondition(ctx, s.effect.condition, player, o),
      )
    );
  });
}

// ---------------------------------------------------------------------------
// Gandalf the White: legendary permanents and artifacts entering or leaving trigger things an additional time
// ---------------------------------------------------------------------------

const GANDALF_FILTER = { anyOf: [{ supertypes: ['Legendary' as const] }, { types: ['Artifact' as const] }] };

/** How many permanents `player` controls with "legendary permanents and artifacts entering or leaving trigger an additional time". */
function gandalfCount(ctx: Ctx, player: PlayerId): number {
  return ctx.s.battlefield.filter(
    (id) =>
      obj(ctx, id).controller === player &&
      def(ctx, id).abilities.some(
        (a) => a.kind === 'static' && a.effect.kind === 'ltrLegendaryArtifactTriggersTwice',
      ),
  ).length;
}

/**
 * Called after the triggers one event caused were queued (`before` is how many were pending before it): when a legendary
 * permanent or an artifact entered or left the battlefield, each triggered ability of a permanent of a Gandalf's controller that
 * it caused triggers an additional time for each Gandalf (an effect that already doubled it, Panharmonicon's, adds one more: the
 * extra times add up, they don't multiply).
 */
export function doubleLegendaryArtifactTriggers(
  ctx: Ctx,
  ev: GameEvent,
  before: number,
  batchStart: number,
): void {
  if (ev.type !== 'objectMoved' || ctx.s.pendingTriggers.length <= before) return;
  const entering = ev.to === 'battlefield';
  const leaving = ev.from === 'battlefield';
  if (!entering && !leaving) return;
  const mover = ctx.s.objects[ev.id];
  const d = defOf(ctx, ev.defId);
  const qualifies = entering
    ? !!mover && mover.zone === 'battlefield' && matchesFilter(ctx, ev.id, GANDALF_FILTER)
    : d.supertypes.includes('Legendary') ||
      d.types.includes('Artifact') ||
      PLAYERS.some((p) => {
        const bearer = ctx.s.players[p].ring?.bearer;
        return !!bearer && bearer.id === ev.id; // a Ring-bearer is legendary
      });
  if (!qualifies) return;
  for (const player of PLAYERS) {
    // A Gandalf that left the battlefield at the same time (the events of this batch) still counts: leaves-the-battlefield
    // abilities look back at what the permanents had just before.
    const leavingGandalfs = leaving
      ? ctx.events
          .slice(batchStart)
          .filter(
            (e) =>
              e.type === 'objectMoved' &&
              e.from === 'battlefield' &&
              e.controller === player &&
              defOf(ctx, e.defId).abilities.some(
                (a) => a.kind === 'static' && a.effect.kind === 'ltrLegendaryArtifactTriggersTwice',
              ),
          ).length
      : 0;
    const n = gandalfCount(ctx, player) + leavingGandalfs;
    if (n === 0) continue;
    const seen = new Set<string>();
    for (const t of ctx.s.pendingTriggers.slice(before)) {
      // A triggered ability of a permanent: one of its abilities, or a keyword's trigger (persist, evoke) queued inline.
      if (t.controller !== player || t.emblem || (t.abilityIndex < 0 && !t.inline)) continue;
      const src = ctx.s.objects[t.source.id];
      if (!((src && src.zone === 'battlefield') || t.source.id === ev.id)) continue; // a permanent's ability
      const key =
        t.abilityIndex < 0
          ? `inline:${seen.size}`
          : `${t.source.id}:${t.source.zcc}:${t.abilityIndex}:${t.subject?.id ?? ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      for (let k = 0; k < n; k++) ctx.s.pendingTriggers.push({ ...t });
    }
  }
}
