import {
  DECKS,
  deckById,
  type Decklist,
  isJumpIn,
  isPlayable,
  scryfallById,
  slug,
} from '@mtg/cards';
import { useCallback, useEffect, useState } from 'react';
import { Board } from './components/Board.tsx';
import { DeckView } from './components/DeckView.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { Expedition } from './components/Expedition.tsx';
import { Gauntlet } from './components/Gauntlet.tsx';
import { JumpIn } from './components/JumpIn.tsx';
import { UiSize } from './components/UiSize.tsx';
import type { BotKind } from './game/bot.worker.ts';
import { artFor, BLURBS } from './game/deckArt.ts';
import {
  deckCards,
  type ExpeditionState,
  loadExpedition,
  recordExpedition,
  runDeck,
  saveExpedition,
  startExpedition,
} from './game/expedition.ts';
import {
  type DeckRecord,
  type GauntletState,
  LIVES,
  loadGauntlet,
  recordResult,
  ROUNDS,
  roundOf,
  type Run,
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
  /** A round of a run (its result counts toward the run) rather than a quick match. */
  event: Event | null;
}

type Event = 'gauntlet' | 'expedition';
type Mode = 'quick' | Event;
const EVENT_NAMES: Record<Event, string> = { gauntlet: 'Gauntlet', expedition: 'Expedition' };

