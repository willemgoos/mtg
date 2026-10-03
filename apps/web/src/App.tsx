import {
  DECKS,
  deckById,
  type Decklist,
  isBrawl,
  isJumpIn,
  isPlayable,
  registerDeck,
  scryfallById,
  slug,
} from '@mtg/cards';
import { useCallback, useEffect, useState } from 'react';
import { Board } from './components/Board.tsx';
import { DeckView } from './components/DeckView.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { Expedition } from './components/Expedition.tsx';
import { Gauntlet } from './components/Gauntlet.tsx';
import { type Event, Home, isEvent, type Mode, Nav, type Tab } from './components/Home.tsx';
import { JumpIn } from './components/JumpIn.tsx';
import { Season } from './components/Season.tsx';
import type { BotKind } from './game/bot.worker.ts';
import { artFor, BLURBS } from './game/deckArt.ts';
import * as X from './game/expedition.ts';
import {
  type DeckRecord,
  type GauntletState,
  loadGauntlet,
  recordResult,
  ROUNDS,
  roundOf,
  type RunSummary,
  saveGauntlet,
  startMatch,
  startRun,
  summarize,
} from './game/gauntlet.ts';
import { clearGame, loadGame, type SavedGame } from './game/saved.ts';
import { createSeasonRepository } from './game/seasonStorage.ts';
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
    title: 'Bloomburrow',
    blurb: 'Our two-colour decks from Bloomburrow, built to face the starter decks',
    series: 'starter' as const,
    set: 'blb' as const,
  },
  {
    title: 'Marvel Super Heroes',
    blurb: 'Our two-colour decks from Marvel Super Heroes, built to face the starter decks',
    series: 'starter' as const,
    set: 'msh' as const,
  },
  {
    title: 'Final Fantasy',
    blurb: 'Our two-colour decks from Final Fantasy, built to face the starter decks',
    series: 'starter' as const,
    set: 'fin' as const,
  },
  {
    title: 'Strixhaven',
    blurb: 'Our two-colour decks from Strixhaven: School of Mages, built to face the starter decks',
    series: 'starter' as const,
    set: 'stx' as const,
  },
  {
    title: 'Color Challenge',
    blurb: 'The mono-colour decks Sparky plays against new players',
    series: 'colorChallenge' as const,
  },
].map(
  ({
    series,
    set,
    ...s
  }: {
    title: string;
    blurb: string;
    series: string;
    set?: 'blb' | 'msh' | 'fin' | 'stx';
  }) => {
    const decks = DECKS.filter((d) => d.series === series && d.set === set);
    return { ...s, decks: [...decks.filter(isPlayable), ...decks.filter((d) => !isPlayable(d))] };
  },
);
/** Brawl's own deck grid: commander decks only play each other. */
const BRAWL_SECTIONS: { title: string; blurb: string; decks: Decklist[] }[] = [
  {
    title: 'Brawl',
    blurb: '100-card singleton decks led by a legendary commander, 25 life',
    decks: [
      ...DECKS.filter((d) => isBrawl(d) && isPlayable(d)),
      ...DECKS.filter((d) => isBrawl(d) && !isPlayable(d)),
    ],
  },
];
const PLAYABLE = DECKS.filter(isPlayable);

/**
 * Decks built in Season mode (every save) that are big enough to set out with,
 * registered so they can be viewed and played by id like our own.
 */
function seasonDecks(): Decklist[] {
  try {
    const decks = createSeasonRepository(localStorage)
      .load()
      .saves.flatMap((save) => save.decks.map((d) => X.seasonDecklist(save.id, d)))
      .filter((d) => d.cards.reduce((n, [, k]) => n + k, 0) >= X.MIN_DECK);
    decks.forEach(registerDeck);
    return decks;
  } catch {
    return [];
  }
}

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

const EVENT_NAMES: Record<Event, string> = { gauntlet: 'Gauntlet', expedition: 'Expedition' };

