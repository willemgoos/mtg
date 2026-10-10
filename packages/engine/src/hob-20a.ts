import { characteristics, hasSubtype, isCreature, power, toughness } from './characteristics.ts';
import { type Ctx, def, emit, makeCtx, obj } from './context.ts';
import { defsWithStatic } from './ecl-multi-b-effects.ts';
import { checkCondition } from './triggers.ts';
import type { CardDb, EffectDef, EffectSource, GameState, ObjectId, PlayerId } from './types.ts';
import { PLAYERS } from './types.ts';

/**
 * The Hobbit (20a): amass, recruit and Storied (the enduring story). Engine helpers; the card vocabulary is in types.ts
 * (search "The Hobbit (20a)") and the card builders in packages/cards/src/hob-vocab.ts.
 */

// ---------------------------------------------------------------------------
// Amass
// ---------------------------------------------------------------------------

/** Army creatures `player` controls (changelings and Army-granting effects count). */
export function armiesOf(ctx: Ctx, player: PlayerId): ObjectId[] {
  return ctx.s.battlefield.filter(
    (id) =>
      obj(ctx, id).controller === player && isCreature(ctx, id) && hasSubtype(ctx, id, 'Army'),
  );
}

/**
 * "`player` amasses <subtype> N" (rule 701.47). Steps: no Army, a token first (and then the step runs again); one Army, it gets
 * the counters; several Armies, the amassing player chooses (a `chooseOption` prompt naming each by size).
 */
export function amassStep(
  ctx: Ctx,
  es: EffectSource,
  e: Extract<EffectDef, { kind: 'amass' }>,
  player: PlayerId,
  n: number,
): EffectDef[] {
  const armies = armiesOf(ctx, player);
  const put = (army: ObjectId): EffectDef => ({
    kind: 'amassPut',
    army,
    subtype: e.subtype,
    amount: n,
    player,
  });
  if (armies.length === 0) {
    // The token was made and is gone again (nothing to put the counters on): done.
    if (e.tokenMade) return [];
    return [
      {
        kind: 'createToken',
        token: e.token,
        count: 1,
        ...(player !== es.controller ? { forOpponent: true } : {}),
      },
      { ...e, tokenMade: true },
    ];
  }
  if (armies.length === 1) return [put(armies[0]!)];
  return [
    {
      kind: 'choose',
      title: `Amass ${e.subtype}s ${n}: choose an Army`,
      ...(player !== es.controller ? { opponent: true } : {}),
      options: armies.map((id) => ({
        label: `${def(ctx, id).name} (${power(ctx, id)}/${toughness(ctx, id)})`,
        effects: [put(id)],
      })),
    },
  ];
}

/** The chosen Army gets its counters and becomes the type (for good), and is "the amassed Army" for the effects after. */
export function amassPut(
  ctx: Ctx,
  es: EffectSource,
  e: Extract<EffectDef, { kind: 'amassPut' }>,
  addCounters: (id: ObjectId, n: number, by: PlayerId) => void,
): void {
  const o = ctx.s.objects[e.army];
  if (!o || o.zone !== 'battlefield') return;
  if (!hasSubtype(ctx, e.army, e.subtype))
    o.addedSubtypes = [...(o.addedSubtypes ?? []), e.subtype];
  addCounters(e.army, e.amount, e.player);
  es.chosen = { id: o.id, zcc: o.zcc };
  emit(ctx, {
    type: 'amassed',
    player: e.player,
    id: o.id,
    subtype: e.subtype,
    amount: e.amount,
  });
}

// ---------------------------------------------------------------------------
// Recruit
// ---------------------------------------------------------------------------

/** "Recruit": draw a card, then discard a card; a nonland card discarded makes a 1/1 white Human Soldier. */
export function recruitSteps(e: Extract<EffectDef, { kind: 'recruit' }>): EffectDef[] {
  return [
    { kind: 'draw', who: 'controller', amount: 1 },
    {
      kind: 'discard',
      count: 1,
      thenIfNonland: [
        { kind: 'createToken', token: e.token ?? 'hob-human-soldier-token', count: 1 },
      ],
    },
  ];
}

// ---------------------------------------------------------------------------
// Storied and the enduring story
// ---------------------------------------------------------------------------

/** Guard: counting artifacts looks at characteristics, which may read an enduring-story condition. */
let counting = false;

/** Does this permanent count toward "three or more artifacts, legendaries, and/or Sagas"? */
function isStoryPermanent(ctx: Ctx, id: ObjectId): boolean {
  const d = def(ctx, id);
  const o = obj(ctx, id);
  if (d.types.includes('Artifact')) return true;
  if (d.supertypes.includes('Legendary') && !o.nonlegendary) return true;
  if (d.subtypes.includes('Saga') || o.addedSubtypes?.includes('Saga')) return true;
  if (counting) return false;
  // Effects that make it an artifact (Stone by Sunlight) or a Saga.
  counting = true;
  try {
    const ch = characteristics(ctx, id);
    return ch.types.includes('Artifact') || ch.subtypes.includes('Saga');
  } finally {
    counting = false;
  }
}