export function App() {
  // A game in progress when the page was closed or reloaded carries on.
  const [saved] = useState(loadGame);
  const [gauntlet, setGauntlet] = useState(loadGauntlet);
  const [expedition, setExpedition] = useState(loadExpedition);
  const [match, setMatch] = useState<Match | null>(
    () =>
      saved && {
        choice: saved.choice,
        seed: saved.seed,
        resume: saved,
        attempt: 0,
        bot: saved.opponent,
        event:
          gauntlet.run?.match === saved.seed
            ? 'gauntlet'
            : expedition.run?.match === saved.seed
              ? 'expedition'
              : null,
      },
  );
  const [mode, setMode] = useState<Mode>(
    () => match?.event ?? (expedition.run ? 'expedition' : gauntlet.run ? 'gauntlet' : 'quick'),
  );
  const [hub, setHub] = useState<Event | null>(null);
  /** Picking Jump In packets for a new expedition. */
  const [jumping, setJumping] = useState(false);
  const [opponent, setOpponent] = useState<BotKind>(
    saved && !match?.event ? saved.opponent : 'easy',
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
      event: null,
    });
  };
  const menu = () => {
    clearGame();
    setMatch(null);
  };

  // ------------------------------------------------- gauntlet and expedition
  const updateGauntlet = (f: (s: GauntletState) => GauntletState) =>
    setGauntlet((s) => {
      const next = f(s);
      saveGauntlet(next);
      return next;
    });
  const updateExpedition = (f: (s: ExpeditionState) => ExpeditionState) =>
    setExpedition((s) => {
      const next = f(s);
      saveExpedition(next);
      return next;
    });
  const runOf = (e: Event): Run | null => (e === 'gauntlet' ? gauntlet.run : expedition.run);
  const paused = (e: Event) => {
    const r = runOf(e);
    return !!r && r.match !== null && loadGame()?.seed === r.match;
  };
  const beginRun = (e: Event, deck: string) => {
    if (e === 'gauntlet') updateGauntlet((s) => startRun(s, deck, newSeed()));
    else updateExpedition((s) => startExpedition(s, deck, newSeed()));
    setHub(e);
  };
  const playRound = (e: Event) => {
    const r = runOf(e);
    if (!r) return;
    const resume = paused(e) ? loadGame() : null;
    const seed = resume?.seed ?? newSeed();
    const round = roundOf(r);
    if (!resume) {
      if (e === 'gauntlet') updateGauntlet((s) => startMatch(s, seed));
      else updateExpedition((s) => startMatch(s, seed));
    }
    const cards =
      e === 'expedition' && expedition.run ? deckCards(expedition.run.build) : undefined;
    setMatch({
      choice: resume?.choice ?? { you: r.deck, them: r.opponents[round]!, cards },
      seed,
      resume,
      attempt: 0,
      bot: ROUNDS[round]!.bot,
      event: e,
    });
  };
  // Leaving a run's match keeps it saved, so the round can be resumed rather than restarted.
  const toHub = (e: Event) => {
    setMatch(null);
    setHub(e);
  };
  const endRun = (e: Event) => {
    if (e === 'gauntlet') updateGauntlet((s) => ({ ...s, run: null }));
    else updateExpedition((s) => ({ ...s, run: null }));
    setHub(null);
    setMode(e);
  };
  const onEnd = (outcome: 'win' | 'loss' | 'draw') => {
    const seed = match?.seed;
    if (seed === undefined) return;
    if (match?.event === 'gauntlet') updateGauntlet((s) => recordResult(s, seed, outcome));
    if (match?.event === 'expedition') updateExpedition((s) => recordExpedition(s, seed, outcome));
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
  if (!match && hub === 'gauntlet' && gauntlet.run)
    return (
      <Gauntlet
        state={gauntlet}
        resumable={paused('gauntlet')}
        onPlay={() => playRound('gauntlet')}
        onAbandon={() => endRun('gauntlet')}
        onAgain={() => beginRun('gauntlet', gauntlet.run!.deck)}
        onMenu={() => setHub(null)}
      />
    );
  if (!match && hub === 'expedition' && expedition.run)
    return (
      <Expedition
        state={expedition}
        update={updateExpedition}
        resumable={paused('expedition')}
        onPlay={() => playRound('expedition')}
        onAbandon={() => endRun('expedition')}
        onAgain={() => {
          // A Jump In run starts over from the packet pick, not the same pair.
          if (!isJumpIn(expedition.run!.deck)) return beginRun('expedition', expedition.run!.deck);
          endRun('expedition');
          setJumping(true);
        }}
        onMenu={() => setHub(null)}
      />
    );
  if (!match && jumping)
    return (
      <JumpIn
        onPick={(deck) => {
          setJumping(false);
          beginRun('expedition', deck);
        }}
        onBack={() => setJumping(false)}
      />
    );
  if (!match)
    return (
      <Start
        mode={mode}
        onMode={setMode}
        runs={mode === 'quick' ? null : mode === 'gauntlet' ? gauntlet : expedition}
        onContinue={() => mode !== 'quick' && setHub(mode)}
        onRun={(deck) => mode !== 'quick' && beginRun(mode, deck)}
        onJumpIn={() => setJumping(true)}
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
        yours={match.event === 'expedition' && expedition.run ? runDeck(expedition.run) : undefined}
        gauntlet={match.event ? runLabel(EVENT_NAMES[match.event], runOf(match.event)) : undefined}
        onMenu={match.event ? () => toHub(match.event!) : menu}
        onRematch={
          match.event
            ? () => toHub(match.event!)
            : () => setMatch((m) => m && { ...m, seed: newSeed(), resume: null, attempt: 0 })
        }
      />
    </ErrorBoundary>
  );
}

