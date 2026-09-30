import { countOf, creaturesOnBattlefield, matchesFilter } from './characteristics.ts';
import { type Ctx, def, defOf, obj, other } from './context.ts';
import type {
  AbilityDef,
  EffectDef,
  CardDefinition,
  ConditionDef,
  GameEvent,
  GameObject,
  PlayerId,
  StackItem,
  TriggerDef,
} from './types.ts';

type Triggered = Extract<AbilityDef, { kind: 'triggered' }>;

export function checkCondition(
  ctx: Ctx,
  c: ConditionDef | undefined,
  controller: PlayerId,
  self: GameObject | undefined,
): boolean {
  if (!c) return true;
  if (c.kind === 'controlsPermanents')
    return (
      ctx.s.battlefield.filter(
        (id) =>
          obj(ctx, id).controller === controller && matchesFilter(ctx, id, c.filter, self?.id),
      ).length >= c.min
    );
  if (c.kind === 'creatureDiedThisTurn') return ctx.s.turn.creaturesDied > 0;
  if (c.kind === 'opponentsTurn') return ctx.s.turn.activePlayer !== controller;
  if (c.kind === 'yourTurn') return ctx.s.turn.activePlayer === controller;
  if (c.kind === 'sourceCounters') return !!self && self.plusOneCounters >= c.min;
  if (c.kind === 'sourceAttacking')
    return !!self && !!ctx.s.combat?.attackers.some((a) => a.id === self.id);
  if (c.kind === 'beingAttacked')
    return !!ctx.s.combat?.attackers.some((a) => a.defender === controller);
  if (c.kind === 'opponentControlsCreature')
    return creaturesOnBattlefield(ctx, other(controller)).some((o) =>
      matchesFilter(ctx, o.id, c.filter),
    );
  if (c.kind === 'graveyardCount')
    return (
      countOf(ctx, controller, {
        count: 'cardsInGraveyard',
        ...(c.types ? { types: c.types } : {}),
      }) >= c.min
    );
  if (!self) return false;
  switch (c.kind) {
    case 'attackedThisTurn':
      return ctx.s.players[controller].attackedThisTurn;
    case 'controlsAnother':
      return creaturesOnBattlefield(ctx, controller).some(
        (o) => o.id !== self.id && def(ctx, o.id).subtypes.includes(c.subtype),
      );
    case 'controlsCreature':
      return (
        creaturesOnBattlefield(ctx, controller).filter((o) =>
          matchesFilter(ctx, o.id, c.filter, self.id),
        ).length >= (c.count ?? 1)
      );
    case 'wasKicked':
      return !!self.kicked;
    case 'diedWithout':
      return (
        !def(ctx, self.id).subtypes.includes(c.subtype) &&
        !self.lastAddedSubtypes?.includes(c.subtype)
      );
    case 'firstLifeGainThisTurn':
      return (
        (c.anyTurn || ctx.s.turn.activePlayer === controller) &&
        ctx.s.turn.lifeGains[controller] === 1
      );
    case 'firstAttackThisTurn':
      return ctx.s.turn.attackers.filter((id) => id === self.id).length === 1;
    case 'custom':
      throw new Error(`Custom condition "${c.handler}" not registered`);
  }
}

function queue(
  ctx: Ctx,
  o: GameObject,
  index: number,
  controller: PlayerId,
  subject?: GameObject,
  amount?: number,
): void {
  ctx.s.pendingTriggers.push({
    source: { id: o.id, zcc: o.zcc },
    sourceDefId: o.defId,
    abilityIndex: index,
    controller,
    ...(subject ? { subject: { id: subject.id, zcc: subject.zcc } } : {}),
    ...(amount !== undefined ? { amount } : {}),
  });
}

/** Calls `fn` for each triggered ability on each permanent on the battlefield. */
function forEachBattlefieldTrigger(
  ctx: Ctx,
  fn: (o: GameObject, a: Triggered, index: number) => boolean,
  subject?: GameObject,
  amount?: number,
): void {
  for (const id of ctx.s.battlefield) {
    const o = obj(ctx, id);
    def(ctx, id).abilities.forEach((a, i) => {
      if (a.kind !== 'triggered') return;
      if (fn(o, a, i) && checkCondition(ctx, a.condition, o.controller, o))
        queue(ctx, o, i, o.controller, subject, amount);
    });
  }
}

function spellMatches(
  ctx: Ctx,
  t: Extract<TriggerDef, { on: 'castSpell' }>,
  spell: CardDefinition,
  item: StackItem | undefined,
  self: GameObject,
): boolean {
  switch (t.filter) {
    case 'any':
      return true;
    case 'creature':
      return spell.types.includes('Creature');
    case 'noncreature':
      return !spell.types.includes('Creature');
    case 'instantOrSorcery':
      return spell.types.includes('Instant') || spell.types.includes('Sorcery');
    case 'targetsSelf':
      return !!item?.targets.some(
        (x) => 'object' in x && x.object.id === self.id && x.object.zcc === self.zcc,
      );
  }
}

