import { cardMatches, hasSubtype, matchesFilter } from './characteristics.ts';
import {
  addCounters,
  createObject,
  type Ctx,
  type CustomEffect,
  def,
  defOf,
  emit,
  moveObject,
  newTimestamp,
  obj,
  other,
  sacrifice,
} from './context.ts';
import { type Chooser, type ChooserResult, CHOOSERS } from './stx-13c-a-effects.ts';
import { tokenMultiplier } from './brawl-15a-w-effects.ts';
import { defsWithStatic } from './ecl-multi-b-effects.ts';
import { plusFoodTokens, runEffect } from './effects.ts';
import { manaValue } from './cost.ts';
import { forEachBattlefieldTrigger, queue } from './triggers.ts';
import type {
  AbilityDef,
  CardDb,
  CardDefId,
  CardDefinition,
  CardFilter,
  CardType,
  Color,
  EffectDef,
  EffectSource,
  GameEvent,
  GameObject,
  ManaCost,
  ObjectId,
  ObjectRef,
  PlayerId,
  TargetChoice,
  TargetSpec,
} from './types.ts';

/**
 * The Lord of the Rings (21d, multicolour rares): one-off effects, conditions, choosers and triggers of the 25 multicolour rare and
 * mythic cards of the packets' random slot (Saruman of Many Colors, Sauron the Dark Lord, Tom Bombadil, ...). The card vocabulary
 * is in types.ts (search "Lord of the Rings (21d multi-rare)"). See "Phase 21d: multicolour rares" in docs/lord-of-the-rings-plan.md.
 */

export const custom = (handler: string, params?: Record<string, unknown>): EffectDef => ({
  kind: 'custom',
  handler,
  ...(params ? { params } : {}),
});

/** The object a chosen target names, if it is still the same object on the battlefield. */
function battlefieldTarget(ctx: Ctx, t: TargetChoice | null | undefined): GameObject | undefined {
  if (!t || !('object' in t)) return undefined;
  const o = ctx.s.objects[t.object.id];
  return o && o.zone === 'battlefield' && o.zcc === t.object.zcc ? o : undefined;
}

const LEGENDARY_CREATURE: CardFilter = { types: ['Creature'], supertypes: ['Legendary'] };

/** Reveals the top card of a player's library (returns it, if there is one). */
function revealTop(ctx: Ctx, player: PlayerId): ObjectId | undefined {
  const top = ctx.s.players[player].library[0];
  if (top === undefined) return undefined;
  emit(ctx, { type: 'cardsRevealed', player, cards: [{ id: top, defId: obj(ctx, top).defId }] });
  return top;
}

/** A creature that was put onto the battlefield "attacking" joins the combat, attacking this player or planeswalker. */
function joinAttack(ctx: Ctx, id: ObjectId, defender: PlayerId, planeswalker?: ObjectId): void {
  const combat = ctx.s.combat;
  const o = ctx.s.objects[id];
  if (!combat || !o || o.zone !== 'battlefield') return;
  if (combat.attackers.some((a) => a.id === id)) return;
  combat.attackers.push({
    id,
    defender,
    ...(planeswalker ? { planeswalker } : {}),
    blocked: false,
    blockers: [],
  });
}

/**
 * Tom Bombadil: the `item` field of a resolving ability that is the final chapter ability of a Saga (its last chapter, with the
 * Saga's lore counters at least that high): once it has resolved, "the final chapter ability of a Saga you control resolves" triggers.
 */
export function ltrFinalChapter(
  ctx: Ctx,
  a: AbilityDef,
  item: { sourceDefId: string; source: ObjectRef; controller: PlayerId },
): { ltrFinalChapter?: { source: ObjectRef; controller: PlayerId } } {
  if (a.kind !== 'triggered' || a.trigger.on !== 'chapter') return {};
  const last = defOf(ctx, item.sourceDefId).saga;
  if (!last || !a.trigger.chapters.includes(last)) return {};
  const saga = ctx.s.objects[item.source.id];
  if (!saga || (saga.counters?.lore ?? 0) < last) return {};
  return { ltrFinalChapter: { source: item.source, controller: item.controller } };
}

