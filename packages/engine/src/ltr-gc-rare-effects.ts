import { isCreature, matchesFilter, subtypesOf } from './characteristics.ts';
import { type Ctx, type CustomEffect, def, emit, moveObject, obj } from './context.ts';
import { manaValue } from './cost.ts';
import { runEffect, sendToBottomRandom } from './effects.ts';
import { queue } from './triggers.ts';
import type {
  CardFilter,
  EffectDef,
  EffectSource,
  GameEvent,
  ObjectId,
  PlayerId,
} from './types.ts';

/**
 * The Lord of the Rings (21d, green and colorless rares): the one-off engine pieces of the green and colorless rares of the
 * random slot. The hooks that call these are marked `// Lord of the Rings (21d gc-rare)` where they sit. See "Phase 21d: green and
 * colorless rares" in docs/lord-of-the-rings-plan.md.
 */

const custom = (handler: string, params?: Record<string, unknown>): EffectDef => ({
  kind: 'custom',
  handler,
  ...(params ? { params } : {}),
});

/** Custom effects that turn into other effects when they come up (a prompt built from the state the earlier effects left). */
type Expander = (
  ctx: Ctx,
  es: EffectSource,
  params: Record<string, unknown> | undefined,
) => EffectDef[];

const LEGENDARY_CREATURE: CardFilter = { types: ['Creature'], supertypes: ['Legendary'] };

/** Does this card share a creature type with a creature `controller` controls? (A changeling shares with every creature.) */
function sharesTypeWithYours(ctx: Ctx, card: ObjectId, controller: PlayerId): boolean {
  const mine = subtypesOf(ctx, card);
  const changelingCard = def(ctx, card).keywords.includes('changeling');
  for (const id of ctx.s.battlefield) {
    if (obj(ctx, id).controller !== controller || !isCreature(ctx, id)) continue;
    if (def(ctx, id).keywords.includes('changeling')) {
      if (changelingCard || mine.length > 0) return true;
      continue;
    }
    if (changelingCard) {
      if (subtypesOf(ctx, id).length > 0) return true;
      continue;
    }
    if (subtypesOf(ctx, id).some((t) => mine.includes(t))) return true;
  }
  return false;
}

/**
 * The card filters of this group (called from `cardMatches` / `matchesFilter`): false means the card is out. `ltrNoSharedType`
 * (Radagast the Brown) reads the card's controller, or its owner when it is in a library.
 */
export function ltrGcRareFilterFails(ctx: Ctx, id: ObjectId, filter: CardFilter): boolean {
  if (filter.ltrExceptIds?.includes(id)) return true;
  if (filter.ltrNoSharedType) {
    const o = obj(ctx, id);
    if (sharesTypeWithYours(ctx, id, o.zone === 'battlefield' ? o.controller : o.owner))
      return true;
  }
  return false;
}

/** Fangorn, Tree Shepherd: "You don't lose unspent green mana as steps and phases end." */
export function ltrKeepsGreenMana(ctx: Ctx, player: PlayerId): boolean {
  return ctx.s.battlefield.some(
    (id) =>
      obj(ctx, id).controller === player &&
      def(ctx, id).abilities.some(
        (a) => a.kind === 'static' && a.effect.kind === 'ltrKeepGreenMana',
      ),
  );
}

/** Phial of Galadriel: "If you would draw a card while you have no cards in hand, draw two cards instead." */
export function ltrDrawsTwice(ctx: Ctx, player: PlayerId): boolean {
  return (
    ctx.s.players[player].hand.length === 0 &&
    ctx.s.battlefield.some(
      (id) =>
        obj(ctx, id).controller === player &&
        def(ctx, id).abilities.some(
          (a) => a.kind === 'static' && a.effect.kind === 'ltrDrawTwiceEmptyHand',
        ),
    )
  );
}

/**
 * Sting, the Glinting Dagger: the keywords an Equipment grants only while the creature is blocking or blocked by a creature
 * matching a filter. `blockedBy` is every creature on the other side of the creature in combat.
 */
export function ltrCombatOpponents(ctx: Ctx, id: ObjectId): ObjectId[] {
  const combat = ctx.s.combat;
  if (!combat) return [];
  const asAttacker = combat.attackers.find((a) => a.id === id);
  if (asAttacker) return asAttacker.blockers.filter((b) => !!ctx.s.objects[b]);
  return combat.attackers.filter((a) => a.blockers.includes(id)).map((a) => a.id);
}

export function ltrCombatKeywordsApply(ctx: Ctx, id: ObjectId, filter: CardFilter): boolean {
  return ltrCombatOpponents(ctx, id).some((other) => matchesFilter(ctx, other, filter));
}

// ---------------------------------------------------------------------------
// Custom effects
// ---------------------------------------------------------------------------

