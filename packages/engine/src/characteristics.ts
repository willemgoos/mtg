import { commanderTypes, isCommander } from './brawl.ts';
import { type Ctx, def, defOf, obj, other } from './context.ts';
import { manaValue } from './cost.ts';
import { checkCondition } from './triggers.ts';
import type {
  Amount,
  CardDb,
  CardDefinition,
  CardDefId,
  CardFilter,
  CardType,
  GameObject,
  Keyword,
  ObjectId,
  PlayerId,
} from './types.ts';

export interface Characteristics {
  power: number;
  toughness: number;
  /** Shared between calls: never mutate. */
  keywords: ReadonlySet<Keyword>;
  types: readonly CardType[];
  subtypes: readonly string[];
  cantBlock: boolean;
  cantBeBlocked: boolean;
  cantAttack: boolean;
}

/**
 * Current characteristics of a permanent: printed values + counters +
 * until-end-of-turn effects + static abilities of permanents (a small layer-7
 * subset; every effect in our pool is additive, so order doesn't matter).
 */
export function characteristics(ctx: Ctx, id: ObjectId): Characteristics {
  const o = obj(ctx, id);
  const d = def(ctx, id);
  const onField = o.zone === 'battlefield';
  const base = d.ptEquals !== undefined && onField ? countFor(ctx, o, d) : null;
  const basePower =
    d.powerEquals !== undefined && onField ? countOf(ctx, o.controller, d.powerEquals, true) : null;
  let power = (basePower ?? base ?? o.copyPT?.power ?? d.power ?? 0) + o.plusOneCounters;
  let toughness = (base ?? o.copyPT?.toughness ?? d.toughness ?? 0) + o.plusOneCounters;
  // Copy-on-write: most creatures have no granted keywords, so share the printed set.
  let keywords = printedKeywords(d);
  let granted: Set<Keyword> | null = null;
  let cantBlock = false;
  let cantBeBlocked = false;
  let cantAttack = false;
  const removed = new Set<Keyword>();
  // Final Fantasy (11a): job select ("is a Knight in addition to its other types").
  const extraSubtypes: string[] = [];
  // A Vehicle that became an artifact creature this turn.
  let crewed = false;

  if (o.zone === 'battlefield') {
    for (const e of ctx.s.effects) {
      if (e.basePT && e.affected.id === id && e.affected.zcc === o.zcc) {
        power += e.basePT[0] - (basePower ?? base ?? o.copyPT?.power ?? d.power ?? 0);
        toughness += e.basePT[1] - (base ?? o.copyPT?.toughness ?? d.toughness ?? 0);
      }
    }
    for (const e of ctx.s.effects) {
      if (e.affected.id !== id || e.affected.zcc !== o.zcc) continue;
      if (e.becomesCreature) crewed = true;
      power += e.power;
      toughness += e.toughness;
      if (e.cantBlock) cantBlock = true;
      if (e.cantAttack) cantAttack = true; // Strixhaven (13c): Academic Probation
      if (e.cantBeBlocked) cantBeBlocked = true;
      if (e.keywords.length) {
        granted ??= new Set(keywords);
        for (const k of e.keywords) granted.add(k);
      }
    }
    // Its own static abilities that only affect itself.
    for (const a of d.abilities) {
      if (a.kind !== 'static') continue;
      const st = a.effect;
      if (st.kind === 'cantBlock') cantBlock = true;
      else if (st.kind === 'cantBeBlocked') cantBeBlocked = true;
      // Bast: "can't attack or block unless you control three or more creatures".
      else if (
        st.kind === 'while' &&
        st.cantAttackOrBlock &&
        checkCondition(ctx, st.condition, o.controller, o)
      ) {
        cantAttack = cantBlock = true;
        continue;
      } else if (st.kind === 'boost') {
        power += countOf(ctx, o.controller, st.power, true, id);
        toughness += countOf(ctx, o.controller, st.toughness, true, id);
      } else if (st.kind === 'while' || st.kind === 'whileLife') {
        const on =
          st.kind === 'while'
            ? checkCondition(ctx, st.condition, o.controller, o)
            : ctx.s.players[o.controller].life >= st.minLife;
        if (!on) continue;
        power += st.power;
        toughness += st.toughness;
        if (st.kind === 'while' && st.cantBeBlocked) cantBeBlocked = true;
        if (st.keywords?.length) {
          granted ??= new Set(keywords);
          for (const k of st.keywords) granted.add(k);
        }
      }
    }
    if (o.grantedKeywords?.length) {
      granted ??= new Set(keywords);
      for (const k of o.grantedKeywords) granted.add(k);
    }
    // Keyword counters (a flying counter, an indestructible counter).
    if (o.counters)
      for (const k of COUNTER_KEYWORDS)
        if (o.counters[k]) {
          granted ??= new Set(keywords);
          granted.add(k);
        }
    // Static abilities of permanents that affect others: anthems, Auras, Equipment.
    const affecting = affectingDefs(ctx.db);
    for (const srcId of ctx.s.battlefield) {
      const src = obj(ctx, srcId);
      if (!affecting.has(src.defId)) continue;
      for (const a of def(ctx, srcId).abilities) {
        if (a.kind !== 'static') continue;
        const st = a.effect;
        if (st.kind === 'attached') {
          if (src.attachedTo !== id) continue;
          if (st.cantAttackOrBlock) cantAttack = cantBlock = true;
          if (st.cantBeBlocked) cantBeBlocked = true;
          if (st.loseKeywords?.length) {
            granted ??= new Set(keywords);
            for (const k of st.loseKeywords) removed.add(k);
          }
          // Hulkbuster Armor: base 9/9.
          if (st.basePT) {
            power += st.basePT[0] - (basePower ?? base ?? o.copyPT?.power ?? d.power ?? 0);
            toughness += st.basePT[1] - (base ?? o.copyPT?.toughness ?? d.toughness ?? 0);
          }
          power += countOf(ctx, src.controller, st.power);
          toughness += countOf(ctx, src.controller, st.toughness);
          if (st.keywords?.length) {
            granted ??= new Set(keywords);
            for (const k of st.keywords) granted.add(k);
          }
          // Final Fantasy (11a): job select.
          if (st.addSubtypes) extraSubtypes.push(...st.addSubtypes);
          if (st.yourTurnKeywords?.length && ctx.s.turn.activePlayer === src.controller) {
            granted ??= new Set(keywords);
            for (const k of st.yourTurnKeywords) granted.add(k);
          }
          continue;
        }
        // Maha: "Creatures your opponents control have base toughness 1."
        if (st.kind === 'opponentsBaseToughness') {
          if (src.controller !== o.controller && d.types.includes('Creature'))
            toughness += st.toughness - (base ?? o.copyPT?.toughness ?? d.toughness ?? 0);
          continue;
        }
        if (st.kind !== 'anthem') continue;
        if (st.filter && !cardMatches(ctx, id, st.filter, srcId)) continue;
        if (st.condition && !checkCondition(ctx, st.condition, src.controller, src)) continue;
        const opponents = st.affects === 'creaturesOpponentsControl';
        if ((src.controller !== o.controller) !== opponents || !d.types.includes('Creature'))
          continue;
        if (st.affects === 'otherCreaturesYouControl' && srcId === id) continue;
        if (st.filter?.subtype && !hasSubtype(ctx, id, st.filter.subtype)) continue;
        if (st.filter?.token && !o.isToken) continue;
        if (
          st.filter?.hasCounters &&
          !o.plusOneCounters &&
          !Object.values(o.counters ?? {}).some((n) => n > 0)
        )
          continue;
        if (
          st.filter?.equipped &&
          !ctx.s.battlefield.some(
            (e) => obj(ctx, e).attachedTo === id && def(ctx, e).subtypes.includes('Equipment'),
          )
        )
          continue;
        if (
          st.filter?.chosenTypeOfSource &&
          !(src.chosenType && hasSubtype(ctx, id, src.chosenType))
        )
          continue;
        // Printed keywords only (avoids recursion through other anthems).
        if (st.filter?.hasKeyword && !d.keywords.includes(st.filter.hasKeyword)) continue;
        if (
          st.filter?.minPlusOneCounters !== undefined &&
          o.plusOneCounters < st.filter.minPlusOneCounters
        )
          continue;
        if (st.filter?.attacking !== undefined && isAttacking(ctx, id) !== st.filter.attacking)
          continue;
        // Strixhaven (13c): Augusta, Dean of Order (tapped and untapped creatures).
        if (st.filter?.tapped !== undefined && o.tapped !== st.filter.tapped) continue;
        if (st.filter?.colors && !st.filter.colors.some((color) => d.colors.includes(color)))
          continue;
        power += countOf(ctx, src.controller, st.power, false, srcId);
        toughness += countOf(ctx, src.controller, st.toughness, false, srcId);
        if (st.keywords?.length) {
          granted ??= new Set(keywords);
          for (const k of st.keywords) granted.add(k);
        }
      }
    }
  }
  if (granted) {
    for (const k of removed) granted.delete(k);
    keywords = granted;
  }
  let subtypes = o.addedSubtypes ? [...d.subtypes, ...o.addedSubtypes] : d.subtypes;
  // Final Fantasy (11a): job select.
  if (extraSubtypes.length)
    subtypes = [...subtypes, ...extraSubtypes.filter((t) => !subtypes.includes(t))];
  return {
    power,
    toughness,
    keywords,
    types:
      (crewed || o.copyAsCreature) && !d.types.includes('Creature')
        ? [...d.types, 'Creature']
        : d.types,
    subtypes,
    cantBlock,
    cantBeBlocked,
    cantAttack,
  };
}

