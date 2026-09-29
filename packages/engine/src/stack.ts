import { power } from './characteristics.ts';
import { type Ctx, defOf, emit, moveObject, newId, obj, tap } from './context.ts';
import { type EffectSource, runEffects } from './effects.ts';
import { planPayment } from './mana.ts';
import { isTargetLegal } from './targets.ts';
import { triggeredAbility } from './triggers.ts';
import type {
  AbilityDef,
  EffectDef,
  ObjectId,
  PendingTrigger,
  PlayerId,
  StackItem,
  TargetChoice,
  TargetSpec,
} from './types.ts';

export function castSpell(
  ctx: Ctx,
  player: PlayerId,
  card: ObjectId,
  targets: TargetChoice[],
  payWith?: ObjectId[],
): void {
  const d = defOf(ctx, obj(ctx, card).defId);
  // Rule 601.2: move to stack, choose targets, then pay costs.
  const payment = planPayment(ctx, player, d.manaCost, payWith);
  moveObject(ctx, card, 'stack', { controller: player });
  ctx.s.stack.push({ kind: 'spell', id: card, controller: player, targets });
  for (const id of payment) tap(ctx, id);
  emit(ctx, { type: 'spellCast', id: card, player });
}

export function activatedAbility(ctx: Ctx, source: ObjectId, index: number) {
  const a = defOf(ctx, obj(ctx, source).defId).abilities[index];
  if (!a || a.kind !== 'activated') throw new Error(`No activated ability ${source}#${index}`);
  return a;
}

export function activateAbility(
  ctx: Ctx,
  player: PlayerId,
  source: ObjectId,
  index: number,
  targets: TargetChoice[],
  payWith?: ObjectId[],
): void {
  const a = activatedAbility(ctx, source, index);
  const src = obj(ctx, source);
  const sourceRef = { id: source, zcc: src.zcc };
  const payment = planPayment(
    ctx,
    player,
    a.cost.mana,
    payWith,
    a.cost.tapSelf ? source : undefined,
  );
  const id = newId(ctx);
  const item: StackItem = {
    kind: 'ability',
    id,
    source: sourceRef,
    sourceDefId: src.defId,
    abilityIndex: index,
    controller: player,
    targets,
  };
  if (a.cost.tapSelf) tap(ctx, source);
  for (const pid of payment) tap(ctx, pid);
  if (a.cost.sacrificeSelf) {
    item.lkiPower = power(ctx, source);
    moveObject(ctx, source, 'graveyard');
  }
  ctx.s.stack.push(item);
  emit(ctx, { type: 'abilityActivated', id, source, player });
}

export function pushTrigger(ctx: Ctx, t: PendingTrigger, targets: TargetChoice[]): void {
  const id = newId(ctx);
  ctx.s.stack.push({
    kind: 'ability',
    id,
    source: t.source,
    sourceDefId: t.sourceDefId,
    abilityIndex: t.abilityIndex,
    controller: t.controller,
    targets,
    ...(t.lkiPower !== undefined ? { lkiPower: t.lkiPower } : {}),
  });
  emit(ctx, { type: 'triggerStacked', id, source: t.source.id, player: t.controller });
}

function abilityOf(
  ctx: Ctx,
  item: Extract<StackItem, { kind: 'ability' }>,
): Exclude<AbilityDef, { kind: 'mana' | 'static' }> {
  const a = defOf(ctx, item.sourceDefId).abilities[item.abilityIndex];
  if (a?.kind === 'triggered') return triggeredAbility(ctx, item.sourceDefId, item.abilityIndex);
  if (a?.kind === 'activated') return a;
  throw new Error(`Bad ability on stack: ${item.sourceDefId}#${item.abilityIndex}`);
}

/**
 * Rechecks targets on resolution (rule 608.2b). Returns null if the spell or
 * ability should fizzle: it had targets and all of them are now illegal.
 */
function checkTargets(
  ctx: Ctx,
  specs: readonly TargetSpec[],
  targets: readonly TargetChoice[],
  controller: PlayerId,
  sourceId: ObjectId | undefined,
): (TargetChoice | null)[] | null {
  const src = sourceId ? { controller, sourceId } : { controller };
  const checked = targets.map((t, i) =>
    specs[i] && isTargetLegal(ctx, specs[i], t, src) ? t : null,
  );
  if (targets.length > 0 && checked.every((t) => t === null)) return null;
  return checked;
}

export function resolveTop(ctx: Ctx): void {
  const item = ctx.s.stack.pop();
  if (!item) throw new Error('Stack is empty');

  if (item.kind === 'spell') {
    const o = obj(ctx, item.id);
    const d = defOf(ctx, o.defId);
    if (d.spell) {
      const targets = checkTargets(ctx, d.spell.targets, item.targets, item.controller, item.id);
      if (!targets) {
        emit(ctx, { type: 'fizzled', id: item.id });
        moveObject(ctx, item.id, 'graveyard');
        return;
      }
      const es: EffectSource = {
        controller: item.controller,
        source: { id: o.id, zcc: o.zcc },
        sourceDefId: o.defId,
        targets,
      };
      runEffects(ctx, es, d.spell.effects);
      emit(ctx, { type: 'resolved', id: item.id });
      moveObject(ctx, item.id, 'graveyard');
      return;
    }
    // Permanent spell.
    emit(ctx, { type: 'resolved', id: item.id });
    moveObject(ctx, item.id, 'battlefield', { controller: item.controller });
    if (d.entersWithCounters) o.plusOneCounters += d.entersWithCounters;
    return;
  }

  const a = abilityOf(ctx, item);
  const targets = checkTargets(ctx, a.targets, item.targets, item.controller, item.source.id);
  if (!targets) {
    emit(ctx, { type: 'fizzled', id: item.id });
    return;
  }
  const es: EffectSource = {
    controller: item.controller,
    source: item.source,
    sourceDefId: item.sourceDefId,
    targets,
    ...(item.lkiPower !== undefined ? { lkiPower: item.lkiPower } : {}),
  };
  runEffects(ctx, es, a.effects as EffectDef[]);
  emit(ctx, { type: 'resolved', id: item.id });
}
