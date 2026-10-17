import { power } from './characteristics.ts';
import { type Ctx, type CustomEffect, def, moveObject, obj } from './context.ts';
import { damageSourceFor, dealDamage, millCount } from './effects.ts';
import { canEnchant } from './fra-white-effects.ts';
import { shuffleLibrary } from './setup.ts';
import { attachAura } from './stack.ts';
import type { EffectDef, EffectSource, ObjectId, PlayerId } from './types.ts';

/**
 * Wilds of Eldraine (23b, green): the one-off pieces of the green cards.
 *
 * - `woeShuffle`: "then shuffle" after a look (Thunderous Debut).
 * - `woeExileCardTo`: Sentinel of Lost Lore's two exile modes (a targeted card in exile goes to its owner's hand or the bottom of
 *   its owner's library).
 * - `woeGracefulTakedown`: the creatures chosen deal damage equal to their power to the one target.
 * - `woeBottomOrder` (an expander): Commune with Nature's "put the rest on the bottom of your library in any order", one card at
 *   a time (`woePutBottom`).
 * - `woeFetchQuest` (an expander): Fetch Quest's "mill seven cards, then put a creature, enchantment, or land card from among the
 *   milled cards onto the battlefield" (an Aura goes onto the battlefield attached to something it can enchant).
 * - `woeCombatEmblems`: Feral Encounter's "at the beginning of the next combat phase this turn" (an emblem that goes away once it
 *   has triggered).
 */

const custom = (handler: string, params?: Record<string, unknown>): EffectDef => ({
  kind: 'custom',
  handler,
  ...(params ? { params } : {}),
});

/** The object a target slot names, if it is still the same one. */
function targetId(ctx: Ctx, es: EffectSource, i: number): ObjectId | undefined {
  const t = es.targets[i];
  if (!t || !('object' in t)) return undefined;
  const o = ctx.s.objects[t.object.id];
  return o && o.zcc === t.object.zcc ? o.id : undefined;
}

export const WOE_GREEN_EFFECTS: Record<string, CustomEffect> = {
  /** Shuffle your library. */
  woeShuffle(ctx, es) {
    shuffleLibrary(ctx, es.controller);
  },

  /**
   * Sentinel of Lost Lore: the card target `target` (in exile) goes to its owner's hand ("return target card you own in exile that
   * has an Adventure to your hand") or on the bottom of its owner's library.
   */
  woeExileCardTo(ctx, es, params) {
    const p = params as { target: number; to: 'hand' | 'libraryBottom' };
    const id = targetId(ctx, es, p.target);
    if (!id || ctx.s.objects[id]?.zone !== 'exile') return;
    if (p.to === 'hand') moveObject(ctx, id, 'hand');
    else moveObject(ctx, id, 'library', { position: 'bottom' });
  },

  /**
   * Graceful Takedown: target 0 is the creature you don't control; every other target (the enchanted creatures and the one other
   * creature) deals damage equal to its power to it. A target that is no longer legal deals none.
   */
  woeGracefulTakedown(ctx, es) {
    const victim = targetId(ctx, es, 0);
    if (!victim || ctx.s.objects[victim]?.zone !== 'battlefield') return;
    const sources: ObjectId[] = [];
    for (let i = 1; i < es.targets.length; i++) {
      const id = targetId(ctx, es, i);
      if (id && ctx.s.objects[id]?.zone === 'battlefield') sources.push(id);
    }
    // Their powers are read as the spell resolves, then all the damage is dealt.
    const dealt = sources.map((id) => ({ id, amount: power(ctx, id) }));
    for (const { id, amount } of dealt)
      dealDamage(
        ctx,
        damageSourceFor(ctx, id, es.controller),
        { object: refOf(ctx, victim) },
        amount,
        false,
      );
  },

  /** Fetch Quest: the chosen card from the graveyard onto the battlefield (an Aura attached to `host`). */
  woePutOntoBattlefield(ctx, es, params) {
    const { card, host } = params as { card: ObjectId; host?: ObjectId };
    const zone = () => ctx.s.objects[card]?.zone;
    if (zone() !== 'graveyard') return;
    if (host !== undefined && !canEnchant(ctx, card, host)) return;
    moveObject(ctx, card, 'battlefield', { controller: es.controller });
    if (host !== undefined && zone() === 'battlefield') attachAura(ctx, card, host);
  },

  /** Puts a card on the bottom of its owner's library (the next one chosen goes below it). */
  woePutBottom(ctx, _es, params) {
    const { card } = params as { card: ObjectId };
    if (ctx.s.objects[card]?.zone !== 'library') return;
    moveObject(ctx, card, 'library', { position: 'bottom' });
  },
};

function refOf(ctx: Ctx, id: ObjectId) {
  return { id, zcc: obj(ctx, id).zcc };
}