/** Characteristic-defining P/T: counts that don't depend on other P/T (no recursion). */
/**
 * A count from `player`'s point of view. `printed` uses printed subtypes, for
 * characteristic-defining abilities (avoids recursing into characteristics).
 */
export function countOf(
  ctx: Ctx,
  player: PlayerId,
  a: Amount,
  printed = false,
  sourceId?: ObjectId,
): number {
  if (typeof a === 'number') return a;
  if ('multiply' in a) return a.multiply * countOf(ctx, player, a.amount, printed, sourceId);
  // Final Fantasy (11a)
  if ('sum' in a)
    return a.sum.reduce<number>((n, x) => n + countOf(ctx, player, x, printed, sourceId), 0);
  if ('if' in a) {
    const self = sourceId ? ctx.s.objects[sourceId] : undefined;
    return checkCondition(ctx, a.if, player, self) ? a.then : (a.else ?? 0);
  }
  // Marvel Super Heroes (The Scarlet Witch): 'where X is her power'.
  if ('powerOf' in a)
    return a.powerOf === 'self' && sourceId ? Math.max(0, power(ctx, sourceId)) : 0;
  // Door of Destinies: its charge counters.
  if ('namedCountersOnSource' in a) {
    const src = sourceId ? ctx.s.objects[sourceId] : undefined;
    return src?.counters?.[a.namedCountersOnSource] ?? 0;
  }
  if (!('count' in a)) return 0;
  if (a.count === 'cardsInGraveyard')
    return (
      (a.plus ?? 0) +
      ctx.s.players[player].graveyard.filter(
        (id) =>
          (!a.named || obj(ctx, id).defId === a.named) &&
          (!a.types || a.types.some((t: CardType) => def(ctx, id).types.includes(t))) &&
          // Final Fantasy (11b): by subtype, and without some types.
          (!a.subtype || def(ctx, id).subtypes.includes(a.subtype)) &&
          (!a.notTypes || !a.notTypes.some((t: CardType) => def(ctx, id).types.includes(t))),
      ).length
    );
  if (a.count === 'greatestManaValueInGraveyard')
    return ctx.s.players[player].graveyard.reduce(
      (n, id) => Math.max(n, manaValueOfDef(def(ctx, id))),
      0,
    );
  if (a.count === 'creaturesYouLostThisTurn') return ctx.s.turn.creaturesLost?.[player] ?? 0;
  // Strixhaven (13c): life gained this turn.
  if (a.count === 'lifeGainedThisTurn') return ctx.s.turn.lifeGained?.[player] ?? 0;
  // Secrets of Strixhaven (14b): Orysa, Fractal Anomaly
  if (a.count === 'totalToughnessOfCreaturesYouControl')
    return creaturesOnBattlefield(ctx, player).reduce(
      (n, c) => n + Math.max(0, characteristics(ctx, c.id).toughness),
      0,
    );
  if (a.count === 'cardsDrawnThisTurn') return ctx.s.turn.cardsDrawn[player] ?? 0;
  if (a.count === 'greatestPowerYouControl')
    return creaturesOnBattlefield(ctx, player).reduce((n, c) => Math.max(n, power(ctx, c.id)), 0);
  if (a.count === 'creatureCardsInExileAndGraveyard') {
    const ps = ctx.s.players[player];
    return [...ps.exile, ...ps.graveyard].filter((id) => def(ctx, id).types.includes('Creature'))
      .length;
  }
  // Strixhaven (13a): Serpentine Curve
  if (a.count === 'instantsSorceriesInExileAndGraveyard') {
    const ps = ctx.s.players[player];
    return [...ps.exile, ...ps.graveyard].filter((id) => {
      const t = def(ctx, id).types;
      return t.includes('Instant') || t.includes('Sorcery');
    }).length;
  }
  // Strixhaven (13c): Show of Confidence
  if (a.count === 'otherInstantsSorceriesCastThisTurn')
    return Math.max(0, (ctx.s.turn.instantsSorceriesCast?.[player] ?? 0) - 1);
  if (a.count === 'creaturesOfChosenType') {
    const chosen = sourceId ? obj(ctx, sourceId).chosenType : undefined;
    if (!chosen) return 0;
    return creaturesOnBattlefield(ctx, player).filter(
      (c) => hasSubtype(ctx, c.id, chosen) && !(a.other && c.id === sourceId),
    ).length;
  }
  if (a.count === 'opponentCreaturesExiledThisTurn')
    return ctx.s.turn.creaturesExiled?.[player === 'p1' ? 'p2' : 'p1'] ?? 0;
  // Wakanda Forever (9c).
  if (a.count === 'creaturesOnBattlefield') return creaturesOnBattlefield(ctx).length;
  if (a.count === 'totalManaValue')
    return ctx.s.battlefield
      .filter((id) => obj(ctx, id).controller === player && matchesFilter(ctx, id, a.filter))
      .reduce((n, id) => n + manaValue(def(ctx, id).manaCost), 0);
  if (a.count === 'commanderCasts') return ctx.s.players[player].commanderCasts ?? 0;
  // Doom Prevails (9e).
  if (a.count === 'cardsDiscardedThisTurn') return ctx.s.turn.discards?.[player] ?? 0;
  if (a.count === 'permanentsOpponentsControl')
    return ctx.s.battlefield.filter(
      (id) => obj(ctx, id).controller !== player && matchesFilter(ctx, id, a.filter),
    ).length;
  if (a.count === 'cardsInHand') return ctx.s.players[player].hand.length;
  // Strixhaven (13c)
  if (a.count === 'cardsInLibrary') return ctx.s.players[player].library.length;
  if (a.count === 'differentPowersYouControl')
    return new Set(creaturesOnBattlefield(ctx, player).map((c) => power(ctx, c.id))).size;
  if (a.count === 'differentStudyManaValues')
    return new Set(
      ctx.s.players[player].exile
        .filter(
          (id) => (obj(ctx, id).counters?.study ?? 0) > 0 && !def(ctx, id).types.includes('Land'),
        )
        .map((id) => manaValueOfDef(def(ctx, id))),
    ).size;
  // The Fantastic Four (9d).
  if (a.count === 'colorsAmongPermanentsAndSpells') {
    const colors = new Set<string>();
    for (const id of ctx.s.battlefield)
      if (obj(ctx, id).controller === player) for (const c of def(ctx, id).colors) colors.add(c);
    for (const id of ctx.s.turn.castDefs?.[player] ?? [])
      for (const c of defOf(ctx, id).colors) colors.add(c);
    return colors.size;
  }
  if (a.count === 'subjectColors') return 0; // resolved with the trigger (see resolveAmount)
  if (a.count === 'opponentHandSize') return ctx.s.players[other(player)].hand.length;
  if (a.count === 'greatestNoncreatureManaValue') {
    const noncreature = (id: ObjectId) => !def(ctx, id).types.includes('Creature');
    const ids = [
      ...ctx.s.battlefield.filter((id) => obj(ctx, id).controller === player),
      ...ctx.s.players[player].graveyard,
    ].filter(noncreature);
    return Math.max(0, ...ids.map((id) => manaValue(def(ctx, id).manaCost)));
  }
  if (a.count === 'permanentsYouControl')
    return ctx.s.battlefield.filter(
      (id) =>
        obj(ctx, id).controller === player &&
        !(a.other && id === sourceId) &&
        matchesFilter(ctx, id, a.filter, sourceId),
    ).length;
  const matching = ctx.s.battlefield.filter((id) => {
    if (obj(ctx, id).controller !== player) return false;
    if (a.named && obj(ctx, id).defId !== a.named) return false;
    if (a.other && id === sourceId) return false;
    if (a.attacking !== undefined && isAttacking(ctx, id) !== a.attacking) return false;
    if (a.minPlusOneCounters !== undefined && obj(ctx, id).plusOneCounters < a.minPlusOneCounters)
      return false;
    const d = def(ctx, id);
    if (a.basicOnly && !d.supertypes.includes('Basic')) return false;
    if (a.count === 'landsYouControl')
      return (
        d.types.includes('Land') &&
        (!a.subtype ||
          d.subtypes.includes(a.subtype) ||
          // Eluge's flood counters make lands Islands.
          (a.subtype === 'Island' && !!obj(ctx, id).counters?.flood))
      );
    if (!d.types.includes('Creature')) return false;
    if (!a.subtype) return true;
    if (changeling(ctx, id, a.subtype)) return true;
    return (printed ? d.subtypes : characteristics(ctx, id).subtypes).includes(a.subtype);
  }).length;
  const n =
    a.count === 'totalPowerOfCreaturesYouControl'
      ? ctx.s.battlefield
          .filter(
            (id) => obj(ctx, id).controller === player && def(ctx, id).types.includes('Creature'),
          )
          .reduce((n, id) => n + Math.max(0, power(ctx, id)), 0)
      : matching;
  return a.max !== undefined ? Math.min(a.max, n) : n;
}

