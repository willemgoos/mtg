import { hasKeyword, hasSubtype, isCreature, power } from './characteristics.ts';
import {
  addCounters,
  createObject,
  type Ctx,
  type CustomEffect,
  def,
  defOf,
  drawCard,
  emit,
  moveObject,
  newId,
  obj,
  onBattlefield,
  other,
} from './context.ts';
import { manaValue } from './cost.ts';
import {
  changeLife,
  damageSourceFor,
  dealDamage,
  gainLife,
  millCount,
  plusFoodTokens,
  replacedToken,
} from './effects.ts';
import { nextInt, shuffleInPlace } from './rng.ts';
import type { GameObject, PlayerId } from './types.ts';

/**
 * Final Fantasy (FIN) one-offs, as custom effects. They run without asking:
 * where the card offers a choice, the engine makes it (noted on each).
 */

const PERMANENT_TYPES = ['Artifact', 'Creature', 'Enchantment', 'Land', 'Planeswalker', 'Battle'];

/** Creates a token on the battlefield (no replacement effects apply but Tippy-Toe's Food). */
function makeToken(ctx: Ctx, token: string, controller: PlayerId): void {
  // Reality Fracture (17a): Draconic Visitor turns an artifact token into a Dragon.
  const t = createObject(
    ctx,
    replacedToken(ctx, controller, token),
    controller,
    'battlefield',
    true,
  );
  ctx.s.battlefield.push(t.id);
  emit(ctx, { type: 'objectMoved', id: t.id, defId: t.defId, from: null, to: 'battlefield' });
  plusFoodTokens(ctx, controller);
}