// ---------------------------------------------------------------------------
// Ward that names a kind of card
// ---------------------------------------------------------------------------

/** A ward cost that names a kind of card: sacrifice a permanent / discard a card matching the filter. */
export interface WardFiltered {
  kind: 'sacrifice' | 'discard';
  filter: CardFilter;
}

/**
 * Sauron, the Dark Lord ("Ward—Sacrifice a legendary artifact or legendary creature"), Saruman of Many Colors ("Ward—Discard an
 * enchantment, instant, or sorcery card"): what `player` could sacrifice or discard to pay this cost (the spell being cast can't be
 * discarded: it is `exclude`).
 */
export function ltrWardCandidates(
  ctx: Ctx,
  player: PlayerId,
  need: WardFiltered,
  exclude?: ObjectId,
): ObjectId[] {
  const pool =
    need.kind === 'sacrifice'
      ? ctx.s.battlefield.filter((id) => obj(ctx, id).controller === player)
      : ctx.s.players[player].hand;
  return pool.filter((id) => id !== exclude && cardMatches(ctx, id, need.filter));
}

/** Can all these costs be paid with different permanents and different cards? */
export function ltrWardFilteredPayable(
  ctx: Ctx,
  player: PlayerId,
  needs: readonly WardFiltered[],
  exclude?: ObjectId,
): boolean {
  if (needs.length === 0) return true;
  const options = needs.map((n) => ltrWardCandidates(ctx, player, n, exclude));
  const used = new Set<ObjectId>();
  const assign = (i: number): boolean => {
    if (i === needs.length) return true;
    for (const id of options[i]!) {
      if (used.has(id)) continue;
      used.add(id);
      if (assign(i + 1)) return true;
      used.delete(id);
    }
    return false;
  };
  return assign(0);
}

/** Pays one such cost with this permanent (sacrificed) or card (discarded). */
export function ltrPayWardFiltered(ctx: Ctx, need: WardFiltered, id: ObjectId): void {
  if (need.kind === 'sacrifice') sacrifice(ctx, id);
  else moveObject(ctx, id, 'graveyard');
}

/**
 * Saruman of Many Colors: "target enchantment, instant, or sorcery card with equal or lesser mana value than that spell" (the filter
 * `atMostManaValueOfSubject`; the spell is the trigger's subject, its mana value as it was on the stack, X included).
 */
export function ltrManaValueWithinSubject(
  ctx: Ctx,
  spec: TargetSpec,
  id: ObjectId,
  src: { subjectId?: ObjectId; ltrSubjectId?: ObjectId },
): boolean {
  if (!spec.filter?.atMostManaValueOfSubject) return true;
  const sid = src.subjectId ?? src.ltrSubjectId;
  const subject = sid ? ctx.s.objects[sid] : undefined;
  if (!subject) return true;
  const limit = subject.ltrCastMV ?? manaValue(defOf(ctx, subject.defId).manaCost);
  return manaValue(def(ctx, id).manaCost) <= limit;
}

// ---------------------------------------------------------------------------
// Sharkey, Tyrant of the Shire
// ---------------------------------------------------------------------------

const sharkeyDefs = new WeakMap<CardDb, ReadonlySet<CardDefId>>();

/** Does this card have Sharkey's static ability? (def() asks for every permanent: one lookup.) */
export function copiesOpponentLandAbilities(db: CardDb, defId: CardDefId): boolean {
  let ids = sharkeyDefs.get(db);
  if (!ids) sharkeyDefs.set(db, (ids = defsWithStatic(db, 'ltrOpponentLandAbilities')));
  return ids.has(defId);
}

/** A permanent with Sharkey's static ability is on the battlefield under this player's control. */
function sharkeyOf(ctx: Ctx, player: PlayerId): boolean {
  return ctx.s.battlefield.some(
    (id) =>
      obj(ctx, id).controller === player && copiesOpponentLandAbilities(ctx.db, obj(ctx, id).defId),
  );
}

