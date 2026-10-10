import { isCreature, power } from './characteristics.ts';
import {
  type Ctx,
  type CustomEffect,
  createObject,
  def,
  defOf,
  emit,
  moveObject,
  newTimestamp,
  obj,
  other,
  sacrifice,
} from './context.ts';
import { runEffect } from './effects.ts';
import { isRingBearer } from './ltr-21a.ts';
import { shuffleInPlace } from './rng.ts';
import { type Chooser, type ChooserResult, CHOOSERS } from './stx-13c-a-effects.ts';
import { forEachBattlefieldTrigger } from './triggers.ts';
import type {
  EffectDef,
  EffectSource,
  GameEvent,
  GameObject,
  ObjectId,
  ObjectRef,
  PlayerId,
} from './types.ts';

/**
 * The Lord of the Rings (21d, black and red rares): the one-off effects, prompts and triggers of Isildur's Fateful Strike,
 * Lobelia Sackville-Baggins, One Ring to Rule Them All, Orcish Bowmasters, Sauron the Necromancer, Shadow of the Enemy,
 * Witch-king of Angmar, Display of Power, Hew the Entwood, There and Back Again and Éomer, Marshal of Rohan. The hooks are marked
 * `// Lord of the Rings (21d br-rare)` where they sit. See "Phase 21d: black and red rares" in docs/lord-of-the-rings-plan.md.
 */

const custom = (handler: string, params?: Record<string, unknown>): EffectDef => ({
  kind: 'custom',
  handler,
  ...(params ? { params } : {}),
});
const chooseCustom = (handler: string, params?: Record<string, unknown>): EffectDef => ({
  kind: 'chooseCustom',
  handler,
  ...(params ? { params } : {}),
});

const ref = (o: GameObject): ObjectRef => ({ id: o.id, zcc: o.zcc });

/** The permanent a target slot names, if it is still the same object on the battlefield. */
function battlefieldTarget(ctx: Ctx, es: EffectSource, i: number): GameObject | undefined {
  const t = es.targets[i];
  if (!t || !('object' in t)) return undefined;
  const o = ctx.s.objects[t.object.id];
  return o && o.zone === 'battlefield' && o.zcc === t.object.zcc ? o : undefined;
}

/** The card a target slot names, if it is still the same object in this zone. */
function zoneTarget(
  ctx: Ctx,
  es: EffectSource,
  i: number,
  zone: GameObject['zone'],
): GameObject | undefined {
  const t = es.targets[i];
  if (!t || !('object' in t)) return undefined;
  const o = ctx.s.objects[t.object.id];
  return o && o.zone === zone && o.zcc === t.object.zcc ? o : undefined;
}

/** Labels for a list of objects: the card name, numbered when several share it. */
function labelled(ctx: Ctx, ids: ObjectId[], suffix: (o: GameObject) => string = () => ''): string[] {
  const total = new Map<string, number>();
  const name = (id: ObjectId) => `${def(ctx, id).name}${suffix(obj(ctx, id))}`;
  for (const id of ids) total.set(name(id), (total.get(name(id)) ?? 0) + 1);
  const seen = new Map<string, number>();
  return ids.map((id) => {
    const n = name(id);
    const k = (seen.get(n) ?? 0) + 1;
    seen.set(n, k);
    return (total.get(n) ?? 1) > 1 ? `${n} (${k})` : n;
  });
}

/** Custom effects that turn into other effects when they come up (a prompt built from the state the earlier effects left). */
type Expander = (
  ctx: Ctx,
  es: EffectSource,
  params: Record<string, unknown> | undefined,
) => EffectDef[];

// ---------------------------------------------------------------------------
// Custom effects
// ---------------------------------------------------------------------------

