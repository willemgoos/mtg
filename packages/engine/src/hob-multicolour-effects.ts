import { power, toughness } from './characteristics.ts';
import {
  type Ctx,
  type CustomEffect,
  def,
  moveObject,
  newTimestamp,
  obj,
  sacrifice,
} from './context.ts';
import { runEffect } from './effects.ts';
import type { CardDefinition, EffectDef, EffectSource, GameObject, ObjectId } from './types.ts';

/**
 * The Hobbit (20b, multicolour): one-offs of the gold and hybrid cards, as custom effects. The vocabulary that lives in types.ts is
 * marked "The Hobbit (20b multicolour)".
 */

const custom = (handler: string, params?: Record<string, unknown>): EffectDef => ({
  kind: 'custom',
  handler,
  ...(params ? { params } : {}),
});

/** Custom effects that turn into other effects when they come up (a prompt built from the state the earlier effects left). */
export type Expander = (
  ctx: Ctx,
  es: EffectSource,
  params: Record<string, unknown> | undefined,
) => EffectDef[];

/** `d` plus the activated abilities of the Elf cards in its controller's graveyard (Thranduil, the Elvenking). */
export function withGraveyardElfAbilities(
  ctx: Ctx,
  o: GameObject,
  d: CardDefinition,
): CardDefinition {
  const given = ctx.s.players[o.controller].graveyard.flatMap((gid) => {
    const g = ctx.db.get(ctx.s.objects[gid]?.defId ?? '');
    if (!g || g.isToken) return [];
    if (!g.subtypes.includes('Elf') && !g.keywords.includes('changeling')) return [];
    // Abilities that only work from a zone other than the battlefield (cycling, a graveyard ability) aren't given.
    return g.abilities.filter(
      (a) =>
        (a.kind === 'mana' || a.kind === 'activated') &&
        !(a.kind === 'activated' && (a.fromHand || a.fromGraveyard || a.fromExile)),
    );
  });
  return given.length ? { ...d, abilities: [...d.abilities, ...given] } : d;
}

const label = (ctx: Ctx, id: ObjectId): string => def(ctx, id).name;

export const HOB_MULTICOLOUR_EXPANDERS: Record<string, Expander> = {
  /**
   * Silvan Rally: "Mill four cards, then put up to two land cards from among them into your hand." The cards are milled now; then
   * the player picks a land card from among them, and a second one (a prompt with Done each time).
   */
  hobSilvanRally(ctx, es) {
    const before = new Set(ctx.s.players[es.controller].graveyard);
    runEffect(ctx, es, { kind: 'mill', count: 4 });
    const milled = ctx.s.players[es.controller].graveyard.filter((id) => !before.has(id));
    const chain = (lands: ObjectId[], left: number): EffectDef[] => {
      if (left === 0 || lands.length === 0) return [];
      // One option per distinct name (two Forests are the same choice).
      const seen = new Set<string>();
      const options = lands
        .filter((id) => !seen.has(label(ctx, id)) && !!seen.add(label(ctx, id)))
        .map((id) => ({
          label: label(ctx, id),
          effects: [
            custom('hobGraveyardToHand', { id }),
            ...chain(
              lands.filter((x) => x !== id),
              left - 1,
            ),
          ],
        }));
      return [
        {
          kind: 'choose',
          title: 'Silvan Rally: put a land card into your hand',
          options: [{ label: 'Done', effects: [] }, ...options],
        },
      ];
    };
    return chain(
      milled.filter((id) => def(ctx, id).types.includes('Land')),
      2,
    );
  },

  /**
   * Bolg of the North: "you may sacrifice another creature. When you do, ..." The reflexive ability `ability` carries the power the
   * sacrificed creature had.
   */
  /**
   * Bolg of the North's reflexive ability: it deals damage equal to the sacrificed creature's power (the trigger's amount) to
   * another target creature; if excess damage was dealt, amass Goblins X, X the excess.
   */
  hobBolgDamage(ctx, es) {
    const t = es.targets[0];
    const o = t && 'object' in t ? ctx.s.objects[t.object.id] : undefined;
    if (!o || o.zone !== 'battlefield' || o.zcc !== (t as { object: { zcc: number } }).object.zcc)
      return [];
    const before = o.damage;
    const lethal = Math.max(0, toughness(ctx, o.id) - before);
    runEffect(ctx, es, { kind: 'damage', amount: es.amount ?? 0, to: { target: 0 } });
    const excess = (ctx.s.objects[o.id]?.damage ?? before) - before - lethal;
    return excess > 0
      ? [{ kind: 'amass', subtype: 'Goblin', amount: excess, token: 'hob-goblin-army-token' }]
      : [];
  },

  hobBolgSacrifice(ctx, es, params) {
    const options = ctx.s.battlefield
      .filter(
        (id) =>
          obj(ctx, id).controller === es.controller &&
          id !== es.source?.id &&
          def(ctx, id).types.includes('Creature'),
      )
      .map((id) => ({
        label: `Sacrifice ${label(ctx, id)} (${power(ctx, id)}/${toughness(ctx, id)})`,
        effects: [custom('hobSacrificeReflexive', { id, ability: params?.ability })],
      }));
    if (options.length === 0) return [];
    return [
      {
        kind: 'choose',
        title: 'Bolg of the North: you may sacrifice another creature',
        options: [{ label: "Don't sacrifice", effects: [] }, ...options],
      },
    ];
  },
};