function manaValueOfDef(d: CardDefinition): number {
  return manaValue(d.manaCost);
}

function countFor(ctx: Ctx, o: GameObject, d: CardDefinition): number {
  return d.ptEquals === undefined ? 0 : countOf(ctx, o.controller, d.ptEquals, true);
}

const printedCache = new WeakMap<CardDefinition, ReadonlySet<Keyword>>();

function printedKeywords(d: CardDefinition): ReadonlySet<Keyword> {
  let set = printedCache.get(d);
  if (!set) {
    set = new Set(d.keywords);
    printedCache.set(d, set);
  }
  return set;
}

export function power(ctx: Ctx, id: ObjectId): number {
  return characteristics(ctx, id).power;
}

export function toughness(ctx: Ctx, id: ObjectId): number {
  return characteristics(ctx, id).toughness;
}

export function hasKeyword(ctx: Ctx, id: ObjectId, k: Keyword): boolean {
  return characteristics(ctx, id).keywords.has(k);
}

export function isType(ctx: Ctx, id: ObjectId, t: CardType): boolean {
  return def(ctx, id).types.includes(t);
}

export function isCreature(ctx: Ctx, id: ObjectId): boolean {
  if (isType(ctx, id, 'Creature')) return true;
  const o = obj(ctx, id);
  return (
    o.zone === 'battlefield' &&
    ctx.s.effects.some((e) => e.becomesCreature && e.affected.id === id && e.affected.zcc === o.zcc)
  );
}

