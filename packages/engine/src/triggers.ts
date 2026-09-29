import { creaturesOnBattlefield } from './characteristics.ts';
import { type Ctx, def, defOf, obj, other } from './context.ts';
import type {
  AbilityDef,
  CardDefinition,
  ConditionDef,
  GameEvent,
  GameObject,
  PlayerId,
  StackItem,
  TriggerDef,
} from './types.ts';

type Triggered = Extract<AbilityDef, { kind: 'triggered' }>;

function checkCondition(
  ctx: Ctx,
  c: ConditionDef | undefined,
  controller: PlayerId,
  self: GameObject,
): boolean {
  if (!c) return true;
  switch (c.kind) {
    case 'attackedThisTurn':
      return ctx.s.players[controller].attackedThisTurn;
    case 'controlsAnother':
      return creaturesOnBattlefield(ctx, controller).some(
        (o) => o.id !== self.id && def(ctx, o.id).subtypes.includes(c.subtype),
      );
    case 'custom':
      throw new Error(`Custom condition "${c.handler}" not registered`);
  }
}

function queue(ctx: Ctx, o: GameObject, index: number, controller: PlayerId): void {
  ctx.s.pendingTriggers.push({
    source: { id: o.id, zcc: o.zcc },
    sourceDefId: o.defId,
    abilityIndex: index,
    controller,
  });
}

/** Calls `fn` for each triggered ability on each permanent on the battlefield. */
function forEachBattlefieldTrigger(
  ctx: Ctx,
  fn: (o: GameObject, a: Triggered, index: number) => boolean,
): void {
  for (const id of ctx.s.battlefield) {
    const o = obj(ctx, id);
    def(ctx, id).abilities.forEach((a, i) => {
      if (a.kind !== 'triggered') return;
      if (fn(o, a, i) && checkCondition(ctx, a.condition, o.controller, o))
        queue(ctx, o, i, o.controller);
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
        forEachBattlefieldTrigger(ctx, (o, a) => {
          const t = a.trigger;
          if (t.on === 'etb') return o.id === moved.id;
          if (t.on === 'otherCreatureEtb')
            return (
              isCreature &&
              o.id !== moved.id &&
              (t.controller === 'any' || o.controller === moved.controller)
            );
          if (t.on === 'landfall') return isLand && o.controller === moved.controller;
          return false;
        });
      }
      if (
        ev.from === 'battlefield' &&
        ev.to === 'graveyard' &&
        movedDef.types.includes('Creature')
      ) {
        // "Dies" triggers look back in time: the ability triggers from the graveyard card.
        const card = moved ?? null;
        movedDef.abilities.forEach((a, i) => {
          if (a.kind !== 'triggered' || a.trigger.on !== 'dies') return;
          const controller = card?.owner ?? 'p1';
          if (card) queue(ctx, card, i, controller);
        });
      }
      return;
    }
    case 'spellCast': {
      const spellObj = obj(ctx, ev.id);
      const spell = defOf(ctx, spellObj.defId);
      const item = s.stack.find((x) => x.id === ev.id);
      forEachBattlefieldTrigger(
        ctx,
        (o, a) =>
          a.trigger.on === 'castSpell' &&
          o.controller === ev.player &&
          spellMatches(ctx, a.trigger, spell, item, o),
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
      return;
    }
    case 'damageDealt': {
      if (!ev.combat || !('player' in ev.to)) return;
      const src = s.objects[ev.source];
      if (!src || src.zone !== 'battlefield') return;
      def(ctx, src.id).abilities.forEach((a, i) => {
        if (a.kind === 'triggered' && a.trigger.on === 'combatDamageToPlayer')
          queue(ctx, src, i, src.controller);
      });
      return;
    }
    case 'stepChanged': {
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

export function triggeredAbility(ctx: Ctx, defId: string, index: number): Triggered {
  const a = defOf(ctx, defId).abilities[index];
  if (!a || a.kind !== 'triggered') throw new Error(`No triggered ability ${defId}#${index}`);
  return a;
}
