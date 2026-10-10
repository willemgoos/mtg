import {
  characteristics,
  creaturesOnBattlefield,
  matchesFilter,
  power,
} from './characteristics.ts';
import { type Ctx, type CustomEffect, def, obj } from './context.ts';
import { beholdOptions } from './fra-pw-b-effects.ts';
import { defMatches } from './triggers.ts';
import { type Chooser, CHOOSERS } from './stx-13c-a-effects.ts';
import type { CastVia } from './spells.ts';
import type { CardFilter, EffectDef, ObjectId, PlayerId } from './types.ts';

/**
 * Tarkir: Dragonstorm (19a): harmonize and its tap choice. Engine helpers; the card vocabulary is in types.ts
 * (search "Tarkir: Dragonstorm (19a)").
 */

/** Is `card` (in a graveyard) being cast for its harmonize cost this way? Printed harmonize, or granted (Songcrafter Mage). */
export function isHarmonizeCast(ctx: Ctx, card: ObjectId, via: CastVia | undefined): boolean {
  const o = obj(ctx, card);
  if (o.zone !== 'graveyard') return false;
  const d = ctx.db.get(o.defId);
  if (!d) return false;
  if (via === undefined) return !!d.harmonize && !!d.flashback;
  return via === 'conduit' && o.harmonizeGrantedTurn === ctx.s.turn.number;
}

/**
 * The untapped creatures `player` could tap to reduce a harmonize cost, one for each kind of creature (creatures that look
 * alike are one choice; the weakest come first). Creatures with no power can't reduce anything.
 */
export function harmonizeTaps(ctx: Ctx, player: PlayerId): ObjectId[] {
  const seen = new Set<string>();
  const out: { id: ObjectId; power: number }[] = [];
  for (const c of creaturesOnBattlefield(ctx, player)) {
    if (c.tapped) continue;
    const p = power(ctx, c.id);
    if (p <= 0) continue;
    const ch = characteristics(ctx, c.id);
    const key = `${c.defId}|${c.isToken ? 1 : 0}|${c.summoningSick ? 1 : 0}|${ch.power}/${ch.toughness}|${c.plusOneCounters}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ id: c.id, power: p });
  }
  return out.sort((a, b) => a.power - b.power).map((c) => c.id);
}

/** Zurgo, Thunder's Decree: a permanent that can't be sacrificed right now. */
export function cantBeSacrificed(ctx: Ctx, id: ObjectId): boolean {
  const o = ctx.s.objects[id];
  if (!o || o.zone !== 'battlefield') return false;
  return ctx.s.battlefield.some((src) => {
    const so = ctx.s.objects[src];
    if (!so || so.controller !== o.controller) return false;
    return (
      ctx.db
        .get(so.defId)
        ?.abilities.some(
          (a) =>
            a.kind === 'static' &&
            a.effect.kind === 'cantBeSacrificed' &&
            (!a.effect.duringYourEndStep ||
              (ctx.s.turn.step === 'end' && ctx.s.turn.activePlayer === so.controller)) &&
            matchesFilter(ctx, id, a.effect.filter, src),
        ) ?? false
    );
  });
}

/** The spells `player` has cast this turn, matching the filter (by the definition: types, subtypes). */
export function spellsCastThisTurn(ctx: Ctx, player: PlayerId, filter?: CardFilter): number {
  const cast = ctx.s.turn.castDefs?.[player] ?? [];
  if (!filter) return cast.length;
  return cast.filter((id) => {
    const d = ctx.db.get(id);
    return !!d && defMatches(d, filter);
  }).length;
}

/** The id of the derived definition of `base` having made the enter choice `label`. */
export const variantIdOf = (base: string, label: string): string =>
  `${base}--${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

export const TDM_19A_EFFECTS: Record<string, CustomEffect> = {
  /**
   * The Sieges, "as this enters, choose X or Y": the source becomes the derived definition of the option (`params.label`), and
   * shows its own definition again once it leaves the battlefield (the way a transformed card does).
   */
  becomeVariant(ctx, es, params) {
    const o = es.source && ctx.s.objects[es.source.id];
    const label = (params as { label: string } | undefined)?.label;
    if (!o || o.zone !== 'battlefield' || o.zcc !== es.source!.zcc || !label || o.front) return;
    const id = variantIdOf(o.defId, label);
    if (!ctx.db.has(id)) throw new Error(`No variant ${id}`);
    o.front = o.defId;
    o.defId = id;
  },

  /** Songcrafter Mage: the target instant or sorcery card in your graveyard gains harmonize (its mana cost) until end of turn. */
  grantHarmonize(ctx, es) {
    const t = es.targets[0];
    if (!t || !('object' in t)) return;
    const o = ctx.s.objects[t.object.id];
    if (!o || o.zone !== 'graveyard' || o.zcc !== t.object.zcc) return;
    o.playableUntilTurn = ctx.s.turn.number;
    o.flashbackGrantedTurn = ctx.s.turn.number;
    o.harmonizeGrantedTurn = ctx.s.turn.number;
    o.noSpellLock = true;
  },
};

const TDM_19A_CHOOSERS: Record<string, Chooser> = {
  /**
   * "You may behold a Dragon. If you do, <then>" (Sarkhan, Dragon Ascendant): the player picks which card to behold (a permanent
   * they control, or a card in hand, which is revealed) or declines. Nothing to behold: nothing happens.
   * `params`: `filter` (CardFilter) and `then` (EffectDef[]).
   */
  beholdThen(ctx, es, params) {
    const p = params as { filter: CardFilter; then: EffectDef[] } | undefined;
    if (!p) return null;
    const options = beholdOptions(ctx, es.controller, es.source?.id ?? '', p.filter);
    if (options.length === 0) return null;
    return {
      title: `${es.source ? def(ctx, es.source.id).name : 'Behold'}: behold a card?`,
      options: [
        ...options.map((id) => ({
          label: `Behold ${def(ctx, id).name}${obj(ctx, id).zone === 'hand' ? ' (reveal it from your hand)' : ''}`,
          effects: [
            { kind: 'custom', handler: 'revealBeheld', params: { id } } as const,
            ...p.then,
          ] as EffectDef[],
        })),
        { label: "Don't behold", effects: [] },
      ],
    };
  },
};
Object.assign(CHOOSERS, TDM_19A_CHOOSERS);
