import { characteristics, hasSubtype, matchesFilter } from './characteristics.ts';
import {
  addCounters,
  type Ctx,
  type CustomEffect,
  def,
  moveObject,
  obj,
  sacrifice,
} from './context.ts';
import { canPayFrom, manaSources, payMana, planPayment } from './mana.ts';
import { shuffleInPlace } from './rng.ts';
import { type Chooser, type ChooserResult, CHOOSERS } from './stx-13c-a-effects.ts';
import { forEachBattlefieldTrigger, queue } from './triggers.ts';
import type {
  EffectDef,
  EffectSource,
  GameEvent,
  GameObject,
  ManaCost,
  ObjectId,
  PlayerId,
} from './types.ts';

/**
 * The Lord of the Rings (21b, white and colorless): one-off effects as custom effects, the choosers behind "you may sacrifice
 * ... or pay ... . When you do" (Nimble Hobbit, Shire Shirriff) and Errand-Rider of Gondor, and the triggers Landroval,
 * East-Mark Cavalier and Barrow-Blade need. See "Phase 21b: white" in docs/lord-of-the-rings-plan.md.
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

export const LTR_WHITE_EFFECTS: Record<string, CustomEffect> = {
  /**
   * Bill the Pony: "Until end of turn, target creature you control assigns combat damage equal to its toughness rather than its
   * power."
   */
  ltrToughnessRather(ctx, es) {
    const o = targetOnBattlefield(ctx, es, 0);
    if (!o) return;
    ctx.s.turn.ltrToughnessRather = [...(ctx.s.turn.ltrToughnessRather ?? []), `${o.id}:${o.zcc}`];
  },

  /**
   * Lost to Legend: "Put target nonland historic permanent into its owner's library fourth from the top." (A library with fewer
   * than three other cards: it goes on the bottom.) A token ceases to exist.
   */
  ltrFourthFromTop(ctx, es) {
    const o = targetOnBattlefield(ctx, es, 0);
    if (!o) return;
    const owner = o.owner;
    moveObject(ctx, o.id, 'library', { position: 'top' });
    const lib = ctx.s.players[owner].library;
    const at = lib.indexOf(o.id);
    if (at < 0) return; // a token
    lib.splice(at, 1);
    lib.splice(Math.min(3, lib.length), 0, o.id);
  },

  /**
   * Ent-Draught Basin: "{X}, {T}: Put a +1/+1 counter on target creature with power X." The target must still have power X as the
   * ability resolves (otherwise it is an illegal target and nothing happens).
   */
  ltrPowerXCounter(ctx, es) {
    const o = targetOnBattlefield(ctx, es, 0);
    if (!o) return;
    if (characteristics(ctx, o.id).power !== (es.x ?? 0)) return;
    addCounters(ctx, o.id, 1);
  },

  /** Nimble Hobbit: "pay {2}{W}" (the choice was made; the mana is paid now). */
  ltrPayMana(ctx, es, params) {
    const cost = (params as { cost: ManaCost }).cost;
    payMana(ctx, planPayment(ctx, es.controller, cost, undefined));
  },

  /** Nimble Hobbit, Shire Shirriff: sacrifice the permanent that was chosen (if it is still there). */
  ltrSacrifice(ctx, es, params) {
    const p = params as { id: ObjectId; zcc: number };
    const o = ctx.s.objects[p.id];
    if (!o || o.zone !== 'battlefield' || o.zcc !== p.zcc || o.controller !== es.controller) return;
    sacrifice(ctx, o.id);
  },

  /** Errand-Rider of Gondor: the chosen card from the hand goes on the bottom of its owner's library. */
  ltrHandToBottom(ctx, es, params) {
    const id = (params as { id: ObjectId }).id;
    const o = ctx.s.objects[id];
    if (!o || o.zone !== 'hand' || o.owner !== es.controller) return;
    moveObject(ctx, id, 'library', { position: 'bottom' });
  },

  /**
   * Lembas: "When this artifact is put into a graveyard from the battlefield, its owner shuffles it into their library." (A
   * trigger, so it fails if the card has left the graveyard by then.)
   */
  ltrShuffleSelfIntoLibrary(ctx, es) {
    const src = es.source && ctx.s.objects[es.source.id];
    if (!src || src.zone !== 'graveyard') return;
    const owner = src.owner;
    moveObject(ctx, src.id, 'library', { position: 'top' });
    shuffleInPlace(ctx.s.rng, ctx.s.players[owner].library);
  },
};

// ---------------------------------------------------------------------------
// Choosers
// ---------------------------------------------------------------------------

/** Permanents that look alike are one choice. */
const lookAlike = (ctx: Ctx, id: ObjectId): string => {
  const o = obj(ctx, id);
  return `${o.defId}|${o.isToken ? 1 : 0}|${o.tapped ? 1 : 0}|${o.plusOneCounters}|${JSON.stringify(o.counters ?? {})}|${o.attachedTo ?? ''}`;
};

