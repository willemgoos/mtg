import {
  NON_CREATURE_SUBTYPES,
  cardMatches,
  creaturesOnBattlefield,
  hasAllCreatureTypes,
  subtypesOf,
} from './characteristics.ts';
import {
  type Ctx,
  type CustomEffect,
  def,
  moveObject,
  newTimestamp,
  obj,
  sacrifice,
} from './context.ts';
import { canEnchant } from './fra-white-effects.ts';
import { shuffleInPlace } from './rng.ts';
import { attachAura } from './stack.ts';
import { type Chooser, CHOOSERS } from './stx-13c-a-effects.ts';
import type { EffectDef, EffectSource, ObjectId, PlayerId } from './types.ts';

/**
 * Lorwyn Eclipsed (18b, white): one-off effects as custom effects, and the choosers behind `chooseCustom` for
 * Ajani, Outland Chaperone's -8 and Winnowing.
 */

const custom = (handler: string, params?: Record<string, unknown>): EffectDef => ({
  kind: 'custom',
  handler,
  ...(params ? { params } : {}),
});
const chooseCustom = (handler: string, params?: Record<string, unknown>): EffectDef => ({
  kind: 'chooseCustom',
  handler,
  ...(params ? { params } : {}),
});

const PERMANENT_TYPES = ['Artifact', 'Creature', 'Enchantment', 'Planeswalker'] as const;
const isAura = (ctx: Ctx, id: ObjectId) => def(ctx, id).subtypes.includes('Aura');

/** The creature types a creature has (a changeling has them all), without the types that aren't creature types. */
function creatureTypes(ctx: Ctx, id: ObjectId): { all: boolean; types: string[] } {
  return {
    all: hasAllCreatureTypes(ctx, id),
    types: subtypesOf(ctx, id).filter((t) => !NON_CREATURE_SUBTYPES.has(t)),
  };
}

/** Do two creatures share a creature type (every creature type, for a changeling)? */
function sharesCreatureType(ctx: Ctx, a: ObjectId, b: ObjectId): boolean {
  const x = creatureTypes(ctx, a);
  const y = creatureTypes(ctx, b);
  if (x.all && y.all) return true;
  if (x.all) return y.types.length > 0;
  if (y.all) return x.types.length > 0;
  return x.types.some((t) => y.types.includes(t));
}

export const ECL_WHITE_EFFECTS: Record<string, CustomEffect> = {
  /** Spiral into Solitude: "Exile enchanted creature" (the Aura was sacrificed as a cost: the creature it was attached to). */
  eclExileEnchantedCreature(ctx, es) {
    const aura = es.source && ctx.s.objects[es.source.id];
    const was = aura?.lastAttachedTo;
    const host = was && ctx.s.objects[was.id];
    if (host && host.zone === 'battlefield') moveObject(ctx, host.id, 'exile');
  },

  /**
   * Curious Colossus: each creature target opponent controls (as this resolves) loses all abilities, becomes a Coward in
   * addition to its other types, and has base power and toughness 1/1, for good.
   */
  eclCuriousColossus(ctx, es) {
    const t = es.targets[0];
    if (!t || !('player' in t)) return;
    for (const c of creaturesOnBattlefield(ctx, t.player)) {
      ctx.s.effects.push({
        timestamp: newTimestamp(ctx),
        affected: { id: c.id, zcc: c.zcc },
        power: 0,
        toughness: 0,
        keywords: [],
        loseAbilities: true,
        basePT: [1, 1],
        expires: 'permanent',
      });
      c.blank = true;
      c.addedSubtypes = [...(c.addedSubtypes ?? []), 'Coward'];
    }
  },

  /** Ajani, Outland Chaperone: this card from among the looked-at ones goes onto the battlefield (an Aura, enchanting `host`). */
  eclAjaniPut(ctx, es, params) {
    const { card, host } = params as { card: ObjectId; host?: ObjectId };
    const o = ctx.s.objects[card];
    if (!o || o.zone !== 'library') return;
    if (host !== undefined && !canEnchant(ctx, card, host)) return;
    moveObject(ctx, card, 'battlefield', { controller: es.controller });
    if (host !== undefined && ctx.s.objects[card]?.zone === 'battlefield') attachAura(ctx, card, host);
  },

  /** Ajani, Outland Chaperone: "Then shuffle." */
  eclShuffleLibrary(ctx, es) {
    shuffleInPlace(ctx.s.rng, ctx.s.players[es.controller].library);
  },

  /** Winnowing: each player sacrifices all other creatures they control that don't share a creature type with their chosen one. */
  eclWinnowingSacrifice(ctx, _es, params) {
    const chosen = (params as { chosen: Partial<Record<PlayerId, ObjectId>> }).chosen;
    const doomed: ObjectId[] = [];
    for (const p of ['p1', 'p2'] as const) {
      const keep = chosen[p];
      if (keep === undefined) continue;
      for (const c of creaturesOnBattlefield(ctx, p))
        if (c.id !== keep && !sharesCreatureType(ctx, c.id, keep)) doomed.push(c.id);
    }
    for (const id of doomed) if (ctx.s.objects[id]?.zone === 'battlefield') sacrifice(ctx, id);
  },
};

