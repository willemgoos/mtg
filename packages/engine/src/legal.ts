import { canTapForAbility, isCreature, matchesFilter } from './characteristics.ts';
import { blockViolations, canAttack, canBlock, defenderOf } from './combat.ts';
import { type Ctx, def, obj } from './context.ts';
import { canPayFrom, manaSources } from './mana.ts';
import { castVariants } from './spells.ts';
import { castCost, countersYouControl, hasStatic, wardCost, wardLife } from './stack.ts';
import { addCosts } from './spells.ts';
import { checkCondition, triggeredAbility } from './triggers.ts';

const NO_COST = { generic: 0, colored: {} };
import { targetCombos } from './targets.ts';
import type { Action, ObjectId, PlayerId, TargetChoice, TargetSpec } from './types.ts';

const MAX_MULLIGANS = 7;

/** Every split of the scried cards into an ordered top and an ordered bottom. */
function scryAnswers(cards: readonly ObjectId[]): { top: ObjectId[]; bottom: ObjectId[] }[] {
  const out: { top: ObjectId[]; bottom: ObjectId[] }[] = [];
  const perms = (xs: ObjectId[]): ObjectId[][] =>
    xs.length <= 1
      ? [xs]
      : xs.flatMap((x, i) => perms(xs.filter((_, j) => j !== i)).map((p) => [x, ...p]));
  for (let mask = 0; mask < 1 << cards.length; mask++) {
    const top = cards.filter((_, i) => !(mask & (1 << i)));
    const bottom = cards.filter((_, i) => mask & (1 << i));
    for (const t of perms(top)) for (const b of perms(bottom)) out.push({ top: t, bottom: b });
  }
  return out;
}

/**
 * Cards `player` might cast or play: their hand, flashback cards in their
 * graveyard, and the top of their library with Vizier of the Menagerie.
 */
export function castableCards(ctx: Ctx, player: PlayerId): ObjectId[] {
  const ps = ctx.s.players[player];
  const out = [...ps.hand];
  for (const id of ps.graveyard) {
    const d = def(ctx, id);
    if (d.types.includes('Land')) continue;
    if (d.flashback || d.castFromGraveyardRemovingCounters) out.push(id);
  }
  // Strongbox Raider: exiled cards you may play for a while.
  for (const id of ps.exile) {
    const until = obj(ctx, id).playableUntilTurn;
    if (until !== undefined && until >= ctx.s.turn.number) out.push(id);
  }
  const top = ps.library[0];
  if (
    top &&
    def(ctx, top).types.includes('Creature') &&
    hasStatic(ctx, player, 'creaturesFromTopOfLibrary')
  )
    out.push(top);
  return out;
}

/** Land plays allowed per turn: one, plus one for each "additional land" effect (Loot). */
function landDrops(ctx: Ctx, player: PlayerId): number {
  let n = 1;
  for (const id of ctx.s.battlefield) {
    if (obj(ctx, id).controller !== player) continue;
    for (const a of def(ctx, id).abilities)
      if (a.kind === 'static' && a.effect.kind === 'extraLandDrop') n++;
  }
  return n;
}

