import { creaturesOnBattlefield } from './characteristics.ts';
import { type Ctx, type CustomEffect, def, emit, moveObject, obj, tap } from './context.ts';
import { counterSpell } from './effects.ts';
import { type Chooser, CHOOSERS } from './stx-13c-a-effects.ts';
import type { EffectDef, EffectSource, ObjectId } from './types.ts';

/**
 * Lorwyn Eclipsed (18b, blue): one-off effects, as custom effects, and the choosers behind `chooseCustom`.
 * Glen Elendra's Answer, Swat Away, Temporal Cleansing, Gravelgill Scoundrel, Thirst for Identity.
 */

const custom = (handler: string, params?: Record<string, unknown>): EffectDef => ({
  kind: 'custom',
  handler,
  ...(params ? { params } : {}),
});

/** The spell on the stack or permanent on the battlefield that target slot 0 points at, if it is still there. */
function spellOrPermanentTarget(ctx: Ctx, es: EffectSource): ObjectId | undefined {
  const t = es.targets[0];
  if (!t || !('object' in t)) return undefined;
  const o = ctx.s.objects[t.object.id];
  if (!o || o.zcc !== t.object.zcc) return undefined;
  if (o.zone === 'battlefield') return o.id;
  if (o.zone === 'stack' && ctx.s.stack.some((x) => x.kind === 'spell' && x.id === o.id))
    return o.id;
  return undefined;
}

export const ECL_BLUE_EFFECTS: Record<string, CustomEffect> = {
  /**
   * Glen Elendra's Answer: counter all spells and abilities your opponents control. How many were countered is
   * `{ affectedThisWay: true }` (a spell that can't be countered stays and isn't counted).
   */
  eclCounterAllOpponents(ctx, es) {
    let n = 0;
    for (const item of [...ctx.s.stack]) {
      if (item.controller === es.controller) continue;
      if (item.kind === 'spell') {
        counterSpell(ctx, item.id);
        if (!ctx.s.stack.some((x) => x.kind === 'spell' && x.id === item.id)) n++;
      } else {
        const i = ctx.s.stack.findIndex((x) => x.kind === 'ability' && x.id === item.id);
        if (i < 0) continue;
        ctx.s.stack.splice(i, 1);
        emit(ctx, { type: 'countered', id: item.id });
        n++;
      }
    }
    es.affectedThisWay = n;
  },
  /** Swat Away, Temporal Cleansing: the spell or permanent goes to the library (the owner chose where). */
  eclPutInLibrary(ctx, _es, params) {
    const p = params as { id: ObjectId; zcc: number; position: 'top' | 'bottom' | 'second' };
    const o = ctx.s.objects[p.id];
    if (!o || o.zcc !== p.zcc) return;
    if (o.zone === 'stack') {
      const i = ctx.s.stack.findIndex((x) => x.kind === 'spell' && x.id === o.id);
      if (i < 0) return;
      ctx.s.stack.splice(i, 1);
    } else if (o.zone !== 'battlefield') return;
    moveObject(ctx, o.id, 'library', { position: p.position });
  },
  /** Thirst for Identity: discard this card from your hand. */
  eclDiscardCard(ctx, _es, params) {
    const { id } = params as { id: ObjectId };
    const o = ctx.s.objects[id];
    if (o && o.zone === 'hand') moveObject(ctx, id, 'graveyard');
  },
  /** Gravelgill Scoundrel: tap the creature that was chosen. */
  eclTapCreature(ctx, _es, params) {
    const { id } = params as { id: ObjectId };
    const o = ctx.s.objects[id];
    if (o && o.zone === 'battlefield' && !o.tapped) tap(ctx, id);
  },
};

const ECL_BLUE_CHOOSERS: Record<string, Chooser> = {
  /**
   * "The owner of target spell or creature (or permanent) puts it on their choice of ...": the owner picks. `second`: second
   * from the top or the bottom (Temporal Cleansing); otherwise the top or the bottom (Swat Away).
   */
  eclLibraryChoice(ctx, es, params) {
    const id = spellOrPermanentTarget(ctx, es);
    if (id === undefined) return null;
    const o = obj(ctx, id);
    const first = (params as { second?: boolean } | undefined)?.second ? 'second' : 'top';
    const name = def(ctx, id).name;
    const where = (position: 'top' | 'bottom' | 'second') => [
      custom('eclPutInLibrary', { id, zcc: o.zcc, position }),
    ];
    return {
      player: o.owner,
      title: `Put ${name} on top of or on the bottom of your library`,
      options: [
        {
          label: first === 'second' ? 'Second from the top of your library' : 'Top of your library',
          effects: where(first),
        },
        { label: 'Bottom of your library', effects: where('bottom') },
      ],
    };
  },
  /** Gravelgill Scoundrel: "you may tap another untapped creature you control. If you do, this creature can't be blocked this turn." */
  eclTapForUnblockable(ctx, es) {
    const src = es.source?.id;
    const others = creaturesOnBattlefield(ctx, es.controller).filter(
      (c) => c.id !== src && !c.tapped,
    );
    if (others.length === 0) return null;
    return {
      title: `${es.source ? def(ctx, es.source.id).name : 'Gravelgill Scoundrel'}: tap another creature?`,
      options: [
        ...others.map((c) => ({
          label: `Tap ${def(ctx, c.id).name}`,
          effects: [
            custom('eclTapCreature', { id: c.id }),
            {
              kind: 'pump',
              to: 'self',
              power: 0,
              toughness: 0,
              cantBeBlocked: true,
            } satisfies EffectDef,
          ],
        })),
        { label: "Don't tap a creature", effects: [] },
      ],
    };
  },
  /** Thirst for Identity: "discard two cards unless you discard a creature card". */
  eclDiscardCreatureOrTwo(ctx, es) {
    const hand = ctx.s.players[es.controller].hand;
    const byName = new Map<string, ObjectId>();
    for (const id of hand)
      if (def(ctx, id).types.includes('Creature') && !byName.has(def(ctx, id).name))
        byName.set(def(ctx, id).name, id);
    return {
      title: 'Discard a creature card, or two cards',
      options: [
        ...[...byName].map(([name, id]) => ({
          label: `Discard ${name}`,
          effects: [custom('eclDiscardCard', { id })],
        })),
        { label: 'Discard two cards', effects: [{ kind: 'discard', count: 2 }] },
      ],
    };
  },
};

Object.assign(CHOOSERS, ECL_BLUE_CHOOSERS);
