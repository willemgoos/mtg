import { characteristics, countOf, hasSubtype } from './characteristics.ts';
import {
  type Ctx,
  type CustomEffect,
  def,
  defOf,
  emit,
  moveObject,
  obj,
} from './context.ts';
import { manaValue } from './cost.ts';
import { millCount } from './effects.ts';
import { shuffleInPlace } from './rng.ts';
import { type Chooser, CHOOSERS } from './stx-13c-a-effects.ts';
import type {
  CardDb,
  CardDefId,
  Color,
  EffectDef,
  ObjectId,
  PlayerId,
  StaticDef,
} from './types.ts';

/**
 * Lorwyn Eclipsed (18b, multi-b): engine pieces for Doran, Bre, Lluwen, Maralen, Sanar, Tam and Twinflame Travelers, as
 * custom effects, the choosers behind `chooseCustom`, and the helpers the engine calls (targeting, triggers, casting).
 */

const custom = (handler: string, params?: Record<string, unknown>): EffectDef => ({
  kind: 'custom',
  handler,
  ...(params ? { params } : {}),
});

const COLORS: readonly Color[] = ['W', 'U', 'B', 'R', 'G'];
const COLOR_NAMES: Record<Color, string> = {
  W: 'white',
  U: 'blue',
  B: 'black',
  R: 'red',
  G: 'green',
};

// ---------------------------------------------------------------------------
// Which cards have a static ability of a kind (cached per database)
// ---------------------------------------------------------------------------

const staticDefsCache = new WeakMap<CardDb, Map<string, ReadonlySet<CardDefId>>>();

export function defsWithStatic(db: CardDb, kind: StaticDef['kind']): ReadonlySet<CardDefId> {
  let byKind = staticDefsCache.get(db);
  if (!byKind) staticDefsCache.set(db, (byKind = new Map()));
  let ids = byKind.get(kind);
  if (!ids) {
    ids = new Set(
      [...db.values()]
        .filter((d) => d.abilities.some((a) => a.kind === 'static' && a.effect.kind === kind))
        .map((d) => d.id),
    );
    byKind.set(kind, ids);
  }
  return ids;
}

/** The permanents on the battlefield (with a static ability of this kind they still have) that `player` controls. */
function staticSources(ctx: Ctx, player: PlayerId, kind: StaticDef['kind']): ObjectId[] {
  const ids = defsWithStatic(ctx.db, kind);
  if (ids.size === 0) return [];
  return ctx.s.battlefield.filter((id) => {
    const o = obj(ctx, id);
    return (
      o.controller === player &&
      ids.has(o.defId) &&
      def(ctx, id).abilities.some((a) => a.kind === 'static' && a.effect.kind === kind)
    );
  });
}

// ---------------------------------------------------------------------------
// Tam, Mindful First-Year: hexproof from each of its colors
// ---------------------------------------------------------------------------

/**
 * Does `targetId` have hexproof from the colors of `sourceId` because of Tam ("each other creature you control has hexproof from
 * each of its colors")? The caller has checked that the source's controller is an opponent.
 */
export function hexproofFromOwnColors(ctx: Ctx, targetId: ObjectId, sourceId: ObjectId): boolean {
  const target = obj(ctx, targetId);
  if (!defsWithStatic(ctx.db, 'hexproofFromOwnColors').size) return false;
  if (!staticSources(ctx, target.controller, 'hexproofFromOwnColors').some((id) => id !== targetId))
    return false;
  if (!characteristics(ctx, targetId).types.includes('Creature')) return false;
  const source = def(ctx, sourceId).colors;
  return def(ctx, targetId).colors.some((c) => source.includes(c));
}

// ---------------------------------------------------------------------------
// Twinflame Travelers: another Elemental's triggered abilities trigger an additional time
// ---------------------------------------------------------------------------

/**
 * How many additional times a triggered ability of `o` (a permanent, or what it was as it left) triggers: once for each
 * Twinflame Travelers its controller has other than `o` itself, if `o` is an Elemental.
 */
export function elementalTriggerCopies(
  ctx: Ctx,
  o: { id: ObjectId; defId: CardDefId; controller: PlayerId },
): number {
  if (!defsWithStatic(ctx.db, 'elementalTriggersTwice').size) return 0;
  const sources = staticSources(ctx, o.controller, 'elementalTriggersTwice').filter(
    (id) => id !== o.id,
  );
  if (sources.length === 0) return 0;
  const live = ctx.s.objects[o.id];
  const elemental =
    live && live.zone === 'battlefield' && live.defId === o.defId
      ? hasSubtype(ctx, o.id, 'Elemental')
      : defOf(ctx, o.defId).subtypes.includes('Elemental') ||
        defOf(ctx, o.defId).keywords.includes('changeling');
  return elemental ? sources.length : 0;
}