/** Not creature types, so a changeling doesn't have them. */
const NON_CREATURE_SUBTYPES = new Set([
  'Food',
  'Equipment',
  'Aura',
  'Class',
  'Vehicle',
  'Treasure',
  'Book',
  'Gate',
  'Plains',
  'Island',
  'Swamp',
  'Mountain',
  'Forest',
]);

/** Changeling: it's every creature type. */
function changeling(ctx: Ctx, id: ObjectId, subtype: string): boolean {
  return def(ctx, id).keywords.includes('changeling') && !NON_CREATURE_SUBTYPES.has(subtype);
}

/** Has this subtype (printed, gained, or every creature type for a changeling). */
export function hasSubtype(ctx: Ctx, id: ObjectId, subtype: string): boolean {
  const o = obj(ctx, id);
  return (
    def(ctx, id).subtypes.includes(subtype) ||
    !!o.addedSubtypes?.includes(subtype) ||
    changeling(ctx, id, subtype)
  );
}

export function creaturesOnBattlefield(ctx: Ctx, controller?: PlayerId): GameObject[] {
  const out: GameObject[] = [];
  for (const id of ctx.s.battlefield) {
    const o = obj(ctx, id);
    if (isCreature(ctx, id) && (!controller || o.controller === controller)) out.push(o);
  }
  return out;
}

