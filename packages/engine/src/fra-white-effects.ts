import { isCreature, matchesFilter } from './characteristics.ts';
import { protectedFrom } from './brawl-15b-w-effects.ts';
import { type Ctx, type CustomEffect, addCounters, def, moveObject, obj } from './context.ts';
import { attachAura } from './stack.ts';
import { type Chooser, CHOOSERS } from './stx-13c-a-effects.ts';
import type { CardType, EffectDef, EffectSource, ObjectId } from './types.ts';

/**
 * Reality Fracture (17a), white: one-off effects as custom effects, and the chooser
 * for Auras that come back with Return to the Light Realms.
 */

const PERMANENT_TYPES: readonly CardType[] = [
  'Artifact',
  'Creature',
  'Enchantment',
  'Planeswalker',
];

const isAura = (ctx: Ctx, id: ObjectId) => def(ctx, id).subtypes.includes('Aura');

/** Could this Aura enter attached to `host` (rule 303.4f: not targeted, so hexproof doesn't matter)? */
export function canEnchant(ctx: Ctx, aura: ObjectId, host: ObjectId): boolean {
  const a = obj(ctx, aura);
  const h = obj(ctx, host);
  const spec = def(ctx, aura).enchant;
  if (h.zone !== 'battlefield' || host === aura || !spec) return false;
  if (spec.what === 'creature' && !isCreature(ctx, host)) return false;
  if (
    spec.what === 'any' &&
    !isCreature(ctx, host) &&
    !def(ctx, host).types.includes('Planeswalker')
  )
    return false;
  if (spec.what === 'player' || spec.what === 'spell' || spec.what === 'graveyardCard')
    return false;
  if (spec.controller === 'you' && h.controller !== a.owner) return false;
  if (spec.controller === 'opponent' && h.controller === a.owner) return false;
  if (protectedFrom(ctx, host, aura)) return false;
  return matchesFilter(ctx, host, spec.filter, aura);
}

const custom = (handler: string, params?: Record<string, unknown>): EffectDef => ({
  kind: 'custom',
  handler,
  ...(params ? { params } : {}),
});

export const FRA_WHITE_EFFECTS: Record<string, CustomEffect> = {
  /**
   * Graft Surgeon: "put its counters on up to one target creature you control". Every kind of counter it had
   * as it died (its +1/+1 counters and the named ones) goes onto the target.
   */
  putSourceCountersOnTarget(ctx, es) {
    const t = es.targets[0];
    const self = es.source && ctx.s.objects[es.source.id];
    if (!t || !('object' in t) || !self) return;
    const to = ctx.s.objects[t.object.id];
    if (!to || to.zone !== 'battlefield' || to.zcc !== t.object.zcc) return;
    const had = self.zone === 'battlefield' ? self.plusOneCounters : (self.lastCounters ?? 0);
    const named = self.zone === 'battlefield' ? self.counters : self.lastNamedCounters;
    addCounters(ctx, to.id, had);
    for (const [name, n] of Object.entries(named ?? {})) addCounters(ctx, to.id, n, name);
  },

  /**
   * Return to the Light Realms: all nonland permanent cards from your graveyard enter the battlefield together.
   * Auras are left for `fraAuraHost`, which asks what each one enchants.
   */
  returnNonlandPermanents(ctx, es) {
    for (const id of [...ctx.s.players[es.controller].graveyard]) {
      const d = def(ctx, id);
      if (
        d.types.includes('Land') ||
        !d.types.some((t) => PERMANENT_TYPES.includes(t)) ||
        isAura(ctx, id)
      )
        continue;
      moveObject(ctx, id, 'battlefield', { controller: es.controller });
    }
  },

  /** An Aura card from your graveyard enters attached to the host its controller chose. */
  attachReturnedAura(ctx, es, params) {
    const { aura, host } = params as { aura: ObjectId; host: ObjectId };
    const a = ctx.s.objects[aura];
    if (!a || a.zone !== 'graveyard' || !canEnchant(ctx, aura, host)) return;
    moveObject(ctx, aura, 'battlefield', { controller: es.controller });
    attachAura(ctx, aura, host);
  },
};

const FRA_WHITE_CHOOSERS: Record<string, Chooser> = {
  /**
   * Return to the Light Realms: the next Aura card in your graveyard that has something to enchant
   * enters attached to a permanent you choose; the effect then asks again for the next one.
   */
  fraAuraHost(ctx: Ctx, es: EffectSource) {
    for (const aura of ctx.s.players[es.controller].graveyard) {
      if (!isAura(ctx, aura)) continue;
      const hosts = ctx.s.battlefield.filter((h) => canEnchant(ctx, aura, h));
      if (hosts.length === 0) continue;
      return {
        title: `${def(ctx, aura).name} enters: choose what it enchants`,
        options: hosts.map((host) => ({
          label: `Enchant ${def(ctx, host).name}`,
          effects: [
            custom('attachReturnedAura', { aura, host }),
            { kind: 'chooseCustom', handler: 'fraAuraHost' } as EffectDef,
          ],
        })),
      };
    }
    return null;
  },
};
Object.assign(CHOOSERS, FRA_WHITE_CHOOSERS);
