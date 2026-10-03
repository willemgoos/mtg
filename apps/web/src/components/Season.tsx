import { cardDb, type Decklist, findDeck, scryfallById, slug } from '@mtg/cards';
import { type Action, type Color } from '@mtg/engine';
import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import {
  copyLimit,
  deckErrors,
  isBasic,
  openSeasonPack,
  PACK_PRICE,
  putSeasonDeck,
  RARITIES,
  renameSeasonSave,
  replaySeasonMatch,
  resolveSeasonMatch,
  SEASON_CARDS,
  SEASON_STARTERS,
  selectSeasonDeck,
  type Counts,
  type SeasonDeck,
  type SeasonSave,
} from '../game/season.ts';
import {
  finishSeasonMatch,
  queueSeasonMatch,
  recordSeasonAction,
  resumeSeasonGame,
} from '../game/seasonMatch.ts';
import { createSeasonRepository, type SeasonLibrary } from '../game/seasonStorage.ts';
import { packGenerator } from '../game/seasonPacks.ts';
import type { SavedGame } from '../game/saved.ts';
import { useGame } from '../game/useGame.ts';
import { artFor, BLURBS } from '../game/deckArt.ts';
import { Board } from './Board.tsx';
import { DeckBuilder } from './DeckBuilder.tsx';
import { ErrorBoundary } from './ErrorBoundary.tsx';
import { BoosterReveal, wildcardName } from './PackOpening.tsx';
import { UiSize } from './UiSize.tsx';
import {
  Booster,
  CollectionProgress,
  Currencies,
  DeckTile,
  fmt,
  Modal,
  Price,
  RewardTracks,
  SeasonCollection,
  SeasonCrafting,
  SeasonPacks,
  SeasonStore,
} from './SeasonEconomy.tsx';
import './home.css';
import './season.css';

const now = (save: SeasonSave) => Math.max(Date.now(), save.updatedAt);
const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));
const namedCounts = (cards: Counts) =>
  Object.fromEntries(Object.entries(cards).map(([id, n]) => [cardDb.get(id)!.name, n]));
/** Engine messages name cards by slug; show their printed names. */
const readable = (message: string) =>
  message.replace(/\b[a-z0-9]+(?:-[a-z0-9]+)+\b/g, (id) => cardDb.get(id)?.name ?? id);
const size = (cards: Counts) => Object.values(cards).reduce((n, c) => n + c, 0);
const seed = () => Math.floor(Math.random() * 0x80000000);