/**
 * Sharkey, Tyrant of the Shire: "Activated abilities of lands your opponents control can't be activated unless they're mana
 * abilities." (Is this a land under such a lock? Its mana abilities are `mana` abilities, not `activated` ones, and stay.)
 */
export function landAbilitiesLocked(ctx: Ctx, source: ObjectId): boolean {
  const o = obj(ctx, source);
  return def(ctx, source).types.includes('Land') && sharkeyOf(ctx, other(o.controller));
}

/** The cost with every kind of mana as generic: "mana of any type can be spent to activate Sharkey's abilities". */
const anyTypeOfMana = (c: ManaCost): ManaCost => ({
  generic: manaValue(c),
  colored: {},
  ...(c.x ? { x: c.x } : {}),
});

/**
 * Sharkey, Tyrant of the Shire: "Sharkey has all activated abilities of lands your opponents control except mana abilities." "Mana
 * of any type can be spent to activate Sharkey's abilities." (Abilities that work only from another zone aren't given.)
 */
export function withOpponentLandAbilities(
  ctx: Ctx,
  o: GameObject,
  d: CardDefinition,
): CardDefinition {
  const given = ctx.s.battlefield.flatMap((id) => {
    const land = obj(ctx, id);
    if (land.controller === o.controller) return [];
    const ld = def(ctx, id);
    if (!ld.types.includes('Land')) return [];
    return ld.abilities.flatMap((a) =>
      a.kind === 'activated' && !(a.fromHand || a.fromGraveyard || a.fromExile)
        ? [a.cost.mana ? { ...a, cost: { ...a.cost, mana: anyTypeOfMana(a.cost.mana) } } : a]
        : [],
    );
  });
  const own = d.abilities.map((a) =>
    a.kind === 'activated' && a.cost.mana
      ? { ...a, cost: { ...a.cost, mana: anyTypeOfMana(a.cost.mana) } }
      : a,
  );
  return { ...d, abilities: [...own, ...given] };
}

/** Planeswalkers a player controls. */
const planeswalkersOf = (ctx: Ctx, player: PlayerId): ObjectId[] =>
  ctx.s.battlefield.filter(
    (id) => obj(ctx, id).controller === player && def(ctx, id).types.includes('Planeswalker'),
  );

