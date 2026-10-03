import { addCosts, manaValue } from './cost.ts';
import type { CardDefinition, ManaCost, SpellDef, ZoneName } from './types.ts';

/**
 * How a card is cast, beyond its own options: for free (a 'castFree'
 * decision), or from the graveyard through Festival of Embers or Osteomancer Adept.
 */
export type CastVia = 'free' | 'festival' | 'osteomancer' | 'conduit';

/** One way to cast a card: a mode, kicked or not, from hand or with flashback. */
export interface CastVariant {
  /** Pay this much life too (Festival of Embers). */
  life?: number;
  /** It enters with a finality counter (Osteomancer Adept). */
  finality?: boolean;
  mode?: number;
  /** Pawprint modes (Seasons). */
  paws?: number[];
  kicked?: boolean;
  flashback?: boolean;
  /** Needs a creature sacrificed as an additional cost (Eaten Alive). */
  sacrifice?: boolean;
  /** Needs a forage as an additional cost (Feed the Cycle). */
  forage?: boolean;
  /** Cast from the graveyard by removing this many +1/+1 counters (Quilled Greatwurm). */
  removeCounters?: number;
  /** Times multikicker was paid (Batroc). */
  kickCount?: number;
  cost: ManaCost;
  /** What it does on resolution; null for a permanent spell. */
  spell: SpellDef | null;
}

export { addCosts };

/** What restricted mana can be spent on: the spell's subtypes and card types ("only for Angels", "only for creature spells"). */
export function spellTags(d: CardDefinition): string[] {
  // Helga's mana: creature spells with mana value 4 or greater, or with {X}.
  const big =
    d.types.includes('Creature') && (manaValue(d.manaCost) >= 4 || !!d.manaCost.x)
      ? ['BigCreature']
      : [];
  // Final Fantasy (11b): The Emperor of Palamecia: "only to cast a noncreature spell".
  const noncreature = d.types.includes('Creature') ? [] : ['Noncreature'];
  // Plaza of Heroes: "only to cast a legendary spell".
  // Secrets of Strixhaven (14b): Hydro-Channeler: "only to cast an instant or sorcery spell".
  const instantOrSorcery =
    d.types.includes('Instant') || d.types.includes('Sorcery') ? ['InstantOrSorcery'] : [];
  return [...d.subtypes, ...d.types, ...d.supertypes, ...big, ...noncreature, ...instantOrSorcery];
}

const MAX_PAWS = 5;

/** Every choice of pawprint modes worth 1 to 5 {P}, repeats allowed, in printed order. */
export function pawCombos(d: CardDefinition): number[][] {
  const modes = d.pawprints ?? [];
  // Secrets of Strixhaven (14b): Moment of Reckoning chooses up to four.
  const max = d.pawBudget ?? MAX_PAWS;
  const out: number[][] = [];
  const grow = (from: number, chosen: number[], paws: number) => {
    if (chosen.length) out.push(chosen);
    for (let m = from; m < modes.length; m++)
      if (paws + modes[m]!.paws <= max) grow(m, [...chosen, m], paws + modes[m]!.paws);
  };
  grow(0, [], 0);
  return out;
}

/** Shifts target indices ({ target: n }, controllerOf, ownerOf) by `by`. */
function shiftTargets<T>(x: T, by: number): T {
  if (Array.isArray(x)) return x.map((v) => shiftTargets(v, by)) as T;
  if (x && typeof x === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(x))
      out[k] =
        (k === 'target' || k === 'controllerOf' || k === 'ownerOf') && typeof v === 'number'
          ? v + by
          : shiftTargets(v, by);
    return out as T;
  }
  return x;
}

const pawSpells = new WeakMap<CardDefinition, Map<string, SpellDef>>();

/** The chosen pawprint modes as one spell: their targets in a row, effects in printed order. */
export function pawSpell(d: CardDefinition, paws: readonly number[]): SpellDef {
  let cache = pawSpells.get(d);
  if (!cache) pawSpells.set(d, (cache = new Map()));
  const key = paws.join();
  let spell = cache.get(key);
  if (!spell) {
    const targets: SpellDef['targets'] = [];
    const effects: SpellDef['effects'] = [];
    for (const m of paws) {
      const mode = d.pawprints![m]!.spell;
      effects.push(...shiftTargets(mode.effects, targets.length));
      targets.push(...mode.targets);
    }
    spell = { targets, effects };
    cache.set(key, spell);
  }
  return spell;
}

