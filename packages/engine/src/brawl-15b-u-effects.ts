import { matchesFilter } from './characteristics.ts';
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
  newTimestamp,
  obj,
  other,
  refOf,
} from './context.ts';
import { manaValue } from './cost.ts';
import { nextInt } from './rng.ts';
import { spellOnStack } from './spells.ts';
import { isTargetLegal } from './targets.ts';
import { type Chooser, CHOOSERS } from './stx-13c-a-effects.ts';
import type { EffectDef, EffectSource, ObjectId, PlayerId } from './types.ts';

/**
 * Strixhaven Brawl (15b, blue): one-off effects of the blue cards of the Brawl
 * decks, as custom effects, plus the choosers behind `chooseCustom` (voting,
 * putting a card from your hand on the bottom of your library).
 */

export const SOC_15B_U_ARMY = 'soc-15b-u-zombie-army';

/** The target's object, if it is still in `zone` (the same object as when it was chosen). */
function targetIn(ctx: Ctx, es: EffectSource, n: number, zone: string): ObjectId | undefined {
  const t = es.targets[n];
  if (!t || !('object' in t)) return undefined;
  const o = ctx.s.objects[t.object.id];
  return o && o.zone === zone && o.zcc === t.object.zcc ? o.id : undefined;
}

/** A token created now on the battlefield under `player`'s control. */
function makeToken(ctx: Ctx, defId: string, player: PlayerId): ObjectId {
  const t = createObject(ctx, defId, player, 'battlefield', true);
  ctx.s.battlefield.push(t.id);
  emit(ctx, { type: 'objectMoved', id: t.id, defId, from: null, to: 'battlefield' });
  return t.id;
}

/** Seek: a random card matching `ok` from your library goes to your hand. */
function seek(ctx: Ctx, player: PlayerId, ok: (id: ObjectId) => boolean): void {
  const options = ctx.s.players[player].library.filter(ok);
  if (options.length === 0) return;
  moveObject(ctx, options[nextInt(ctx.s.rng, options.length)]!, 'hand');
}

/** Counters proliferate shouldn't raise (they only hurt the permanent's controller, or aren't really counters). */
const BAD_COUNTERS = new Set(['finality', 'stun', 'time']);