function detect(ctx: Ctx, ev: GameEvent): void {
  const s = ctx.s;
  switch (ev.type) {
    case 'objectMoved': {
      const moved = s.objects[ev.id];
      const movedDef = defOf(ctx, ev.defId);
      if (ev.to === 'battlefield' && moved && moved.zone === 'battlefield') {
        const isCreature = movedDef.types.includes('Creature');
        const isLand = movedDef.types.includes('Land');
        forEachBattlefieldTrigger(
          ctx,
          (o, a) => {
            const t = a.trigger;
            if (t.on === 'etb') return o.id === moved.id;
            if (t.on === 'otherCreatureEtb')
              return (
                isCreature &&
                o.id !== moved.id &&
                (t.controller === 'any' || o.controller === moved.controller) &&
                matchesFilter(ctx, moved.id, t.filter)
              );
            if (t.on === 'landfall') return isLand && o.controller === moved.controller;
            return false;
          },
          moved,
        );
      }
      if (
        ev.from === 'battlefield' &&
        ev.to === 'graveyard' &&
        movedDef.types.includes('Creature')
      ) {
        // "Dies" triggers look back in time: the ability triggers from the graveyard card.
        const card = moved ?? null;
        movedDef.abilities.forEach((a, i) => {
          if (a.kind !== 'triggered') return;
          const t = a.trigger;
          if (t.on !== 'dies' && t.on !== 'creatureYouControlDies') return;
          if (t.on === 'creatureYouControlDies' && t.nontoken && (!card || card.isToken)) return;
          const controller = card?.owner ?? 'p1';
          if (card && checkCondition(ctx, a.condition, controller, card))
            queue(ctx, card, i, controller);
        });
        // Granted "when this dies, return it" (Undying Malice, Fake Your Own Death).
        if (moved) {
          for (const e of s.effects) {
            if (!e.returnWhenDies || e.affected.id !== ev.id || e.affected.zcc !== moved.zcc - 1)
              continue;
            const r = e.returnWhenDies;
            s.pendingTriggers.push({
              source: { id: moved.id, zcc: moved.zcc },
              sourceDefId: moved.defId,
              abilityIndex: -1,
              controller: moved.owner,
              inline: [
                { kind: 'returnSource', to: 'battlefield', tapped: true, counters: r.counters },
                ...(r.treasure
                  ? [{ kind: 'createToken', token: 'treasure-token', count: 1 } as const]
                  : []),
              ],
            });
          }
        }
        // Tokens cease to exist, so a missing object was a token.
        const wasToken = !moved || moved.isToken;
        const diedUnder = moved?.owner;
        // Auras that already went to the graveyard alongside it look back in time.
        if (moved) {
          for (const pid of Object.keys(s.players) as PlayerId[]) {
            for (const gid of s.players[pid].graveyard) {
              const g = s.objects[gid]!;
              const was = g.lastAttachedTo;
              // It must have left after the creature (not an Aura destroyed earlier).
              if (!was || was.id !== ev.id || was.zcc !== moved.zcc - 1) continue;
              if (g.timestamp < moved.timestamp) continue;
              def(ctx, gid).abilities.forEach((a, i) => {
                if (a.kind === 'triggered' && a.trigger.on === 'attachedDies')
                  queue(ctx, g, i, g.owner);
              });
            }
          }
        }
        forEachBattlefieldTrigger(ctx, (o, a) => {
          const t = a.trigger;
          if (t.on === 'attachedDies') return o.attachedTo === ev.id;
          if (t.on !== 'otherCreatureDies' && t.on !== 'creatureYouControlDies') return false;
          if (o.id === ev.id) return false;
          if (t.nontoken && wasToken) return false;
          if (diedUnder === undefined) return true;
          if (t.on === 'otherCreatureDies' && t.controller === 'any') return true;
          if (t.on === 'otherCreatureDies' && t.controller === 'opponent')
            return o.controller !== diedUnder;
          return o.controller === diedUnder;
        });
      }
      return;
    }
    case 'cardDrawn': {
      forEachBattlefieldTrigger(
        ctx,
        (o, a) =>
          (a.trigger.on === 'drawSecondCard' && ev.nth === 2 && o.controller === ev.player) ||
          (a.trigger.on === 'drawCard' &&
            (a.trigger.whose === 'yours'
              ? o.controller === ev.player
              : o.controller !== ev.player)),
      );
      return;
    }
    case 'lifeChanged': {
      if (ev.delta <= 0) return;
      forEachBattlefieldTrigger(
        ctx,
        (o, a) => a.trigger.on === 'youGainLife' && o.controller === ev.player,
      );
      return;
    }
    case 'spellCast': {
      const spellObj = obj(ctx, ev.id);
      const spell = defOf(ctx, spellObj.defId);
      const item = s.stack.find((x) => x.id === ev.id);
      // "X is the mana value of that spell" (Ovika).
      forEachBattlefieldTrigger(
        ctx,
        (o, a) =>
          a.trigger.on === 'castSpell' &&
          o.controller === ev.player &&
          spellMatches(ctx, a.trigger, spell, item, o),
        undefined,
        manaValueOf(spell),
      );
      return;
    }
    case 'attackersDeclared': {
      const ap = s.turn.activePlayer;
      forEachBattlefieldTrigger(ctx, (o, a) => {
        if (a.trigger.on === 'attacks') return ev.attackers.includes(o.id);
        if (a.trigger.on === 'youAttack') return o.controller === ap && ev.attackers.length > 0;
        return false;
      });
      // "Whenever a creature you control attacks": once per attacker.
      for (const id of ev.attackers) {
        const attacker = s.objects[id];
        if (!attacker) continue;
        forEachBattlefieldTrigger(
          ctx,
          (o, a) =>
            a.trigger.on === 'creatureYouControlAttacks' &&
            o.controller === attacker.controller &&
            matchesFilter(ctx, id, a.trigger.filter),
          attacker,
        );
      }
      return;
    }
    case 'blockersDeclared': {
      const blocked = new Set(ev.blocks.map((b) => b.attacker));
      forEachBattlefieldTrigger(
        ctx,
        (o, a) => a.trigger.on === 'becomesBlocked' && blocked.has(o.id),
      );
      return;
    }
    case 'damageDealt': {
      if (!ev.combat) {
        // Niv-Mizzet: noncombat damage to an opponent from a source you control.
        const src = s.objects[ev.source];
        const by = src?.controller;
        if (!by || !('player' in ev.to) || ev.to.player === by) return;
        forEachBattlefieldTrigger(
          ctx,
          (o, a) => a.trigger.on === 'yourNoncombatDamageToOpponent' && o.controller === by,
          undefined,
          ev.amount,
        );
        return;
      }
      const src = s.objects[ev.source];
      if (!src || src.zone !== 'battlefield') return;
      if (src.controller === s.turn.activePlayer)
        forEachBattlefieldTrigger(
          ctx,
          (o, a) =>
            a.trigger.on === 'creatureYouControlDealsCombatDamage' &&
            o.controller === src.controller,
          src,
          ev.amount,
        );
      if (!('player' in ev.to)) return;
      def(ctx, src.id).abilities.forEach((a, i) => {
        if (a.kind === 'triggered' && a.trigger.on === 'combatDamageToPlayer')
          queue(ctx, src, i, src.controller, undefined, ev.amount);
      });
      forEachBattlefieldTrigger(
        ctx,
        (o, a) => a.trigger.on === 'equippedDealsCombatDamageToPlayer' && o.attachedTo === src.id,
      );
      return;
    }
    case 'stepChanged': {
      if (ev.step === 'beginCombat') {
        forEachBattlefieldTrigger(
          ctx,
          (o, a) => a.trigger.on === 'beginningOfCombat' && o.controller === ev.activePlayer,
        );
        return;
      }
      if (ev.step !== 'upkeep' && ev.step !== 'end') return;
      const on = ev.step === 'upkeep' ? 'beginningOfUpkeep' : 'beginningOfEndStep';
      forEachBattlefieldTrigger(ctx, (o, a) => {
        const t = a.trigger;
        if (t.on !== on) return false;
        return t.whose === 'each' || o.controller === ev.activePlayer;
      });
      return;
    }
    default:
      return;
  }
}

