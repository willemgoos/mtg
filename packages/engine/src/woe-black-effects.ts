import { type Ctx, type CustomEffect, def, defOf, moveObject, obj } from './context.ts';
import { manaValue } from './cost.ts';
import { changeLife } from './effects.ts';
import { type Chooser, CHOOSERS } from './stx-13c-a-effects.ts';
import type { EffectDef, GameObject, ObjectId, PlayerId } from './types.ts';

/**
 * Wilds of Eldraine (23b, black): one-off engine pieces of the black cards. Ashiok, Wicked Manipulator's replacement
 * effect ("if you would pay life while your library has at least that many cards in it, exile that many cards from the top of
 * your library instead", `payLife` below, used wherever the engine pays life as a cost), the custom effects and choosers
 * behind Back for Seconds, Rowan's Grim Search and Ashiok's abilities, and Faerie Fencing's "if you controlled a Faerie as you
 * cast this spell" (noted as the spell is cast). The hooks sit where they are used, marked `// Wilds of Eldraine (23b black)`.
 */

const custom = (handler: string, params?: Record<string, unknown>): EffectDef => ({
  kind: 'custom',
  handler,
  ...(params ? { params } : {}),
});

// ---------------------------------------------------------------------------
// Paying life (Ashiok, Wicked Manipulator)
// ---------------------------------------------------------------------------

/** Does a permanent `player` controls say "if you would pay life while your library has at least that many cards, exile ..."? */
function exilesInsteadOfPayingLife(ctx: Ctx, player: PlayerId): boolean {
  return ctx.s.battlefield.some(
    (id) =>
      obj(ctx, id).controller === player &&
      def(ctx, id).abilities.some(
        (a) => a.kind === 'static' && a.effect.kind === 'woePayLifeExilesLibrary',
      ),
  );
}

/**
 * `player` pays `amount` life (a cost, not a loss: "pay N life"). While they control Ashiok, Wicked Manipulator and their library
 * has at least that many cards, they exile that many cards from the top of it instead (not optional, not split with life). The
 * engine checks that they could pay the life total first, as the rules do (Ashiok doesn't change that).
 */
export function payLife(ctx: Ctx, player: PlayerId, amount: number): void {
  if (amount <= 0) return;
  const lib = ctx.s.players[player].library;
  if (lib.length >= amount && exilesInsteadOfPayingLife(ctx, player)) {
    for (const id of lib.slice(0, amount)) moveObject(ctx, id, 'exile');
    return;
  }
  changeLife(ctx, player, -amount);
}

// ---------------------------------------------------------------------------
// Faerie Fencing: "if you controlled a Faerie as you cast this spell"
// ---------------------------------------------------------------------------

/** Called as a spell is cast (all costs paid): notes whether its caster controlled a Faerie. */
export function noteWoeCast(ctx: Ctx, player: PlayerId, spell: GameObject): void {
  const faerie = ctx.s.battlefield.some(
    (id) =>
      obj(ctx, id).controller === player &&
      defOf(ctx, obj(ctx, id).defId).types.includes('Creature') &&
      def(ctx, id).subtypes.includes('Faerie'),
  );
  if (faerie) spell.controlledFaerieAtCast = true;
  else delete spell.controlledFaerieAtCast;
}

export const WOE_BLACK_CONDITIONS: Record<
  string,
  (
    ctx: Ctx,
    controller: PlayerId,
    self: GameObject | undefined,
    subject: GameObject | undefined,
  ) => boolean
