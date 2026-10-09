import { commanderColors, legendaryColors, opponentLandColors } from './brawl.ts';
import { changeLife, damageSourceFor, dealDamage } from './effects.ts';
import {
  abilitiesLocked,
  canTapForAbility,
  countOf,
  hasAllCreatureTypes,
  isCreature,
  matchesFilter,
  power,
  subtypesOf,
} from './characteristics.ts';
import { type Ctx, addCounters, def, emit, obj, sacrifice, tap } from './context.ts';
import { manaValue, pipsOf } from './cost.ts';
import { CREATURE_TYPES } from './creature-types.ts';
import { hamletColorless } from './sos-14b-c-effects.ts';
import { yourLandColors } from './brawl-15b-g-effects.ts';
import { checkCondition } from './triggers.ts';
import type { Color, ManaCost, ManaType, ObjectId, PlayerId } from './types.ts';

export interface ManaSource {
  id: ObjectId;
  /** Each type it can make (one mana per tap), e.g. ['W', 'U'] for a dual land. */
  produces: ManaType[];
  isCreature: boolean;
  /** Sacrificed when used (Treasure). */
  sacrifice: boolean;
  /** Floating mana in the player's pool (spent first). */
  pool?: boolean;
  /** Types that deal 1 damage to its controller when it pays a coloured pip with them (Talismans). */
  pain?: ManaType[];
  // Reality Fracture (17a fixes): Loot, the Nexus; Doc Samson, Super Psychiatrist
  /** Every unit from this source (the entries with its id) must be the same colour: "N mana of any one color". */
  oneColor?: boolean;
}

function lanternFor(ctx: Ctx, player: PlayerId): boolean {
  return ctx.s.battlefield.some(
    (id) =>
      obj(ctx, id).controller === player &&
      def(ctx, id).abilities.some(
        (a) =>
          a.kind === 'static' &&
          a.effect.kind === 'landsTapForAnyColor' &&
          // Strixhaven Brawl (15b, multi): The World Tree, "as long as you control six or more lands".
          checkCondition(ctx, a.effect.condition, player, obj(ctx, id)),
      ),
  );
}

function treasuresDouble(ctx: Ctx, player: PlayerId): boolean {
  return ctx.s.battlefield.some(
    (id) =>
      obj(ctx, id).controller === player &&
      def(ctx, id).abilities.some(
        (a) => a.kind === 'static' && a.effect.kind === 'treasuresTapForTwo',
      ),
  );
}

/** Lorwyn Eclipsed (18b, red): a permanent anyone controls has Lavaleaper's mana ability (it affects every player). */
function basicLandsAddExtra(ctx: Ctx): boolean {
  return ctx.s.battlefield.some((id) =>
    def(ctx, id).abilities.some(
      (a) => a.kind === 'static' && a.effect.kind === 'basicLandsAddExtraMana',
    ),
  );
}

/** Final Fantasy (11c): `player` controls Ultima, Origin of Oblivion. */
function extraColorless(ctx: Ctx, player: PlayerId): boolean {
  return ctx.s.battlefield.some(
    (id) =>
      obj(ctx, id).controller === player &&
      def(ctx, id).abilities.some(
        (a) => a.kind === 'static' && a.effect.kind === 'extraColorlessFromLands',
      ),
  );
}

/** Sources to tap; `pain` lists those that hurt (one entry per pip they pay). */
export type Payment = ObjectId[] & { pain?: ObjectId[] };

/**
 * What restricted mana can be spent on when `source`'s ability is activated: 'CreatureAbility' for a creature (Shang-Chi), and
 * `Ability:<subtype>` for each of its creature types ("abilities of Elemental sources": Flamebraider).
 */
export function abilityTags(ctx: Ctx, source: ObjectId): string[] {
  const types = hasAllCreatureTypes(ctx, source) ? CREATURE_TYPES : subtypesOf(ctx, source);
  return [...(isCreature(ctx, source) ? ['CreatureAbility'] : []), ...types.map((s) => `Ability:${s}`)];
}

