import { cardDb } from '@mtg/cards';
import { type GameState, manaValue, type ObjectId, type PlayerId } from '@mtg/engine';

/**
 * Why a card in hand can't be played right now, in a few words (Arena shows a
 * reason instead of ignoring the click). The engine only reports what is
 * legal, so this works the likely cause out from timing, the land drop and
 * the mana on hand; anything subtler gets the general answer.
 */
export function whyNot(view: GameState, id: ObjectId, me: PlayerId): string {
  const d = view.decision;
  if (d.kind === 'gameOver') return 'The game is over';
  if (d.player !== me) return 'Wait until you have priority';
  if (d.kind !== 'priority') return 'Finish the current choice first';

  const def = cardDb.get(view.objects[id]?.defId ?? '');
  if (!def) return 'Can’t be played right now';
  const t = view.turn;
  const mainPhase =
    t.activePlayer === me && (t.step === 'main1' || t.step === 'main2') && !view.stack.length;

  if (def.types.includes('Land')) {
    if (!mainPhase) return 'Lands are played in your main phase, with the stack empty';
    if (view.players[me].landsPlayedThisTurn > 0) return 'You’ve already played a land this turn';
    return 'Can’t be played right now';
  }
  const instant = def.types.includes('Instant') || def.keywords.includes('flash');
  if (!instant && !mainPhase) return 'Cast this in your main phase, with the stack empty';

  const lands = view.battlefield.filter((o) => {
    const obj = view.objects[o];
    return (
      obj?.controller === me && !obj.tapped && cardDb.get(obj.defId)?.types.includes('Land')
    );
  }).length;
  const floating = view.players[me].pool?.length ?? 0;
  if (manaValue(def.manaCost) > lands + floating) return 'Not enough mana';
  return 'Can’t be cast right now: check its mana and targets';
}
