import { tokenMultiplier } from './brawl-15a-w-effects.ts';
import {
  type Ctx,
  type CustomEffect,
  createObject,
  def,
  emit,
  moveObject,
  obj,
} from './context.ts';
import { findSpell } from './effects.ts';
import { nextInt } from './rng.ts';
import { spellOnStack } from './spells.ts';
import { type Chooser, CHOOSERS } from './stx-13c-a-effects.ts';
import { targetCombos } from './targets.ts';
import type { EffectDef, ObjectId, ObjectRef, PlayerId, TargetChoice } from './types.ts';

/**
 * Strixhaven Brawl (15b, red and blue-red): one-offs of the Izzet and red cards,
 * as custom effects, and the choosers behind `chooseCustom`.
 */

/** The 0/1 Eldrazi Spawn Glimpse the Impossible makes (defined in cards-15b-r.ts). */
const ELDRAZI_SPAWN = 'soc-15b-r-eldrazi-spawn-token';

const isInstantOrSorcery = (ctx: Ctx, id: ObjectId) => {
  const t = def(ctx, id).types;
  return t.includes('Instant') || t.includes('Sorcery');
};

function makeTokens(ctx: Ctx, owner: PlayerId, token: string, count: number): void {
  for (let i = 0; i < count * tokenMultiplier(ctx, owner); i++) {
    const t = createObject(ctx, token, owner, 'battlefield', true);
    ctx.s.battlefield.push(t.id);
    emit(ctx, { type: 'objectMoved', id: t.id, defId: t.defId, from: null, to: 'battlefield' });
  }
}

/** "You may cast it without paying its mana cost" for each card, in order; it returns to exile if it would go to the graveyard. */
const castEach = (ctx: Ctx, ids: ObjectId[]): EffectDef[] =>
  ids.map((id) => ({
    kind: 'castFreeCard',
    card: { id, zcc: obj(ctx, id).zcc },
    exileAfter: true,
  }));

export const BRAWL_15B_R_EFFECTS: Record<string, CustomEffect> = {
  /**
   * Glimpse the Impossible: exile the top three cards, playable this turn; at the next end step the ones
   * still exiled go to your graveyard (see glimpseCleanup).
   */
  glimpseExile(ctx, es) {
    const cards: ObjectRef[] = [];
    for (const id of ctx.s.players[es.controller].library.slice(0, 3)) {
      moveObject(ctx, id, 'exile');
      obj(ctx, id).playableUntilTurn = ctx.s.turn.number;
      cards.push({ id, zcc: obj(ctx, id).zcc });
    }
    if (cards.length === 0) return;
    (ctx.s.delayed ??= []).push({
      controller: es.controller,
      sourceDefId: es.sourceDefId,
      subject: es.source ?? cards[0]!,
      effects: [{ kind: 'custom', handler: 'glimpseCleanup', params: { cards } }],
      fromTurn: ctx.s.turn.number,
    });
  },
  /** Glimpse the Impossible: put the cards still exiled into your graveyard, then a 0/1 Eldrazi Spawn for each. */
  glimpseCleanup(ctx, es, params) {
    let n = 0;
    for (const c of (params as { cards: ObjectRef[] }).cards) {
      const o = ctx.s.objects[c.id];
      if (!o || o.zone !== 'exile' || o.zcc !== c.zcc) continue;
      moveObject(ctx, c.id, 'graveyard');
      n++;
    }
    if (n > 0) makeTokens(ctx, es.controller, ELDRAZI_SPAWN, n);
  },
  /** Sapphire Collector: conjure a card named Mox Sapphire into your hand. */
  conjureMoxSapphire(ctx, es) {
    const o = createObject(ctx, 'mox-sapphire', es.controller, 'hand');
    ctx.s.players[es.controller].hand.push(o.id);
    emit(ctx, { type: 'objectMoved', id: o.id, defId: o.defId, from: null, to: 'hand' });
  },
  /** Illuminating Lash: a one-time boon, "When you cast a noncreature spell, draw a card." */
  lashBoon(ctx, es) {
    (ctx.s.emblems ??= []).push({
      controller: es.controller,
      source: es.source ?? { id: 'emblem', zcc: 0 },
      sourceDefId: es.sourceDefId,
      ability: {
        kind: 'triggered',
        trigger: { on: 'castSpell', filter: 'noncreature' },
        targets: [],
        effects: [{ kind: 'draw', who: 'controller', amount: 1 }],
      },
      once: true,
    });
  },
  /** Return the Favor: the spell's target changes to the chosen one. */
  retargetSpell(ctx, _es, params) {
    const { spell, targets } = params as { spell: ObjectId; targets: TargetChoice[] };
    const item = findSpell(ctx, spell);
    if (item) item.targets = targets;
  },
};