function runLabel(name: string, run: Run | null): string {
  if (!run) return name;
  return `${name} · ${statusOf(run) === 'playing' ? `Round ${roundOf(run) + 1} of ${ROUNDS.length}` : 'Final result'}`;
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
  yours,
  gauntlet,
  onEnd,
  onMenu,
  onRematch,
}: {
  choice: DeckChoice;
  seed: number;
  opponent: BotKind;
  resume: SavedGame | null;
  /** The player's deck when it isn't a stock list (an expedition deck). */
  yours?: Decklist;
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
  const deck = (id: string) => deckById(id);
  return (
    <Board
      game={game}
      decks={{ you: yours ?? deck(choice.you), them: deck(choice.them) }}
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
  {
    id: 'expedition',
    name: 'Expedition',
    blurb: 'A starter deck and two packs. Every win opens another; build as you go',
  },
];

function Start({
  mode,
  onMode,
  runs,
  onContinue,
  onRun,
  onJumpIn,
  onPick,
  onView,
  opponent,
  onOpponent,
  theirDeck,
  onTheirDeck,
}: {
  mode: Mode;
  onMode: (m: Mode) => void;
  /** The selected run mode's state (null for quick matches). */
  runs: GauntletState | null;
  onContinue: () => void;
  onRun: (deckId: string) => void;
  onJumpIn: () => void;
  onPick: (deckId: string) => void;
  onView: (deckId: string) => void;
  opponent: BotKind;
  onOpponent: (b: BotKind) => void;
  theirDeck: string | null;
  onTheirDeck: (id: string | null) => void;
}) {
  const run = runs?.run;
  const running = !!run && statusOf(run) === 'playing';
  const name = mode === 'quick' ? '' : EVENT_NAMES[mode];
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
              : mode === 'gauntlet'
                ? 'Choose a deck to take through the gauntlet.'
                : 'Choose a starter deck to set out with.'}
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
        run && <RunBanner name={name} run={run} onContinue={onContinue} />
      )}
      {mode === 'expedition' && (
        <JumpInSection records={runs?.records ?? {}} locked={running} onJumpIn={onJumpIn} />
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
              const record = runs?.records[d.id];
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
                    onClick={() => (mode === 'quick' ? onPick(d.id) : onRun(d.id))}
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

/** The Jump In! entry for expeditions, with the best record over every pair of packets. */
function JumpInSection({
  records,
  locked,
  onJumpIn,
}: {
  records: Record<string, DeckRecord>;
  locked: boolean;
  onJumpIn: () => void;
}) {
  const mine = Object.entries(records)
    .filter(([id]) => isJumpIn(id))
    .map(([, r]) => r);
  const clears = mine.reduce((n, r) => n + r.clears, 0);
  const best = Math.max(0, ...mine.map((r) => r.best));
  return (
    <section className="start__section">
      <h2 className="start__section-title">
        Jump In!
        <span>Pick two themed half-decks and shuffle them together</span>
      </h2>
      <div className={`start__decks ${locked ? 'is-waiting' : ''}`}>
        <div className="deck-slot">
          <button
            className="deck"
            style={
              {
                '--art': `url("${scryfallById.get(slug(JUMP_IN_FACE))?.image?.artCrop ?? ''}")`,
                '--glow': 'var(--mana-R)',
                '--i': 0,
              } as React.CSSProperties
            }
            disabled={locked}
            onClick={onJumpIn}
          >
            <span className="deck__art" />
            {mine.length > 0 && (
              <span className={`deck__record ${clears ? 'is-cleared' : ''}`}>
                {clears
                  ? `★ Cleared${clears > 1 ? ` ×${clears}` : ''}`
                  : `Best ${best}/${ROUNDS.length}`}
              </span>
            )}
            <span className="deck__pips">
              {(['W', 'U', 'B', 'R', 'G'] as const).map((c) => (
                <span key={c} className={`pip pip--${c}`} />
              ))}
            </span>
            <span className="deck__name">Jump In!</span>
            <span className="deck__blurb">A new 40-card deck every run</span>
          </button>
        </div>
      </div>
    </section>
  );
}

const JUMP_IN_FACE = 'Krenko, Mob Boss';

/** The run in progress (or just finished), on the start screen. */
function RunBanner({ name, run, onContinue }: { name: string; run: Run; onContinue: () => void }) {
  const deck = deckById(run.deck);
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
              ? `${name} cleared!`
              : 'Run over'}
        </span>
      </div>
      <button className="btn btn--primary" onClick={onContinue}>
        {status === 'playing' ? 'Continue run' : 'See result'}
      </button>
    </div>
  );
}