/** Pool entries are mana sources with ids like "pool:p1:0". */
const poolId = (player: PlayerId, i: number) => `pool:${player}:${i}`;
const isPoolId = (id: ObjectId) => id.startsWith('pool:');

export { manaValue };

/**
 * Untapped permanents with usable mana abilities. Lands sort before creatures,
 * and single-colour sources before flexible ones, so payment keeps the most
 * useful sources untapped.
 */
export function manaSources(
  ctx: Ctx,
  player: PlayerId,
  exclude?: ObjectId,
  /** Subtypes of the spell being paid for; restricted mana ("only for Angels") needs a match. */
  forSubtypes: readonly string[] = [],
): ManaSource[] {
  const out: ManaSource[] = [];
  (ctx.s.players[player].pool ?? []).forEach(
    (p, i) =>
      (!p.onlyFor || forSubtypes.includes(p.onlyFor)) &&
      (!p.notForHandSpells || !forSubtypes.includes('FromHand')) &&
      out.push({
        id: poolId(player, i),
        produces: p.produces,
        isCreature: false,
        sacrifice: false,
        pool: true,
      }),
  );
  for (const id of ctx.s.battlefield) {
    if (id === exclude || obj(ctx, id).controller !== player) continue;
    // Marvel Super Heroes Jumpstart (Wakanda): Secure Detention.
    if (abilitiesLocked(ctx, id)) continue;
    let produces: ManaType[] | null = null;
    let sacrifice = false;
    let double = false;
    let units = 1;
    let pain: ManaType[] | undefined;
    let oneColor = false;
    for (const a of def(ctx, id).abilities) {
      // Strixhaven Brawl (15b, g): Eldrazi Spawn and Scion tokens: "Sacrifice this token: Add {C}" needs no tap.
      if (a.kind !== 'mana' || (!a.cost.tapSelf && !a.cost.sacrificeSelf) || a.cost.mana) continue;
      // Strixhaven (13c): Spell Satchel: "Remove a book counter" as part of the cost.
      if (
        a.cost.removeCounters &&
        (obj(ctx, id).counters?.[a.cost.removeCounters.name] ?? 0) < a.cost.removeCounters.count
      )
        continue;
      // Unclaimed Territory: only for creature spells of the type chosen for it.
      const only = a.onlyFor === 'chosenType' ? (obj(ctx, id).chosenType ?? '?') : a.onlyFor;
      if (a.onlyFor === 'chosenType' && !forSubtypes.includes('Creature')) continue;
      // Lorwyn Eclipsed (18b, red): Flamebraider, "or activate abilities of Elemental sources" (tag `Ability:Elemental`).
      if (
        only &&
        !forSubtypes.includes(only) &&
        !(a.orAbilitiesOfSources && forSubtypes.includes(`Ability:${only}`))
      )
        continue;
      // Reality Fracture (17a): Heartwood Crafter.
      if (a.notForSpellsFromHand && forSubtypes.includes('FromHand')) continue;
      if (a.ifChosen && obj(ctx, id).chosenColor !== a.produces) continue;
      // Marvel Super Heroes lands: "Activate only if this land entered this turn or ...".
      if (a.condition && !checkCondition(ctx, a.condition, player, obj(ctx, id))) continue;
      // Brawl staples: Command Tower, Exotic Orchard, Sol Ring, Talismans.
      if (
        a.colorFrom === 'commander' &&
        !(commanderColors(ctx, player) as ManaType[]).includes(a.produces)
      )
        continue;
      if (a.colorFrom === 'opponentLands' && !opponentLandColors(ctx, player).includes(a.produces))
        continue;
      if (a.colorFrom === 'legendaries' && !legendaryColors(ctx, player).includes(a.produces))
        continue;
      // Strixhaven Brawl (15b, g): Incubation Druid.
      if (a.colorFrom === 'yourLands' && !yourLandColors(ctx, player).includes(a.produces))
        continue;
      // Reality Fracture (17a fixes): Loot, the Nexus; Doc Samson: N mana of any one colour, none if N is 0.
      if (a.anyOneColor) {
        const n = a.perPower ? power(ctx, id) : countOf(ctx, player, a.amountOf ?? 1, false, id);
        if (n <= 0 || (!a.cost.tapSelf ? obj(ctx, id).tapped : !canTapForAbility(ctx, id)))
          continue;
        oneColor = true;
        units = Math.max(units, n);
        produces ??= [];
        for (const c of ['W', 'U', 'B', 'R', 'G'] as const)
          if (!produces.includes(c)) produces.push(c);
        continue;
      }
      if (a.amount) units = Math.max(units, a.amount);
      // Strixhaven (13c): Accomplished Alchemist.
      if (a.perLifeGained) units = Math.max(units, ctx.s.turn.lifeGained?.[player] ?? 0);
      // Secrets of Strixhaven (14b): Topiary Lecturer.
      if (a.perPower) units = Math.max(units, power(ctx, id));
      // Elvish Archdruid: {G} for each Elf you control.
      if (a.amountOf !== undefined)
        units = Math.max(units, countOf(ctx, player, a.amountOf, false, id));
      if (a.pain) (pain ??= []).push(a.produces);
      if (a.doubleIf && checkCondition(ctx, a.doubleIf, player, obj(ctx, id))) double = true;
      // Strixhaven Brawl (15b, g): Incubation Druid (three mana), Astral Cornucopia (a mana per charge counter).
      if (a.tripleIf && checkCondition(ctx, a.tripleIf, player, obj(ctx, id)))
        units = Math.max(units, 3);
      if (a.perNamedCounters)
        units = Math.max(units, obj(ctx, id).counters?.[a.perNamedCounters] ?? 0);
      if (a.cost.sacrificeSelf) sacrifice = true;
      if (!produces) {
        if (!(!a.cost.tapSelf ? !obj(ctx, id).tapped : canTapForAbility(ctx, id))) break;
        produces = [];
      }
      if (!produces.includes(a.produces)) produces.push(a.produces);
    }
    // Secrets of Strixhaven (14b): Petrified Hamlet: lands with the chosen name have "{T}: Add {C}".
    if (
      def(ctx, id).types.includes('Land') &&
      hamletColorless(ctx, id) &&
      canTapForAbility(ctx, id)
    ) {
      produces ??= [];
      if (!produces.includes('C')) produces.push('C');
    }
    // Eluge: a land with a flood counter is an Island too.
    if (produces && obj(ctx, id).counters?.flood && !produces.includes('U')) produces.push('U');
    // Chromatic Lantern: lands tap for any colour.
    if (produces && def(ctx, id).types.includes('Land') && lanternFor(ctx, player))
      for (const c of ['W', 'U', 'B', 'R', 'G'] as const)
        if (!produces.includes(c)) produces.push(c);
    if (produces) {
      const src = {
        id,
        produces,
        isCreature: isCreature(ctx, id),
        sacrifice,
        ...(pain ? { pain } : {}),
        ...(oneColor ? { oneColor } : {}),
      };
      out.push(src);
      // Final Fantasy (11c): Ultima, Origin of Oblivion ("tap a land for {C}, add an additional {C}").
      if (
        produces.length === 1 &&
        produces[0] === 'C' &&
        def(ctx, id).types.includes('Land') &&
        extraColorless(ctx, player)
      )
        double = true;
      // Two mana from one tap: a second unit with the same id (tapping it twice is harmless).
      if (double) units = Math.max(units, 2);
      // Strixhaven Brawl (15b, r): Goldspan Dragon: Treasures tap for two mana.
      if (def(ctx, id).subtypes.includes('Treasure') && treasuresDouble(ctx, player))
        units = Math.max(units, 2);
      for (let i = 1; i < units; i++) out.push({ ...src });
      // Lorwyn Eclipsed (18b, red): Lavaleaper, "that player adds one mana of any type that land produced". The extra
      // mana is the same type as the one the tap makes: a land that can make several types is tied to one.
      if (def(ctx, id).supertypes.includes('Basic') && basicLandsAddExtra(ctx)) {
        out.push({ ...src });
        if (src.produces.length > 1) for (const x of out) if (x.id === id) x.oneColor = true;
      }
      // Reality Fracture (17a): Molten Tide: "whenever you tap a Mountain for mana, add an additional {R}".
      if (
        ctx.s.turn.moltenTide?.includes(player) &&
        def(ctx, id).types.includes('Land') &&
        def(ctx, id).subtypes.includes('Mountain')
      )
        out.push({ ...src, produces: ['R'] });
      // Strixhaven Brawl (15b, g): Utopia Sprawl: an extra mana of the chosen colour.
      for (const aura of ctx.s.battlefield) {
        const ao = obj(ctx, aura);
        if (
          ao.attachedTo === id &&
          ao.chosenColor &&
          def(ctx, aura).abilities.some(
            (x) => x.kind === 'static' && x.effect.kind === 'landBonusMana',
          )
        )
          out.push({ ...src, produces: [ao.chosenColor as ManaType] });
      }
    }
  }
  // Clement: Frogs you control have "{T}: Add {G} or {U}" (for creature spells).
  // Marvel Super Heroes Jumpstart (Wakanda): never through Secure Detention's lock.
  for (const src of ctx.s.battlefield) {
    const so = obj(ctx, src);
    if (so.controller !== player) continue;
    for (const a of def(ctx, src).abilities) {
      if (a.kind !== 'static' || a.effect.kind !== 'grantMana') continue;
      const g = a.effect;
      const granted = (id: ObjectId) => !!g.sourcesAbility || !abilitiesLocked(ctx, id);
      // Secrets of Strixhaven (14b): Resonating Lute: matching lands tap for `amount` mana (any of these) for such spells.
      if (g.onlyFor) {
        if (!forSubtypes.includes(g.onlyFor)) continue;
        for (const id of ctx.s.battlefield) {
          if (id === exclude || obj(ctx, id).controller !== player) continue;
          if (!matchesFilter(ctx, id, g.filter) || !canTapForAbility(ctx, id)) continue;
          if (!granted(id)) continue;
          for (let i = out.length - 1; i >= 0; i--) if (out[i]!.id === id) out.splice(i, 1);
          for (let k = 0; k < (g.amount ?? 1); k++)
            out.push({ id, produces: [...g.produces], isCreature: false, sacrifice: false });
        }
        continue;
      }
      if (g.onlyForCreatures && !forSubtypes.includes('Creature')) continue;
      // Final Fantasy (11c): mana from every permanent. A Realm Reborn: other permanents tap for any colour.
      if (g.otherPermanents) {
        for (const id of ctx.s.battlefield) {
          if (id === exclude || id === src || obj(ctx, id).controller !== player) continue;
          const have = out.find((x) => x.id === id && !x.pool);
          if (have) {
            for (const c of g.produces) if (!have.produces.includes(c)) have.produces.push(c);
            continue;
          }
          if (!canTapForAbility(ctx, id) || !granted(id)) continue;
          out.push({
            id,
            produces: [...g.produces],
            isCreature: isCreature(ctx, id),
            sacrifice: false,
          });
        }
        continue;
      }
      for (const id of ctx.s.battlefield) {
        if (id === exclude || obj(ctx, id).controller !== player || out.some((x) => x.id === id))
          continue;
        if (!isCreature(ctx, id) || !matchesFilter(ctx, id, g.filter)) continue;
        if (!canTapForAbility(ctx, id) || !granted(id)) continue;
        out.push({ id, produces: [...g.produces], isCreature: true, sacrifice: false });
      }
    }
  }
  // Treasure last, then creatures, then flexible sources.
  return out.sort(
    (a, b) =>
      Number(!!b.pool) - Number(!!a.pool) ||
      Number(a.sacrifice) - Number(b.sacrifice) ||
      Number(a.isCreature) - Number(b.isCreature) ||
      a.produces.length - b.produces.length,
  );
}

