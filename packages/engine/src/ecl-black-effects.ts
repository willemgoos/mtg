import { cardMatches, matchesFilter } from './characteristics.ts';
import {
  type Ctx,
  addCounters,
  type CustomEffect,
  createObject,
  def,
  defOf,
  emit,
  moveObject,
  obj,
} from './context.ts';
import { changeLife, plusFoodTokens } from './effects.ts';
import { type Chooser, CHOOSERS } from './stx-13c-a-effects.ts';
import type { EffectDef, EffectSource, ObjectId, ObjectRef, PlayerId } from './types.ts';

/**
 * Lorwyn Eclipsed (18b, black): one-off effects of the black cards, as custom effects, and the
 * choosers behind `chooseCustom`. (The triggers, the draw lock and the other engine hooks are marked
 * `// Lorwyn Eclipsed (18b, black)` where they sit.)
 */

const custom = (handler: string, params?: Record<string, unknown>): EffectDef => ({
  kind: 'custom',
  handler,
  ...(params ? { params } : {}),
});

/** Mornsong Aria: "Players can't draw cards." */
export function drawPrevented(ctx: Ctx): boolean {
  return ctx.s.battlefield.some((id) =>
    def(ctx, id).abilities.some((a) => a.kind === 'static' && a.effect.kind === 'playersCantDraw'),
  );
}

/** Puts a token copy of this (possibly gone) object onto the battlefield under the effect's controller. */
function copyToken(ctx: Ctx, es: EffectSource, ref: ObjectRef): void {
  const o = ctx.s.objects[ref.id];
  if (!o) return;
  const t = createObject(ctx, o.defId, es.controller, 'battlefield', true);
  if (o.copyPT) t.copyPT = { ...o.copyPT };
  if (o.nonlegendary) t.nonlegendary = true;
  ctx.s.battlefield.push(t.id);
  // "Enters with" abilities of the copied creature work for the token too.
  const d = defOf(ctx, t.defId);
  if (d.entersWithCounters) addCounters(ctx, t.id, d.entersWithCounters);
  for (const [k, v] of Object.entries(d.entersWithNamedCounters ?? {}))
    (t.counters ??= {})[k] = (t.counters[k] ?? 0) + v;
  emit(ctx, { type: 'objectMoved', id: t.id, defId: t.defId, from: null, to: 'battlefield' });
  plusFoodTokens(ctx, es.controller); // Tippy-Toe
}

export const ECL_BLACK_EFFECTS: Record<string, CustomEffect> = {
  /** Mornsong Aria: "that player loses 3 life" (the player whose draw step it is). */
  eclActivePlayerLosesLife(ctx, _es, params) {
    const amount = (params as { amount: number }).amount;
    changeLife(ctx, ctx.s.turn.activePlayer, -amount);
  },

  /**
   * Perfect Intimidation: "Remove all counters from target creature." `target` is the index of the creature among the
   * chosen targets (the mode builder shifts it when the other mode is chosen too).
   */
  eclRemoveAllCounters(ctx, es, params) {
    const i = (params as { target: number }).target;
    const t = es.targets[i];
    if (!t || !('object' in t)) return;
    const o = ctx.s.objects[t.object.id];
    if (!o || o.zone !== 'battlefield' || o.zcc !== t.object.zcc) return;
    o.plusOneCounters = 0;
    delete o.counters;
  },

  /** Bloodline Bidding: "Return all creature cards of the chosen type from your graveyard to the battlefield." */
  eclReturnChosenType(ctx, es) {
    const spell = es.source && ctx.s.objects[es.source.id];
    const type = spell?.chosenType;
    if (!type) return;
    const all = [...ctx.s.players[es.controller].graveyard].filter((id) =>
      cardMatches(ctx, id, { types: ['Creature'], subtype: type }),
    );
    for (const id of all) moveObject(ctx, id, 'battlefield', { controller: es.controller });
  },

  /** Twilight Diviner: a token that's a copy of the chosen creature. */
  eclCopyCreature(ctx, es, params) {
    copyToken(ctx, es, (params as { ref: ObjectRef }).ref);
  },

  /** Taster of Wares: the opponent shows these cards (a 'cardsRevealed' event). */
  eclRevealCards(ctx, _es, params) {
    const ids = (params as { ids: ObjectId[] }).ids;
    const first = ctx.s.objects[ids[0]!];
    if (!first) return;
    emit(ctx, {
      type: 'cardsRevealed',
      player: first.owner,
      cards: ids.map((id) => ({ id, defId: obj(ctx, id).defId })),
    });
  },
};