export const BRAWL_15B_U_EFFECTS: Record<string, CustomEffect> = {
  /** Plot: exile this card from your hand; you may cast it for free on a later turn (at sorcery speed). */
  u15bPlot(ctx, es) {
    const o = es.source && ctx.s.objects[es.source.id];
    if (!o || o.zone !== 'hand' || o.zcc !== es.source!.zcc) return;
    moveObject(ctx, o.id, 'exile');
    o.playFreeBy = es.controller;
    o.plottedTurn = ctx.s.turn.number;
  },

  /** Quicken: the next sorcery spell you cast this turn can be cast as though it had flash. */
  u15bQuicken(ctx, es) {
    const list = ctx.s.turn.sorceryFlash ?? [];
    ctx.s.turn.sorceryFlash = [...list.filter((p) => p !== es.controller), es.controller];
  },

  /** Sea Gate Restoration: you have no maximum hand size for the rest of the game. */
  u15bNoMaxHandSize(ctx, es) {
    ctx.s.players[es.controller].noMaxHandSize = true;
  },

  /** Distant Melody: draw a card for each permanent you control of the creature type chosen for the spell. */
  u15bDrawPerChosenType(ctx, es) {
    const spell = es.source && ctx.s.objects[es.source.id];
    const type = spell?.chosenType;
    if (!type) return;
    let n = 0;
    for (const id of ctx.s.battlefield)
      if (obj(ctx, id).controller === es.controller && matchesFilter(ctx, id, { subtype: type }))
        n++;
    for (let i = 0; i < n; i++) drawCard(ctx, es.controller);
  },

  /** Seek a land card: a random land card from your library into your hand (Bounty of the Deep). */
  u15bSeekLand(ctx, es) {
    seek(ctx, es.controller, (id) => def(ctx, id).types.includes('Land'));
  },

  // Amass Zombies 1 (Lazotep Plating) is the general amass effect now (The Hobbit (20a)), `amass()` in hob-vocab.ts.

  /**
   * Proliferate. Simplification: the engine chooses for you, adding one more of each kind of counter to every permanent
   * you control that has any (not to opponents' permanents or to players).
   */
  u15bProliferate(ctx, es) {
    for (const id of [...ctx.s.battlefield]) {
      const o = obj(ctx, id);
      if (o.controller !== es.controller) continue;
      if (o.plusOneCounters > 0) addCounters(ctx, id, 1);
      for (const [name, n] of Object.entries(o.counters ?? {}))
        if (n > 0 && !BAD_COUNTERS.has(name)) addCounters(ctx, id, 1, name);
    }
  },

  /**
   * Awaken 6 (Part the Waterveil): put six +1/+1 counters on the target land you control; it becomes a 0/0 Elemental
   * creature with haste, and it's still a land.
   */
  u15bAwaken(ctx, es) {
    const id = targetIn(ctx, es, 0, 'battlefield');
    if (id === undefined) return;
    const o = obj(ctx, id);
    ctx.s.effects.push({
      timestamp: newTimestamp(ctx),
      affected: { id, zcc: o.zcc },
      power: 0,
      toughness: 0,
      keywords: ['haste'],
      becomesCreature: true,
      basePT: [0, 0],
      expires: 'permanent',
    });
    o.addedSubtypes = [...(o.addedSubtypes ?? []), 'Elemental'];
    addCounters(ctx, id, 6);
  },

  /** Spell Swindle: create X Treasure tokens, where X is the mana value of the (countered) target spell. */
  u15bSwindleTreasures(ctx, es) {
    const t = es.targets[0];
    if (!t || !('object' in t)) return;
    const o = ctx.s.objects[t.object.id];
    if (!o) return;
    const d = defOf(ctx, o.defId);
    const item = ctx.s.stack.find((x) => x.kind === 'spell' && x.id === o.id);
    const x = o.xPaid ?? (item && item.kind === 'spell' ? (item.x ?? 0) : 0);
    const mv = manaValue(d.manaCost) + (d.manaCost.x ?? 0) * x;
    for (let i = 0; i < mv; i++) makeToken(ctx, 'treasure-token', es.controller);
  },

  /**
   * Hydroelectric Specimen: change the target of the target instant or sorcery spell, if it has a single target,
   * to this creature (if that is a legal target for it).
   */
  u15bRetarget(ctx, es) {
    const t = es.targets[0];
    const me = es.source && ctx.s.objects[es.source.id];
    if (!t || !('object' in t) || !me || me.zone !== 'battlefield') return;
    const item = ctx.s.stack.find((x) => x.kind === 'spell' && x.id === t.object.id);
    if (!item || item.kind !== 'spell' || item.targets.length !== 1) return;
    const spec = spellOnStack(defOf(ctx, obj(ctx, item.id).defId), item)?.targets[0];
    if (!spec) return;
    const choice = { object: refOf(me) };
    if (!isTargetLegal(ctx, spec, choice, { controller: item.controller, sourceId: item.id }))
      return;
    item.targets = [choice];
  },

  /**
   * Better Offer (Alchemy): put a random creature card with mana value X or less from the target opponent's library
   * onto the battlefield under your control. It perpetually has base power and toughness X/X, and gains ward {1}
   * (the ward only while it stays on the battlefield).
   */
  u15bBetterOffer(ctx, es) {
    const x = es.x ?? 0;
    const t = es.targets[0];
    const opp: PlayerId = t && 'player' in t ? t.player : other(es.controller);
    const options = ctx.s.players[opp].library.filter(
      (id) => def(ctx, id).types.includes('Creature') && manaValue(def(ctx, id).manaCost) <= x,
    );
    if (options.length === 0) return;
    const card = options[nextInt(ctx.s.rng, options.length)]!;
    moveObject(ctx, card, 'battlefield', { controller: es.controller });
    const o = obj(ctx, card);
    o.copyPT = { power: x, toughness: x };
    o.grantedKeywords = [...(o.grantedKeywords ?? []), 'wardOne'];
  },

  /**
   * Housemeld (Alchemy): exile the target creature. The exiled card perpetually becomes an enchantment (loses its
   * other card types). At the beginning of your next end step, put it onto the battlefield under your control.
   */
  u15bHousemeld(ctx, es) {
    const id = targetIn(ctx, es, 0, 'battlefield');
    if (id === undefined) return;
    const was = obj(ctx, id);
    const isToken = was.isToken;
    moveObject(ctx, id, 'exile');
    if (isToken) return;
    const o = obj(ctx, id);
    if (o.zone !== 'exile') return;
    o.perpetualTypes = ['Enchantment'];
    const step = ctx.s.turn.step;
    (ctx.s.delayed ??= []).push({
      controller: es.controller,
      sourceDefId: es.sourceDefId,
      subject: { id, zcc: o.zcc },
      effects: [{ kind: 'custom', handler: 'u15bHousemeldReturn' }],
      fromTurn: ctx.s.turn.number + (step === 'end' || step === 'cleanup' ? 1 : 0),
      whose: es.controller,
    });
  },
  u15bHousemeldReturn(ctx, es) {
    const ref = es.subject;
    const o = ref && ctx.s.objects[ref.id];
    if (!o || o.zone !== 'exile' || o.zcc !== ref.zcc) return;
    moveObject(ctx, o.id, 'battlefield', { controller: es.controller });
  },

  /** Ingenious Prodigy: remove a +1/+1 counter from it; if you do, draw a card. */
  u15bProdigyDraw(ctx, es) {
    const o = es.source && ctx.s.objects[es.source.id];
    if (!o || o.zone !== 'battlefield' || o.zcc !== es.source!.zcc || o.plusOneCounters < 1) return;
    o.plusOneCounters--;
    drawCard(ctx, es.controller);
  },

  /** Seek New Knowledge: put the chosen card from your hand on the bottom of your library. */
  u15bBottomFromHand(ctx, es, params) {
    const id = (params as { id: ObjectId }).id;
    const o = ctx.s.objects[id];
    if (!o || o.zone !== 'hand') return;
    moveObject(ctx, id, 'library', { position: 'bottom' });
  },

  /**
   * Expropriate, after both votes: each time vote is an extra turn for you; each of your own money votes returns a
   * permanent you own that an opponent controls.
   */
  u15bVoteApply(ctx, es, params) {
    const votes = (params as { votes: ('time' | 'money')[] }).votes;
    const times = votes.filter((v) => v === 'time').length;
    for (let i = 0; i < times; i++)
      ctx.s.extraTurns = [{ player: es.controller }, ...(ctx.s.extraTurns ?? [])];
    // Your own money vote: choose a permanent you own (and take control of it).
    if (votes[0] === 'money') {
      const mine = ctx.s.battlefield.filter(
        (id) => obj(ctx, id).owner === es.controller && obj(ctx, id).controller !== es.controller,
      );
      const best = mine.sort(
        (a, b) => manaValue(def(ctx, b).manaCost) - manaValue(def(ctx, a).manaCost),
      )[0];
      if (best !== undefined) takeControl(ctx, best, es.controller);
    }
  },
  /** Expropriate: gain control of the chosen permanent (the voter's own pick). */
  u15bTakeControl(ctx, es, params) {
    const id = (params as { id: ObjectId }).id;
    const o = ctx.s.objects[id];
    if (!o || o.zone !== 'battlefield') return;
    takeControl(ctx, id, es.controller);
  },
};