/**
 * Picks sources to tap for a cost: coloured pips by backtracking search (a
 * dual land can cover either of its colours), then generic from whatever is
 * left, in source order. Returns null if the cost can't be paid.
 */
export function findPayment(cost: ManaCost, sources: readonly ManaSource[]): ObjectId[] | null {
  // Secrets of Strixhaven (14b): {2/R} pips are paid with their colour where possible, else with two generic.
  const two = cost.twoHybrid ?? [];
  if (two.length) {
    const { twoHybrid: _unused, ...rest } = cost;
    // Reality Fracture (17a): Karn, Gilded Guardian ({2/W}{2/U}{2/B}{2/R}{2/G}): which pips go to generic matters
    // (a pool of Plains pays the {2/W} with its colour and the rest with two each), so try every choice,
    // paying as few pips as possible with generic mana.
    const choices = Array.from({ length: 1 << two.length }, (_, m) => m);
    const bits = (m: number) => m.toString(2).replace(/0/g, '').length;
    choices.sort((a, b) => bits(a) - bits(b));
    for (const m of choices) {
      const colored = { ...rest.colored };
      let generic = 0;
      two.forEach((t, i) => {
        if (m & (1 << i)) generic++;
        else colored[t] = (colored[t] ?? 0) + 1;
      });
      const plan = findPaymentBase(
        { ...rest, generic: rest.generic + 2 * generic, colored },
        sources,
      );
      if (plan) return plan;
    }
    return null;
  }
  return findPaymentBase(cost, sources);
}

