import { DECKS, type Decklist, isPlayable } from '@mtg/cards';
import { useCallback, useState } from 'react';
import { Board } from './components/Board.tsx';
import { DeckView } from './components/DeckView.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { UiSize } from './components/UiSize.tsx';
import type { BotKind } from './game/bot.worker.ts';
import { artFor, BLURBS } from './game/deckArt.ts';
import { clearGame, loadGame, type SavedGame } from './game/saved.ts';
import { type DeckChoice, useGame } from './game/useGame.ts';

// Playable decks first; the rest show as "coming soon".
/** Deck grid sections, playable decks first within each. */
const SECTIONS: { title: string; blurb: string; decks: Decklist[] }[] = [
  {
    title: 'Starter decks',
    blurb: 'Two-colour decks from Arena’s Starter Deck Duel',
    series: 'starter' as const,
  },
  {
    title: 'Color Challenge',
    blurb: 'The mono-colour decks Sparky plays against new players',
    series: 'colorChallenge' as const,
  },
].map(({ series, ...s }) => {
  const decks = DECKS.filter((d) => d.series === series);
  return { ...s, decks: [...decks.filter(isPlayable), ...decks.filter((d) => !isPlayable(d))] };
});
const PLAYABLE = DECKS.filter(isPlayable);

interface Match {
  choice: DeckChoice;
  seed: number;
  /** A saved game to pick up from instead of starting fresh. */
  resume: SavedGame | null;
  /** Bumped by "Reload game" after a crash, to remount the game. */
  attempt: number;
}

export function App() {
  // A game in progress when the page was closed or reloaded carries on.
  const [saved] = useState(loadGame);
  const [match, setMatch] = useState<Match | null>(
    () => saved && { choice: saved.choice, seed: saved.seed, resume: saved, attempt: 0 },
  );
  const [opponent, setOpponent] = useState<BotKind>(saved?.opponent ?? 'easy');
  const [theirDeck, setTheirDeck] = useState<string | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const pick = (you: string) => {
    const seed = newSeed();
    const them = theirDeck ?? randomOther(you, seed);
    setMatch({ choice: { you, them }, seed, resume: null, attempt: 0 });
  };
  const menu = () => {
    clearGame();
    setMatch(null);
  };
  const back = useCallback(() => setViewing(null), []);
  if (!match && viewing)
    return (
      <DeckView
        deck={DECKS.find((d) => d.id === viewing)!}
        onBack={back}
        onPlay={() => {
          setViewing(null);
          pick(viewing);
        }}
      />
    );
  if (!match)
    return (
      <Start
        opponent={opponent}
        onOpponent={setOpponent}
        theirDeck={theirDeck}
        onTheirDeck={setTheirDeck}
        onPick={pick}
        onView={setViewing}
      />
    );
  return (
    <ErrorBoundary
      onMenu={menu}
      onRetry={() => setMatch((m) => m && { ...m, resume: loadGame(), attempt: m.attempt + 1 })}
    >
      <Game
        key={`${match.seed}-${match.attempt}`}
        choice={match.choice}
        seed={match.seed}
        opponent={opponent}
        resume={match.resume}
        onMenu={menu}
        onRematch={() => setMatch((m) => m && { ...m, seed: newSeed(), resume: null, attempt: 0 })}
      />
    </ErrorBoundary>
  );
}

function newSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}

/** A random playable deck for the bot, other than the player's when possible. */
function randomOther(you: string, seed: number): string {
  // Same series as the player's deck (Color Challenge decks meet each other, like on Arena).
  const series = DECKS.find((d) => d.id === you)?.series;
  const others = PLAYABLE.filter((d) => d.id !== you && d.series === series);
  const pool = others.length ? others : PLAYABLE;
  return pool[seed % pool.length]!.id;
}

function Game({
  choice,
  seed,
  opponent,
  resume,
  onMenu,
  onRematch,
}: {
  choice: DeckChoice;
  seed: number;
  opponent: BotKind;
  resume: SavedGame | null;
  onMenu: () => void;
  onRematch: () => void;
}) {
  const game = useGame(choice, seed, opponent, resume);
  const deck = (id: string) => DECKS.find((d) => d.id === id)!;
  return (
    <Board
      game={game}
      decks={{ you: deck(choice.you), them: deck(choice.them) }}
      onMenu={onMenu}
      onRematch={onRematch}
    />
  );
}

const OPPONENTS: { id: BotKind; name: string; blurb: string }[] = [
  {
    id: 'easy',
    name: 'Novice',
    blurb: 'Still learning: makes mistakes, never responds on your turn',
  },
  { id: 'heuristic', name: 'Apprentice', blurb: 'Plays fast, thinks one move ahead' },
  { id: 'search', name: 'Master', blurb: 'Simulates hundreds of futures per decision' },
];

function Start({
  onPick,
  onView,
  opponent,
  onOpponent,
  theirDeck,
  onTheirDeck,
}: {
  onPick: (deckId: string) => void;
  onView: (deckId: string) => void;
  opponent: BotKind;
  onOpponent: (b: BotKind) => void;
  theirDeck: string | null;
  onTheirDeck: (id: string | null) => void;
}) {
  return (
    <div className="start">
      <UiSize />
      <div className="start__title">
        <span className="start__eyebrow">A duel of</span>
        <h1>Foundations</h1>
        <p>Choose your opponent, then your deck.</p>
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
      <label className="start__their-deck">
        <span className="start__label">Opponent's deck</span>
        <select
          className="chip is-on"
          value={theirDeck ?? ''}
          onChange={(e) => onTheirDeck(e.target.value || null)}
        >
          <option value="">Random</option>
          {SECTIONS.map((s) => (
            <optgroup key={s.title} label={s.title}>
              {s.decks.filter(isPlayable).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      {SECTIONS.map((section, si) => (
        <section key={section.title} className="start__section">
          <h2 className="start__section-title">
            {section.title}
            <span>{section.blurb}</span>
          </h2>
          <div className="start__decks">
            {section.decks.map((d, j) => {
              const i = si * 10 + j;
              const locked = !isPlayable(d);
              return (
                <div key={d.id} className="deck-slot">
                  <button
                    className={`deck ${locked ? 'is-locked' : ''}`}
                    style={
                      {
                        '--art': `url("${artFor(d)}")`,
                        '--glow': `var(--mana-${d.colors[0]})`,
                        '--i': i,
                      } as React.CSSProperties
                    }
                    disabled={locked}
                    onClick={() => onPick(d.id)}
                  >
                    <span className="deck__art" />
                    <span className="deck__pips">
                      {d.colors.map((c) => (
                        <span key={c} className={`pip pip--${c}`} />
                      ))}
                    </span>
                    <span className="deck__name">{d.name}</span>
                    <span className="deck__blurb">{locked ? 'Coming soon' : BLURBS[d.id]}</span>
                  </button>
                  <button
                    className="deck-slot__view"
                    style={{ '--i': i } as React.CSSProperties}
                    onClick={() => onView(d.id)}
                  >
                    View deck
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
