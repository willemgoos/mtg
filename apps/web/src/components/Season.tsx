import { cardDb, type Decklist, scryfallById, slug } from '@mtg/cards';
import { type Action, type Color } from '@mtg/engine';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  copyLimit,
  deckErrors,
  isBasic,
  putSeasonDeck,
  renameSeasonSave,
  replaySeasonMatch,
  resolveSeasonMatch,
  SEASON_STARTERS,
  selectSeasonDeck,
  type Counts,
  type SeasonSave,
} from '../game/season.ts';
import {
  finishSeasonMatch,
  queueSeasonMatch,
  recordSeasonAction,
  resumeSeasonGame,
} from '../game/seasonMatch.ts';
import { createSeasonRepository, type SeasonLibrary } from '../game/seasonStorage.ts';
import type { SavedGame } from '../game/saved.ts';
import { useGame } from '../game/useGame.ts';
import { artFor } from '../game/deckArt.ts';
import { Board } from './Board.tsx';
import { DeckBuilder } from './DeckBuilder.tsx';
import { ErrorBoundary } from './ErrorBoundary.tsx';
import { UiSize } from './UiSize.tsx';
import { SeasonEconomy, SeasonCrafting } from './SeasonEconomy.tsx';
import './season.css';

const now = (save: SeasonSave) => Math.max(Date.now(), save.updatedAt);
const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));
const namedCounts = (cards: Counts) =>
  Object.fromEntries(Object.entries(cards).map(([id, n]) => [cardDb.get(id)!.name, n]));
type Repository = ReturnType<typeof createSeasonRepository>;
type Form = 'create' | 'rename' | 'reset' | 'deck';
interface Session {
  saveId: string;
  matchId: number;
  game: SavedGame;
  yours: Decklist;
  attempt: number;
}

function displayDeck(id: string, name: string, cards: Counts): Decklist {
  const ids = Object.keys(cards);
  const face = ids.find((id) => cardDb.get(id)!.types.includes('Creature')) ?? ids[0] ?? 'plains';
  const colors = [...new Set(ids.flatMap((id) => scryfallById.get(id)!.colors))] as Color[];
  return {
    id,
    name,
    colors,
    face: cardDb.get(face)!.name,
    source: 'custom',
    series: 'starter',
    cards: Object.entries(namedCounts(cards)),
  };
}
function sessionFor(save: SeasonSave, attempt = 0): Session {
  const match = save.match!;
  const cards: Counts = {};
  for (const id of match.decks.p1) cards[id] = (cards[id] ?? 0) + 1;
  return {
    saveId: save.id,
    matchId: match.id,
    game: resumeSeasonGame(save),
    attempt,
    yours: displayDeck('season-match', match.playerDeckName ?? 'Season deck', cards),
  };
}

