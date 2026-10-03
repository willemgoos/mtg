import { characteristics, creaturesOnBattlefield } from './characteristics.ts';
import {
  type Ctx,
  type CustomEffect,
  addCounters,
  createObject,
  def,
  defOf,
  emit,
  moveObject,
  newTimestamp,
  obj,
  other,
} from './context.ts';
import { manaValue } from './cost.ts';
import { useShield } from './effects.ts';
import type { EffectSource } from './effects.ts';
import { shuffleInPlace } from './rng.ts';
import { type Chooser, CHOOSERS } from './stx-13c-a-effects.ts';
import type { EffectDef, ObjectId, PlayerId } from './types.ts';

/**
 * Strixhaven Brawl (15b, multicolour, colourless and land cards): one-offs as
 * custom effects, and the chooser behind Duneblast.
 */

export const SIEGE_RHINO = 'siege-rhino';
export const SOC_15B_MULTI_ELEMENTAL = 'soc-15b-multi-elemental';

/** "Next end step": the turn number from which a delayed trigger may fire. */
const nextEndStepTurn = (ctx: Ctx): number =>
  ctx.s.turn.number + (ctx.s.turn.step === 'end' || ctx.s.turn.step === 'cleanup' ? 1 : 0);

/** A card or token put onto the battlefield without being cast. */
function enterBattlefield(
  ctx: Ctx,
  defId: string,
  controller: PlayerId,
  isToken: boolean,
): ObjectId {
  const o = createObject(ctx, defId, controller, 'battlefield', isToken);
  ctx.s.battlefield.push(o.id);
  emit(ctx, { type: 'objectMoved', id: o.id, defId, from: null, to: 'battlefield' });
  return o.id;
}

/** Destroys a permanent as an effect would (indestructible and regeneration shields respected). */
function destroy(ctx: Ctx, id: ObjectId): boolean {
  if (characteristics(ctx, id).keywords.has('indestructible')) return false;
  if (useShield(ctx, id)) return false;
  moveObject(ctx, id, 'graveyard');
  return true;
}

function targetOnBattlefield(ctx: Ctx, es: EffectSource, n: number): ObjectId | undefined {
  const t = es.targets[n];
  if (!t || !('object' in t)) return undefined;
  const o = ctx.s.objects[t.object.id];
  return o && o.zone === 'battlefield' && o.zcc === t.object.zcc ? o.id : undefined;
}