export const LTR_MULTI_RARE_EFFECTS: Record<string, CustomEffect> = {
  /**
   * Éowyn, Fearless Knight: "Legendary creatures you control gain protection from each of that creature's colors until end of turn."
   * "That creature" is target 0, read before it is exiled (its colors as it was on the battlefield).
   */
  ltrProtectFromTargetColors(ctx, es) {
    const t = battlefieldTarget(ctx, es.targets[0]);
    if (!t) return;
    const colors: Color[] = def(ctx, t.id).colors;
    if (colors.length === 0) return;
    for (const id of ctx.s.battlefield) {
      const o = obj(ctx, id);
      if (o.controller !== es.controller || !matchesFilter(ctx, id, LEGENDARY_CREATURE)) continue;
      for (const color of colors)
        ctx.s.effects.push({
          timestamp: newTimestamp(ctx),
          affected: { id, zcc: o.zcc },
          power: 0,
          toughness: 0,
          keywords: [],
          protectionFrom: color,
          expires: 'endOfTurn',
        });
    }
  },

  /**
   * Aragorn, Company Leader: "put one of each of those kinds of counters on up to one other target creature" (the kinds put on
   * Aragorn, remembered under the trigger's amount).
   */
  ltrCountersLikeThose(ctx, es) {
    const src = es.source ? ctx.s.objects[es.source.id] : undefined;
    const seq = es.amount;
    if (!src || seq === undefined) return;
    const kinds = src.ltrCounterKinds?.[seq] ?? [];
    const { [seq]: _used, ...rest } = src.ltrCounterKinds ?? {};
    src.ltrCounterKinds = rest;
    const t = battlefieldTarget(ctx, es.targets[0]);
    if (!t) return;
    for (const kind of kinds)
      addCounters(ctx, t.id, 1, kind === '+1/+1' ? undefined : kind, es.controller);
  },

  /**
   * Shelob, Child of Ungoliant: "create a token that's a copy of that creature, except it's a Food artifact with '{2}, {T},
   * Sacrifice this token: You gain 3 life,' and it loses all other card types." The creature is the card named by the record the
   * trigger's amount points at (it may be a token that is gone). It enters as a Food (not a creature): see `supperFood`.
   */
  ltrShelobFood(ctx, es) {
    const rec = (ctx.s.turn.ltrSpiderDamaged ?? []).find((r) => r.n === es.amount);
    if (!rec) return;
    const times = tokenMultiplier(ctx, es.controller);
    for (let i = 0; i < times; i++) {
      const t = createObject(ctx, rec.defId, es.controller, 'battlefield', true);
      t.supperFood = true;
      ctx.s.battlefield.push(t.id);
      emit(ctx, { type: 'objectMoved', id: t.id, defId: t.defId, from: null, to: 'battlefield' });
    }
    plusFoodTokens(ctx, es.controller); // Peregrin Took: "those tokens plus an additional Food token"
  },

  /**
   * Saruman of Many Colors: "each opponent mills two cards. When one or more cards are milled this way, ..." (the reflexive trigger is
   * the card's ability `params.ability`, with the spell as its subject; the spell's mana value is remembered, X included).
   */
  ltrSarumanMill(ctx, es, params) {
    const spell = es.subject ? ctx.s.objects[es.subject.id] : undefined;
    if (spell) {
      const cost = defOf(ctx, spell.defId).manaCost;
      const item = ctx.s.stack.find((x) => x.kind === 'spell' && x.id === spell.id);
      spell.ltrCastMV =
        manaValue(cost) + (cost.x ?? 0) * (item?.kind === 'spell' ? (item.x ?? 0) : 0);
    }
    const foe = other(es.controller);
    const before = ctx.s.players[foe].library.length;
    runEffect(ctx, es, { kind: 'mill', count: 2, who: 'eachOpponent' });
    // (The spell is on the stack, not the battlefield, so the reflexive trigger is queued here with it as its subject.)
    if (before - ctx.s.players[foe].library.length > 0 && es.source)
      ctx.s.pendingTriggers.push({
        source: es.source,
        sourceDefId: es.sourceDefId,
        abilityIndex: Number((params as { ability: number }).ability),
        controller: es.controller,
        ...(es.subject ? { subject: es.subject } : {}),
      });
  },

  /** Pippin, Guard of the Citadel: the target gains protection from the card type that was chosen, until end of turn. */
  ltrProtectFromType(ctx, es, params) {
    const o = battlefieldTarget(ctx, es.targets[0]);
    if (!o) return;
    ctx.s.effects.push({
      timestamp: newTimestamp(ctx),
      affected: { id: o.id, zcc: o.zcc },
      power: 0,
      toughness: 0,
      keywords: [],
      protectionFromType: (params as { type: CardType }).type,
      expires: 'endOfTurn',
    });
  },

  /**
   * Galadriel of Lothlórien: "reveal the top card of your library. If a land card is revealed this way, put it onto the battlefield
   * tapped." (The "you may" is the `may` around it.)
   */
  ltrRevealLandToBattlefield(ctx, es) {
    const top = revealTop(ctx, es.controller);
    if (top === undefined || !def(ctx, top).types.includes('Land')) return;
    moveObject(ctx, top, 'battlefield', { controller: es.controller });
    obj(ctx, top).tapped = true;
  },

  /**
   * Doors of Durin: "reveal the top card of your library. If a creature card is revealed this way, put it onto the battlefield
   * tapped and attacking. Until your next turn, it gains trample if you control a Dwarf and hexproof if you control an Elf."
   * The creature is remembered as the chosen permanent; it attacks the opponent unless they control planeswalkers (then the
   * `ltrDoorsAttack` chooser asks what it attacks).
   */
  ltrDoorsReveal(ctx, es) {
    const top = revealTop(ctx, es.controller);
    if (top === undefined || !def(ctx, top).types.includes('Creature')) return;
    moveObject(ctx, top, 'battlefield', { controller: es.controller });
    const o = obj(ctx, top);
    if (o.zone !== 'battlefield') return;
    o.tapped = true;
    es.chosen = { id: o.id, zcc: o.zcc };
    const foe = other(es.controller);
    if (planeswalkersOf(ctx, foe).length === 0) joinAttack(ctx, o.id, foe);
    const grants = (['Dwarf', 'Elf'] as const).filter((subtype) =>
      ctx.s.battlefield.some(
        (id) => obj(ctx, id).controller === es.controller && hasSubtype(ctx, id, subtype),
      ),
    );
    const keywords = grants.map((g) =>
      g === 'Dwarf' ? ('trample' as const) : ('hexproof' as const),
    );
    if (keywords.length)
      ctx.s.effects.push({
        timestamp: newTimestamp(ctx),
        affected: { id: o.id, zcc: o.zcc },
        power: 0,
        toughness: 0,
        keywords,
        expires: 'untilYourNextTurn',
        player: es.controller,
      });
  },

  /** Doors of Durin: the creature put onto the battlefield attacks this player (or this planeswalker). */
  ltrJoinAttack(ctx, es, params) {
    const p = params as { id: ObjectId; defender: PlayerId; planeswalker?: ObjectId };
    joinAttack(ctx, p.id, p.defender, p.planeswalker);
  },

  /**
   * Sméagol, Helpful Guide: "target opponent reveals cards from the top of their library until they reveal a land card. Put that card
   * onto the battlefield tapped under your control and the rest into their graveyard."
   */
  ltrSmeagolSteal(ctx, es) {
    const t = es.targets[0];
    if (!t || !('player' in t)) return;
    const foe = t.player;
    const revealed: ObjectId[] = [];
    let land: ObjectId | undefined;
    for (const id of ctx.s.players[foe].library) {
      revealed.push(id);
      if (def(ctx, id).types.includes('Land')) {
        land = id;
        break;
      }
    }
    if (revealed.length === 0) return;
    emit(ctx, {
      type: 'cardsRevealed',
      player: foe,
      cards: revealed.map((id) => ({ id, defId: obj(ctx, id).defId })),
    });
    if (land !== undefined) {
      moveObject(ctx, land, 'battlefield', { controller: es.controller });
      obj(ctx, land).tapped = true;
    }
    for (const id of revealed) if (id !== land) moveObject(ctx, id, 'graveyard');
  },

  /**
   * Faramir, Prince of Ithilien: "choose an opponent. At the beginning of that player's next end step, ..." (the effects are
   * `params.effects`; the one opponent is chosen).
   */
  ltrAtOpponentNextEndStep(ctx, es, params) {
    if (!es.source) return;
    (ctx.s.delayed ??= []).push({
      controller: es.controller,
      sourceDefId: es.sourceDefId,
      subject: es.source,
      effects: (params as { effects: EffectDef[] }).effects,
      fromTurn: ctx.s.turn.number,
      whose: other(es.controller),
    });
  },
};

