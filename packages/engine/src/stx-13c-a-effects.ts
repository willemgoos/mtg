import { characteristics, hasKeyword } from './characteristics.ts';
import {
  type Ctx,
  type CustomEffect,
  createObject,
  def,
  drawCard,
  emit,
  moveObject,
  newTimestamp,
  obj,
  other,
  tap,
  untap,
} from './context.ts';
import { damageSourceFor, dealDamage, gainLife, plusFoodTokens, useShield } from './effects.ts';
import { nextInt, shuffleInPlace } from './rng.ts';
import type { EffectDef, EffectSource, ObjectId, PlayerId } from './types.ts';

/**
 * Strixhaven (13c, group A): one-off effects of the white, blue, Silverquill and
 * Lorehold cards, as custom effects, and the choosers behind `chooseCustom`.
 */

export interface ChooserResult {
  /** Who chooses (default: the controller). */
  player?: PlayerId;
  title?: string;
  options: { label: string; effects: EffectDef[] }[];
}

export type Chooser = (
  ctx: Ctx,
  es: EffectSource,
  params: Record<string, unknown> | undefined,
) => ChooserResult | null;

const custom = (handler: string, params?: Record<string, unknown>): EffectDef => ({
  kind: 'custom',
  handler,
  ...(params ? { params } : {}),
});

/** The permanent a target slot points at, if it is still there. */
function targetObject(ctx: Ctx, es: EffectSource, i: number): ObjectId | undefined {
  const t = es.targets[i];
  if (!t || !('object' in t)) return undefined;
  const o = ctx.s.objects[t.object.id];
  return o && o.zcc === t.object.zcc ? o.id : undefined;
}

/** Nonland card names to pick from: what the opponent has shown comes first. */
function cardNames(ctx: Ctx, controller: PlayerId): { id: string; name: string }[] {
  const opp = ctx.s.players[other(controller)];
  const seen = [...opp.graveyard, ...opp.exile, ...ctx.s.battlefield]
    .map((id) => obj(ctx, id))
    .filter((o) => o.owner === opp.id)
    .map((o) => o.defId);
  const all = new Map<string, string>();
  for (const d of ctx.db.values()) {
    if (d.isToken || d.noManaCost || d.types.includes('Land')) continue;
    all.set(d.id, d.name);
  }
  const first = [...new Set(seen)].filter((id) => all.has(id));
  const rest = [...all.keys()].filter((id) => !first.includes(id));
  rest.sort((a, b) => all.get(a)!.localeCompare(all.get(b)!));
  return [...first, ...rest].map((id) => ({ id, name: all.get(id)! }));
}

