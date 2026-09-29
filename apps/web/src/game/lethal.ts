import { cardDb } from '@mtg/cards';
import { getCharacteristics, type GameState, type ObjectId, type PlayerId } from '@mtg/engine';

export interface Block {
  blocker: ObjectId;
  attacker: ObjectId;
}

/**
 * Combat damage about to come at `me`: unblocked attackers in full, blocked
 * tramplers over their blockers' remaining toughness, double strike twice.
 * `pending` are blocks still being chosen, so the warning reacts as you block.
 * Only counts before damage, so it can't warn about a hit that already landed.
 */
export function incomingDamage(view: GameState, me: PlayerId, pending: Block[] = []): number {
  const step = view.turn.step;
  if (!view.combat || (step !== 'declareAttackers' && step !== 'declareBlockers')) return 0;
  let total = 0;
  for (const a of view.combat.attackers) {
    if (a.defender !== me || !view.objects[a.id]) continue;
    const c = getCharacteristics(view, cardDb, a.id);
    const power = Math.max(0, c.power) * (c.keywords.has('doubleStrike') ? 2 : 1);
    const blockers = [
      ...a.blockers,
      ...pending.filter((b) => b.attacker === a.id).map((b) => b.blocker),
    ];
    if (!a.blocked && !blockers.length) {
      total += power;
    } else if (c.keywords.has('trample')) {
      const wall = blockers.reduce((sum, b) => {
        if (!view.objects[b]) return sum;
        const bc = getCharacteristics(view, cardDb, b);
        return sum + Math.max(0, bc.toughness - (view.objects[b].damage ?? 0));
      }, 0);
      total += Math.max(0, power - wall);
    }
  }
  return total;
}

export function isLethal(view: GameState, me: PlayerId, pending: Block[] = []): boolean {
  const incoming = incomingDamage(view, me, pending);
  return incoming > 0 && incoming >= view.players[me].life;
}
