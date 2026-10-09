import {
  cardMatches,
  characteristics,
  creaturesOnBattlefield,
  hasAllCreatureTypes,
  hasKeyword,
  hasSubtype,
  matchesFilter,
  NON_CREATURE_SUBTYPES,
  subtypesOf,
  toughness,
} from './characteristics.ts';
import {
  type Ctx,
  type CustomEffect,
  addCounters,
  def,
  emit,
  moveObject,
  newTimestamp,
  obj,
} from './context.ts';
import { CREATURE_TYPES } from './creature-types.ts';
import { manaSources } from './mana.ts';
import type {
  CardDb,
  CardDefId,
  CardFilter,
  Color,
  EffectSource,
  ObjectId,
  ObjectRef,
  PlayerId,
  StaticDef,
} from './types.ts';

/**
 * Lorwyn Eclipsed (18a): blight, vivid, evoke, persist, behold-and-exile, mana spent by colour, all creature types.
 * Engine helpers; the card vocabulary is in types.ts (search "Lorwyn Eclipsed (18a)").
 */

// ---------------------------------------------------------------------------
// Which permanents have a static ability of a kind (cached per database: these checks run for every cast)
// ---------------------------------------------------------------------------

const staticDefsCache = new WeakMap<CardDb, Map<string, ReadonlySet<CardDefId>>>();

/** Does `player` control a permanent with a static ability of this kind? */
function controlsStatic(ctx: Ctx, player: PlayerId, kind: StaticDef['kind']): boolean {
  let byKind = staticDefsCache.get(ctx.db);
  if (!byKind) staticDefsCache.set(ctx.db, (byKind = new Map()));
  let ids = byKind.get(kind);
  if (!ids) {
    ids = new Set(
      [...ctx.db.values()]
        .filter((d) => d.abilities.some((a) => a.kind === 'static' && a.effect.kind === kind))
        .map((d) => d.id),
    );
    byKind.set(kind, ids);
  }
  if (ids.size === 0) return false;
  return ctx.s.battlefield.some((id) => {
    const o = obj(ctx, id);
    return (
      o.controller === player &&
      ids.has(o.defId) &&
      def(ctx, id).abilities.some((a) => a.kind === 'static' && a.effect.kind === kind)
    );
  });
}

// ---------------------------------------------------------------------------
// Blight N: put N -1/-1 counters on a creature you control
// ---------------------------------------------------------------------------

/** The creatures `player` can blight: every creature they control. */
export function blightCreatures(ctx: Ctx, player: PlayerId): ObjectId[] {
  return creaturesOnBattlefield(ctx, player).map((o) => o.id);
}

/** "X can't be greater than the greatest toughness among creatures you control" (Soul Immolation). */
export function greatestToughness(ctx: Ctx, player: PlayerId): number {
  return creaturesOnBattlefield(ctx, player).reduce(
    (best, c) => Math.max(best, toughness(ctx, c.id)),
    0,
  );
}

/** `player` blights `id`: N -1/-1 counters on it. */
export function blightCreature(ctx: Ctx, player: PlayerId, id: ObjectId, amount: number): void {
  const o = ctx.s.objects[id];
  if (amount <= 0 || !o || o.zone !== 'battlefield') return;
  addCounters(ctx, id, amount, '-1/-1', player);
  emit(ctx, { type: 'blighted', player, id, amount });
}

/** Is blighting `id` legal as a cost paid by `player`? (A creature they control.) */
export function canBlight(ctx: Ctx, player: PlayerId, id: ObjectId | undefined): boolean {
  return (
    id !== undefined &&
    ctx.s.objects[id]?.zone === 'battlefield' &&
    ctx.s.objects[id]!.controller === player &&
    characteristics(ctx, id).types.includes('Creature')
  );
}

// ---------------------------------------------------------------------------
// Vivid: the number of colours among permanents you control
// ---------------------------------------------------------------------------

export function vividColors(ctx: Ctx, player: PlayerId): Color[] {
  const colors = new Set<Color>();
  for (const id of ctx.s.battlefield)
    if (obj(ctx, id).controller === player) for (const c of def(ctx, id).colors) colors.add(c);
  return [...colors];
}

export function vividCount(ctx: Ctx, player: PlayerId): number {
  return vividColors(ctx, player).length;
}

// ---------------------------------------------------------------------------
// Mana spent, by colour ("if {W}{W} was spent to cast it")
// ---------------------------------------------------------------------------