function findPaymentBase(cost: ManaCost, sources: readonly ManaSource[]): ObjectId[] | null {
  const pips = pipsOf(cost);
  const key = pips.map((p) => p.join(''));
  const chosen: number[] = [];
  const used = new Array<boolean>(sources.length).fill(false);
  // Reality Fracture (17a fixes): "N mana of any one color": the colour the pips paid by one source were given.
  const colorOf = new Map<ObjectId, ManaType>();
  const assign = (i: number): boolean => {
    if (i === pips.length) return true;
    // Identical pips take sources in increasing order, so we don't retry permutations.
    const from = i > 0 && key[i - 1] === key[i] ? chosen[i - 1]! + 1 : 0;
    for (let j = from; j < sources.length; j++) {
      const src = sources[j]!;
      if (used[j]) continue;
      for (const t of pips[i]!) {
        if (!src.produces.includes(t)) continue;
        const had = colorOf.get(src.id);
        if (src.oneColor && had !== undefined && had !== t) continue;
        used[j] = true;
        chosen[i] = j;
        if (src.oneColor) colorOf.set(src.id, t);
        if (assign(i + 1)) return true;
        used[j] = false;
        if (src.oneColor && had === undefined) colorOf.delete(src.id);
      }
    }
    return false;
  };
  if (!assign(0)) return null;
  const out = chosen.map((j) => sources[j]!.id);
  let generic = cost.generic;
  for (let j = 0; j < sources.length && generic > 0; j++) {
    if (used[j]) continue;
    out.push(sources[j]!.id);
    generic--;
  }
  return generic > 0 ? null : out;
}

