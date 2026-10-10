import { isCreature, matchesFilter, power } from './characteristics.ts';
import { type Ctx, def, emit, obj } from './context.ts';
import { checkCondition, forEachBattlefieldTrigger, queue } from './triggers.ts';
import type {
  AbilityDef,
  CardDefinition,
  ConditionDef,
  EffectDef,
  EffectSource,
  GameEvent,
  GameObject,
  GameState,
  ObjectId,
  PlayerId,
} from './types.ts';
import { PLAYERS } from './types.ts';

/**
 * The Lord of the Rings (21a): the Ring tempts you (rule 701.54), the Ring emblem and its four abilities, the Ring-bearer, and
 * the triggers and conditions that look at them; "whenever you scry" with the cards looked at; "whenever you create a token".
 * Engine helpers; the vocabulary is in types.ts (search "Lord of the Rings (21a)") and the card builders in
 * packages/cards/src/ltr-vocab.ts.
 */

/** The card definition the Ring's abilities stack as ("The Ring"): registered with the Lord of the Rings tokens. */
export const THE_RING = 'ltr-the-ring';

// ---------------------------------------------------------------------------
// The Ring emblem: level, Ring-bearer
// ---------------------------------------------------------------------------

/** How many abilities the Ring has: once for each time it tempted `player`, at most four. */
export function ringLevel(ctx: Ctx, player: PlayerId): number {
  return Math.min(4, ctx.s.players[player].ring?.tempted ?? 0);
}

/** Is `o` the Ring-bearer of the player who controls it (still on the battlefield, still the one they chose)? */
function isBearerOfController(ctx: Ctx, o: GameObject): boolean {
  const ring = ctx.s.players[o.controller].ring;
  return (
    !!ring?.bearer &&
    ring.bearer.id === o.id &&
    ring.bearer.zcc === o.zcc &&
    o.zone === 'battlefield'
  );
}

/** `player`'s Ring-bearer, if they have one: the creature they chose, while it stays on the battlefield under their control. */
export function ringBearerOf(ctx: Ctx, player: PlayerId): GameObject | undefined {
  const bearer = ctx.s.players[player].ring?.bearer;
  if (!bearer) return undefined;
  const o = ctx.s.objects[bearer.id];
  return o && o.zcc === bearer.zcc && o.zone === 'battlefield' && o.controller === player
    ? o
    : undefined;
}

/**
 * Where `player`'s Ring stands, from the state alone (for the bots and the board): how many times it tempted them, its level
 * (0 to 4: how many abilities it has) and their Ring-bearer, if they have one.
 */
export function ringStatus(
  s: GameState,
  player: PlayerId,
): { tempted: number; level: number; bearer?: ObjectId } {
  const ring = s.players[player].ring;
  if (!ring) return { tempted: 0, level: 0 };
  const o = ring.bearer ? s.objects[ring.bearer.id] : undefined;
  const live =
    !!o && o.zcc === ring.bearer!.zcc && o.zone === 'battlefield' && o.controller === player;
  return {
    tempted: ring.tempted,
    level: Math.min(4, ring.tempted),
    ...(live ? { bearer: o.id } : {}),
  };
}

/** Is this permanent its controller's Ring-bearer? */
export function isRingBearer(ctx: Ctx, o: GameObject): boolean {
  return !!ctx.s.players[o.controller].ring && ringBearerOf(ctx, o.controller)?.id === o.id;
}

/** The Ring's first ability: "Your Ring-bearer is legendary": `d` with the supertype, for the Ring-bearer (called by `def`). */
export function withRingLegendary(ctx: Ctx, o: GameObject, d: CardDefinition): CardDefinition {
  if (o.zone !== 'battlefield' || !ctx.s.players[o.controller].ring) return d;
  if (d.supertypes.includes('Legendary') || !isBearerOfController(ctx, o)) return d;
  return { ...d, supertypes: [...d.supertypes, 'Legendary'] };
}

/** The Ring's first ability: "... and can't be blocked by creatures with greater power". */
export function ringCantBeBlockedBy(ctx: Ctx, attacker: ObjectId, blocker: ObjectId): boolean {
  const a = ctx.s.objects[attacker];
  if (!a || !ctx.s.players[a.controller].ring || ringLevel(ctx, a.controller) < 1) return false;
  if (ringBearerOf(ctx, a.controller)?.id !== attacker) return false;
  return power(ctx, blocker) > power(ctx, attacker);
}

/**
 * State-based: a Ring-bearer that left the battlefield or is controlled by another player is no longer the Ring-bearer (it
 * doesn't become one again if it comes back, or if control comes back). The emblem stays.
 */
export function updateRingBearer(ctx: Ctx): void {
  for (const p of PLAYERS) {
    const ring = ctx.s.players[p].ring;
    if (!ring?.bearer || ringBearerOf(ctx, p)) continue;
    const { bearer: _gone, ...rest } = ring;
    ctx.s.players[p].ring = rest;
  }
}

