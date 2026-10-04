import { characteristics, matchesFilter } from './characteristics.ts';
import {
  type Ctx,
  type CustomEffect,
  addCounters,
  createObject,
  def,
  drawCard,
  emit,
  moveObject,
  obj,
  sacrifice,
} from './context.ts';
import { damageSourceFor, dealDamage, gainLife } from './effects.ts';
import { shuffleLibrary } from './setup.ts';
import { type Chooser, CHOOSERS } from './stx-13c-a-effects.ts';
import { manaValue } from './cost.ts';
import type { EffectDef, ManaType, ObjectId, PlayerId } from './types.ts';

/**
 * Strixhaven Brawl (15b, green): one-offs of the green cards of the other seven
 * Brawl decks, as custom effects, and the choosers behind `chooseCustom`.
 */

/** Incubation Druid: the types of mana the lands `player` controls could make (colourless counts). */
export function yourLandColors(ctx: Ctx, player: PlayerId): ManaType[] {
  const out = new Set<ManaType>();
  for (const id of ctx.s.battlefield) {
    if (obj(ctx, id).controller !== player) continue;
    const d = def(ctx, id);
    if (!d.types.includes('Land')) continue;
    for (const a of d.abilities) {
      if (a.kind !== 'mana' || a.colorFrom === 'yourLands') continue;
      out.add(a.produces);
    }
  }
  return [...out];
}

const custom = (handler: string, params?: Record<string, unknown>): EffectDef => ({
  kind: 'custom',
  handler,
  ...(params ? { params } : {}),
});

/** Counters that proliferate shouldn't pick for you (your own stun counters). */
const BAD_COUNTERS = new Set(['stun']);

/** Puts a conjured card (not a token) onto the battlefield under `player`'s control. */
function conjureToBattlefield(ctx: Ctx, defId: string, player: PlayerId): ObjectId {
  const o = createObject(ctx, defId, player, 'battlefield');
  ctx.s.battlefield.push(o.id);
  emit(ctx, { type: 'objectMoved', id: o.id, defId: o.defId, from: null, to: 'battlefield' });
  return o.id;
}

export const BRAWL_15B_G_EFFECTS: Record<string, CustomEffect> = {
  /** Adapt N: if it has no +1/+1 counters, put N on it. */
  adapt(ctx, es, params) {
    const self = es.source && ctx.s.objects[es.source.id];
    if (!self || self.zone !== 'battlefield' || self.plusOneCounters > 0) return;
    addCounters(ctx, self.id, (params as { n: number }).n);
  },

  /**
   * Proliferate. Simplified: every permanent you control with a counter gets another of each kind (you never
   * choose opponents' permanents or players).
   */
  proliferate(ctx, es) {
    for (const id of [...ctx.s.battlefield]) {
      const o = obj(ctx, id);
      if (o.controller !== es.controller) continue;
      if (o.plusOneCounters > 0) addCounters(ctx, id, 1);
      for (const [name, n] of Object.entries(o.counters ?? {}))
        if (n > 0 && !BAD_COUNTERS.has(name)) addCounters(ctx, id, 1, name);
    }
  },

  /** Warp: cast for its warp cost, it's exiled at the beginning of the next end step, and may be cast from exile later. */
  warpSchedule(ctx, es) {
    const self = es.source && ctx.s.objects[es.source.id];
    if (!self || self.zone !== 'battlefield') return;
    (ctx.s.delayed ??= []).push({
      controller: es.controller,
      sourceDefId: es.sourceDefId,
      subject: { id: self.id, zcc: self.zcc },
      effects: [custom('warpToExile')],
      fromTurn: ctx.s.turn.number,
    });
  },
  warpToExile(ctx, es) {
    const self = es.source && ctx.s.objects[es.source.id];
    if (!self || self.zone !== 'battlefield' || self.zcc !== es.source!.zcc) return;
    moveObject(ctx, self.id, 'exile');
    self.playableUntilTurn = Number.MAX_SAFE_INTEGER;
  },

  /** Disciple of Freyalise: sacrifice the chosen creature, then gain X life and draw X cards (X is its power). */
  discipleGo(ctx, es, params) {
    const id = (params as { id: ObjectId }).id;
    const o = ctx.s.objects[id];
    if (!o || o.zone !== 'battlefield' || o.controller !== es.controller) return;
    const x = Math.max(0, characteristics(ctx, id).power);
    sacrifice(ctx, id);
    if (x <= 0) return;
    gainLife(ctx, es.controller, x);
    for (let i = 0; i < x; i++) drawCard(ctx, es.controller);
  },

  /** Signature Slam: each modified creature you control deals damage equal to its power to the second target. */
  signatureSlam(ctx, es) {
    const t = es.targets[1];
    if (!t || !('object' in t)) return;
    const victim = ctx.s.objects[t.object.id];
    if (!victim || victim.zone !== 'battlefield' || victim.zcc !== t.object.zcc) return;
    for (const id of [...ctx.s.battlefield]) {
      const o = obj(ctx, id);
      if (o.controller !== es.controller || !def(ctx, id).types.includes('Creature')) continue;
      if (!matchesFilter(ctx, id, { modified: true })) continue;
      const power = characteristics(ctx, id).power;
      dealDamage(
        ctx,
        damageSourceFor(ctx, id, es.controller),
        { object: { id: victim.id, zcc: victim.zcc } },
        power,
        false,
      );
    }
  },

  /** Conjure `count` (default 1) cards named `defId` onto the battlefield. */
  conjureOnBattlefield(ctx, es, params) {
    const p = params as { defId: string; count?: number };
    for (let i = 0; i < (p.count ?? 1); i++) conjureToBattlefield(ctx, p.defId, es.controller);
  },

  /** Explore: you may play an additional land this turn. */
  extraLandThisTurn(ctx, es) {
    ctx.s.players[es.controller].landsPlayedThisTurn -= 1;
  },

  /** The Hunger Tide Rises IV: sacrifice the chosen creature. */
  hungerSacrifice(ctx, es, params) {
    const id = (params as { id: ObjectId }).id;
    const o = ctx.s.objects[id];
    if (!o || o.zone !== 'battlefield' || o.controller !== es.controller) return;
    sacrifice(ctx, id);
  },
  /** The Hunger Tide Rises IV: put the chosen creature card onto the battlefield (shuffle if it came from the library). */
  hungerPut(ctx, es, params) {
    const p = params as { id: ObjectId; fromLibrary: boolean };
    const o = ctx.s.objects[p.id];
    if (!o) return;
    const zone = p.fromLibrary ? 'library' : 'graveyard';
    if (o.zone === zone) moveObject(ctx, p.id, 'battlefield', { controller: es.controller });
    if (p.fromLibrary) shuffleLibrary(ctx, es.controller);
  },
};