export const FIN_EFFECTS: Record<string, CustomEffect> = {
  /** Summon: Alexander I, II: "Prevent all damage that would be dealt to creatures you control this turn." */
  shieldCreaturesThisTurn(ctx, es) {
    // A new array: game states share it when cloned.
    const list = ctx.s.turn.creaturesShielded ?? [];
    if (!list.includes(es.controller)) ctx.s.turn.creaturesShielded = [...list, es.controller];
  },

  /** Summon: Esper Maduin I: reveal the top card; a permanent card goes to your hand. */
  revealTopPermanentToHand(ctx, es) {
    const top = ctx.s.players[es.controller].library[0];
    if (!top) return;
    emit(ctx, { type: 'revealed', player: es.controller, id: top });
    if (def(ctx, top).types.some((t) => PERMANENT_TYPES.includes(t))) moveObject(ctx, top, 'hand');
  },

  /**
   * Esper Origins cast from a graveyard: "exile it, then put it onto the
   * battlefield transformed under its owner's control with a finality counter".
   */
  enterTransformedWithFinality(ctx, es) {
    const o = es.source && ctx.s.objects[es.source.id];
    if (!o || o.zone !== 'stack' || o.zcc !== es.source!.zcc) return;
    moveObject(ctx, o.id, 'exile');
    moveObject(ctx, o.id, 'battlefield', { controller: o.owner, transformed: true });
    addCounters(ctx, o.id, 1, 'finality');
  },

  /** Summon: Fenrir II: the creature spell that triggered this enters with an additional +1/+1 counter. */
  bonusCounterOnSubject(ctx, es) {
    const o = es.subject && ctx.s.objects[es.subject.id];
    if (o && o.zone === 'stack' && o.zcc === es.subject!.zcc)
      o.bonusCounters = (o.bonusCounters ?? 0) + 1;
  },

  /** Summon: Fenrir III: "Draw a card if you control the creature with the greatest power or tied for it." */
  drawIfGreatestPower(ctx, es) {
    let mine = -Infinity;
    let best = -Infinity;
    for (const id of ctx.s.battlefield) {
      if (!isCreature(ctx, id)) continue;
      const p = power(ctx, id);
      best = Math.max(best, p);
      if (obj(ctx, id).controller === es.controller) mine = Math.max(mine, p);
    }
    if (mine !== -Infinity && mine >= best) drawCard(ctx, es.controller);
  },

  /** The Gold Saucer: flip a coin; if you win the flip, create a Treasure token. */
  flipCoinForTreasure(ctx, es) {
    if (nextInt(ctx.s.rng, 2) === 0) makeToken(ctx, 'treasure-token', es.controller);
  },

  // Final Fantasy (11b)

  /** Chaos, the Endless: "When Chaos dies, put it on the bottom of its owner's library." */
  sourceToLibraryBottom(ctx, es) {
    const o = es.source && ctx.s.objects[es.source.id];
    if (o && o.zone === 'graveyard') moveObject(ctx, o.id, 'library', { position: 'bottom' });
  },

  /**
   * Ultimecia, Time Sorceress: "exile eight cards from your graveyard" (part of
   * a cost paid on resolution). The engine picks the oldest cards.
   */
  exileEightFromGraveyard(ctx, es) {
    for (const id of ctx.s.players[es.controller].graveyard.slice(0, 8))
      moveObject(ctx, id, 'exile');
  },

  /** Overture: "Target opponent mills half their library, rounded down." */
  millHalf(ctx, es) {
    const t = es.targets[0];
    const player = t && 'player' in t ? t.player : null;
    if (!player) return;
    const lib = ctx.s.players[player].library;
    for (const id of lib.slice(0, Math.floor(lib.length / 2))) moveObject(ctx, id, 'graveyard');
  },

  // 11c group 1

  /**
   * Ultima: "End the turn." Spells and abilities on the stack are exiled, combat
   * ends, and the turn goes on from its end step without one (abilities that
   * triggered meanwhile still happen there), then the cleanup step.
   */
  endTheTurn(ctx) {
    for (const item of ctx.s.stack)
      if (item.kind === 'spell' && ctx.s.objects[item.id]) moveObject(ctx, item.id, 'exile');
    ctx.s.stack = [];
    ctx.s.combat = null;
    ctx.s.turn.extraCombats = 0;
    ctx.s.turn.step = 'end';
  },

  /** Y'shtola Rhul: "there is an additional end step after this step". */
  extraEndStep(ctx) {
    ctx.s.turn.extraEndSteps = (ctx.s.turn.extraEndSteps ?? 0) + 1;
  },

  /** Summon: Primal Odin's Zantetsuken: "that player loses the game" (the opponent). */
  opponentLosesGame(ctx, es) {
    ctx.s.players[es.controller === 'p1' ? 'p2' : 'p1'].lost = true;
  },

  /** Zenos yae Galvus: remember the creature chosen (its first target) for "when the chosen creature leaves". */
  rememberTarget(ctx, es) {
    const self = es.source && ctx.s.objects[es.source.id];
    const t = es.targets[0];
    if (!self || self.zone !== 'battlefield' || !t || !('object' in t)) return;
    self.chosenObject = t.object;
  },

  /**
   * Gogo, Master of Mimicry: copy the target ability X times (the copies keep
   * its targets).
   */
  copyTargetAbility(ctx, es) {
    const t = es.targets[0];
    if (!t || !('object' in t)) return;
    const item = ctx.s.stack.find((x) => x.kind === 'ability' && x.id === t.object.id);
    if (!item) return;
    for (let i = 0; i < (es.x ?? 0); i++) ctx.s.stack.push({ ...item, id: newId(ctx) });
  },

  /**
   * Memories Returning: the opponent puts one of the top `count` cards on the
   * bottom of your library (the engine picks for them: the highest mana value).
   */
  opponentBottomsOne(ctx, es, params) {
    const lib = ctx.s.players[es.controller].library;
    const looked = lib.slice(0, (params as { count: number }).count);
    const worst = [...looked].sort(
      (a, b) => manaValue(def(ctx, b).manaCost) - manaValue(def(ctx, a).manaCost),
    )[0];
    if (worst) moveObject(ctx, worst, 'library', { position: 'bottom' });
  },

  /** Memories Returning: "Put the other into your hand." */
  topCardToHand(ctx, es) {
    const top = ctx.s.players[es.controller].library[0];
    if (top) moveObject(ctx, top, 'hand');
  },

  /** The Water Crystal: "Each opponent mills cards equal to the number of cards in your hand." */
  opponentMillsHandSize(ctx, es) {
    const opp = es.controller === 'p1' ? 'p2' : 'p1';
    const n = millCount(ctx, opp, ctx.s.players[es.controller].hand.length);
    for (const id of ctx.s.players[opp].library.slice(0, n)) moveObject(ctx, id, 'graveyard');
  },

  /** Ninja's Blades: "That player loses life equal to the discarded card's mana value." */
  loseLifeByDiscarded(ctx, es) {
    const gy = ctx.s.players[es.controller].graveyard;
    const card = gy[gy.length - 1];
    if (!card || ctx.s.objects[card]!.discardedTurn !== ctx.s.turn.number) return;
    changeLife(ctx, es.controller === 'p1' ? 'p2' : 'p1', -manaValue(def(ctx, card).manaCost));
  },

  // 11c group 2

  /**
   * Gilgamesh, Master-at-Arms: the Equipment among the top six onto the
   * battlefield (all of them), the rest on the bottom in a random order. Then
   * "when you do", a reflexive trigger attaches one to a Samurai; it goes on the
   * stack before the Equipment's job select triggers, so it resolves after them.
   */
  gilgameshEquipment(ctx, es) {
    const top = ctx.s.players[es.controller].library.slice(0, 6);
    const gear = top.filter((id) => def(ctx, id).subtypes.includes('Equipment'));
    const rest = top.filter((id) => !gear.includes(id));
    for (const id of gear) moveObject(ctx, id, 'battlefield', { controller: es.controller });
    const lib = ctx.s.players[es.controller].library;
    for (const id of rest) lib.splice(lib.indexOf(id), 1);
    shuffleInPlace(ctx.s.rng, rest);
    lib.push(...rest);
    const entered = gear.filter((id) => ctx.s.objects[id]?.zone === 'battlefield');
    if (entered.length === 0 || !es.source) return;
    ctx.s.pendingTriggers.push({
      source: es.source,
      sourceDefId: es.sourceDefId,
      abilityIndex: -1,
      controller: es.controller,
      inline: [
        {
          kind: 'custom',
          handler: 'gilgameshAttach',
          params: { gear: entered.map((id) => ({ id, zcc: obj(ctx, id).zcc })) },
        },
      ],
    });
  },

  /**
   * Gilgamesh's reflexive trigger: attach one of the Equipment to a Samurai you
   * control (Gilgamesh if he's there; the costliest Equipment first).
   */
  gilgameshAttach(ctx, es, params) {
    const gear = (params as { gear: { id: string; zcc: number }[] }).gear
      .map((r) => onBattlefield(ctx, r))
      .filter((o) => !!o && o.controller === es.controller)
      .sort((a, b) => manaValue(def(ctx, b!.id).manaCost) - manaValue(def(ctx, a!.id).manaCost));
    const pick = gear[0];
    if (!pick) return;
    const samurai = ctx.s.battlefield.filter(
      (id) =>
        obj(ctx, id).controller === es.controller &&
        isCreature(ctx, id) &&
        hasSubtype(ctx, id, 'Samurai'),
    );
    const host = samurai.find((id) => id === es.source?.id) ?? samurai[0];
    if (host) pick.attachedTo = host;
  },

  /**
   * Vaan, Street Thief: exile the top card of that player's library. You may
   * cast it (while it stays exiled); a land, which can't be cast, makes a Treasure.
   */
  vaanExile(ctx, es) {
    const them = other(es.controller);
    const top = ctx.s.players[them].library[0];
    if (!top) return;
    moveObject(ctx, top, 'exile');
    if (def(ctx, top).types.includes('Land')) makeToken(ctx, 'treasure-token', es.controller);
    else obj(ctx, top).castableBy = es.controller;
  },

  /**
   * Triple Triad: each player exiles the top card of their library. Until end
   * of turn you may play yours, and each other one with lesser mana value, free.
   */
  tripleTriad(ctx, es) {
    const mine = ctx.s.players[es.controller].library[0];
    const theirs = ctx.s.players[other(es.controller)].library[0];
    for (const id of [mine, theirs]) if (id) moveObject(ctx, id, 'exile');
    if (!mine) return;
    const mv = manaValue(def(ctx, mine).manaCost);
    const free = [mine, ...(theirs && manaValue(def(ctx, theirs).manaCost) < mv ? [theirs] : [])];
    for (const id of free) {
      obj(ctx, id).playFreeBy = es.controller;
      (ctx.s.delayed ??= []).push({
        controller: es.controller,
        sourceDefId: es.sourceDefId,
        subject: { id, zcc: obj(ctx, id).zcc },
        effects: [{ kind: 'custom', handler: 'endPlayFree' }],
        fromTurn: ctx.s.turn.number,
      });
    }
  },

  /** Triple Triad: the free play ends (at the end step). */
  endPlayFree(ctx, es) {
    const o = es.subject && ctx.s.objects[es.subject.id];
    if (o && o.zone === 'exile' && o.zcc === es.subject!.zcc) delete o.playFreeBy;
  },

  /** Summon: Brynhildr I: exile the top card of your library; you may play it this turn. */
  brynhildrExile(ctx, es) {
    const top = ctx.s.players[es.controller].library[0];
    if (!top) return;
    moveObject(ctx, top, 'exile');
    obj(ctx, top).playableUntilTurn = ctx.s.turn.number;
    const self = es.source && ctx.s.objects[es.source.id];
    if (self && self.zone === 'battlefield' && self.zcc === es.source!.zcc)
      self.exiledWith = [...(self.exiledWith ?? []), top];
  },

  /** Summon: Brynhildr II, III: a lore counter went on it, so the exiled card is playable this turn. */
  brynhildrReplay(ctx, es) {
    const self = es.source && ctx.s.objects[es.source.id];
    for (const id of self?.exiledWith ?? []) {
      const o = ctx.s.objects[id];
      if (o?.zone === 'exile') o.playableUntilTurn = ctx.s.turn.number;
    }
  },

  /** Summon: Brynhildr II, III: the creature spell that triggered this gains haste (as it enters). */
  hasteOnEntryForSubject(ctx, es) {
    const o = es.subject && ctx.s.objects[es.subject.id];
    if (o && o.zone === 'stack' && o.zcc === es.subject!.zcc) o.hasteOnEntry = true;
  },

  /** Bartz and Boko: each other Bird you control deals damage equal to its power to the target creature. */
  birdsDamageTarget(ctx, es) {
    const t = es.targets[0];
    if (!t || !('object' in t)) return;
    for (const id of [...ctx.s.battlefield]) {
      const o = obj(ctx, id);
      if (id === es.source?.id || o.controller !== es.controller) continue;
      if (!isCreature(ctx, id) || !hasSubtype(ctx, id, 'Bird')) continue;
      const target = onBattlefield(ctx, t.object);
      if (!target) return;
      dealDamage(ctx, damageSourceFor(ctx, id, es.controller), t, power(ctx, id), false);
    }
  },

  /** Ancient Adamantoise: "When this creature dies, exile it" (from the graveyard). */
  exileSourceFromGraveyard(ctx, es) {
    const o = es.source && ctx.s.objects[es.source.id];
    if (o && o.zone === 'graveyard') moveObject(ctx, o.id, 'exile');
  },

  /**
   * Kefka, Court Mage: each player discards a card (the engine picks the one
   * with the lowest mana value for each), then you draw a card for each card
   * type among them.
   */
  kefkaDiscard(ctx, es) {
    const types = new Set<string>();
    for (const p of [es.controller, other(es.controller)]) {
      const hand = ctx.s.players[p].hand;
      const card = [...hand].sort(
        (a, b) => manaValue(def(ctx, a).manaCost) - manaValue(def(ctx, b).manaCost),
      )[0];
      if (!card) continue;
      for (const t of def(ctx, card).types) types.add(t);
      moveObject(ctx, card, 'graveyard');
    }
    for (let i = 0; i < types.size; i++) drawCard(ctx, es.controller);
  },

  /**
   * Sin, Spira's Punishment: exile a permanent card from your graveyard at
   * random and create a tapped token copy of it; a land card repeats this.
   */
  sinExile(ctx, es) {
    for (;;) {
      const cards = ctx.s.players[es.controller].graveyard.filter((id) =>
        def(ctx, id).types.some((t) => PERMANENT_TYPES.includes(t)),
      );
      if (cards.length === 0) return;
      const card = cards[nextInt(ctx.s.rng, cards.length)]!;
      const defId = obj(ctx, card).defId;
      moveObject(ctx, card, 'exile');
      const t = createObject(ctx, defId, es.controller, 'battlefield', true);
      t.tapped = true;
      ctx.s.battlefield.push(t.id);
      emit(ctx, { type: 'objectMoved', id: t.id, defId, from: null, to: 'battlefield' });
      plusFoodTokens(ctx, es.controller); // Tippy-Toe
      if (!defOf(ctx, defId).types.includes('Land')) return;
    }
  },

  /** Hope Estheim: each opponent mills X, where X is the life you gained this turn. */
  millByLifeGained(ctx, es) {
    // Final Fantasy (11c): The Water Crystal adds to it.
    const n = millCount(ctx, other(es.controller), ctx.s.turn.lifeGained?.[es.controller] ?? 0);
    for (const id of ctx.s.players[other(es.controller)].library.slice(0, n))
      moveObject(ctx, id, 'graveyard');
  },

  /** Lightning's Stagger: until your next turn, damage to that player and their permanents is doubled. */
  stagger(ctx, es) {
    ctx.s.staggered = [
      ...(ctx.s.staggered ?? []),
      { player: other(es.controller), by: es.controller },
    ];
  },

  /**
   * Phoenix, Warden of Fire III: creature cards from your graveyard with total
   * mana value 6 or less onto the battlefield (the engine picks: the greatest
   * total, then the most cards, among the twelve costliest that fit).
   */
  phoenixReturn(ctx, es) {
    const mv = (id: string) => manaValue(def(ctx, id).manaCost);
    const cards = ctx.s.players[es.controller].graveyard
      .filter((id) => def(ctx, id).types.includes('Creature') && mv(id) <= 6)
      .sort((a, b) => mv(b) - mv(a))
      .slice(0, 12);
    let best: string[] = [];
    let bestTotal = -1;
    for (let mask = 1; mask < 1 << cards.length; mask++) {
      const pick = cards.filter((_, i) => mask & (1 << i));
      const total = pick.reduce((n, id) => n + mv(id), 0);
      if (total > 6) continue;
      if (total > bestTotal || (total === bestTotal && pick.length > best.length)) {
        best = pick;
        bestTotal = total;
      }
    }
    for (const id of best) moveObject(ctx, id, 'battlefield', { controller: es.controller });
  },

  /**
   * Choco, Seeker of Paradise: look at as many cards as Birds attacked; one
   * into your hand (the engine picks the costliest nonland card), lands onto
   * the battlefield tapped, the rest into your graveyard.
   */
  chocoLook(ctx, es) {
    const birds = (ctx.s.combat?.attackers ?? []).filter(
      (a) => ctx.s.objects[a.id]?.controller === es.controller && hasSubtype(ctx, a.id, 'Bird'),
    ).length;
    const top = ctx.s.players[es.controller].library.slice(0, birds);
    const isLand = (id: string) => def(ctx, id).types.includes('Land');
    const pick = top
      .filter((id) => !isLand(id))
      .sort((a, b) => manaValue(def(ctx, b).manaCost) - manaValue(def(ctx, a).manaCost))[0];
    if (pick) moveObject(ctx, pick, 'hand');
    for (const id of top) {
      if (id === pick) continue;
      if (isLand(id)) {
        moveObject(ctx, id, 'battlefield', { controller: es.controller });
        obj(ctx, id).tapped = true;
      } else moveObject(ctx, id, 'graveyard');
    }
  },

  /** Jenova: "That creature becomes a Mutant in addition to its other types." */
  becomeMutant(ctx, es) {
    const t = es.targets[0];
    const o = t && 'object' in t ? onBattlefield(ctx, t.object) : undefined;
    if (o && !o.addedSubtypes?.includes('Mutant'))
      o.addedSubtypes = [...(o.addedSubtypes ?? []), 'Mutant'];
  },

  /**
   * Meld (Vanille + Fang): exile the source and its partner (both owned and
   * controlled by you), then meld them into the melded card.
   */
  meld(ctx, es, params) {
    const { partner, into } = params as { partner: string; into: string };
    const self = es.source && onBattlefield(ctx, es.source);
    if (!self || self.owner !== es.controller || self.controller !== es.controller) return;
    const mate = ctx.s.battlefield
      .map((id) => obj(ctx, id))
      .find(
        (o) => o.defId === partner && o.owner === es.controller && o.controller === es.controller,
      );
    if (!mate) return;
    moveObject(ctx, self.id, 'exile');
    moveObject(ctx, mate.id, 'exile');
    if (ctx.s.objects[self.id]?.zone !== 'exile' || ctx.s.objects[mate.id]?.zone !== 'exile')
      return;
    moveObject(ctx, self.id, 'battlefield', {
      controller: es.controller,
      meldInto: into,
      meldedWith: mate.id,
    });
  },

  /** Clive's Hideaway: a hidden land is played (put onto the battlefield); spells are cast by `castFree`. */
  hideawayLand(ctx, es) {
    const self = es.source && ctx.s.objects[es.source.id];
    for (const id of self?.exiledWith ?? []) {
      const o = ctx.s.objects[id];
      if (o?.zone === 'exile' && def(ctx, id).types.includes('Land'))
        moveObject(ctx, id, 'battlefield', { controller: es.controller });
    }
  },

  /**
   * Golbez, Crystal Collector: return the target creature card to your hand;
   * then with eight or more artifacts, each opponent loses life equal to its power.
   */
  golbezReturn(ctx, es) {
    const t = es.targets[0];
    const ref = t && 'object' in t ? t.object : undefined;
    const card = ref && ctx.s.objects[ref.id];
    if (!card || card.zone !== 'graveyard' || card.zcc !== ref.zcc) return;
    moveObject(ctx, card.id, 'hand');
    const artifacts = ctx.s.battlefield.filter(
      (id) => obj(ctx, id).controller === es.controller && def(ctx, id).types.includes('Artifact'),
    ).length;
    if (artifacts >= 8) changeLife(ctx, other(es.controller), -(def(ctx, card.id).power ?? 0));
  },

  /** Light of Judgment: "Destroy up to one Equipment attached to that creature" (the engine picks it). */
  destroyEquipmentOnTarget(ctx, es) {
    const t = es.targets[0];
    const host = t && 'object' in t ? t.object.id : undefined;
    if (!host) return;
    const equipment = ctx.s.battlefield.find(
      (id) =>
        obj(ctx, id).attachedTo === host &&
        def(ctx, id).subtypes.includes('Equipment') &&
        !hasKeyword(ctx, id, 'indestructible'),
    );
    if (equipment) moveObject(ctx, equipment, 'graveyard');
  },

  // Final Fantasy (11c): leftovers

  /**
   * Sandworm: the destroyed land's controller "may search their library for a
   * basic land card, put it onto the battlefield tapped, then shuffle" (the engine always does, taking the first).
   */
  landControllerSearchesBasic(ctx, es) {
    const t = es.targets[0];
    const land = t && 'object' in t ? ctx.s.objects[t.object.id] : undefined;
    if (!land) return;
    const p = land.zone === 'battlefield' ? land.controller : land.owner;
    const lib = ctx.s.players[p].library;
    const basic = lib.find((id) => {
      const d = def(ctx, id);
      return d.types.includes('Land') && d.supertypes.includes('Basic');
    });
    if (basic) {
      moveObject(ctx, basic, 'battlefield');
      obj(ctx, basic).tapped = true;
    }
    shuffleInPlace(ctx.s.rng, ctx.s.players[p].library);
  },

  /**
   * Elixir: exile it, shuffle every nonland card from your graveyard into your
   * library, and gain that much life (the exile happens as the ability resolves).
   */
  elixir(ctx, es) {
    const self = es.source && ctx.s.objects[es.source.id];
    if (self && self.zone === 'battlefield' && self.zcc === es.source!.zcc)
      moveObject(ctx, self.id, 'exile');
    const cards = ctx.s.players[es.controller].graveyard.filter(
      (id) => !def(ctx, id).types.includes('Land'),
    );
    for (const id of cards) moveObject(ctx, id, 'library');
    shuffleInPlace(ctx.s.rng, ctx.s.players[es.controller].library);
    if (cards.length) gainLife(ctx, es.controller, cards.length);
  },

  // Final Fantasy (11d): the Starter Kit

  /**
   * Lightning, Security Sergeant: exile the top card of your library; you may
   * play it for as long as it stays exiled (not only while you control Lightning).
   */
  exileTopPlayableWhileExiled(ctx, es) {
    const top = ctx.s.players[es.controller].library[0];
    if (!top) return;
    moveObject(ctx, top, 'exile');
    obj(ctx, top).playableUntilTurn = Number.MAX_SAFE_INTEGER;
  },
};

/** Final Fantasy one-off conditions (custom conditions). */
export const FIN_CONDITIONS: Record<
  string,
  (ctx: Ctx, controller: PlayerId, self: GameObject | undefined, subject?: GameObject) => boolean
> = {
  // Final Fantasy (11d): the Starter Kit
  /** "As long as it's equipped" (Cloud, Planet's Champion). */
  sourceEquipped: (ctx, _p, self) =>
    !!self &&
    ctx.s.battlefield.some(
      (id) => obj(ctx, id).attachedTo === self.id && def(ctx, id).subtypes.includes('Equipment'),
    ),
};
