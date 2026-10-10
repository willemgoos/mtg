import { scryfallById, slug } from '@mtg/cards';
import type { Color } from '@mtg/engine';
import {
  type CSSProperties,
  type DragEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  autoBasics,
  BASICS,
  basicColor,
  COLORS,
  colorsOf,
  deckStats,
  hasType,
  type Rarity,
  RARITIES,
  rarityOf,
  type SortKey,
  SORTS,
  setOf,
  sortEntries,
  TYPE_KINDS,
  type TypeKind,
} from '../game/deckBuilderLogic.ts';
import { colourPairs, type PairAdvice } from '../game/colourPairs.ts';
import { completionHints } from '../game/deckCompletion.ts';
import { deckBasicImage } from '../game/basicArt.ts';
import {
  cardEntries,
  costSymbols,
  type DeckEntry,
  deckColumns,
  deckSections,
  isCreature,
  isLand,
  symbolUrl,
  total,
} from '../game/deckView.ts';
import { ruleNotes } from '../game/notes.ts';
import { play } from '../game/sound.ts';
import { HoverPreview, type HoverState } from './Preview.tsx';
import './home.css';
import './deckbuilder.css';
import './deckbuilder-views.css';
import './foil.css';

/** Card name -> copies. */
type Counts = Readonly<Record<string, number>>;

const COLOR_NAMES: Record<Color, string> = {
  W: 'White',
  U: 'Blue',
  B: 'Black',
  R: 'Red',
  G: 'Green',
};

/** Collection filters, in Arena's order: the five colours, colourless, lands. */
type Filter = Color | 'C' | 'L';
const FILTERS: { id: Filter; label: string }[] = [
  ...COLORS.map((c) => ({ id: c as Filter, label: COLOR_NAMES[c] })),
  { id: 'C', label: 'Colourless' },
  { id: 'L', label: 'Lands' },
];

/** Mana value filters: 1 (or less) to 6 and up. Lands have no mana value to filter by. */
const COSTS = [1, 2, 3, 4, 5, 6] as const;
const costBucket = (e: DeckEntry) => Math.min(Math.max(e.manaValue, 1), 6);

const SET_NAMES: Record<string, string> = {
  fdn: 'Foundations',
  blb: 'Bloomburrow',
  msh: 'Marvel Super Heroes',
  fin: 'Final Fantasy',
  stx: 'Strixhaven',
  sos: 'Secrets of Strixhaven',
  fra: 'Reality Fracture',
  ecl: 'Lorwyn Eclipsed',
  tdm: 'Tarkir: Dragonstorm',
  hob: 'The Hobbit',
};
const setLabel = (code: string) => SET_NAMES[code] ?? code.toUpperCase();

/** Small preferences, remembered between visits (when storage is available). */
const PREFS = 'mtg.deckBuilder.';
function loadPref<T extends string>(key: string, ok: readonly T[], fallback: T): T {
  try {
    const v = localStorage.getItem(PREFS + key);
    return ok.includes(v as T) ? (v as T) : fallback;
  } catch {
    return fallback;
  }
}
function savePref(key: string, value: string): void {
  try {
    localStorage.setItem(PREFS + key, value);
  } catch {
    // Storage unavailable (private mode): the choice lasts for this visit.
  }
}
const bool = ['0', '1'] as const;

/** The deck tray's share of the height in Columns view, between the collection and the tray. */
const TRAY_SHARE = 0.46;
const TRAY_MIN = 0.15;
const TRAY_MAX = 0.85;
const clampShare = (v: number) => Math.min(TRAY_MAX, Math.max(TRAY_MIN, v));
function loadShare(): number {
  try {
    const v = Number(localStorage.getItem(PREFS + 'tray'));
    return v ? clampShare(v) : TRAY_SHARE;
  } catch {
    return TRAY_SHARE;
  }
}

interface Narrowing {
  colors: ReadonlySet<Filter>;
  costs: ReadonlySet<number>;
  types: ReadonlySet<TypeKind>;
  rarities: ReadonlySet<Rarity>;
  set: string;
  query: string;
}

function matches(
  e: DeckEntry,
  { colors: filters, costs, types, rarities, set, query }: Narrowing,
): boolean {
  const cs = colorsOf(e.name);
  if (costs.size && (isLand(e) || !costs.has(costBucket(e)))) return false;
  if (types.size && ![...types].some((t) => hasType(e, t))) return false;
  if (rarities.size && !rarities.has(rarityOf(e.name)!)) return false;
  if (set && setOf(e.name) !== set) return false;
  if (filters.size) {
    const land = isLand(e);
    const hit =
      (land && filters.has('L')) ||
      (!land && !cs.length && filters.has('C')) ||
      cs.some((c) => filters.has(c));
    if (!hit) return false;
  }
  if (!query) return true;
  const text = scryfallById.get(slug(e.name))?.oracleText ?? '';
  return `${e.name}\n${e.typeLine}\n${text}`.toLowerCase().includes(query);
}

/** One change to the deck, for undo. */
interface Op {
  op: 'add' | 'remove';
  name: string;
}

/** Closes a popover on a click outside it or Escape. */
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) close();
    };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', down);
      document.removeEventListener('keydown', key);
    };
  }, [open, close]);
  return ref;
}

/**
 * Arena's deck builder: the collection as a scrolling grid of cards (click or
 * drag to add) under a search box, filters and sorting; the deck either as a
 * list on the right or, like Arena's Limited builder, as stacked columns by
 * mana value under the collection (click or drag a card out to remove it).
 *
 * It works on plain name -> copies counts, so any mode can use it: `pool` is
 * what you own but haven't put in, `deck` what's in. With `basics` the five
 * basic lands are free and unlimited, as in Limited, and a Lands panel with
 * "Auto lands" sets them (through repeated onAdd/onRemove calls).
 */