type Expander = (
  ctx: Ctx,
  es: EffectSource,
  params: Record<string, unknown> | undefined,
) => EffectDef[];

/** Custom effects that turn into other effects when they come up. */
export const WOE_GREEN_EXPANDERS: Record<string, Expander> = {
  /**
   * Fetch Quest: mill seven cards (as many as the milling rules make it), then `woeFetchQuestPick` over the cards milled.
   */
  woeFetchQuest(ctx, es) {
    const milled = ctx.s.players[es.controller].library.slice(0, millCount(ctx, es.controller, 7));
    return [{ kind: 'mill', count: 7 }, custom('woeFetchQuestPick', { cards: milled })];
  },

  /**
   * Fetch Quest, the choice: a creature, enchantment, or land card from among the milled cards (still in the graveyard), put onto
   * the battlefield. An Aura needs something it can enchant, and the player picks that too (rule 303.4f); one that can't enter
   * isn't offered. Nothing happens if no card qualifies.
   */
  woeFetchQuestPick(ctx, es, params) {
    const cards = ((params?.cards as ObjectId[] | undefined) ?? []).filter(
      (id) => ctx.s.objects[id]?.zone === 'graveyard',
    );
    const options: { label: string; effects: EffectDef[] }[] = [];
    for (const id of cards) {
      const d = def(ctx, id);
      if (!d.types.some((t) => t === 'Creature' || t === 'Enchantment' || t === 'Land')) continue;
      if (d.subtypes.includes('Aura') && d.enchant) {
        for (const host of ctx.s.battlefield)
          if (canEnchant(ctx, id, host))
            options.push({
              label: `Put ${d.name} onto the battlefield enchanting ${def(ctx, host).name}`,
              effects: [custom('woePutOntoBattlefield', { card: id, host })],
            });
      } else
        options.push({
          label: `Put ${d.name} onto the battlefield`,
          effects: [custom('woePutOntoBattlefield', { card: id })],
        });
    }
    if (options.length === 0) return [];
    return [
      {
        kind: 'choose',
        title: 'Put a creature, enchantment, or land card onto the battlefield',
        options,
      },
    ];
  },

  /**
   * Commune with Nature: look at the top five cards, you may reveal a creature card from among them and put it into your hand, then
   * the rest go on the bottom in any order (`woeBottomOrder`, with the cards looked at).
   */
  woeCommune(ctx, es) {
    const looked = ctx.s.players[es.controller].library.slice(0, 5);
    if (looked.length === 0) return [];
    return [
      {
        kind: 'lookAndTake',
        count: 5,
        filter: { types: ['Creature'] },
        reveal: true,
        restInAnyOrder: true,
      },
      custom('woeBottomOrder', { cards: looked }),
    ];
  },

  /**
   * Commune with Nature: "put the rest on the bottom of your library in any order". `cards` are the ones looked at; those still on
   * top go down one at a time (the first chosen is the highest of them, the last the bottom card). The cards that share a name are
   * interchangeable, so a name is asked once.
   */
  woeBottomOrder(ctx, es, params) {
    const cards = ((params?.cards as ObjectId[] | undefined) ?? []).filter(
      (id) => ctx.s.objects[id]?.zone === 'library',
    );
    if (cards.length === 0) return [];
    const names = new Map<string, ObjectId>();
    for (const id of cards) if (!names.has(def(ctx, id).id)) names.set(def(ctx, id).id, id);
    if (names.size === 1) return cards.map((card) => custom('woePutBottom', { card }));
    return [
      {
        kind: 'choose',
        title: `Put the rest on the bottom of your library (${cards.length} left): choose the next card`,
        options: [...names.values()].map((id) => ({
          label: def(ctx, id).name,
          effects: [
            custom('woePutBottom', { card: id }),
            custom('woeBottomOrder', { cards: cards.filter((c) => c !== id) }),
          ],
        })),
      },
    ];
  },
};

/**
 * Feral Encounter: at the beginning of a combat phase, the emblems made for "the next combat phase this turn" (`once`) trigger and
 * go away. Called with the active player as the step changes to beginning of combat.
 */
export function woeCombatEmblems(ctx: Ctx, activePlayer: PlayerId): void {
  const s = ctx.s;
  for (const e of [...(s.emblems ?? [])]) {
    const a = e.ability;
    if (a.kind !== 'triggered' || a.trigger.on !== 'beginningOfCombat' || !e.once) continue;
    if (a.trigger.whose === 'yours' && e.controller !== activePlayer) continue;
    s.emblems = s.emblems!.filter((x) => x !== e);
    s.pendingTriggers.push({
      source: e.source,
      sourceDefId: e.sourceDefId,
      abilityIndex: -1,
      controller: e.controller,
      emblem: a,
    });
  }
}