function takeControl(ctx: Ctx, id: ObjectId, player: PlayerId): void {
  const o = obj(ctx, id);
  if (o.controller === player) return;
  o.controller = player;
  o.summoningSick = true;
}

type Vote = 'time' | 'money';

const BRAWL_15B_U_CHOOSERS: Record<string, Chooser> = {
  /** Seek New Knowledge: "put a card from your hand on the bottom of your library". */
  u15bBottomFromHand(ctx, es) {
    const hand = ctx.s.players[es.controller].hand;
    if (hand.length === 0) return null;
    return {
      title: 'Put a card from your hand on the bottom of your library',
      options: hand.map((id) => ({
        label: def(ctx, id).name,
        effects: [{ kind: 'custom', handler: 'u15bBottomFromHand', params: { id } }],
      })),
    };
  },
  /** Expropriate (council's dilemma): you vote first, then your opponent. */
  u15bVote(ctx, es, params) {
    const p = params as { stage: 0 | 1; votes: Vote[] };
    const voter: PlayerId = p.stage === 0 ? es.controller : other(es.controller);
    const label: Record<Vote, string> = {
      time: 'Time: the caster takes an extra turn',
      money: 'Money: the caster gains control of a permanent you own',
    };
    const options = (['time', 'money'] as const).map((v) => {
      const votes = [...p.votes, v];
      const effects: EffectDef[] =
        p.stage === 0
          ? [{ kind: 'chooseCustom', handler: 'u15bVote', params: { stage: 1, votes } }]
          : [
              { kind: 'custom', handler: 'u15bVoteApply', params: { votes } },
              ...(v === 'money'
                ? ([{ kind: 'chooseCustom', handler: 'u15bPick', params: {} }] as EffectDef[])
                : []),
            ];
      return { label: label[v], effects };
    });
    return { player: voter, title: 'Expropriate: vote for time or money', options };
  },
  /** Expropriate, opponent's money vote: they choose which of their permanents the caster gains control of. */
  u15bPick(ctx, es) {
    const opp = other(es.controller);
    const mine = ctx.s.battlefield.filter((id) => obj(ctx, id).owner === opp);
    if (mine.length === 0) return null;
    return {
      player: opp,
      title: 'Expropriate: choose a permanent you own; its caster gains control of it',
      options: mine.map((id) => ({
        label: def(ctx, id).name,
        effects: [{ kind: 'custom', handler: 'u15bTakeControl', params: { id } }],
      })),
    };
  },
};
Object.assign(CHOOSERS, BRAWL_15B_U_CHOOSERS);