export const CHOOSERS: Record<string, Chooser> = {
  /** "Choose a nonland card name": Silverquill Silencer, Academic Probation. */
  cardName(ctx, es, params) {
    const handler = (params as { then: string }).then;
    return {
      title: 'Choose a nonland card name',
      options: cardNames(ctx, es.controller).map((c) => ({
        label: c.name,
        effects: [custom(handler, { defId: c.id })],
      })),
    };
  },
  /** Deadly Vanity: the creature or planeswalker that survives. */
  deadlyVanity(ctx, es) {
    const options = ctx.s.battlefield
      .filter((id) => {
        const t = def(ctx, id).types;
        return t.includes('Creature') || t.includes('Planeswalker');
      })
      .map((id) => ({
        label: `${def(ctx, id).name} (${obj(ctx, id).controller === es.controller ? 'yours' : "opponent's"})`,
        effects: [custom('deadlyVanity', { id })],
      }));
    return { title: 'Choose a creature or planeswalker to keep', options };
  },
  /** Lukka, Wayward Bonder +1: you may discard a card (draw one, or two for a creature card). */
  lukkaDiscard(ctx, es) {
    const hand = ctx.s.players[es.controller].hand;
    if (hand.length === 0) return null;
    return {
      title: 'Lukka, Wayward Bonder: discard a card to draw',
      options: [
        ...hand.map((id) => ({
          label: `Discard ${def(ctx, id).name}`,
          effects: [custom('lukkaDiscard', { id })],
        })),
        { label: "Don't discard", effects: [] },
      ],
    };
  },
  /** Multiple Choice (X = 2): you may choose a player; they return a creature they control. */
  multipleChoicePlayer(_ctx, es) {
    void es;
    return {
      title: 'Multiple Choice: choose a player to return a creature',
      options: [
        {
          label: 'You',
          effects: [{ kind: 'chooseCustom', handler: 'bounceOwn', params: { you: true } }],
        },
        {
          label: 'An opponent',
          effects: [{ kind: 'chooseCustom', handler: 'bounceOwn', params: { you: false } }],
        },
        { label: 'No one', effects: [] },
      ],
    };
  },
  /** The chosen player returns a creature they control to its owner's hand. */
  bounceOwn(ctx, es, params) {
    const who = (params as { you: boolean }).you ? es.controller : other(es.controller);
    const options = ctx.s.battlefield
      .filter((id) => obj(ctx, id).controller === who && def(ctx, id).types.includes('Creature'))
      .map((id) => ({ label: def(ctx, id).name, effects: [custom('bounceId', { id })] }));
    return { player: who, title: 'Return a creature you control to its owner’s hand', options };
  },
  /** Mercurial Transformation: a blue Frog 1/1 or a blue Octopus 4/4. */
  mercurial(ctx, es) {
    if (targetObject(ctx, es, 0) === undefined) return null;
    return {
      title: 'Mercurial Transformation',
      options: [
        {
          label: 'Blue Frog creature, base power and toughness 1/1',
          effects: [custom('mercurial', {})],
        },
        {
          label: 'Blue Octopus creature, base power and toughness 4/4',
          effects: [custom('mercurial', { octopus: true })],
        },
      ],
    };
  },
  /** Devastating Mastery: the opponent returns up to two nonland permanents they control. */
  masteryBounce(ctx, es, params) {
    const opp = other(es.controller);
    const second = !!(params as { second?: boolean } | undefined)?.second;
    const options = ctx.s.battlefield
      .filter((id) => obj(ctx, id).controller === opp && !def(ctx, id).types.includes('Land'))
      .map((id) => ({
        label: `Return ${def(ctx, id).name}`,
        effects: [
          custom('bounceId', { id }),
          ...(second
            ? []
            : [
                {
                  kind: 'chooseCustom',
                  handler: 'masteryBounce',
                  params: { second: true },
                } as EffectDef,
              ]),
        ],
      }));
    if (options.length === 0) return null;
    return {
      player: opp,
      title: second
        ? 'Return one more nonland permanent (or none)'
        : 'Return up to two nonland permanents',
      options: [{ label: 'Done', effects: [] }, ...options],
    };
  },
  /** Augusta, Dean of Order: tap any number of creatures you control, one at a time. */
  augustaTap(ctx, es) {
    const options = ctx.s.battlefield
      .filter(
        (id) =>
          obj(ctx, id).controller === es.controller &&
          def(ctx, id).types.includes('Creature') &&
          !obj(ctx, id).tapped,
      )
      .map((id) => ({
        label: `Tap ${def(ctx, id).name}`,
        effects: [
          custom('tapId', { id }),
          { kind: 'chooseCustom', handler: 'augustaTap' } as EffectDef,
        ],
      }));
    if (options.length === 0) return null;
    return {
      title: 'Augusta: tap any number of creatures',
      options: [{ label: 'Done', effects: [] }, ...options],
    };
  },
};

