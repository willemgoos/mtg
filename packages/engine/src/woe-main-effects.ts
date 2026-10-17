import { countOf, matchesFilter } from './characteristics.ts';
import {
  type Ctx,
  type CustomEffect,
  def,
  defOf,
  drawCard,
  moveObject,
  obj,
  other,
  sacrifice,
  tap,
} from './context.ts';
import { manaValue } from './cost.ts';
import { endCopy, runEffect } from './effects.ts';
import { shuffleLibrary } from './setup.ts';
import { type Chooser, CHOOSERS } from './stx-13c-a-effects.ts';
import {
  type Amount,
  type CardDefinition,
  type CardFilter,
  type EffectDef,
  type EffectSource,
  type ManaCost,
  type ObjectId,
  PLAYERS,
  type PlayerId,
  type StaticDef,
} from './types.ts';

/**
 * Wilds of Eldraine (23d main): one-off engine pieces of the rest of the booster set. Cruel Somnophage and Tangled Colony's amounts
 * (`woeMainAmount`), Virtue of Knowledge's extra triggers (`woeEnterExtraTriggers`), Virtue of Strength's tripled mana
 * (`woeTripleExtra`), Blossoming Tortoise's cost reduction (`woeLandActivationCost`), The Irencrag's Everflame (`everflameDef`),
 * Mosswood Dreadknight's Adventure from the graveyard (`woeAdventureReady`), and the custom effects and choosers behind the
 * rest. The hooks sit where they are used, marked `// Wilds of Eldraine (23d main)`.
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

const nameOf = (ctx: Ctx, id: ObjectId): string => defOf(ctx, obj(ctx, id).defId).name;
const isCreatureCard = (ctx: Ctx, id: ObjectId): boolean =>
  defOf(ctx, obj(ctx, id).defId).types.includes('Creature');

/** `player`'s permanents with a static ability of this kind. */
function staticCount(ctx: Ctx, player: PlayerId, kind: StaticDef['kind']): number {
  return ctx.s.battlefield.filter(
    (id) =>
      obj(ctx, id).controller === player &&
      def(ctx, id).abilities.some((a) => a.kind === 'static' && a.effect.kind === kind),
  ).length;
}

// ---------------------------------------------------------------------------
// Amounts
// ---------------------------------------------------------------------------

/** Cruel Somnophage ("creature cards in all graveyards"), Tangled Colony ("the damage dealt to it this turn"). */
export function woeMainAmount(ctx: Ctx, a: Amount, sourceId?: ObjectId): number | undefined {
  if (typeof a !== 'object') return undefined;
  if ('woeCreatureCardsInAllGraveyards' in a)
    return PLAYERS.reduce(
      (n, p) => n + ctx.s.players[p].graveyard.filter((id) => isCreatureCard(ctx, id)).length,
      0,
    );
  if ('woeDamageOnSelf' in a) {
    if (!sourceId) return 0;
    const o = ctx.s.objects[sourceId];
    if (!o) return ctx.s.turn.tokenLki?.[sourceId]?.damage ?? 0;
    return o.zone === 'battlefield' ? o.damage : (o.lastDamage ?? 0);
  }
  return undefined;
}

/** "Up to X target creatures" on a trigger (Extraordinary Journey): the X paid for its source; any other amount as usual. */
export function woeTargetLimit(ctx: Ctx, player: PlayerId, a: Amount, sourceId: ObjectId): number {
  if (typeof a === 'object' && 'x' in a)
    return (ctx.s.objects[sourceId]?.xPaid ?? 0) * (a.times ?? 1) + (a.plus ?? 0);
  return countOf(ctx, player, a, false, sourceId);
}

// ---------------------------------------------------------------------------
// Virtue of Knowledge, Virtue of Strength, Blossoming Tortoise
// ---------------------------------------------------------------------------