/** "Spend mana as though it were mana of any type": only the total matters. */
export function anyTypeCost(cost: ManaCost): ManaCost {
  return { generic: manaValue(cost), colored: {} };
}

/**
 * Taps the chosen sources, sacrificing those that are used up (Treasure).
 * Each entry is one mana; the total spent this turn feeds expend triggers.
 */
export function payMana(ctx: Ctx, sources: Readonly<Payment>): void {
  if (sources.length === 0) return;
  const first = sources[0]!;
  const player = isPoolId(first) ? (first.split(':')[1] as PlayerId) : obj(ctx, first).controller;
  const spent = (ctx.s.turn.manaSpent ??= { p1: 0, p2: 0 });
  const before = spent[player];
  spent[player] += sources.length;
  emit(ctx, { type: 'manaSpent', player, before, after: spent[player] });
  // Floating mana leaves the pool (highest index first, so the others keep theirs).
  const fromPool = sources
    .filter(isPoolId)
    .map((id) => Number(id.split(':')[2]))
    .sort((a, b) => b - a);
  for (const i of fromPool) {
    // Mystical Archive (16): Channel, mana that costs 1 life to use.
    if (ctx.s.players[player].pool![i]?.lifeCost) changeLife(ctx, player, -1);
    ctx.s.players[player].pool!.splice(i, 1);
  }
  for (const id of sources) {
    if (isPoolId(id)) continue;
    // A Treasure that taps for two (Goldspan Dragon) is listed twice: the first unit sacrifices it.
    if (!ctx.s.objects[id]) continue;
    tap(ctx, id);
    if (def(ctx, id).abilities.some((a) => a.kind === 'mana' && a.cost.sacrificeSelf))
      sacrifice(ctx, id);
    // Strixhaven (13c): Spell Satchel loses a book counter; Strixhaven Stadium gains a point counter.
    const left = ctx.s.objects[id];
    if (!left) continue;
    for (const a of def(ctx, id).abilities) {
      if (a.kind !== 'mana') continue;
      const o = ctx.s.objects[id];
      if (!o || o.zone !== 'battlefield') continue;
      if (a.cost.removeCounters && o.counters?.[a.cost.removeCounters.name])
        o.counters[a.cost.removeCounters.name]! -= a.cost.removeCounters.count;
      if (a.addCounter) addCounters(ctx, id, 1, a.addCounter);
    }
  }
  for (const id of sources.pain ?? [])
    dealDamage(ctx, damageSourceFor(ctx, id, player), { player }, 1, false);
}