/** Custom conditions (`{ kind: 'custom', handler }`). */
export const LTR_MULTI_RARE_CONDITIONS: Record<
  string,
  (
    ctx: Ctx,
    controller: PlayerId,
    self: GameObject | undefined,
    subject: GameObject | undefined,
  ) => boolean
> = {
  /** Merry, Esquire of Rohan: "as long as it's equipped" (an Equipment is attached to it). */
  ltrSourceEquipped(ctx, _controller, self) {
    if (!self) return false;
    return ctx.s.battlefield.some(
      (id) => obj(ctx, id).attachedTo === self.id && def(ctx, id).subtypes.includes('Equipment'),
    );
  },

  /** Tom Bombadil: "as long as there are four or more lore counters among Sagas you control". */
  ltrFourLoreCounters(ctx, controller) {
    let lore = 0;
    for (const id of ctx.s.battlefield) {
      const o = obj(ctx, id);
      if (o.controller === controller && def(ctx, id).subtypes.includes('Saga'))
        lore += o.counters?.lore ?? 0;
    }
    return lore >= 4;
  },

  /** Faramir, Prince of Ithilien: "if they didn't attack you that turn" (attacking a planeswalker of yours doesn't count). */
  ltrNotAttackedYou(ctx, controller) {
    return !(ctx.s.turn.ltrAttackedPlayers ?? []).includes(controller);
  },
};