export const LTR_BR_RARE_EFFECTS: Record<string, CustomEffect> = {
  /**
   * Lobelia Sackville-Baggins: "exile target creature card from an opponent's graveyard that was put there from the battlefield
   * this turn, then create X Treasure tokens, where X is the exiled card's power."
   */
  ltrLobelia(ctx, es) {
    const card = zoneTarget(ctx, es, 0, 'graveyard');
    if (!card) return;
    moveObject(ctx, card.id, 'exile');
    if (card.zone !== 'exile') return;
    const x = Math.max(0, power(ctx, card.id));
    if (x > 0) runEffect(ctx, es, { kind: 'createToken', token: 'treasure-token', count: x });
  },

  /**
   * One Ring to Rule Them All, chapter III: "Each opponent loses 1 life for each creature card in that player's graveyard." (The
   * game has two players: the one opponent.)
   */
  ltrOneRingLoss(ctx, es) {
    const opp = other(es.controller);
    const n = ctx.s.players[opp].graveyard.filter((id) =>
      defOf(ctx, obj(ctx, id).defId).types.includes('Creature'),
    ).length;
    if (n > 0) runEffect(ctx, es, { kind: 'loseLife', who: 'eachOpponent', amount: n });
  },

  /**
   * Shadow of the Enemy: "Exile all creature cards from target player's graveyard. You may cast spells from among those cards for
   * as long as they remain exiled, and mana of any type can be spent to cast them."
   */
  ltrShadowOfTheEnemy(ctx, es) {
    const t = es.targets[0];
    if (!t || !('player' in t)) return;
    for (const id of [...ctx.s.players[t.player].graveyard]) {
      if (!defOf(ctx, obj(ctx, id).defId).types.includes('Creature')) continue;
      moveObject(ctx, id, 'exile');
      const o = obj(ctx, id);
      if (o.zone !== 'exile') continue;
      o.castableBy = es.controller;
      o.anyMana = true;
      if (o.owner === es.controller) o.ltrOwnExileCast = true;
    }
  },

  /**
   * Sauron, the Necromancer: "Whenever Sauron attacks, exile target creature card from your graveyard. Create a tapped and
   * attacking token that's a copy of that card, except it's a 3/3 black Wraith with menace. At the beginning of the next end step,
   * exile that token unless Sauron is your Ring-bearer." The token attacks the opponent or the planeswalker chosen
   * (`params.walker`, see `ltrSauronStart`).
   */
  ltrSauronCopy(ctx, es, params) {
    const card = zoneTarget(ctx, es, 0, 'graveyard');
    if (!card || card.owner !== es.controller) return;
    moveObject(ctx, card.id, 'exile');
    if (card.zone !== 'exile') return;
    const token = createObject(ctx, card.defId, es.controller, 'battlefield', true);
    // The copy exception: a 3/3 black Wraith (the creature types are replaced) with menace in addition.
    token.copyPT = { power: 3, toughness: 3 };
    token.creatureTypes = ['Wraith'];
    token.creatureTypesTimestamp = newTimestamp(ctx);
    token.colorOverride = { colors: ['B'] };
    ctx.s.colorChanges = true;
    token.grantedKeywords = ['menace'];
    if (ctx.s.combat) {
      token.tapped = true;
      // "Tapped and attacking": it attacks the opponent, or the planeswalker chosen (when the opponent controls any).
      const walker = params?.walker ? ctx.s.objects[String(params.walker)] : undefined;
      const walkerOk =
        !!walker && walker.zone === 'battlefield' && walker.controller === other(es.controller);
      ctx.s.combat.attackers.push({
        id: token.id,
        defender: other(es.controller),
        ...(walkerOk ? { planeswalker: walker.id } : {}),
        blocked: false,
        blockers: [],
      });
    }
    ctx.s.battlefield.push(token.id);
    emit(ctx, {
      type: 'objectMoved',
      id: token.id,
      defId: token.defId,
      from: null,
      to: 'battlefield',
    });
    (ctx.s.delayed ??= []).push({
      controller: es.controller,
      sourceDefId: es.sourceDefId,
      subject: ref(token),
      effects: [custom('ltrSauronExile', { sauron: es.source })],
      fromTurn: ctx.s.turn.number + (['end', 'cleanup'].includes(ctx.s.turn.step) ? 1 : 0),
    });
  },

  /** Sauron, the Necromancer, the delayed trigger: exile the token (the subject) unless Sauron is still your Ring-bearer. */
  ltrSauronExile(ctx, es, params) {
    const token = es.subject && ctx.s.objects[es.subject.id];
    if (!token || token.zone !== 'battlefield' || token.zcc !== es.subject!.zcc) return;
    const s = params?.sauron as ObjectRef | undefined;
    const sauron = s && ctx.s.objects[s.id];
    if (sauron && sauron.zone === 'battlefield' && sauron.zcc === s.zcc && isRingBearer(ctx, sauron))
      return;
    moveObject(ctx, token.id, 'exile');
  },

  /** A permanent (params.id) is sacrificed by its controller, if it is still on the battlefield as the same object. */
  ltrSacrificeId(ctx, _es, params) {
    const o = ctx.s.objects[String(params?.id)];
    if (!o || o.zone !== 'battlefield' || o.zcc !== Number(params?.zcc)) return;
    sacrifice(ctx, o.id);
  },

  /** A card in a hand (params.id) is exiled. */
  ltrExileHandCard(ctx, _es, params) {
    const o = ctx.s.objects[String(params?.id)];
    if (!o || o.zone !== 'hand') return;
    moveObject(ctx, o.id, 'exile');
  },

  /** Hew the Entwood: a land (params.id) is sacrificed. */
  ltrHewSacrifice(ctx, es, params) {
    const o = ctx.s.objects[String(params?.id)];
    if (!o || o.zone !== 'battlefield' || o.controller !== es.controller) return;
    sacrifice(ctx, o.id);
  },

  /**
   * Hew the Entwood: "Reveal the top X cards of your library, where X is the number of lands sacrificed this way." X is
   * `params.n`; the cards are shown to both players.
   */
  ltrHewReveal(ctx, es, params) {
    const n = Number(params?.n ?? 0);
    for (const id of ctx.s.players[es.controller].library.slice(0, n))
      emit(ctx, { type: 'revealed', player: es.controller, id });
  },

  /**
   * Hew the Entwood: "Put all nonland cards chosen this way onto the battlefield, then put all land cards chosen this way onto the
   * battlefield tapped, then put the rest on the bottom of your library in a random order." `params.revealed` and `params.chosen`
   * are the card ids.
   */
  ltrHewFinish(ctx, es, params) {
    const revealed = (params?.revealed as ObjectId[]) ?? [];
    const chosen = new Set((params?.chosen as ObjectId[]) ?? []);
    const inLibrary = (id: ObjectId) => ctx.s.objects[id]?.zone === 'library';
    const isLand = (id: ObjectId) => defOf(ctx, obj(ctx, id).defId).types.includes('Land');
    const picked = revealed.filter((id) => chosen.has(id) && inLibrary(id));
    for (const id of picked.filter((x) => !isLand(x)))
      moveObject(ctx, id, 'battlefield', { controller: es.controller });
    for (const id of picked.filter(isLand)) {
      moveObject(ctx, id, 'battlefield', { controller: es.controller });
      if (obj(ctx, id).zone === 'battlefield') obj(ctx, id).tapped = true;
    }
    const rest = revealed.filter((id) => !chosen.has(id) && inLibrary(id));
    shuffleInPlace(ctx.s.rng, rest);
    for (const id of rest) moveObject(ctx, id, 'library', { position: 'bottom' });
  },

  /**
   * There and Back Again, chapter I: "Up to one target creature can't block for as long as you control this Saga." Nothing if the
   * Saga is already gone or someone else controls it.
   */
  ltrCantBlockWhileSaga(ctx, es) {
    const creature = battlefieldTarget(ctx, es, 0);
    const saga = es.source && ctx.s.objects[es.source.id];
    if (!creature || !saga || saga.zone !== 'battlefield' || saga.zcc !== es.source!.zcc) return;
    if (saga.controller !== es.controller) return;
    ctx.s.effects.push({
      timestamp: newTimestamp(ctx),
      affected: ref(creature),
      power: 0,
      toughness: 0,
      keywords: [],
      cantBlock: true,
      expires: 'whileSource',
      whileSourceId: saga.id,
      ltrWhileControlledBy: es.controller,
    });
  },
};