export function isAttacking(ctx: Ctx, id: ObjectId): boolean {
  return !!ctx.s.combat?.attackers.some((a) => a.id === id);
}

/** Can this permanent's {T} abilities be activated (rule 302.6)? */
export function canTapForAbility(ctx: Ctx, id: ObjectId): boolean {
  const o = obj(ctx, id);
  if (o.tapped) return false;
  if (!isCreature(ctx, id) || !o.summoningSick || hasKeyword(ctx, id, 'haste')) return true;
  // Shang-Chi: "as though those creatures had haste".
  return ctx.s.battlefield.some(
    (s) =>
      obj(ctx, s).controller === o.controller &&
      def(ctx, s).abilities.some(
        (a) => a.kind === 'static' && a.effect.kind === 'abilitiesAsThoughHaste',
      ),
  );
}

export function matchesFilter(
  ctx: Ctx,
  id: ObjectId,
  filter: CardFilter | undefined,
  sourceId?: ObjectId,
): boolean {
  if (!filter) return true;
  // Type/subtype-only conditions must not recurse through their own static ability.
  const needsComputed =
    filter.maxPower !== undefined ||
    filter.minPower !== undefined ||
    filter.minToughness !== undefined ||
    !!filter.hasKeyword ||
    !!filter.lacksKeyword;
  const c = needsComputed
    ? characteristics(ctx, id)
    : {
        power: 0,
        toughness: 0,
        keywords: new Set<Keyword>(),
        subtypes: [...def(ctx, id).subtypes, ...(obj(ctx, id).addedSubtypes ?? [])],
      };
  if (filter.maxPower !== undefined && c.power > filter.maxPower) return false;
  if (
    filter.minPlusOneCounters !== undefined &&
    obj(ctx, id).plusOneCounters < filter.minPlusOneCounters
  )
    return false;
  if (filter.minPower !== undefined && c.power < filter.minPower) return false;
  if (filter.hasKeyword && !c.keywords.has(filter.hasKeyword)) return false;
  if (filter.lacksKeyword && c.keywords.has(filter.lacksKeyword)) return false;
  if (filter.tapped !== undefined && obj(ctx, id).tapped !== filter.tapped) return false;
  if (filter.attacking !== undefined && isAttacking(ctx, id) !== filter.attacking) return false;
  if (
    filter.subtype &&
    !c.subtypes.includes(filter.subtype) &&
    !changeling(ctx, id, filter.subtype)
  )
    return false;
  if (filter.minToughness !== undefined && c.toughness < filter.minToughness) return false;
  if (
    filter.equipped &&
    !ctx.s.battlefield.some(
      (e) => obj(ctx, e).attachedTo === id && def(ctx, e).subtypes.includes('Equipment'),
    )
  )
    return false;
  if (filter.damaged && obj(ctx, id).damage <= 0) return false;
  if (
    filter.hasCounters &&
    !obj(ctx, id).plusOneCounters &&
    !Object.values(obj(ctx, id).counters ?? {}).some((n) => n > 0)
  )
    return false;
  // Strixhaven (13b): monocolored (Vanishing Verse).
  if (filter.monocolored && def(ctx, id).colors.length !== 1) return false;
  // Strixhaven (13c): nonlegendary.
  if (filter.nonlegendary && def(ctx, id).supertypes.includes('Legendary')) return false;
  if (filter.commander && !isCommander(ctx, id)) return false;
  if (filter.supertypes && !filter.supertypes.some((t) => def(ctx, id).supertypes.includes(t)))
    return false;
  // Strixhaven (13c): Hofri's Spirits etc. use nonlegendary too.
  if (filter.nonlegendary && def(ctx, id).supertypes.includes('Legendary')) return false;
  if (filter.toughnessGreaterThanPower) {
    const ch = characteristics(ctx, id);
    if (ch.toughness <= ch.power) return false;
  }
  if (filter.chosenTypeOfSource) {
    const chosen = sourceId ? obj(ctx, sourceId).chosenType : undefined;
    if (!chosen || !hasSubtype(ctx, id, chosen)) return false;
  }
  if (filter.nontoken && obj(ctx, id).isToken) return false;
  if (filter.token && !obj(ctx, id).isToken) return false;
  if (filter.sameNameAsSource && (!sourceId || obj(ctx, id).defId !== obj(ctx, sourceId).defId))
    return false;
  if (filter.inCombatBlock) {
    const c = ctx.s.combat;
    const blocking = !!c?.attackers.some((a) => a.blockers.includes(id));
    const blocked = !!c?.attackers.some((a) => a.id === id && a.blocked);
    if (!blocking && !blocked) return false;
  }
  if (
    filter.attackingOrBlocking &&
    !isAttacking(ctx, id) &&
    !ctx.s.combat?.attackers.some((a) => a.blockers.includes(id))
  )
    return false;
  return cardMatches(ctx, id, filter, sourceId);
}