// ---------------------------------------------------------------------------
// Choosers
// ---------------------------------------------------------------------------

const LTR_MULTI_RARE_CHOOSERS: Record<string, Chooser> = {
  /**
   * Doors of Durin: what the creature put onto the battlefield attacks, when the opponent controls planeswalkers (a player or one of
   * them). Nothing to ask without a creature, or when it was already put into the attack.
   */
  ltrDoorsAttack(ctx, es): ChooserResult | null {
    const chosen = es.chosen;
    if (!chosen) return null;
    const o = ctx.s.objects[chosen.id];
    if (!o || o.zone !== 'battlefield' || o.zcc !== chosen.zcc) return null;
    if (ctx.s.combat?.attackers.some((a) => a.id === o.id)) return null;
    const foe = other(es.controller);
    const walkers = planeswalkersOf(ctx, foe);
    if (walkers.length === 0 || !ctx.s.combat) return null;
    return {
      title: `${def(ctx, o.id).name} attacks`,
      options: [
        {
          label: `Attack ${foe === 'p1' ? 'player 1' : 'player 2'}`,
          effects: [custom('ltrJoinAttack', { id: o.id, defender: foe })],
        },
        ...walkers.map((w) => ({
          label: `Attack ${def(ctx, w).name}`,
          effects: [custom('ltrJoinAttack', { id: o.id, defender: foe, planeswalker: w })],
        })),
      ],
    };
  },
};
Object.assign(CHOOSERS, LTR_MULTI_RARE_CHOOSERS);

// ---------------------------------------------------------------------------
// Triggers
// ---------------------------------------------------------------------------