/**
 * Convoke-style payment (Heirloom Epic): untapped creatures `player` controls
 * that aren't already mana sources, each paying for {1}.
 */
export function creatureHelpers(
  ctx: Ctx,
  player: PlayerId,
  sources: readonly ManaSource[],
  exclude?: ObjectId,
): ManaSource[] {
  return ctx.s.battlefield
    .filter((id) => {
      const o = obj(ctx, id);
      return (
        id !== exclude &&
        o.controller === player &&
        !o.tapped &&
        isCreature(ctx, id) &&
        !sources.some((x) => x.id === id)
      );
    })
    // Lorwyn Eclipsed (18a): a convoking creature pays for {1} or for one mana of one of its colours.
    .map((id) => ({ id, produces: [...def(ctx, id).colors], isCreature: true, sacrifice: false }));
}

/** Can `sources` pay this cost? (Precompute sources once when checking many costs.) */
export function canPayFrom(cost: ManaCost | undefined, sources: readonly ManaSource[]): boolean {
  if (!cost || manaValue(cost) === 0) return true;
  return findPayment(cost, sources) !== null;
}

/**
 * Chooses (or validates `payWith`) and returns the sources to tap.
 * Throws if the cost can't be paid.
 */
export function planPayment(
  ctx: Ctx,
  player: PlayerId,
  cost: ManaCost | undefined,
  payWith: readonly ObjectId[] | undefined,
  exclude?: ObjectId,
  forSubtypes?: readonly string[],
  extra: readonly ManaSource[] = [],
  /** Permanents leaving as part of the same cost (sacrificed): not used for mana. */
  avoid: readonly (ObjectId | undefined)[] = [],
): Payment {
  if (!cost || manaValue(cost) === 0) return [];
  let sources = [...manaSources(ctx, player, exclude, forSubtypes), ...extra];
  if (avoid.length) sources = sources.filter((s) => !avoid.includes(s.id));
  if (payWith) sources = sources.filter((s) => payWith.includes(s.id));
  const plan: Payment | null = findPayment(cost, sources);
  if (!plan) throw new Error('Cannot pay mana cost');
  // The first entries pay the coloured pips: a painful colour there hurts.
  pipsOf(cost).forEach((pip, i) => {
    const src = sources.find((s) => s.id === plan[i]);
    if (src?.pain && pip.every((t) => !src.produces.includes(t) || src.pain!.includes(t)))
      (plan.pain ??= []).push(src.id);
  });
  return plan;
}

