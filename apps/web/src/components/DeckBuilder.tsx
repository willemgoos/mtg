import { scryfallById, slug } from '@mtg/cards';
import type { Color } from '@mtg/engine';
import { type ReactNode, useMemo, useState } from 'react';
import {
  cardEntries,
  costSymbols,
  type DeckEntry,
  deckSections,
  isCreature,
  isLand,
  symbolUrl,
  total,
} from '../game/deckView.ts';
import { deckBasicImage } from '../game/basicArt.ts';
import { ruleNotes } from '../game/notes.ts';
import { play } from '../game/sound.ts';
import { HoverPreview, type HoverState } from './Preview.tsx';
import './home.css';
import './deckbuilder.css';
import './foil.css';

/** Card name -> copies. */
type Counts = Readonly<Record<string, number>>;

const BASICS: Record<Color, string> = {
  W: 'Plains',
  U: 'Island',
  B: 'Swamp',
  R: 'Mountain',
  G: 'Forest',
};
const COLORS = Object.keys(BASICS) as Color[];
const basicColor = new Map(COLORS.map((c) => [BASICS[c], c]));

/** Collection filters, in Arena's order: the five colours, colourless, lands. */
type Filter = Color | 'C' | 'L';
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'W', label: 'White' },
  { id: 'U', label: 'Blue' },
  { id: 'B', label: 'Black' },
  { id: 'R', label: 'Red' },
  { id: 'G', label: 'Green' },
  { id: 'C', label: 'Colourless' },
  { id: 'L', label: 'Lands' },
];

function colorsOf(name: string): Color[] {
  const basic = basicColor.get(name);
  if (basic) return [basic];
  const cs = scryfallById.get(slug(name))?.colors ?? [];
  return COLORS.filter((c) => cs.includes(c));
}

/** Mana value filters: 1 (or less) to 6 and up. Lands have no mana value to filter by. */
const COSTS = [1, 2, 3, 4, 5, 6] as const;
const costBucket = (e: DeckEntry) => Math.min(Math.max(e.manaValue, 1), 6);

/** Card type filters. */
type Kind = 'creature' | 'spell';
const KINDS: { id: Kind; label: string }[] = [
  { id: 'creature', label: 'Creatures' },
  { id: 'spell', label: 'Spells' },
];

/** The "Hide used" toggle is remembered between visits (when storage is available). */
const HIDE_KEY = 'mtg.deckBuilder.hideUsed';
function loadHideUsed(): boolean {
  try {
    return localStorage.getItem(HIDE_KEY) === '1';
  } catch {
    return false;
  }
}
function saveHideUsed(on: boolean): void {
  try {
    localStorage.setItem(HIDE_KEY, on ? '1' : '0');
  } catch {
    // Storage unavailable (private mode): the toggle lasts for this visit.
  }
}

interface Narrowing {
  colors: ReadonlySet<Filter>;
  costs: ReadonlySet<number>;
  kinds: ReadonlySet<Kind>;
  query: string;
}