/** Events the multicolour rares watch (called from the trigger detection with every event). */
export function detectLtrMultiRare(ctx: Ctx, ev: GameEvent): void {
  const s = ctx.s;
  switch (ev.type) {
    case 'attackersDeclared': {
      // Faramir, Prince of Ithilien: which players were attacked (not their planeswalkers).
      for (const a of s.combat?.attackers ?? []) {
        if (a.planeswalker) continue;
        const list = s.turn.ltrAttackedPlayers ?? [];
        if (!list.includes(a.defender)) s.turn.ltrAttackedPlayers = [...list, a.defender];
      }
      return;
    }
    case 'damageDealt': {
      // Shelob, Child of Ungoliant: a creature dealt damage by a Spider (its controller then, now).
      if (ev.amount <= 0 || !('object' in ev.to)) return;
      const src = s.objects[ev.source];
      const victim = s.objects[ev.to.object.id];
      if (
        !src ||
        !victim ||
        victim.zone !== 'battlefield' ||
        !def(ctx, victim.id).types.includes('Creature')
      )
        return;
      const spider =
        src.zone === 'battlefield'
          ? hasSubtype(ctx, src.id, 'Spider')
          : defOf(ctx, src.defId).subtypes.includes('Spider');
      if (!spider) return;
      const list = s.turn.ltrSpiderDamaged ?? [];
      if (list.some((r) => r.id === victim.id && r.zcc === victim.zcc && r.by === src.controller))
        return;
      s.turn.ltrSpiderDamaged = [
        ...list,
        {
          id: victim.id,
          zcc: victim.zcc,
          by: src.controller,
          defId: victim.defId,
          n: list.length + 1,
        },
      ];
      return;
    }
    case 'objectMoved': {
      // Shelob: another creature that was dealt damage by a Spider you controlled this turn dies.
      if (ev.from !== 'battlefield' || ev.to !== 'graveyard' || ev.leftAsFood) return;
      const moved = s.objects[ev.id];
      const records = (s.turn.ltrSpiderDamaged ?? []).filter(
        (r) => r.id === ev.id && (!moved || r.zcc === moved.zcc - 1),
      );
      if (records.length === 0) return;
      for (const id of [...s.battlefield]) {
        const o = obj(ctx, id);
        if (o.id === ev.id) continue;
        def(ctx, id).abilities.forEach((a, i) => {
          if (a.kind !== 'triggered' || a.trigger.on !== 'creatureDamagedBySpiderDies') return;
          const rec = records.find((r) => r.by === o.controller);
          if (rec) queue(ctx, o, i, o.controller, undefined, rec.n);
        });
      }
      return;
    }
    case 'targeted': {
      // King of the Oathbreakers: "Whenever King of the Oathbreakers or another Spirit you control becomes the target of a spell".
      if (ev.byAbility) return;
      for (const id of ev.ids) {
        const target = s.objects[id];
        if (!target || target.zone !== 'battlefield' || !s.battlefield.includes(id)) continue;
        if (!hasSubtype(ctx, id, 'Spirit')) continue;
        forEachBattlefieldTrigger(
          ctx,
          (o, a) =>
            a.trigger.on === 'spiritYouControlTargetedBySpell' &&
            o.controller === target.controller,
          target,
        );
      }
      return;
    }
    case 'phased': {
      // King of the Oathbreakers: "Whenever King of the Oathbreakers or another Spirit you control phases in".
      if (!ev.in) return;
      const back = s.objects[ev.id];
      if (!back || back.zone !== 'battlefield' || !hasSubtype(ctx, back.id, 'Spirit')) return;
      forEachBattlefieldTrigger(
        ctx,
        (o, a) => a.trigger.on === 'spiritYouControlPhasesIn' && o.controller === back.controller,
        back,
      );
      return;
    }
    case 'finalChapterResolved': {
      // Tom Bombadil: "Whenever the final chapter ability of a Saga you control resolves" (once each turn: the ability's flag).
      forEachBattlefieldTrigger(
        ctx,
        (o, a) => a.trigger.on === 'finalChapterResolves' && o.controller === ev.controller,
        s.objects[ev.source.id],
      );
      return;
    }
    case 'anyCountersAdded': {
      // Aragorn, Company Leader: "Whenever you put one or more counters on Aragorn" (one trigger for all the counters put on it
      // in one resolution; the kinds are remembered under the trigger's amount).
      const target = s.objects[ev.id];
      if (!target || target.zone !== 'battlefield') return;
      const kind = ev.name ?? '+1/+1';
      def(ctx, target.id).abilities.forEach((a, i) => {
        if (a.kind !== 'triggered' || a.trigger.on !== 'countersPutOnSelf') return;
        if ((ev.by ?? ev.player) !== target.controller) return;
        const key = `ltrCountersOnSelf:${target.id}:${i}`;
        if (ctx.batched.has(key)) {
          const pending = s.pendingTriggers.find(
            (t) => t.source.id === target.id && t.abilityIndex === i && t.amount !== undefined,
          );
          const seq = pending?.amount;
          if (seq === undefined) return;
          const kinds = target.ltrCounterKinds?.[seq] ?? [];
          if (!kinds.includes(kind))
            target.ltrCounterKinds = { ...target.ltrCounterKinds, [seq]: [...kinds, kind] };
          return;
        }
        ctx.batched.add(key);
        const seq = (target.ltrBatchSeq ?? 0) + 1;
        target.ltrBatchSeq = seq;
        target.ltrCounterKinds = { ...target.ltrCounterKinds, [seq]: [kind] };
        queue(ctx, target, i, target.controller, target, seq);
      });
      return;
    }
    default:
      return;
  }
}

export type { EffectSource };