/** "For as long as you control this Saga" ends as soon as someone else controls it (state-based; leaving ends it elsewhere). */
export function expireControlEffects(ctx: Ctx): void {
  if (!ctx.s.effects.some((e) => e.ltrWhileControlledBy)) return;
  ctx.s.effects = ctx.s.effects.filter((e) => {
    if (!e.ltrWhileControlledBy) return true;
    const src = e.whileSourceId ? ctx.s.objects[e.whileSourceId] : undefined;
    return !!src && src.zone === 'battlefield' && src.controller === e.ltrWhileControlledBy;
  });
}

// ---------------------------------------------------------------------------
// Expanders: effects that become prompts
// ---------------------------------------------------------------------------

export const LTR_BR_RARE_EXPANDERS: Record<string, Expander> = {
  /**
   * Isildur's Fateful Strike: "Destroy target creature. If its controller has more than four cards in hand, they exile cards from
   * their hand equal to the difference." Its controller is read before it is destroyed.
   */
  ltrIsildurStrike(ctx, es) {
    const t = es.targets[0];
    const o = t && 'object' in t ? ctx.s.objects[t.object.id] : undefined;
    const destroy: EffectDef = { kind: 'destroy', what: { target: 0 } };
    if (!o || o.zone !== 'battlefield') return [destroy];
    return [destroy, custom('ltrIsildurHand', { player: o.controller })];
  },

  /** Isildur's Fateful Strike, after the destroy: that player exiles the cards over four, one at a time, their choice. */
  ltrIsildurHand(ctx, _es, params) {
    const player = params?.player as PlayerId;
    const extra = ctx.s.players[player].hand.length - 4;
    return extra > 0 ? [chooseCustom('ltrIsildurPick', { player, left: extra })] : [];
  },

  /**
   * Hew the Entwood: "Sacrifice any number of lands." One land at a time (or Done), chosen by its controller; `n` counts the lands
   * sacrificed so far, and `last` is the one just chosen (counted only if it really left).
   */
  ltrHewSacrificeStep(ctx, es, params) {
    const last = params?.last as ObjectId | undefined;
    const n = Number(params?.n ?? 0) + (last && obj(ctx, last).zone !== 'battlefield' ? 1 : 0);
    const lands = ctx.s.battlefield.filter(
      (id) =>
        obj(ctx, id).controller === es.controller &&
        defOf(ctx, obj(ctx, id).defId).types.includes('Land'),
    );
    const done: EffectDef[] = [custom('ltrHewReveal', { n }), custom('ltrHewChooseStep', { n })];
    if (lands.length === 0) return done;
    const names = labelled(ctx, lands, (o) => (o.tapped ? ' (tapped)' : ''));
    return [
      {
        kind: 'choose',
        title: `Hew the Entwood: sacrifice any number of lands (${n} so far)`,
        options: [
          { label: 'Done', effects: done },
          ...lands.map((id, i) => ({
            label: `Sacrifice ${names[i]}`,
            effects: [
              custom('ltrHewSacrifice', { id }),
              custom('ltrHewSacrificeStep', { n, last: id }),
            ],
          })),
        ],
      },
    ];
  },

  /**
   * Hew the Entwood: "Choose any number of artifact and/or land cards revealed this way." One card at a time (or Done) among the
   * top `n` cards of the library; then they move.
   */
  ltrHewChooseStep(ctx, es, params) {
    const lib = ctx.s.players[es.controller].library;
    const revealed = (params?.revealed as ObjectId[] | undefined) ?? lib.slice(0, Number(params?.n ?? 0));
    if (revealed.length === 0) return [];
    const chosen = (params?.chosen as ObjectId[] | undefined) ?? [];
    const fits = (id: ObjectId) => {
      const types = defOf(ctx, obj(ctx, id).defId).types;
      return types.includes('Artifact') || types.includes('Land');
    };
    const candidates = revealed.filter((id) => fits(id) && !chosen.includes(id));
    const finish: EffectDef = custom('ltrHewFinish', { revealed, chosen });
    if (candidates.length === 0) return [finish];
    const names = labelled(ctx, candidates);
    return [
      {
        kind: 'choose',
        title: `Hew the Entwood: choose artifact and land cards (${chosen.length} chosen)`,
        options: [
          ...candidates.map((id, i) => ({
            label: `Put ${names[i]} onto the battlefield`,
            effects: [custom('ltrHewChooseStep', { revealed, chosen: [...chosen, id] })],
          })),
          { label: 'Done', effects: [finish] },
        ],
      },
    ];
  },

  /**
   * Witch-king of Angmar: "each opponent sacrifices a creature of their choice that dealt combat damage to you this turn." The
   * opponent picks among those creatures they control (no prompt when there is one).
   */
  ltrWitchKingSacrifice(ctx, es) {
    const opp = other(es.controller);
    const dealt = ctx.s.turn.ltrCombatDamagers?.[es.controller] ?? [];
    const options: GameObject[] = [];
    for (const key of dealt) {
      const [id, zcc] = key.split(':') as [string, string];
      const o = ctx.s.objects[id];
      if (
        o &&
        o.zone === 'battlefield' &&
        o.zcc === Number(zcc) &&
        o.controller === opp &&
        isCreature(ctx, o.id) &&
        !options.includes(o)
      )
        options.push(o);
    }
    if (options.length === 0) return [];
    if (options.length === 1)
      return [custom('ltrSacrificeId', { id: options[0]!.id, zcc: options[0]!.zcc })];
    return [chooseCustom('ltrWitchKingPick')];
  },

  /**
   * Sauron, the Necromancer: the token enters "tapped and attacking" what you choose: the opponent, or a planeswalker they control. No
   * prompt when they control none (or the target is gone and nothing happens).
   */
  ltrSauronStart(ctx, es) {
    const card = zoneTarget(ctx, es, 0, 'graveyard');
    if (!card || card.owner !== es.controller) return [];
    const walkers = ctx.s.battlefield.filter(
      (id) =>
        obj(ctx, id).controller === other(es.controller) &&
        defOf(ctx, obj(ctx, id).defId).types.includes('Planeswalker'),
    );
    if (walkers.length === 0 || !ctx.s.combat) return [custom('ltrSauronCopy')];
    return [chooseCustom('ltrSauronDefender')];
  },

  /**
   * Display of Power: "Copy any number of target instant and/or sorcery spells. You may choose new targets for the copies." One
   * copy for each target, each with its own choice of new targets.
   */
  ltrDisplayOfPower(_ctx, es) {
    return es.targets.flatMap((_, i): EffectDef[] => [
      { kind: 'copySpell', what: { target: i }, newTargets: true },
    ]);
  },
};