> = {
  /** Faerie Fencing: the caster controlled a Faerie as they cast it (it doesn't matter whether they still do). */
  woeFaerieAtCast: (_ctx, _p, self) => !!self?.controlledFaerieAtCast,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** The cards chosen as targets that are still in the graveyard they were chosen in. */
function graveyardTargets(ctx: Ctx, es: Parameters<CustomEffect>[1]): ObjectId[] {
  const out: ObjectId[] = [];
  for (const t of es.targets) {
    if (!t || !('object' in t)) continue;
    const o = ctx.s.objects[t.object.id];
    if (o && o.zone === 'graveyard' && o.zcc === t.object.zcc && !out.includes(o.id))
      out.push(o.id);
  }
  return out;
}

/** The mana value of a card (its printed mana cost; X counts as 0). */
const mv = (ctx: Ctx, id: ObjectId): number => manaValue(defOf(ctx, obj(ctx, id).defId).manaCost);

export const WOE_BLACK_EFFECTS: Record<string, CustomEffect> = {
  /** Back for Seconds: the target creature cards go to their owner's hand ... */
  woeBackReturn(ctx, es, params) {
    const except = (params as { except?: ObjectId } | undefined)?.except;
    for (const id of graveyardTargets(ctx, es)) {
      if (id === except) moveObject(ctx, id, 'battlefield', { controller: es.controller });
      else moveObject(ctx, id, 'hand');
    }
  },

  /** Rowan's Grim Search: the cards looked at that weren't put back go to the graveyard, the ones put back on top in order. */
  woeRowanFinish(ctx, es, params) {
    const p = params as { ids: ObjectId[]; picked: ObjectId[] };
    const lib = ctx.s.players[es.controller].library;
    const still = (id: ObjectId) => ctx.s.objects[id]?.zone === 'library';
    for (const id of p.ids)
      if (!p.picked.includes(id) && still(id)) moveObject(ctx, id, 'graveyard');
    // Put back first-picked on top: take them out and put them on the front in reverse.
    const back = p.picked.filter(still);
    for (const id of back) lib.splice(lib.indexOf(id), 1);
    lib.unshift(...back);
  },

  /** Ashiok, Wicked Manipulator +1: exile one of the cards looked at, the other goes into hand. */
  woeAshiokTake(ctx, _es, params) {
    const p = params as { exile: ObjectId; hand?: ObjectId };
    if (ctx.s.objects[p.exile]?.zone === 'library') moveObject(ctx, p.exile, 'exile');
    if (p.hand !== undefined && ctx.s.objects[p.hand]?.zone === 'library')
      moveObject(ctx, p.hand, 'hand');
  },

  /** Ashiok, Wicked Manipulator −7: "Target player exiles the top X cards of their library, where X is the total mana value of cards you own in exile." */
  woeAshiokUltimate(ctx, es) {
    const t = es.targets[0];
    if (!t || !('player' in t)) return;
    let x = 0;
    for (const pid of ['p1', 'p2'] as const)
      for (const id of ctx.s.players[pid].exile)
        if (obj(ctx, id).owner === es.controller) x += mv(ctx, id);
    for (const id of ctx.s.players[t.player].library.slice(0, x)) moveObject(ctx, id, 'exile');
  },
};

// ---------------------------------------------------------------------------
// Choosers (`chooseCustom`)
// ---------------------------------------------------------------------------

const WOE_BLACK_CHOOSERS: Record<string, Chooser> = {
  /**
   * Back for Seconds, bargained: "you may put one of those cards with mana value 4 or less onto the battlefield instead of putting
   * it into your hand." With no such card (or no target left) they just go to hand; otherwise the player picks one, or none.
   */
  woeBackForSeconds(ctx, es) {
    const targets = graveyardTargets(ctx, es);
    const eligible = targets.filter((id) => mv(ctx, id) <= 4);
    if (eligible.length === 0) {
      WOE_BLACK_EFFECTS.woeBackReturn!(ctx, es, undefined);
      return null;
    }
    return {
      title: 'put a card onto the battlefield?',
      options: [
        ...eligible.map((id) => ({
          label: `Put ${defOf(ctx, obj(ctx, id).defId).name} onto the battlefield`,
          effects: [custom('woeBackReturn', { except: id })],
        })),
        { label: 'Put them into your hand', effects: [custom('woeBackReturn')] },
      ],
    };
  },

  /**
   * Rowan's Grim Search, bargained: "look at the top four cards of your library, then put up to two of them back on top of your
   * library in any order and the rest into your graveyard." The cards are chosen one at a time, the first being the top card.
   */
  woeRowanTop(ctx, es, params) {
    const p = (params ?? {}) as { ids?: ObjectId[]; picked?: ObjectId[] };
    const lib = ctx.s.players[es.controller].library;
    const ids = p.ids ?? lib.slice(0, 4);
    const picked = p.picked ?? [];
    if (ids.length === 0) return null;
    const rest = ids.filter((id) => !picked.includes(id));
    const finish = (list: ObjectId[]): EffectDef[] => [
      custom('woeRowanFinish', { ids, picked: list }),
    ];
    const name = (id: ObjectId) => defOf(ctx, obj(ctx, id).defId).name;
    const done = {
      label:
        picked.length === 0
          ? 'Put none back (all go to your graveyard)'
          : 'Done (the rest go to your graveyard)',
      effects: finish(picked),
    };
    // Up to two: after the second, or with nothing left to choose, they are put back as chosen.
    if (picked.length >= 2 || rest.length === 0) {
      WOE_BLACK_EFFECTS.woeRowanFinish!(ctx, es, { ids, picked });
      return null;
    }
    return {
      title: `put ${picked.length === 0 ? 'the top card' : 'the next card'} back on top of your library`,
      options: [
        ...rest.map((id) => ({
          label: `${picked.length === 0 ? 'On top' : 'Next'}: ${name(id)}`,
          effects:
            picked.length + 1 >= 2 || rest.length === 1
              ? finish([...picked, id])
              : [
                  {
                    kind: 'chooseCustom',
                    handler: 'woeRowanTop',
                    params: { ids, picked: [...picked, id] },
                  } as EffectDef,
                ],
        })),
        done,
      ],
    };
  },

  /**
   * Ashiok, Wicked Manipulator +1: "Look at the top two cards of your library. Exile one of them and put the other into your
   * hand." With one card, it is exiled.
   */
  woeAshiokLook(ctx, es) {
    const top = ctx.s.players[es.controller].library.slice(0, 2);
    if (top.length === 0) return null;
    const name = (id: ObjectId) => defOf(ctx, obj(ctx, id).defId).name;
    return {
      title: 'exile one of the top two cards',
      options: top.map((id) => {
        const rest = top.find((x) => x !== id);
        return {
          label:
            rest === undefined
              ? `Exile ${name(id)}`
              : `Exile ${name(id)}, put ${name(rest)} into your hand`,
          effects: [
            custom('woeAshiokTake', { exile: id, ...(rest !== undefined ? { hand: rest } : {}) }),
          ],
        };
      }),
    };
  },
};
Object.assign(CHOOSERS, WOE_BLACK_CHOOSERS);
