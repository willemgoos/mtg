import { characteristics } from './characteristics.ts';
import {
  type Ctx,
  type CustomEffect,
  addCounters,
  createObject,
  def,
  defOf,
  drawCard,
  emit,
  moveObject,
  obj,
  other,
  transform,
} from './context.ts';
import { manaValue } from './cost.ts';
import { changeLife, dealDamage, damageSourceFor } from './effects.ts';
import { nextInt } from './rng.ts';
import { addLore } from './sagas.ts';
import { shuffleLibrary } from './setup.ts';
import type { GameObject, ObjectId, PlayerId } from './types.ts';

/**
 * Final Fantasy Commander (12): one-offs of the FIC Brawl decks, as custom
 * effects and conditions. They run without asking: where the card offers a
 * choice, the engine makes it (noted on each, and in docs/final-fantasy-plan.md).
 */

const mv = (ctx: Ctx, id: ObjectId) => manaValue(def(ctx, id).manaCost);
const isLand = (ctx: Ctx, id: ObjectId) => def(ctx, id).types.includes('Land');
const landsOf = (ctx: Ctx, p: PlayerId) =>
  ctx.s.battlefield.filter((id) => obj(ctx, id).controller === p && isLand(ctx, id)).length;

/**
 * The cards the engine discards for "discard up to N" rummaging: spare lands
 * once you have five or more, then cards you can't cast for a long while.
 */
export function rummagePicks(ctx: Ctx, p: PlayerId, max: number): ObjectId[] {
  const hand = ctx.s.players[p].hand;
  const lands = landsOf(ctx, p);
  const spareLands = hand.filter((id) => isLand(ctx, id)).slice(lands >= 5 ? 0 : 1);
  const picks = lands >= 4 ? spareLands : [];
  for (const id of hand)
    if (!isLand(ctx, id) && mv(ctx, id) > lands + 3 && !picks.includes(id)) picks.push(id);
  return picks.slice(0, max);
}

const discard = (ctx: Ctx, ids: readonly ObjectId[]) => {
  for (const id of ids) moveObject(ctx, id, 'graveyard');
};

const sourceObj = (ctx: Ctx, es: Parameters<CustomEffect>[1]): GameObject | undefined => {
  const o = es.source && ctx.s.objects[es.source.id];
  return o && o.zcc === es.source!.zcc ? o : undefined;
};

const targetObj = (ctx: Ctx, es: Parameters<CustomEffect>[1], i = 0): GameObject | undefined => {
  const t = es.targets[i];
  if (!t || !('object' in t)) return undefined;
  const o = ctx.s.objects[t.object.id];
  return o && o.zcc === t.object.zcc ? o : undefined;
};

/** Puts a token copy of a card onto the battlefield under `p`'s control. */
function tokenCopyOfCard(ctx: Ctx, defId: string, p: PlayerId): GameObject {
  const t = createObject(ctx, defId, p, 'battlefield', true);
  ctx.s.battlefield.push(t.id);
  emit(ctx, { type: 'objectMoved', id: t.id, defId, from: null, to: 'battlefield' });
  return t;
}