const ECL_WHITE_CHOOSERS: Record<string, Chooser> = {
  /**
   * Ajani, Outland Chaperone -8: look at the top X cards (X is your life total); you may put any number of nonland permanent
   * cards with mana value 3 or less from among them onto the battlefield, one at a time. The looked-at cards are
   * remembered in `params.ids`. An Aura asks what it enchants (one option for each host).
   */
  eclAjani(ctx: Ctx, es: EffectSource, params) {
    const library = ctx.s.players[es.controller].library;
    const ids =
      (params?.ids as ObjectId[] | undefined) ??
      library.slice(0, Math.max(0, ctx.s.players[es.controller].life));
    const options: { label: string; effects: EffectDef[] }[] = [];
    const again = (): EffectDef => chooseCustom('eclAjani', { ids });
    for (const id of ids) {
      const o = ctx.s.objects[id];
      if (!o || o.zone !== 'library') continue;
      const d = def(ctx, id);
      if (
        !d.types.some((t) => (PERMANENT_TYPES as readonly string[]).includes(t)) ||
        !cardMatches(ctx, id, { nonland: true, maxManaValue: 3 })
      )
        continue;
      if (isAura(ctx, id)) {
        for (const host of ctx.s.battlefield)
          if (canEnchant(ctx, id, host))
            options.push({
              label: `Put ${d.name} onto the battlefield enchanting ${def(ctx, host).name}`,
              effects: [custom('eclAjaniPut', { card: id, host }), again()],
            });
      } else {
        options.push({
          label: `Put ${d.name} onto the battlefield`,
          effects: [custom('eclAjaniPut', { card: id }), again()],
        });
      }
    }
    if (options.length === 0) return null;
    options.push({ label: 'Done', effects: [] });
    return { title: 'Ajani, Outland Chaperone: put a card onto the battlefield', options };
  },

  /**
   * Winnowing: "For each player, you choose a creature that player controls": you, then your opponent. The creatures chosen so
   * far are in `params.chosen`; when both are chosen (a player with no creatures has none), everyone sacrifices.
   */
  eclWinnowing(ctx: Ctx, es: EffectSource, params) {
    const chosen = (params?.chosen as Partial<Record<PlayerId, ObjectId>> | undefined) ?? {};
    const order: PlayerId[] = [es.controller, es.controller === 'p1' ? 'p2' : 'p1'];
    // The next player (in order) with a creature to choose from.
    const next = (done: Partial<Record<PlayerId, ObjectId>>): PlayerId | undefined =>
      order.find((q) => !(q in done) && creaturesOnBattlefield(ctx, q).length > 0);
    const p = next(chosen);
    if (p === undefined) return null;
    return {
      title: `Winnowing: choose a creature ${p === es.controller ? 'you control' : 'your opponent controls'}`,
      options: creaturesOnBattlefield(ctx, p).map((c) => {
        const now = { ...chosen, [p]: c.id };
        return {
          label: `${def(ctx, c.id).name}${p === es.controller ? '' : ' (opponent)'}`,
          effects: [
            next(now) === undefined
              ? custom('eclWinnowingSacrifice', { chosen: now })
              : chooseCustom('eclWinnowing', { chosen: now }),
          ],
        };
      }),
    };
  },
};
Object.assign(CHOOSERS, ECL_WHITE_CHOOSERS);
