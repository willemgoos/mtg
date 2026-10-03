import { commanderToOffer } from './brawl.ts';
import { hasKeyword } from './characteristics.ts';
import {
  affordableAttackers,
  anyFirstStrike,
  attackTax,
  canBlock,
  dealCombatDamage,
  defenderOf,
  mustAttack,
  possibleAttackers,
  possibleBlockers,
} from './combat.ts';
import { type Ctx, def, drawCard, emit, obj, other, tap, untap } from './context.ts';
import { payMana, planPayment } from './mana.ts';
import { endCopy } from './effects.ts';
import { phaseIn } from './phasing.ts';
import { addLoreForTurn } from './sagas.ts';
import { tickSuspend } from './suspend.ts';
import { checkGameOver, runSBAs } from './sba.ts';
import { pushTrigger, resolveTop } from './stack.ts';
import { targetCombos } from './targets.ts';
import { collectTriggers, nextPendingTriggerIndex, triggeredAbility } from './triggers.ts';
import type { ContinuousEffect, ObjectId, PlayerId, Step } from './types.ts';

export const HAND_SIZE = 7;

/**
 * Called whenever a player would receive priority: state-based actions, then
 * triggered abilities go on the stack (possibly asking for targets), then the
 * player gets priority (rule 117.5).
 */
export function givePriority(ctx: Ctx, player: PlayerId): void {
  const s = ctx.s;
  for (;;) {
    collectTriggers(ctx);
    runSBAs(ctx);
    collectTriggers(ctx);
    if (checkGameOver(ctx)) return;
    // Brawl: a commander that left for another zone may go to the command zone.
    const offer = commanderToOffer(ctx);
    if (offer) {
      s.decision = { kind: 'commandZone', ...offer, thenPriority: player };
      return;
    }

    const i = nextPendingTriggerIndex(ctx);
    if (i < 0) break;
    const t = s.pendingTriggers.splice(i, 1)[0]!;
    const a = triggeredAbility(ctx, t);
    if (a.modes) {
      s.decision = {
        kind: 'chooseTriggerTargets',
        player: t.controller,
        trigger: t,
        thenPriority: player,
      };
      return;
    }
    if (a.targets.length > 0) {
      const combos = targetCombos(ctx, a.targets, {
        controller: t.controller,
        sourceId: t.source.id,
      });
      if (combos.length === 0) continue; // no legal targets: removed from the stack
      s.decision = {
        kind: 'chooseTriggerTargets',
        player: t.controller,
        trigger: t,
        thenPriority: player,
      };
      return;
    }
    pushTrigger(ctx, t, []);
  }
  s.decision = { kind: 'priority', player };
}

export function passPriority(ctx: Ctx, player: PlayerId): void {
  const s = ctx.s;
  s.turn.passed.push(player);
  if (s.turn.passed.length < 2) {
    givePriority(ctx, other(player));
    return;
  }
  s.turn.passed = [];
  if (s.stack.length > 0) {
    if (resolveTop(ctx)) return; // paused to ask a question; answering continues it
    givePriority(ctx, s.turn.activePlayer);
  } else {
    advanceStep(ctx);
  }
}

function nextStep(ctx: Ctx, step: Step): Step | 'nextTurn' {
  switch (step) {
    case 'untap':
      return 'upkeep';
    case 'upkeep':
      return 'draw';
    case 'draw':
      return 'main1';
    case 'main1':
      return 'beginCombat';
    case 'beginCombat':
      return 'declareAttackers';
    case 'declareAttackers':
      // Rule 508.8: no attackers → skip blockers and damage.
      return ctx.s.combat?.attackers.length ? 'declareBlockers' : 'endCombat';
    case 'declareBlockers':
      return anyFirstStrike(ctx) ? 'firstStrikeDamage' : 'combatDamage';
    case 'firstStrikeDamage':
      return 'combatDamage';
    case 'combatDamage':
      return 'endCombat';
    case 'endCombat':
      if (ctx.s.turn.extraCombats > 0) {
        ctx.s.turn.extraCombats--;
        return 'beginCombat';
      }
      return 'main2';
    case 'main2':
      return 'end';
    case 'end':
      return 'cleanup';
    case 'cleanup':
      return 'nextTurn';
  }
}

