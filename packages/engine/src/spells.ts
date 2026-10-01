import { addCosts } from './cost.ts';
import type { CardDefinition, ManaCost, SpellDef, ZoneName } from './types.ts';

/** One way to cast a card: a mode, kicked or not, from hand or with flashback. */
export interface CastVariant {
  mode?: number;
  kicked?: boolean;
  flashback?: boolean;
  /** Needs a creature sacrificed as an additional cost (Eaten Alive). */
  sacrifice?: boolean;
  /** Needs a forage as an additional cost (Feed the Cycle). */
  forage?: boolean;
  /** Cast from the graveyard by removing this many +1/+1 counters (Quilled Greatwurm). */
  removeCounters?: number;
  cost: ManaCost;
  /** What it does on resolution; null for a permanent spell. */
  spell: SpellDef | null;
}

export { addCosts };

/** The ways `d` can be cast from `zone` (empty if it can't be cast from there). */
export function castVariants(d: CardDefinition, zone: ZoneName): CastVariant[] {
  if (d.types.includes('Land')) return [];
  if (zone === 'graveyard' && d.castFromGraveyardRemovingCounters)
    return [
      {
        cost: d.manaCost,
        spell: d.spell ?? null,
        removeCounters: d.castFromGraveyardRemovingCounters,
      },
    ];
  const flashback = zone === 'graveyard';
  if (flashback && !d.flashback) return [];
  const cost = flashback ? d.flashback! : d.manaCost;
  const extra = flashback ? { flashback: true } : {};
  if (d.modes) return d.modes.map((spell, mode) => ({ mode, cost, spell, ...extra }));
  if (d.sacrificeCreatureToCast)
    return [{ cost, spell: d.spell ?? null, sacrifice: true, ...extra }];
  if (d.forageOrPay)
    return [
      { cost, spell: d.spell ?? null, forage: true, ...extra },
      { cost: addCosts(cost, d.forageOrPay), spell: d.spell ?? null, ...extra },
    ];
  if (d.sacrificeOrPay)
    return [
      { cost, spell: d.spell ?? null, sacrifice: true, ...extra },
      { cost: addCosts(cost, d.sacrificeOrPay), spell: d.spell ?? null, ...extra },
    ];
  const out: CastVariant[] = [{ cost, spell: d.spell ?? null, ...extra }];
  if (d.kicker)
    out.push({
      kicked: true,
      cost: addCosts(cost, d.kicker.cost),
      spell: d.kicker.spell ?? d.spell ?? null,
      ...extra,
    });
  return out;
}

/** The variant a cast action or stack item refers to. */
export function variantOf(
  d: CardDefinition,
  zone: ZoneName,
  choice: {
    mode?: number | undefined;
    kicked?: boolean | undefined;
    sacrifice?: string | undefined;
    forage?: string | undefined;
  },
): CastVariant | undefined {
  return castVariants(d, zone).find(
    (v) =>
      (v.mode ?? -1) === (choice.mode ?? -1) &&
      !!v.kicked === !!choice.kicked &&
      !!v.sacrifice === !!choice.sacrifice &&
      !!v.forage === !!choice.forage,
  );
}

/** Resolution effects for a spell on the stack. */
export function spellOnStack(
  d: CardDefinition,
  item: { mode?: number | undefined; kicked?: boolean | undefined },
): SpellDef | null {
  if (d.modes) return d.modes[item.mode ?? 0] ?? null;
  if (item.kicked && d.kicker?.spell) return d.kicker.spell;
  return d.spell ?? null;
}
