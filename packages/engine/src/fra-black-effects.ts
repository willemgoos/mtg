import { type Ctx, type CustomEffect, def, obj } from './context.ts';
import { type Chooser, CHOOSERS } from './stx-13c-a-effects.ts';
import type { EffectDef, EffectSource, ObjectId } from './types.ts';

/**
 * Reality Fracture (17a, black): one-off effects, as custom effects, and the
 * choosers behind `chooseCustom`.
 */

const custom = (handler: string, params?: Record<string, unknown>): EffectDef => ({
  kind: 'custom',
  handler,
  ...(params ? { params } : {}),
});

/** The permanent chosen as the first target, if it's still the same one on the battlefield. */
function firstTargetPermanent(ctx: Ctx, es: EffectSource): ObjectId | null {
  const t = es.targets[0];
  if (!t || !('object' in t)) return null;
  const o = ctx.s.objects[t.object.id];
  return o && o.zone === 'battlefield' && o.zcc === t.object.zcc ? o.id : null;
}

/** The kinds of counters on a permanent, with how many of each ('+1/+1' for the +1/+1 counters). */
function counterKinds(ctx: Ctx, id: ObjectId): [kind: string, n: number][] {
  const o = obj(ctx, id);
  const out: [string, number][] = [];
  if (o.plusOneCounters > 0) out.push(['+1/+1', o.plusOneCounters]);
  for (const [name, n] of Object.entries(o.counters ?? {})) if (n > 0) out.push([name, n]);
  return out;
}

export const FRA_BLACK_EFFECTS: Record<string, CustomEffect> = {
  /** Mabel, Bitter Recluse: removes one counter of the given kind from the first target. */
  fraRemoveCounter(ctx, es, params) {
    const kind = (params as { kind: string }).kind;
    const id = firstTargetPermanent(ctx, es);
    if (!id) return;
    const o = obj(ctx, id);
    if (kind === '+1/+1') {
      if (o.plusOneCounters > 0) o.plusOneCounters--;
      return;
    }
    if (!o.counters?.[kind]) return;
    o.counters[kind]--;
    if (o.counters[kind] <= 0) delete o.counters[kind];
  },
};

const FRA_BLACK_CHOOSERS: Record<string, Chooser> = {
  /**
   * Mabel, Bitter Recluse: "remove up to three counters from another target creature or
   * planeswalker". One counter at a time (`left` more may be removed): which kind, or stop.
   */
  fraMabelCounters(ctx, es, params) {
    const left = (params as { left: number }).left;
    const id = firstTargetPermanent(ctx, es);
    if (!id || left <= 0) return null;
    const kinds = counterKinds(ctx, id);
    if (kinds.length === 0) return null;
    return {
      title: `${def(ctx, id).name}: remove up to ${left} counter${left === 1 ? '' : 's'}`,
      options: [
        { label: 'Done removing counters', effects: [] },
        ...kinds.map(([kind, n]) => ({
          label: `Remove a ${kind} counter (${n} on it)`,
          effects: [
            custom('fraRemoveCounter', { kind }),
            {
              kind: 'chooseCustom',
              handler: 'fraMabelCounters',
              params: { left: left - 1 },
            } as EffectDef,
          ],
        })),
      ],
    };
  },
};
Object.assign(CHOOSERS, FRA_BLACK_CHOOSERS);