const COLORS: readonly Color[] = ['W', 'U', 'B', 'R', 'G'];
const CAP = 2;

/**
 * The best split of mana `options` (each mana: the types its source can make) into colours, for conditions that ask
 * for up to two mana of a colour: the split with the most colours at two or more, then the most mana of any colour.
 * Counts are capped at 2.
 */
export function bestColorSplit(
  options: readonly (readonly string[])[],
): Partial<Record<Color, number>> {
  let states = new Map<string, number[]>([['0,0,0,0,0', [0, 0, 0, 0, 0]]]);
  for (const opt of options) {
    const cols = COLORS.filter((c) => opt.includes(c));
    if (cols.length === 0) continue;
    const next = new Map<string, number[]>();
    for (const counts of states.values())
      for (const c of cols) {
        const n = counts.slice();
        const i = COLORS.indexOf(c);
        n[i] = Math.min(CAP, n[i]! + 1);
        next.set(n.join(), n);
      }
    states = next;
  }
  let best: number[] = [0, 0, 0, 0, 0];
  let bestScore = -1;
  for (const counts of states.values()) {
    const score = counts.filter((n) => n >= CAP).length * 100 + counts.reduce((a, b) => a + b, 0);
    if (score > bestScore) {
      best = counts;
      bestScore = score;
    }
  }
  const out: Partial<Record<Color, number>> = {};
  COLORS.forEach((c, i) => {
    if (best[i]) out[c] = best[i]!;
  });
  return out;
}

/** The colours of mana a payment spent, as a split for `manaSpentColors` (read before the sources tap). */
export function colorSplitOfPayment(
  ctx: Ctx,
  player: PlayerId,
  payment: readonly ObjectId[],
): Partial<Record<Color, number>> {
  const sources = manaSources(ctx, player);
  const seenOneColor = new Set<ObjectId>();
  const options = payment.map((id) => {
    const src = sources.find((s) => s.id === id);
    if (src?.oneColor) {
      if (seenOneColor.has(id)) return [];
      seenOneColor.add(id);
    }
    return src?.produces ?? [];
  });
  return bestColorSplit(options);
}

/** Did the mana spent on `id` include at least these amounts of each colour? */
export function spentColors(
  ctx: Ctx,
  id: ObjectId,
  colors: Partial<Record<Color, number>>,
): boolean {
  const paid = ctx.s.objects[id]?.manaPaid;
  if (!paid) return false;
  return (Object.entries(colors) as [Color, number][]).every(([c, n]) => (paid[c] ?? 0) >= n);
}

// ---------------------------------------------------------------------------
// Removing counters of any kind
// ---------------------------------------------------------------------------

/** The counters on a permanent by kind ('+1/+1' for plus-one counters). */
export function counterKinds(ctx: Ctx, id: ObjectId): Record<string, number> {
  const o = obj(ctx, id);
  const out: Record<string, number> = {};
  if (o.plusOneCounters > 0) out['+1/+1'] = o.plusOneCounters;
  for (const [k, n] of Object.entries(o.counters ?? {})) if (n > 0) out[k] = n;
  return out;
}

/** Every way to take `n` counters off a permanent: lists of kinds (a kind repeated for each counter of it). */
export function counterRemovals(ctx: Ctx, id: ObjectId, n: number): string[][] {
  const kinds = Object.entries(counterKinds(ctx, id));
  const out: string[][] = [];
  const grow = (from: number, chosen: string[]): void => {
    if (chosen.length === n) {
      out.push(chosen);
      return;
    }
    for (let i = from; i < kinds.length; i++) {
      const [kind, have] = kinds[i]!;
      if (chosen.filter((k) => k === kind).length < have) grow(i, [...chosen, kind]);
    }
  };
  grow(0, []);
  return out;
}

/** The counters of every kind on a permanent: as it is, or as it last was on the battlefield if it left. */
export function countersOnLeft(
  o:
    | {
        zone?: string;
        plusOneCounters: number;
        counters?: Record<string, number>;
        lastCounters?: number;
        lastNamedCounters?: Record<string, number>;
      }
    | null
    | undefined,
): number {
  if (!o) return 0;
  const named = (o.zone === 'battlefield' ? o.counters : o.lastNamedCounters) ?? {};
  const plus = o.zone === 'battlefield' ? o.plusOneCounters : (o.lastCounters ?? 0);
  return plus + Object.values(named).reduce((a, b) => a + b, 0);
}