export const BRAWL_15B_MULTI_EFFECTS: Record<string, CustomEffect> = {
  /** Call the Crash: conjure two cards named Siege Rhino onto the battlefield. */
  callTheCrash(ctx, es) {
    for (let i = 0; i < 2; i++) enterBattlefield(ctx, SIEGE_RHINO, es.controller, false);
  },
  /**
   * Vesuvan Mist (kicked): conjure a duplicate of the target nontoken permanent's card into your hand;
   * it perpetually gains "You may spend mana as though it were mana of any color to cast this spell."
   */
  vesuvanConjure(ctx, es) {
    const id = targetOnBattlefield(ctx, es, 0);
    const src = id && ctx.s.objects[id];
    if (!src || src.isToken) return;
    const dup = createObject(ctx, src.defId, es.controller, 'hand');
    ctx.s.players[es.controller].hand.push(dup.id);
    dup.anyMana = true;
    emit(ctx, { type: 'objectMoved', id: dup.id, defId: dup.defId, from: null, to: 'hand' });
  },
  /** Duneblast: destroy all creatures except the chosen one (params.keep, or none). */
  duneblast(ctx, _es, params) {
    const keep = (params as { keep?: ObjectId } | undefined)?.keep;
    for (const o of [...creaturesOnBattlefield(ctx)]) if (o.id !== keep) destroy(ctx, o.id);
  },
  /** Ruinous Ultimatum: destroy all nonland permanents your opponents control. */
  ruinousUltimatum(ctx, es) {
    for (const id of [...ctx.s.battlefield]) {
      if (obj(ctx, id).controller === es.controller || def(ctx, id).types.includes('Land'))
        continue;
      destroy(ctx, id);
    }
  },
  /**
   * Fractured Identity: exile the target nonland permanent; each player other than its controller
   * creates a token that's a copy of it.
   */
  fracturedIdentity(ctx, es) {
    const id = targetOnBattlefield(ctx, es, 0);
    const o = id && ctx.s.objects[id];
    if (!o || def(ctx, o.id).types.includes('Land')) return;
    const { defId, controller } = o;
    moveObject(ctx, o.id, 'exile');
    // Two players: the one who didn't control it.
    enterBattlefield(ctx, defId, other(controller), true);
  },
  /**
   * Dispersal: each opponent returns a nonland permanent they control with the greatest mana value among
   * permanents they control to its owner's hand (ties: the first one).
   */
  dispersal(ctx, es) {
    const victim = other(es.controller);
    const mine = ctx.s.battlefield.filter((id) => obj(ctx, id).controller === victim);
    const greatest = mine.reduce((n, id) => Math.max(n, manaValue(def(ctx, id).manaCost)), 0);
    const pick = mine.find(
      (id) => !def(ctx, id).types.includes('Land') && manaValue(def(ctx, id).manaCost) === greatest,
    );
    if (pick) moveObject(ctx, pick, 'hand');
  },
  /** Escape to the Wilds: you may play an additional land this turn. */
  extraLandThisTurn(ctx, es) {
    ctx.s.players[es.controller].landsPlayedThisTurn--;
  },
  /** Restless Cottage: until end of turn it becomes a 4/4 Horror creature (still a land). */
  restlessCottageAnimate(ctx, es) {
    const self = es.source && ctx.s.objects[es.source.id];
    if (!self || self.zone !== 'battlefield') return;
    self.addedSubtypes = [...(self.addedSubtypes ?? []), 'Horror'];
    ctx.s.effects.push({
      timestamp: newTimestamp(ctx),
      affected: { id: self.id, zcc: self.zcc },
      power: 0,
      toughness: 0,
      keywords: [],
      becomesCreature: true,
      basePT: [4, 4],
      expires: 'endOfTurn',
    });
  },
  /** The World Tree: search your library for any number of God cards and put them onto the battlefield. */
  worldTreeGods(ctx, es) {
    const p = ctx.s.players[es.controller];
    for (const id of [...p.library])
      if (def(ctx, id).subtypes.includes('God'))
        moveObject(ctx, id, 'battlefield', { controller: es.controller });
    shuffleInPlace(ctx.s.rng, p.library);
  },
  /** Lagomos: a 2/1 red Elemental with trample and haste; sacrifice it at the beginning of the next end step. */
  lagomosElemental(ctx, es) {
    const id = enterBattlefield(ctx, SOC_15B_MULTI_ELEMENTAL, es.controller, true);
    (ctx.s.delayed ??= []).push({
      controller: es.controller,
      sourceDefId: es.sourceDefId,
      subject: { id, zcc: obj(ctx, id).zcc },
      effects: [{ kind: 'sacrifice', what: 'subject' }],
      fromTurn: nextEndStepTurn(ctx),
    });
  },
  /**
   * Ochre Jelly: when it dies with two or more +1/+1 counters, create a token copy of it at the beginning of
   * the next end step, entering with half that many counters (rounded down).
   */
  ochreJellyDies(ctx, es) {
    const o = es.source && ctx.s.objects[es.source.id];
    const had = o?.lastCounters ?? 0;
    if (!o || had < 2) return;
    (ctx.s.delayed ??= []).push({
      controller: es.controller,
      sourceDefId: es.sourceDefId,
      subject: es.source!,
      effects: [
        {
          kind: 'custom',
          handler: 'ochreJellyToken',
          params: { defId: o.defId, counters: Math.floor(had / 2) },
        },
      ],
      fromTurn: nextEndStepTurn(ctx),
    });
  },
  ochreJellyToken(ctx, es, params) {
    const { defId, counters } = params as { defId: string; counters: number };
    const t = createObject(ctx, defId, es.controller, 'battlefield', true);
    addCounters(ctx, t.id, counters);
    ctx.s.battlefield.push(t.id);
    emit(ctx, { type: 'objectMoved', id: t.id, defId, from: null, to: 'battlefield' });
  },
};

const BRAWL_15B_MULTI_CHOOSERS: Record<string, Chooser> = {
  /** Duneblast: "Choose up to one creature. Destroy the rest." */
  duneblast(ctx, es) {
    const creatures = creaturesOnBattlefield(ctx);
    if (creatures.length === 0) return null;
    // Your own creatures first, the strongest first.
    const rank = (id: ObjectId) =>
      (obj(ctx, id).controller === es.controller ? 1000 : 0) + characteristics(ctx, id).power;
    const options: { label: string; effects: EffectDef[] }[] = [...creatures]
      .sort((a, b) => rank(b.id) - rank(a.id))
      .map((o) => ({
        label: `Keep ${defOf(ctx, o.defId).name}${o.controller === es.controller ? '' : ' (opponent)'}`,
        effects: [{ kind: 'custom', handler: 'duneblast', params: { keep: o.id } }],
      }));
    options.push({
      label: 'Destroy every creature',
      effects: [{ kind: 'custom', handler: 'duneblast' }],
    });
    return { title: 'Duneblast: choose up to one creature to keep', options };
  },
};
Object.assign(CHOOSERS, BRAWL_15B_MULTI_CHOOSERS);