/** Does `player` control a permanent with Storied? */
function controlsStoried(ctx: Ctx, player: PlayerId): boolean {
  // Most games have no Storied card at all: no scan of the battlefield then.
  if (defsWithStatic(ctx.db, 'storied').size === 0) return false;
  return ctx.s.battlefield.some(
    (id) =>
      obj(ctx, id).controller === player &&
      def(ctx, id).abilities.some((a) => a.kind === 'static' && a.effect.kind === 'storied'),
  );
}

/**
 * Would `player` get an enduring story right now: a Storied permanent on the battlefield, and three different permanents they
 * control that are artifacts, legendary and/or Sagas? (Without a Storied permanent, three of them earn nothing.)
 */
export function storiedSatisfied(ctx: Ctx, player: PlayerId): boolean {
  if (!controlsStoried(ctx, player)) return false;
  let n = 0;
  for (const id of ctx.s.battlefield)
    if (obj(ctx, id).controller === player && isStoryPermanent(ctx, id) && ++n >= 3) return true;
  return false;
}

/**
 * Does `player` have an enduring story? The designation, or (before the state-based check has recorded it) the situation that
 * gives it. Reading never changes the game: `updateEnduringStory` records it.
 */
export function hasEnduringStory(ctx: Ctx, player: PlayerId): boolean {
  return !!ctx.s.players[player].enduringStory || storiedSatisfied(ctx, player);
}

/**
 * Where `player` stands on the enduring story, for the bots' evaluation: `has` the designation (or the situation that gives it),
 * a Storied permanent is `storied` on their battlefield, and how many of the three permanents (`count`, at most 3) they control.
 */
export function storyProgress(
  s: GameState,
  db: CardDb,
  player: PlayerId,
): { has: boolean; storied: boolean; count: number } {
  if (s.players[player].enduringStory) return { has: true, storied: false, count: 3 };
  if (defsWithStatic(db, 'storied').size === 0) return { has: false, storied: false, count: 0 };
  const ctx = makeCtx(s, db);
  const storied = controlsStoried(ctx, player);
  if (!storied) return { has: false, storied: false, count: 0 };
  const has = storiedSatisfied(ctx, player);
  let count = 0;
  for (const id of s.battlefield)
    if (ctx.s.objects[id]?.controller === player && isStoryPermanent(ctx, id)) count++;
  return { has, storied, count: Math.min(count, 3) };
}

/**
 * The Storied static, checked whenever state-based actions are (it isn't a trigger and doesn't use the stack, so it happens
 * before a third permanent that leaves right away, to the legend rule or to toughness 0, is gone). The designation is permanent.
 */
export function updateEnduringStory(ctx: Ctx): boolean {
  let changed = false;
  for (const p of PLAYERS) {
    const ps = ctx.s.players[p];
    if (ps.enduringStory || !storiedSatisfied(ctx, p)) continue;
    ps.enduringStory = true;
    emit(ctx, { type: 'enduringStory', player: p });
    changed = true;
  }
  return changed;
}

// ---------------------------------------------------------------------------
// Bifur, Melodic Rider: a Dwarf's triggered abilities trigger an additional time
// ---------------------------------------------------------------------------

/**
 * How many additional times a triggered ability of `o` (a permanent, or what it was as it left) triggers: one for each
 * 'subtypeTriggersTwice' static its controller has whose subtype `o` has and whose condition holds.
 */
export function subtypeTriggerCopies(
  ctx: Ctx,
  o: { id: ObjectId; defId: string; controller: PlayerId },
): number {
  if (defsWithStatic(ctx.db, 'subtypeTriggersTwice').size === 0) return 0;
  let n = 0;
  for (const id of ctx.s.battlefield) {
    const src = obj(ctx, id);
    if (src.controller !== o.controller) continue;
    for (const a of def(ctx, id).abilities) {
      if (a.kind !== 'static' || a.effect.kind !== 'subtypeTriggersTwice') continue;
      if (!checkCondition(ctx, a.effect.condition, src.controller, src)) continue;
      const live = ctx.s.objects[o.id];
      const has =
        live && live.zone === 'battlefield' && live.defId === o.defId
          ? hasSubtype(ctx, o.id, a.effect.subtype)
          : !!ctx.db.get(o.defId)?.subtypes.includes(a.effect.subtype) ||
            !!ctx.db.get(o.defId)?.keywords.includes('changeling');
      if (has) n++;
    }
  }
  return n;
}