export function advanceStep(ctx: Ctx): void {
  const next = nextStep(ctx, ctx.s.turn.step);
  if (ctx.s.turn.step === 'endCombat') ctx.s.combat = null;
  if (next !== 'nextTurn') return enterStep(ctx, next);
  // Marvel Super Heroes: extra turns come first, the last one added first (never mutated in place).
  const [extra, ...rest] = ctx.s.extraTurns ?? [];
  if (!extra) return startTurn(ctx, other(ctx.s.turn.activePlayer));
  ctx.s.extraTurns = rest;
  startTurn(ctx, extra.player, extra.noPowerUp);
}

export function startTurn(ctx: Ctx, player: PlayerId, noPowerUp = false): void {
  const s = ctx.s;
  // Kang the Conqueror: "During that turn, power-up abilities can't be activated."
  if (noPowerUp) s.turn.noPowerUp = true;
  else delete s.turn.noPowerUp;
  // Absorbing Man, Taskmaster: their copies last until their controller's next turn.
  for (const id of s.battlefield)
    if (s.objects[id]!.copyUntilTurnOf === player) endCopy(ctx, s.objects[id]!);
  delete s.turn.toughnessDamage;
  // Avenge: whether the player whose turn just ended attacked during it.
  if (s.turn.number > 0) {
    const prev = s.players[s.turn.activePlayer];
    prev.attackedLastTurn = prev.attackedThisTurn;
  }
  s.turn.number++;
  s.turn.activePlayer = player;
  const p = s.players[player];
  p.landsPlayedThisTurn = 0;
  s.turn.extraCombats = 0;
  s.turn.attackers = [];
  s.turn.lifeGains = { p1: 0, p2: 0 };
  s.turn.lifeGained = { p1: 0, p2: 0 }; // Strixhaven (13c)
  s.turn.creaturesDied = 0;
  s.turn.cardsDrawn = { p1: 0, p2: 0 };
  s.turn.manaSpent = { p1: 0, p2: 0 };
  s.turn.lifeLost = { p1: 0, p2: 0 };
  s.turn.spellsCast = { p1: 0, p2: 0 };
  s.turn.creaturesExiled = { p1: 0, p2: 0 };
  s.turn.leftGraveyard = { p1: 0, p2: 0 };
  s.turn.creaturesLost = { p1: 0, p2: 0 };
  s.turn.foodsSacrificed = { p1: 0, p2: 0 };
  delete s.turn.hexproofPlayers;
  delete s.turn.osteomancer;
  delete s.turn.spellLock;
  delete s.turn.discards;
  delete s.turn.flashTypes;
  delete s.turn.instantsSorceriesCast;
  delete s.turn.castDefs;
  // Final Fantasy (11a): saga creatures (Summon: Alexander).
  delete s.turn.creaturesShielded;
  for (const q of Object.values(s.players)) q.attackedThisTurn = false;
  endEffects(ctx, (e) => e.expires === 'untilYourNextTurn' && e.player === player);
  enterStep(ctx, 'untap');
}

