import { MONO_GREEN, MONO_RED, scryfallById, slug } from '@mtg/cards';
import { useState } from 'react';
import { Board } from './components/Board.tsx';
import type { BotKind } from './game/bot.worker.ts';
import { type DeckChoice, useGame } from './game/useGame.ts';

const DECKS: { id: DeckChoice; name: string; blurb: string; art: string }[] = [
  {
    id: 'red',
    name: MONO_RED.name,
    blurb: 'Burn, haste and dragons. Get under them before the big things land.',
    art: scryfallById.get(slug('Shivan Dragon'))?.image?.artCrop ?? '',
  },
  {
    id: 'green',
    name: MONO_GREEN.name,
    blurb: 'Elves, fight spells and enormous creatures. Survive, then stomp.',
    art: scryfallById.get(slug('Rampaging Baloths'))?.image?.artCrop ?? '',
  },
];

export function App() {
  const [match, setMatch] = useState<{ deck: DeckChoice; seed: number } | null>(null);
  const [opponent, setOpponent] = useState<BotKind>('search');
  if (!match)
    return (
      <Start
        opponent={opponent}
        onOpponent={setOpponent}
        onPick={(deck) => setMatch({ deck, seed: newSeed() })}
      />
    );
  return (
    <Game
      key={match.seed}
      deck={match.deck}
      seed={match.seed}
      opponent={opponent}
      onRestart={() => setMatch(null)}
    />
  );
}

function newSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}

function Game({
  deck,
  seed,
  opponent,
  onRestart,
}: {
  deck: DeckChoice;
  seed: number;
  opponent: BotKind;
  onRestart: () => void;
}) {
  const game = useGame(deck, seed, opponent);
  return <Board game={game} onRestart={onRestart} />;
}

const OPPONENTS: { id: BotKind; name: string; blurb: string }[] = [
  { id: 'heuristic', name: 'Apprentice', blurb: 'Plays fast, thinks one move ahead' },
  { id: 'search', name: 'Master', blurb: 'Simulates hundreds of futures per decision' },
];

function Start({
  onPick,
  opponent,
  onOpponent,
}: {
  onPick: (d: DeckChoice) => void;
  opponent: BotKind;
  onOpponent: (b: BotKind) => void;
}) {
  return (
    <div className="start">
      <div className="start__title">
        <span className="start__eyebrow">A duel of</span>
        <h1>Foundations</h1>
        <p>Choose your opponent and your deck. The bot takes the other deck.</p>
      </div>
      <div className="start__opponent" role="radiogroup" aria-label="Opponent">
        {OPPONENTS.map((o) => (
          <button
            key={o.id}
            role="radio"
            aria-checked={opponent === o.id}
            className={`opp ${opponent === o.id ? 'is-on' : ''}`}
            onClick={() => onOpponent(o.id)}
          >
            <span className="opp__name">{o.name}</span>
            <span className="opp__blurb">{o.blurb}</span>
          </button>
        ))}
      </div>
      <div className="start__decks">
        {DECKS.map((d, i) => (
          <button
            key={d.id}
            className={`deck deck--${d.id}`}
            style={{ '--art': `url(${d.art})`, '--i': i } as React.CSSProperties}
            onClick={() => onPick(d.id)}
          >
            <span className="deck__art" />
            <span className="deck__name">{d.name}</span>
            <span className="deck__blurb">{d.blurb}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