function matches(e: DeckEntry, { colors: filters, costs, kinds, query }: Narrowing): boolean {
  const cs = colorsOf(e.name);
  if (costs.size && (isLand(e) || !costs.has(costBucket(e)))) return false;
  if (kinds.size) {
    const kind: Kind | null = isLand(e) ? null : isCreature(e) ? 'creature' : 'spell';
    if (!kind || !kinds.has(kind)) return false;
  }
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

/** Arena's collection order: by colour (mono, then multicolour, colourless, lands), then cost. */
function collectionRank(e: DeckEntry): number {
  if (isLand(e)) return 8 + (basicColor.has(e.name) ? 0 : 1);
  const cs = colorsOf(e.name);
  return cs.length === 1 ? COLORS.indexOf(cs[0]!) : cs.length ? 5 : 6;
}

/**
 * Arena's deck builder: the collection as a scrolling grid of cards (click to
 * add) under a search box and colour filters, and the deck as a list on the
 * right (click a row to take one out), with the count and curve above it.
 *
 * It works on plain name -> copies counts, so any mode can use it: `pool` is
 * what you own but haven't put in, `deck` what's in. With `basics` the five
 * basic lands are free and unlimited, as in Limited.
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
  onDone: () => void;
}) {
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<ReadonlySet<Filter>>(new Set());
  const [costs, setCosts] = useState<ReadonlySet<number>>(new Set());
  const [kinds, setKinds] = useState<ReadonlySet<Kind>>(new Set());
  const [newOnly, setNewOnly] = useState(false);
  const [hideUsed, setHideUsed] = useState(loadHideUsed);
  const [hover, setHoverState] = useState<HoverState | null>(null);
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
    return withArt(cardEntries([...names].map((n) => [n, pool[n] ?? 0] as const))).sort(
      (a, b) =>
        collectionRank(a) - collectionRank(b) ||
        a.manaValue - b.manaValue ||
        a.name.localeCompare(b.name),
    );
  }, [pool, deck, basics, basicsDeck]);
  const q = query.trim().toLowerCase();
  const isFreeBasic = (e: DeckEntry) => basics && basicColor.has(e.name);
  const shown = owned.filter(
    (e) =>
      matches(e, { colors: filters, costs, kinds, query: q }) &&
      (!newOnly || !!fresh?.has(e.name)) &&
      // Used up: every copy you own is already in the deck.
      (!hideUsed || isFreeBasic(e) || e.count > 0),
  );
  const narrowed = filters.size + costs.size + kinds.size > 0 || newOnly || !!q;
  const clear = () => {
    setFilters(new Set());
    setCosts(new Set());
    setKinds(new Set());
    setNewOnly(false);
    setQuery('');
  };

  const n = total(main);
  const isFree = isFreeBasic;
  const add = (e: DeckEntry) => {
    if (!isFree(e) && !e.count) return;
    onAdd(e.name);
    play('place', { gain: 0.6 });
    if (!isFree(e) && e.count === 1) setHover(null);
  };
  const remove = (e: DeckEntry) => {
    onRemove(e.name);
    play('place', { gain: 0.6 });
    if (e.count === 1) setHover(null);
  };
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
  const toggleKind = flip(setKinds);

  const sections = deckSections(main);
  const short = n < min;
  return (
    <div className="dbk">
      <header className="dbk__bar">
        <div className="dbk__tools">{tools}</div>
        <label className="dbk__search">
          <svg viewBox="0 0 16 16" aria-hidden>
            <circle cx="7" cy="7" r="4.5" />
            <path d="m10.5 10.5 3 3" />
          </svg>
          <input
            type="search"
            placeholder="Search cards"
            aria-label="Search cards"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setQuery('')}
          />
        </label>
        <div className="dbk__filters" role="group" aria-label="Filter by colour">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              className={`dbk__filter dbk__filter--${f.id} ${filters.has(f.id) ? 'is-on' : ''}`}
              aria-pressed={filters.has(f.id)}
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
        <div className="dbk__chips" role="group" aria-label="Filter by type">
          {KINDS.map((k) => (
            <button
              key={k.id}
              className={`dbk__chip ${kinds.has(k.id) ? 'is-on' : ''}`}
              aria-pressed={kinds.has(k.id)}
              onClick={() => toggleKind(k.id)}
            >
              {k.label}
            </button>
          ))}
          {fresh && fresh.size > 0 && (
            <button
              className={`dbk__chip ${newOnly ? 'is-on' : ''}`}
              aria-pressed={newOnly}
              title="Only the cards you just got"
              onClick={() => setNewOnly(!newOnly)}
            >
              New
            </button>
          )}
        </div>
        <label className="dbk__toggle" title="Hide cards whose every copy is already in your deck">
          <input
            type="checkbox"
            checked={hideUsed}
            onChange={(e) => {
              setHideUsed(e.target.checked);
              saveHideUsed(e.target.checked);
            }}
          />
          <span className="dbk__switch" aria-hidden />
          Hide used
        </label>
        <span className="dbk__shown">
          {shown.length} {shown.length === 1 ? 'card' : 'cards'}
          {narrowed && (
            <button className="dbk__clear" onClick={clear}>
              Clear filters
            </button>
          )}
        </span>
      </header>

      <main className="dbk__pool">
        {shown.length === 0 && (
          <p className="dbk__empty">
            {!owned.length
              ? 'No cards yet.'
              : hideUsed && !narrowed
                ? 'Every card you own is in your deck.'
                : 'No cards match.'}
          </p>
        )}
        <div className="dbk__grid">
          {shown.map((e) => {
            const free = isFree(e);
            const inDeck = deck[e.name] ?? 0;
            const out = !free && !e.count;
            return (
              <div key={e.name} className={`dbk-card ${out ? 'is-out' : ''}`}>
                <div
                  className={`dbk-card__face ${fresh?.has(e.name) ? 'is-new' : ''} ${foil?.has(e.name) ? 'is-foil' : ''}`}
                  role="button"
                  tabIndex={out ? -1 : 0}
                  aria-disabled={out}
                  aria-label={`${e.name}${free ? '' : `, ${e.count} left`}`}
                  title={out ? 'All copies are in your deck' : 'Add to the deck'}
                  onMouseEnter={(ev) => setHover(e, ev.currentTarget)}
                  onMouseLeave={() => setHover(null)}
                  onClick={() => add(e)}
                  onKeyDown={(ev) => ev.key === 'Enter' && add(e)}
                >
                  {e.image ? (
                    <img src={e.image} alt="" draggable={false} loading="lazy" />
                  ) : (
                    <div className="dcard__blank">{e.name}</div>
                  )}
                  {fresh?.has(e.name) && <span className="dbk-card__new">New</span>}
                  {foil?.has(e.name) && <span className="foil-tag">Promo</span>}
                  {inDeck > 0 && <span className="dbk-card__in">{inDeck}</span>}
                </div>
                <span className="dbk-card__copies" aria-hidden>
                  {free
                    ? '∞'
                    : Array.from({ length: Math.min(e.count + inDeck, 8) }, (_, i) => (
                        <i key={i} className={i < e.count ? 'is-free' : ''} />
                      ))}
                </span>
              </div>
            );
          })}
        </div>
      </main>

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
          <MiniCurve entries={main} />
        </div>

        <div className="dbk__list">
          {main.length === 0 && <p className="dbk__empty">Click cards on the left to add them.</p>}
          {sections.map((s) => (
            <section key={s.title} className="dbk__section">
              <h2>
                {s.title}
                <span>{total(s.cards)}</span>
              </h2>
              {s.cards.map((e) => (
                <button
                  key={e.name}
                  className="dbk-row"
                  title="Take one out of the deck"
                  style={
                    e.art ? ({ '--art': `url("${e.art}")` } as React.CSSProperties) : undefined
                  }
                  onMouseEnter={(ev) => setHover(e, ev.currentTarget)}
                  onMouseLeave={() => setHover(null)}
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

      <HoverPreview hover={hover} notes={hover ? ruleNotes(hover.defId) : []} />
    </div>
  );
}

/** Nonland cards by mana value, 0–1 to 6+, creatures as the lighter part of each bar. */
function MiniCurve({ entries }: { entries: DeckEntry[] }) {
  const spells = entries.filter((e) => !isLand(e));
  const bars = [0, 1, 2, 3, 4, 5].map((i) => {
    const at = spells.filter((e) => Math.min(Math.max(e.manaValue, 1), 6) - 1 === i);
    return { all: total(at), creatures: total(at.filter(isCreature)) };
  });
  const peak = Math.max(4, ...bars.map((b) => b.all));
  return (
    <div
      className="dbk__curve"
      title={`Mana curve: ${bars.map((b) => b.all).join(' / ')} (0–1 to 6+)`}
    >
      {bars.map((b, i) => (
        <div key={i} className="dbk__curve-col">
          <span className="dbk__curve-bar" style={{ height: `${(b.all / peak) * 100}%` }}>
            <span style={{ height: b.all ? `${(b.creatures / b.all) * 100}%` : 0 }} />
          </span>
          <small>{i === 0 ? '1' : i === 5 ? '6+' : i + 1}</small>
        </div>
      ))}
    </div>
  );
}