// ---------------------------------------------------------------------------
// Maralen, Fae Ascendant: cast a spell from among the cards exiled with it this turn
// ---------------------------------------------------------------------------

/**
 * The permanent that lets `player` cast `card` now without paying its mana cost, once each turn (Maralen, Fae Ascendant): the card
 * was exiled with it this turn, isn't a land and has a mana value that is low enough.
 */
export function exiledCastSource(ctx: Ctx, player: PlayerId, card: ObjectId): ObjectId | undefined {
  const c = ctx.s.objects[card];
  const w = c?.exiledWithThisTurn;
  if (!c || c.zone !== 'exile' || !w || w.turn !== ctx.s.turn.number) return undefined;
  const src = ctx.s.objects[w.by];
  if (!src || src.zone !== 'battlefield' || src.zcc !== w.zcc || src.controller !== player)
    return undefined;
  if (src.freeCastUsed?.turn === ctx.s.turn.number && src.freeCastUsed.zcc === src.zcc)
    return undefined;
  const d = def(ctx, card);
  if (d.types.includes('Land')) return undefined;
  const limit = def(ctx, src.id).abilities.flatMap((a) =>
    a.kind === 'static' && a.effect.kind === 'castFreeFromThisTurnsExile'
      ? [countOf(ctx, player, a.effect.maxManaValue, false, src.id)]
      : [],
  )[0];
  if (limit === undefined || manaValue(d.manaCost) > limit) return undefined;
  return src.id;
}

/** The cards in exile `player` may cast through `exiledCastSource` right now. */
export function exiledCastCards(ctx: Ctx, player: PlayerId): ObjectId[] {
  if (!defsWithStatic(ctx.db, 'castFreeFromThisTurnsExile').size) return [];
  const out: ObjectId[] = [];
  for (const p of ['p1', 'p2'] as const)
    for (const id of ctx.s.players[p].exile) if (exiledCastSource(ctx, player, id)) out.push(id);
  return out;
}

/** A spell was cast through `exiledCastSource`: the permanent's once this turn is used. */
export function useExiledCast(ctx: Ctx, player: PlayerId, card: ObjectId): boolean {
  const id = exiledCastSource(ctx, player, card);
  if (id === undefined) return false;
  const o = obj(ctx, id);
  o.freeCastUsed = { turn: ctx.s.turn.number, zcc: o.zcc };
  return true;
}

// ---------------------------------------------------------------------------
// Custom effects
// ---------------------------------------------------------------------------