/**
 * Called as a permanent enters, before the abilities its entering caused are doubled by anything else (`before`: how many triggers
 * were pending before it). Returns what to call afterwards: each triggered ability of a permanent of a player who controls Virtues of
 * Knowledge that the entering caused triggers an additional time for each Virtue (the extra times add up).
 */
export function woeEnterExtraTriggers(ctx: Ctx, before: number): () => void {
  const counts = PLAYERS.map(
    (p) => [p, staticCount(ctx, p, 'woeEntersTriggerTwice')] as const,
  ).filter(([, n]) => n > 0);
  if (counts.length === 0) return () => undefined;
  const caused = ctx.s.pendingTriggers.slice(before).map((t) => ({ ...t }));
  return () => {
    for (const [player, n] of counts)
      for (const t of caused) {
        if (t.controller !== player || t.emblem) continue;
        if (t.abilityIndex < 0 && !t.inline) continue;
        if (ctx.s.objects[t.source.id]?.zone !== 'battlefield') continue;
        for (let k = 0; k < n; k++) ctx.s.pendingTriggers.push({ ...t });
      }
  };
}

/** How many extra mana a basic land `player` taps makes: three times as much is two more (a factor of three for each Virtue of Strength). */
export function woeTripleExtra(ctx: Ctx, player: PlayerId): number {
  const n = staticCount(ctx, player, 'woeTripleBasicMana');
  return n === 0 ? 0 : 3 ** Math.min(n, 3) - 1;
}

/** An activated ability of a land costs {1} less for each Blossoming Tortoise its controller has (generic mana only). */
export function woeLandActivationCost(
  ctx: Ctx,
  source: ObjectId,
  cost: ManaCost | undefined,
): ManaCost | undefined {
  if (!cost || cost.generic === 0) return cost;
  const o = obj(ctx, source);
  if (o.zone !== 'battlefield' || !def(ctx, source).types.includes('Land')) return cost;
  let less = 0;
  for (const id of ctx.s.battlefield) {
    if (obj(ctx, id).controller !== o.controller) continue;
    for (const a of def(ctx, id).abilities)
      if (a.kind === 'static' && a.effect.kind === 'woeLandAbilitiesCostLess')
        less += a.effect.amount;
  }
  return less > 0 ? { ...cost, generic: Math.max(0, cost.generic - less) } : cost;
}

// ---------------------------------------------------------------------------
// The Irencrag: Everflame, Heroes' Legacy
// ---------------------------------------------------------------------------

const everflameDefs = new WeakMap<CardDefinition, CardDefinition>();

/** The Irencrag once it has become "a legendary Equipment artifact named Everflame, Heroes' Legacy ... equip {3} ... +3/+3", with no other abilities. */
export function everflameDef(d: CardDefinition): CardDefinition {
  let e = everflameDefs.get(d);
  if (!e) {
    e = {
      ...d,
      name: "Everflame, Heroes' Legacy",
      types: ['Artifact'],
      subtypes: ['Equipment'],
      supertypes: ['Legendary'],
      abilities: [
        { kind: 'static', effect: { kind: 'attached', power: 3, toughness: 3 } },
        {
          kind: 'activated',
          cost: { mana: { generic: 3, colored: {} } },
          sorcerySpeed: true,
          targets: [{ what: 'creature', controller: 'you' }],
          effects: [{ kind: 'attach', to: { target: 0 } }],
          label: 'Equip {3}',
        },
      ],
    };
    everflameDefs.set(d, e);
  }
  return e;
}

// ---------------------------------------------------------------------------
// Mosswood Dreadknight: its Adventure from the graveyard
// ---------------------------------------------------------------------------