// ---------------------------------------------------------------------------
// The Ring tempts you
// ---------------------------------------------------------------------------

const step = (
  s: Extract<EffectDef, { kind: 'ringStep' }>['step'],
  player: PlayerId,
  creature?: ObjectId,
): EffectDef => ({
  kind: 'ringStep',
  step: s,
  player,
  ...(creature !== undefined ? { creature } : {}),
});

/**
 * "The Ring tempts you": the emblem and its next ability, then the Ring-bearer (a prompt, "Choose your Ring-bearer", when there
 * are several creatures; none is chosen with no creature, and the Ring still tempts you), then "it happened".
 */
export function ringTemptSteps(ctx: Ctx, es: EffectSource): EffectDef[] {
  const player = es.controller;
  const creatures = ctx.s.battlefield.filter(
    (id) => obj(ctx, id).controller === player && isCreature(ctx, id),
  );
  if (creatures.length === 0) return [step('level', player), step('tempted', player)];
  if (creatures.length === 1)
    return [step('level', player), step('bearer', player, creatures[0]), step('tempted', player)];
  return [
    step('level', player),
    {
      kind: 'chooseYourPermanent',
      filter: { types: ['Creature'] },
      includeSource: true,
      ringBearer: true,
      then: [step('bearer', player), step('tempted', player)],
      otherwise: [step('tempted', player)],
    },
  ];
}

/** One internal step of the Ring tempting a player. */
export function runRingStep(
  ctx: Ctx,
  es: EffectSource,
  e: Extract<EffectDef, { kind: 'ringStep' }>,
): void {
  const player = e.player ?? es.controller;
  const ps = ctx.s.players[player];
  switch (e.step) {
    case 'level':
      // The Ring emblem, and one more ability (the count goes on; only four abilities exist).
      ps.ring = {
        tempted: (ps.ring?.tempted ?? 0) + 1,
        ...(ps.ring?.bearer ? { bearer: ps.ring.bearer } : {}),
      };
      return;
    case 'bearer': {
      const id = e.creature ?? es.chosen?.id;
      const o = id !== undefined ? ctx.s.objects[id] : undefined;
      if (!o || o.zone !== 'battlefield' || o.controller !== player || !ps.ring) return;
      ps.ring = { tempted: ps.ring.tempted, bearer: { id: o.id, zcc: o.zcc }, chosenNow: true };
      emit(ctx, { type: 'ringBearerChosen', player, id: o.id });
      return;
    }
    case 'tempted': {
      const ring = ps.ring;
      if (!ring) return;
      const bearer = ring.chosenNow && ring.bearer ? ring.bearer.id : undefined;
      ps.ring = { tempted: ring.tempted, ...(ring.bearer ? { bearer: ring.bearer } : {}) };
      emit(ctx, {
        type: 'ringTempted',
        player,
        tempted: ring.tempted,
        ...(bearer !== undefined ? { bearer } : {}),
      });
      return;
    }
    case 'sacrificeAtEndOfCombat':
      // The Ring's third ability: the creature that blocked the Ring-bearer (the subject).
      if (es.subject)
        (ctx.s.delayed ??= []).push({
          controller: es.controller,
          sourceDefId: es.sourceDefId,
          subject: es.subject,
          effects: [{ kind: 'sacrifice', what: 'subject' }],
          fromTurn: ctx.s.turn.number,
          at: 'endCombat',
        });
  }
}

/** Conditions about the Ring and the Ring-bearer. */
export function ringCondition(
  ctx: Ctx,
  c: Extract<
    ConditionDef,
    { kind: 'ringBearerChosenOther' | 'isRingBearer' | 'hasRingBearer' | 'ringTemptedAtLeast' }
  >,
  controller: PlayerId,
  self: GameObject | undefined,
  subject: GameObject | undefined,
): boolean {
  switch (c.kind) {
    case 'ringBearerChosenOther':
      return !!subject && subject.id !== self?.id;
    case 'isRingBearer':
      return !!self && isRingBearer(ctx, self);
    case 'hasRingBearer':
      return !!ringBearerOf(ctx, controller);
    case 'ringTemptedAtLeast':
      return (ctx.s.players[controller].ring?.tempted ?? 0) >= c.min;
  }
}

// ---------------------------------------------------------------------------
// The Ring's abilities (levels 2, 3 and 4 are triggered abilities of the emblem) and the triggers that watch it
// ---------------------------------------------------------------------------

type Triggered = Extract<AbilityDef, { kind: 'triggered' }>;