export const LTR_GC_RARE_EFFECTS: Record<string, CustomEffect> = {
  /** The One Ring: "you gain protection from everything until your next turn" (cleared as their next turn begins). */
  ltrProtection(ctx, es) {
    ctx.s.players[es.controller].ltrProtected = true;
  },

  /**
   * The Ring Goes South, after the Ring has tempted you: "reveal cards from the top of your library until you reveal X land
   * cards, where X is the number of legendary creatures you control. Put those land cards onto the battlefield tapped and the
   * rest on the bottom of your library in a random order." (A library with fewer lands: all of it is revealed.)
   */
  ltrRingGoesSouth(ctx, es) {
    const p = es.controller;
    const x = ctx.s.battlefield.filter(
      (id) => obj(ctx, id).controller === p && matchesFilter(ctx, id, LEGENDARY_CREATURE),
    ).length;
    const lib = ctx.s.players[p].library;
    const revealed: ObjectId[] = [];
    const lands: ObjectId[] = [];
    for (let i = 0; i < lib.length && lands.length < x; i++) {
      const id = lib[i]!;
      revealed.push(id);
      emit(ctx, { type: 'revealed', player: p, id });
      if (def(ctx, id).types.includes('Land')) lands.push(id);
    }
    for (const id of lands) {
      moveObject(ctx, id, 'battlefield', { controller: p });
      const o = ctx.s.objects[id];
      if (o && o.zone === 'battlefield') o.tapped = true;
    }
    sendToBottomRandom(
      ctx,
      p,
      revealed.filter((id) => !lands.includes(id)),
    );
  },

  /**
   * Palantír of Orthanc, when the opponent doesn't let you draw: "you mill X cards, where X is the number of influence counters
   * on Palantír of Orthanc, and that player loses life equal to the total mana value of those cards." (Target 0 is the opponent.)
   */
  ltrPalantirMill(ctx, es) {
    const src = es.source && ctx.s.objects[es.source.id];
    const x = src && src.zone === 'battlefield' ? (src.counters?.influence ?? 0) : 0;
    const top = ctx.s.players[es.controller].library.slice(0, x);
    runEffect(ctx, es, { kind: 'mill', count: x });
    const total = top.reduce(
      (n, id) =>
        ctx.s.objects[id]?.zone === 'graveyard' ? n + manaValue(def(ctx, id).manaCost) : n,
      0,
    );
    if (total > 0) runEffect(ctx, es, { kind: 'loseLife', who: { target: 0 }, amount: total });
  },

  /** Last March of the Ents: these creature cards (still in your hand) go onto the battlefield together. */
  ltrPutCreaturesOnBattlefield(ctx, es, params) {
    const ids = (params?.ids as ObjectId[] | undefined) ?? [];
    for (const id of ids) {
      const o = ctx.s.objects[id];
      if (o && o.zone === 'hand' && o.owner === es.controller)
        moveObject(ctx, id, 'battlefield', { controller: es.controller });
    }
  },
};

// ---------------------------------------------------------------------------
// Expanders: prompts built when they come up, one choice at a time
// ---------------------------------------------------------------------------

export const LTR_GC_RARE_EXPANDERS: Record<string, Expander> = {
  /**
   * Last March of the Ents: "put any number of creature cards from your hand onto the battlefield". One card at a time (or Done);
   * they all enter together at the end. Cards with the same name are one choice.
   */
  ltrLastMarch(ctx, es, params) {
    const chosen = (params?.chosen as ObjectId[] | undefined) ?? [];
    const put: EffectDef[] = chosen.length
      ? [custom('ltrPutCreaturesOnBattlefield', { ids: chosen })]
      : [];
    const seen = new Set<string>();
    const options: { label: string; effects: EffectDef[] }[] = [];
    for (const id of ctx.s.players[es.controller].hand) {
      if (chosen.includes(id) || !def(ctx, id).types.includes('Creature')) continue;
      const key = obj(ctx, id).defId;
      if (seen.has(key)) continue;
      seen.add(key);
      options.push({
        label: def(ctx, id).name,
        effects: [custom('ltrLastMarch', { chosen: [...chosen, id] })],
      });
    }
    if (options.length === 0) return put;
    return [
      {
        kind: 'choose',
        title: chosen.length
          ? `Put another creature card onto the battlefield (${chosen.length} chosen)`
          : 'Put creature cards from your hand onto the battlefield',
        options: [{ label: 'Done', effects: put }, ...options],
      },
    ];
  },

  /**
   * Mount Doom: "choose up to two creatures, then destroy the rest." One creature at a time (or none / done); every other
   * creature on the battlefield is destroyed at the end.
   */
  ltrMountDoom(ctx, es, params) {
    const chosen = (params?.chosen as ObjectId[] | undefined) ?? [];
    const destroy: EffectDef = {
      kind: 'destroyAll',
      filter: { ltrExceptIds: chosen },
    };
    if (chosen.length >= 2) return [destroy];
    const options = ctx.s.battlefield
      .filter((id) => !chosen.includes(id) && isCreature(ctx, id))
      .map((id) => {
        const o = obj(ctx, id);
        return {
          label: `${def(ctx, id).name} (${o.controller === es.controller ? 'yours' : "opponent's"})`,
          effects: [custom('ltrMountDoom', { chosen: [...chosen, id] })],
        };
      });
    if (options.length === 0) return [destroy];
    return [
      {
        kind: 'choose',
        title: chosen.length
          ? 'Mount Doom: choose another creature to keep'
          : 'Mount Doom: choose up to two creatures to keep; the rest are destroyed',
        options: [
          {
            label: chosen.length ? 'Done: destroy the rest' : 'None: destroy them all',
            effects: [destroy],
          },
          ...options,
        ],
      },
    ];
  },
};

// ---------------------------------------------------------------------------
// Triggers
// ---------------------------------------------------------------------------

/** Fangorn, Tree Shepherd (called from the trigger detection with every event). */
export function detectLtrGcRare(ctx: Ctx, ev: GameEvent): void {
  const s = ctx.s;
  if (ev.type !== 'attackersDeclared') return;
  // "Whenever one or more Treefolk you control attack": once, and the amount is how many attacked.
  const ap: PlayerId = s.turn.activePlayer;
  for (const id of s.battlefield) {
    const o = obj(ctx, id);
    if (o.controller !== ap) continue;
    def(ctx, id).abilities.forEach((a, i) => {
      if (a.kind !== 'triggered' || a.trigger.on !== 'youAttackCounted') return;
      const f = a.trigger.filter;
      const n = ev.attackers.filter((x) => !!s.objects[x] && matchesFilter(ctx, x, f, o.id)).length;
      if (n > 0) queue(ctx, o, i, o.controller, undefined, n);
    });
  }
}