/** Is this card in `player`'s graveyard one whose Adventure they may cast now (Mosswood Dreadknight)? */
export function woeAdventureReady(ctx: Ctx, player: PlayerId, card: ObjectId): boolean {
  const o = ctx.s.objects[card];
  const w = o?.woeAdventureCast;
  return (
    !!o &&
    !!w &&
    o.zone === 'graveyard' &&
    w.player === player &&
    w.zcc === o.zcc &&
    ctx.s.turn.number <= w.until
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** The object the nth target names, if it is still the same object. */
function targetObject(ctx: Ctx, es: EffectSource, i: number): ObjectId | undefined {
  const t = es.targets[i];
  if (!t || !('object' in t)) return undefined;
  const o = ctx.s.objects[t.object.id];
  return o && o.zcc === t.object.zcc ? o.id : undefined;
}

const sameCard = (ctx: Ctx, id: ObjectId, zone: string, zcc: number): boolean => {
  const o = ctx.s.objects[id];
  return !!o && o.zone === zone && o.zcc === zcc;
};

const ARTIFACT_ENCHANTMENT_OR_TOKEN: CardFilter = {
  anyOf: [{ types: ['Artifact'] }, { types: ['Enchantment'] }, { token: true }],
};

export const WOE_MAIN_EFFECTS: Record<string, CustomEffect> = {
  /** Discerning Financier: "That player gains control of target Treasure you control" (the one other player). */
  woeMainGiveControl(ctx, es) {
    const id = targetObject(ctx, es, 0);
    if (!id || obj(ctx, id).zone !== 'battlefield') return;
    obj(ctx, id).controller = other(es.controller);
  },

  /**
   * Extraordinary Journey: "Exile up to X target creatures. For each of those cards, its owner may play it for as long as it remains
   * exiled." (Tokens are not cards: they are just gone.)
   */
  woeMainJourneyExile(ctx, es) {
    for (let i = 0; i < es.targets.length; i++) {
      const id = targetObject(ctx, es, i);
      if (!id || obj(ctx, id).zone !== 'battlefield') continue;
      const token = obj(ctx, id).isToken;
      moveObject(ctx, id, 'exile');
      const o = ctx.s.objects[id];
      if (!token && o && o.zone === 'exile') o.playableUntilTurn = Number.MAX_SAFE_INTEGER;
    }
  },

  /**
   * Expensive Taste: "Exile the top two cards of target opponent's library face down. You may look at and play those cards for as
   * long as they remain exiled."
   */
  woeMainExpensiveTaste(ctx, es) {
    const t = es.targets[0];
    if (!t || !('player' in t)) return;
    for (const id of [...ctx.s.players[t.player].library.slice(0, 2)]) {
      moveObject(ctx, id, 'exile');
      const o = ctx.s.objects[id];
      if (!o || o.zone !== 'exile') continue;
      o.castableBy = es.controller;
      o.castableUntilTurn = Number.MAX_SAFE_INTEGER;
      o.woeFaceDown = es.controller;
    }
  },

  /** Mosswood Dreadknight: "you may cast it from your graveyard as an Adventure until the end of your next turn." */
  woeMainDreadknightPermit(ctx, es) {
    const o = es.source ? ctx.s.objects[es.source.id] : undefined;
    if (!o || o.zone !== 'graveyard' || o.isToken) return;
    o.woeAdventureCast = {
      player: es.controller,
      zcc: o.zcc,
      until: ctx.s.turn.number + (ctx.s.turn.activePlayer === es.controller ? 2 : 1),
    };
  },

  /** The Irencrag: "you may have The Irencrag become a legendary Equipment artifact named Everflame, Heroes' Legacy." */
  woeMainEverflame(ctx, es) {
    const o = es.source ? ctx.s.objects[es.source.id] : undefined;
    if (o && o.zone === 'battlefield' && o.zcc === es.source!.zcc) o.woeEverflame = true;
  },

  /**
   * Likeness Looter: "This creature becomes a copy of target creature card in your graveyard with mana value X, except it has flying
   * and this ability." Its second ability (index 1) is the one it keeps.
   */
  woeMainLooterCopy(ctx, es) {
    const id = targetObject(ctx, es, 0);
    const self = es.source ? ctx.s.objects[es.source.id] : undefined;
    if (!id || !self || self.zone !== 'battlefield' || obj(ctx, id).zone !== 'graveyard') return;
    const copied = obj(ctx, id).defId;
    endCopy(ctx, self);
    self.originalDefId ??= self.defId;
    self.defId = copied;
    self.copyKeptAbilities = [1];
    self.copyAddedKeywords = ['flying'];
  },

  /** Sacrifices one particular permanent its controller still has (the choice of a chooser). */
  woeMainSacrificeId(ctx, es, params) {
    const id = (params as { id: ObjectId }).id;
    const o = ctx.s.objects[id];
    if (o && o.zone === 'battlefield' && o.controller === es.controller) sacrifice(ctx, id);
  },

  /** Lich-Knights' Conquest: returns one particular creature card from the graveyard to the battlefield. */
  woeMainReturnId(ctx, es, params) {
    const id = (params as { id: ObjectId }).id;
    const o = ctx.s.objects[id];
    if (o && o.zone === 'graveyard' && o.owner === es.controller)
      moveObject(ctx, id, 'battlefield', { controller: es.controller });
  },

  /** Fell Horseman: "When this creature dies, put it on the bottom of its owner's library." (A token has already ceased to exist.) */
  woeMainBottomSelf(ctx, es) {
    const o = es.source ? ctx.s.objects[es.source.id] : undefined;
    if (o && o.zone === 'graveyard') moveObject(ctx, o.id, 'library', { position: 'bottom' });
  },

  /** Beseech the Mirror: the card found stays exiled face down. */
  woeMainFaceDownFound(ctx, es) {
    const c = es.chosen && ctx.s.objects[es.chosen.id];
    if (c && c.zone === 'exile' && c.zcc === es.chosen!.zcc) c.woeFaceDown = es.controller;
  },

  /** Beseech the Mirror: "Put the exiled card into your hand if it wasn't cast this way." */
  woeMainFoundToHand(ctx, es, params) {
    const p = params as { id?: ObjectId; zcc?: number } | undefined;
    const id = p?.id ?? es.chosen?.id;
    const zcc = p?.zcc ?? es.chosen?.zcc;
    if (id === undefined || zcc === undefined || !sameCard(ctx, id, 'exile', zcc)) return;
    delete ctx.s.objects[id]!.woeFaceDown;
    moveObject(ctx, id, 'hand');
  },

  /** Specter of Mortality: exile the cards chosen, then each other creature gets -X/-X until end of turn. */
  woeMainSpecterFinish(ctx, es, params) {
    const ids = (params as { ids: ObjectId[] }).ids;
    let n = 0;
    for (const id of ids)
      if (ctx.s.objects[id]?.zone === 'graveyard') {
        moveObject(ctx, id, 'exile');
        n++;
      }
    if (n === 0) return;
    runEffect(ctx, es, {
      kind: 'pump',
      to: { each: 'creature', filter: { other: true } },
      power: -n,
      toughness: -n,
    });
  },

  /**
   * The End: exile the target, then the cards the caster chose with the same name from its controller's graveyard, hand and library;
   * that player shuffles, then draws a card for each card exiled from their hand.
   */
  woeMainTheEndFinish(ctx, es, params) {
    const p = params as { name: string; ctl: PlayerId; g: number; h: number; l: number };
    const target = es.targets[0] && 'object' in es.targets[0] ? es.targets[0].object.id : undefined;
    if (target && ctx.s.objects[target]?.zone === 'battlefield') moveObject(ctx, target, 'exile');
    const ps = ctx.s.players[p.ctl];
    const take = (zone: 'graveyard' | 'hand' | 'library', n: number): number => {
      let done = 0;
      for (const id of [...ps[zone]]) {
        if (done >= n) break;
        if (nameOf(ctx, id) !== p.name) continue;
        moveObject(ctx, id, 'exile');
        done++;
      }
      return done;
    };
    take('graveyard', p.g);
    const fromHand = take('hand', p.h);
    take('library', p.l);
    shuffleLibrary(ctx, p.ctl);
    for (let i = 0; i < fromHand; i++) drawCard(ctx, p.ctl);
  },
};

// ---------------------------------------------------------------------------
// Choosers (`chooseCustom`)
// ---------------------------------------------------------------------------

const WOE_MAIN_CHOOSERS: Record<string, Chooser> = {
  /**
   * Devouring Sugarmaw: "you may sacrifice an artifact, enchantment, or token. If you don't, tap this creature." One option per
   * permanent that could be sacrificed, or none.
   */
  woeMainSugarmaw(ctx, es) {
    const self = es.source ? ctx.s.objects[es.source.id] : undefined;
    if (!self || self.zone !== 'battlefield') return null;
    const options = ctx.s.battlefield
      .filter(
        (id) =>
          obj(ctx, id).controller === es.controller &&
          matchesFilter(ctx, id, ARTIFACT_ENCHANTMENT_OR_TOKEN),
      )
      .map((id) => ({
        label: `Sacrifice ${nameOf(ctx, id)}`,
        effects: [custom('woeMainSacrificeId', { id })],
      }));
    if (options.length === 0) {
      tap(ctx, self.id);
      return null;
    }
    return {
      title: 'Devouring Sugarmaw: sacrifice an artifact, enchantment, or token, or it taps',
      options: [
        ...options,
        {
          label: "Don't sacrifice (tap Devouring Sugarmaw)",
          effects: [{ kind: 'tap', what: 'self' }],
        },
      ],
    };
  },

  /**
   * Lich-Knights' Conquest: "Sacrifice any number of artifacts, enchantments, and/or tokens. Return that many creature cards from
   * your graveyard to the battlefield." The permanents are chosen one at a time (`stage` 'sac'), then the cards (`stage` 'ret').
   */
  woeMainLich(ctx, es, params) {
    const p = (params ?? { stage: 'sac', n: 0 }) as {
      stage: 'sac' | 'ret';
      n?: number;
      left?: number;
    };
    if (p.stage === 'sac') {
      const n = p.n ?? 0;
      const eligible = ctx.s.battlefield.filter(
        (id) =>
          obj(ctx, id).controller === es.controller &&
          matchesFilter(ctx, id, ARTIFACT_ENCHANTMENT_OR_TOKEN),
      );
      if (eligible.length === 0) {
        if (n > 0) return WOE_MAIN_CHOOSERS.woeMainLich!(ctx, es, { stage: 'ret', left: n });
        return null;
      }
      return {
        title: "Lich-Knights' Conquest: sacrifice an artifact, enchantment, or token",
        options: [
          {
            label: n === 0 ? 'Sacrifice nothing' : `Done sacrificing (${n})`,
            effects: n === 0 ? [] : [chooseCustom('woeMainLich', { stage: 'ret', left: n })],
          },
          ...eligible.map((id) => ({
            label: `Sacrifice ${nameOf(ctx, id)}`,
            effects: [
              custom('woeMainSacrificeId', { id }),
              chooseCustom('woeMainLich', { stage: 'sac', n: n + 1 }),
            ],
          })),
        ],
      };
    }
    const left = p.left ?? 0;
    const cards = ctx.s.players[es.controller].graveyard.filter((id) => isCreatureCard(ctx, id));
    if (left <= 0 || cards.length === 0) return null;
    return {
      title: `Lich-Knights' Conquest: return a creature card (${left} left)`,
      options: cards.map((id) => ({
        label: `Return ${nameOf(ctx, id)}`,
        effects: [
          custom('woeMainReturnId', { id }),
          chooseCustom('woeMainLich', { stage: 'ret', left: left - 1 }),
        ],
      })),
    };
  },

  /**
   * Specter of Mortality: "you may exile one or more creature cards from your graveyard. When you do, each other creature gets -X/-X
   * until end of turn, where X is the number of cards exiled this way." One card at a time.
   */
  woeMainSpecter(ctx, es, params) {
    const picked = ((params as { picked?: ObjectId[] } | undefined)?.picked ?? []) as ObjectId[];
    const cards = ctx.s.players[es.controller].graveyard.filter(
      (id) => !picked.includes(id) && isCreatureCard(ctx, id),
    );
    if (picked.length > 0 && cards.length === 0) {
      WOE_MAIN_EFFECTS.woeMainSpecterFinish!(ctx, es, { ids: picked });
      return null;
    }
    if (cards.length === 0) return null;
    return {
      title: 'Specter of Mortality: exile creature cards from your graveyard',
      options: [
        picked.length === 0
          ? { label: "Don't exile any cards", effects: [] }
          : {
              label: `Done: exile ${picked.length}, other creatures get -${picked.length}/-${picked.length}`,
              effects: [custom('woeMainSpecterFinish', { ids: picked })],
            },
        ...cards.map((id) => ({
          label: `Exile ${nameOf(ctx, id)}`,
          effects: [chooseCustom('woeMainSpecter', { picked: [...picked, id] })],
        })),
      ],
    };
  },

  /**
   * Beseech the Mirror, bargained: "you may cast the exiled card without paying its mana cost if that spell's mana value is 4 or
   * less. Put the exiled card into your hand if it wasn't cast this way." The card found is the one chosen.
   */
  woeMainBeseech(ctx, es) {
    const c = es.chosen;
    if (!c || !sameCard(ctx, c.id, 'exile', c.zcc)) return null;
    const d = def(ctx, c.id);
    if (d.types.includes('Land') || manaValue(d.manaCost) > 4) {
      WOE_MAIN_EFFECTS.woeMainFoundToHand!(ctx, es, undefined);
      return null;
    }
    const ref = { id: c.id, zcc: c.zcc };
    return {
      title: `Beseech the Mirror: cast ${d.name} without paying its mana cost?`,
      options: [
        {
          label: `Cast ${d.name} without paying its mana cost`,
          effects: [{ kind: 'castFreeCard', card: ref }, custom('woeMainFoundToHand', ref)],
        },
        { label: `Put ${d.name} into your hand`, effects: [custom('woeMainFoundToHand', ref)] },
      ],
    };
  },

  /**
   * The End: "Search its controller's graveyard, hand, and library for any number of cards with the same name as that permanent
   * and exile them." How many from each zone is chosen in turn, the most first.
   */
  woeMainTheEnd(ctx, es, params) {
    const prior = params as
      | { name: string; ctl: PlayerId; g?: number; h?: number; l?: number }
      | undefined;
    const state: { name: string; ctl: PlayerId; g?: number; h?: number; l?: number } = prior
      ? { ...prior }
      : { name: '', ctl: 'p1' };
    if (!prior) {
      const target = targetObject(ctx, es, 0);
      if (!target) return null;
      state.name = nameOf(ctx, target);
      state.ctl = obj(ctx, target).controller;
    }
    const stages = [
      ['g', 'graveyard'],
      ['h', 'hand'],
      ['l', 'library'],
    ] as const;
    for (const [key, zone] of stages) {
      if (state[key] !== undefined) continue;
      const have = ctx.s.players[state.ctl][zone].filter(
        (id) => nameOf(ctx, id) === state.name,
      ).length;
      if (have === 0) {
        state[key] = 0;
        continue;
      }
      const options = [];
      for (let k = have; k >= 0; k--)
        options.push({
          label: `Exile ${k} from their ${zone}`,
          effects: [chooseCustom('woeMainTheEnd', { ...state, [key]: k })],
        });
      return { title: `The End: cards named ${state.name}`, options };
    }
    WOE_MAIN_EFFECTS.woeMainTheEndFinish!(ctx, es, state);
    return null;
  },
};
Object.assign(CHOOSERS, WOE_MAIN_CHOOSERS);
