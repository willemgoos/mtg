import { MONO_GREEN, MONO_RED, scryfallById, slug } from '@mtg/cards';
import { useState } from 'react';
import { Board } from './components/Board.tsx';
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
  if (!match) return <Start onPick={(deck) => setMatch({ deck, seed: newSeed() })} />;
  return (
    <Game key={match.seed} deck={match.deck} seed={match.seed} onRestart={() => setMatch(null)} />
  );
}

function newSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}

function Game({
  deck,
  seed,
  onRestart,
}: {
  deck: DeckChoice;
  seed: number;
  onRestart: () => void;
}) {
  const game = useGame(deck, seed);
  return <Board game={game} onRestart={onRestart} />;
}

function Start({ onPick }: { onPick: (d: DeckChoice) => void }) {
  return (
    <div className="start">
      <div className="start__title">
        <span className="start__eyebrow">A duel of</span>
        <h1>Foundations</h1>
        <p>Choose your deck. The bot takes the other.</p>
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