function enterStep(ctx: Ctx, step: Step): void {
  const s = ctx.s;
  const ap = s.turn.activePlayer;
  s.turn.step = step;
  s.turn.passed = [];
  // Unspent mana empties between steps (and all of it at the end of the turn).
  for (const p of Object.values(s.players))
    if (p.pool?.length) p.pool = step === 'cleanup' ? [] : p.pool.filter((m) => m.untilEndOfTurn);
  emit(ctx, { type: 'stepChanged', turn: s.turn.number, step, activePlayer: ap });

  switch (step) {
    case 'untap':
      // Vision: phased-out permanents come back first (rule 502.1).
      phaseIn(ctx, ap);
      for (const id of s.battlefield) {
        const o = obj(ctx, id);
        if (o.controller !== ap) continue;
        o.summoningSick = false;
        const stays = def(ctx, id).abilities.some(
          (a) => a.kind === 'static' && a.effect.kind === 'doesntUntap',
        );
        const auraStays = s.battlefield.some(
          (source) =>
            obj(ctx, source).attachedTo === id &&
            def(ctx, source).abilities.some(
              (a) => a.kind === 'static' && a.effect.kind === 'attached' && a.effect.doesntUntap,
            ),
        );
        if (!stays && !auraStays) untap(ctx, id);
      }
      return advanceStep(ctx); // no priority in untap (rule 502.4)

    case 'draw':
      // The player who goes first skips their first draw (rule 103.8a).
      if (s.turn.number > 1) drawCard(ctx, ap);
      return givePriority(ctx, ap);

    case 'beginCombat':
      s.combat = { attackers: [], dealtFirstStrikeDamage: [] };
      return givePriority(ctx, ap);

    case 'declareAttackers': {
      const able = possibleAttackers(ctx);
      if (able.length === 0) return confirmAttackers(ctx);
      // Creatures that attack each combat if able are declared already.
      const defender = defenderOf(ctx);
      const declared = able.filter((id) => mustAttack(ctx, id)).map((id) => ({ id, defender }));
      s.decision = { kind: 'declareAttackers', player: ap, declared };
      return;
    }

    case 'declareBlockers': {
      const defender = defenderOf(ctx);
      if (possibleBlockers(ctx, defender).length === 0) return confirmBlockers(ctx);
      s.decision = { kind: 'declareBlockers', player: defender, declared: [] };
      return;
    }

    case 'firstStrikeDamage':
      dealCombatDamage(ctx, true);
      return givePriority(ctx, ap);

    case 'combatDamage':
      dealCombatDamage(ctx, false);
      return givePriority(ctx, ap);

    case 'end':
      // The monarch draws a card at the beginning of their end step (drawn here, not on the stack).
      if (s.monarch === ap) drawCard(ctx, ap);
      return givePriority(ctx, ap);

    case 'cleanup': {
      const noMax = s.battlefield.some(
        (id) =>
          obj(ctx, id).controller === ap &&
          def(ctx, id).abilities.some(
            (a) => a.kind === 'static' && a.effect.kind === 'noMaxHandSize',
          ),
      );
      const excess = noMax ? 0 : s.players[ap].hand.length - HAND_SIZE;
      if (excess > 0) {
        s.decision = { kind: 'discardToHandSize', player: ap, count: excess };
        return;
      }
      return finishCleanup(ctx);
    }

    case 'upkeep':
      tickSuspend(ctx, ap);
      return givePriority(ctx, ap);

    case 'main1':
      // Sagas: a lore counter at the precombat main phase.
      addLoreForTurn(ctx, ap);
      return givePriority(ctx, ap);

    default:
      return givePriority(ctx, ap);
  }
}

/** Turn-based actions of the declare attackers step, after the declaration. */
export function confirmAttackers(ctx: Ctx): void {
  const s = ctx.s;
  let decl = s.decision.kind === 'declareAttackers' ? s.decision.declared : [];
  // Propaganda: pay for each attacker; ones that can't be paid for stay home.
  const tax = attackTax(ctx, s.turn.activePlayer);
  if (tax > 0 && decl.length > 0) {
    decl = decl.slice(0, affordableAttackers(ctx, s.turn.activePlayer));
    const cost = { generic: tax * decl.length, colored: {} };
    if (decl.length) payMana(ctx, planPayment(ctx, s.turn.activePlayer, cost, undefined));
  }
  s.combat ??= { attackers: [], dealtFirstStrikeDamage: [] };
  s.combat.attackers = decl.map((d) => ({
    id: d.id,
    defender: d.defender,
    ...(d.planeswalker ? { planeswalker: d.planeswalker } : {}),
    blocked: false,
    blockers: [],
  }));
  for (const d of decl) {
    if (!hasKeyword(ctx, d.id, 'vigilance')) tap(ctx, d.id);
  }
  if (decl.length > 0) s.players[s.turn.activePlayer].attackedThisTurn = true;
  for (const d of decl) s.turn.attackers.push(d.id);
  emit(ctx, { type: 'attackersDeclared', attackers: decl.map((d) => d.id) });
  givePriority(ctx, s.turn.activePlayer);
}