export const ECL_MULTI_B_EFFECTS: Record<string, CustomEffect> = {
  /**
   * Doran, Besieged by Time: the creature that attacked or blocked gets +X/+X until end of turn, where X is the difference
   * between its power and toughness (worked out as the ability resolves).
   */
  doranPump(ctx, es) {
    const s = es.subject && ctx.s.objects[es.subject.id];
    if (!s || s.zone !== 'battlefield' || s.zcc !== es.subject!.zcc) return;
    const c = characteristics(ctx, s.id);
    const x = Math.abs(c.power - c.toughness);
    (ctx.deferred ??= []).push({ kind: 'pump', to: 'subject', power: x, toughness: x });
  },

  /**
   * Bre of Clan Stoutarm: exile cards from the top of your library until you exile a nonland card. You may cast it without paying
   * its mana cost if its mana value is at most the life you gained this turn; otherwise it goes into your hand.
   */
  breEndStep(ctx, es) {
    const gained = ctx.s.turn.lifeGained?.[es.controller] ?? 0;
    const lib = ctx.s.players[es.controller].library;
    while (lib.length > 0) {
      const top = lib[0]!;
      moveObject(ctx, top, 'exile');
      if (def(ctx, top).types.includes('Land')) continue;
      if (manaValue(def(ctx, top).manaCost) <= gained)
        (ctx.deferred ??= []).push({
          kind: 'castFreeCard',
          card: { id: top, zcc: obj(ctx, top).zcc },
        });
      else moveObject(ctx, top, 'hand');
      return;
    }
  },

  /**
   * Lluwen, Imperfect Naturalist: mill four cards, then you may put a creature or land card from among the milled cards on top
   * of your library.
   */
  lluwenMill(ctx, es) {
    const p = es.controller;
    const milled: ObjectId[] = [];
    for (const id of ctx.s.players[p].library.slice(0, millCount(ctx, p, 4))) {
      moveObject(ctx, id, 'graveyard');
      if (ctx.s.objects[id]?.zone === 'graveyard') milled.push(id);
    }
    const choices = milled.filter((id) => {
      const t = def(ctx, id).types;
      return t.includes('Creature') || t.includes('Land');
    });
    if (choices.length > 0)
      (ctx.deferred ??= []).push({
        kind: 'chooseCustom',
        handler: 'lluwenPut',
        params: { ids: choices },
      });
  },
  lluwenTop(ctx, _es, params) {
    const id = (params as { id: ObjectId }).id;
    if (ctx.s.objects[id]?.zone === 'graveyard') moveObject(ctx, id, 'library');
  },

  /** Maralen, Fae Ascendant: exile the top two cards of the target opponent's library; they were exiled with Maralen this turn. */
  maralenExile(ctx, es) {
    const t = es.targets[0];
    if (!t || !('player' in t) || !es.source) return;
    for (const id of ctx.s.players[t.player].library.slice(0, 2)) {
      moveObject(ctx, id, 'exile');
      const o = obj(ctx, id);
      if (o.zone === 'exile')
        o.exiledWithThisTurn = { by: es.source.id, zcc: es.source.zcc, turn: ctx.s.turn.number };
    }
  },

  /**
   * Sanar, Innovative First-Year: reveal cards from the top of your library until you reveal X nonland cards, where X is the number
   * of colors among permanents you control. Then, for each of those colors, you may exile a card of that color from among the
   * revealed cards (one color at a time), then shuffle. You may cast the exiled cards this turn.
   */
  sanarReveal(ctx, es) {
    const p = es.controller;
    const colors = COLORS.filter((c) =>
      ctx.s.battlefield.some((id) => obj(ctx, id).controller === p && def(ctx, id).colors.includes(c)),
    );
    const lib = ctx.s.players[p].library;
    const revealed: ObjectId[] = [];
    let nonland = 0;
    for (const id of lib) {
      if (nonland >= colors.length) break;
      revealed.push(id);
      emit(ctx, { type: 'revealed', player: p, id });
      if (!def(ctx, id).types.includes('Land')) nonland++;
    }
    (ctx.deferred ??= []).push(
      { kind: 'chooseCustom', handler: 'sanarPick', params: { revealed, colors, at: 0 } },
      custom('sanarShuffle'),
    );
  },
  sanarExile(ctx, _es, params) {
    const id = (params as { id: ObjectId }).id;
    if (!ctx.s.objects[id] || obj(ctx, id).zone !== 'library') return;
    moveObject(ctx, id, 'exile');
    // "You may cast the exiled cards this turn."
    const exiled = obj(ctx, id);
    if (exiled.zone === 'exile') exiled.playableUntilTurn = ctx.s.turn.number;
  },
  sanarShuffle(ctx, es) {
    shuffleInPlace(ctx.s.rng, ctx.s.players[es.controller].library);
  },

  /** Tam, Mindful First-Year: the target creature becomes all colors until end of turn. */
  tamAllColors(ctx, es) {
    const t = es.targets[0];
    if (!t || !('object' in t)) return;
    const o = ctx.s.objects[t.object.id];
    if (!o || o.zone !== 'battlefield' || o.zcc !== t.object.zcc) return;
    o.allColorsTurn = ctx.s.turn.number;
    ctx.s.colorChanges = true;
  },
};

const ECL_MULTI_B_CHOOSERS: Record<string, Chooser> = {
  /** Lluwen: put a creature or land card from among the milled cards on top of your library, or none. */
  lluwenPut(ctx, _es, params) {
    const ids = (params as { ids: ObjectId[] }).ids.filter(
      (id) => ctx.s.objects[id]?.zone === 'graveyard',
    );
    if (ids.length === 0) return null;
    return {
      title: 'Lluwen: put a creature or land card from among the milled cards on top of your library?',
      options: [
        ...ids.map((id) => ({
          label: `Put ${def(ctx, id).name} on top of your library`,
          effects: [custom('lluwenTop', { id })],
        })),
        { label: 'Put none of them on top', effects: [] },
      ],
    };
  },

  /** Sanar: for the next color that has a card among the revealed ones, exile one of that color or none. */
  sanarPick(ctx, es, params) {
    const p = params as { revealed: ObjectId[]; colors: Color[]; at: number };
    for (let k = p.at; k < p.colors.length; k++) {
      const color = p.colors[k]!;
      const cards = p.revealed.filter(
        (id) =>
          ctx.s.objects[id]?.zone === 'library' &&
          obj(ctx, id).owner === es.controller &&
          !def(ctx, id).types.includes('Land') &&
          def(ctx, id).colors.includes(color),
      );
      if (cards.length === 0) continue;
      const next = (): EffectDef => ({
        kind: 'chooseCustom',
        handler: 'sanarPick',
        params: { revealed: p.revealed, colors: p.colors, at: k + 1 },
      });
      return {
        title: `Sanar: exile a ${COLOR_NAMES[color]} card from among the revealed cards?`,
        options: [
          ...cards.map((id) => ({
            label: `Exile ${def(ctx, id).name}`,
            effects: [custom('sanarExile', { id }), next()],
          })),
          { label: `Exile no ${COLOR_NAMES[color]} card`, effects: [next()] },
        ],
      };
    }
    return null;
  },
};
Object.assign(CHOOSERS, ECL_MULTI_B_CHOOSERS);
