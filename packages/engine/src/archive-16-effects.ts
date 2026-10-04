import { creaturesOnBattlefield } from './characteristics.ts';
import {
  type Ctx,
  type CustomEffect,
  addCounters,
  createObject,
  def,
  emit,
  moveObject,
  newTimestamp,
  obj,
  other,
  sacrifice,
} from './context.ts';
import { manaValue } from './cost.ts';
import { changeLife, counterSpell } from './effects.ts';
import { shuffleLibrary } from './setup.ts';
import { type Chooser, CHOOSERS } from './stx-13c-a-effects.ts';
import type { Color, EffectDef, EffectSource, ObjectId, PlayerId } from './types.ts';

/**
 * Mystical Archive (16): one-off effects of the STA and SOA cards that no
 * existing effect covers, as custom effects, plus the choosers behind
 * `chooseCustom`.
 */

const custom = (handler: string, params?: Record<string, unknown>): EffectDef => ({
  kind: 'custom',
  handler,
  ...(params ? { params } : {}),
});

const COLORS: readonly Color[] = ['W', 'U', 'B', 'R', 'G'];

/** The object a target slot points at, in whatever zone it is, if it is still the same object. */
function targetId(ctx: Ctx, es: EffectSource, i: number): ObjectId | undefined {
  const t = es.targets[i];
  if (!t || !('object' in t)) return undefined;
  const o = ctx.s.objects[t.object.id];
  return o && o.zcc === t.object.zcc ? o.id : undefined;
}

/** A token (by definition id) put onto the battlefield under `controller`. */
function putToken(ctx: Ctx, defId: string, controller: PlayerId) {
  const token = createObject(ctx, defId, controller, 'battlefield', true);
  ctx.s.battlefield.push(token.id);
  emit(ctx, {
    type: 'objectMoved',
    id: token.id,
    defId: token.defId,
    from: null,
    to: 'battlefield',
  });
  return token;
}