/**
 * The parts of a filter that only need the card itself (also used for cards
 * in graveyards): types, subtypes and mana value.
 */
export function cardMatches(
  ctx: Ctx,
  id: ObjectId,
  filter: CardFilter,
  sourceId?: ObjectId,
): boolean {
  const d = def(ctx, id);
  const subtypes = [
    ...d.subtypes,
    ...(obj(ctx, id).zone === 'battlefield' ? (obj(ctx, id).addedSubtypes ?? []) : []),
  ];
  if (
    filter.anyOf &&
    !filter.anyOf.some((branch) =>
      obj(ctx, id).zone === 'battlefield'
        ? matchesFilter(ctx, id, branch, sourceId)
        : cardMatches(ctx, id, branch, sourceId),
    )
  )
    return false;
  if (obj(ctx, id).zone !== 'battlefield') {
    if (filter.hasKeyword && !d.keywords.includes(filter.hasKeyword)) return false;
    if (filter.lacksKeyword && d.keywords.includes(filter.lacksKeyword)) return false;
    if (filter.minPower !== undefined && (d.power ?? 0) < filter.minPower) return false;
    if (filter.maxPower !== undefined && (d.power ?? 0) > filter.maxPower) return false;
  }
  if (filter.types && !filter.types.some((t) => d.types.includes(t))) return false;
  if (
    filter.subtypes &&
    !filter.subtypes.some((st) => subtypes.includes(st) || changeling(ctx, id, st))
  )
    return false;
  if (filter.colors && !filter.colors.some((color) => d.colors.includes(color))) return false;
  if (filter.notTypes?.some((t) => d.types.includes(t))) return false;
  // Strixhaven (13b): monocolored.
  if (filter.monocolored && d.colors.length !== 1) return false;
  // Strixhaven (13c): nonlegendary.
  if (filter.nonlegendary && d.supertypes.includes('Legendary')) return false;
  if (filter.commander && !isCommander(ctx, id)) return false;
  if (filter.supertypes && !filter.supertypes.some((t) => d.supertypes.includes(t))) return false;
  // Strixhaven (13c): Plargg (nonlegendary), Silverquill Silencer (the chosen name).
  if (filter.nonlegendary && d.supertypes.includes('Legendary')) return false;
  // Secrets of Strixhaven (14b): Nita, Forum Conciliator ("a spell you don't own").
  if (filter.notOwnedByController && obj(ctx, id).owner === obj(ctx, id).controller) return false;
  // Secrets of Strixhaven (14b): Matterbending Mage.
  if (filter.hasX && !d.manaCost.x) return false;
  if (filter.chosenNameOfSource) {
    const name = sourceId ? ctx.s.objects[sourceId]?.chosenName : undefined;
    if (!name || obj(ctx, id).defId !== name) return false;
  }
  const mv = manaValue(d.manaCost);
  if (filter.minManaValue !== undefined && mv < filter.minManaValue) return false;
  if (filter.manaValueIsSourceCounters) {
    const { name, plus } = filter.manaValueIsSourceCounters;
    const counters = sourceId ? (obj(ctx, sourceId).counters?.[name] ?? 0) : 0;
    if (mv !== counters + plus) return false;
  }
  if (filter.manaValue !== undefined && mv !== filter.manaValue) return false;
  if (filter.subtype && !subtypes.includes(filter.subtype) && !changeling(ctx, id, filter.subtype))
    return false;
  if (filter.nonland && d.types.includes('Land')) return false;
  if (filter.enteredThisTurn && obj(ctx, id).zoneTurn !== ctx.s.turn.number) return false;
  if (filter.leftAttacking && !obj(ctx, id).leftAttacking) return false;
  if (filter.attachedToSource && (!sourceId || obj(ctx, id).attachedTo !== sourceId)) return false;
  if (filter.notAttachedHost && sourceId && obj(ctx, sourceId).attachedTo === id) return false;
  if (filter.manaValueParity) {
    const mv = manaValue(def(ctx, id).manaCost);
    if ((mv % 2 === 1 ? 'odd' : 'even') !== filter.manaValueParity) return false;
  }
  if (filter.notSubtype && d.subtypes.includes(filter.notSubtype)) return false;
  if (filter.maxManaValue !== undefined) {
    const max =
      filter.maxManaValue === 'sourcePower'
        ? sourceId
          ? obj(ctx, sourceId).zone === 'battlefield'
            ? characteristics(ctx, sourceId).power
            : (obj(ctx, sourceId).lastPower ?? 0)
          : 0
        : filter.maxManaValue === 'lifeGainedThisTurn'
          ? // Secrets of Strixhaven (14a): Moseo.
            sourceId
            ? (ctx.s.turn.lifeGained?.[obj(ctx, sourceId).controller] ?? 0)
            : 0
          : filter.maxManaValue;
    if (mv > max) return false;
  }
  if (filter.other && id === sourceId) return false;
  if (!avengersFilter(ctx, id, filter, sourceId)) return false;
  return true;
}

