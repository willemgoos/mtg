import { power } from './characteristics.ts';
import { type Ctx, type CustomEffect, def, moveObject, newTimestamp, obj } from './context.ts';
import { manaValue } from './cost.ts';
import { shuffleLibrary } from './setup.ts';
import type { ObjectId } from './types.ts';

/** Strixhaven (13c, group B): one-offs, as custom effects. */

/** The object a spell's first target names, if it is still where it was. */
function targetObject(
  ctx: Ctx,
  es: Parameters<CustomEffect>[1],
  zone: string,
): ObjectId | undefined {
  const t = es.targets[0];
  if (!t || !('object' in t)) return undefined;
  const o = ctx.s.objects[t.object.id];
  return o && o.zone === zone && o.zcc === t.object.zcc ? o.id : undefined;
}

export const STX_13C_B_EFFECTS: Record<string, CustomEffect> = {
  /** Confront the Past, mode 1: a planeswalker card with mana value X or less from your graveyard onto the battlefield. */
  confrontReturn(ctx, es) {
    const id = targetObject(ctx, es, 'graveyard');
    if (!id) return;
    const d = def(ctx, id);
    if (!d.types.includes('Planeswalker') || manaValue(d.manaCost) > (es.x ?? 0)) return;
    moveObject(ctx, id, 'battlefield', { controller: es.controller });
    if (d.loyalty !== undefined) (obj(ctx, id).counters ??= {}).loyalty = d.loyalty;
  },

  /** Confront the Past, mode 2: remove twice X loyalty counters from the target planeswalker. */
  confrontRemove(ctx, es) {
    const id = targetObject(ctx, es, 'battlefield');
    if (!id || !def(ctx, id).types.includes('Planeswalker')) return;
    const o = obj(ctx, id);
    if (o.controller === es.controller) return;
    (o.counters ??= {}).loyalty = Math.max(0, (o.counters.loyalty ?? 0) - 2 * (es.x ?? 0));
  },

  /** Exponential Growth: until end of turn, double the target creature's power X times. */
  exponentialGrowth(ctx, es) {
    const id = targetObject(ctx, es, 'battlefield');
    const x = es.x ?? 0;
    if (!id || x <= 0) return;
    const p = power(ctx, id);
    ctx.s.effects.push({
      timestamp: newTimestamp(ctx),
      affected: { id, zcc: obj(ctx, id).zcc },
      power: p * (2 ** x - 1),
      toughness: 0,
      keywords: [],
      expires: 'endOfTurn',
    });
  },

  /**
   * Ecological Appreciation: up to four creature cards with different names and
   * mana value X or less from your library and graveyard (the engine takes the
   * four with the greatest mana value). The opponent puts two of them back
   * (the engine takes the two best); the rest enter the battlefield. The spell
   * exiles itself (`afterResolving`).
   */
  ecologicalAppreciation(ctx, es) {
    const x = es.x ?? 0;
    const ps = ctx.s.players[es.controller];
    const names = new Set<string>();
    const found: ObjectId[] = [];
    const candidates = [...ps.library, ...ps.graveyard]
      .filter((id) => {
        const d = def(ctx, id);
        return d.types.includes('Creature') && manaValue(d.manaCost) <= x;
      })
      .sort((a, b) => manaValue(def(ctx, b).manaCost) - manaValue(def(ctx, a).manaCost));
    for (const id of candidates) {
      const name = def(ctx, id).name;
      if (names.has(name)) continue;
      names.add(name);
      found.push(id);
      if (found.length === 4) break;
    }
    const [back, rest] = [found.slice(0, 2), found.slice(2)];
    for (const id of back) if (obj(ctx, id).zone === 'graveyard') moveObject(ctx, id, 'library');
    for (const id of rest) moveObject(ctx, id, 'battlefield', { controller: es.controller });
    shuffleLibrary(ctx, es.controller);
  },

  /** Harness Infinity: exchange your hand and your graveyard. */
  exchangeHandAndGraveyard(ctx, es) {
    const ps = ctx.s.players[es.controller];
    const hand = [...ps.hand];
    const grave = [...ps.graveyard];
    for (const id of hand) moveObject(ctx, id, 'graveyard');
    for (const id of grave) moveObject(ctx, id, 'hand');
  },
};