export const STX_13C_A_EFFECTS: Record<string, CustomEffect> = {
  /** Silverquill Silencer: the chosen card name. */
  setChosenName(ctx, es, params) {
    const o = es.source && ctx.s.objects[es.source.id];
    if (o && o.zone === 'battlefield') o.chosenName = (params as { defId: string }).defId;
  },
  /** Academic Probation: opponents can't cast spells with the chosen name until your next turn. */
  banName(ctx, es, params) {
    const opp = ctx.s.players[other(es.controller)];
    opp.castBans = [
      ...(opp.castBans ?? []),
      { defId: (params as { defId: string }).defId, until: es.controller },
    ];
  },
  /** Academic Probation: until your next turn it can't attack or block, and its activated abilities can't be activated. */
  academicLock(ctx, es) {
    const id = targetObject(ctx, es, 0);
    if (id === undefined) return;
    ctx.s.effects.push({
      timestamp: newTimestamp(ctx),
      affected: { id, zcc: obj(ctx, id).zcc },
      power: 0,
      toughness: 0,
      keywords: [],
      cantBlock: true,
      cantAttack: true,
      noActivate: true,
      expires: 'untilYourNextTurn',
      player: es.controller,
    });
  },
  /** Deadly Vanity: destroy all creatures and planeswalkers other than the chosen one. */
  deadlyVanity(ctx, _es, params) {
    const keep = (params as { id: ObjectId }).id;
    for (const id of [...ctx.s.battlefield]) {
      if (id === keep) continue;
      const t = def(ctx, id).types;
      if (!t.includes('Creature') && !t.includes('Planeswalker')) continue;
      if (hasKeyword(ctx, id, 'indestructible') || useShield(ctx, id)) continue;
      moveObject(ctx, id, 'graveyard');
    }
  },
  /** Lukka, Wayward Bonder +1. */
  lukkaDiscard(ctx, es, params) {
    const id = (params as { id: ObjectId }).id;
    const o = ctx.s.objects[id];
    if (!o || o.zone !== 'hand') return;
    const creature = def(ctx, id).types.includes('Creature');
    moveObject(ctx, id, 'graveyard');
    for (let i = 0; i < (creature ? 2 : 1); i++) drawCard(ctx, es.controller);
  },
  /** Lukka, Wayward Bonder -2: reanimate with haste, exile it as your next upkeep begins. */
  lukkaReanimate(ctx, es) {
    const id = targetObject(ctx, es, 0);
    if (id === undefined) return;
    const o = obj(ctx, id);
    if (o.zone !== 'graveyard') return;
    moveObject(ctx, id, 'battlefield', { controller: es.controller });
    o.grantedKeywords = [...(o.grantedKeywords ?? []), 'haste'];
    (ctx.s.delayed ??= []).push({
      controller: es.controller,
      sourceDefId: es.sourceDefId,
      subject: { id, zcc: o.zcc },
      effects: [{ kind: 'exile', what: 'subject' }],
      fromTurn: ctx.s.turn.number + 1,
      whose: es.controller,
      at: 'upkeep',
    });
  },
  bounceId(ctx, _es, params) {
    const id = (params as { id: ObjectId }).id;
    const o = ctx.s.objects[id];
    if (o && o.zone === 'battlefield') moveObject(ctx, id, 'hand');
  },
  tapId(ctx, _es, params) {
    const id = (params as { id: ObjectId }).id;
    if (ctx.s.objects[id]?.zone === 'battlefield') tap(ctx, id);
  },
  /** Mercurial Transformation: until end of turn it loses all abilities and is a 1/1 or 4/4 creature. */
  mercurial(ctx, es, params) {
    const id = targetObject(ctx, es, 0);
    if (id === undefined || obj(ctx, id).zone !== 'battlefield') return;
    const o = obj(ctx, id);
    const octopus = !!(params as { octopus?: boolean } | undefined)?.octopus;
    ctx.s.effects.push({
      timestamp: newTimestamp(ctx),
      affected: { id, zcc: o.zcc },
      power: 0,
      toughness: 0,
      keywords: [],
      loseAbilities: true,
      becomesCreature: true,
      basePT: octopus ? [4, 4] : [1, 1],
      expires: 'endOfTurn',
    });
    o.blank = true;
    o.addedSubtypes = [...(o.addedSubtypes ?? []), octopus ? 'Octopus' : 'Frog'];
  },
  /** Lorehold Excavation: mill a card; a land gains you 1 life, otherwise 1 damage to each opponent. */
  loreholdExcavation(ctx, es) {
    const lib = ctx.s.players[es.controller].library;
    const top = lib[0];
    if (top === undefined) return;
    const land = def(ctx, top).types.includes('Land');
    moveObject(ctx, top, 'graveyard');
    if (land) gainLife(ctx, es.controller, 1);
    else
      dealDamage(
        ctx,
        damageSourceFor(ctx, es.source?.id ?? 'unknown', es.controller),
        { player: other(es.controller) },
        1,
        false,
      );
  },
  /** Revel in Silence: your opponents can't cast spells or activate loyalty abilities this turn. */
  revelInSilence(ctx, es) {
    const opp = other(es.controller);
    ctx.s.turn.spellLock = [...(ctx.s.turn.spellLock ?? []), opp];
    ctx.s.turn.noLoyalty = [...(ctx.s.turn.noLoyalty ?? []), opp];
  },
  /**
   * Test of Talents (after the spell is countered): exile every card with the same name from its
   * controller's graveyard, hand and library; they shuffle, then draw a card per card exiled from hand.
   */
  testOfTalents(ctx, es) {
    // The spell has just been countered, so it's in a graveyard under a new zone-change count.
    const t = es.targets[0];
    const spell = t && 'object' in t ? ctx.s.objects[t.object.id] : undefined;
    if (!spell) return;
    const name = spell.defId;
    const p = ctx.s.players[spell.owner];
    const exileAll = (zone: 'graveyard' | 'hand' | 'library') => {
      let n = 0;
      for (const c of [...p[zone]]) {
        if (obj(ctx, c).defId !== name) continue;
        moveObject(ctx, c, 'exile');
        n++;
      }
      return n;
    };
    exileAll('graveyard');
    const fromHand = exileAll('hand');
    exileAll('library');
    shuffleInPlace(ctx.s.rng, p.library);
    emit(ctx, { type: 'shuffled', player: p.id });
    for (let i = 0; i < fromHand; i++) drawCard(ctx, p.id);
  },
  /**
   * Hofri Ghostforge: exile the creature that died; a token copy that is also a Spirit. When the token
   * leaves the battlefield the exiled card returns to its owner's graveyard (see `hofriExiled` in moveObject).
   */
  hofriCopy(ctx, es) {
    const dead = es.subject && ctx.s.objects[es.subject.id];
    if (!dead || dead.zone !== 'graveyard' || dead.zcc !== es.subject!.zcc) return;
    const defId = dead.defId;
    moveObject(ctx, dead.id, 'exile');
    const token = createObject(ctx, defId, es.controller, 'battlefield', true);
    token.addedSubtypes = ['Spirit'];
    token.hofriExiled = { id: dead.id, zcc: dead.zcc };
    ctx.s.battlefield.push(token.id);
    emit(ctx, { type: 'objectMoved', id: token.id, defId, from: null, to: 'battlefield' });
    plusFoodTokens(ctx, es.controller); // Tippy-Toe
  },
  /**
   * Radiant Scrollwielder: exile an instant or sorcery card at random from your graveyard; you may cast it
   * this turn, and if it would be put into your graveyard it is exiled instead.
   */
  scrollwielderExile(ctx, es) {
    const gy = ctx.s.players[es.controller].graveyard.filter((id) => {
      const t = def(ctx, id).types;
      return t.includes('Instant') || t.includes('Sorcery');
    });
    if (gy.length === 0) return;
    const id = gy[nextInt(ctx.s.rng, gy.length)]!;
    moveObject(ctx, id, 'exile');
    const o = obj(ctx, id);
    o.playableUntilTurn = ctx.s.turn.number;
    o.exileInstead = true;
  },
  /** Augusta, Dean of Order: untap each creature you control. */
  untapAllYours(ctx, es) {
    for (const id of ctx.s.battlefield) {
      if (
        obj(ctx, id).controller === es.controller &&
        characteristics(ctx, id).types.includes('Creature')
      )
        untap(ctx, id);
    }
  },
};