/** Scans events emitted since the last call and queues any triggered abilities. */
export function collectTriggers(ctx: Ctx): void {
  while (ctx.triggerCursor < ctx.events.length) {
    const ev = ctx.events[ctx.triggerCursor++]!;
    detect(ctx, ev);
  }
}

/** APNAP: the active player's triggers go on the stack first. */
export function nextPendingTriggerIndex(ctx: Ctx): number {
  const ap = ctx.s.turn.activePlayer;
  const i = ctx.s.pendingTriggers.findIndex((t) => t.controller === ap);
  if (i >= 0) return i;
  return ctx.s.pendingTriggers.findIndex((t) => t.controller === other(ap));
}

function manaValueOf(d: CardDefinition): number {
  let n = d.manaCost.generic;
  for (const v of Object.values(d.manaCost.colored)) n += v ?? 0;
  return n;
}

/** The ability a pending trigger or stack item refers to (granted ones carry their effects). */
export function triggeredAbility(
  ctx: Ctx,
  t: { sourceDefId: string; abilityIndex: number; inline?: EffectDef[] | undefined },
): Triggered {
  if (t.inline)
    return { kind: 'triggered', trigger: { on: 'dies' }, targets: [], effects: t.inline };
  const a = defOf(ctx, t.sourceDefId).abilities[t.abilityIndex];
  if (!a || a.kind !== 'triggered')
    throw new Error(`No triggered ability ${t.sourceDefId}#${t.abilityIndex}`);
  return a;
}
