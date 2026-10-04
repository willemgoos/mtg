import { creaturesOnBattlefield, hasKeyword, isCreature, toughness } from './characteristics.ts';
import { type Ctx, def, emit, moveObject, obj, sacrifice } from './context.ts';
import { sagasToSacrifice } from './sagas.ts';
import type { ObjectId, PlayerId } from './types.ts';
import { PLAYERS } from './types.ts';

/**
 * Performs state-based actions (rule 704) until none apply. All applicable
 * SBAs are performed simultaneously in each pass.
 */
export function runSBAs(ctx: Ctx): void {
  for (;;) {
    let changed = false;
    for (const p of PLAYERS) {
      const ps = ctx.s.players[p];
      // Mystical Archive (16): Angel's Grace, "you can't lose the game this turn".
      if (
        !ps.lost &&
        (ps.life <= 0 || ps.drewFromEmptyLibrary) &&
        !ctx.s.turn.cantLose?.includes(p)
      ) {
        ps.lost = true;
        changed = true;
      }
    }
    // Reality Fracture (17a): Hapatra, the Desert Fang: a +1/+1 and a -1/-1 counter cancel out (rule 704.5q).
    for (const id of ctx.s.battlefield) {
      const o = obj(ctx, id);
      const minus = o.counters?.['-1/-1'] ?? 0;
      const n = Math.min(minus, o.plusOneCounters);
      if (n > 0) {
        o.plusOneCounters -= n;
        o.counters!['-1/-1'] = minus - n;
        changed = true;
      }
    }
    const dying: ObjectId[] = [];
    for (const c of creaturesOnBattlefield(ctx)) {
      const t = toughness(ctx, c.id);
      if (t <= 0) dying.push(c.id);
      else if (
        (c.damage >= t || (c.damage > 0 && c.damagedByDeathtouch)) &&
        !hasKeyword(ctx, c.id, 'indestructible')
      )
        dying.push(c.id);
    }
    for (const id of ctx.s.battlefield)
      if (def(ctx, id).types.includes('Planeswalker') && (obj(ctx, id).counters?.loyalty ?? 0) <= 0)
        dying.push(id);
    for (const id of dying) moveObject(ctx, id, 'graveyard');
    if (dying.length) changed = true;
    // Equipment attached to something that is no longer a creature on the battlefield
    // falls off; an Aura in that situation (or attached to nothing) goes to the graveyard.
    const orphanedAuras: ObjectId[] = [];
    for (const id of ctx.s.battlefield) {
      const o = obj(ctx, id);
      const aura = def(ctx, id).subtypes.includes('Aura');
      const host = o.attachedTo !== undefined ? ctx.s.objects[o.attachedTo] : undefined;
      if (host && host.zone === 'battlefield' && isCreature(ctx, host.id)) continue;
      // Strixhaven Brawl (15b, g): Utopia Sprawl enchants a Forest.
      if (host && host.zone === 'battlefield' && aura && def(ctx, id).enchant?.what === 'permanent')
        continue;
      // Sugar Coat stays on the Food it made.
      if (host && host.zone === 'battlefield' && host.foodBy === id) continue;
      // Archnemesis enchants a player.
      if (aura && def(ctx, id).enchantPlayer) continue;
      // Strixhaven Brawl (15b, w): bestow, an unattached bestowed Aura is the creature again (rule 702.103e).
      if (aura && def(ctx, id).bestowFront) {
        const front = def(ctx, id).bestowFront!;
        o.defId = front;
        delete o.front;
        if (host) o.lastAttachedTo = { id: host.id, zcc: host.zcc - 1 };
        delete o.attachedTo;
        changed = true;
        continue;
      }
      if (aura) orphanedAuras.push(id);
      else {
        // An Equipment falls off, remembering its creature (Skullclamp's "whenever equipped creature dies").
        if (host) o.lastAttachedTo = { id: host.id, zcc: host.zcc - 1 };
        delete o.attachedTo;
      }
    }
    for (const id of orphanedAuras) moveObject(ctx, id, 'graveyard');
    if (orphanedAuras.length) changed = true;
    // Kitnap: control ends when the Aura is no longer on it.
    for (const id of ctx.s.battlefield) {
      const o = obj(ctx, id);
      if (!o.controlledBy) continue;
      const aura = ctx.s.objects[o.controlledBy.aura];
      if (aura && aura.zone === 'battlefield' && aura.attachedTo === id) continue;
      o.controller = o.controlledBy.previous;
      delete o.controlledBy;
      changed = true;
    }
    // Sagas past their last chapter are sacrificed.
    const sagas = sagasToSacrifice(ctx);
    for (const id of sagas) sacrifice(ctx, id);
    if (sagas.length) changed = true;
    const legends = extraLegends(ctx);
    for (const id of legends) moveObject(ctx, id, 'graveyard');
    if (legends.length) changed = true;
    if (!changed) return;
  }
}

/**
 * Legend rule (704.5j): a player with two or more legendary permanents of the
 * same name keeps one. The rules let them choose; we keep the newest.
 */
function extraLegends(ctx: Ctx): ObjectId[] {
  const newest = new Map<string, ObjectId>();
  const out: ObjectId[] = [];
  for (const id of ctx.s.battlefield) {
    // Helm of the Host's copies aren't legendary.
    if (!def(ctx, id).supertypes.includes('Legendary') || obj(ctx, id).nonlegendary) continue;
    const o = obj(ctx, id);
    // Council of Reeds: "The legend rule doesn't apply to creatures you control."
    if (def(ctx, id).types.includes('Creature') && legendRuleOff(ctx, o.controller)) continue;
    // Impossible Man keeps his own name while copying.
    const key = `${o.controller}:${o.copyKeepsName && o.originalDefId ? o.originalDefId : o.defId}`;
    const prev = newest.get(key);
    if (prev === undefined) newest.set(key, id);
    else if (obj(ctx, prev).timestamp < o.timestamp) {
      out.push(prev);
      newest.set(key, id);
    } else out.push(id);
  }
  return out;
}

function legendRuleOff(ctx: Ctx, player: PlayerId): boolean {
  return ctx.s.battlefield.some(
    (id) =>
      obj(ctx, id).controller === player &&
      def(ctx, id).abilities.some((a) => a.kind === 'static' && a.effect.kind === 'noLegendRule'),
  );
}

/** Ends the game if a player has lost. Returns true if the game is over. */
export function checkGameOver(ctx: Ctx): boolean {
  const s = ctx.s;
  if (s.winner) return true;
  const lost = PLAYERS.filter((p) => s.players[p].lost);
  if (lost.length === 0) return false;
  s.winner = lost.length === 2 ? 'draw' : lost[0] === 'p1' ? 'p2' : 'p1';
  s.decision = { kind: 'gameOver' };
  emit(ctx, { type: 'gameOver', winner: s.winner });
  return true;
}