export const ARCHIVE_16_EFFECTS: Record<string, CustomEffect> = {
  /** Royal Treatment, Monster Role: a Role token attached to the target creature; another Role you control on it goes away. */
  archiveRole(ctx, es, params) {
    const role = (params as { role: string }).role;
    const host = targetId(ctx, es, 0);
    if (host === undefined || obj(ctx, host).zone !== 'battlefield') return;
    for (const id of [...ctx.s.battlefield]) {
      const r = obj(ctx, id);
      if (
        r.attachedTo === host &&
        r.controller === es.controller &&
        def(ctx, id).subtypes.includes('Role')
      )
        moveObject(ctx, id, 'graveyard');
    }
    const token = putToken(ctx, role, es.controller);
    token.attachedTo = host;
  },

  /** Blue Sun's Zenith: shuffle this spell into its owner's library. */
  shuffleSelfIntoLibrary(ctx, es) {
    const id = es.source?.id;
    const o = id && ctx.s.objects[id];
    if (!o || o.zone !== 'stack') return;
    moveObject(ctx, o.id, 'library');
    shuffleLibrary(ctx, o.owner);
  },

  /** Memory Lapse: counter target spell; if it is countered this way, it goes on top of its owner's library. */
  counterToTop(ctx, es) {
    const id = targetId(ctx, es, 0);
    if (id === undefined || !ctx.s.stack.some((x) => x.kind === 'spell' && x.id === id)) return;
    counterSpell(ctx, id);
    const o = ctx.s.objects[id];
    if (o?.zone === 'graveyard') moveObject(ctx, id, 'library', { position: 'top' });
  },

  /** Feed the Swarm: destroy the target permanent, then lose life equal to its mana value. */
  feedTheSwarm(ctx, es) {
    const id = targetId(ctx, es, 0);
    if (id === undefined || obj(ctx, id).zone !== 'battlefield') return;
    const mv = manaValue(def(ctx, id).manaCost);
    moveObject(ctx, id, 'graveyard');
    changeLife(ctx, es.controller, -mv);
  },

  /** Living End: each player exiles their graveyard's creature cards, sacrifices their creatures, then all the exiled cards enter. */
  livingEnd(ctx) {
    const exiled: { id: ObjectId; owner: PlayerId }[] = [];
    for (const p of ['p1', 'p2'] as const)
      for (const id of [...ctx.s.players[p].graveyard])
        if (def(ctx, id).types.includes('Creature')) {
          moveObject(ctx, id, 'exile');
          exiled.push({ id, owner: p });
        }
    for (const c of creaturesOnBattlefield(ctx)) sacrifice(ctx, c.id);
    for (const { id, owner } of exiled)
      if (ctx.s.objects[id]?.zone === 'exile')
        moveObject(ctx, id, 'battlefield', { controller: owner });
  },

  /** Approach of the Second Sun: "When you cast this spell", count it (the win needs a second cast). */
  approachCast(ctx, es) {
    const ps = ctx.s.players[es.controller];
    ps.approachCasts = (ps.approachCasts ?? 0) + 1;
  },

  /** Approach of the Second Sun: win on a second cast, else seventh from the top and gain 7. */
  approachResolve(ctx, es) {
    const ps = ctx.s.players[es.controller];
    if ((ps.approachCasts ?? 0) >= 2) {
      ctx.s.players[other(es.controller)].lost = true;
      return;
    }
    const id = es.source?.id;
    const o = id && ctx.s.objects[id];
    if (o && o.zone === 'stack') {
      moveObject(ctx, o.id, 'library', { position: 'top' });
      const lib = ctx.s.players[o.owner].library;
      lib.splice(lib.indexOf(o.id), 1);
      lib.splice(Math.min(6, lib.length), 0, o.id);
    }
    changeLife(ctx, es.controller, 7);
  },

  /**
   * Channel: until end of turn you may pay 1 life for {C}. Modelled as floating {C} that costs 1 life each time it
   * is spent (up to your life total less one, at most 12).
   */
  channel(ctx, es) {
    const ps = ctx.s.players[es.controller];
    const n = Math.min(12, Math.max(0, ps.life - 1));
    const pool = (ps.pool ??= []);
    for (let i = 0; i < n; i++) pool.push({ produces: ['C'], lifeCost: true });
  },

  /** Teferi's Protection: your life total can't change and you have protection from everything until your next turn. */
  teferisLock(ctx, es) {
    ctx.s.players[es.controller].lifeFrozen = true;
  },

  /** Angel's Grace: you can't lose the game this turn, and damage can't reduce your life total below 1. */
  angelsGraceLock(ctx, es) {
    ctx.s.turn.cantLose = [...(ctx.s.turn.cantLose ?? []), es.controller];
  },

  /** Veil of Summer: your spells can't be countered this turn. */
  uncounterableThisTurn(ctx, es) {
    ctx.s.turn.uncounterable = [...(ctx.s.turn.uncounterable ?? []), es.controller];
  },

  /** Berserk: at the next end step, destroy the target creature if it attacked this turn. */
  berserkDelay(ctx, es) {
    const t = es.targets[0];
    if (!t || !('object' in t)) return;
    (ctx.s.delayed ??= []).push({
      controller: es.controller,
      sourceDefId: es.sourceDefId,
      subject: t.object,
      effects: [custom('berserkEnd')],
      fromTurn: ctx.s.turn.number,
    });
  },
  berserkEnd(ctx, es) {
    const sub = es.subject;
    const o = sub && ctx.s.objects[sub.id];
    if (!o || o.zcc !== sub.zcc || o.zone !== 'battlefield') return;
    if (ctx.s.turn.attackers.includes(o.id)) moveObject(ctx, o.id, 'graveyard');
  },

  /** Mind's Desire: shuffle, exile the top card, and you may play it this turn without paying its mana cost. */
  mindsDesire(ctx, es) {
    shuffleLibrary(ctx, es.controller);
    const top = ctx.s.players[es.controller].library[0];
    if (top === undefined) return;
    moveObject(ctx, top, 'exile');
    const o = obj(ctx, top);
    o.playFreeBy = es.controller;
    o.playFreeUntilTurn = ctx.s.turn.number;
  },

  /** Akroma's Will: creatures you control gain protection from each colour until end of turn. */
  protectionFromEachColor(ctx, es) {
    for (const c of creaturesOnBattlefield(ctx, es.controller))
      for (const color of COLORS)
        ctx.s.effects.push({
          timestamp: newTimestamp(ctx),
          affected: { id: c.id, zcc: c.zcc },
          power: 0,
          toughness: 0,
          keywords: [],
          protectionFrom: color,
          expires: 'endOfTurn',
        });
  },

  /** Prismatic Ending: exile the target nonland permanent if its mana value is at most the colours spent. */
  prismaticEnding(ctx, es) {
    const id = targetId(ctx, es, 0);
    const src = es.source && ctx.s.objects[es.source.id];
    if (id === undefined || !src || obj(ctx, id).zone !== 'battlefield') return;
    if (manaValue(def(ctx, id).manaCost) <= (src.manaColors?.length ?? 0))
      moveObject(ctx, id, 'exile');
  },

  /** Jeska's Will: add {R} for each card in the target opponent's hand. */
  jeskasMana(ctx, es) {
    const n = ctx.s.players[other(es.controller)].hand.length;
    const pool = (ctx.s.players[es.controller].pool ??= []);
    for (let i = 0; i < n; i++) pool.push({ produces: ['R'] });
  },

  /** Requisition Raid: a +1/+1 counter on each creature the target player controls. */
  counterOnEachOfPlayer(ctx, es, params) {
    // `params.target` is the player's target slot (it shifts with the other chosen modes' targets).
    const t = es.targets[(params as { target: number }).target];
    if (!t || !('player' in t)) return;
    for (const c of creaturesOnBattlefield(ctx, t.player)) addCounters(ctx, c.id, 1);
  },

  /** Primal Command: the target player shuffles their graveyard into their library. */
  shuffleGraveyardIn(ctx, es, params) {
    const t = es.targets[(params as { target: number }).target];
    if (!t || !('player' in t)) return;
    for (const id of [...ctx.s.players[t.player].graveyard]) moveObject(ctx, id, 'library');
    shuffleLibrary(ctx, t.player);
  },

  /** Return to the Ranks: put up to X creature cards with mana value 2 or less from your graveyard onto the battlefield (the strongest first). */
  returnToRanks(ctx, es) {
    const x = es.x ?? 0;
    const gy = ctx.s.players[es.controller].graveyard
      .filter(
        (id) => def(ctx, id).types.includes('Creature') && manaValue(def(ctx, id).manaCost) <= 2,
      )
      .sort((a, b) => (def(ctx, b).power ?? 0) - (def(ctx, a).power ?? 0));
    for (const id of gy.slice(0, x))
      moveObject(ctx, id, 'battlefield', { controller: es.controller });
  },

  /** Winds of Abandon (overload): exile each creature you don't control; its controller puts that many basic lands onto the battlefield tapped. */
  windsOverload(ctx, es) {
    const opp = other(es.controller);
    let n = 0;
    for (const c of creaturesOnBattlefield(ctx, opp)) {
      moveObject(ctx, c.id, 'exile');
      n++;
    }
    fetchBasics(ctx, opp, n);
  },

  /** Discard this card from hand (a chooser's pick). */
  discardById(ctx, _es, params) {
    const id = (params as { id: ObjectId }).id;
    const o = ctx.s.objects[id];
    if (o && o.zone === 'hand') moveObject(ctx, id, 'graveyard');
  },

  /** Agonizing Remorse / Divine Gambit: exile a chosen card. */
  exileById(ctx, _es, params) {
    const id = (params as { id: ObjectId }).id;
    if (ctx.s.objects[id]) moveObject(ctx, id, 'exile');
  },

  /** Tainted Pact: the card goes from exile into your hand. */
  exiledToHand(ctx, _es, params) {
    const id = (params as { id: ObjectId }).id;
    if (ctx.s.objects[id]?.zone === 'exile') moveObject(ctx, id, 'hand');
  },

  /** Divine Gambit: put a permanent card from your hand onto the battlefield. */
  putPermanentFromHand(ctx, _es, params) {
    const id = (params as { id: ObjectId }).id;
    const o = ctx.s.objects[id];
    if (o && o.zone === 'hand') moveObject(ctx, id, 'battlefield', { controller: o.owner });
  },

  /** Deflecting Palm: the next damage to you this turn goes back at its source's controller. */
  deflectingPalm(ctx, es) {
    ctx.s.turn.deflect = [...(ctx.s.turn.deflect ?? []), es.controller];
  },

  /** Gods Willing: the target creature gains protection from the chosen colour until end of turn. */
  protectFromColor(ctx, es, params) {
    const id = targetId(ctx, es, 0);
    const color = (params as { color: Color }).color;
    const o = id !== undefined ? obj(ctx, id) : undefined;
    if (!o || o.zone !== 'battlefield') return;
    ctx.s.effects.push({
      timestamp: newTimestamp(ctx),
      affected: { id: o.id, zcc: o.zcc },
      power: 0,
      toughness: 0,
      keywords: [],
      protectionFrom: color,
      expires: 'endOfTurn',
    });
  },
};