/** 2: "Whenever your Ring-bearer attacks, draw a card, then discard a card." */
const RING_LOOT: Triggered = {
  kind: 'triggered',
  trigger: { on: 'attacks' },
  targets: [],
  effects: [
    { kind: 'draw', who: 'controller', amount: 1 },
    { kind: 'discard', count: 1 },
  ],
};

/** 3: "Whenever your Ring-bearer becomes blocked by a creature, that creature's controller sacrifices it at end of combat." */
const RING_BLOCKED: Triggered = {
  kind: 'triggered',
  trigger: { on: 'creatureYouControlBecomesBlocked' },
  targets: [],
  effects: [{ kind: 'ringStep', step: 'sacrificeAtEndOfCombat' }],
};

/** 4: "Whenever your Ring-bearer deals combat damage to a player, each opponent loses 3 life." */
const RING_DRAIN: Triggered = {
  kind: 'triggered',
  trigger: { on: 'creatureYouControlDealsCombatDamage', toPlayer: true },
  targets: [],
  effects: [{ kind: 'loseLife', who: 'eachOpponent', amount: 3 }],
};

/** The emblem's ability goes on the stack: the Ring's controller controls it, the Ring-bearer is its source. */
function ringTrigger(ctx: Ctx, bearer: GameObject, ability: Triggered, subject: GameObject): void {
  ctx.s.pendingTriggers.push({
    source: { id: bearer.id, zcc: bearer.zcc },
    sourceDefId: THE_RING,
    abilityIndex: -1,
    controller: bearer.controller,
    emblem: ability,
    subject: { id: subject.id, zcc: subject.zcc },
  });
}

/** Does this event trigger the Ring's abilities, or the cards that watch the Ring, scrying and tokens? */
export function detectLtr(ctx: Ctx, ev: GameEvent): void {
  const s = ctx.s;
  switch (ev.type) {
    case 'attackersDeclared':
      for (const id of ev.attackers) {
        const o = s.objects[id];
        if (o && isRingBearer(ctx, o) && ringLevel(ctx, o.controller) >= 2)
          ringTrigger(ctx, o, RING_LOOT, o);
      }
      return;
    case 'blockersDeclared':
      // Once for each creature that blocks the Ring-bearer.
      for (const b of ev.blocks) {
        const attacker = s.objects[b.attacker];
        const blocker = s.objects[b.blocker];
        if (
          attacker &&
          blocker &&
          isRingBearer(ctx, attacker) &&
          ringLevel(ctx, attacker.controller) >= 3
        )
          ringTrigger(ctx, attacker, RING_BLOCKED, blocker);
      }
      return;
    case 'damageDealt': {
      if (!ev.combat || !('player' in ev.to) || ev.amount <= 0) return;
      const src = s.objects[ev.source];
      if (src && isRingBearer(ctx, src) && ringLevel(ctx, src.controller) >= 4)
        ringTrigger(ctx, src, RING_DRAIN, src);
      return;
    }
    case 'ringBearerChosen': {
      const chosen = s.objects[ev.id];
      forEachBattlefieldTrigger(
        ctx,
        (o, a) => a.trigger.on === 'ringBearerChosen' && o.controller === ev.player,
        chosen,
      );
      return;
    }
    case 'ringTempted': {
      const bearer = ev.bearer !== undefined ? s.objects[ev.bearer] : undefined;
      forEachBattlefieldTrigger(
        ctx,
        (o, a) => a.trigger.on === 'ringTempts' && o.controller === ev.player,
        bearer,
      );
      // Ringwraiths: "When the Ring tempts you, return this card from your graveyard to your hand."
      for (const id of s.players[ev.player].graveyard) {
        const card = s.objects[id]!;
        def(ctx, id).abilities.forEach((a, i) => {
          if (a.kind !== 'triggered' || !a.fromGraveyard || a.trigger.on !== 'ringTempts') return;
          if (checkCondition(ctx, a.condition, ev.player, card, undefined, bearer))
            queue(ctx, card, i, ev.player, bearer);
        });
      }
      return;
    }
    case 'scried':
      // Only a scry (not a surveil), with the number of cards looked at.
      if (!ev.surveil)
        forEachBattlefieldTrigger(
          ctx,
          (o, a) => a.trigger.on === 'youScry' && o.controller === ev.player,
          undefined,
          ev.top + ev.bottom,
        );
      return;
    case 'objectMoved': {
      // A token is created: it comes into being on the battlefield.
      if (ev.from !== null || ev.to !== 'battlefield') return;
      const token = s.objects[ev.id];
      if (!token || !token.isToken || token.zone !== 'battlefield') return;
      forEachBattlefieldTrigger(
        ctx,
        (o, a) =>
          a.trigger.on === 'youCreateToken' &&
          o.controller === token.controller &&
          matchesFilter(ctx, token.id, a.trigger.filter, o.id),
        token,
      );
      return;
    }
    default:
      return;
  }
}
