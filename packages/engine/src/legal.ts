import { canTapForAbility, isCreature } from './characteristics.ts';
import { blockViolations, canAttack, canBlock, defenderOf } from './combat.ts';
import { type Ctx, def, defOf, obj } from './context.ts';
import { canPayFrom, manaSources } from './mana.ts';
import { targetCombos } from './targets.ts';
import type { Action, PlayerId } from './types.ts';

const MAX_MULLIGANS = 7;

function isMainPhase(ctx: Ctx): boolean {
  const st = ctx.s.turn.step;
  return st === 'main1' || st === 'main2';
}

/** Sorcery timing: own main phase with an empty stack (rule 307.1). */
export function sorceryTiming(ctx: Ctx, player: PlayerId): boolean {
  return isMainPhase(ctx) && ctx.s.turn.activePlayer === player && ctx.s.stack.length === 0;
}

function priorityActions(ctx: Ctx, player: PlayerId): Action[] {
  const s = ctx.s;
  const out: Action[] = [{ type: 'passPriority', player }];
  const ps = s.players[player];
  const sorcery = sorceryTiming(ctx, player);
  const sources = manaSources(ctx, player);

  for (const card of ps.hand) {
    const d = def(ctx, card);
    if (d.types.includes('Land')) {
      if (sorcery && ps.landsPlayedThisTurn < 1) out.push({ type: 'playLand', player, card });
      continue;
    }
    if (!d.types.includes('Instant') && !sorcery) continue;
    if (!canPayFrom(d.manaCost, sources)) continue;
    const specs = d.spell?.targets ?? [];
    for (const targets of targetCombos(ctx, specs, { controller: player, sourceId: card })) {
      out.push({ type: 'castSpell', player, card, targets });
    }
  }

  for (const source of s.battlefield) {
    if (obj(ctx, source).controller !== player) continue;
    def(ctx, source).abilities.forEach((a, abilityIndex) => {
      if (a.kind !== 'activated') return;
      if (a.sorcerySpeed && !sorcery) return;
      if (a.cost.tapSelf && !canTapForAbility(ctx, source)) return;
      const usable = a.cost.tapSelf ? sources.filter((x) => x.id !== source) : sources;
      if (!canPayFrom(a.cost.mana, usable)) return;
      for (const targets of targetCombos(ctx, a.targets, {
        controller: player,
        sourceId: source,
      })) {
        out.push({ type: 'activateAbility', player, source, abilityIndex, targets });
      }
    });
  }
  return out;
}

/**
 * Every action `player` may take right now. Empty if it isn't their decision.
 * Covers everything applyAction accepts except explicit `payWith` choices and
 * conceding.
 */
export function getLegalActions(ctx: Ctx, player: PlayerId): Action[] {
  const s = ctx.s;
  const d = s.decision;
  if (d.kind === 'gameOver' || d.player !== player) return [];

  switch (d.kind) {
    case 'mulligan': {
      const out: Action[] = [{ type: 'keepHand', player }];
      if (s.players[player].mulligans < MAX_MULLIGANS) out.push({ type: 'mulligan', player });
      return out;
    }
    case 'bottomCards':
      return s.players[player].hand.map((card) => ({ type: 'bottomCard', player, card }) as const);
    case 'discardToHandSize':
      return s.players[player].hand.map((card) => ({ type: 'discard', player, card }) as const);
    case 'priority':
      return priorityActions(ctx, player);
    case 'declareAttackers': {
      const out: Action[] = [{ type: 'confirmAttackers', player }];
      const declared = new Set(d.declared.map((x) => x.id));
      for (const id of s.battlefield) {
        if (declared.has(id)) out.push({ type: 'removeAttacker', player, attacker: id });
        else if (isCreature(ctx, id) && canAttack(ctx, id))
          out.push({ type: 'addAttacker', player, attacker: id, defender: defenderOf(ctx) });
      }
      return out;
    }
    case 'declareBlockers': {
      const out: Action[] = [];
      if (blockViolations(ctx, d.declared).length === 0)
        out.push({ type: 'confirmBlockers', player });
      const declared = new Set(d.declared.map((x) => x.blocker));
      for (const id of s.battlefield) {
        if (obj(ctx, id).controller !== player) continue;
        if (declared.has(id)) {
          out.push({ type: 'removeBlock', player, blocker: id });
          continue;
        }
        for (const a of s.combat?.attackers ?? []) {
          if (canBlock(ctx, id, a.id))
            out.push({ type: 'addBlock', player, blocker: id, attacker: a.id });
        }
      }
      return out;
    }
    case 'chooseTriggerTargets': {
      const t = d.trigger;
      const a = defOf(ctx, t.sourceDefId).abilities[t.abilityIndex];
      if (a?.kind !== 'triggered') return [];
      const combos = targetCombos(ctx, a.targets, { controller: player, sourceId: t.source.id });
      const out: Action[] = combos.map((targets) => ({ type: 'chooseTargets', player, targets }));
      if (a.optional) out.push({ type: 'chooseTargets', player, targets: [] });
      return out;
    }
  }
}