type Repository = ReturnType<typeof createSeasonRepository>;
type View = 'play' | 'decks' | 'collection' | 'packs' | 'store';
const VIEWS: [View, string][] = [
  ['play', 'Overview'],
  ['decks', 'Decks'],
  ['collection', 'Collection'],
  ['packs', 'Packs'],
  ['store', 'Store'],
];
/** Full-screen flows that replace the hub. */
type Flow = { kind: 'new' } | { kind: 'reset' } | { kind: 'pack' } | null;
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
  const [view, setView] = useState<View>('play');
  const [flow, setFlow] = useState<Flow>(null);
  const [renaming, setRenaming] = useState(false);
  const [abandoning, setAbandoning] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const save = data.library?.saves.find((s) => s.id === data.library!.activeSaveId);
  const error = data.error && readable(data.error);

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
    setAbandoning(false);
    update((s) => {
      const settled = finishSeasonMatch(s, now(s));
      return settled.match
        ? resolveSeasonMatch(settled, settled.match.id, 'concede', now(settled))
        : settled;
    });
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
  function start(name: string, starter: string) {
    const done =
      flow?.kind === 'reset' && save
        ? transact((repo) => repo.reset(save.id, starter, seed(), now(save), true))
        : transact((repo) => repo.create(crypto.randomUUID(), name, starter, seed(), Date.now()));
    if (done) {
      setFlow(null);
      setEditing(null);
      setView('play');
    }
  }
  function newDeck() {
    const id = crypto.randomUUID();
    const n = (save?.decks.length ?? 0) + 1;
    if (update((s) => putSeasonDeck(s, { id, name: `Deck ${n}`, cards: {} }, now(s))))
      setEditing(id);
  }
  function openPack() {
    if (!save?.packs.length) return;
    const { id, kind } = save.packs[0]!;
    if (update((s) => openSeasonPack(s, id, packGenerator(kind), now(s))))
      setFlow({ kind: 'pack' });
  }
  async function importFile(selected: File) {
    try {
      const raw = await selected.text();
      const backup = JSON.parse(raw);
      const name =
        typeof backup?.save?.name === 'string'
          ? `${backup.save.name.slice(0, 109)} (imported)`
          : undefined;
      if (transact((repo) => repo.importSave(raw, crypto.randomUUID(), name))) {
        setEditing(null);
        setFlow(null);
      }
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
  const importInput = (
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
  );

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
  if (save && flow?.kind === 'pack' && save.lastPack) {
    const receipt = save.lastPack;
    const bonus = receipt.bonus;
    const extras = [
      bonus?.coins ? `+${bonus.coins} coins` : '',
      bonus?.vaultPoints ? `+${bonus.vaultPoints} Vault points` : '',
      ...RARITIES.filter((r) => (bonus?.tracks[r] ?? 0) > 0).map(
        (r) => `+1 ${r} wildcard from the track`,
      ),
    ].filter(Boolean);
    return (
      <BoosterReveal
        key={receipt.packId}
        set={
          (['blb', 'msh', 'stx'] as const).find((set) =>
            receipt.rewards.some(
              (r) => r.kind === 'card' && SEASON_CARDS.get(r.cardId)?.set === set,
            ),
          ) ?? 'fdn'
        }
        cards={receipt.rewards.map((r) =>
          r.kind === 'card' ? cardDb.get(r.cardId)!.name : wildcardName(r.rarity),
        )}
        eyebrow={`Season · Pack ${receipt.packId}${save.packs.length ? ` · ${save.packs.length} left` : ''}`}
        note={`Added to your collection.${extras.length ? ` ${extras.join(' · ')}.` : ''}`}
        extra={
          save.packs.length > 0 && (
            <button className="hbtn hbtn--ghost" onClick={openPack}>
              Open next ({save.packs.length})
            </button>
          )
        }
        onDone={() => setFlow(null)}
      />
    );
  }
  const deck = save?.decks.find((d) => d.id === editing);
  if (save && deck)
    return (
      <SeasonEditor
        save={save}
        deckId={deck.id}
        error={error}
        update={update}
        onBack={() => setEditing(null)}
      />
    );
  if (data.library && (!save || flow?.kind === 'new' || flow?.kind === 'reset'))
    return (
      <>
        <SeasonWelcome
          mode={flow?.kind === 'reset' ? 'reset' : save ? 'new' : 'first'}
          save={save}
          error={error}
          onStart={start}
          onImport={() => file.current?.click()}
          onCancel={save ? () => setFlow(null) : onHome}
        />
        {importInput}
      </>
    );

  return (
    <div className="season">
      <header className="nav sbar">
        <button className="sbar__back" onClick={onHome}>
          <svg viewBox="0 0 16 16" aria-hidden>
            <path d="M10 3 5 8l5 5" fill="none" stroke="currentColor" strokeWidth="1.8" />
          </svg>
          Home
        </button>
        <button className="nav__brand sbar__brand" onClick={() => setView('play')}>
          <svg viewBox="0 0 20 20" aria-hidden>
            <path d="M10 1.5 18.5 10 10 18.5 1.5 10z" />
            <path d="M10 6 14 10 10 14 6 10z" />
          </svg>
          Season
        </button>
        {save && (
          <nav className="nav__tabs" aria-label="Season">
            {VIEWS.map(([v, name]) => (
              <button
                key={v}
                className={`nav__tab ${view === v ? 'is-on' : ''}`}
                aria-current={view === v ? 'page' : undefined}
                onClick={() => setView(v)}
              >
                {name}
                {v === 'packs' && save.packs.length > 0 && (
                  <span className="sbar__count">{save.packs.length}</span>
                )}
              </button>
            ))}
          </nav>
        )}
        <div className="nav__end">
          {save && <Currencies save={save} />}
          {save && data.library && (
            <SaveMenu
              library={data.library}
              save={save}
              onSwitch={(id) => transact((repo) => repo.switchSave(id))}
              onNew={() => setFlow({ kind: 'new' })}
              onRename={() => setRenaming(true)}
              onExport={exportFile}
              onImport={() => file.current?.click()}
              onReset={() => setFlow({ kind: 'reset' })}
            />
          )}
          <UiSize />
        </div>
      </header>
      {importInput}
      <main className={`smain smain--${view}`}>
        {error && (
          <div className="serror" role="alert">
            <span>{error}</span>
            <button className="slink" onClick={() => transact((repo) => repo.load())}>
              Reload saves
            </button>
            <button className="slink" onClick={() => setData((s) => ({ ...s, error: null }))}>
              Dismiss
            </button>
          </div>
        )}
        {!data.library && (
          <section className="sempty">
            <h2>Your Season saves could not be loaded</h2>
            <p>Reload to try again, or import a backup.</p>
            <button className="hbtn hbtn--primary" onClick={() => file.current?.click()}>
              Import backup
            </button>
          </section>
        )}
        {save && view === 'play' && (
          <SeasonPlay
            save={save}
            update={update}
            onPlay={play}
            onAbandon={() => setAbandoning(true)}
            onDecks={() => setView('decks')}
            onEdit={() => setEditing(save.selectedDeckId)}
            onPacks={() => setView(save.packs.length ? 'packs' : 'store')}
            onOpenPack={openPack}
            onCollection={() => setView('collection')}
          />
        )}
        {save && view === 'decks' && (
          <SeasonDecks
            save={save}
            update={update}
            onEdit={setEditing}
            onNew={newDeck}
            onPlay={() => setView('play')}
          />
        )}
        {save && view === 'collection' && (
          <SeasonCollection key={save.id} save={save} update={update} error={error} />
        )}
        {save && view === 'packs' && (
          <SeasonPacks
            save={save}
            update={update}
            onOpen={openPack}
            onViewLast={() => setFlow({ kind: 'pack' })}
            onStore={() => setView('store')}
          />
        )}
        {save && view === 'store' && (
          <SeasonStore
            key={save.id}
            save={save}
            update={update}
            error={error}
            onOpenPacks={() => setView('packs')}
          />
        )}
      </main>
      {renaming && save && (
        <RenameDialog
          name={save.name}
          error={error}
          onCancel={() => setRenaming(false)}
          onSave={(name) => {
            if (update((s) => renameSeasonSave(s, name, now(s)))) setRenaming(false);
          }}
        />
      )}
      {abandoning && save?.match && (
        <Modal title="Abandon this match?" onClose={() => setAbandoning(false)}>
          <p>
            It counts as a concession.{' '}
            {replaySeasonMatch(save.match).playerTurnsBegun >= 5
              ? 'You still receive the 50 coin loss reward.'
              : 'Concessions before your fifth turn earn no coins.'}
          </p>
          <div className="smodal__actions">
            <button className="hbtn hbtn--ghost" onClick={() => setAbandoning(false)}>
              Keep playing
            </button>
            <button className="hbtn hbtn--primary hbtn--danger" onClick={abandon}>
              Abandon match
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ menu */

function SaveMenu({
  library,
  save,
  onSwitch,
  onNew,
  onRename,
  onExport,
  onImport,
  onReset,
}: {
  library: SeasonLibrary;
  save: SeasonSave;
  onSwitch: (id: string) => void;
  onNew: () => void;
  onRename: () => void;
  onExport: () => void;
  onImport: () => void;
  onReset: () => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (
        e instanceof KeyboardEvent ? e.key === 'Escape' : !root.current?.contains(e.target as Node)
      )
        setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);
  const run = (f: () => void) => () => {
    setOpen(false);
    f();
  };
  return (
    <div className="smenu" ref={root}>
      <button
        className="smenu__button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span className="smenu__label-sm">Save</span>
        <span className="smenu__name">{save.name}</span>
        <svg viewBox="0 0 16 16" aria-hidden>
          <path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" />
        </svg>
      </button>
      {open && (
        <div className="smenu__pop" role="menu">
          {library.saves.length > 1 && (
            <>
              <span className="smenu__label">Switch save</span>
              {library.saves.map((s) => (
                <button
                  key={s.id}
                  role="menuitemradio"
                  aria-checked={s.id === save.id}
                  className="smenu__item"
                  onClick={run(() => s.id !== save.id && onSwitch(s.id))}
                >
                  <span className="smenu__check">{s.id === save.id ? '✓' : ''}</span>
                  <span className="smenu__grow">{s.name}</span>
                  <span className="smenu__meta">{fmt(s.coins)}c</span>
                </button>
              ))}
              <hr />
            </>
          )}
          <button role="menuitem" className="smenu__item" onClick={run(onNew)}>
            New save
          </button>
          <button role="menuitem" className="smenu__item" onClick={run(onRename)}>
            Rename save
          </button>
          <hr />
          <button role="menuitem" className="smenu__item" onClick={run(onExport)}>
            Export backup
          </button>
          <button role="menuitem" className="smenu__item" onClick={run(onImport)}>
            Import backup
          </button>
          <hr />
          <button
            role="menuitem"
            className="smenu__item smenu__item--danger"
            onClick={run(onReset)}
          >
            Reset save…
          </button>
        </div>
      )}
    </div>
  );
}

function RenameDialog({
  name: initial,
  error,
  onCancel,
  onSave,
}: {
  name: string;
  error: string | null;
  onCancel: () => void;
  onSave: (name: string) => void;
}) {
  const [name, setName] = useState(initial);
  return (
    <Modal title="Rename save" onClose={onCancel}>
      <form
        className="sform"
        onSubmit={(e) => {
          e.preventDefault();
          onSave(name);
        }}
      >
        <input
          className="sinput"
          aria-label="Name"
          autoFocus
          required
          maxLength={120}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        {error && (
          <p role="alert" className="swarn">
            {error}
          </p>
        )}
        <div className="smodal__actions">
          <button type="button" className="hbtn hbtn--ghost" onClick={onCancel}>
            Cancel
          </button>
          <button className="hbtn hbtn--primary" disabled={!name.trim()}>
            Save
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* ---------------------------------------------------------------- welcome */

function SeasonWelcome({
  mode,
  save,
  error,
  onStart,
  onImport,
  onCancel,
}: {
  /** first: no saves yet; new: another save; reset: start this save over. */
  mode: 'first' | 'new' | 'reset';
  save?: SeasonSave;
  error: string | null;
  onStart: (name: string, starter: string) => void;
  onImport: () => void;
  onCancel: () => void;
}) {
  const [starter, setStarter] = useState(SEASON_STARTERS[0]!.id);
  const [name, setName] = useState(
    mode === 'reset' ? save!.name : mode === 'first' ? 'My Season' : '',
  );
  const [viewing, setViewing] = useState(false);
  const deck = SEASON_STARTERS.find((d) => d.id === starter)!;
  return (
    <div className="swelcome">
      <div className="swelcome__wash" style={{ backgroundImage: `url("${artFor(deck)}")` }} />
      <header className="swelcome__top">
        <button className="hbtn hbtn--ghost" onClick={onCancel}>
          {mode === 'first' ? 'Home' : 'Cancel'}
        </button>
        <UiSize />
      </header>
      <div className="swelcome__title">
        <span className="stag">{mode === 'reset' ? 'Reset save' : 'Season'}</span>
        <h1>{mode === 'reset' ? `Start ${save!.name} over` : 'Choose your first deck'}</h1>
        <p>
          {mode === 'reset'
            ? 'This save’s collection, coins, decks and unfinished match are erased. Other saves are kept.'
            : 'Its 60 cards start your collection, with 400 coins to spend on packs. Win matches to earn more, and build your own decks as your collection grows.'}
        </p>
      </div>
      <div className="swelcome__decks" role="radiogroup" aria-label="Starter deck">
        {SEASON_STARTERS.map((d, i) => (
          <DeckTile
            key={d.id}
            deck={d}
            index={i}
            sub={BLURBS[d.id] ?? ''}
            selected={d.id === starter}
            onClick={() => setStarter(d.id)}
          />
        ))}
      </div>
      <form
        className="swelcome__bar"
        onSubmit={(e) => {
          e.preventDefault();
          onStart(name, starter);
        }}
      >
        <div className="swelcome__pick">
          <span className="spip-row">
            {deck.colors.map((c) => (
              <span key={c} className={`pip pip--${c}`} />
            ))}
          </span>
          <strong>{deck.name}</strong>
          <button type="button" className="slink" onClick={() => setViewing(true)}>
            View decklist
          </button>
        </div>
        {mode !== 'reset' && (
          <label className="swelcome__name">
            <span>Save name</span>
            <input
              className="sinput"
              required
              maxLength={120}
              value={name}
              placeholder="Name this save"
              onChange={(e) => setName(e.target.value)}
            />
          </label>
        )}
        {error && (
          <p role="alert" className="swarn">
            {error}
          </p>
        )}
        {mode === 'first' && (
          <button type="button" className="slink" onClick={onImport}>
            Import backup
          </button>
        )}
        <button
          className={`hbtn hbtn--primary hbtn--lg ${mode === 'reset' ? 'hbtn--danger' : ''}`}
          disabled={!name.trim()}
        >
          {mode === 'reset' ? 'Erase and start over' : 'Start Season'}
        </button>
      </form>
      {viewing && (
        <Modal title={deck.name} onClose={() => setViewing(false)}>
          <ul className="slist">
            {deck.cards.map(([card, n]) => (
              <li key={card}>
                <span className="slist__n">{n}</span>
                <span className="slist__name">{card}</span>
              </li>
            ))}
          </ul>
        </Modal>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------- play */

const OUTCOME = { win: 'Victory', loss: 'Defeat', draw: 'Draw', concede: 'Conceded' } as const;

function SeasonPlay({
  save,
  update,
  onPlay,
  onAbandon,
  onDecks,
  onEdit,
  onPacks,
  onOpenPack,
  onCollection,
}: {
  save: SeasonSave;
  update: (change: (s: SeasonSave) => SeasonSave) => unknown;
  onPlay: () => void;
  onAbandon: () => void;
  onDecks: () => void;
  onEdit: () => void;
  onPacks: () => void;
  onOpenPack: () => void;
  onCollection: () => void;
}) {
  const match = save.match;
  const selected = save.decks.find((d) => d.id === save.selectedDeckId)!;
  const deck = match
    ? displayDeck('season-match', match.playerDeckName ?? 'Season deck', countIds(match.decks.p1))
    : displayDeck(selected.id, selected.name, selected.cards);
  const issues = match
    ? []
    : deckErrors(save, selected).map((e) =>
        e.includes('at least 60') ? `${size(selected.cards)} of 60 cards` : readable(e),
      );
  const opponent = match ? findDeck(match.opponentDeckId) : undefined;
  const turns = match ? replaySeasonMatch(match).playerTurnsBegun : 0;
  const result = !match && save.lastResult;
  return (
    <div className="splay">
      <section className="sfeature splay__hero">
        <div className="sfeature__wash" style={{ backgroundImage: `url("${artFor(deck)}")` }} />
        <div className="sfeature__art" style={{ backgroundImage: `url("${artFor(deck)}")` }} />
        {opponent && (
          <div className="splay__versus" aria-hidden>
            <span>vs</span>
            <img src={artFor(opponent)} alt="" />
          </div>
        )}
        <div className="sfeature__copy">
          <span className="stag">{match ? 'Match in progress' : 'Your deck'}</span>
          <span className="spip-row">
            {deck.colors.map((c) => (
              <span key={c} className={`pip pip--${c}`} />
            ))}
          </span>
          <h1>{deck.name}</h1>
          {match ? (
            <p>
              Against <strong>{opponent?.name ?? 'a starter deck'}</strong>
              {turns > 0 ? ` · your turn ${turns}` : ''}. Your progress is saved after every action.
            </p>
          ) : issues.length ? (
            <p className="splay__issue">
              <span className="sbadge sbadge--warn">Not ready</span>
              {issues.join('. ')}.
            </p>
          ) : (
            <p>
              {size(selected.cards)} cards · Face a random starter deck. Win <Price n={100} />, lose{' '}
              <Price n={50} />.
            </p>
          )}
          <div className="splay__actions">
            <button
              className="hbtn hbtn--primary hbtn--lg splay__go"
              disabled={issues.length > 0}
              onClick={onPlay}
            >
              {match ? 'Resume' : 'Play'}
            </button>
            {match ? (
              <button className="hbtn hbtn--ghost" onClick={onAbandon}>
                Abandon
              </button>
            ) : (
              <>
                <button className="hbtn hbtn--ghost" onClick={issues.length ? onEdit : onDecks}>
                  {issues.length ? 'Fix deck' : 'Change deck'}
                </button>
                {!issues.length && (
                  <button className="slink" onClick={onEdit}>
                    Edit
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </section>
      <aside className="splay__side">
        {result && (
          <section className={`spanel sresult sresult--${result.outcome}`} role="status">
            <span className="spanel__title">Last match</span>
            <strong className="sresult__outcome">{OUTCOME[result.outcome]}</strong>
            <span className="sresult__coins">
              +<Price n={result.coins} />
            </span>
          </section>
        )}
        <section className="spanel spacks-mini">
          <Booster
            small
            label="Packs"
            onClick={save.packs.length ? onOpenPack : undefined}
            count={save.packs.length}
          />
          <div>
            <span className="spanel__title">Packs</span>
            <p>
              {save.packs.length
                ? `${save.packs.length} ready to open`
                : save.coins >= PACK_PRICE
                  ? `You can afford ${Math.floor(save.coins / PACK_PRICE)}`
                  : `${PACK_PRICE - save.coins} more coins for a pack`}
            </p>
            <button
              className="hbtn hbtn--primary"
              onClick={save.packs.length ? onOpenPack : onPacks}
            >
              {save.packs.length ? 'Open pack' : 'Visit store'}
            </button>
          </div>
        </section>
        <RewardTracks save={save} update={update} />
        <CollectionProgress save={save} onOpen={onCollection} />
      </aside>
    </div>
  );
}

function countIds(ids: readonly string[]): Counts {
  const cards: Counts = {};
  for (const id of ids) cards[id] = (cards[id] ?? 0) + 1;
  return cards;
}

/* ------------------------------------------------------------------ decks */

function SeasonDecks({
  save,
  update,
  onEdit,
  onNew,
  onPlay,
}: {
  save: SeasonSave;
  update: (change: (s: SeasonSave) => SeasonSave) => unknown;
  onEdit: (id: string) => void;
  onNew: () => void;
  onPlay: () => void;
}) {
  const copy = (d: SeasonDeck) =>
    update((s) =>
      putSeasonDeck(
        s,
        { ...d, id: crypto.randomUUID(), name: `${d.name.slice(0, 110)} copy` },
        now(s),
      ),
    );
  return (
    <div className="sdecks-view">
      <div className="ssection">
        <h2>Your decks</h2>
        <span className="ssection__aside">Click a deck to make it your active deck for Play.</span>
      </div>
      <div className="sdecks">
        {save.decks.map((d, i) => {
          const display = displayDeck(d.id, d.name, d.cards);
          const n = size(d.cards);
          const ok = deckErrors(save, d).length === 0;
          const active = d.id === save.selectedDeckId;
          return (
            <div className="sdeck-slot" key={d.id}>
              <DeckTile
                deck={display}
                index={i}
                selected={active}
                sub={`${n} cards`}
                badge={
                  !ok ? (
                    <span className="sbadge sbadge--warn">
                      {active ? 'Active · ' : ''}
                      {n < 60 ? `${n}/60` : 'Invalid'}
                    </span>
                  ) : active ? (
                    <span className="sbadge sbadge--active">Active</span>
                  ) : undefined
                }
                onClick={() =>
                  active ? onPlay() : update((s) => selectSeasonDeck(s, d.id, now(s)))
                }
              />
              <div className="sdeck-slot__actions">
                <button className="hbtn hbtn--ghost" onClick={() => onEdit(d.id)}>
                  Edit
                </button>
                <button className="hbtn hbtn--ghost" onClick={() => copy(d)}>
                  Copy
                </button>
              </div>
            </div>
          );
        })}
        <button
          className="snewdeck"
          onClick={onNew}
          style={{ '--i': save.decks.length } as CSSProperties}
        >
          <span className="snewdeck__plus">+</span>
          New deck
        </button>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- editor */

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
  const rename = () =>
    name.trim() && name !== deck.name && update((s) => putSeasonDeck(s, { ...deck, name }, now(s)));
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
          <button className="hbtn hbtn--ghost" onClick={onBack}>
            Back to Season
          </button>
          <input
            className="sinput sinput--inline"
            aria-label="Deck name"
            maxLength={120}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={rename}
            onKeyDown={(e) => e.key === 'Enter' && rename()}
          />
          <SeasonCrafting save={save} update={update} error={error} />
          {error && (
            <span role="alert" className="swarn">
              {error}
            </span>
          )}
        </>
      }
      onAdd={(card) => move(card, 1)}
      onRemove={(card) => move(card, -1)}
      onDone={onBack}
    />
  );
}

/* ------------------------------------------------------------------- game */

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
        them: findDeck(resume.choice.them)!,
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
