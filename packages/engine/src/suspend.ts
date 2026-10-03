import { type Ctx, obj } from './context.ts';
import type { PlayerId } from './types.ts';

/**
 * Suspend (Kang Prime, Doom's Time Platform): at the beginning of its owner's
 * upkeep, a suspended card in exile loses a time counter; when the last one
 * goes, they may cast it without paying its mana cost, and a creature has haste.
 */
export function tickSuspend(ctx: Ctx, player: PlayerId): void {
  for (const id of [...ctx.s.players[player].exile]) {
    const o = obj(ctx, id);
    if (!o.suspended) continue;
    const time = Math.max(0, (o.counters?.time ?? 0) - 1);
    o.counters = { ...o.counters, time };
    if (time > 0) continue;
    o.suspended = false;
    o.hasteOnEntry = true;
    ctx.s.pendingTriggers.push({
      source: { id: o.id, zcc: o.zcc },
      sourceDefId: o.defId,
      abilityIndex: -1,
      controller: player,
      inline: [{ kind: 'castFreeCard', card: { id: o.id, zcc: o.zcc } }],
    });
  }
  // Strixhaven (13c): Uvilda, Dean of Perfection: refine counters; the last one lets you cast it for {4} less.
  for (const id of [...ctx.s.players[player].exile]) {
    const o = obj(ctx, id);
    if ((o.counters?.refine ?? 0) <= 0) continue;
    const left = o.counters!.refine! - 1;
    o.counters = { ...o.counters, refine: left };
    if (left > 0) continue;
    ctx.s.pendingTriggers.push({
      source: { id: o.id, zcc: o.zcc },
      sourceDefId: o.defId,
      abilityIndex: -1,
      controller: player,
      inline: [{ kind: 'castFreeCard', card: { id: o.id, zcc: o.zcc }, costLess: 4 }],
    });
  }
}