export const FIC_EFFECTS: Record<string, CustomEffect> = {
  /** Celes: "discard any number of cards, then draw that many cards plus one" (the engine picks). */
  celesRummage(ctx, es) {
    const picks = rummagePicks(ctx, es.controller, 7);
    discard(ctx, picks);
    for (let i = 0; i <= picks.length; i++) drawCard(ctx, es.controller);
  },

  /** Joshua: "discard up to N cards, then draw that many cards" (the engine picks). */
  rummageUpTo(ctx, es, params) {
    const picks = rummagePicks(ctx, es.controller, (params as { max: number }).max);
    discard(ctx, picks);
    for (let i = 0; i < picks.length; i++) drawCard(ctx, es.controller);
  },

  /** Combustible Gearhulk: mill three, then damage to the opponent equal to their total mana value. */
  gearhulkMill(ctx, es) {
    const lib = ctx.s.players[es.controller].library.slice(0, 3);
    let total = 0;
    for (const id of lib) {
      total += mv(ctx, id);
      moveObject(ctx, id, 'graveyard');
    }
    if (es.source)
      dealDamage(
        ctx,
        damageSourceFor(ctx, es.source.id, es.controller),
        { player: other(es.controller) },
        total,
        false,
      );
  },

  /** Legions to Ashes: exile the target and all tokens its controller controls with the same name. */
  legionsToAshes(ctx, es) {
    const o = targetObj(ctx, es);
    if (!o || o.zone !== 'battlefield') return;
    const { name } = def(ctx, o.id);
    const who = o.controller;
    const same = ctx.s.battlefield.filter((id) => {
      const x = obj(ctx, id);
      return id !== o.id && x.isToken && x.controller === who && def(ctx, id).name === name;
    });
    moveObject(ctx, o.id, 'exile');
    for (const id of same) moveObject(ctx, id, 'exile');
  },

  /** Reanimate: lose life equal to the mana value of the card just returned. */
  loseLifeChosenManaValue(ctx, es) {
    const o = es.chosen && ctx.s.objects[es.chosen.id];
    if (o) changeLife(ctx, es.controller, -mv(ctx, o.id));
  },

  /** Ardyn's Starscourge: exile the target creature card; a token copy that's a 5/5 Demon. */
  ardynStarscourge(ctx, es) {
    const card = targetObj(ctx, es);
    if (!card || card.zone !== 'graveyard') return;
    moveObject(ctx, card.id, 'exile');
    const t = tokenCopyOfCard(ctx, card.defId, es.controller);
    // "Except it's a 5/5 black Demon": it keeps its colours (a simplification).
    t.copyPT = { power: 5, toughness: 5 };
    t.addedSubtypes = ['Demon'];
  },

  /**
   * Random Encounter: shuffle, mill four, the creature cards milled enter with
   * haste and return to their owner's hand at the next end step.
   */
  randomEncounter(ctx, es) {
    const p = es.controller;
    shuffleLibrary(ctx, p);
    const milled = ctx.s.players[p].library.slice(0, 4);
    for (const id of milled) moveObject(ctx, id, 'graveyard');
    const step = ctx.s.turn.step;
    for (const id of milled) {
      if (!def(ctx, id).types.includes('Creature') || obj(ctx, id).zone !== 'graveyard') continue;
      moveObject(ctx, id, 'battlefield', { controller: p });
      const o = obj(ctx, id);
      o.grantedKeywords = [...(o.grantedKeywords ?? []), 'haste'];
      (ctx.s.delayed ??= []).push({
        controller: p,
        sourceDefId: es.sourceDefId,
        subject: { id: o.id, zcc: o.zcc },
        effects: [{ kind: 'bounce', what: 'subject' }],
        fromTurn: ctx.s.turn.number + (step === 'end' || step === 'cleanup' ? 1 : 0),
      });
    }
  },

  /** Garland: "return this card from your graveyard to the battlefield transformed". */
  returnTransformed(ctx, es) {
    const o = sourceObj(ctx, es);
    if (!o || o.zone !== 'graveyard') return;
    moveObject(ctx, o.id, 'battlefield', { controller: es.controller });
    transform(ctx, o.id);
    if (def(ctx, o.id).saga) addLore(ctx, o.id);
  },

  /** Joshua: "exile it, then return it to the battlefield transformed under its owner's control". */
  blinkTransformed(ctx, es) {
    const o = sourceObj(ctx, es);
    if (!o || o.zone !== 'battlefield') return;
    moveObject(ctx, o.id, 'exile');
    // A token ceases to exist in exile.
    if (!ctx.s.objects[o.id]) return;
    moveObject(ctx, o.id, 'battlefield');
    transform(ctx, o.id);
    // A Saga back face gets its first lore counter as it enters.
    if (def(ctx, o.id).saga) addLore(ctx, o.id);
  },

  /**
   * Phoenix, Warden of Fire III: creature cards with total mana value 6 or less
   * from your graveyard (the engine picks, biggest first), then the Saga
   * returns front face up.
   */
  phoenixRebirth(ctx, es) {
    const p = es.controller;
    let budget = 6;
    const cards = ctx.s.players[p].graveyard
      .filter((id) => def(ctx, id).types.includes('Creature'))
      .sort((a, b) => mv(ctx, b) - mv(ctx, a));
    for (const id of cards)
      if (mv(ctx, id) <= budget) {
        budget -= mv(ctx, id);
        moveObject(ctx, id, 'battlefield', { controller: p });
      }
    const o = sourceObj(ctx, es);
    if (!o || o.zone !== 'battlefield') return;
    moveObject(ctx, o.id, 'exile');
    // A token ceases to exist in exile.
    if (!ctx.s.objects[o.id]) return;
    moveObject(ctx, o.id, 'battlefield');
  },

  /** Chaos, the Endless: "put it on the bottom of its owner's library". */
  sourceToLibraryBottom(ctx, es) {
    const o = es.source && ctx.s.objects[es.source.id];
    if (o && o.zone === 'graveyard') moveObject(ctx, o.id, 'library', { position: 'bottom' });
  },

  /** "It gains haste" for the creature spell that caused the trigger (Summon: Brynhildr). */
  subjectHasteOnEntry(ctx, es) {
    const o = es.subject && ctx.s.objects[es.subject.id];
    if (o && o.zone === 'stack') o.hasteOnEntry = true;
  },

  /** "That player loses the game" (Summon: Primal Odin). */
  opponentLosesGame(ctx, es) {
    ctx.s.players[other(es.controller)].life = 0;
  },

  /** Nesting Grounds: move a counter from the first target onto the second (+1/+1 first). */
  moveCounter(ctx, es) {
    const from = targetObj(ctx, es, 0);
    const to = targetObj(ctx, es, 1);
    if (!from || !to || from.zone !== 'battlefield' || to.zone !== 'battlefield') return;
    if (from.plusOneCounters > 0) {
      from.plusOneCounters--;
      addCounters(ctx, to.id, 1);
      return;
    }
    const name = Object.keys(from.counters ?? {}).find((k) => (from.counters![k] ?? 0) > 0);
    if (!name) return;
    from.counters![name]!--;
    addCounters(ctx, to.id, 1, name);
  },

  // ---------------------------------------------------------------- 12b: Equipment
  /**
   * Job select (built minimally here; phase 11a builds it too): create a 1/1
   * colourless Hero creature token, then attach this Equipment to it.
   */
  jobSelect(ctx, es) {
    const hero = tokenCopyOfCard(ctx, 'hero-1-1-token', es.controller);
    const self = sourceObj(ctx, es);
    if (self && self.zone === 'battlefield') self.attachedTo = hero.id;
  },

  /** "You may play an additional land this turn." */
  extraLandThisTurn(ctx, es) {
    const x = (ctx.s.turn.extraLands ??= { p1: 0, p2: 0 });
    x[es.controller]++;
  },

  /** Aerith Gainsborough dies: X +1/+1 counters on each legendary creature you control (X: her counters). */
  countersOnLegendsBySourceCounters(ctx, es) {
    const self = es.source && ctx.s.objects[es.source.id];
    const x = self?.lastCounters ?? 0;
    if (x <= 0) return;
    for (const id of ctx.s.battlefield) {
      const o = obj(ctx, id);
      if (o.controller !== es.controller) continue;
      const c = characteristics(ctx, id);
      if (c.types.includes('Creature') && def(ctx, id).supertypes.includes('Legendary'))
        addCounters(ctx, id, x);
    }
  },

  /** Beatrix: attach Equipment you control to the target creature (the engine attaches every unattached one). */
  attachEquipmentToTarget(ctx, es) {
    const to = targetObj(ctx, es);
    if (!to || to.zone !== 'battlefield') return;
    for (const id of ctx.s.battlefield) {
      const e = obj(ctx, id);
      if (e.controller !== es.controller || !def(ctx, id).subtypes.includes('Equipment')) continue;
      const host = e.attachedTo !== undefined ? ctx.s.objects[e.attachedTo] : undefined;
      if (!host || host.zone !== 'battlefield') e.attachedTo = to.id;
    }
  },

  /**
   * Gilgamesh: every Equipment card among the top six onto the battlefield, the
   * rest to the bottom at random; the biggest one is attached to Gilgamesh (or
   * another Samurai you control).
   */
  gilgamesh(ctx, es) {
    const p = es.controller;
    const top = ctx.s.players[p].library.slice(0, 6);
    const equipment = top.filter((id) => def(ctx, id).subtypes.includes('Equipment'));
    for (const id of equipment) moveObject(ctx, id, 'battlefield', { controller: p });
    for (const id of top.filter((x) => !equipment.includes(x)))
      moveObject(ctx, id, 'library', { position: 'bottom' });
    const self = sourceObj(ctx, es);
    const samurai =
      self && self.zone === 'battlefield'
        ? self.id
        : ctx.s.battlefield.find(
            (id) =>
              obj(ctx, id).controller === p &&
              characteristics(ctx, id).subtypes.includes('Samurai'),
          );
    const best = equipment
      .filter((id) => obj(ctx, id).zone === 'battlefield')
      .sort((a, b) => mv(ctx, b) - mv(ctx, a))[0];
    if (best && samurai) obj(ctx, best).attachedTo = samurai;
  },

  /**
   * Firion: a token copy of the Equipment that entered whose equip abilities
   * cost {2} less; it's sacrificed at the beginning of the next upkeep.
   */
  firionCopy(ctx, es) {
    const card = es.subject && ctx.s.objects[es.subject.id];
    if (!card || card.zone !== 'battlefield') return;
    const t = tokenCopyOfCard(ctx, card.defId, es.controller);
    t.equipDiscount = 2;
    (ctx.s.delayed ??= []).push({
      controller: es.controller,
      sourceDefId: es.sourceDefId,
      subject: { id: t.id, zcc: t.zcc },
      effects: [{ kind: 'sacrifice', what: 'subject' }],
      fromTurn: ctx.s.turn.number + 1,
      at: 'upkeep',
    });
  },

  /**
   * Arms Scavenger (Alchemy): "draft a card from this creature's spellbook, then
   * exile it; you may play it this turn". The spellbook here: the Equipment in
   * `params.book`, one at random.
   */
  draftToExile(ctx, es, params) {
    const book = (params as { book: string[] }).book.filter((id) => ctx.db.has(id));
    if (book.length === 0) return;
    const pick = book[nextInt(ctx.s.rng, book.length)]!;
    const card = createObject(ctx, pick, es.controller, 'exile');
    ctx.s.players[es.controller].exile.push(card.id);
    card.playableUntilTurn = ctx.s.turn.number;
  },

  /**
   * Zack Fair: the target gains indestructible, gets Zack's +1/+1 counters, and
   * an unattached Equipment you control is attached to it (Zack's own falls off
   * as he's sacrificed).
   */
  zackFair(ctx, es) {
    const to = targetObj(ctx, es);
    const self = es.source && ctx.s.objects[es.source.id];
    if (!to || to.zone !== 'battlefield') return;
    if (self?.lastCounters) addCounters(ctx, to.id, self.lastCounters);
    const loose = ctx.s.battlefield.find((id) => {
      const e = obj(ctx, id);
      const host = e.attachedTo !== undefined ? ctx.s.objects[e.attachedTo] : undefined;
      return (
        e.controller === es.controller &&
        def(ctx, id).subtypes.includes('Equipment') &&
        (!host || host.zone !== 'battlefield')
      );
    });
    if (loose) obj(ctx, loose).attachedTo = to.id;
  },

  /** Fighter Class: the target blocks the attacking creature that caused the trigger this combat if able. */
  mustBlockSubject(ctx, es) {
    const blocker = targetObj(ctx, es);
    const attacker = es.subject && ctx.s.objects[es.subject.id];
    if (blocker && attacker) blocker.mustBlock = { id: attacker.id, zcc: attacker.zcc };
  },

  // ---------------------------------------------------------------- 12c: counters
  /**
   * Proliferate: each permanent you control with counters gets one more of
   * each kind, and so does each opponent's permanent with a stun counter (the
   * engine's choice: the helpful ones only).
   */
  proliferate(ctx, es) {
    for (const id of [...ctx.s.battlefield]) {
      const o = obj(ctx, id);
      const mine = o.controller === es.controller;
      if (mine && o.plusOneCounters > 0) addCounters(ctx, id, 1);
      for (const [k, v] of Object.entries(o.counters ?? {})) {
        if (v <= 0) continue;
        const helpful = k !== 'stun' && k !== 'finality';
        if (mine === helpful) addCounters(ctx, id, 1, k);
      }
    }
  },

  /** Saddle: this Mount is saddled until end of turn. */
  saddle(ctx, es) {
    const o = sourceObj(ctx, es);
    if (o && o.zone === 'battlefield') o.saddledTurn = ctx.s.turn.number;
  },

  /**
   * Hideaway N: look at the top N, exile one face down (the engine picks the
   * most expensive nonland card), the rest to the bottom in a random order.
   */
  hideaway(ctx, es, params) {
    const p = es.controller;
    const top = ctx.s.players[p].library.slice(0, (params as { count: number }).count);
    const pick = [...top].sort(
      (a, b) => Number(isLand(ctx, a)) - Number(isLand(ctx, b)) || mv(ctx, b) - mv(ctx, a),
    )[0];
    const self = sourceObj(ctx, es);
    if (pick) {
      moveObject(ctx, pick, 'exile');
      if (self) self.exiledWith = [...(self.exiledWith ?? []), pick];
    }
    for (const id of top) if (id !== pick) moveObject(ctx, id, 'library', { position: 'bottom' });
  },

  /** Bahamut, Shiva, Phoenix: "Exile this Saga, then return it to the battlefield (front face up)." */
  blinkFront(ctx, es) {
    const o = sourceObj(ctx, es);
    if (!o || o.zone !== 'battlefield') return;
    moveObject(ctx, o.id, 'exile');
    // A token ceases to exist in exile.
    if (!ctx.s.objects[o.id]) return;
    moveObject(ctx, o.id, 'battlefield');
  },

  /** Clash of the Eikons: put a lore counter on the target Saga (its chapter triggers). */
  addLoreToTarget(ctx, es) {
    const o = targetObj(ctx, es, (es as { loreTarget?: number }).loreTarget ?? 0);
    if (o && o.zone === 'battlefield') addLore(ctx, o.id);
  },

  /** Clash of the Eikons: remove a lore counter from the target Saga (no chapter triggers). */
  removeLoreFromTarget(ctx, es) {
    const o = targetObj(ctx, es);
    if (o?.counters?.lore) o.counters.lore--;
  },

  /**
   * Garnet: remove a lore counter from each Saga you control that has one (the
   * engine always does: it delays their sacrifice), +1/+1 counters on Garnet for each.
   */
  garnet(ctx, es) {
    let n = 0;
    for (const id of ctx.s.battlefield) {
      const o = obj(ctx, id);
      if (o.controller !== es.controller || !def(ctx, id).saga || !o.counters?.lore) continue;
      o.counters.lore--;
      n++;
    }
    const self = sourceObj(ctx, es);
    if (self && self.zone === 'battlefield' && n) addCounters(ctx, self.id, n);
  },

  /**
   * The creature spell that caused the trigger enters with additional +1/+1
   * counters: `params.n`, or one per Dog and/or Wolf you control (Torgal).
   */
  subjectBonusCounters(ctx, es, params) {
    const o = es.subject && ctx.s.objects[es.subject.id];
    if (!o || o.zone !== 'stack') return;
    const p = params as { n?: number; dogsAndWolves?: boolean };
    const n = p.dogsAndWolves
      ? ctx.s.battlefield.filter((id) => {
          const x = obj(ctx, id);
          const st = characteristics(ctx, id).subtypes;
          return x.controller === es.controller && (st.includes('Dog') || st.includes('Wolf'));
        }).length
      : (p.n ?? 1);
    o.bonusCounters = (o.bonusCounters ?? 0) + n;
  },

  /** Chasm Skulker: X tokens, X = the +1/+1 counters it had as it died. */
  tokensBySourceCounters(ctx, es, params) {
    const self = es.source && ctx.s.objects[es.source.id];
    const x = self?.lastCounters ?? 0;
    for (let i = 0; i < x; i++)
      tokenCopyOfCard(ctx, (params as { token: string }).token, es.controller);
  },

  /** "Remove N +1/+1 counters from this creature" (as the ability resolves: District Mascot). */
  removeSelfCounters(ctx, es, params) {
    const o = sourceObj(ctx, es);
    if (o) o.plusOneCounters = Math.max(0, o.plusOneCounters - (params as { n: number }).n);
  },

  /** Summon: Leviathan I: return each creature that isn't a Kraken, Leviathan, Merfolk, Octopus or Serpent. */
  leviathanWave(ctx) {
    const keep = ['Kraken', 'Leviathan', 'Merfolk', 'Octopus', 'Serpent'];
    for (const id of [...ctx.s.battlefield]) {
      const c = characteristics(ctx, id);
      if (c.types.includes('Creature') && !c.subtypes.some((t) => keep.includes(t)))
        moveObject(ctx, id, 'hand');
    }
  },

  /** Esper Origins cast from a graveyard: it comes back transformed after resolving. */
  markReturnTransformed(ctx, es) {
    const o = es.source && ctx.s.objects[es.source.id];
    if (o && o.zone === 'stack') o.returnTransformed = true;
  },

  /** Summon: Esper Maduin I: reveal the top card; a permanent card goes to your hand. */
  revealTopPermanentToHand(ctx, es) {
    const top = ctx.s.players[es.controller].library[0];
    if (!top) return;
    const d = def(ctx, top);
    if (!d.types.includes('Instant') && !d.types.includes('Sorcery')) moveObject(ctx, top, 'hand');
  },

  /** Yuna: +1/+1 counters on the target equal to the counters the permanent that died had. */
  countersBySubjectLastCounters(ctx, es) {
    const subj = es.subject && ctx.s.objects[es.subject.id];
    const t = targetObj(ctx, es);
    if (!t || t.zone !== 'battlefield') return;
    const n =
      (subj?.lastCounters ?? 0) +
      Object.values(subj?.lastNamedCounters ?? {}).reduce((a, b) => a + b, 0);
    addCounters(ctx, t.id, n);
  },

  // ---------------------------------------------------------------- 12d: spellcraft
  /**
   * Look at the top N; put `take` into your hand (the engine picks: a land if
   * you have fewer than five, then the most expensive), the rest on the bottom.
   */
  lookTakeRestBottom(ctx, es, params) {
    const p = es.controller;
    const { count, take } = params as { count: number; take: number };
    const top = ctx.s.players[p].library.slice(0, count);
    const needLand = landsOf(ctx, p) < 5;
    const ranked = [...top].sort(
      (a, b) =>
        (needLand ? Number(isLand(ctx, b)) - Number(isLand(ctx, a)) : 0) ||
        Number(isLand(ctx, a)) - Number(isLand(ctx, b)) ||
        mv(ctx, b) - mv(ctx, a),
    );
    const land = needLand ? ranked.find((id) => isLand(ctx, id)) : undefined;
    const picks = land ? [land, ...ranked.filter((id) => id !== land)] : ranked;
    const taken = picks.slice(0, take);
    for (const id of taken) moveObject(ctx, id, 'hand');
    for (const id of top)
      if (!taken.includes(id)) moveObject(ctx, id, 'library', { position: 'bottom' });
  },

  /** G'raha Tia, Scion Reborn: pay X life (X: the spell's mana value) for a 1/1 Hero with X +1/+1 counters. */
  grahaHero(ctx, es) {
    const spell = es.subject && ctx.s.objects[es.subject.id];
    const x = spell ? mv(ctx, spell.id) : 0;
    if (ctx.s.players[es.controller].life <= x) return;
    changeLife(ctx, es.controller, -x);
    const hero = tokenCopyOfCard(ctx, 'hero-1-1-token', es.controller);
    addCounters(ctx, hero.id, x);
  },

  /** Ninja's Blades: draw, then discard (the engine discards the most expensive); that player loses its mana value. */
  ninjaLoot(ctx, es) {
    const p = es.controller;
    drawCard(ctx, p);
    const hand = ctx.s.players[p].hand;
    const pick = [...hand].sort((a, b) => mv(ctx, b) - mv(ctx, a))[0];
    if (!pick) return;
    const loss = mv(ctx, pick);
    moveObject(ctx, pick, 'graveyard');
    changeLife(ctx, other(p), -loss);
  },

  /**
   * Quistis Trepe: the target instant or sorcery card may be cast this turn
   * with mana of any type (from a graveyard, put in exile to cast it).
   */
  quistis(ctx, es) {
    const card = targetObj(ctx, es);
    if (!card || card.zone !== 'graveyard') return;
    moveObject(ctx, card.id, 'exile');
    card.anyMana = true;
    if (card.owner === es.controller) card.playableUntilTurn = ctx.s.turn.number;
    else card.castableBy = es.controller;
  },

  /** Ice Magic's Blizzaga: the target creature's owner shuffles it into their library. */
  shuffleIntoLibrary(ctx, es) {
    const o = targetObj(ctx, es);
    if (!o || o.zone !== 'battlefield') return;
    moveObject(ctx, o.id, 'library');
    shuffleLibrary(ctx, o.owner);
  },

  /** Exile N cards from your graveyard (the oldest first): Ultimecia's cost. */
  exileFromGraveyard(ctx, es, params) {
    const gy = ctx.s.players[es.controller].graveyard;
    for (const id of gy.slice(0, (params as { n: number }).n)) moveObject(ctx, id, 'exile');
  },

  /**
   * Memories Returning: of the top five, three go to your hand and two to the
   * bottom (the opponent's picks: the engine sends the most expensive two down).
   */
  memoriesReturning(ctx, es) {
    const p = es.controller;
    const top = ctx.s.players[p].library.slice(0, 5);
    const ranked = [...top].sort((a, b) => mv(ctx, b) - mv(ctx, a));
    const bottom = ranked.slice(0, Math.max(0, top.length - 3));
    for (const id of top)
      moveObject(
        ctx,
        id,
        bottom.includes(id) ? 'library' : 'hand',
        bottom.includes(id) ? { position: 'bottom' } : {},
      );
  },

  // ---------------------------------------------------------------- 12e
  /**
   * Sidequest: Catch a Fish: an artifact or creature card on top goes to your
   * hand (the engine always takes it); then a Food, and it transforms.
   */
  catchAFish(ctx, es) {
    const top = ctx.s.players[es.controller].library[0];
    if (!top) return;
    const d = def(ctx, top);
    if (!d.types.includes('Artifact') && !d.types.includes('Creature')) return;
    moveObject(ctx, top, 'hand');
    tokenCopyOfCard(ctx, 'food-token', es.controller);
    const self = sourceObj(ctx, es);
    if (self && self.zone === 'battlefield') transform(ctx, self.id);
  },

  /** Put +1/+1 counters on the source equal to the power of what caused the trigger, as it last was. */
  countersBySubjectPower(ctx, es) {
    const self = sourceObj(ctx, es);
    const subj = es.subject && ctx.s.objects[es.subject.id];
    if (!self || self.zone !== 'battlefield' || !subj) return;
    const power =
      subj.zone === 'battlefield' ? characteristics(ctx, subj.id).power : subj.lastPower;
    addCounters(ctx, self.id, Math.max(0, power ?? defOf(ctx, subj.defId).power ?? 0));
  },
};