// Improvise (Marvel Super Heroes)

/** Whether this spell has improvise: its own, or "noncreature spells you cast have improvise" (Ironheart). */
export function hasImprovise(ctx: Ctx, player: PlayerId, card: ObjectId): boolean {
  const d = def(ctx, card);
  if (d.improvise) return true;
  // Final Fantasy Commander (12b): Inspiring Statuary ("nonartifact spells you cast have improvise").
  if (
    !d.types.includes('Artifact') &&
    ctx.s.battlefield.some(
      (id) =>
        obj(ctx, id).controller === player &&
        def(ctx, id).abilities.some(
          (a) => a.kind === 'static' && a.effect.kind === 'nonartifactSpellsHaveImprovise',
        ),
    )
  )
    return true;
  if (d.types.includes('Creature')) return false;
  return ctx.s.battlefield.some(
    (id) =>
      obj(ctx, id).controller === player &&
      def(ctx, id).abilities.some(
        (a) => a.kind === 'static' && a.effect.kind === 'noncreatureSpellsHaveImprovise',
      ),
  );
}

/** Improvise: each untapped artifact you control can be tapped for {1} of the generic cost. */
export function artifactHelpers(
  ctx: Ctx,
  player: PlayerId,
  sources: readonly ManaSource[],
  exclude?: ObjectId,
): ManaSource[] {
  return ctx.s.battlefield
    .filter((id) => {
      const o = obj(ctx, id);
      return (
        id !== exclude &&
        o.controller === player &&
        !o.tapped &&
        def(ctx, id).types.includes('Artifact') &&
        !sources.some((x) => x.id === id)
      );
    })
    .map((id) => ({ id, produces: ['C'], isCreature: false, sacrifice: false }));
}

/**
 * Secrets of Strixhaven (14a): converge. The colours of mana a payment spent: each mana is one of
 * its source's types, and the payer is assumed to have chosen so as to spend the most distinct
 * colours (a bipartite matching of colours to mana). Mana from pool entries and sources the
 * payment can't identify (convoke helpers) count as colourless.
 */
export function colorsSpent(ctx: Ctx, player: PlayerId, payment: readonly ObjectId[]): Color[] {
  const sources = manaSources(ctx, player);
  // Reality Fracture (17a fixes): the units of an "any one color" source are one colour between them.
  const seenOneColor = new Set<ObjectId>();
  const options: ManaType[][] = payment.map((id) => {
    const src = sources.find((s) => s.id === id);
    if (src?.oneColor) {
      if (seenOneColor.has(id)) return [];
      seenOneColor.add(id);
    }
    return src?.produces ?? [];
  });
  const colors = ['W', 'U', 'B', 'R', 'G'] as const;
  // colour -> index of the mana assigned to it
  const owner = new Map<Color, number>();
  const assign = (i: number, seen: Set<Color>): boolean => {
    for (const c of colors) {
      if (!options[i]!.includes(c) || seen.has(c)) continue;
      seen.add(c);
      const cur = owner.get(c);
      if (cur === undefined || assign(cur, seen)) {
        owner.set(c, i);
        return true;
      }
    }
    return false;
  };
  for (let i = 0; i < options.length; i++) assign(i, new Set());
  return colors.filter((c) => owner.has(c));
}
