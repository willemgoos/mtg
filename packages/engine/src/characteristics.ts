import { commanderTypes, isCommander } from './brawl.ts';
import { type Ctx, def, defOf, obj, other } from './context.ts';
import { manaValue } from './cost.ts';
import { vividCount } from './ecl-18a.ts';
import { spellsCastThisTurn } from './tdm-19a.ts';
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
 * subset; base-setting effects use timestamps before additive bonuses).
 */
export function characteristics(ctx: Ctx, id: ObjectId): Characteristics {
  const o = obj(ctx, id);
  const d = def(ctx, id);
  const onField = o.zone === 'battlefield';
  const base =
    d.ptEquals !== undefined && onField
      ? countFor(ctx, o, d)
      : // The Hobbit (20b green): Beorn's Hospitality, "power and toughness are each equal to the number of lands you control".
        o.hobLandsPT && onField
        ? countOf(ctx, o.controller, { count: 'landsYouControl' }, true)
        : null;
  const basePower =
    d.powerEquals !== undefined && onField ? countOf(ctx, o.controller, d.powerEquals, true) : null;
  // Iron Suitcase: base-setting effects (including attached statics) share timestamp order.
  let override: [number, number] | undefined;
  let baseTimestamp = -1;
  // Reality Fracture (17a): Hapatra, the Desert Fang: -1/-1 counters (the named counter '-1/-1').
  const minus = o.counters?.['-1/-1'] ?? 0;
  let power = (basePower ?? base ?? o.copyPT?.power ?? d.power ?? 0) + o.plusOneCounters - minus;
  let toughness = (base ?? o.copyPT?.toughness ?? d.toughness ?? 0) + o.plusOneCounters - minus;
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
  // Reality Fracture (17a): Puppet Crafting: a creature, but not an artifact too.
  let artifactToo = false;
  // The Hobbit (20b white): Stone by Sunlight, an artifact in addition to its other types.
  let becameArtifact = false;
  // Marvel Super Heroes Jumpstart (Great Lakes Avengers): Flatman switches power and toughness.
  let switched = false;

  if (o.zone === 'battlefield') {
    for (const e of ctx.s.effects) {
      if (e.affected.id !== id || e.affected.zcc !== o.zcc) continue;
      if (e.basePT && e.timestamp >= baseTimestamp) {
        override = e.basePT;
        baseTimestamp = e.timestamp;
      }
      if (e.becomesArtifact) becameArtifact = true; // The Hobbit (20b white)
      if (e.becomesCreature) {
        crewed = true;
        if (!e.creatureOnly) artifactToo = true;
      }
      if (e.switchPT) switched = !switched;
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
      // The Hobbit (20b multicolour): Chief Warg's Company, "can't attack unless you control two or more other Wolves".
      else if (st.kind === 'cantAttackUnless') {
        if (!checkCondition(ctx, st.condition, o.controller, o)) cantAttack = true;
      }
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
        // Tarkir: Dragonstorm (19b, blue): Snowmelt Stag, base power and toughness while the condition holds.
        if (st.kind === 'while' && st.basePT && o.timestamp >= baseTimestamp) {
          override = st.basePT;
          baseTimestamp = o.timestamp;
        }
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
      // The Hobbit (20b multicolour): a hone counter on an Equipment grants +1/+0 to the equipped creature (Dwalin, Weaponmaster).
      if (src.attachedTo === id && src.counters?.hone) power += src.counters.hone;
      if (!affecting.has(src.defId)) continue;
      for (const a of def(ctx, srcId).abilities) {
        if (a.kind !== 'static') continue;
        const st = a.effect;
        if (st.kind === 'attached') {
          if (src.attachedTo !== id) continue;
          if (src.timestamp >= baseTimestamp) {
            if (st.basePT) {
              override = st.basePT;
              baseTimestamp = src.timestamp;
            }
            if (st.basePTAmount !== undefined) {
              const x = countOf(ctx, src.controller, st.basePTAmount, false, srcId);
              override = [x, x];
              baseTimestamp = src.timestamp;
            }
          }
          if (st.cantAttackOrBlock) cantAttack = cantBlock = true;
          if (st.cantBeBlocked) cantBeBlocked = true;
          if (st.loseKeywords?.length) {
            granted ??= new Set(keywords);
            for (const k of st.loseKeywords) removed.add(k);
          }
          // Final Fantasy (11c): amounts know their Equipment (Excalibur II's charge counters).
          power += countOf(ctx, src.controller, st.power, false, srcId);
          toughness += countOf(ctx, src.controller, st.toughness, false, srcId);
          // Final Fantasy Commander (12b): Hero's Heirloom, keywords only while it's legendary.
          if (st.legendaryKeywords?.length && d.supertypes.includes('Legendary')) {
            granted ??= new Set(keywords);
            for (const k of st.legendaryKeywords) granted.add(k);
          }
          if (st.attackingKeywords?.length && isAttacking(ctx, id)) {
            granted ??= new Set(keywords);
            for (const k of st.attackingKeywords) granted.add(k);
          }
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
        if (
          (src.controller !== o.controller) !== opponents ||
          // Lorwyn Eclipsed (18c): Fearless Swashbuckler, "Vehicles you control have haste".
          !(d.types.includes('Creature') || (st.anyPermanent && st.filter))
        )
          continue;
        if (st.affects === 'otherCreaturesYouControl' && srcId === id) continue;
        if (st.filter?.subtype && !hasSubtype(ctx, id, st.filter.subtype)) continue;
        if (st.filter?.token && !o.isToken) continue;
        // Lorwyn Eclipsed (18a): Isilu, "each other nontoken creature you control".
        if (st.filter?.nontoken && o.isToken) continue;
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
    // Vivien Reid's emblem: "Creatures you control get +2/+2 and have vigilance, trample, and indestructible."
    for (const em of ctx.s.emblems ?? []) {
      const st = em.ability.kind === 'static' ? em.ability.effect : undefined;
      if (st?.kind !== 'anthem' || em.controller !== o.controller) continue;
      if (!d.types.includes('Creature') && !crewed) continue;
      // Lorwyn Eclipsed (18b, special): Oko, Shadowmoor Scion's emblem ("creatures of the chosen type"): a type filter.
      if (st.filter?.subtype && !hasSubtype(ctx, id, st.filter.subtype)) continue;
      power += countOf(ctx, em.controller, st.power);
      toughness += countOf(ctx, em.controller, st.toughness);
      if (st.keywords?.length) {
        granted ??= new Set(keywords);
        for (const k of st.keywords) granted.add(k);
      }
    }
  }
  if (granted) {
    for (const k of removed) granted.delete(k);
    keywords = granted;
  }
  // Tarkir: Dragonstorm (19a): decayed creatures can't block.
  if (keywords.has('decayed')) cantBlock = true;
  if (override) {
    power += override[0] - (basePower ?? base ?? o.copyPT?.power ?? d.power ?? 0);
    toughness += override[1] - (base ?? o.copyPT?.toughness ?? d.toughness ?? 0);
  }
  // Switching is applied after every other change to power and toughness.
  if (switched) [power, toughness] = [toughness, power];
  let subtypes = subtypesOf(ctx, id);
  // Final Fantasy (11a): job select.
  if (extraSubtypes.length)
    subtypes = [...subtypes, ...extraSubtypes.filter((t) => !subtypes.includes(t))];
  return {
    power,
    toughness,
    keywords,
    // A crewed Vehicle, or anything that "becomes an artifact creature" (I Am Iron Man).
    // Strixhaven Brawl (15b, u): Housemeld, perpetually an enchantment.
    types:
      o.perpetualTypes ??
      (crewed
        ? [
            ...(d.types.includes('Artifact') || !artifactToo ? [] : (['Artifact'] as const)),
            ...d.types,
            ...(d.types.includes('Creature') ? [] : (['Creature'] as const)),
          ]
        : o.copyAsCreature && !d.types.includes('Creature')
          ? [...d.types, 'Creature']
          : o.notCreature
            ? [
                ...d.types.filter((x) => x !== 'Creature'),
                // The Hobbit (20b multicolour): Tom, Bert, and William come back as an artifact.
                ...(o.notCreatureAs && !d.types.includes(o.notCreatureAs) ? [o.notCreatureAs] : []),
              ]
            : becameArtifact && !d.types.includes('Artifact')
              ? [...d.types, 'Artifact']
              : d.types),
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
/**
 * The card whose name it has: its own while a copy that keeps its name (Impossible Man), else
 * what it is now.
 */
export function nameId(ctx: Ctx, id: ObjectId): CardDefId {
  const o = obj(ctx, id);
  return o.copyKeepsName && o.originalDefId ? o.originalDefId : o.defId;
}

export function countOf(
  ctx: Ctx,
  player: PlayerId,
  a: Amount,
  printed = false,
  sourceId?: ObjectId,
): number {
  if (typeof a === 'number') return a;
  if ('multiply' in a) return a.multiply * countOf(ctx, player, a.amount, printed, sourceId);
  // Reality Fracture (17a): Dark Matter Manipulator, Recursive Recruitment
  if ('floorDiv' in a)
    return Math.floor(countOf(ctx, player, a.amount, printed, sourceId) / a.floorDiv);
  // Final Fantasy (11a)
  if ('sum' in a)
    return a.sum.reduce<number>((n, x) => n + countOf(ctx, player, x, printed, sourceId), 0);
  if ('if' in a) {
    const self = sourceId ? ctx.s.objects[sourceId] : undefined;
    return checkCondition(ctx, a.if, player, self) ? a.then : (a.else ?? 0);
  }
  // Lorwyn Eclipsed (18b, blue): Sunderflock, "costs {X} less, where X is the greatest mana value among Elementals you control".
  if ('greatestManaValueYouControl' in a)
    return Math.max(
      0,
      ...ctx.s.battlefield
        .filter(
          (id) =>
            obj(ctx, id).controller === player &&
            matchesFilter(ctx, id, a.greatestManaValueYouControl),
        )
        .map((id) => manaValue(def(ctx, id).manaCost)),
    );
  // Marvel Super Heroes (The Scarlet Witch): 'where X is her power'.
  if ('powerOf' in a) {
    // The Hobbit (20b colorless): Glamdring, "where X is equipped creature's power" (the creature the source is attached to).
    if (a.powerOf === 'attached') {
      const host = sourceId ? ctx.s.objects[sourceId]?.attachedTo : undefined;
      return host && ctx.s.objects[host]?.zone === 'battlefield'
        ? Math.max(0, power(ctx, host))
        : 0;
    }
    return a.powerOf === 'self' && sourceId ? Math.max(0, power(ctx, sourceId)) : 0;
  }
  // Tarkir: Dragonstorm (19a): every kind of counter on the source.
  if ('allCountersOn' in a) {
    const src = a.allCountersOn === 'self' && sourceId ? ctx.s.objects[sourceId] : undefined;
    return src
      ? src.plusOneCounters + Object.values(src.counters ?? {}).reduce((n, c) => n + c, 0)
      : 0;
  }
  // Strixhaven Brawl (15b, w): Glyph Elemental, "for each +1/+1 counter on this Aura".
  if ('countersOn' in a)
    return a.countersOn === 'self' && sourceId
      ? (ctx.s.objects[sourceId]?.plusOneCounters ?? 0)
      : 0;
  // Reality Fracture (17c): "its loyalty" (the source itself; a chosen planeswalker is read in resolveAmount).
  if ('loyaltyOf' in a)
    return a.loyaltyOf === 'self' && sourceId
      ? (ctx.s.objects[sourceId]?.counters?.loyalty ?? 0)
      : 0;
  // Door of Destinies: its charge counters.
  if ('namedCountersOnSource' in a) {
    const src = sourceId ? ctx.s.objects[sourceId] : undefined;
    return src?.counters?.[a.namedCountersOnSource] ?? 0;
  }
  // Strixhaven Brawl (15b, pair): Zimone, Infinite Analyst: its own +1/+1 counters.
  if ('countersOn' in a) {
    const src = sourceId ? ctx.s.objects[sourceId] : undefined;
    return a.countersOn === 'self' ? (src?.plusOneCounters ?? 0) : 0;
  }
  if (!('count' in a)) return 0;
  // Final Fantasy (11c): your life total (Aettir and Priwen).
  if (a.count === 'lifeTotal') return ctx.s.players[player].life;
  // Final Fantasy (11c): devotion and life gained.
  if (a.count === 'devotion') {
    const color = a.color;
    return ctx.s.battlefield.reduce((n, id) => {
      if (obj(ctx, id).controller !== player) return n;
      const c = def(ctx, id).manaCost;
      return n + (c.colored[color] ?? 0) + (c.hybrid ?? []).filter((h) => h.includes(color)).length;
    }, 0);
  }
  if (a.count === 'lifeGainedThisTurn') return ctx.s.turn.lifeGained?.[player] ?? 0;
  if (a.count === 'cardsInGraveyard')
    return (
      (a.plus ?? 0) +
      ctx.s.players[player].graveyard.filter(
        (id) =>
          (!a.named || obj(ctx, id).defId === a.named) &&
          (!a.types || a.types.some((t: CardType) => def(ctx, id).types.includes(t))) &&
          // Final Fantasy (11b): by subtype, and without some types.
          (!a.subtype || hasSubtype(ctx, id, a.subtype)) &&
          (!a.notTypes || !a.notTypes.some((t: CardType) => def(ctx, id).types.includes(t))),
      ).length
    );
  if (a.count === 'greatestManaValueInGraveyard')
    return ctx.s.players[player].graveyard.reduce(
      (n, id) => Math.max(n, manaValueOfDef(def(ctx, id))),
      0,
    );
  if (a.count === 'creaturesYouLostThisTurn') return ctx.s.turn.creaturesLost?.[player] ?? 0;
  // Lorwyn Eclipsed (18b, white): Kinbinding.
  if (a.count === 'creaturesEnteredThisTurn')
    return ctx.s.turn.creaturesEntered?.filter((e) => e.player === player).length ?? 0;
  // Strixhaven Brawl (15b, multi): Iridescent Hornbeetle.
  if (a.count === 'countersPutThisTurn') return ctx.s.turn.countersPut?.[player] ?? 0;
  // Secrets of Strixhaven (14b): Emil, Vastlands Roamer.
  if (a.count === 'differentlyNamedLands')
    return new Set(
      ctx.s.battlefield
        .filter((id) => obj(ctx, id).controller === player && def(ctx, id).types.includes('Land'))
        .map((id) => def(ctx, id).name),
    ).size;
  // Secrets of Strixhaven (14b): Orysa, Fractal Anomaly
  if (a.count === 'totalToughnessOfCreaturesYouControl')
    return creaturesOnBattlefield(ctx, player).reduce(
      (n, c) => n + Math.max(0, characteristics(ctx, c.id).toughness),
      0,
    );
  if (a.count === 'cardsDrawnThisTurn') return ctx.s.turn.cardsDrawn[player] ?? 0;
  // Reality Fracture (17a): Ghalta the Immovable.
  if (a.count === 'greatestToughnessYouControl')
    return creaturesOnBattlefield(ctx, player).reduce(
      (n, c) => Math.max(n, characteristics(ctx, c.id).toughness),
      0,
    );
  if (a.count === 'greatestPowerYouControl')
    return creaturesOnBattlefield(ctx, player).reduce(
      // Lorwyn Eclipsed (18b, green): "among Giants you control".
      (n, c) => (a.subtype && !hasSubtype(ctx, c.id, a.subtype) ? n : Math.max(n, power(ctx, c.id))),
      0,
    );
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
  // Strixhaven Brawl (15b, r): Seize the Storm.
  if (a.count === 'instantsSorceriesInGraveyardPlusFlashbackInExile') {
    const ps = ctx.s.players[player];
    return (
      ps.graveyard.filter((id) => {
        const t = def(ctx, id).types;
        return t.includes('Instant') || t.includes('Sorcery');
      }).length + ps.exile.filter((id) => def(ctx, id).flashback !== undefined).length
    );
  }
  // Strixhaven Brawl (15b, r): Rootha, Mastering the Moment.
  if (a.count === 'greatestInstantSorceryCastThisTurn')
    return (ctx.s.turn.castDefs?.[player] ?? []).reduce((n, id) => {
      const d = defOf(ctx, id);
      return d.types.includes('Instant') || d.types.includes('Sorcery')
        ? Math.max(n, manaValueOfDef(d))
        : n;
    }, 0);
  // Secrets of Strixhaven (14b): Prismari, the Inspiration (storm)
  if (a.count === 'spellsCastBeforeSubject')
    return Math.max(0, (ctx.s.turn.spellsCast?.p1 ?? 0) + (ctx.s.turn.spellsCast?.p2 ?? 0) - 1);
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
  // Tarkir: Dragonstorm (19b, white): Static Snare.
  if (a.count === 'attackingCreatures')
    return (ctx.s.combat?.attackers ?? []).filter((x) => isCreature(ctx, x.id)).length;
  if (a.count === 'totalManaValue')
    return (
      ctx.s.battlefield
        // Final Fantasy (11c): the filter knows the source ("other permanents": Summon: Bahamut).
        .filter(
          (id) => obj(ctx, id).controller === player && matchesFilter(ctx, id, a.filter, sourceId),
        )
        .reduce((n, id) => n + manaValue(def(ctx, id).manaCost), 0)
    );
  if (a.count === 'commanderCasts') return ctx.s.players[player].commanderCasts ?? 0;
  // Tarkir: Dragonstorm (19a): Narset, "the number of spells you've cast this turn".
  if (a.count === 'spellsCastThisTurn') return spellsCastThisTurn(ctx, player, a.filter);
  // Doom Prevails (9e).
  if (a.count === 'cardsDiscardedThisTurn') return ctx.s.turn.discards?.[player] ?? 0;
  if (a.count === 'permanentsOpponentsControl')
    return ctx.s.battlefield.filter(
      (id) => obj(ctx, id).controller !== player && matchesFilter(ctx, id, a.filter),
    ).length;
  if (a.count === 'cardsInHand') return ctx.s.players[player].hand.length;
  // Strixhaven (13c)
  if (a.count === 'cardsInLibrary') return ctx.s.players[player].library.length;
  // Reality Fracture (17a): Fblthp, Knows the Way (domain).
  if (a.count === 'basicLandTypesYouControl') {
    const types = new Set<string>();
    for (const id of ctx.s.battlefield) {
      if (obj(ctx, id).controller !== player || !def(ctx, id).types.includes('Land')) continue;
      for (const t of ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest'])
        if (def(ctx, id).subtypes.includes(t) || obj(ctx, id).addedSubtypes?.includes(t))
          types.add(t);
      // Eluge's flood counters make lands Islands.
      if (obj(ctx, id).counters?.flood) types.add('Island');
    }
    return types.size;
  }
  // Reality Fracture (17a): Tarmogoyf.
  if (a.count === 'cardTypesInGraveyards') {
    const types = new Set<string>();
    for (const p of ['p1', 'p2'] as const)
      for (const id of ctx.s.players[p].graveyard) for (const t of def(ctx, id).types) types.add(t);
    return types.size;
  }
  // Tarkir: Dragonstorm (19b, black): Hundred-Battle Veteran.
  if (a.count === 'counterKindsAmongYourCreatures') {
    const kinds = new Set<string>();
    for (const c of creaturesOnBattlefield(ctx, player)) {
      const o = obj(ctx, c.id);
      if (o.plusOneCounters > 0) kinds.add('+1/+1');
      for (const [k, n] of Object.entries(o.counters ?? {})) if (n > 0) kinds.add(k);
    }
    return kinds.size;
  }
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
  // Marvel Super Heroes Jumpstart (Lethal)
  if (a.count === 'opponentCreatureCardsInGraveyard')
    return ctx.s.players[other(player)].graveyard.filter((id) =>
      def(ctx, id).types.includes('Creature'),
    ).length;
  // The Fantastic Four (9d).
  if (a.count === 'colorsAmongPermanentsAndSpells') {
    const colors = new Set<string>();
    for (const id of ctx.s.battlefield)
      if (obj(ctx, id).controller === player) for (const c of def(ctx, id).colors) colors.add(c);
    for (const id of ctx.s.turn.castDefs?.[player] ?? [])
      for (const c of defOf(ctx, id).colors) colors.add(c);
    return colors.size;
  }
  // Lorwyn Eclipsed (18a): Vivid.
  if (a.count === 'vivid') return vividCount(ctx, player);
  // Reality Fracture (17a): Karn, Gilded Guardian.
  if (a.count === 'colorsAmongOtherArtifactsYouControl') {
    const colors = new Set<string>();
    for (const id of ctx.s.battlefield)
      if (
        id !== sourceId &&
        obj(ctx, id).controller === player &&
        def(ctx, id).types.includes('Artifact')
      )
        for (const c of def(ctx, id).colors) colors.add(c);
    return colors.size;
  }
  // Reality Fracture (17c): Jace, Reality Sculptor ("loyalty counters among Jaces you control").
  if (a.count === 'loyaltyAmongPlaneswalkers')
    return ctx.s.battlefield.reduce(
      (n, id) =>
        obj(ctx, id).controller === player &&
        def(ctx, id).types.includes('Planeswalker') &&
        matchesFilter(ctx, id, a.filter ?? {}, sourceId)
          ? n + (obj(ctx, id).counters?.loyalty ?? 0)
          : n,
      0,
    );
  // Reality Fracture (17a): Tam, the Possibility.
  if (a.count === 'planeswalkerTypesYouControl') {
    const types = new Set<string>();
    for (const id of ctx.s.battlefield)
      if (obj(ctx, id).controller === player && def(ctx, id).types.includes('Planeswalker'))
        for (const t of def(ctx, id).subtypes) types.add(t);
    return types.size;
  }
  if (a.count === 'subjectColors') return 0; // resolved with the trigger (see resolveAmount)
  if (a.count === 'opponentHandSize') return ctx.s.players[other(player)].hand.length;
  // Marvel Super Heroes Jumpstart (Masters of Evil)
  if (a.count === 'opponentLifeHalf')
    return Math.max(0, Math.ceil(ctx.s.players[other(player)].life / 2));
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
    if (a.named && nameId(ctx, id) !== a.named) return false;
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
            (id) =>
              obj(ctx, id).controller === player &&
              def(ctx, id).types.includes('Creature') &&
              // The Hobbit (20b red): Desert Were-Worm, the total power of the attacking creatures.
              (a.attacking === undefined || isAttacking(ctx, id) === a.attacking),
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
  // Strixhaven Brawl (15a): Enduring Courage comes back as an enchantment that isn't a creature.
  if (t === 'Creature' && ctx.s.objects[id]?.notCreature) return false;
  if (t === ctx.s.objects[id]?.notCreatureAs && ctx.s.objects[id]?.notCreature) return true; // The Hobbit (20b multicolour)
  return def(ctx, id).types.includes(t);
}

/** The Hobbit (20b white): an effect made it an artifact in addition to its other types (Stone by Sunlight). */
export function isArtifactByEffect(ctx: Ctx, id: ObjectId): boolean {
  const o = obj(ctx, id);
  return ctx.s.effects.some((e) => e.becomesArtifact && e.affected.id === id && e.affected.zcc === o.zcc);
}

export function isCreature(ctx: Ctx, id: ObjectId): boolean {
  if (isType(ctx, id, 'Creature')) return true;
  const o = obj(ctx, id);
  return (
    o.zone === 'battlefield' &&
    ctx.s.effects.some((e) => e.becomesCreature && e.affected.id === id && e.affected.zcc === o.zcc)
  );
}

/** Noncreature subtype catalogs, validated against Scryfall on 2026-10-04.
 * https://api.scryfall.com/catalog/{artifact,enchantment,land,planeswalker,spell,battle}-types
 * These survive creature-type replacement and are never granted by changeling.
 * The supported-pool regression catches new noncreature subtypes when cards are added.
 */
export const NON_CREATURE_SUBTYPES = new Set([
  // Artifact types.
  'Attraction',
  'Blood',
  'Bobblehead',
  'Book',
  'Clue',
  'Contraption',
  'Equipment',
  'Food',
  'Fortification',
  'Gold',
  // Reality Fracture's token "Token Artifact — Heartwood" (not yet in Scryfall's artifact-types catalog).
  'Heartwood',
  'Incubator',
  'Infinity',
  'Junk',
  'Map',
  'Powerstone',
  'Stone',
  'Terminus',
  'Treasure',
  'Vehicle',
  'Spacecraft',
  // Enchantment types.
  'Aura',
  'Background',
  'Cartouche',
  'Case',
  'Class',
  'Curse',
  'Plan',
  'Role',
  'Room',
  'Rune',
  'Saga',
  'Shard',
  'Shrine',
  // Land types.
  'Cave',
  'Cloud',
  'Desert',
  'Forest',
  'Gate',
  'Island',
  'Lair',
  'Locus',
  'Mine',
  'Mountain',
  'Sphere',
  'Plains',
  'Planet',
  'Power-Plant',
  'Swamp',
  'Tower',
  'Town',
  "Urza's",
  // Planeswalker types.
  'Abian',
  'Ajani',
  'Aminatou',
  'Angrath',
  'Arlinn',
  'Arzakon',
  'Ashiok',
  'B.O.B.',
  'Bahamut',
  'Basri',
  'Bolas',
  'Calix',
  'Chandra',
  'Comet',
  'Dack',
  'Dakkon',
  'Daretti',
  'Davriel',
  'Deb',
  'Dellian',
  'Dihada',
  'Domri',
  'Dovin',
  'Duck',
  'Dungeon',
  'Dyfed',
  'Ellywick',
  'Elminster',
  'Elspeth',
  'Ersta',
  'Estrid',
  'Feroz',
  'Freyalise',
  'Garruk',
  'Gideon',
  'Greensleeves',
  'Grist',
  'Guff',
  'Huatli',
  'Inzerva',
  'Jace',
  'Jared',
  'Jaya',
  'Jeska',
  'Kaito',
  'Karn',
  'Kasmina',
  'Kaya',
  'Kiora',
  'Koth',
  'Liliana',
  'Lolth',
  'Lukka',
  'Luxior',
  'Master',
  'Minsc',
  'Monopoly',
  'Mordenkainen',
  'Nahiri',
  'Narset',
  'Niko',
  'Nissa',
  'Nixilis',
  'Oko',
  'Quintorius',
  'Ral',
  'Rowan',
  'Saheeli',
  'Samut',
  'Sarkhan',
  'Serra',
  'Sifa',
  'Sivitri',
  'Sorin',
  'Svega',
  'Szat',
  'Tamiyo',
  'Tasha',
  'Teferi',
  'Teyo',
  'Tezzeret',
  'Thomil',
  'Tibalt',
  'Tyvar',
  'Ugin',
  'Urza',
  'Venser',
  'Vivien',
  'Vraska',
  'Vronos',
  'Wanderer',
  'Will',
  'Windgrace',
  'Worzel',
  'Wrenn',
  'Xenagos',
  'Yanggu',
  'Yanling',
  'Zariel',
  // Spell types.
  'Adventure',
  'Arcane',
  'Chorus',
  'Lesson',
  'Omen',
  'Trap',
  // Battle types.
  'Siege',
]);

/** Permanent and temporary creature-type setters apply in timestamp order. */
export function subtypesOf(ctx: Ctx, id: ObjectId): readonly string[] {
  const o = obj(ctx, id);
  const printed = def(ctx, id).subtypes;
  if (o.zone !== 'battlefield') return printed;
  let result: readonly string[] = o.creatureTypes
    ? [...printed.filter((t) => NON_CREATURE_SUBTYPES.has(t)), ...o.creatureTypes]
    : printed;
  if (o.addedSubtypes?.length) result = [...result, ...o.addedSubtypes];
  let timestamp = o.creatureTypes ? (o.creatureTypesTimestamp ?? o.timestamp) : -1;
  for (const e of ctx.s.effects) {
    if (
      e.affected.id !== id || e.affected.zcc !== o.zcc || !e.creatureSubtype ||
      e.timestamp <= timestamp
    ) continue;
    result = [...result.filter((t) => NON_CREATURE_SUBTYPES.has(t)), e.creatureSubtype];
    timestamp = e.timestamp;
  }
  // Lorwyn Eclipsed (18a): "loses all creature types".
  for (const e of ctx.s.effects) {
    if (
      e.affected.id !== id || e.affected.zcc !== o.zcc || !e.noCreatureTypes ||
      e.timestamp <= timestamp
    ) continue;
    result = result.filter((t) => NON_CREATURE_SUBTYPES.has(t));
    timestamp = e.timestamp;
  }
  return result;
}

const allTypesAttachersCache = new WeakMap<CardDb, ReadonlySet<CardDefId>>();

/** Lorwyn Eclipsed (18a): Equipment that makes the creature it's attached to every creature type (Stalactite Dagger). */
function allTypesAttachers(db: CardDb): ReadonlySet<CardDefId> {
  let set = allTypesAttachersCache.get(db);
  if (!set) {
    set = new Set(
      [...db.values()]
        .filter((d) =>
          d.abilities.some(
            (a) => a.kind === 'static' && a.effect.kind === 'attached' && a.effect.allCreatureTypes,
          ),
        )
        .map((d) => d.id),
    );
    allTypesAttachersCache.set(db, set);
  }
  return set;
}

/**
 * Changeling's characteristic-defining ability precedes explicit type setters. Lorwyn Eclipsed (18a): "gains all creature
 * types" (for good, until end of turn, or while equipped) counts like it, and the latest of that and the type setters
 * ("loses all creature types", Donald Blake's replacement) wins.
 */
function changeling(ctx: Ctx, id: ObjectId, subtype: string): boolean {
  if (NON_CREATURE_SUBTYPES.has(subtype)) return false;
  const o = obj(ctx, id);
  // Lorwyn Eclipsed (18b, blue): Omni-Changeling, a copy "except it has changeling".
  let all = def(ctx, id).keywords.includes('changeling') || obj(ctx, id).grantedKeywords?.includes('changeling') ? -1 : -2;
  let setter = -2;
  if (o.zone === 'battlefield') {
    if (o.creatureTypes) setter = o.creatureTypesTimestamp ?? o.timestamp;
    if (o.allCreatureTypes !== undefined) all = Math.max(all, o.allCreatureTypes);
    for (const e of ctx.s.effects) {
      if (e.affected.id !== id || e.affected.zcc !== o.zcc) continue;
      if (e.creatureSubtype || e.noCreatureTypes) setter = Math.max(setter, e.timestamp);
      if (e.allCreatureTypes) all = Math.max(all, e.timestamp);
    }
    const attachers = allTypesAttachers(ctx.db);
    if (attachers.size)
      for (const srcId of ctx.s.battlefield) {
        const src = obj(ctx, srcId);
        if (src.attachedTo === id && attachers.has(src.defId)) all = Math.max(all, src.timestamp);
      }
  }
  return all > setter;
}

/** Is it every creature type (a changeling, or something that gained all creature types)? */
export function hasAllCreatureTypes(ctx: Ctx, id: ObjectId): boolean {
  return changeling(ctx, id, 'Goblin');
}

/** Has this subtype (printed, gained, or every creature type for a changeling). */
/**
 * The creature type chosen for the source as it entered. Lorwyn Eclipsed (18b, special): once it has left the battlefield the
 * type it had is used (Dawn-Blessed Pennant, sacrificed as a cost: "return target card of the chosen type").
 */
export function chosenTypeOf(ctx: Ctx, sourceId: ObjectId): string | undefined {
  const o = ctx.s.objects[sourceId];
  return o?.chosenType ?? (o && o.zone !== 'battlefield' ? o.lastChosenType : undefined);
}

export function hasSubtype(ctx: Ctx, id: ObjectId, subtype: string): boolean {
  return subtypesOf(ctx, id).includes(subtype) || changeling(ctx, id, subtype);
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

// Marvel Super Heroes Jumpstart (Wakanda)
/** An Aura on it says "its activated abilities can't be activated" (Secure Detention). */
export function abilitiesLocked(ctx: Ctx, id: ObjectId): boolean {
  return (
    ctx.s.battlefield.some(
      (src) =>
        obj(ctx, src).attachedTo === id &&
        def(ctx, src).abilities.some(
          (a) => a.kind === 'static' && a.effect.kind === 'attached' && a.effect.cantActivate,
        ),
    ) || lockedByStatic(ctx, id)
  );
}

// Tarkir: Dragonstorm (19b, white): Clarion Conqueror, "activated abilities of artifacts, creatures, and planeswalkers can't be
// activated". The cards with the static are found once per card database (this is asked for every ability of every permanent).
const LOCKERS = new WeakMap<object, Set<string>>();
function lockerDefs(ctx: Ctx): Set<string> {
  let set = LOCKERS.get(ctx.db);
  if (!set) {
    set = new Set();
    for (const d of ctx.db.values())
      if (d.abilities.some((a) => a.kind === 'static' && a.effect.kind === 'noActivatedAbilities'))
        set.add(d.id);
    LOCKERS.set(ctx.db, set);
  }
  return set;
}
function lockedByStatic(ctx: Ctx, id: ObjectId): boolean {
  const lockers = lockerDefs(ctx);
  if (lockers.size === 0) return false;
  for (const src of ctx.s.battlefield) {
    if (!lockers.has(obj(ctx, src).defId)) continue;
    if (
      def(ctx, src).abilities.some(
        (a) =>
          a.kind === 'static' &&
          a.effect.kind === 'noActivatedAbilities' &&
          matchesFilter(ctx, id, a.effect.filter),
      )
    )
      return true;
  }
  return false;
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
    filter.maxPowerOrToughness !== undefined ||
    filter.maxPowerPlusToughness !== undefined ||
    !!filter.hasKeyword ||
    !!filter.lacksKeyword;
  const c = needsComputed
    ? characteristics(ctx, id)
    : {
        power: 0,
        toughness: 0,
        keywords: new Set<Keyword>(),
        subtypes: subtypesOf(ctx, id),
      };
  if (filter.maxPower !== undefined && c.power > filter.maxPower) return false;
  // Secrets of Strixhaven (14b): Arnyn, Deathbloom Botanist.
  if (
    filter.maxPowerOrToughness !== undefined &&
    Math.min(c.power, c.toughness) > filter.maxPowerOrToughness
  )
    return false;
  // Lorwyn Eclipsed (18b, red): Meek Attack.
  if (
    filter.maxPowerPlusToughness !== undefined &&
    c.power + c.toughness > filter.maxPowerPlusToughness
  )
    return false;
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
  // Marvel Super Heroes Jumpstart (HYDRA): "attacking alone".
  if (
    filter.attackingAlone &&
    !(ctx.s.combat?.attackers.length === 1 && ctx.s.combat.attackers[0]!.id === id)
  )
    return false;
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
  // Strixhaven Brawl (15b, b): "an enchanted creature".
  if (
    filter.enchanted &&
    !ctx.s.battlefield.some(
      (e) => obj(ctx, e).attachedTo === id && def(ctx, e).subtypes.includes('Aura'),
    )
  )
    return false;
  if (filter.damaged && obj(ctx, id).damage <= 0) return false;
  // Reality Fracture (17a): Hexhaven Dueling Arena.
  // Reality Fracture (17a fixes): and still the same object (not blinked or returned since).
  if (
    filter.attackedThisTurn &&
    !(ctx.s.turn.attackers.includes(id) && obj(ctx, id).attackedZcc === obj(ctx, id).zcc)
  )
    return false;
  if (
    filter.hasCounters &&
    !obj(ctx, id).plusOneCounters &&
    !Object.values(obj(ctx, id).counters ?? {}).some((n) => n > 0)
  )
    return false;
  // Secrets of Strixhaven (14b): Rocket Volley.
  if (filter.nonbasic && def(ctx, id).supertypes.includes('Basic')) return false;
  // Strixhaven (13b): monocolored (Vanishing Verse).
  if (filter.monocolored && def(ctx, id).colors.length !== 1) return false;
  // Strixhaven (13c): nonlegendary.
  if (filter.nonlegendary && def(ctx, id).supertypes.includes('Legendary')) return false;
  if (filter.commander && !isCommander(ctx, id)) return false;
  if (filter.supertypes && !filter.supertypes.some((t) => def(ctx, id).supertypes.includes(t)))
    return false;
  // Strixhaven (13c): Hofri's Spirits etc. use nonlegendary too.
  if (filter.nonlegendary && def(ctx, id).supertypes.includes('Legendary')) return false;
  // Final Fantasy (11c): nonlegendary.
  if (filter.notSupertypes?.some((t) => def(ctx, id).supertypes.includes(t))) return false;
  if (filter.toughnessGreaterThanPower) {
    const ch = characteristics(ctx, id);
    if (ch.toughness <= ch.power) return false;
  }
  // Marvel Super Heroes Jumpstart (Marvelous): Ms. Marvel, Elastic Ally.
  if (filter.powerAboveBase && characteristics(ctx, id).power <= basePowerOf(ctx, id)) return false;
  if (filter.chosenTypeOfSource) {
    const chosen = sourceId ? chosenTypeOf(ctx, sourceId) : undefined;
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
  const subtypes = subtypesOf(ctx, id);
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
    // Lorwyn Eclipsed (18b, multi-b): Doran, "creature spells with toughness greater than their power" (printed, off the battlefield).
    if (filter.toughnessGreaterThanPower && (d.toughness ?? 0) <= (d.power ?? 0)) return false;
    if (filter.hasKeyword && !d.keywords.includes(filter.hasKeyword)) return false;
    if (filter.lacksKeyword && d.keywords.includes(filter.lacksKeyword)) return false;
    if (filter.minPower !== undefined && (d.power ?? 0) < filter.minPower) return false;
    if (filter.maxPower !== undefined && (d.power ?? 0) > filter.maxPower) return false;
    // Lorwyn Eclipsed (18b, red): Meek Attack, a creature card in hand (printed power and toughness).
    if (
      filter.maxPowerPlusToughness !== undefined &&
      (d.power ?? 0) + (d.toughness ?? 0) > filter.maxPowerPlusToughness
    )
      return false;
  }
  // Reality Fracture (17a): Puppet Crafting makes a permanent a creature (so does a crewed Vehicle).
  const hasType = (t: CardType): boolean =>
    d.types.includes(t) ||
    (t === 'Creature' && obj(ctx, id).zone === 'battlefield' && isCreature(ctx, id)) ||
    // The Hobbit (20b white): Stone by Sunlight makes a creature an artifact too.
    (t === 'Artifact' && obj(ctx, id).zone === 'battlefield' && isArtifactByEffect(ctx, id));
  if (filter.types && !filter.types.some(hasType)) return false;
  if (
    filter.subtypes &&
    !filter.subtypes.some((st) => subtypes.includes(st) || changeling(ctx, id, st))
  )
    return false;
  if (filter.colors && !filter.colors.some((color) => d.colors.includes(color))) return false;
  if (filter.notTypes?.some(hasType)) return false;
  // Mystical Archive (16): Doom Blade.
  if (filter.notColors?.some((c) => d.colors.includes(c))) return false;
  // Secrets of Strixhaven (14b): Rocket Volley.
  if (filter.nonbasic && d.supertypes.includes('Basic')) return false;
  // Strixhaven (13b): monocolored.
  if (filter.monocolored && d.colors.length !== 1) return false;
  // Secrets of Strixhaven (14b): multicolored.
  if (filter.multicolored && d.colors.length < 2) return false;
  // Strixhaven (13c): nonlegendary.
  if (filter.nonlegendary && d.supertypes.includes('Legendary')) return false;
  if (filter.commander && !isCommander(ctx, id)) return false;
  if (filter.supertypes && !filter.supertypes.some((t) => d.supertypes.includes(t))) return false;
  // Strixhaven (13c): Plargg (nonlegendary), Silverquill Silencer (the chosen name).
  if (filter.nonlegendary && d.supertypes.includes('Legendary')) return false;
  // Secrets of Strixhaven (14b): Nita, Forum Conciliator ("a spell you don't own").
  if (filter.notOwnedByController && obj(ctx, id).owner === obj(ctx, id).controller) return false;
  // The Hobbit (20b white): The Eagles Are Coming!, "target creature you own".
  if (
    filter.ownedBySourceController &&
    sourceId &&
    ctx.s.objects[sourceId] &&
    obj(ctx, id).owner !== obj(ctx, sourceId).controller
  )
    return false;
  // Secrets of Strixhaven (14b): Matterbending Mage.
  if (filter.hasX && !d.manaCost.x) return false;
  if (filter.chosenNameOfSource) {
    const name = sourceId ? ctx.s.objects[sourceId]?.chosenName : undefined;
    if (!name || obj(ctx, id).defId !== name) return false;
  }
  // Final Fantasy (11c): nonlegendary.
  if (filter.notSupertypes?.some((t) => d.supertypes.includes(t))) return false;
  // Lorwyn Eclipsed (18b, blue): a spell on the stack counts X in its mana value (Kulrath Mystic, Spell Snare).
  const stackX =
    d.manaCost.x && obj(ctx, id).zone === 'stack'
      ? (ctx.s.stack.find((x) => x.kind === 'spell' && x.id === id)?.x ?? 0) * d.manaCost.x
      : 0;
  const mv = manaValue(d.manaCost) + stackX;
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
  // Lorwyn Eclipsed (18b, special): "spells you cast of the chosen type" (Gathering Stone, Chronicle of Victory), cards in hand or graveyard.
  if (filter.chosenTypeOfSource) {
    const chosen = sourceId ? chosenTypeOf(ctx, sourceId) : undefined;
    if (!chosen || !hasSubtype(ctx, id, chosen)) return false;
  }
  if (filter.enteredThisTurn && obj(ctx, id).zoneTurn !== ctx.s.turn.number) return false;
  if (filter.leftAttacking && !obj(ctx, id).leftAttacking) return false;
  if (filter.attachedToSource && (!sourceId || obj(ctx, id).attachedTo !== sourceId)) return false;
  // Lorwyn Eclipsed (18c): Subterranean Schooner, "target creature that crewed it this turn".
  if (filter.crewedSource) {
    const crewed = sourceId ? ctx.s.objects[sourceId]?.crewedBy : undefined;
    if (crewed?.turn !== ctx.s.turn.number || !crewed.ids.includes(id)) return false;
  }
  // Strixhaven Brawl (15b, w): Sage's Reverie, Role tokens, bestowed Auras, mentor.
  if (filter.attachedToCreature) {
    const host = obj(ctx, id).attachedTo;
    const h = host !== undefined ? ctx.s.objects[host] : undefined;
    if (!h || h.zone !== 'battlefield' || !isCreature(ctx, h.id)) return false;
  }
  if (filter.hostOfSource && (!sourceId || obj(ctx, sourceId).attachedTo !== id)) return false;
  if (filter.lesserPowerThanSource && sourceId) {
    const s = obj(ctx, sourceId);
    const ref =
      s.attachedTo !== undefined && def(ctx, sourceId).subtypes.includes('Aura')
        ? s.attachedTo
        : sourceId;
    if (power(ctx, id) >= power(ctx, ref)) return false;
  }
  if (filter.notAttachedHost && sourceId && obj(ctx, sourceId).attachedTo === id) return false;
  if (filter.manaValueParity) {
    const mv = manaValue(def(ctx, id).manaCost);
    if ((mv % 2 === 1 ? 'odd' : 'even') !== filter.manaValueParity) return false;
  }
  if (filter.notSubtype && d.subtypes.includes(filter.notSubtype)) return false;
  // Final Fantasy (11c): "isn't a Kraken, Leviathan, Merfolk, Octopus, or Serpent".
  if (filter.notSubtypes?.some((st) => subtypes.includes(st) || changeling(ctx, id, st)))
    return false;
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
          : filter.maxManaValue === 'colorsSpent'
            ? // Secrets of Strixhaven (14b): Sundering Archaic.
              sourceId
              ? (obj(ctx, sourceId).manaColors?.length ?? 0)
              : 0
            : filter.maxManaValue === 'x'
              ? // Lorwyn Eclipsed (18a): Celestial Reunion, "mana value X or less" (the spell's X).
                sourceId
                ? (ctx.s.stack.find((i) => i.kind === 'spell' && i.id === sourceId)?.x ??
                  obj(ctx, sourceId).xPaid ??
                  0)
                : 0
              : filter.maxManaValue;
    if (mv > max) return false;
  }
  if (filter.other && id === sourceId) return false;
  // Kid Loki: "that you've put one or more +1/+1 counters on this turn".
  if (filter.countersPutThisTurn && obj(ctx, id).countersTurn !== ctx.s.turn.number) return false;
  if (!avengersFilter(ctx, id, filter, sourceId)) return false;
  return true;
}

/**
 * Base power: printed, copied, characteristic-defining, or set by an effect ("base power 3")
 * or an Aura's or Equipment's static ability (Hulkbuster Armor: base 9/9), the latest
 * winning. Marvel Super Heroes Jumpstart (Marvelous).
 */
function basePowerOf(ctx: Ctx, id: ObjectId): number {
  const o = obj(ctx, id);
  const d = def(ctx, id);
  let base =
    d.powerEquals !== undefined
      ? countOf(ctx, o.controller, d.powerEquals, true)
      : d.ptEquals !== undefined
        ? countFor(ctx, o, d)
        : o.hobLandsPT // The Hobbit (20b green): Beorn's Hospitality
          ? countOf(ctx, o.controller, { count: 'landsYouControl' }, true)
          : (o.copyPT?.power ?? d.power ?? 0);
  base = basePTOverride(ctx, id)?.[0] ?? base;
  return base;
}

/** The latest layer-7b setting, before counters and additive bonuses (Iron Suitcase). */
function basePTOverride(ctx: Ctx, id: ObjectId): [number, number] | undefined {
  const o = obj(ctx, id);
  let latest = -1;
  let result: [number, number] | undefined;
  for (const e of ctx.s.effects) {
    if (e.basePT && e.affected.id === id && e.affected.zcc === o.zcc && e.timestamp >= latest) {
      latest = e.timestamp;
      result = e.basePT;
    }
  }
  for (const srcId of ctx.s.battlefield) {
    const src = obj(ctx, srcId);
    if (src.attachedTo !== id || src.timestamp < latest) continue;
    for (const a of def(ctx, srcId).abilities) {
      if (a.kind !== 'static' || a.effect.kind !== 'attached') continue;
      if (a.effect.basePT) {
        latest = src.timestamp;
        result = a.effect.basePT;
      }
      if (a.effect.basePTAmount !== undefined) {
        const x = countOf(ctx, src.controller, a.effect.basePTAmount, false, srcId);
        latest = src.timestamp;
        result = [x, x];
      }
    }
  }
  return result;
}

/** Avengers Assemble (9b) filter parts: chosen types, modified, power, the commander's types. */
function avengersFilter(
  ctx: Ctx,
  id: ObjectId,
  filter: CardFilter,
  sourceId: ObjectId | undefined,
): boolean {
  if (filter.named && nameId(ctx, id) !== filter.named) return false;
  const chosen = sourceId ? chosenTypeOf(ctx, sourceId) : undefined;
  if (filter.chosenTypeOfSource && !(chosen && hasSubtype(ctx, id, chosen))) return false;
  if (filter.notChosenTypeOfSource && chosen && hasSubtype(ctx, id, chosen)) return false;
  // The Hobbit (20b black): Gollum, Riddle Master, "a spell with mana value of the chosen quality" (odd or even).
  if (filter.manaValueParityOfSource) {
    if (chosen !== 'odd' && chosen !== 'even') return false;
    if ((manaValue(def(ctx, id).manaCost) % 2 === 1 ? 'odd' : 'even') !== chosen) return false;
  }
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
  // Strixhaven Brawl (15b, pair): Killian, Eriette: enchanted by an Aura the source's controller controls.
  if (filter.enchantedByYourAura) {
    const who = sourceId ? obj(ctx, sourceId).controller : o.controller;
    const enchanted = ctx.s.battlefield.some((a) => {
      const att = obj(ctx, a);
      return (
        att.attachedTo === id && att.controller === who && def(ctx, a).subtypes.includes('Aura')
      );
    });
    if (!enchanted) return false;
  }
  // Strixhaven Brawl (15b, pair): Primo, the Unbounded: base power 0.
  if (filter.basePowerZero && (def(ctx, id).power ?? 0) !== 0) return false;
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
  'decayed', // Tarkir: Dragonstorm (19a): Rot-Curse Rakshasa's decayed counter
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