export const FIC_CONDITIONS: Record<
  string,
  (ctx: Ctx, controller: PlayerId, self: GameObject | undefined, subject?: GameObject) => boolean
> = {
  /** Starting Town: "your first, second, or third turn of the game". */
  firstThreeTurns: (ctx) => ctx.s.turn.number <= 6,
  /** You were the starting player (turn 1 was yours: your turns are the odd ones). */
  startingPlayer: (ctx, p) => (ctx.s.turn.number % 2 === 1) === (ctx.s.turn.activePlayer === p),
  /** "If it's the first combat phase of the turn" (Genji Glove, Tifa). */
  firstCombat: (ctx) => !ctx.s.turn.laterCombat,
  /** You gained 7 or more life this turn (Aerith, Last Ancient). */
  gainedSeven: (ctx, p) => (ctx.s.turn.lifeGainedTotal?.[p] ?? 0) >= 7,
  /** You haven't cast a legendary creature spell this turn (Serah Farron). */
  noLegendCastThisTurn: (ctx, p) =>
    !(ctx.s.turn.castDefs?.[p] ?? []).some((id) => {
      const d = defOf(ctx, id);
      return d.types.includes('Creature') && d.supertypes.includes('Legendary');
    }),
  /** +1/+1 counters were put on the source this turn (Wakka). */
  sourceCountersThisTurn: (ctx, _p, self) => self?.countersTurn === ctx.s.turn.number,
  /** An opponent has seven or more cards in their graveyard (Into the Story). */
  opponentGraveyardSeven: (ctx, p) => ctx.s.players[other(p)].graveyard.length >= 7,
  /** A player lost 4 or more life this turn (Y'shtola). */
  someoneLostFour: (ctx) => Object.values(ctx.s.turn.lifeLostTotal ?? {}).some((n) => n >= 4),
  /** What caused the trigger is an opponent's (Authority of the Consuls). */
  subjectIsOpponents: (_ctx, p, _self, subject) => !!subject && subject.controller !== p,
  /** The source attacked this turn (The Lunar Whale). */
  sourceAttackedThisTurn: (ctx, _p, self) => !!self && ctx.s.turn.attackers.includes(self.id),
  /** This Mount is saddled. */
  saddled: (ctx, _p, self) => self?.saddledTurn === ctx.s.turn.number,
  /** You control the creature with the greatest power, or tied (Summon: Fenrir III). */
  greatestPower: (ctx, p) => {
    let mine = -99;
    let theirs = -99;
    for (const id of ctx.s.battlefield) {
      const c = characteristics(ctx, id);
      if (!c.types.includes('Creature')) continue;
      if (obj(ctx, id).controller === p) mine = Math.max(mine, c.power);
      else theirs = Math.max(theirs, c.power);
    }
    return mine > -99 && mine >= theirs;
  },
  /** The first time +1/+1 counters were put on what caused the trigger this turn (Botanical Brawler). */
  subjectFirstCounters: (ctx, _p, _self, subject) =>
    subject?.countersTurn === ctx.s.turn.number && subject.countersTimes === 1,
  /** What caused the trigger is the source itself (Generous Pup: "on this creature"). */
  subjectIsSelf: (_ctx, _p, self, subject) => !!self && subject?.id === self.id,
  /** It had no flying counter as it died (Luminous Broodmoth's returns don't loop). */
  subjectHadNoFlyingCounter: (_ctx, _p, _self, subject) => !subject?.lastNamedCounters?.flying,
  /** It had counters as it left the battlefield (Yuna). */
  subjectHadCounters: (_ctx, _p, _self, subject) =>
    !!subject &&
    ((subject.lastCounters ?? 0) > 0 ||
      Object.values(subject.lastNamedCounters ?? {}).some((n) => n > 0)),
  /** A Saga creature's later chapters (Summon: Primal Odin II). */
  loreTwo: (_ctx, _p, self) => (self?.counters?.lore ?? 0) >= 2,
  /**
   * Blitzball: "an opponent was dealt combat damage by a legendary creature
   * this turn" — read as: a legendary creature of yours attacked this turn and
   * the opponent lost life (a simplification).
   */
  legendHitOpponent: (ctx, p) =>
    (ctx.s.turn.lifeLost?.[other(p)] ?? 0) > 0 &&
    ctx.s.turn.attackers.some((id) => {
      const o = ctx.s.objects[id];
      return !!o && o.controller === p && defOf(ctx, o.defId).supertypes.includes('Legendary');
    }),
};
