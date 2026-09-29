import { DECKS, type Decklist, isPlayable } from '@mtg/cards';
import { useCallback, useEffect, useState } from 'react';
import { Board } from './components/Board.tsx';
import { DeckView } from './components/DeckView.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { Gauntlet } from './components/Gauntlet.tsx';
import { UiSize } from './components/UiSize.tsx';
import type { BotKind } from './game/bot.worker.ts';
import { artFor, BLURBS } from './game/deckArt.ts';
import {
  type GauntletState,
  LIVES,
  loadGauntlet,
  recordResult,
  ROUNDS,
  roundOf,
  saveGauntlet,
  startMatch,
  startRun,
  statusOf,
} from './game/gauntlet.ts';
import { clearGame, loadGame, type SavedGame } from './game/saved.ts';
import { type DeckChoice, HUMAN, useGame } from './game/useGame.ts';

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
  bot: BotKind;
  /** A gauntlet round (its result counts toward the run) rather than a quick match. */
  gauntlet: boolean;
}

type Mode = 'quick' | 'gauntlet';

export function App() {
  // A game in progress when the page was closed or reloaded carries on.
  const [saved] = useState(loadGame);
  const [gauntlet, setGauntlet] = useState(loadGauntlet);
  const [match, setMatch] = useState<Match | null>(
    () =>
      saved && {
        choice: saved.choice,
        seed: saved.seed,
        resume: saved,
        attempt: 0,
        bot: saved.opponent,
        gauntlet: gauntlet.run?.match === saved.seed,
      },
  );
  const [mode, setMode] = useState<Mode>(gauntlet.run ? 'gauntlet' : 'quick');
  const [ladder, setLadder] = useState(false);
  const [opponent, setOpponent] = useState<BotKind>(
    saved && !match?.gauntlet ? saved.opponent : 'easy',
  );
  const [theirDeck, setTheirDeck] = useState<string | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const pick = (you: string) => {
    const seed = newSeed();
    const them = theirDeck ?? randomOther(you, seed);
    setMatch({
      choice: { you, them },
      seed,
      resume: null,
      attempt: 0,
      bot: opponent,
      gauntlet: false,
    });
  };
  const menu = () => {
    clearGame();
    setMatch(null);
  };

  // ------------------------------------------------------------- gauntlet
  const updateGauntlet = (f: (s: GauntletState) => GauntletState) =>
    setGauntlet((s) => {
      const next = f(s);
      saveGauntlet(next);
      return next;
    });
  const run = gauntlet.run;
  const paused = !!run && run.match !== null && loadGame()?.seed === run.match;
  const beginRun = (deck: string) => {
    updateGauntlet((s) => startRun(s, deck, newSeed()));
    setLadder(true);
  };
  const playRound = () => {
    if (!run) return;
    const resume = paused ? loadGame() : null;
    const seed = resume?.seed ?? newSeed();
    const round = roundOf(run);
    if (!resume) updateGauntlet((s) => startMatch(s, seed));
    setMatch({
      choice: { you: run.deck, them: run.opponents[round]! },
      seed,
      resume,
      attempt: 0,
      bot: ROUNDS[round]!.bot,
      gauntlet: true,
    });
  };
  // Leaving a gauntlet match keeps it saved, so the round can be resumed rather than restarted.
  const toLadder = () => {
    setMatch(null);
    setLadder(true);
  };
  const endRun = () => {
    updateGauntlet((s) => ({ ...s, run: null }));
    setLadder(false);
    setMode('gauntlet');
  };
  const onEnd = (outcome: 'win' | 'loss' | 'draw') => {
    const seed = match?.seed;
    if (match?.gauntlet && seed !== undefined)
      updateGauntlet((s) => recordResult(s, seed, outcome));
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
  if (!match && ladder && run)
    return (
      <Gauntlet
        state={gauntlet}
        resumable={paused}
        onPlay={playRound}
        onAbandon={endRun}
        onAgain={() => beginRun(run.deck)}
        onMenu={() => setLadder(false)}
      />
    );
  if (!match)
    return (
      <Start
        mode={mode}
        onMode={setMode}
        gauntlet={gauntlet}
        onContinue={() => setLadder(true)}
        onRun={beginRun}
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
        opponent={match.bot}
        resume={match.resume}
        onEnd={onEnd}
        gauntlet={match.gauntlet ? gauntletLabel(gauntlet) : undefined}
        onMenu={match.gauntlet ? toLadder : menu}
        onRematch={
          match.gauntlet
            ? toLadder
            : () => setMatch((m) => m && { ...m, seed: newSeed(), resume: null, attempt: 0 })
        }
      />
    </ErrorBoundary>
  );
}

function gauntletLabel(s: GauntletState): string {
  const run = s.run;
  if (!run) return 'Gauntlet';
  return `Gauntlet · ${statusOf(run) === 'playing' ? `Round ${roundOf(run) + 1} of ${ROUNDS.length}` : 'Final result'}`;
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
  gauntlet,
  onEnd,
  onMenu,
  onRematch,
}: {
  choice: DeckChoice;
  seed: number;
  opponent: BotKind;
  resume: SavedGame | null;
  gauntlet?: string;
  onEnd: (outcome: 'win' | 'loss' | 'draw') => void;
  onMenu: () => void;
  onRematch: () => void;
}) {
  const game = useGame(choice, seed, opponent, resume);
  const winner = game.state.winner;
  useEffect(() => {
    if (winner) onEnd(winner === 'draw' ? 'draw' : winner === HUMAN ? 'win' : 'loss');
    // Keyed on the winner alone: recordResult ignores repeats anyway.
  }, [winner]);
  const deck = (id: string) => DECKS.find((d) => d.id === id)!;
  return (
    <Board
      game={game}
      decks={{ you: deck(choice.you), them: deck(choice.them) }}
      gauntlet={gauntlet}
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

const MODES: { id: Mode; name: string; blurb: string }[] = [
  { id: 'quick', name: 'Quick match', blurb: 'One game, any deck against any opponent' },
  {
    id: 'gauntlet',
    name: 'Gauntlet',
    blurb: `${ROUNDS.length} opponents, each tougher. Three losses and you're out`,
  },
];

function Start({
  mode,
  onMode,
  gauntlet,
  onContinue,
  onRun,
  onPick,
  onView,
  opponent,
  onOpponent,
  theirDeck,
  onTheirDeck,
}: {
  mode: Mode;
  onMode: (m: Mode) => void;
  gauntlet: GauntletState;
  onContinue: () => void;
  onRun: (deckId: string) => void;
  onPick: (deckId: string) => void;
  onView: (deckId: string) => void;
  opponent: BotKind;
  onOpponent: (b: BotKind) => void;
  theirDeck: string | null;
  onTheirDeck: (id: string | null) => void;
}) {
  const run = gauntlet.run;
  const running = mode === 'gauntlet' && !!run && statusOf(run) === 'playing';
  return (
    <div className="start">
      <UiSize />
      <div className="start__title">
        <span className="start__eyebrow">A duel of</span>
        <h1>Foundations</h1>
        <p>
          {mode === 'quick'
            ? 'Choose your opponent, then your deck.'
            : running
              ? 'Your run is waiting.'
              : 'Choose a deck to take through the gauntlet.'}
        </p>
      </div>
      <div className="start__opponent start__mode" role="radiogroup" aria-label="Mode">
        {MODES.map((m) => (
          <button
            key={m.id}
            role="radio"
            aria-checked={mode === m.id}
            className={`opp ${mode === m.id ? 'is-on' : ''}`}
            onClick={() => onMode(m.id)}
          >
            <span className="opp__name">{m.name}</span>
            <span className="opp__blurb">{m.blurb}</span>
          </button>
        ))}
      </div>
      {mode === 'quick' ? (
        <>
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
        </>
      ) : (
        run && <RunBanner gauntlet={gauntlet} onContinue={onContinue} />
      )}
      {SECTIONS.map((section, si) => (
        <section key={section.title} className="start__section">
          <h2 className="start__section-title">
            {section.title}
            <span>{section.blurb}</span>
          </h2>
          <div className={`start__decks ${running ? 'is-waiting' : ''}`}>
            {section.decks.map((d, j) => {
              const i = si * 10 + j;
              const locked = !isPlayable(d);
              const record = mode === 'gauntlet' ? gauntlet.records[d.id] : undefined;
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
                    disabled={locked || running}
                    onClick={() => (mode === 'gauntlet' ? onRun(d.id) : onPick(d.id))}
                  >
                    <span className="deck__art" />
                    {record && record.runs > 0 && (
                      <span className={`deck__record ${record.clears ? 'is-cleared' : ''}`}>
                        {record.clears
                          ? `★ Cleared${record.clears > 1 ? ` ×${record.clears}` : ''}`
                          : `Best ${record.best}/${ROUNDS.length}`}
                      </span>
                    )}
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

/** The gauntlet run in progress (or just finished), on the start screen. */
function RunBanner({ gauntlet, onContinue }: { gauntlet: GauntletState; onContinue: () => void }) {
  const run = gauntlet.run!;
  const deck = DECKS.find((d) => d.id === run.deck)!;
  const status = statusOf(run);
  const lost = run.results.filter((r) => r === 'loss').length;
  return (
    <div
      className="run-banner"
      style={
        {
          '--art': `url("${artFor(deck)}")`,
          '--glow': `var(--mana-${deck.colors[0]})`,
        } as React.CSSProperties
      }
    >
      <span className="run-banner__art" />
      <div className="run-banner__text">
        <span className="run-banner__deck">{deck.name}</span>
        <span className="run-banner__state">
          {status === 'playing'
            ? `Round ${roundOf(run) + 1} of ${ROUNDS.length} · ${LIVES - lost} ${LIVES - lost === 1 ? 'life' : 'lives'} left`
            : status === 'cleared'
              ? 'Gauntlet cleared!'
              : 'Run over'}
        </span>
      </div>
      <button className="btn btn--primary" onClick={onContinue}>
        {status === 'playing' ? 'Continue run' : 'See result'}
      </button>
    </div>
  );
}
