import { hasKeyword } from './characteristics.ts';
import {
  anyFirstStrike,
  dealCombatDamage,
  defenderOf,
  possibleAttackers,
  possibleBlockers,
} from './combat.ts';
import { type Ctx, drawCard, emit, obj, other, untap } from './context.ts';
import { checkGameOver, runSBAs } from './sba.ts';
import { pushTrigger, resolveTop } from './stack.ts';
import { targetCombos } from './targets.ts';
import { collectTriggers, nextPendingTriggerIndex, triggeredAbility } from './triggers.ts';
import type { PlayerId, Step } from './types.ts';

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

    const i = nextPendingTriggerIndex(ctx);
    if (i < 0) break;
    const t = s.pendingTriggers.splice(i, 1)[0]!;
    const a = triggeredAbility(ctx, t.sourceDefId, t.abilityIndex);
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
    resolveTop(ctx);
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
  if (next === 'nextTurn') startTurn(ctx, other(ctx.s.turn.activePlayer));
  else enterStep(ctx, next);
}

export function startTurn(ctx: Ctx, player: PlayerId): void {
  const s = ctx.s;
  s.turn.number++;
  s.turn.activePlayer = player;
  const p = s.players[player];
  p.landsPlayedThisTurn = 0;
  for (const q of Object.values(s.players)) q.attackedThisTurn = false;
  enterStep(ctx, 'untap');
}

function enterStep(ctx: Ctx, step: Step): void {
  const s = ctx.s;
  const ap = s.turn.activePlayer;
  s.turn.step = step;
  s.turn.passed = [];
  emit(ctx, { type: 'stepChanged', turn: s.turn.number, step, activePlayer: ap });

  switch (step) {
    case 'untap':
      for (const id of s.battlefield) {
        const o = obj(ctx, id);
        if (o.controller !== ap) continue;
        o.summoningSick = false;
        untap(ctx, id);
      }
      return advanceStep(ctx); // no priority in untap (rule 502.4)

    case 'draw':
      // The player who goes first skips their first draw (rule 103.8a).
      if (s.turn.number > 1) drawCard(ctx, ap);
      return givePriority(ctx, ap);

    case 'beginCombat':
      s.combat = { attackers: [], dealtFirstStrikeDamage: [] };
      return givePriority(ctx, ap);

    case 'declareAttackers':
      if (possibleAttackers(ctx).length === 0) return confirmAttackers(ctx);
      s.decision = { kind: 'declareAttackers', player: ap, declared: [] };
      return;

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

    case 'cleanup': {
      const excess = s.players[ap].hand.length - HAND_SIZE;
      if (excess > 0) {
        s.decision = { kind: 'discardToHandSize', player: ap, count: excess };
        return;
      }
      return finishCleanup(ctx);
    }

    default:
      return givePriority(ctx, ap);
  }
}

/** Turn-based actions of the declare attackers step, after the declaration. */
export function confirmAttackers(ctx: Ctx): void {
  const s = ctx.s;
  const decl = s.decision.kind === 'declareAttackers' ? s.decision.declared : [];
  s.combat ??= { attackers: [], dealtFirstStrikeDamage: [] };
  s.combat.attackers = decl.map((d) => ({
    id: d.id,
    defender: d.defender,
    blocked: false,
    blockers: [],
  }));
  for (const d of decl) {
    const o = obj(ctx, d.id);
    if (!hasKeyword(ctx, d.id, 'vigilance')) {
      o.tapped = true;
      emit(ctx, { type: 'tapped', id: d.id });
    }
  }
  if (decl.length > 0) s.players[s.turn.activePlayer].attackedThisTurn = true;
  emit(ctx, { type: 'attackersDeclared', attackers: decl.map((d) => d.id) });
  givePriority(ctx, s.turn.activePlayer);
}

export function confirmBlockers(ctx: Ctx): void {
  const s = ctx.s;
  const decl = s.decision.kind === 'declareBlockers' ? s.decision.declared : [];
  for (const a of s.combat?.attackers ?? []) {
    a.blockers = decl.filter((d) => d.attacker === a.id).map((d) => d.blocker);
    a.blocked = a.blockers.length > 0;
  }
  emit(ctx, { type: 'blockersDeclared', blocks: decl.map((d) => ({ ...d })) });
  givePriority(ctx, s.turn.activePlayer);
}

export function finishCleanup(ctx: Ctx): void {
  const s = ctx.s;
  for (const id of s.battlefield) {
    const o = obj(ctx, id);
    o.damage = 0;
    o.damagedByDeathtouch = false;
  }
  s.effects = s.effects.filter((e) => e.expires !== 'endOfTurn');
  advanceStep(ctx);
}