export function Season({ onHome }: { onHome: () => void }) {
  const repository = useMemo(
    () =>
      createSeasonRepository({
        getItem: (key) => localStorage.getItem(key),
        setItem: (key, value) => localStorage.setItem(key, value),
      }),
    [],
  );
  const [data, setData] = useState<{ library: SeasonLibrary | null; error: string | null }>(() => {
    try {
      return { library: repository.load(), error: null };
    } catch (e) {
      return { library: null, error: errorMessage(e) };
    }
  });
  const [form, setForm] = useState<Form | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const save = data.library?.saves.find((s) => s.id === data.library!.activeSaveId);

  function transact(operation: (repo: Repository) => SeasonLibrary): SeasonLibrary | null {
    try {
      const library = operation(repository);
      setData({ library, error: null });
      return library;
    } catch (e) {
      setData((s) => ({ ...s, error: errorMessage(e) }));
      return null;
    }
  }
  const update = (change: (s: SeasonSave) => SeasonSave) =>
    save && transact((repo) => repo.update(save.id, change));
  function play() {
    if (!save) return;
    const library = update((s) =>
      s.match ? finishSeasonMatch(s, now(s)) : queueSeasonMatch(s, now(s)),
    );
    const next = library?.saves.find((s) => s.id === save.id);
    if (next?.match) setSession(sessionFor(next));
  }
  function abandon() {
    if (!save?.match) return;
    const coins = replaySeasonMatch(save.match).playerTurnsBegun >= 5 ? 50 : 0;
    if (window.confirm(`Abandon this match? You will receive ${coins} coins.`)) {
      update((s) => {
        const settled = finishSeasonMatch(s, now(s));
        return settled.match
          ? resolveSeasonMatch(settled, settled.match.id, 'concede', now(settled))
          : settled;
      });
    }
  }
  function persistAction(action: Action) {
    if (!session) throw new Error('No active Season session');
    const library = repository.update(session.saveId, (s) =>
      recordSeasonAction(s, session.matchId, action, now(s)),
    );
    setData({ library, error: null });
  }
  function retry() {
    const library = transact((repo) => repo.load());
    const current = library?.saves.find((s) => s.id === session?.saveId);
    if (current?.match) setSession(sessionFor(current, (session?.attempt ?? 0) + 1));
    else if (library) setSession(null);
  }
  function submit(name: string, starter: string) {
    const done =
      form === 'create'
        ? transact((repo) =>
            repo.create(
              crypto.randomUUID(),
              name,
              starter,
              Math.floor(Math.random() * 0x80000000),
              Date.now(),
            ),
          )
        : form === 'rename' && save
          ? update((s) => renameSeasonSave(s, name, now(s)))
          : form === 'reset' && save
            ? transact((repo) =>
                repo.reset(
                  save.id,
                  starter,
                  Math.floor(Math.random() * 0x80000000),
                  now(save),
                  true,
                ),
              )
            : form === 'deck' && save
              ? update((s) => {
                  const id = crypto.randomUUID();
                  return selectSeasonDeck(
                    putSeasonDeck(s, { id, name, cards: {} }, now(s)),
                    id,
                    now(s),
                  );
                })
              : null;
    if (done) {
      const active = done.saves.find((s) => s.id === done.activeSaveId)!;
      setEditing(form === 'deck' ? active.selectedDeckId : null);
      setForm(null);
    }
  }
  async function importFile(selected: File) {
    try {
      const raw = await selected.text();
      const backup = JSON.parse(raw);
      const name =
        typeof backup?.save?.name === 'string'
          ? `${backup.save.name.slice(0, 109)} (imported)`
          : undefined;
      if (transact((repo) => repo.importSave(raw, crypto.randomUUID(), name))) setEditing(null);
    } catch (e) {
      setData((s) => ({ ...s, error: errorMessage(e) }));
    }
  }
  function exportFile() {
    if (!save) return;
    try {
      const raw = repository.exportSave(save.id);
      const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `season-${save.id}.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setData((s) => ({ ...s, error: errorMessage(e) }));
    }
  }

  if (session) {
    const current = data.library!.saves.find((s) => s.id === session.saveId)!;
    return (
      <ErrorBoundary
        key={`${session.saveId}:${session.matchId}:${session.attempt}`}
        onRetry={retry}
        onMenu={() => setSession(null)}
        menuLabel="Return to Season"
      >
        <SeasonGame
          session={session}
          save={current}
          onAction={persistAction}
          onBack={() => setSession(null)}
        />
      </ErrorBoundary>
    );
  }
  const deck = save?.decks.find((d) => d.id === editing);
  if (save && deck)
    return (
      <SeasonEditor
        save={save}
        deckId={deck.id}
        error={data.error}
        update={update}
        onBack={() => setEditing(null)}
      />
    );

  return (
    <div className="season-page">
      <header className="season-bar">
        <button className="btn btn--ghost" onClick={onHome}>
          Home
        </button>
        <h1>Season</h1>
        <UiSize />
      </header>
      <main className="season-main">
        {data.error && (
          <div className="season-error" role="alert">
            {data.error}
            <button className="btn btn--ghost" onClick={() => transact((repo) => repo.load())}>
              Retry loading saves
            </button>
          </div>
        )}
        {data.library && (
          <>
            <section className="season-saves" aria-label="Save management">
              {save && (
                <label>
                  Save
                  <select
                    aria-label="Current save"
                    value={save.id}
                    onChange={(e) => transact((repo) => repo.switchSave(e.target.value))}
                  >
                    {data.library.saves.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <button className="btn btn--ghost" onClick={() => setForm('create')}>
                New save
              </button>
              {save && (
                <>
                  <button className="btn btn--ghost" onClick={() => setForm('rename')}>
                    Rename save
                  </button>
                  <button className="btn btn--ghost" onClick={exportFile}>
                    Export backup
                  </button>
                </>
              )}
              <button className="btn btn--ghost" onClick={() => file.current?.click()}>
                Import backup
              </button>
              {save && (
                <button className="btn btn--ghost" onClick={() => setForm('reset')}>
                  Reset save
                </button>
              )}
              <input
                hidden
                ref={file}
                type="file"
                accept=".json,application/json"
                onChange={(e) => {
                  const selected = e.target.files?.[0];
                  e.target.value = '';
                  if (selected) void importFile(selected);
                }}
              />
            </section>
            {!save ? (
              <section className="season-panel">
                <h2>Start a Season</h2>
                <p>Choose a starter deck. Your save begins with its cards and 400 coins.</p>
                <button className="btn btn--primary" onClick={() => setForm('create')}>
                  Choose starter
                </button>
              </section>
            ) : (
              <>
                <section className="season-panel season-play">
                  <div>
                    <h2>{save.name}</h2>
                    <p>
                      <strong>{save.coins}</strong> coins ·{' '}
                      {Object.values(save.collection).reduce((n, c) => n + c, 0)} collected cards
                    </p>
                    {save.lastResult && !save.match && (
                      <p role="status">
                        {save.lastResult.outcome === 'win'
                          ? 'Victory'
                          : save.lastResult.outcome === 'draw'
                            ? 'Draw'
                            : save.lastResult.outcome === 'concede'
                              ? 'Conceded'
                              : 'Defeat'}{' '}
                        · +{save.lastResult.coins} coins
                      </p>
                    )}
                    {save.match && (
                      <p>
                        Match saved ·{' '}
                        {SEASON_STARTERS.find((d) => d.id === save.match!.opponentDeckId)!.name}
                      </p>
                    )}
                  </div>
                  <div className="season-actions">
                    <button
                      className="btn btn--primary"
                      disabled={
                        !save.match &&
                        deckErrors(
                          save,
                          save.decks.find((d) => d.id === save.selectedDeckId)!,
                        ).length > 0
                      }
                      onClick={play}
                    >
                      {save.match ? 'Resume match' : 'Play'}
                    </button>
                    {save.match && (
                      <button className="btn btn--ghost" onClick={abandon}>
                        Abandon match
                      </button>
                    )}
                  </div>
                </section>
                <div className="season-section">
                  <h2>Your decks</h2>
                  <button className="btn btn--ghost" onClick={() => setForm('deck')}>
                    New deck
                  </button>
                </div>
                <section className="season-decks" aria-label="Your decks">
                  {save.decks.map((d) => {
                    const display = displayDeck(d.id, d.name, d.cards);
                    const issues = deckErrors(save, d);
                    return (
                      <article
                        className={`season-deck ${d.id === save.selectedDeckId ? 'is-selected' : ''}`}
                        key={d.id}
                      >
                        <img src={artFor(display)} alt="" />
                        <div>
                          <h3>{d.name}</h3>
                          <p>
                            {Object.values(d.cards).reduce((n, c) => n + c, 0)} cards
                            {d.id === save.selectedDeckId ? ' · Selected' : ''}
                          </p>
                          {issues.length > 0 && (
                            <p className="season-warning">{issues.join('. ')}</p>
                          )}
                          <div className="season-actions">
                            <button
                              className="btn btn--ghost"
                              aria-pressed={d.id === save.selectedDeckId}
                              onClick={() => update((s) => selectSeasonDeck(s, d.id, now(s)))}
                            >
                              Select
                            </button>
                            <button className="btn btn--ghost" onClick={() => setEditing(d.id)}>
                              Edit
                            </button>
                            <button
                              className="btn btn--ghost"
                              onClick={() =>
                                update((s) =>
                                  putSeasonDeck(
                                    s,
                                    {
                                      ...d,
                                      id: crypto.randomUUID(),
                                      name: `${d.name.slice(0, 110)} copy`,
                                    },
                                    now(s),
                                  ),
                                )
                              }
                            >
                              Copy
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </section>
                <SeasonEconomy key={save.id} save={save} update={update} error={data.error} />
              </>
            )}
          </>
        )}
      </main>
      {form && (
        <SeasonForm
          key={form}
          form={form}
          save={save}
          error={data.error}
          onCancel={() => setForm(null)}
          onSubmit={submit}
        />
      )}
    </div>
  );
}

function SeasonForm({
  form,
  save,
  error,
  onCancel,
  onSubmit,
}: {
  form: Form;
  save?: SeasonSave;
  error: string | null;
  onCancel: () => void;
  onSubmit: (name: string, starter: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState(form === 'rename' || form === 'reset' ? save!.name : '');
  const [starter, setStarter] = useState(SEASON_STARTERS[0]!.id);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const choosing = form === 'create' || form === 'reset';
  const title =
    form === 'create'
      ? 'New Season'
      : form === 'reset'
        ? `Reset ${save!.name}?`
        : form === 'rename'
          ? 'Rename save'
          : 'New deck';
  return (
    <dialog
      ref={dialog}
      className="season-dialog"
      onCancel={onCancel}
      aria-labelledby="season-form-title"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(name, starter);
        }}
      >
        <h2 id="season-form-title">{title}</h2>
        {form === 'reset' ? (
          <p>
            This removes this save’s collection, coins, decks, and unfinished match. Start again
            with a free starter and 400 coins. Other saves are kept.
          </p>
        ) : (
          <label>
            Name
            <input
              autoFocus
              required
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
        )}
        {choosing && (
          <label>
            Starter deck
            <select value={starter} onChange={(e) => setStarter(e.target.value)}>
              {SEASON_STARTERS.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {choosing && (
          <details>
            <summary>View starter contents</summary>
            <ul>
              {SEASON_STARTERS.find((d) => d.id === starter)!.cards.map(([name, count]) => (
                <li key={name}>
                  {count} × {name}
                </li>
              ))}
            </ul>
          </details>
        )}
        {error && (
          <p role="alert" className="season-warning">
            {error}
          </p>
        )}
        <div className="season-actions">
          <button className="btn btn--primary" disabled={!name.trim()}>
            {form === 'reset' ? 'Reset this save' : form === 'create' ? 'Start Season' : 'Save'}
          </button>
          <button type="button" className="btn btn--ghost" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </dialog>
  );
}

function SeasonEditor({
  save,
  deckId,
  error,
  update,
  onBack,
}: {
  save: SeasonSave;
  deckId: string;
  error: string | null;
  update: (change: (s: SeasonSave) => SeasonSave) => unknown;
  onBack: () => void;
}) {
  const deck = save.decks.find((d) => d.id === deckId)!;
  const [name, setName] = useState(deck.name);
  const display = displayDeck(deck.id, deck.name, deck.cards);
  const pool = Object.fromEntries(
    Object.entries(save.collection).map(([id, count]) => [
      cardDb.get(id)!.name,
      Math.max(0, Math.min(count, copyLimit(id)) - (deck.cards[id] ?? 0)),
    ]),
  );
  function move(card: string, delta: number) {
    const id = slug(card);
    update((s) => {
      const current = s.decks.find((d) => d.id === deckId)!;
      const cards = { ...current.cards };
      const n = (cards[id] ?? 0) + delta;
      if (n < 0) return s;
      if (!isBasic(id) && n > Math.min(s.collection[id] ?? 0, copyLimit(id))) return s;
      if (n) cards[id] = n;
      else delete cards[id];
      return putSeasonDeck(s, { ...current, cards }, now(s));
    });
  }
  return (
    <DeckBuilder
      name={deck.name}
      colors={display.colors}
      art={artFor(display)}
      deck={namedCounts(deck.cards)}
      pool={pool}
      basics
      min={60}
      tools={
        <>
          <button className="btn btn--ghost" onClick={onBack}>
            Back to Season
          </button>
          <SeasonCrafting save={save} update={update} error={error} />
          <input
            aria-label="Deck name"
            maxLength={120}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button
            className="btn btn--ghost"
            disabled={!name.trim()}
            onClick={() => update((s) => putSeasonDeck(s, { ...deck, name }, now(s)))}
          >
            Rename
          </button>
          {error && <span role="alert">{error}</span>}
        </>
      }
      onAdd={(card) => move(card, 1)}
      onRemove={(card) => move(card, -1)}
      onDone={onBack}
    />
  );
}

function SeasonGame({
  session,
  save,
  onAction,
  onBack,
}: {
  session: Session;
  save: SeasonSave;
  onAction: (action: Action) => void;
  onBack: () => void;
}) {
  const resume = session.game;
  const game = useGame(resume.choice, resume.seed, resume.opponent, resume, onAction);
  const turns = save.match ? replaySeasonMatch(save.match).playerTurnsBegun : 0;
  const reward = save.lastResult?.matchId === session.matchId ? save.lastResult.coins : null;
  return (
    <Board
      game={game}
      decks={{
        you: session.yours,
        them: SEASON_STARTERS.find((d) => d.id === resume.choice.them)!,
      }}
      gauntlet="Season"
      resultText={reward === null ? undefined : `+${reward} coins · ${save.coins} coins total`}
      concedeText={`Concede this match? You will receive ${turns >= 5 ? 50 : 0} coins.${turns < 5 ? ' Loss rewards for concessions begin on your fifth turn.' : ''}`}
      pauseText="Pause this match? Your progress is saved and you can resume later."
      onMenu={onBack}
      onRematch={onBack}
    />
  );
}