export function DeckBuilder({
  name,
  colors,
  art,
  deck,
  pool,
  basics = false,
  basicsDeck,
  fresh,
  foil,
  min,
  tips = [],
  tools,
  onAdd,
  onRemove,
  onBuildPair,
  onDone,
}: {
  name: string;
  colors: readonly Color[];
  /** Art for the deck box and the backdrop. */
  art: string;
  deck: Counts;
  pool: Counts;
  basics?: boolean;
  /** A deck id: its basic lands show that deck's set art. */
  basicsDeck?: string;
  /** Cards to mark as new. */
  fresh?: ReadonlySet<string>;
  /** Cards to show with a foil sheen and a "Promo" tag (a prerelease promo). */
  foil?: ReadonlySet<string>;
  /** Cards needed before Done is enabled. */
  min: number;
  tips?: readonly string[];
  /** Extra buttons for the top bar, e.g. a mode's "Suggest a deck". */
  tools?: ReactNode;
  onAdd: (name: string) => void;
  onRemove: (name: string) => void;
  /** Builds a whole deck in this colour pair (a mode's own deck builder). Without it, colour advice only shows cards. */
  onBuildPair?: (colors: [Color, Color]) => void;
  onDone: () => void;
}) {
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<ReadonlySet<Filter>>(new Set());
  const [costs, setCosts] = useState<ReadonlySet<number>>(new Set());
  const [types, setTypes] = useState<ReadonlySet<TypeKind>>(new Set());
  const [rarities, setRarities] = useState<ReadonlySet<Rarity>>(new Set());
  const [setFilter, setSetFilter] = useState('');
  const [newOnly, setNewOnly] = useState(false);
  const [showHints, setShowHints] = useState(() => loadPref('hints', bool, '1') === '1');
  const [hintsOpen, setHintsOpen] = useState(() => loadPref('hintsOpen', bool, '1') === '1');
  const [suggestedOnly, setSuggestedOnly] = useState(false);
  // Colour advice: open by default while the deck has no spells; a button reopens it later.
  const [advice, setAdvice] = useState<boolean | null>(null);
  const [confirmPair, setConfirmPair] = useState<string | null>(null);
  const [hideUsed, setHideUsed] = useState(() => loadPref('hideUsed', bool, '0') === '1');
  const [sort, setSort] = useState<SortKey>(() =>
    loadPref(
      'sort',
      SORTS.map((s) => s.id),
      'colour',
    ),
  );
  const [view, setView] = useState(() => loadPref('view', ['list', 'columns'] as const, 'list'));
  const [split, setSplit] = useState(() => loadPref('split', bool, '1') === '1');
  const [tray, setTray] = useState(loadShare);
  const [resizing, setResizing] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [landsOpen, setLandsOpen] = useState(false);
  const [drag, setDrag] = useState<{ from: 'pool' | 'deck'; name: string } | null>(null);
  const [over, setOver] = useState<'pool' | 'deck' | null>(null);
  const [history, setHistory] = useState<Op[][]>([]);
  const [hover, setHoverState] = useState<HoverState | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const setHover = (e: DeckEntry | null, anchor?: Element) =>
    setHoverState(
      e ? { defId: e.defId ?? slug(e.name), anchor: anchor ?? null, image: e.image } : null,
    );

  const withArt = (es: DeckEntry[]) =>
    basicsDeck
      ? es.map((e) => {
          const image = deckBasicImage(e.name, basicsDeck);
          return image ? { ...e, image } : e;
        })
      : es;
  const main = useMemo(() => withArt(cardEntries(Object.entries(deck))), [deck, basicsDeck]);
  // Everything you own, used-up cards included (they show dimmed, like Arena).
  const owned = useMemo(() => {
    const names = new Set([...Object.keys(pool), ...Object.keys(deck)]);
    if (basics) for (const b of Object.values(BASICS)) names.add(b);
    return withArt(cardEntries([...names].map((n) => [n, pool[n] ?? 0] as const)));
  }, [pool, deck, basics, basicsDeck]);
  const sorted = useMemo(() => sortEntries(owned, sort, fresh), [owned, sort, fresh]);
  const sets = useMemo(
    () =>
      [...new Set(owned.filter((e) => !basicColor.has(e.name)).map((e) => setOf(e.name)))]
        .filter(Boolean)
        .sort(),
    [owned],
  );

  const q = query.trim().toLowerCase();
  const isFree = (e: DeckEntry) => basics && basicColor.has(e.name);
  // Hints for a deck that isn't full yet; they only point, the player decides.
  const hints = useMemo(
    () =>
      Object.values(deck).reduce((a, b) => a + b, 0) < min
        ? completionHints({ deck, pool, min, basics })
        : [],
    [deck, pool, min, basics],
  );
  const hinted = useMemo(
    () => new Map(hints.filter((h) => !basicColor.has(h.name)).map((h) => [h.name, h])),
    [hints],
  );
  const limited = min <= 45;
  const spellsInDeck = main.some((e) => !isLand(e));
  const adviceOpen = advice ?? !spellsInDeck;
  const pairs = useMemo(() => {
    if (!limited || !adviceOpen) return [];
    const all: Record<string, number> = { ...pool };
    for (const [n, k] of Object.entries(deck)) if (!basicColor.has(n)) all[n] = (all[n] ?? 0) + k;
    return colourPairs(all);
  }, [limited, adviceOpen, pool, deck]);
  const marking = showHints && hinted.size > 0;
  const shown = sorted.filter(
    (e) =>
      (!suggestedOnly || !marking || hinted.has(e.name)) &&
      matches(e, { colors: filters, costs, types, rarities, set: setFilter, query: q }) &&
      (!newOnly || !!fresh?.has(e.name)) &&
      // Used up: every copy you own is already in the deck.
      (!hideUsed || isFree(e) || e.count > 0),
  );
  const extra =
    types.size +
    rarities.size +
    (setFilter ? 1 : 0) +
    (newOnly ? 1 : 0) +
    (suggestedOnly && marking ? 1 : 0);
  const narrowed = filters.size + costs.size + extra > 0 || !!q;
  const clear = () => {
    setFilters(new Set());
    setCosts(new Set());
    setTypes(new Set());
    setRarities(new Set());
    setSetFilter('');
    setNewOnly(false);
    setSuggestedOnly(false);
    setQuery('');
  };

  /* ---- changing the deck: every change goes through here so it can be undone */

  const live = useRef({ deck, pool, basics });
  live.current = { deck, pool, basics };
  const log = (ops: Op[]) => ops.length && setHistory((h) => [...h.slice(-49), ops]);
  const add = (e: DeckEntry) => {
    if (!isFree(e) && !e.count) return;
    onAdd(e.name);
    log([{ op: 'add', name: e.name }]);
    play('place', { gain: 0.6 });
    if (!isFree(e) && e.count === 1) setHover(null);
  };
  const remove = (e: DeckEntry) => {
    onRemove(e.name);
    log([{ op: 'remove', name: e.name }]);
    play('place', { gain: 0.6 });
    if (e.count === 1) setHover(null);
  };
  const removeBasic = (c: Color) => {
    if (!((deck[BASICS[c]] ?? 0) > 0)) return;
    onRemove(BASICS[c]);
    log([{ op: 'remove', name: BASICS[c] }]);
    play('place', { gain: 0.6 });
  };
  const addBasic = (c: Color) => {
    onAdd(BASICS[c]);
    log([{ op: 'add', name: BASICS[c] }]);
    play('place', { gain: 0.6 });
  };
  /** Sets the basics to fit the deck's colours (Arena's "auto lands"). */
  const autoLands = () => {
    const want = autoBasics(main, min, colors);
    const ops: Op[] = [];
    for (const c of COLORS) {
      const have = deck[BASICS[c]] ?? 0;
      for (let i = have; i < want[c]; i++) ops.push({ op: 'add', name: BASICS[c] });
      for (let i = have; i > want[c]; i--) ops.push({ op: 'remove', name: BASICS[c] });
    }
    for (const o of ops) (o.op === 'add' ? onAdd : onRemove)(o.name);
    log(ops);
    if (ops.length) play('shuffle', { gain: 0.6 });
  };
  const undo = () => {
    const last = history[history.length - 1];
    if (!last) return;
    setHistory((h) => h.slice(0, -1));
    // Work on copies: the callbacks' results only show up on the next render.
    const inDeck = { ...live.current.deck };
    const inPool = { ...live.current.pool };
    const free = (n: string) => live.current.basics && basicColor.has(n);
    for (const o of [...last].reverse()) {
      if (o.op === 'add' && (inDeck[o.name] ?? 0) > 0) {
        onRemove(o.name);
        inDeck[o.name] = (inDeck[o.name] ?? 0) - 1;
        inPool[o.name] = (inPool[o.name] ?? 0) + 1;
      } else if (o.op === 'remove' && (free(o.name) || (inPool[o.name] ?? 0) > 0)) {
        onAdd(o.name);
        inPool[o.name] = (inPool[o.name] ?? 0) - 1;
        inDeck[o.name] = (inDeck[o.name] ?? 0) + 1;
      }
    }
    setHover(null);
    play('place', { gain: 0.6 });
  };
  const undoRef = useRef(undo);
  undoRef.current = undo;

  // Keyboard: "/" or Ctrl/Cmd+F finds a card, Ctrl/Cmd+Z undoes.
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const el = ev.target as HTMLElement | null;
      const typing = !!el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
      const mod = ev.ctrlKey || ev.metaKey;
      if ((ev.key === '/' && !typing && !mod) || (mod && ev.key.toLowerCase() === 'f')) {
        ev.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      } else if (mod && !ev.shiftKey && ev.key.toLowerCase() === 'z' && !typing) {
        ev.preventDefault();
        undoRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /* ---- drag and drop */

  const startDrag = (from: 'pool' | 'deck', e: DeckEntry) => (ev: DragEvent) => {
    ev.dataTransfer.setData('text/plain', e.name);
    ev.dataTransfer.effectAllowed = 'move';
    setHover(null);
    setDrag({ from, name: e.name });
  };
  const endDrag = () => {
    setDrag(null);
    setOver(null);
  };
  /** A drop target taking cards dragged from `from`. */
  const zone = (to: 'pool' | 'deck') => {
    const accepts = drag && drag.from !== to;
    return {
      onDragOver: (ev: DragEvent) => {
        if (!accepts) return;
        ev.preventDefault();
        ev.dataTransfer.dropEffect = 'move';
        setOver(to);
      },
      onDragLeave: (ev: DragEvent) => {
        if (!ev.currentTarget.contains(ev.relatedTarget as Node)) setOver(null);
      },
      onDrop: (ev: DragEvent) => {
        if (!accepts) return;
        ev.preventDefault();
        const e = (to === 'deck' ? owned : main).find((c) => c.name === drag.name);
        endDrag();
        if (e) (to === 'deck' ? add : remove)(e);
      },
    };
  };
  const dropClass = (to: 'pool' | 'deck') =>
    drag && drag.from !== to ? `is-target ${over === to ? 'is-over' : ''}` : '';

  /** Turns one value of a filter set on or off. */
  const flip =
    <T,>(set: (f: (s: ReadonlySet<T>) => ReadonlySet<T>) => void) =>
    (v: T) =>
      set((s) => {
        const next = new Set(s);
        if (!next.delete(v)) next.add(v);
        return next;
      });
  const toggle = flip(setFilters);
  const toggleCost = flip(setCosts);
  const toggleType = flip(setTypes);
  const toggleRarity = flip(setRarities);

  const moreRef = useDismiss(moreOpen, () => setMoreOpen(false));
  const landsRef = useDismiss(landsOpen, () => setLandsOpen(false));

  const n = total(main);
  const stats = useMemo(() => deckStats(main), [main]);
  const sections = deckSections(main);
  const short = n < min;
  const columns = view === 'columns';

  return (
    <div className={`dbk ${columns ? 'dbk--columns' : ''}`}>
      <header className="dbk__bar">
        <div className="dbk__tools">{tools}</div>
        <label className="dbk__search">
          <svg viewBox="0 0 16 16" aria-hidden>
            <circle cx="7" cy="7" r="4.5" />
            <path d="m10.5 10.5 3 3" />
          </svg>
          <input
            ref={searchRef}
            type="search"
            placeholder="Search cards"
            aria-label="Search cards"
            title="Press / to search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                if (query) setQuery('');
                else e.currentTarget.blur();
              }
            }}
          />
          <kbd aria-hidden>/</kbd>
        </label>
        <div className="dbk__filters" role="group" aria-label="Filter by colour">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              className={`dbk__filter dbk__filter--${f.id} ${filters.has(f.id) ? 'is-on' : ''}`}
              aria-pressed={filters.has(f.id)}
              aria-label={f.label}
              title={f.label}
              onClick={() => toggle(f.id)}
            />
          ))}
        </div>
        <div className="dbk__chips" role="group" aria-label="Filter by mana value">
          {COSTS.map((c) => (
            <button
              key={c}
              className={`dbk__chip dbk__chip--cost ${costs.has(c) ? 'is-on' : ''}`}
              aria-pressed={costs.has(c)}
              title={c === 6 ? 'Mana value 6 or more' : `Mana value ${c}`}
              onClick={() => toggleCost(c)}
            >
              {c === 6 ? '6+' : c}
            </button>
          ))}
        </div>

        <div className="dbk__pop-wrap" ref={moreRef}>
          <button
            className={`dbk__btn ${extra ? 'is-on' : ''}`}
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen(!moreOpen)}
          >
            Filters{extra > 0 && <span className="dbk__badge">{extra}</span>}
          </button>
          {moreOpen && (
            <div className="dbk__pop" role="dialog" aria-label="More filters">
              <h3>Type</h3>
              <div className="dbk__wrap">
                {TYPE_KINDS.map((t) => (
                  <button
                    key={t}
                    className={`dbk__pill ${types.has(t) ? 'is-on' : ''}`}
                    aria-pressed={types.has(t)}
                    onClick={() => toggleType(t)}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <h3>Rarity</h3>
              <div className="dbk__wrap">
                {RARITIES.map((r) => (
                  <button
                    key={r}
                    className={`dbk__pill dbk__pill--${r} ${rarities.has(r) ? 'is-on' : ''}`}
                    aria-pressed={rarities.has(r)}
                    onClick={() => toggleRarity(r)}
                  >
                    {r[0]!.toUpperCase() + r.slice(1)}
                  </button>
                ))}
              </div>
              {sets.length > 1 && (
                <>
                  <h3>Set</h3>
                  <select
                    className="dbk__select dbk__select--full"
                    aria-label="Set"
                    value={setFilter}
                    onChange={(e) => setSetFilter(e.target.value)}
                  >
                    <option value="">All sets</option>
                    {sets.map((s) => (
                      <option key={s} value={s}>
                        {setLabel(s)}
                      </option>
                    ))}
                  </select>
                </>
              )}
              {fresh && fresh.size > 0 && (
                <button
                  className={`dbk__pill dbk__pill--wide ${newOnly ? 'is-on' : ''}`}
                  aria-pressed={newOnly}
                  title="Only the cards you just got"
                  onClick={() => setNewOnly(!newOnly)}
                >
                  New cards only
                </button>
              )}
            </div>
          )}
        </div>

        <label className="dbk__sort">
          <span>Sort</span>
          <select
            className="dbk__select"
            aria-label="Sort the collection"
            value={sort}
            onChange={(e) => {
              setSort(e.target.value as SortKey);
              savePref('sort', e.target.value);
            }}
          >
            {SORTS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="dbk__toggle" title="Hide cards whose every copy is already in your deck">
          <input
            type="checkbox"
            checked={hideUsed}
            onChange={(e) => {
              setHideUsed(e.target.checked);
              savePref('hideUsed', e.target.checked ? '1' : '0');
            }}
          />
          <span className="dbk__switch" aria-hidden />
          Hide used
        </label>
        {hinted.size > 0 && (
          <>
            <label className="dbk__toggle" title="Highlight cards that would help finish your deck">
              <input
                type="checkbox"
                checked={showHints}
                onChange={(e) => {
                  setShowHints(e.target.checked);
                  savePref('hints', e.target.checked ? '1' : '0');
                }}
              />
              <span className="dbk__switch" aria-hidden />
              Suggestions
            </label>
            {marking && (
              <button
                className={`dbk__pill ${suggestedOnly ? 'is-on' : ''}`}
                aria-pressed={suggestedOnly}
                title="Only the cards that would help finish your deck"
                onClick={() => setSuggestedOnly(!suggestedOnly)}
              >
                Suggested only
              </button>
            )}
          </>
        )}
        <span className="dbk__shown">
          {shown.length} {shown.length === 1 ? 'card' : 'cards'}
          {narrowed && (
            <button className="dbk__clear" onClick={clear}>
              Clear filters
            </button>
          )}
        </span>
      </header>

      <div className={`dbk__stage ${resizing ? 'is-resizing' : ''}`} ref={stageRef}>
        <main className={`dbk__pool ${dropClass('pool')}`} {...zone('pool')}>
          {shown.length === 0 && (
            <p className="dbk__empty">
              {!owned.length
                ? 'No cards yet.'
                : hideUsed && !narrowed
                  ? 'Every card you own is in your deck.'
                  : 'No cards match.'}
              {narrowed && owned.length > 0 && (
                <button className="dbk__clear" onClick={clear}>
                  Clear filters
                </button>
              )}
            </p>
          )}
          <div className="dbk__grid">
            {shown.map((e) => {
              const free = isFree(e);
              const inDeck = deck[e.name] ?? 0;
              const out = !free && !e.count;
              const rarity = rarityOf(e.name);
              return (
                <div key={e.name} className={`dbk-card ${out ? 'is-out' : ''}`}>
                  <div
                    className={`dbk-card__face ${fresh?.has(e.name) ? 'is-new' : ''} ${
                      drag?.name === e.name && drag.from === 'pool' ? 'is-dragging' : ''
                    } ${foil?.has(e.name) ? 'is-foil' : ''} ${
                      marking && !out && hinted.has(e.name)
                        ? `is-suggested ${hinted.get(e.name)!.splash ? 'is-splash' : ''}`
                        : ''
                    }`}
                    data-card={e.name}
                    role="button"
                    tabIndex={out ? -1 : 0}
                    aria-disabled={out}
                    aria-label={`${e.name}${free ? '' : `, ${e.count} left`}`}
                    title={
                      out
                        ? 'All copies are in your deck'
                        : marking && hinted.has(e.name)
                          ? `Suggested: ${hinted.get(e.name)!.reason}`
                          : 'Add to the deck'
                    }
                    draggable={!out}
                    onDragStart={startDrag('pool', e)}
                    onDragEnd={endDrag}
                    onMouseEnter={(ev) => setHover(e, ev.currentTarget)}
                    onMouseLeave={() => setHover(null)}
                    onContextMenu={(ev) => {
                      ev.preventDefault();
                      setHover(e, ev.currentTarget);
                    }}
                    onClick={() => add(e)}
                    onKeyDown={(ev) => {
                      if (ev.key === 'Enter' || ev.key === ' ') {
                        ev.preventDefault();
                        add(e);
                      }
                    }}
                  >
                    {e.image ? (
                      <img src={e.image} alt="" draggable={false} loading="lazy" />
                    ) : (
                      <div className="dcard__blank">{e.name}</div>
                    )}
                    {fresh?.has(e.name) && <span className="dbk-card__new">New</span>}
                    {foil?.has(e.name) && <span className="foil-tag">Promo</span>}
                    {marking && !out && hinted.has(e.name) && (
                      <span className="dbk-card__hint">{hinted.get(e.name)!.tag}</span>
                    )}
                    {inDeck > 0 && <span className="dbk-card__in">{inDeck}</span>}
                  </div>
                  <span className="dbk-card__copies" aria-hidden>
                    {free
                      ? '∞'
                      : Array.from({ length: Math.min(e.count + inDeck, 8) }, (_, i) => (
                          <i key={i} className={i < e.count ? 'is-free' : ''} />
                        ))}
                    {rarity && !free && sorted.length > 0 && sort === 'rarity' && (
                      <b className={`dbk-card__rarity dbk-card__rarity--${rarity}`} />
                    )}
                  </span>
                </div>
              );
            })}
          </div>
          {drag?.from === 'deck' && (
            <div className="dbk__drophint">Drop to take out of the deck</div>
          )}
        </main>

        {columns && (
          <div
            className="dbk__splitter"
            role="separator"
            aria-orientation="horizontal"
            aria-label="Resize the deck"
            aria-valuemin={TRAY_MIN * 100}
            aria-valuemax={TRAY_MAX * 100}
            aria-valuenow={Math.round(tray * 100)}
            tabIndex={0}
            title="Drag to resize (double-click to reset)"
            onPointerDown={(ev) => {
              ev.preventDefault();
              ev.currentTarget.setPointerCapture(ev.pointerId);
              setResizing(true);
            }}
            onPointerMove={(ev) => {
              const box = stageRef.current?.getBoundingClientRect();
              if (!resizing || !box) return;
              setTray(clampShare((box.bottom - ev.clientY) / box.height));
            }}
            onPointerUp={() => {
              setResizing(false);
              savePref('tray', String(tray));
            }}
            onDoubleClick={() => {
              setTray(TRAY_SHARE);
              savePref('tray', String(TRAY_SHARE));
            }}
            onKeyDown={(ev) => {
              const step = ev.key === 'ArrowUp' ? 0.05 : ev.key === 'ArrowDown' ? -0.05 : 0;
              if (!step) return;
              ev.preventDefault();
              const next = clampShare(tray + step);
              setTray(next);
              savePref('tray', String(next));
            }}
          >
            <span aria-hidden />
          </div>
        )}
        {columns && (
          <section
            style={{ height: `${tray * 100}%` }}
            className={`dbk__tray ${dropClass('deck')}`}
            aria-label="Your deck, by mana value"
            {...zone('deck')}
          >
            <div className="dbk__tray-head">
              <strong>Deck</strong>
              <span>
                {n} {n === 1 ? 'card' : 'cards'}
              </span>
              <label
                className="dbk__toggle"
                title="Keep creatures and other spells apart in each column"
              >
                <input
                  type="checkbox"
                  checked={split}
                  onChange={(e) => {
                    setSplit(e.target.checked);
                    savePref('split', e.target.checked ? '1' : '0');
                  }}
                />
                <span className="dbk__switch" aria-hidden />
                Split creatures
              </label>
            </div>
            {main.length === 0 ? (
              <p className="dbk__empty dbk__empty--tray">
                Click or drag cards from your collection to build your deck.
              </p>
            ) : (
              <div className="dbk__cols">
                {deckColumns(main).map((col) => (
                  <div key={col.label} className="dbk-col">
                    <div className="dbk-col__label">
                      {col.label}
                      <span>{total(col.cards)}</span>
                    </div>
                    <div className="dbk-col__stack">
                      {col.cards.map((e, i) => {
                        const gap =
                          split && i > 0 && isCreature(col.cards[i - 1]!) && !isCreature(e);
                        return (
                          <button
                            key={e.name}
                            className={`dbk-tile ${gap ? 'has-gap' : ''} ${
                              drag?.name === e.name && drag.from === 'deck' ? 'is-dragging' : ''
                            }`}
                            aria-label={`${e.name}${e.count > 1 ? `, ${e.count} copies` : ''}. Take one out`}
                            draggable
                            onDragStart={startDrag('deck', e)}
                            onDragEnd={endDrag}
                            onMouseEnter={(ev) => setHover(e, ev.currentTarget)}
                            onMouseLeave={() => setHover(null)}
                            onContextMenu={(ev) => {
                              ev.preventDefault();
                              setHover(e, ev.currentTarget);
                            }}
                            onClick={() => remove(e)}
                          >
                            {e.image ? (
                              <img src={e.image} alt="" draggable={false} />
                            ) : (
                              <span className="dcard__blank">{e.name}</span>
                            )}
                            {e.count > 1 && <span className="dbk-tile__qty">×{e.count}</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>

      <aside className="dbk__side" aria-label="Your deck">
        <div className="dbk__head" style={{ backgroundImage: `url("${art}")` }}>
          <div className="dbk__title">
            <span className="dbk__pips">
              {colors.map((c) => (
                <span key={c} className={`pip pip--${c}`} />
              ))}
            </span>
            <h1>{name}</h1>
          </div>
        </div>
        <div className="dbk__stats">
          <div className="dbk__count">
            <span>
              <strong className={short ? 'is-short' : ''}>{n}</strong> / {min} cards
            </span>
            <span className="dbk__meter">
              <i style={{ width: `${Math.min(1, n / min) * 100}%` }} />
            </span>
          </div>
          <dl className="dbk__kinds" aria-label="Card types">
            <div>
              <dt>Creatures</dt>
              <dd>{stats.creatures}</dd>
            </div>
            <div>
              <dt>Spells</dt>
              <dd>{stats.spells}</dd>
            </div>
            <div>
              <dt>Lands</dt>
              <dd>{stats.lands}</dd>
            </div>
          </dl>
          <Curve stats={stats} />
          {COLORS.some((c) => stats.symbols[c] > 0) && (
            <div className="dbk__symbols" aria-label="Mana symbols in the deck">
              {COLORS.filter((c) => stats.symbols[c] > 0).map((c) => (
                <span key={c} title={`${COLOR_NAMES[c]} mana symbols`}>
                  <i className={`dbk__dot dbk__dot--${c}`} />
                  {Math.round(stats.symbols[c])}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="dbk__tabs">
          <div className="dbk__seg" role="group" aria-label="Deck view">
            <button
              className={!columns ? 'is-on' : ''}
              aria-pressed={!columns}
              title="List view"
              onClick={() => {
                setView('list');
                savePref('view', 'list');
              }}
            >
              <svg viewBox="0 0 16 16" aria-hidden>
                <path d="M2 4h12M2 8h12M2 12h12" />
              </svg>
              List
            </button>
            <button
              className={columns ? 'is-on' : ''}
              aria-pressed={columns}
              title="Column view: the deck as card stacks under your collection"
              onClick={() => {
                setView('columns');
                savePref('view', 'columns');
              }}
            >
              <svg viewBox="0 0 16 16" aria-hidden>
                <path d="M3 2v12M8 2v12M13 2v12" />
              </svg>
              Columns
            </button>
          </div>
          <button
            className="dbk__btn"
            disabled={!history.length}
            title="Undo the last change (Ctrl/Cmd+Z)"
            onClick={undo}
          >
            Undo
          </button>
          {basics && (
            <div className="dbk__pop-wrap" ref={landsRef}>
              <button
                className={`dbk__btn ${landsOpen ? 'is-on' : ''}`}
                aria-expanded={landsOpen}
                onClick={() => setLandsOpen(!landsOpen)}
              >
                Lands
              </button>
              {landsOpen && (
                <div className="dbk__pop dbk__pop--lands" role="dialog" aria-label="Basic lands">
                  <h3>
                    Basic lands
                    <span>{COLORS.reduce((s, c) => s + (deck[BASICS[c]] ?? 0), 0)}</span>
                  </h3>
                  {COLORS.map((c) => (
                    <div key={c} className="dbk-land">
                      <i className={`dbk__dot dbk__dot--${c}`} />
                      <span>{BASICS[c]}</span>
                      <button
                        aria-label={`Fewer ${BASICS[c]}`}
                        disabled={!((deck[BASICS[c]] ?? 0) > 0)}
                        onClick={() => removeBasic(c)}
                      >
                        −
                      </button>
                      <output aria-label={`${BASICS[c]} count`}>{deck[BASICS[c]] ?? 0}</output>
                      <button aria-label={`More ${BASICS[c]}`} onClick={() => addBasic(c)}>
                        +
                      </button>
                    </div>
                  ))}
                  <button className="hbtn hbtn--primary dbk__auto" onClick={autoLands}>
                    Auto lands
                  </button>
                  <p>Fits your colours by their mana symbols to Arena's land count.</p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="dbk__list">
          {columns ? (
            <p className="dbk__hint">
              Your deck is under the collection. Click or drag a card out to take it out.
            </p>
          ) : (
            <>
              {main.length === 0 && (
                <p className="dbk__empty">Click or drag cards from the left to add them.</p>
              )}
              <div className={`dbk__drop ${dropClass('deck')}`} {...zone('deck')}>
                {sections.map((s) => (
                  <section key={s.title} className="dbk__section">
                    <h2>
                      {s.title}
                      <span>{total(s.cards)}</span>
                    </h2>
                    {s.cards.map((e) => (
                      <button
                        key={e.name}
                        className={`dbk-row ${
                          drag?.name === e.name && drag.from === 'deck' ? 'is-dragging' : ''
                        }`}
                        title="Take one out of the deck"
                        draggable
                        onDragStart={startDrag('deck', e)}
                        onDragEnd={endDrag}
                        style={
                          e.art ? ({ '--art': `url("${e.art}")` } as CSSProperties) : undefined
                        }
                        onMouseEnter={(ev) => setHover(e, ev.currentTarget)}
                        onMouseLeave={() => setHover(null)}
                        onContextMenu={(ev) => {
                          ev.preventDefault();
                          setHover(e, ev.currentTarget);
                        }}
                        onClick={() => remove(e)}
                      >
                        <span className="dbk-row__qty">{e.count}</span>
                        <span className="dbk-row__name">{e.name}</span>
                        <span className="dbk-row__cost">
                          {costSymbols(e.manaCost).map((sym, i) => (
                            <img key={i} src={symbolUrl(sym)} alt={sym} />
                          ))}
                        </span>
                      </button>
                    ))}
                  </section>
                ))}
              </div>
            </>
          )}
          {limited &&
            (adviceOpen ? (
              pairs.length > 0 && (
                <ColourAdvice
                  pairs={pairs}
                  entries={[...owned, ...main]}
                  confirm={confirmPair}
                  canBuild={!!onBuildPair}
                  onHover={setHover}
                  onClose={() => setAdvice(false)}
                  onShow={(c) => {
                    setFilters(new Set<Filter>([...c, 'C']));
                    setSuggestedOnly(false);
                  }}
                  onBuild={(p) => {
                    const key = p.colors.join('');
                    if (spellsInDeck && confirmPair !== key) return setConfirmPair(key);
                    setConfirmPair(null);
                    onBuildPair?.(p.colors);
                    setAdvice(false);
                    play('shuffle');
                  }}
                  onCancel={() => setConfirmPair(null)}
                />
              )
            ) : (
              <button className="dbk-advice__open" onClick={() => setAdvice(true)}>
                Colour advice
              </button>
            ))}
          {hints.length > 0 && (
            <Suggestions
              hints={hints}
              open={hintsOpen}
              entries={owned}
              onToggle={() => {
                setHintsOpen(!hintsOpen);
                savePref('hintsOpen', hintsOpen ? '0' : '1');
              }}
              onHover={setHover}
              onPick={(e) => {
                // Show where it is in the collection; adding it stays your choice.
                const el = document.querySelector(`[data-card="${CSS.escape(e.name)}"]`);
                if (!el) return;
                el.scrollIntoView({ block: 'center', behavior: 'smooth' });
                el.classList.remove('is-flash');
                void (el as HTMLElement).offsetWidth;
                el.classList.add('is-flash');
              }}
            />
          )}
          {tips.length > 0 && (
            <ul className="dbk__tips" aria-label="Deck tips">
              {tips.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          )}
        </div>

        <div className="dbk__foot">
          <button className="hbtn hbtn--primary dbk__done" disabled={short} onClick={onDone}>
            {short ? `${min - n} more to go` : 'Done'}
          </button>
        </div>
      </aside>

      <HoverPreview hover={drag ? null : hover} notes={hover ? ruleNotes(hover.defId) : []} />
    </div>
  );
}

/** What would help finish the deck: a short ranked list (click adds one copy) and a line on lands. */
function Suggestions({
  hints,
  open,
  entries,
  onToggle,
  onHover,
  onPick,
}: {
  hints: ReturnType<typeof completionHints>;
  open: boolean;
  entries: readonly DeckEntry[];
  onToggle: () => void;
  onHover: (e: DeckEntry | null, anchor?: Element) => void;
  onPick: (e: DeckEntry) => void;
}) {
  const spells = hints.filter((h) => !h.land);
  const lands = hints.filter((h) => h.land);
  const short = lands.reduce((n, h) => n + h.count, 0);
  return (
    <section className="dbk-hints" aria-label="Suggestions">
      <button className="dbk-hints__head" aria-expanded={open} onClick={onToggle}>
        <span>Suggestions</span>
        <em>{spells.reduce((n, h) => n + h.count, 0)} spells</em>
        <i aria-hidden>{open ? '−' : '+'}</i>
      </button>
      {open && (
        <>
          <p className="dbk-hints__note">
            Cards in your colours that fit what the deck is missing. You choose.
          </p>
          {spells.some((h) => h.tag === 'Splash') && (
            <p className="dbk-hints__note">
              Your colours are thin, so a few cards from a third colour are suggested. They need a
              few lands of that colour.
            </p>
          )}
          {spells.some((h) => h.tag === 'Best left') && (
            <p className="dbk-hints__note">
              Not enough cards in your colours: the ones marked "Best left" are the best of the
              rest.
            </p>
          )}
          {spells.slice(0, 8).map((h) => {
            const e = entries.find((x) => x.name === h.name);
            if (!e) return null;
            return (
              <button
                key={h.name}
                className={`dbk-hint ${h.splash ? 'is-splash' : ''}`}
                style={e.art ? ({ '--art': `url("${e.art}")` } as CSSProperties) : undefined}
                title="Show it in your collection"
                onMouseEnter={(ev) => onHover(e, ev.currentTarget)}
                onMouseLeave={() => onHover(null)}
                onClick={() => onPick(e)}
              >
                <span className="dbk-hint__name">{h.name}</span>
                <span className="dbk-row__cost">
                  {costSymbols(e.manaCost).map((sym, i) => (
                    <img key={i} src={symbolUrl(sym)} alt={sym} />
                  ))}
                </span>
                <span className="dbk-hint__why">
                  {h.count > 1 ? `×${h.count} · ` : ''}
                  {h.reason}
                </span>
              </button>
            );
          })}
          {spells.length > 8 && (
            <p className="dbk-hints__note">
              …and {spells.length - 8} more highlighted in your collection.
            </p>
          )}
          {short > 0 && (
            <p className="dbk-hints__lands">
              You're {short} {short === 1 ? 'land' : 'lands'} short: about{' '}
              {lands.map((h) => `${h.count} ${h.name}${h.splash ? ' (splash)' : ''}`).join(', ')}.
            </p>
          )}
        </>
      )}
    </section>
  );
}

/** The colour pairs your cards are best in: show them, or build the deck (always your click). */
function ColourAdvice({
  pairs,
  entries,
  confirm,
  canBuild,
  onHover,
  onClose,
  onShow,
  onBuild,
  onCancel,
}: {
  pairs: readonly PairAdvice[];
  entries: readonly DeckEntry[];
  confirm: string | null;
  canBuild: boolean;
  onHover: (e: DeckEntry | null, anchor?: Element) => void;
  onClose: () => void;
  onShow: (colors: readonly Color[]) => void;
  onBuild: (p: PairAdvice) => void;
  onCancel: () => void;
}) {
  return (
    <section className="dbk-advice" aria-label="Your best colours">
      <button className="dbk-hints__head" aria-expanded onClick={onClose}>
        <span>Your best colours</span>
        <em />
        <i aria-hidden>−</i>
      </button>
      {pairs.map((p) => {
        const key = p.colors.join('');
        return (
          <div key={key} className="dbk-pair">
            <div className="dbk-pair__head">
              {p.colors.map((c) => (
                <img key={c} src={symbolUrl(c)} alt={COLOR_NAMES[c]} />
              ))}
              <b>{p.name}</b>
            </div>
            <p className="dbk-pair__stats">
              {p.playables} playables · {p.creatures} creatures · {p.removal} removal
              {p.splash ? ` · + splash ${COLOR_NAMES[p.splash].toLowerCase()}` : ''}
            </p>
            {p.standouts.length > 0 && (
              <p className="dbk-pair__stars">
                {p.standouts.map((n, i) => {
                  const e = entries.find((x) => x.name === n);
                  return (
                    <span key={n}>
                      {i > 0 && ', '}
                      <span
                        className="dbk-pair__card"
                        onMouseEnter={(ev) => e && onHover(e, ev.currentTarget)}
                        onMouseLeave={() => onHover(null)}
                      >
                        {n}
                      </span>
                    </span>
                  );
                })}
              </p>
            )}
            <div className="dbk-pair__btns">
              <button className="dbk__btn" onClick={() => onShow(p.colors)}>
                Show cards
              </button>
              {canBuild && (
                <button
                  className="dbk__btn"
                  onClick={() => onBuild(p)}
                  onMouseLeave={confirm === key ? onCancel : undefined}
                >
                  {confirm === key ? 'Replace my deck?' : 'Build this deck'}
                </button>
              )}
            </div>
          </div>
        );
      })}
    </section>
  );
}

/** Nonland cards by mana value, 0–1 to 6+: creatures the light part of each bar, the rest dimmer. */
function Curve({ stats }: { stats: ReturnType<typeof deckStats> }) {
  const peak = Math.max(4, ...stats.curve.map((b) => b.creatures + b.others));
  return (
    <div
      className="dbk__curve"
      role="img"
      aria-label={`Mana curve: ${stats.curve.map((b) => b.creatures + b.others).join(', ')} cards at mana value 1 or less up to 6 or more`}
    >
      {stats.curve.map((b, i) => {
        const all = b.creatures + b.others;
        return (
          <div
            key={i}
            className="dbk__curve-col"
            title={`${b.creatures} creatures, ${b.others} other spells`}
          >
            <em>{all || ''}</em>
            <span className="dbk__curve-bar" style={{ height: `${(all / peak) * 100}%` }}>
              <span className="dbk__curve-other" style={{ flexGrow: b.others }} />
              <span className="dbk__curve-creature" style={{ flexGrow: b.creatures }} />
            </span>
            <small>{i === 0 ? '≤1' : i === 5 ? '6+' : i + 1}</small>
          </div>
        );
      })}
    </div>
  );
}