export function App() {
  // A game in progress when the page was closed or reloaded carries on.
  const [saved] = useState(loadGame);
  const [gauntlet, setGauntlet] = useState(loadGauntlet);
  const [expedition, setExpedition] = useState(X.loadExpedition);
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
  const [tab, setTab] = useState<Tab>('home');
  const [seasonOpen, setSeasonOpen] = useState(false);
  const [lastQuick, setLastQuick] = useState(loadLastQuick);
  const pick = (you: string, bot = opponent) => {
    const seed = newSeed();
    // A chosen opponent deck from the other kind (Brawl or 60 cards) doesn't apply.
    const chosen = theirDeck && isBrawl(deckById(theirDeck)) === isBrawl(deckById(you));
    const them = chosen ? theirDeck : randomOther(you, seed);
    setLastQuick(saveLastQuick({ deck: you, opponent: bot }));
    setMatch({
      choice: { you, them },
      seed,
      resume: null,
      attempt: 0,
      bot,
      event: null,
    });
  };
  const openDecks = (m: Mode) => {
    setMode(m);
    setTab('decks');
  };
  const menu = () => {
    clearGame();
    setMatch(null);
    setTab('home');
  };

  // ------------------------------------------------- gauntlet and expedition
  const updateGauntlet = (f: (s: GauntletState) => GauntletState) =>
    setGauntlet((s) => {
      const next = f(s);
      saveGauntlet(next);
      return next;
    });
  const updateExpedition = (f: (s: X.ExpeditionState) => X.ExpeditionState) =>
    setExpedition((s) => {
      const next = f(s);
      X.saveExpedition(next);
      return next;
    });
  const summaries: Record<Event, RunSummary | null> = {
    gauntlet: gauntlet.run && summarize(gauntlet.run),
    expedition: expedition.run && X.summarize(expedition.run),
  };
  const paused = (e: Event) => {
    const m = e === 'gauntlet' ? gauntlet.run?.match : expedition.run?.match;
    return m != null && loadGame()?.seed === m;
  };
  const beginRun = (e: Event, deck: string) => {
    if (e === 'gauntlet') updateGauntlet((s) => startRun(s, deck, newSeed()));
    else updateExpedition((s) => X.startExpedition(s, deck, newSeed()));
    setHub(e);
  };
  const playRound = (e: Event) => {
    const resume = paused(e) ? loadGame() : null;
    const seed = resume?.seed ?? newSeed();
    const start = (choice: DeckChoice, bot: BotKind) =>
      setMatch({ choice: resume?.choice ?? choice, seed, resume, attempt: 0, bot, event: e });
    if (e === 'gauntlet') {
      const r = gauntlet.run;
      if (!r) return;
      if (!resume) updateGauntlet((s) => startMatch(s, seed));
      const round = roundOf(r);
      return start({ you: r.deck, them: r.opponents[round]! }, ROUNDS[round]!.bot);
    }
    const r = expedition.run;
    const at = r && X.currentNode(r);
    if (!r || !at?.node.opponent) return;
    if (!resume) updateExpedition((s) => X.startMatch(s, seed));
    start(
      {
        you: r.deck,
        them: at.node.opponent,
        cards: X.deckCards(r.build),
        options: X.gameOptions(r),
      },
      X.botFor(at.floor, at.node, X.floorsOf(r)),
    );
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
  /** Home's Play button: carry on a run, replay the last quick match, or go pick a deck. */
  const playHome = (m: Mode) => {
    setMode(m);
    if (isEvent(m) && summaries[m]) return setHub(m);
    // Replay the last single game if it was in this mode (Brawl decks only play Brawl).
    const brawlDeck = lastQuick && isBrawl(deckById(lastQuick.deck));
    if (!isEvent(m) && lastQuick && brawlDeck === (m === 'brawl'))
      return pick(lastQuick.deck, lastQuick.opponent);
    setTab('decks');
  };
  const onEnd = (outcome: 'win' | 'loss' | 'draw') => {
    const seed = match?.seed;
    if (seed === undefined) return;
    if (match?.event === 'gauntlet') updateGauntlet((s) => recordResult(s, seed, outcome));
    if (match?.event === 'expedition') updateExpedition((s) => X.recordMatch(s, seed, outcome));
  };
  const back = useCallback(() => setViewing(null), []);
  if (seasonOpen) return <Season onHome={() => setSeasonOpen(false)} />;
  if (!match && viewing)
    return (
      <DeckView
        deck={deckById(viewing)}
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
        onMenu={() => {
          setHub(null);
          setTab('home');
        }}
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
          const r = expedition.run!;
          if (!isJumpIn(r.deck)) return beginRun('expedition', r.deck);
          endRun('expedition');
          setJumping(true);
        }}
        onContinue={() => updateExpedition((s) => X.continueExpedition(s, newSeed()))}
        onMenu={() => {
          setHub(null);
          setTab('home');
        }}
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
  if (!match && tab === 'home')
    return (
      <Home
        mode={mode}
        onMode={setMode}
        runs={summaries}
        clears={clearsOf(gauntlet) + clearsOf(expedition)}
        quick={
          lastQuick && {
            deck: deckById(lastQuick.deck),
            opponent: OPPONENTS.find((o) => o.id === lastQuick.opponent)!.name,
          }
        }
        onPlay={playHome}
        onDecks={openDecks}
        onJumpIn={() => setJumping(true)}
        onTab={setTab}
        onSeason={() => setSeasonOpen(true)}
      />
    );
  if (!match)
    return (
      <Start
        onTab={setTab}
        clears={clearsOf(gauntlet) + clearsOf(expedition)}
        mode={mode}
        onMode={setMode}
        run={isEvent(mode) ? summaries[mode] : null}
        records={!isEvent(mode) ? {} : mode === 'gauntlet' ? gauntlet.records : expedition.records}
        onContinue={() => isEvent(mode) && setHub(mode)}
        onRun={(deck) => isEvent(mode) && beginRun(mode, deck)}
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
        yours={
          match.event === 'expedition' && expedition.run ? X.runDeck(expedition.run) : undefined
        }
        gauntlet={
          match.event ? runLabel(EVENT_NAMES[match.event], summaries[match.event]) : undefined
        }
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

function runLabel(name: string, run: RunSummary | null): string {
  if (!run) return name;
  return `${name} · ${run.status === 'playing' ? `${run.unit} ${run.step} of ${run.steps}` : 'Final result'}`;
}

const clearsOf = (s: { records: Record<string, DeckRecord> }) =>
  Object.values(s.records).reduce((n, r) => n + r.clears, 0);

interface LastQuick {
  deck: string;
  opponent: BotKind;
}
const LAST_QUICK = 'mtg.lastQuick';

function loadLastQuick(): LastQuick | null {
  try {
    const q = JSON.parse(localStorage.getItem(LAST_QUICK) ?? 'null') as LastQuick | null;
    const known = q && DECKS.some((d) => d.id === q.deck && isPlayable(d));
    return known && OPPONENTS.some((o) => o.id === q.opponent) ? q : null;
  } catch {
    return null;
  }
}

function saveLastQuick(q: LastQuick): LastQuick {
  try {
    localStorage.setItem(LAST_QUICK, JSON.stringify(q));
  } catch {
    // Storage unavailable: Play on the home screen just opens the deck picker.
  }
  return q;
}

function newSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}

/** A random playable deck for the bot, other than the player's when possible. */
function randomOther(you: string, seed: number): string {
  // Same series as the player's deck (Color Challenge decks meet each other, like on Arena).
  const series = DECKS.find((d) => d.id === you)?.series;
  const others = PLAYABLE.filter((d) => d.id !== you && d.series === series);
  // Brawl decks only meet Brawl decks (a mirror match if there is no other).
  const pool = others.length ? others : PLAYABLE.filter((d) => isBrawl(d) === (series === 'brawl'));
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
  { id: 'brawl', name: 'Brawl', blurb: '1v1 Commander: 100-card decks, 25 life' },
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
  onTab,
  clears,
  mode,
  onMode,
  run,
  records,
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
  onTab: (t: Tab) => void;
  clears: number;
  mode: Mode;
  onMode: (m: Mode) => void;
  /** The selected run mode's state (null for quick matches). */
  run: RunSummary | null;
  records: Record<string, DeckRecord>;
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
  const running = run?.status === 'playing';
  const name = isEvent(mode) ? EVENT_NAMES[mode] : '';
  const single = !isEvent(mode);
  const [season] = useState(seasonDecks);
  // Expeditions can also set out with a deck built in Season mode.
  const sections =
    mode === 'brawl'
      ? BRAWL_SECTIONS
      : mode === 'expedition' && season.length
        ? [
            SECTIONS[0]!,
            { title: 'Your Season decks', blurb: 'Decks you built in Season mode', decks: season },
            ...SECTIONS.slice(1),
          ]
        : SECTIONS;
  const steps = mode === 'expedition' ? X.FLOORS : ROUNDS.length;
  return (
    <div className="decks-page">
      <Nav tab="decks" onTab={onTab} clears={clears} />
      <div className="start">
        <div className="start__title">
          <h1>{mode === 'quick' ? 'Quick match' : mode === 'brawl' ? 'Brawl' : name}</h1>
          <p>
            {single
              ? 'Choose your opponent, then your deck.'
              : running
                ? 'Your run is waiting.'
                : mode === 'gauntlet'
                  ? 'Choose a deck to take through the gauntlet.'
                  : 'Choose a deck to set out with.'}
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
        {single ? (
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
                {sections.map((s) => (
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
          <JumpInSection records={records} locked={running} onJumpIn={onJumpIn} />
        )}
        {sections.map((section, si) => (
          <section key={section.title} className="start__section">
            <h2 className="start__section-title">
              {section.title}
              <span>{section.blurb}</span>
            </h2>
            <div className={`start__decks ${running ? 'is-waiting' : ''}`}>
              {section.decks.map((d, j) => {
                const i = si * 10 + j;
                const locked = !isPlayable(d);
                const record = single ? undefined : records[d.id];
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
                      onClick={() => (single ? onPick(d.id) : onRun(d.id))}
                    >
                      <span className="deck__art" />
                      {record && record.runs > 0 && (
                        <span className={`deck__record ${record.clears ? 'is-cleared' : ''}`}>
                          {record.clears
                            ? `★ Cleared${record.clears > 1 ? ` ×${record.clears}` : ''}`
                            : `Best ${record.best}/${steps}`}
                        </span>
                      )}
                      <span className="deck__pips">
                        {d.colors.map((c) => (
                          <span key={c} className={`pip pip--${c}`} />
                        ))}
                      </span>
                      <span className="deck__name">{d.name}</span>
                      <span className="deck__blurb">
                        {locked
                          ? 'Coming soon'
                          : (BLURBS[d.id] ??
                            `${d.cards.reduce((n, [, k]) => n + k, 0)} cards from Season`)}
                      </span>
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
                  : `Best ${best}/${X.FLOORS}`}
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
function RunBanner({
  name,
  run,
  onContinue,
}: {
  name: string;
  run: RunSummary;
  onContinue: () => void;
}) {
  const deck = deckById(run.deck);
  const status = run.status;
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
            ? `${run.unit} ${run.step} of ${run.steps} · ${run.livesLeft} ${run.livesLeft === 1 ? 'life' : 'lives'} left`
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
