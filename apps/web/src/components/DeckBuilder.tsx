import { scryfallById, slug } from '@mtg/cards';
import type { Color } from '@mtg/engine';
import { type ReactNode, useMemo, useState } from 'react';
import {
  cardEntries,
  type DeckEntry,
  deckColumns,
  isCreature,
  isLand,
  total,
} from '../game/deckView.ts';
import { ruleNotes } from '../game/notes.ts';
import { play } from '../game/sound.ts';
import { HoverPreview, type HoverState } from './Preview.tsx';

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

function matches(e: DeckEntry, filters: ReadonlySet<Filter>, query: string): boolean {
  const cs = colorsOf(e.name);
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
 * Arena's deck builder. The collection fills the top in two rows of full
 * cards (click to add) under a search box and colour filters; the deck sits
 * below as stacks by mana value (click to take a card out), with the deck's
 * name, card count and curve on the band between them.
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
  fresh,
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
  /** Cards to mark as new. */
  fresh?: ReadonlySet<string>;
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
  const [hover, setHoverState] = useState<HoverState | null>(null);
  const setHover = (e: DeckEntry | null, anchor?: Element) =>
    setHoverState(
      e ? { defId: e.defId ?? slug(e.name), anchor: anchor ?? null, image: e.image } : null,
    );

  const main = useMemo(() => cardEntries(Object.entries(deck)), [deck]);
  // Everything you own, used-up cards included (they show dimmed, like Arena).
  const owned = useMemo(() => {
    const names = new Set([...Object.keys(pool), ...Object.keys(deck)]);
    if (basics) for (const b of Object.values(BASICS)) names.add(b);
    return cardEntries([...names].map((n) => [n, pool[n] ?? 0] as const)).sort(
      (a, b) =>
        collectionRank(a) - collectionRank(b) ||
        a.manaValue - b.manaValue ||
        a.name.localeCompare(b.name),
    );
  }, [pool, deck, basics]);
  const q = query.trim().toLowerCase();
  const shown = owned.filter((e) => matches(e, filters, q));

  const n = total(main);
  const isFree = (e: DeckEntry) => basics && basicColor.has(e.name);
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
  const toggle = (f: Filter) =>
    setFilters((s) => {
      const next = new Set(s);
      if (!next.delete(f)) next.add(f);
      return next;
    });

  return (
    <div
      className="dbk"
      style={
        {
          '--art': `url("${art}")`,
          '--glow': `var(--mana-${colors[0] ?? 'W'})`,
        } as React.CSSProperties
      }
    >
      <header className="dbk__bar">
        <label className="dbk__search">
          <input
            type="search"
            placeholder="Search…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setQuery('')}
          />
          {query && (
            <button aria-label="Clear search" onClick={() => setQuery('')}>
              ×
            </button>
          )}
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
        <div className="dbk__tools">{tools}</div>
      </header>

      <main
        className="dbk__pool"
        onWheel={(e) => {
          if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) e.currentTarget.scrollLeft += e.deltaY;
        }}
      >
        <div className="dbk__grid">
          {shown.length === 0 && (
            <p className="dbk__empty">{owned.length ? 'No cards match.' : 'No cards yet.'}</p>
          )}
          {shown.map((e) => {
            const free = isFree(e);
            const inDeck = deck[e.name] ?? 0;
            const out = !free && !e.count;
            return (
              <div key={e.name} className={`dbk-card ${out ? 'is-out' : ''}`}>
                <span className="dbk-card__copies" aria-label={free ? 'Unlimited' : undefined}>
                  {free
                    ? '∞'
                    : Array.from({ length: Math.min(e.count + inDeck, 8) }, (_, i) => (
                        <i key={i} className={i < e.count ? 'is-free' : ''} />
                      ))}
                </span>
                <div
                  className={`dbk-card__face ${fresh?.has(e.name) ? 'is-new' : ''}`}
                  role="button"
                  tabIndex={out ? -1 : 0}
                  aria-disabled={out}
                  title={out ? 'All copies are in your deck' : 'Add to the deck'}
                  onMouseEnter={(ev) => setHover(e, ev.currentTarget)}
                  onMouseLeave={() => setHover(null)}
                  onClick={() => add(e)}
                  onKeyDown={(ev) => ev.key === 'Enter' && add(e)}
                >
                  {e.image ? (
                    <img src={e.image} alt={e.name} draggable={false} />
                  ) : (
                    <div className="dcard__blank">{e.name}</div>
                  )}
                  {fresh?.has(e.name) && <span className="dbk-card__new">New</span>}
                </div>
              </div>
            );
          })}
        </div>
      </main>

      <div className="dbk__band">
        <div className="dbk__plate">
          <span className="deck__pips">
            {colors.map((c) => (
              <span key={c} className={`pip pip--${c}`} />
            ))}
          </span>
          <h1>{name}</h1>
          <span className={`dbk__count ${n < min ? 'is-short' : ''}`}>
            {n}/{min} Cards
          </span>
        </div>
        <MiniCurve entries={main} />
        <div className="dbk__box" aria-hidden />
        {tips.length > 0 && (
          <ul className="dbk__tips" aria-label="Deck tips">
            {tips.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        )}
      </div>

      <section className="dbk__deck" aria-label="Your deck">
        {main.length === 0 && <p className="dbk__empty">Click cards above to add them.</p>}
        {deckColumns(main).map((col) => (
          <div key={col.label} className="dbk-col" aria-label={`${col.label}: ${total(col.cards)}`}>
            {col.cards.map((e) => (
              <div
                key={e.name}
                className="dbk-stack"
                role="button"
                tabIndex={0}
                title="Take one out of the deck"
                onMouseEnter={(ev) => setHover(e, ev.currentTarget)}
                onMouseLeave={() => setHover(null)}
                onClick={() => remove(e)}
                onKeyDown={(ev) => ev.key === 'Enter' && remove(e)}
              >
                {e.image ? (
                  <img src={e.image} alt={e.name} draggable={false} />
                ) : (
                  <div className="dcard__blank">{e.name}</div>
                )}
                <span className="dbk-stack__qty">x{e.count}</span>
              </div>
            ))}
          </div>
        ))}
      </section>
      <button className="btn btn--primary dbk__done" disabled={n < min} onClick={onDone}>
        {n < min ? `${min - n} more to go` : 'Done'}
      </button>

      <HoverPreview hover={hover} notes={hover ? ruleNotes(hover.defId) : []} />
    </div>
  );
}

/** The little curve next to the deck name: nonland cards by mana value, 0–1 to 6+. */
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
        <span key={i} style={{ height: `${(b.all / peak) * 100}%` }}>
          <span style={{ height: b.all ? `${(b.creatures / b.all) * 100}%` : 0 }} />
        </span>
      ))}
    </div>
  );
}