/** Every way to choose the face-up pile (order within a pile doesn't matter). */
function pileSplits(cards: readonly ObjectId[]): ObjectId[][] {
  const out: ObjectId[][] = [];
  for (let mask = 0; mask < 1 << cards.length; mask++)
    out.push(cards.filter((_, i) => mask & (1 << i)));
  return out;
}

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

  const flashForAll = hasStatic(ctx, player, 'flashForAll');
  const restricted = s.battlefield.some(
    (id) =>
      obj(ctx, id).controller === player &&
      def(ctx, id).abilities.some((a) => a.kind === 'mana' && !!a.onlyFor),
  );
  const creatures = s.battlefield.filter(
    (id) => obj(ctx, id).controller === player && isCreature(ctx, id),
  );
  /** Target combos, dropping any that target the creature being sacrificed. */
  const combosFor = (specs: TargetSpec[], sourceId: ObjectId, sacrifice?: ObjectId) =>
    targetCombos(ctx, specs, { controller: player, sourceId }).filter(
      (ts) => !sacrifice || !ts.some((t) => 'object' in t && t.object.id === sacrifice),
    );

  for (const card of castableCards(ctx, player)) {
    const d = def(ctx, card);
    const zone = obj(ctx, card).zone;
    if (d.types.includes('Land')) {
      if (sorcery && ps.landsPlayedThisTurn < landDrops(ctx, player) && zone !== 'graveyard')
        out.push({ type: 'playLand', player, card });
      continue;
    }
    if (d.castOnlyIf && !checkCondition(ctx, d.castOnlyIf, player, obj(ctx, card))) continue;
    const instantSpeed = d.types.includes('Instant') || d.keywords.includes('flash') || flashForAll;
    // Restricted mana (Giada: only for Angels) counts for matching spells.
    const pool =
      restricted && d.subtypes.length ? manaSources(ctx, player, undefined, d.subtypes) : sources;
    if (!instantSpeed && !sorcery) continue;
    for (const v of castVariants(d, zone)) {
      if (v.removeCounters && countersYouControl(ctx, player) < v.removeCounters) continue;
      const base = castCost(ctx, player, card, {
        mode: v.mode,
        kicked: v.kicked,
        sacrifice: v.sacrifice ? 'x' : undefined,
      });
      if (!canPayFrom(base, pool)) continue;
      const extra = {
        ...(v.mode !== undefined ? { mode: v.mode } : {}),
        ...(v.kicked ? { kicked: true } : {}),
      };
      const specs = v.spell?.targets ?? (d.enchant ? [d.enchant] : []);
      for (const sacrifice of v.sacrifice ? creatures : [undefined]) {
        for (const targets of combosFor(specs, card, sacrifice)) {
          const ward = wardCost(ctx, player, targets);
          if (ward.generic && !canPayFrom(addCosts(base, ward), pool)) continue;
          if (wardLife(ctx, player, targets) > s.players[player].life) continue;
          out.push({
            type: 'castSpell',
            player,
            card,
            targets,
            ...extra,
            ...(sacrifice ? { sacrifice } : {}),
          });
        }
      }
    }
  }

  const abilitySources = [
    ...s.battlefield.filter((id) => obj(ctx, id).controller === player),
    ...ps.graveyard,
  ];
  for (const source of abilitySources) {
    const inGraveyard = obj(ctx, source).zone === 'graveyard';
    def(ctx, source).abilities.forEach((a, abilityIndex) => {
      if (a.kind !== 'activated') return;
      if (!!a.fromGraveyard !== inGraveyard) return;
      if (a.sorcerySpeed && !sorcery) return;
      if (a.once && obj(ctx, source).usedAbilities?.includes(abilityIndex)) return;
      if (a.cost.tapSelf && !canTapForAbility(ctx, source)) return;
      if (a.condition && !checkCondition(ctx, a.condition, player, obj(ctx, source))) return;
      const usable = a.cost.tapSelf ? sources.filter((x) => x.id !== source) : sources;
      if (!canPayFrom(a.cost.mana, usable)) return;
      const rc = a.cost.removeCounters;
      if (rc && (obj(ctx, source).counters?.[rc.name] ?? 0) < rc.count) return;
      const sacrificeable = a.cost.sacrificeFilter
        ? creatures.filter((id) => matchesFilter(ctx, id, a.cost.sacrificeFilter, source))
        : creatures;
      for (const sacrifice of a.cost.sacrificeCreature ? sacrificeable : [undefined]) {
        for (const targets of combosFor(a.targets, source, sacrifice)) {
          const ward = wardCost(ctx, player, targets);
          if (ward.generic && !canPayFrom(addCosts(a.cost.mana ?? NO_COST, ward), usable)) continue;
          out.push({
            type: 'activateAbility',
            player,
            source,
            abilityIndex,
            targets,
            ...(sacrifice ? { sacrifice } : {}),
          });
        }
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
    case 'optionalEffect':
      return [
        { type: 'chooseEffect', player, accept: false },
        ...(canPayFrom(d.cost, manaSources(ctx, player))
          ? [{ type: 'chooseEffect' as const, player, accept: true }]
          : []),
      ];
    case 'scry':
      return scryAnswers(d.cards).map(({ top, bottom }) => ({ type: 'scry', player, top, bottom }));
    case 'discard':
      return s.players[player].hand.map((card) => ({ type: 'discard', player, card }) as const);
    case 'splitPiles':
      return pileSplits(d.cards).map((faceUp) => ({ type: 'splitPiles', player, faceUp }));
    case 'choosePile':
      return [
        { type: 'choosePile', player, pile: 'faceUp' },
        { type: 'choosePile', player, pile: 'faceDown' },
      ];
    case 'sacrifice':
    case 'pickExiled':
      return d.options.map((card) => ({ type: 'chooseCard', player, card }) as const);
    case 'punisher':
      return [
        ...d.options.map((card) => ({ type: 'chooseCard', player, card }) as const),
        { type: 'chooseCard', player, card: null },
      ];
    case 'searchLibrary': {
      // One option per distinct card name is enough (they are interchangeable).
      const seen = new Set<string>();
      const out: Action[] = [];
      for (const card of d.options) {
        const defId = obj(ctx, card).defId;
        if (seen.has(defId)) continue;
        seen.add(defId);
        out.push({ type: 'chooseCard', player, card });
      }
      if (!d.required || !d.options.length) out.push({ type: 'chooseCard', player, card: null });
      return out;
    }
    case 'chooseTriggerTargets': {
      const t = d.trigger;
      const a = triggeredAbility(ctx, t);
      const src = { controller: player, sourceId: t.source.id };
      const pool = manaSources(ctx, player);
      const out: Action[] = [];
      // "You may pay" and ward: only offered if they can pay.
      const payable = (targets: TargetChoice[]) =>
        canPayFrom(addCosts(a.cost ?? NO_COST, wardCost(ctx, player, targets)), pool);
      if (a.modes) {
        a.modes.forEach((m, mode) => {
          for (const targets of targetCombos(ctx, m.targets, src))
            if (payable(targets)) out.push({ type: 'chooseTargets', player, targets, mode });
        });
        if (out.length === 0) out.push({ type: 'chooseTargets', player, targets: [] });
        return out;
      }
      for (const targets of targetCombos(ctx, a.targets, src))
        if (payable(targets)) out.push({ type: 'chooseTargets', player, targets });
      // Optional, or every choice is unaffordable because of ward: nothing happens
      // (ward would counter it).
      if (a.optional || a.cost || out.length === 0)
        out.push({ type: 'chooseTargets', player, targets: [] });
      return out;
    }
  }
}