/** The ways `d` can be cast from `zone` (empty if it can't be cast from there). */
export function castVariants(d: CardDefinition, zone: ZoneName, via?: CastVia): CastVariant[] {
  if (d.types.includes('Land')) return [];
  // Final Fantasy (11a): a transforming card's back face has no mana cost and can't be cast.
  if (d.noManaCost) return [];
  // Cast as if from hand, then adjusted for how.
  if (via) {
    const free = { generic: 0, colored: {} };
    return castVariants(d, 'hand').map((v) =>
      via === 'free'
        ? { ...v, cost: free }
        : via === 'festival'
          ? { ...v, life: 1 }
          : via === 'conduit'
            ? v
            : { ...v, forage: true, finality: true },
    );
  }
  // Dragon Man: cast from the graveyard as from the hand (plus a discard, see legal.ts).
  if (zone === 'graveyard' && d.castFromGraveyardWithDiscard) return castVariants(d, 'hand');
  // Mayhem: from the graveyard for its mayhem cost (legal.ts checks it was discarded this turn).
  if (zone === 'graveyard' && d.mayhem) return [{ cost: d.mayhem, spell: d.spell ?? null }];
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
  // Deep Analysis: "Flashback—{1}{U}, Pay 3 life."
  const life = flashback && d.flashbackLife ? { life: d.flashbackLife } : {};
  if (d.pawprints) return pawCombos(d).map((paws) => ({ paws, cost, spell: pawSpell(d, paws) }));
  const extra = flashback ? { flashback: true, ...life } : {};
  if (d.modes) {
    const modes: CastVariant[] = d.modes.map((spell, mode) => ({
      mode,
      // Final Fantasy (11a): tiered: each mode adds its own cost.
      cost: d.tiered?.[mode] ? addCosts(cost, d.tiered[mode]) : cost,
      spell,
      ...extra,
    }));
    // Teamwork's "choose both instead": the kicked spell is every mode at once.
    if (d.kicker?.spell)
      modes.push({
        kicked: true,
        cost: addCosts(cost, d.kicker.cost),
        spell: d.kicker.spell,
        ...extra,
      });
    return modes;
  }
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
  // Secrets of Strixhaven (14b): Group Project's flashback also taps three creatures.
  const flashSpell =
    flashback && d.flashbackTapCreatures && d.spell
      ? { ...d.spell, escalate: d.flashbackTapCreatures }
      : (d.spell ?? null);
  const out: CastVariant[] = [{ cost, spell: flashSpell, ...extra }];
  // Multikicker: paid once, twice or three times (more is rarely worth offering).
  if (d.multikicker)
    for (let k = 1; k <= 3; k++) {
      let c = cost;
      for (let i = 0; i < k; i++) c = addCosts(c, d.multikicker);
      out.push({ cost: c, spell: d.spell ?? null, kickCount: k, ...extra });
    }
  if (d.kicker)
    out.push({
      kicked: true,
      // Strixhaven (13b): an alternative cost replaces the mana cost.
      cost: d.kicker.replacesCost ? d.kicker.cost : addCosts(cost, d.kicker.cost),
      spell: d.kicker.spell ?? d.spell ?? null,
      // Final Fantasy (11b): a kicker paid with a permanent (chosen like a sacrifice).
      ...(d.kicker.sacrifice || d.kicker.returnLand ? { sacrifice: true } : {}),
      ...extra,
    });
  return out;
}

/** The variant a cast action or stack item refers to. */
export function variantOf(
  d: CardDefinition,
  zone: ZoneName,
  choice: {
    via?: CastVia | undefined;
    mode?: number | undefined;
    kicked?: boolean | undefined;
    sacrifice?: string | undefined;
    forage?: string | undefined;
    paws?: number[] | undefined;
    kickCount?: number | undefined;
  },
): CastVariant | undefined {
  return castVariants(d, zone, choice.via).find(
    (v) =>
      (v.mode ?? -1) === (choice.mode ?? -1) &&
      (v.kickCount ?? 0) === (choice.kickCount ?? 0) &&
      (v.paws ?? []).join() === (choice.paws ?? []).join() &&
      !!v.kicked === !!choice.kicked &&
      !!v.sacrifice === !!choice.sacrifice &&
      !!v.forage === !!choice.forage,
  );
}

/** Resolution effects for a spell on the stack. */
export function spellOnStack(
  d: CardDefinition,
  item: {
    mode?: number | undefined;
    kicked?: boolean | undefined;
    flashback?: boolean | undefined;
    paws?: number[] | undefined;
  },
): SpellDef | null {
  if (d.pawprints && item.paws) return pawSpell(d, item.paws);
  if (item.kicked && d.modes && d.kicker?.spell) return d.kicker.spell;
  if (d.modes) return d.modes[item.mode ?? 0] ?? null;
  if (item.flashback && d.flashbackSpell) return d.flashbackSpell;
  if (item.kicked && d.kicker?.spell) return d.kicker.spell;
  return d.spell ?? null;
}

// Teamwork (Marvel Super Heroes)

/** Several modes as one spell ("choose both"): their targets in order, effects renumbered. */
export function combineSpells(spells: readonly SpellDef[]): SpellDef {
  const targets: SpellDef['targets'] = [];
  const effects: SpellDef['effects'] = [];
  for (const mode of spells) {
    effects.push(...shiftTargets(mode.effects, targets.length));
    targets.push(...mode.targets);
  }
  return { targets, effects };
}