const ECL_BLACK_CHOOSERS: Record<string, Chooser> = {
  /**
   * Taster of Wares: "target opponent reveals X cards from their hand, where X is the number of Goblins you
   * control. You choose one of those cards. That player exiles it. If an instant or sorcery card is exiled this way,
   * you may cast it for as long as you control this creature, and mana of any type can be spent to cast that spell."
   * The opponent picks the cards to reveal one at a time (`left` more, `picked` so far); then the controller chooses.
   */
  eclTasterReveal(ctx, es, params) {
    const t = es.targets[0];
    if (!t || !('player' in t)) return null;
    const opp: PlayerId = t.player;
    const hand = ctx.s.players[opp].hand;
    const p = (params ?? {}) as { left?: number; picked?: ObjectId[] };
    const picked = p.picked ?? [];
    const x =
      p.left ??
      Math.min(
        ctx.s.battlefield.filter(
          (id) =>
            obj(ctx, id).controller === es.controller &&
            matchesFilter(ctx, id, { subtype: 'Goblin' }),
        ).length,
        hand.length,
      );
    if (x <= 0) return null;
    const choose = (ids: ObjectId[]): EffectDef[] => [
      custom('eclRevealCards', { ids }),
      {
        kind: 'chooseFromOpponentHand',
        then: 'exile',
        castable: true,
        castableWhileControlling: true,
        castableFilter: { types: ['Instant', 'Sorcery'] },
        among: ids,
      },
    ];
    // Everything they hold is revealed: nothing to pick.
    if (picked.length === 0 && x >= hand.length)
      return {
        player: opp,
        title: `${defOf(ctx, es.sourceDefId).name}: reveal your hand`,
        options: [{ label: `Reveal your hand (${hand.length} cards)`, effects: choose([...hand]) }],
      };
    const total = picked.length + x;
    return {
      player: opp,
      title: `${defOf(ctx, es.sourceDefId).name}: reveal a card (${picked.length + 1} of ${total})`,
      options: hand
        .filter((id) => !picked.includes(id))
        .map((id) => ({
          label: def(ctx, id).name,
          effects:
            x === 1
              ? choose([...picked, id])
              : [
                  {
                    kind: 'chooseCustom',
                    handler: 'eclTasterReveal',
                    params: { left: x - 1, picked: [...picked, id] },
                  } as EffectDef,
                ],
        })),
    };
  },

  /**
   * Twilight Diviner: "create a token that's a copy of one of them". With one creature the token is made right away
   * (no question to ask); with several the controller picks.
   */
  eclDivinerCopy(ctx, es) {
    const refs = (es.subjects ?? (es.subject ? [es.subject] : [])).filter(
      (r) => !!ctx.s.objects[r.id],
    );
    if (refs.length === 0) return null;
    if (refs.length === 1) {
      copyToken(ctx, es, refs[0]!);
      return null;
    }
    return {
      title: `${defOf(ctx, es.sourceDefId).name}: copy which creature?`,
      options: refs.map((ref) => ({
        label: def(ctx, ref.id).name,
        effects: [custom('eclCopyCreature', { ref })],
      })),
    };
  },
};
Object.assign(CHOOSERS, ECL_BLACK_CHOOSERS);