/** Takes counters of these kinds (one entry for each) off a permanent. */
export function removeCounterKinds(ctx: Ctx, id: ObjectId, kinds: readonly string[]): void {
  const o = obj(ctx, id);
  for (const k of kinds) {
    if (k === '+1/+1') o.plusOneCounters = Math.max(0, o.plusOneCounters - 1);
    else if (o.counters?.[k]) o.counters[k]!--;
  }
}

// ---------------------------------------------------------------------------
// Persist
// ---------------------------------------------------------------------------

/** Would this creature persist if it died now? (A nontoken creature with persist and no -1/-1 counters on it.) */
export function willPersist(ctx: Ctx, id: ObjectId): boolean {
  const o = ctx.s.objects[id];
  if (!o || o.zone !== 'battlefield' || o.isToken) return false;
  if (!characteristics(ctx, id).types.includes('Creature')) return false;
  return hasKeyword(ctx, id, 'persist') && (o.counters?.['-1/-1'] ?? 0) === 0;
}

/**
 * Persist's trigger resolving: the card (if it's still in the graveyard) returns to the battlefield under its owner's control
 * with a -1/-1 counter on it.
 */
export function persistReturn(ctx: Ctx, es: EffectSource): void {
  const ref = es.source;
  const o = ref && ctx.s.objects[ref.id];
  if (!ref || !o || o.zone !== 'graveyard' || o.zcc !== ref.zcc) return;
  moveObject(ctx, o.id, 'battlefield', { controller: o.owner });
  addCounters(ctx, o.id, 1, '-1/-1', es.controller);
}

// ---------------------------------------------------------------------------
// Behold … and exile it
// ---------------------------------------------------------------------------

/**
 * What `player` can behold and exile for a Champion: a permanent they control matching the filter, or another matching card in
 * their hand. Permanents that are alike in every way that matters (same card, counters, tapped state) are one choice; so are
 * cards in hand with the same name.
 */
export function beholdExileOptions(
  ctx: Ctx,
  player: PlayerId,
  card: ObjectId,
  filter: CardFilter,
): ObjectId[] {
  const seen = new Set<string>();
  const unique = (id: ObjectId, key: string): ObjectId[] => {
    if (seen.has(key)) return [];
    seen.add(key);
    return [id];
  };
  return [
    ...ctx.s.battlefield
      .filter((id) => obj(ctx, id).controller === player && matchesFilter(ctx, id, filter))
      .flatMap((id) => {
        const o = obj(ctx, id);
        return unique(
          id,
          [
            'b',
            o.defId,
            o.isToken,
            o.tapped,
            o.damage,
            o.plusOneCounters,
            JSON.stringify(o.counters ?? {}),
            o.attachedTo ?? '',
          ].join('|'),
        );
      }),
    ...ctx.s.players[player].hand
      .filter((id) => id !== card && cardMatches(ctx, id, filter))
      .flatMap((id) => unique(id, `h|${obj(ctx, id).defId}`)),
  ];
}

/**
 * Every way `player` can behold `count` things for a cost like "Behold three Elementals": permanents they control or cards in
 * their hand matching the filter. Choices that are alike (same card in the same zone, same counters) count once.
 */
export function beholdManyOptions(
  ctx: Ctx,
  player: PlayerId,
  card: ObjectId,
  filter: CardFilter,
  count: number,
): ObjectId[][] {
  const groups = new Map<string, ObjectId[]>();
  const add = (id: ObjectId, key: string) => groups.set(key, [...(groups.get(key) ?? []), id]);
  for (const id of ctx.s.battlefield)
    if (obj(ctx, id).controller === player && matchesFilter(ctx, id, filter)) {
      const o = obj(ctx, id);
      add(
        id,
        [
          'b',
          o.defId,
          o.isToken,
          o.tapped,
          o.plusOneCounters,
          JSON.stringify(o.counters ?? {}),
        ].join('|'),
      );
    }
  for (const id of ctx.s.players[player].hand)
    if (id !== card && cardMatches(ctx, id, filter)) add(id, `h|${obj(ctx, id).defId}`);
  const lists = [...groups.values()];
  const out: ObjectId[][] = [];
  const grow = (from: number, chosen: ObjectId[]): void => {
    if (chosen.length === count) {
      out.push(chosen);
      return;
    }
    for (let i = from; i < lists.length; i++) {
      const used = chosen.filter((id) => lists[i]!.includes(id)).length;
      if (used < lists[i]!.length) grow(i, [...chosen, lists[i]![used]!]);
    }
  };
  grow(0, []);
  return out;
}

