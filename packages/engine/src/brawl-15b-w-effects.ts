import { creaturesOnBattlefield, hasKeyword, power, toughness } from './characteristics.ts';
import {
  type Ctx,
  type CustomEffect,
  createObject,
  def,
  emit,
  moveObject,
  newTimestamp,
  obj,
  other,
} from './context.ts';
import { tokenMultiplier } from './brawl-15a-w-effects.ts';
import { type Chooser, CHOOSERS } from './stx-13c-a-effects.ts';
import type { Color, EffectDef, ObjectId, PlayerId, TargetChoice } from './types.ts';

/**
 * Strixhaven Brawl (15b, white): one-off effects for the white cards of the other Brawl decks
 * (protection from a colour, populate, Roles, Rooms, Divine Reckoning) as custom effects and
 * choosers, plus small helpers the engine core calls.
 */

export const SORCERER_ROLE = 'soc-15b-w-sorcerer-role';

const COLOR_NAMES: Record<Color, string> = {
  W: 'White',
  U: 'Blue',
  B: 'Black',
  R: 'Red',
  G: 'Green',
};

const custom = (handler: string, params?: Record<string, unknown>): EffectDef => ({
  kind: 'custom',
  handler,
  ...(params ? { params } : {}),
});

/** Protection from a colour (Alseid of Life's Bounty): is `targetId` protected from the source `sourceId`? */
export function protectedFrom(ctx: Ctx, targetId: ObjectId, sourceId: ObjectId): boolean {
  const target = ctx.s.objects[targetId];
  const source = ctx.s.objects[sourceId];
  if (!target || !source || ctx.s.effects.length === 0) return false;
  const colors = def(ctx, sourceId).colors;
  return ctx.s.effects.some(
    (e) =>
      e.protectionFrom !== undefined &&
      e.affected.id === targetId &&
      e.affected.zcc === target.zcc &&
      colors.includes(e.protectionFrom),
  );
}

/** Rooms: the door of this Room permanent that is still locked (the other half's), if only one is unlocked. */
function lockedDoor(ctx: Ctx, id: ObjectId): 'front' | 'back' | null {
  const o = ctx.s.objects[id];
  if (!o || o.zone !== 'battlefield' || (o.counters?.unlocked ?? 0) > 0) return null;
  // Cast as its back half, the front is locked; cast as its front half, the back is.
  return o.front ? 'front' : 'back';
}

/** Unlocks the Room's locked door: a counter marks both doors as unlocked, and the unlock is announced. */
function unlockDoor(ctx: Ctx, id: ObjectId): void {
  const door = lockedDoor(ctx, id);
  const o = ctx.s.objects[id];
  if (!door || !o) return;
  (o.counters ??= {}).unlocked = 1;
  emit(ctx, { type: 'doorUnlocked', id, player: o.controller, door, fully: true });
}

function targetOnBattlefield(ctx: Ctx, t: TargetChoice | null | undefined) {
  if (!t || !('object' in t)) return undefined;
  const o = ctx.s.objects[t.object.id];
  return o && o.zone === 'battlefield' && o.zcc === t.object.zcc ? o : undefined;
}