/** The "you may sacrifice a <thing> or pay <cost>. When you do" choice: one option for each thing, one to pay, one to do neither. */
function sacrificeOrPay(
  ctx: Ctx,
  es: EffectSource,
  pick: (id: ObjectId) => boolean,
  pay: ManaCost | undefined,
  title: string,
): ChooserResult | null {
  const then: EffectDef = { kind: 'reflexiveTrigger', ability: 1 };
  const options: ChooserResult['options'] = [];
  const seen = new Set<string>();
  for (const id of ctx.s.battlefield) {
    const o = obj(ctx, id);
    if (o.controller !== es.controller || !pick(id)) continue;
    const key = lookAlike(ctx, id);
    if (seen.has(key)) continue;
    seen.add(key);
    const c = characteristics(ctx, id);
    const stats = c.types.includes('Creature') ? ` ${c.power}/${c.toughness}` : '';
    options.push({
      label: `Sacrifice ${def(ctx, id).name}${stats}${o.tapped ? ' (tapped)' : ''}`,
      effects: [custom('ltrSacrifice', { id, zcc: o.zcc }), then],
    });
  }
  if (pay && canPayFrom(pay, manaSources(ctx, es.controller))) {
    options.push({
      label: `Pay ${manaText(pay)}`,
      effects: [custom('ltrPayMana', { cost: pay }), then],
    });
  }
  if (options.length === 0) return null;
  options.push({ label: 'Do neither', effects: [] });
  return { title, options };
}

const manaText = (c: ManaCost): string => {
  const colored = Object.entries(c.colored)
    .map(([k, n]) => `{${k}}`.repeat(n ?? 0))
    .join('');
  return `${c.generic ? `{${c.generic}}` : ''}${colored}`;
};

const LTR_WHITE_CHOOSERS: Record<string, Chooser> = {
  /** Nimble Hobbit: "you may sacrifice a Food or pay {2}{W}. When you do, tap target creature an opponent controls." */
  ltrNimbleHobbit: (ctx, es) =>
    sacrificeOrPay(
      ctx,
      es,
      (id) => hasSubtype(ctx, id, 'Food'),
      { generic: 2, colored: { W: 1 } },
      'Nimble Hobbit: sacrifice a Food or pay {2}{W}',
    ),

  /** Shire Shirriff: "you may sacrifice a token. When you do, exile target creature an opponent controls until this creature leaves." */
  ltrShireShirriff: (ctx, es) =>
    sacrificeOrPay(
      ctx,
      es,
      (id) => !!obj(ctx, id).isToken,
      undefined,
      'Shire Shirriff: sacrifice a token',
    ),

  /** Errand-Rider of Gondor: "put a card from your hand on the bottom of your library." */
  ltrBottomCard: (ctx, es) => {
    const options: ChooserResult['options'] = [];
    const seen = new Set<string>();
    for (const id of ctx.s.players[es.controller].hand) {
      const key = obj(ctx, id).defId;
      if (seen.has(key)) continue;
      seen.add(key);
      options.push({
        label: `Put ${def(ctx, id).name} on the bottom`,
        effects: [custom('ltrHandToBottom', { id })],
      });
    }
    return options.length
      ? { title: 'Put a card from your hand on the bottom of your library', options }
      : null;
  },
};
Object.assign(CHOOSERS, LTR_WHITE_CHOOSERS);

// ---------------------------------------------------------------------------
// Triggers
// ---------------------------------------------------------------------------

/** Landroval, East-Mark Cavalier and Barrow-Blade (called from the trigger detection with every event). */
export function detectLtrWhite(ctx: Ctx, ev: GameEvent): void {
  const s = ctx.s;
  switch (ev.type) {
    case 'attackersDeclared': {
      // "Whenever two or more creatures you control attack a player": attackers aimed at a planeswalker don't count.
      const ap: PlayerId = s.turn.activePlayer;
      const attackingAPlayer = (s.combat?.attackers ?? []).filter(
        (x) => !x.planeswalker && !!s.objects[x.id],
      );
      forEachBattlefieldTrigger(ctx, (o, a) => {
        if (a.trigger.on !== 'youAttackWithAtLeast' || o.controller !== ap) return false;
        const t = a.trigger;
        return (
          attackingAPlayer.filter((x) => matchesFilter(ctx, x.id, t.filter, o.id)).length >= t.min
        );
      });
      return;
    }
    case 'damageDealt': {
      // "Whenever this creature deals damage to a Goblin or Orc": the creature that was dealt the damage is the subject.
      if (ev.amount <= 0 || !('object' in ev.to)) return;
      const dealer = s.objects[ev.source];
      const hurt = s.objects[ev.to.object.id];
      if (!dealer || dealer.zone !== 'battlefield' || !hurt || hurt.zone !== 'battlefield') return;
      def(ctx, dealer.id).abilities.forEach((a, i) => {
        if (a.kind !== 'triggered' || a.trigger.on !== 'dealsDamageToCreature') return;
        if (!def(ctx, hurt.id).types.includes('Creature')) return;
        if (!matchesFilter(ctx, hurt.id, a.trigger.filter, dealer.id)) return;
        queue(ctx, dealer, i, dealer.controller, hurt);
      });
      return;
    }
    case 'blockersDeclared': {
      // "Whenever equipped creature blocks or becomes blocked by a creature": once for each creature on the other side.
      for (const b of ev.blocks) {
        const blocker = s.objects[b.blocker];
        const attacker = s.objects[b.attacker];
        if (!blocker || !attacker) continue;
        for (const [equipped, other] of [
          [blocker, attacker],
          [attacker, blocker],
        ] as const)
          forEachBattlefieldTrigger(
            ctx,
            (o, a) => a.trigger.on === 'equippedBlocksOrBlocked' && o.attachedTo === equipped.id,
            other,
          );
      }
      return;
    }
    default:
      return;
  }
}