const GATES = [
  ['gate-to-the-citadel', 'Gate to the Citadel'],
  ['gate-to-seatower', 'Gate to Seatower'],
  ['gate-of-the-black-dragon', 'Gate of the Black Dragon'],
  ['gate-to-tumbledown', 'Gate to Tumbledown'],
  ['gate-to-manorborn', 'Gate to Manorborn'],
] as const;

const BRAWL_15B_G_CHOOSERS: Record<string, Chooser> = {
  /** Disciple of Freyalise: "you may sacrifice another creature. If you do, ...". */
  discipleSacrifice(ctx, es) {
    const options: { label: string; effects: EffectDef[] }[] = ctx.s.battlefield
      .filter(
        (id) =>
          obj(ctx, id).controller === es.controller &&
          def(ctx, id).types.includes('Creature') &&
          id !== es.source?.id,
      )
      .map((id) => ({
        label: `Sacrifice ${def(ctx, id).name} (power ${characteristics(ctx, id).power})`,
        effects: [custom('discipleGo', { id })],
      }));
    if (options.length === 0) return null;
    options.push({ label: "Don't sacrifice", effects: [] });
    return { title: 'Disciple of Freyalise: sacrifice another creature?', options };
  },

  /** Follow the Tracks: choose a card from its spellbook (the five Gates). */
  followTheTracks() {
    return {
      title: "Follow the Tracks's spellbook",
      options: GATES.map(([defId, name]) => ({
        label: name,
        effects: [custom('conjureOnBattlefield', { defId })],
      })),
    };
  },

  /** The Hunger Tide Rises IV: sacrifice any number of creatures, one at a time. */
  hungerSacrifice(ctx, es, params) {
    const n = (params as { n?: number } | undefined)?.n ?? 0;
    const options: { label: string; effects: EffectDef[] }[] = ctx.s.battlefield
      .filter(
        (id) =>
          obj(ctx, id).controller === es.controller && def(ctx, id).types.includes('Creature'),
      )
      .map((id) => ({
        label: `Sacrifice ${def(ctx, id).name}`,
        effects: [
          custom('hungerSacrifice', { id }),
          { kind: 'chooseCustom', handler: 'hungerSacrifice', params: { n: n + 1 } } as EffectDef,
        ],
      }));
    return {
      title: `The Hunger Tide Rises: sacrifice any number of creatures (${n} so far)`,
      options: [
        {
          label: n === 0 ? 'Sacrifice none' : 'Done sacrificing',
          effects: [{ kind: 'chooseCustom', handler: 'hungerSearch', params: { n } }],
        },
        ...options,
      ],
    };
  },

  /** The Hunger Tide Rises IV: a creature card with mana value at most `n` from your library or graveyard. */
  hungerSearch(ctx, es, params) {
    const n = (params as { n: number }).n;
    const ps = ctx.s.players[es.controller];
    const fits = (id: ObjectId) =>
      def(ctx, id).types.includes('Creature') && manaValue(def(ctx, id).manaCost) <= n;
    const options: { label: string; effects: EffectDef[] }[] = ps.graveyard
      .filter(fits)
      .map((id) => ({
        label: `${def(ctx, id).name} (graveyard)`,
        effects: [custom('hungerPut', { id, fromLibrary: false })],
      }));
    const seen = new Set<string>();
    for (const id of ps.library) {
      if (!fits(id) || seen.has(obj(ctx, id).defId)) continue;
      seen.add(obj(ctx, id).defId);
      options.push({
        label: `${def(ctx, id).name} (library)`,
        effects: [custom('hungerPut', { id, fromLibrary: true })],
      });
    }
    if (options.length === 0) return null;
    options.push({ label: 'Find nothing', effects: [] });
    return {
      title: `Put a creature card with mana value ${n} or less onto the battlefield`,
      options,
    };
  },
};
Object.assign(CHOOSERS, BRAWL_15B_G_CHOOSERS);