/** The Champions' leave trigger: the exiled card goes to its owner's hand (if it's still in exile). */
export function returnBeholdExiled(ctx: Ctx, es: EffectSource): void {
  const self = es.source && ctx.s.objects[es.source.id];
  const ref: ObjectRef | undefined = self?.lastBeholdExiled;
  if (!self || !ref) return;
  delete self.lastBeholdExiled;
  const card = ctx.s.objects[ref.id];
  if (card && card.zone === 'exile' && card.zcc === ref.zcc) moveObject(ctx, card.id, 'hand');
}

// ---------------------------------------------------------------------------
// All creature types
// ---------------------------------------------------------------------------

/** "Gains all creature types": for good (Oko's +2) or until end of turn (Glamer Gifter). */
export function giveAllCreatureTypes(
  ctx: Ctx,
  id: ObjectId,
  duration: 'permanent' | 'endOfTurn',
): void {
  const o = obj(ctx, id);
  if (o.zone !== 'battlefield') return;
  if (duration === 'permanent') {
    o.allCreatureTypes = newTimestamp(ctx);
    return;
  }
  ctx.s.effects.push({
    timestamp: newTimestamp(ctx),
    affected: { id, zcc: o.zcc },
    power: 0,
    toughness: 0,
    keywords: [],
    allCreatureTypes: true,
    expires: 'endOfTurn',
  });
}

/** "Loses all creature types until end of turn" (Nameless Inversion). */
export function loseAllCreatureTypes(ctx: Ctx, id: ObjectId): void {
  const o = obj(ctx, id);
  if (o.zone !== 'battlefield') return;
  ctx.s.effects.push({
    timestamp: newTimestamp(ctx),
    affected: { id, zcc: o.zcc },
    power: 0,
    toughness: 0,
    keywords: [],
    noCreatureTypes: true,
    expires: 'endOfTurn',
  });
}

// ---------------------------------------------------------------------------
// Conspire
// ---------------------------------------------------------------------------

/** Does this spell have conspire: printed, or from "each noncreature spell you cast has conspire" (Raiding Schemes)? */
export function hasConspire(ctx: Ctx, player: PlayerId, card: ObjectId): boolean {
  const d = def(ctx, card);
  if (d.conspire) return true;
  if (d.types.includes('Creature')) return false;
  return controlsStatic(ctx, player, 'noncreatureSpellsHaveConspire');
}

/** The untapped creatures `player` controls that share a colour with the spell: what conspire may tap. */
export function conspireOptions(ctx: Ctx, player: PlayerId, card: ObjectId): ObjectId[] {
  const colors = def(ctx, card).colors;
  if (colors.length === 0) return [];
  return creaturesOnBattlefield(ctx, player)
    .filter((c) => !c.tapped && def(ctx, c.id).colors.some((x) => colors.includes(x)))
    .map((c) => c.id);
}

// ---------------------------------------------------------------------------
// Behold N creatures of a chosen type (Celestial Reunion)
// ---------------------------------------------------------------------------

/** What `player` can behold for a creature cost: creatures they control and creature cards in their hand (not `card`). */
function creatureBeholdables(ctx: Ctx, player: PlayerId, card: ObjectId): ObjectId[] {
  return [
    ...creaturesOnBattlefield(ctx, player).map((c) => c.id),
    ...ctx.s.players[player].hand.filter(
      (id) => id !== card && def(ctx, id).types.includes('Creature'),
    ),
  ];
}

/**
 * Creature types of which `player` could behold `count` creatures (for "choose a creature type and behold two creatures of that
 * type"). A changeling is every type, so with enough of them any creature type is on offer.
 */
export function beholdTypes(ctx: Ctx, player: PlayerId, card: ObjectId, count: number): string[] {
  const pool = creatureBeholdables(ctx, player, card);
  if (pool.length < count) return [];
  const changelings = pool.filter((id) => hasAllCreatureTypes(ctx, id)).length;
  const named = new Set<string>();
  for (const id of pool)
    for (const t of subtypesOf(ctx, id)) if (!NON_CREATURE_SUBTYPES.has(t)) named.add(t);
  const candidates = changelings >= count ? CREATURE_TYPES : [...named];
  return [...new Set(candidates)]
    .filter((t) => pool.filter((id) => hasSubtype(ctx, id, t)).length >= count)
    .sort();
}