// ---------------------------------------------------------------------------
// Choosers
// ---------------------------------------------------------------------------

const LTR_BR_RARE_CHOOSERS: Record<string, Chooser> = {
  /** Isildur's Fateful Strike: the next card to exile from the hand (cards with the same name are alike). */
  ltrIsildurPick(ctx, _es, params): ChooserResult | null {
    const player = params?.player as PlayerId;
    const left = Number(params?.left ?? 0);
    const hand = ctx.s.players[player].hand;
    if (left <= 0 || hand.length === 0) return null;
    const seen = new Set<string>();
    const options: ChooserResult['options'] = [];
    for (const id of hand) {
      const key = obj(ctx, id).defId;
      if (seen.has(key)) continue;
      seen.add(key);
      options.push({
        label: `Exile ${def(ctx, id).name}`,
        effects: [
          custom('ltrExileHandCard', { id }),
          ...(left > 1 ? [chooseCustom('ltrIsildurPick', { player, left: left - 1 })] : []),
        ],
      });
    }
    return {
      player,
      title: `Isildur's Fateful Strike: exile ${left} card${left === 1 ? '' : 's'} from your hand`,
      options,
    };
  },

  /** Sauron, the Necromancer: what the token attacks (the opponent, or one of their planeswalkers). */
  ltrSauronDefender(ctx, es): ChooserResult | null {
    const walkers = ctx.s.battlefield.filter(
      (id) =>
        obj(ctx, id).controller === other(es.controller) &&
        defOf(ctx, obj(ctx, id).defId).types.includes('Planeswalker'),
    );
    const names = labelled(ctx, walkers);
    return {
      title: 'Sauron, the Necromancer: the token attacks',
      options: [
        { label: 'Attack your opponent', effects: [custom('ltrSauronCopy')] },
        ...walkers.map((id, i) => ({
          label: `Attack ${names[i]}`,
          effects: [custom('ltrSauronCopy', { walker: id })],
        })),
      ],
    };
  },

  /** Witch-king of Angmar: the creature the opponent sacrifices, one that dealt combat damage to the Witch-king's controller. */
  ltrWitchKingPick(ctx, es): ChooserResult | null {
    const opp = other(es.controller);
    const dealt = ctx.s.turn.ltrCombatDamagers?.[es.controller] ?? [];
    const ids: ObjectId[] = [];
    for (const key of dealt) {
      const [id, zcc] = key.split(':') as [string, string];
      const o = ctx.s.objects[id];
      if (
        o &&
        o.zone === 'battlefield' &&
        o.zcc === Number(zcc) &&
        o.controller === opp &&
        isCreature(ctx, o.id) &&
        !ids.includes(o.id)
      )
        ids.push(o.id);
    }
    if (ids.length === 0) return null;
    const names = labelled(ctx, ids);
    return {
      player: opp,
      title: 'Witch-king of Angmar: sacrifice a creature that dealt combat damage',
      options: ids.map((id, i) => ({
        label: `Sacrifice ${names[i]}`,
        effects: [custom('ltrSacrificeId', { id, zcc: obj(ctx, id).zcc })],
      })),
    };
  },
};
Object.assign(CHOOSERS, LTR_BR_RARE_CHOOSERS);

