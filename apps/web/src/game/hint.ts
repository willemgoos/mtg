import { createHeuristicBot, planAttacks, planBlocks, viewEngine } from '@mtg/ai';
import { cardDb } from '@mtg/cards';
import type { Action, GameState, ObjectId, PlayerId } from '@mtg/engine';

/** What a good player would do now, in words, and the cards to point at. */
export interface Hint {
  text: string;
  cards: ObjectId[];
}

const engine = viewEngine(cardDb);
const bot = createHeuristicBot(cardDb, 'hint');

const nameOf = (view: GameState, id: ObjectId) =>
  cardDb.get(view.objects[id]?.defId ?? '')?.name ?? 'that card';

const list = (names: string[]) =>
  names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;

/**
 * Asks the heuristic bot (the Apprentice) for your move. Attacks and blocks
 * use its whole combat plan rather than one creature at a time. Returns null
 * when it isn't your decision.
 */
export function hintFor(view: GameState, me: PlayerId): Hint | null {
  const d = view.decision;
  if (d.kind === 'gameOver' || d.player !== me) return null;

  if (d.kind === 'declareAttackers') {
    const ids = planAttacks(
      engine,
      view,
      me,
      d.declared.map((x) => x.id),
    );
    return ids.length
      ? { text: `Attack with ${list(ids.map((id) => nameOf(view, id)))}.`, cards: ids }
      : { text: "Don't attack this turn: your creatures would trade badly.", cards: [] };
  }
  if (d.kind === 'declareBlockers') {
    const blocks = planBlocks(engine, view, me);
    return blocks.length
      ? {
          text: `${blocks
            .map((b) => `Block ${nameOf(view, b.attacker)} with ${nameOf(view, b.blocker)}`)
            .join('. ')}.`,
          cards: blocks.flatMap((b) => [b.blocker, b.attacker]),
        }
      : { text: "Don't block this time: take the damage and keep your creatures.", cards: [] };
  }

  let a: Action;
  try {
    a = bot.chooseAction(view, me);
  } catch {
    return null;
  }
  return describe(view, a);
}

function describe(view: GameState, a: Action): Hint {
  const name = (id: ObjectId) => nameOf(view, id);
  switch (a.type) {
    case 'keepHand':
      return { text: 'Keep this hand: it has a good mix of lands and spells.', cards: [] };
    case 'mulligan':
      return { text: 'Mulligan: this hand has too few or too many lands.', cards: [] };
    case 'playLand':
      return { text: `Play ${name(a.card)}.`, cards: [a.card] };
    case 'castSpell':
      return { text: `Cast ${name(a.card)}.`, cards: [a.card] };
    case 'activateAbility':
      return { text: `Use ${name(a.source)}'s ability.`, cards: [a.source] };
    case 'passPriority':
      return view.stack.length
        ? { text: "Let it resolve: there's nothing worth answering it with.", cards: [] }
        : { text: 'Nothing more worth doing right now. Move on.', cards: [] };
    case 'chooseTargets': {
      const ids = a.targets.flatMap((t) => ('object' in t ? [t.object.id] : []));
      const players = a.targets.flatMap((t) => ('player' in t ? [t.player] : []));
      const who = [
        ...ids.map(name),
        ...players.map((p) => (p === a.player ? 'yourself' : 'your opponent')),
      ];
      return { text: `Target ${list(who)}.`, cards: ids };
    }
    case 'discard':
      return { text: `Discard ${name(a.card)}.`, cards: [a.card] };
    case 'bottomCard':
      return { text: `Put ${name(a.card)} on the bottom.`, cards: [a.card] };
    case 'chooseCard':
      return a.card
        ? { text: `Choose ${name(a.card)}.`, cards: [a.card] }
        : { text: 'Choose nothing.', cards: [] };
    case 'scry':
      return {
        text: a.bottom.length
          ? `Put ${list(a.bottom.map(name))} on the bottom.`
          : 'Keep them all on top.',
        cards: a.bottom,
      };
    case 'splitPiles':
      return { text: `Put ${list(a.faceUp.map(name)) || 'nothing'} face up.`, cards: a.faceUp };
    case 'choosePile':
      return { text: `Take the ${a.pile === 'faceUp' ? 'face-up' : 'face-down'} pile.`, cards: [] };
    default:
      return { text: 'Go ahead with the obvious choice.', cards: [] };
  }
}