/** The creatures that can be beheld for `type`. */
export function beholdOfType(ctx: Ctx, player: PlayerId, card: ObjectId, type: string): ObjectId[] {
  return creatureBeholdables(ctx, player, card).filter((id) => hasSubtype(ctx, id, type));
}

// ---------------------------------------------------------------------------
// Dawnhand Dissident: cast cards exiled with it by removing counters from among your creatures
// ---------------------------------------------------------------------------

type CastExiled = Extract<StaticDef, { kind: 'castExiledWithSelf' }>;

/** The permissions of this kind `player` has: each permanent they control with the static and the cards it exiled that they own. */
function exiledWithPermissions(
  ctx: Ctx,
  player: PlayerId,
): { source: ObjectId; effect: CastExiled; cards: ObjectId[] }[] {
  const out: { source: ObjectId; effect: CastExiled; cards: ObjectId[] }[] = [];
  if (!controlsStatic(ctx, player, 'castExiledWithSelf')) return out;
  for (const id of ctx.s.battlefield) {
    const o = obj(ctx, id);
    if (o.controller !== player) continue;
    for (const a of def(ctx, id).abilities) {
      if (a.kind !== 'static' || a.effect.kind !== 'castExiledWithSelf') continue;
      const effect = a.effect;
      if (effect.yourTurnOnly && ctx.s.turn.activePlayer !== player) continue;
      out.push({
        source: id,
        effect,
        cards: (o.exiledWith ?? []).filter((c) => {
          const x = ctx.s.objects[c];
          return (
            x?.zone === 'exile' &&
            x.owner === player &&
            cardMatches(ctx, c, effect.filter, id) &&
            !def(ctx, c).types.includes('Land')
          );
        }),
      });
    }
  }
  return out;
}

/** The counters on creatures `player` controls, one entry for each creature and kind. */
export function creatureCounterOptions(
  ctx: Ctx,
  player: PlayerId,
): { creature: ObjectId; kind: string }[] {
  return creaturesOnBattlefield(ctx, player).flatMap((c) =>
    Object.keys(counterKinds(ctx, c.id)).map((kind) => ({ creature: c.id, kind })),
  );
}

/** Counters on creatures `player` controls, all kinds together. */
export function creatureCounterTotal(ctx: Ctx, player: PlayerId): number {
  return creaturesOnBattlefield(ctx, player).reduce(
    (n, c) => n + Object.values(counterKinds(ctx, c.id)).reduce((a, b) => a + b, 0),
    0,
  );
}

/** Cards `player` may cast from exile by removing counters, with how many (those they have enough counters for). */
export function exiledWithCastable(ctx: Ctx, player: PlayerId): Map<ObjectId, number> {
  const out = new Map<ObjectId, number>();
  const total = creatureCounterTotal(ctx, player);
  for (const p of exiledWithPermissions(ctx, player))
    if (total >= p.effect.removeCounters)
      for (const c of p.cards)
        out.set(c, Math.min(out.get(c) ?? Infinity, p.effect.removeCounters));
  return out;
}

// ---------------------------------------------------------------------------
// Convoke granted to creature spells
// ---------------------------------------------------------------------------

/** Does this spell have convoke: printed, or "creature spells you cast have convoke" (Eirdu, Carrier of Dawn)? */
export function hasConvoke(ctx: Ctx, player: PlayerId, card: ObjectId): boolean {
  const d = def(ctx, card);
  if (d.convoke) return true;
  if (!d.types.includes('Creature')) return false;
  return controlsStatic(ctx, player, 'creatureSpellsHaveConvoke');
}

// ---------------------------------------------------------------------------
// Custom effects
// ---------------------------------------------------------------------------

export const ECL_18A_EFFECTS: Record<string, CustomEffect> = {
  /** The chosen creature of a `blight` effect gets its counters (`params`: `amount`, `player`). */
  blightChosen(ctx, es, params) {
    const p = params as { amount: number; player: PlayerId } | undefined;
    if (!p || !es.chosen) return;
    const o = ctx.s.objects[es.chosen.id];
    if (!o || o.zone !== 'battlefield' || o.zcc !== es.chosen.zcc) return;
    blightCreature(ctx, p.player, es.chosen.id, p.amount);
  },
};