/** Avengers Assemble (9b) filter parts: chosen types, modified, power, the commander's types. */
function avengersFilter(
  ctx: Ctx,
  id: ObjectId,
  filter: CardFilter,
  sourceId: ObjectId | undefined,
): boolean {
  if (filter.named && obj(ctx, id).defId !== filter.named) return false;
  const chosen = sourceId ? ctx.s.objects[sourceId]?.chosenType : undefined;
  if (filter.chosenTypeOfSource && !(chosen && hasSubtype(ctx, id, chosen))) return false;
  if (filter.notChosenTypeOfSource && chosen && hasSubtype(ctx, id, chosen)) return false;
  const o = obj(ctx, id);
  if (filter.modified) {
    const counters = o.plusOneCounters > 0 || Object.values(o.counters ?? {}).some((n) => n > 0);
    const attached = ctx.s.battlefield.some((a) => {
      const att = obj(ctx, a);
      if (att.attachedTo !== id) return false;
      const sub = def(ctx, a).subtypes;
      return sub.includes('Equipment') || (sub.includes('Aura') && att.controller === o.controller);
    });
    if (!counters && !attached) return false;
  }
  if (filter.greaterPowerThanSource) {
    if (!sourceId || o.zone !== 'battlefield') return false;
    if (characteristics(ctx, id).power <= characteristics(ctx, sourceId).power) return false;
  }
  if (filter.sharesTypeWithCommander) {
    const types = commanderTypes(ctx, o.controller);
    if (!def(ctx, id).subtypes.some((t) => types.includes(t))) return false;
  }
  return true;
}