export const BRAWL_15B_W_EFFECTS: Record<string, CustomEffect> = {
  /** Alseid of Life's Bounty: the target gains protection from the chosen colour until end of turn. */
  alseidProtect(ctx, es, params) {
    const o = targetOnBattlefield(ctx, es.targets[0]);
    const color = (params as { color?: Color } | undefined)?.color;
    if (!o || !color) return;
    ctx.s.effects.push({
      timestamp: newTimestamp(ctx),
      affected: { id: o.id, zcc: o.zcc },
      power: 0,
      toughness: 0,
      keywords: [],
      protectionFrom: color,
      expires: 'endOfTurn',
    });
  },

  /** Populate (Muster the Departed): a token that's a copy of a creature token you control (the best one). */
  populate(ctx, es) {
    const tokens = creaturesOnBattlefield(ctx, es.controller).filter((c) => c.isToken);
    if (tokens.length === 0) return;
    const best = tokens.reduce((a, b) =>
      power(ctx, b.id) + toughness(ctx, b.id) > power(ctx, a.id) + toughness(ctx, a.id) ? b : a,
    );
    const n = tokenMultiplier(ctx, es.controller);
    for (let i = 0; i < n; i++) {
      const copy = createObject(ctx, best.defId, es.controller, 'battlefield', true);
      ctx.s.battlefield.push(copy.id);
      emit(ctx, {
        type: 'objectMoved',
        id: copy.id,
        defId: copy.defId,
        from: null,
        to: 'battlefield',
      });
    }
  },

  /** Spellbook Vendor: a Sorcerer Role token attached to the target creature; another Role you control on it goes away. */
  createRole(ctx, es) {
    const host = targetOnBattlefield(ctx, es.targets[0]);
    if (!host) return;
    for (const id of [...ctx.s.battlefield]) {
      const r = obj(ctx, id);
      if (
        r.attachedTo === host.id &&
        r.controller === es.controller &&
        def(ctx, id).subtypes.includes('Role')
      )
        moveObject(ctx, id, 'graveyard');
    }
    const role = createObject(ctx, SORCERER_ROLE, es.controller, 'battlefield', true);
    role.attachedTo = host.id;
    ctx.s.battlefield.push(role.id);
    emit(ctx, {
      type: 'objectMoved',
      id: role.id,
      defId: role.defId,
      from: null,
      to: 'battlefield',
    });
  },

  /** A Room's ability that unlocks its other door (Surgical Suite // Hospital Room). */
  unlockThisRoom(ctx, es) {
    if (es.source) unlockDoor(ctx, es.source.id);
  },

  /** Ghostly Dancers: unlock a locked door of a Room you control (the first one). */
  unlockOneDoor(ctx, es) {
    for (const id of ctx.s.battlefield) {
      if (obj(ctx, id).controller !== es.controller) continue;
      if (!def(ctx, id).subtypes.includes('Room')) continue;
      if (lockedDoor(ctx, id)) {
        unlockDoor(ctx, id);
        return;
      }
    }
  },

  /** Divine Reckoning: remember the creature a player chose to keep (on the spell). */
  divineKeep(ctx, es, params) {
    const spell = es.source && ctx.s.objects[es.source.id];
    const id = (params as { id: ObjectId }).id;
    if (spell) spell.exiledWith = [...(spell.exiledWith ?? []), id];
  },

  /** Divine Reckoning: destroy every creature that wasn't chosen (a player with one creature keeps it). */
  divineDestroy(ctx, es) {
    const spell = es.source && ctx.s.objects[es.source.id];
    const kept = new Set(spell?.exiledWith ?? []);
    if (spell) delete spell.exiledWith;
    for (const p of ['p1', 'p2'] as PlayerId[]) {
      const mine = creaturesOnBattlefield(ctx, p);
      if (mine.length <= 1) continue;
      for (const c of mine)
        if (!kept.has(c.id) && !hasKeyword(ctx, c.id, 'indestructible'))
          moveObject(ctx, c.id, 'graveyard');
    }
  },
};

const BRAWL_15B_W_CHOOSERS: Record<string, Chooser> = {
  /** Alseid of Life's Bounty: "the color of your choice". */
  alseidColor() {
    return {
      title: "Alseid of Life's Bounty: choose a color",
      options: (['W', 'U', 'B', 'R', 'G'] as const).map((color) => ({
        label: COLOR_NAMES[color],
        effects: [custom('alseidProtect', { color })],
      })),
    };
  },
  /** Divine Reckoning: this player chooses a creature they control (`who`: 'you' or 'opponent'). */
  divineChoose(ctx, es, params) {
    const who: PlayerId =
      (params as { who?: string } | undefined)?.who === 'opponent'
        ? other(es.controller)
        : es.controller;
    const mine = creaturesOnBattlefield(ctx, who);
    if (mine.length <= 1) return null;
    return {
      player: who,
      title: 'Divine Reckoning: choose a creature you control',
      options: mine.map((c) => ({
        label: `Keep ${def(ctx, c.id).name}`,
        effects: [custom('divineKeep', { id: c.id })],
      })),
    };
  },
};
Object.assign(CHOOSERS, BRAWL_15B_W_CHOOSERS);