export function confirmBlockers(ctx: Ctx): void {
  const s = ctx.s;
  const decl = enforceMustBlock(
    ctx,
    enforceLure(ctx, s.decision.kind === 'declareBlockers' ? s.decision.declared : []),
  );
  for (const a of s.combat?.attackers ?? []) {
    a.blockers = decl.filter((d) => d.attacker === a.id).map((d) => d.blocker);
    a.blocked = a.blockers.length > 0;
  }
  emit(ctx, { type: 'blockersDeclared', blocks: decl.map((d) => ({ ...d })) });
  givePriority(ctx, s.turn.activePlayer);
}

/**
 * Prized Unicorn: every creature able to block a lure attacker blocks it
 * (the only legal outcome), whatever else was declared for it.
 */
function enforceLure(
  ctx: Ctx,
  declared: readonly { blocker: ObjectId; attacker: ObjectId }[],
): { blocker: ObjectId; attacker: ObjectId }[] {
  const lures = (ctx.s.combat?.attackers ?? []).filter((a) =>
    def(ctx, a.id).abilities.some((x) => x.kind === 'static' && x.effect.kind === 'lure'),
  );
  if (lures.length === 0) return [...declared];
  const out = [...declared];
  const defender = defenderOf(ctx);
  for (const lure of lures)
    for (const b of possibleBlockers(ctx, defender)) {
      if (out.some((d) => d.blocker === b && d.attacker === lure.id)) continue;
      if (!canBlock(ctx, b, lure.id)) continue;
      const i = out.findIndex((d) => d.blocker === b);
      if (i >= 0) out.splice(i, 1);
      out.push({ blocker: b, attacker: lure.id });
    }
  return out;
}

/**
 * Strixhaven (13a), Academic Dispute: a creature that must block this turn
 * blocks if able. If it wasn't declared as a blocker, it blocks the first
 * attacker it can (the engine makes the choice).
 */
function enforceMustBlock(
  ctx: Ctx,
  declared: { blocker: ObjectId; attacker: ObjectId }[],
): { blocker: ObjectId; attacker: ObjectId }[] {
  const forced = ctx.s.effects.filter((e) => e.mustBlock);
  if (forced.length === 0) return declared;
  const out = [...declared];
  const attackers = ctx.s.combat?.attackers ?? [];
  for (const e of forced) {
    const b = e.affected.id;
    const o = ctx.s.objects[b];
    if (!o || o.zcc !== e.affected.zcc || out.some((d) => d.blocker === b)) continue;
    const target = attackers.find((a) => canBlock(ctx, b, a.id));
    if (target) out.push({ blocker: b, attacker: target.id });
  }
  return out;
}

export function finishCleanup(ctx: Ctx): void {
  const s = ctx.s;
  for (const id of s.battlefield) {
    const o = obj(ctx, id);
    o.damage = 0;
    o.damagedByDeathtouch = false;
    delete o.damagedBy;
    // Mirage Mirror: back to itself.
    if (o.copyingUntilTurn !== undefined && o.originalDefId) {
      o.defId = o.originalDefId;
      delete o.originalDefId;
      delete o.copyingUntilTurn;
    }
    // Strixhaven (13a): abilities granted until end of turn.
    delete o.tempAbilities;
  }
  endEffects(ctx, (e) => e.expires === 'endOfTurn');
  if (s.emblems?.length)
    s.emblems = s.emblems.filter((e) => e.untilTurn === undefined || e.untilTurn > s.turn.number);
  advanceStep(ctx);
}

/** Removes the matching continuous effects, undoing control changes and lost abilities. */
function endEffects(ctx: Ctx, ending: (e: ContinuousEffect) => boolean): void {
  const s = ctx.s;
  const ended = s.effects.filter(ending);
  if (ended.length === 0) return;
  s.effects = s.effects.filter((e) => !ending(e));
  for (const e of ended) {
    const o = s.objects[e.affected.id];
    if (!o || o.zone !== 'battlefield' || o.zcc !== e.affected.zcc) continue;
    if (e.previousController) o.controller = e.previousController;
    if (e.loseAbilities)
      o.blank = s.effects.some(
        (x) => x.loseAbilities && x.affected.id === o.id && x.affected.zcc === o.zcc,
      );
  }
}