const describe = (ctx: Ctx, t: TargetChoice): string =>
  'player' in t ? `Player ${t.player === 'p1' ? '1' : '2'}` : def(ctx, t.object.id).name;

const BRAWL_15B_R_CHOOSERS: Record<string, Chooser> = {
  /** Return the Favor: choose a new target for the targeted spell if it has exactly one target. */
  changeTarget(ctx, es) {
    const t = es.targets[0];
    const item = t && 'object' in t ? findSpell(ctx, t.object.id) : undefined;
    if (!item || item.targets.length !== 1) return null;
    const spec = spellOnStack(def(ctx, item.id), item)?.targets ?? [];
    const current = JSON.stringify(item.targets);
    const options = targetCombos(ctx, spec, { controller: item.controller, sourceId: item.id })
      .filter((c) => c.length === 1 && JSON.stringify(c) !== current)
      .map((targets) => ({
        label: `Change the target to ${describe(ctx, targets[0]!)}`,
        effects: [
          {
            kind: 'custom',
            handler: 'retargetSpell',
            params: { spell: item.id, targets },
          } as EffectDef,
        ],
      }));
    if (options.length === 0) return null;
    options.push({ label: 'Keep the target', effects: [] });
    return { title: `Return the Favor: change the target of ${def(ctx, item.id).name}?`, options };
  },
  /**
   * Mizzix's Mastery: exile the target instant or sorcery card from your graveyard (overload: each one),
   * then you may cast a copy of each without paying its mana cost. Simplified: the card itself is cast
   * and goes back to exile, as the copy would leave it.
   */
  mizzixMastery(ctx, es, params) {
    const gy = ctx.s.players[es.controller].graveyard;
    const t = es.targets[0];
    const ids = (params as { overload?: boolean } | undefined)?.overload
      ? gy.filter((id) => isInstantOrSorcery(ctx, id))
      : t &&
          'object' in t &&
          gy.includes(t.object.id) &&
          ctx.s.objects[t.object.id]!.zcc === t.object.zcc
        ? [t.object.id]
        : [];
    for (const id of ids) moveObject(ctx, id, 'exile');
    const cards = ids.filter((id) => ctx.s.objects[id]?.zone === 'exile');
    if (cards.length === 0) return null;
    return {
      title: "Mizzix's Mastery: cast copies of the exiled cards without paying their mana costs?",
      options: [
        { label: 'Cast them (you may decline each)', effects: castEach(ctx, cards) },
        { label: "Don't cast any", effects: [] },
      ],
    };
  },
  /**
   * Arcane Bombardment: exile an instant or sorcery card at random from your graveyard (remembered by the
   * enchantment), then you may cast copies of each card exiled with it without paying their mana costs.
   */
  arcaneBombardment(ctx, es) {
    const self = es.source && ctx.s.objects[es.source.id];
    if (!self) return null;
    const gy = ctx.s.players[es.controller].graveyard.filter((id) => isInstantOrSorcery(ctx, id));
    if (gy.length > 0) {
      const pick = gy[nextInt(ctx.s.rng, gy.length)]!;
      moveObject(ctx, pick, 'exile');
      self.exiledWith = [...(self.exiledWith ?? []), pick];
    }
    const cards = (self.exiledWith ?? []).filter(
      (id) => ctx.s.objects[id]?.zone === 'exile' && isInstantOrSorcery(ctx, id),
    );
    if (cards.length === 0) return null;
    return {
      title: 'Arcane Bombardment: cast copies of the exiled cards without paying their mana costs?',
      options: [
        { label: 'Cast them (you may decline each)', effects: castEach(ctx, cards) },
        { label: "Don't cast any", effects: [] },
      ],
    };
  },
};
Object.assign(CHOOSERS, BRAWL_15B_R_CHOOSERS);