// ---------------------------------------------------------------------------
// Triggers
// ---------------------------------------------------------------------------

/**
 * The battlefield-to-graveyard moves that happened together with this one (the run of them in the event list): creatures that
 * died at the same moment see each other die.
 */
function deathBatch(ctx: Ctx, ev: Extract<GameEvent, { type: 'objectMoved' }>) {
  const events = ctx.events;
  const at = events.indexOf(ev);
  if (at < 0) return [ev];
  const isDeath = (e: GameEvent | undefined): e is Extract<GameEvent, { type: 'objectMoved' }> =>
    e?.type === 'objectMoved' && e.from === 'battlefield' && e.to === 'graveyard';
  const batch = [ev];
  for (let i = at - 1; i >= 0 && isDeath(events[i]); i--) batch.push(events[i] as typeof ev);
  for (let i = at + 1; i < events.length && isDeath(events[i]); i++) batch.push(events[i] as typeof ev);
  return batch;
}

/**
 * Orcish Bowmasters (an opponent draws), Witch-king of Angmar (the creatures that dealt combat damage to a player) and Éomer,
 * Marshal of Rohan (an attacking legendary creature dies). Called from the trigger detection with every event.
 */
export function detectLtrBrRare(ctx: Ctx, ev: GameEvent): void {
  const s = ctx.s;
  switch (ev.type) {
    case 'cardDrawn': {
      // "Whenever an opponent draws a card except the first one they draw in each of their draw steps."
      if (ev.drawStep) return;
      forEachBattlefieldTrigger(
        ctx,
        (o, a) => a.trigger.on === 'ltrOpponentExtraDraw' && o.controller !== ev.player,
      );
      return;
    }
    case 'damageDealt': {
      // Witch-king of Angmar remembers the creatures that dealt combat damage to each player this turn.
      if (!ev.combat || ev.amount <= 0 || !('player' in ev.to)) return;
      const src = s.objects[ev.source];
      if (!src) return;
      const list = ((s.turn.ltrCombatDamagers ??= {})[ev.to.player] ??= []);
      const key = `${src.id}:${src.zcc}`;
      if (!list.includes(key)) list.push(key);
      return;
    }
    case 'objectMoved': {
      if (ev.from !== 'battlefield' || ev.to !== 'graveyard' || ev.leftAsFood) return;
      // Éomer, Marshal of Rohan: an attacking legendary creature you controlled died (Éomer himself is the one dying: not "other").
      if (!ev.leftAttackingLegendary || !ev.controller) return;
      const controller = ev.controller;
      const trigger = (o: GameObject, a: { trigger: { on: string } }) =>
        a.trigger.on === 'ltrAttackingLegendaryDies' && o.controller === controller;
      forEachBattlefieldTrigger(ctx, (o, a) => o.id !== ev.id && trigger(o, a));
      // An Éomer that died at the same moment looks back (rule 603.10a): its own ability triggers from the graveyard.
      for (const other of deathBatch(ctx, ev)) {
        if (other.id === ev.id || other.controller !== controller) continue;
        const dead = s.objects[other.id];
        if (!dead || dead.zone !== 'graveyard') continue;
        defOf(ctx, other.defId).abilities.forEach((a, i) => {
          if (a.kind !== 'triggered' || a.trigger.on !== 'ltrAttackingLegendaryDies') return;
          queueFromGraveyard(ctx, dead, i, controller);
        });
      }
      return;
    }
    default:
      return;
  }
}

function queueFromGraveyard(ctx: Ctx, card: GameObject, index: number, controller: PlayerId): void {
  const a = defOf(ctx, card.defId).abilities[index];
  if (a?.kind === 'triggered' && a.oncePerTurn) {
    if (card.onceTurns?.[index] === ctx.s.turn.number) return;
    card.onceTurns = { ...card.onceTurns, [index]: ctx.s.turn.number };
  }
  ctx.s.pendingTriggers.push({
    source: ref(card),
    sourceDefId: card.defId,
    abilityIndex: index,
    controller,
  });
}