/** Puts up to `n` basic lands from the library onto the battlefield tapped (the first ones found), then shuffles. */
function fetchBasics(ctx: Ctx, player: PlayerId, n: number): void {
  let left = n;
  for (const id of [...ctx.s.players[player].library]) {
    if (left <= 0) break;
    const d = def(ctx, id);
    if (!d.supertypes.includes('Basic') || !d.types.includes('Land')) continue;
    moveObject(ctx, id, 'battlefield', { controller: player });
    obj(ctx, id).tapped = true;
    left--;
  }
  shuffleLibrary(ctx, player);
}

const ARCHIVE_16_CHOOSERS: Record<string, Chooser> = {
  /** Tainted Pact: exile the top card; keep it, or go on until two share a name. */
  taintedPact(ctx, es, params) {
    const seen = ((params as { seen?: string[] } | undefined)?.seen ?? []) as string[];
    const top = ctx.s.players[es.controller].library[0];
    if (top === undefined) return null;
    const defId = obj(ctx, top).defId;
    const name = def(ctx, top).name;
    moveObject(ctx, top, 'exile');
    if (seen.includes(defId)) return null;
    return {
      title: `Tainted Pact: exiled ${name}`,
      options: [
        { label: `Put ${name} into your hand`, effects: [custom('exiledToHand', { id: top })] },
        {
          label: 'Exile another card',
          effects: [
            { kind: 'chooseCustom', handler: 'taintedPact', params: { seen: [...seen, defId] } },
          ],
        },
      ],
    };
  },

  /** Agonizing Remorse: a nonland card from their hand or any card from their graveyard. */
  agonizingRemorse(ctx, es) {
    const opp = ctx.s.players[other(es.controller)];
    const hand = opp.hand.filter((id) => !def(ctx, id).types.includes('Land'));
    const options = [
      ...hand.map((id) => ({
        label: `${def(ctx, id).name} (hand)`,
        effects: [custom('exileById', { id })],
      })),
      ...opp.graveyard.map((id) => ({
        label: `${def(ctx, id).name} (graveyard)`,
        effects: [custom('exileById', { id })],
      })),
    ];
    return { title: 'Agonizing Remorse: exile a card', options };
  },

  /** Compulsive Research: discard two cards unless you discard a land card. */
  compulsiveDiscard(ctx, es) {
    const hand = ctx.s.players[es.controller].hand;
    if (hand.length === 0) return null;
    const lands = hand.filter((id) => def(ctx, id).types.includes('Land'));
    const options = [
      ...[...new Set(lands.map((id) => def(ctx, id).name))].map((name) => ({
        label: `Discard ${name}`,
        effects: [custom('discardById', { id: lands.find((id) => def(ctx, id).name === name)! })],
      })),
      {
        label: 'Discard two cards',
        effects: [{ kind: 'discard', count: 2, who: 'controller' } as EffectDef],
      },
    ];
    return { title: 'Compulsive Research: discard a land or two cards', options };
  },

  /** Gods Willing: choose a colour for the target creature's protection. */
  protectionColor() {
    return {
      title: 'Choose a colour for protection',
      options: COLORS.map((color) => ({
        label: { W: 'White', U: 'Blue', B: 'Black', R: 'Red', G: 'Green' }[color],
        effects: [custom('protectFromColor', { color })],
      })),
    };
  },

  /** Ad Nauseam: reveal the top card, put it into your hand and lose life equal to its mana value; then you may repeat. */
  adNauseam(ctx, es) {
    const top = ctx.s.players[es.controller].library[0];
    if (top === undefined) return null;
    emit(ctx, { type: 'revealed', player: es.controller, id: top });
    const mv = manaValue(def(ctx, top).manaCost);
    moveObject(ctx, top, 'hand');
    changeLife(ctx, es.controller, -mv);
    if (ctx.s.players[es.controller].life <= 0) return null;
    return {
      title: `Ad Nauseam: you have ${ctx.s.players[es.controller].life} life. Repeat?`,
      options: [
        { label: 'Reveal another card', effects: [{ kind: 'chooseCustom', handler: 'adNauseam' }] },
        { label: 'Stop', effects: [] },
      ],
    };
  },

  /** Divine Gambit: the exiled permanent's controller may put a permanent card from their hand onto the battlefield. */
  divineGambit(ctx, es) {
    // The permanent has been exiled by now (its zone change count moved on): find it by id.
    const t = es.targets[0];
    const exiled = t && 'object' in t ? ctx.s.objects[t.object.id] : undefined;
    if (!exiled) return null;
    const player = exiled.controller;
    const hand = ctx.s.players[player].hand.filter((id) => {
      const t = def(ctx, id).types;
      return !t.includes('Instant') && !t.includes('Sorcery');
    });
    if (hand.length === 0) return null;
    return {
      player,
      title: 'Divine Gambit: put a permanent card onto the battlefield?',
      options: [
        ...hand.map((id) => ({
          label: def(ctx, id).name,
          effects: [custom('putPermanentFromHand', { id })],
        })),
        { label: "Don't put a card onto the battlefield", effects: [] },
      ],
    };
  },
};
Object.assign(CHOOSERS, ARCHIVE_16_CHOOSERS);
