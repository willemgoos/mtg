import type { GameEvent, GameState } from '@mtg/engine';
import { cardDb, displayName } from './index.ts';

/** One line of human-readable log for an event, or null if not worth showing. */
export function describeEvent(e: GameEvent, s: GameState): string | null {
  const def = (defId: string) => cardDb.get(defId);
  const shown = (defId: string) => (def(defId) ? displayName(def(defId)!) : undefined);
  const name = (id: string) => shown(s.objects[id]?.defId ?? '') ?? id;
  switch (e.type) {
    case 'stepChanged':
      return e.step === 'upkeep' ? `\n== Turn ${e.turn} (${e.activePlayer}) ==` : null;
    case 'spellCast':
      return `${e.player} casts ${name(e.id)}`;
    case 'prepared':
      return `  ${name(e.id)} becomes prepared`;
    case 'abilityActivated':
      return `${e.player} activates ${name(e.source)}`;
    case 'objectMoved':
      if (e.to === 'battlefield' || e.to === 'graveyard') return `  ${shown(e.defId)} → ${e.to}`;
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
    case 'searched':
      return `  ${e.player} searches their library for ${name(e.id)}`;
    case 'revealed':
      return `  ${e.player} reveals ${name(e.id)} and puts it into their hand`;
    // Reality Fracture (17a fixes): Loyal Tutor.
    case 'cardsRevealed':
      return `  ${e.player} reveals ${e.cards.map((c) => cardDb.get(c.defId)?.name ?? c.defId).join(', ')}`;
    // The Hobbit (20a).
    case 'amassed':
      return `  ${e.player} amasses ${e.subtype}s ${e.amount}: ${name(e.id)}`;
    case 'enduringStory':
      return `  ${e.player} has an enduring story`;
    case 'transformed':
      return `  transforms into ${cardDb.get(e.defId)?.name}`;
    case 'gameOver':
      return `\nWinner: ${e.winner}`;
    default:
      return null;
  }
}