export const HOB_MULTICOLOUR_EFFECTS: Record<string, CustomEffect> = {
  /** Silvan Rally: a land card milled goes from the graveyard into your hand. */
  hobGraveyardToHand(ctx, es, params) {
    const id = params?.id as ObjectId | undefined;
    const o = id ? ctx.s.objects[id] : undefined;
    if (o && o.zone === 'graveyard' && o.owner === es.controller) moveObject(ctx, o.id, 'hand');
  },

  /** Bolg of the North: sacrifice the creature, then "when you do" (ability `ability`) with its power. */
  hobSacrificeReflexive(ctx, es, params) {
    const id = params?.id as ObjectId | undefined;
    const o = id ? ctx.s.objects[id] : undefined;
    if (!id || !o || o.zone !== 'battlefield' || o.controller !== es.controller) return;
    const p = Math.max(0, power(ctx, id));
    sacrifice(ctx, id);
    if (ctx.s.objects[id]?.zone === 'battlefield' || !es.source) return; // it couldn't be sacrificed
    ctx.s.pendingTriggers.push({
      source: es.source,
      sourceDefId: es.sourceDefId,
      abilityIndex: params?.ability as number,
      controller: es.controller,
      amount: p,
    });
  },

  /**
   * Eagle's Rescue: "Return this card from your graveyard to the battlefield attached to target creature you control with power 1
   * or less."
   */
  hobAuraFromGraveyard(ctx, es) {
    const o = es.source && ctx.s.objects[es.source.id];
    const t = es.targets[0];
    if (!o || o.zone !== 'graveyard' || !t || !('object' in t)) return;
    const host = ctx.s.objects[t.object.id];
    if (!host || host.zone !== 'battlefield' || host.zcc !== t.object.zcc) return;
    moveObject(ctx, o.id, 'battlefield', { controller: es.controller });
    const aura = ctx.s.objects[o.id];
    if (!aura || aura.zone !== 'battlefield') return;
    aura.attachedTo = host.id;
    aura.timestamp = newTimestamp(ctx);
  },

  /**
   * Tom, Bert, and William: "When they die, if they were a creature, return them to the battlefield. They're an artifact. (They're
   * no longer a creature.)"
   */
  hobReturnAsArtifact(ctx, es) {
    const o = es.source && ctx.s.objects[es.source.id];
    if (!o || o.zone !== 'graveyard' || o.lastNotCreature) return;
    // Set before it enters, so it is never a creature on the battlefield.
    o.notCreature = true;
    o.notCreatureAs = 'Artifact';
    moveObject(ctx, o.id, 'battlefield', { controller: o.owner });
    const back = ctx.s.objects[o.id];
    if (back && back.zone === 'battlefield') {
      back.notCreature = true;
      back.notCreatureAs = 'Artifact';
    } else {
      delete o.notCreature;
      delete o.notCreatureAs;
    }
  },
};