/** Is life gain prevented for this player (e.g. Giant Cindermaw)? */
export function lifeGainPrevented(ctx: Ctx): boolean {
  const withStatics = staticDefs(ctx.db);
  return ctx.s.battlefield.some((id) => {
    const defId = obj(ctx, id).defId;
    return (
      withStatics.has(defId) &&
      defOf(ctx, defId).abilities.some((a) => a.kind === 'static' && a.effect.kind === 'noLifeGain')
    );
  });
}

/** Keywords a counter of the same name grants (Salvation Swan's flying counter). */
const COUNTER_KEYWORDS: readonly Keyword[] = [
  'flying',
  'indestructible',
  'reach',
  'trample',
  'vigilance',
  'deathtouch',
  'lifelink',
  'menace',
  'hexproof',
  'firstStrike',
];

const affectingDefsCache = new WeakMap<CardDb, ReadonlySet<CardDefId>>();

/** Card definitions with a static ability that changes other permanents (anthems, Auras, Equipment). */
function affectingDefs(db: CardDb): ReadonlySet<CardDefId> {
  let set = affectingDefsCache.get(db);
  if (!set) {
    set = new Set(
      [...db.values()]
        .filter((d) =>
          d.abilities.some(
            (a) =>
              a.kind === 'static' &&
              (a.effect.kind === 'anthem' ||
                a.effect.kind === 'attached' ||
                a.effect.kind === 'opponentsBaseToughness'),
          ),
        )
        .map((d) => d.id),
    );
    affectingDefsCache.set(db, set);
  }
  return set;
}

const staticDefsCache = new WeakMap<CardDb, ReadonlySet<CardDefId>>();

/** Card definitions with at least one static ability (computed once per database). */
function staticDefs(db: CardDb): ReadonlySet<CardDefId> {
  let set = staticDefsCache.get(db);
  if (!set) {
    set = new Set(
      [...db.values()].filter((d) => d.abilities.some((a) => a.kind === 'static')).map((d) => d.id),
    );
    staticDefsCache.set(db, set);
  }
  return set;
}
