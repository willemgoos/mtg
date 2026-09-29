import type { GameEvent, GameState } from '@mtg/engine';
import { cardDb } from './index.ts';

/** One line of human-readable log for an event, or null if not worth showing. */
export function describeEvent(e: GameEvent, s: GameState): string | null {
  const name = (id: string) => cardDb.get(s.objects[id]?.defId ?? '')?.name ?? id;
  switch (e.type) {
    case 'stepChanged':
      return e.step === 'upkeep' ? `\n== Turn ${e.turn} (${e.activePlayer}) ==` : null;
    case 'spellCast':
      return `${e.player} casts ${name(e.id)}`;
    case 'abilityActivated':
      return `${e.player} activates ${name(e.source)}`;
    case 'objectMoved':
      if (e.to === 'battlefield' || e.to === 'graveyard')
        return `  ${cardDb.get(e.defId)?.name} → ${e.to}`;
      return null;
    case 'damageDealt': {
      const to = 'player' in e.to ? e.to.player : name(e.to.object.id);
      return `  ${name(e.source)} deals ${e.amount} to ${to}${e.combat ? ' (combat)' : ''}`;
    }
    case 'lifeChanged':
      return `  ${e.player} life ${e.life}`;
    case 'attackersDeclared':
      return e.attackers.length ? `attacks with ${e.attackers.map(name).join(', ')}` : null;
    case 'blockersDeclared':
      return e.blocks.length
        ? `blocks: ${e.blocks.map((b) => `${name(b.blocker)} → ${name(b.attacker)}`).join(', ')}`
        : null;
    case 'gameOver':
      return `\nWinner: ${e.winner}`;
    default:
      return null;
  }
}
