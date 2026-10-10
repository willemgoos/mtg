import { type Ctx, type CustomEffect, def, obj } from './context.ts';
import { type Chooser, CHOOSERS } from './stx-13c-a-effects.ts';
import type { EffectDef, EffectSource } from './types.ts';

/**
 * The Lord of the Rings (21b, green): the one-off effect of Pippin's Bravery ("You may sacrifice a Food. If you do, target
 * creature gets +4/+4 until end of turn. Otherwise, that creature gets +2/+2 until end of turn.").
 */

const pump = (power: number): EffectDef => ({
  kind: 'pump',
  to: { target: 0 },
  power,
  toughness: power,
});

/** The number of Foods (artifacts: tokens and cards) the player controls. */
function foodsOf(ctx: Ctx, es: EffectSource): number {
  return ctx.s.battlefield.filter(
    (id) => obj(ctx, id).controller === es.controller && def(ctx, id).subtypes.includes('Food'),
  ).length;
}

export const LTR_GREEN_EFFECTS: Record<string, CustomEffect> = {
  /** Pippin's Bravery: with a Food to sacrifice you may (a choice); without one, "otherwise" applies. */
  ltrPippinsBravery(ctx, es) {
    (ctx.deferred ??= []).push(
      foodsOf(ctx, es) > 0 ? { kind: 'chooseCustom', handler: 'ltrPippinsPick' } : pump(2),
    );
  },
};

const LTR_GREEN_CHOOSERS: Record<string, Chooser> = {
  ltrPippinsPick() {
    return {
      title: "Pippin's Bravery: sacrifice a Food?",
      options: [
        {
          label: 'Sacrifice a Food: the creature gets +4/+4 until end of turn',
          effects: [
            { kind: 'sacrificeSeveral', count: 1, filter: { subtype: 'Food' }, then: [pump(4)] },
          ],
        },
        { label: "Don't sacrifice: the creature gets +2/+2 until end of turn", effects: [pump(2)] },
      ],
    };
  },
};
Object.assign(CHOOSERS, LTR_GREEN_CHOOSERS);
