import { scryfallById, slug } from '@mtg/cards';
import { type ReactNode, useState } from 'react';
import './home.css';
import './deckbuilder.css';

type Colour = 'W' | 'U' | 'B' | 'R' | 'G' | 'C' | 'L';
const COLOURS: { id: Colour; label: string }[] = [
  { id: 'W', label: 'White' },
  { id: 'U', label: 'Blue' },
  { id: 'B', label: 'Black' },
  { id: 'R', label: 'Red' },
  { id: 'G', label: 'Green' },
  { id: 'C', label: 'Colourless' },
  { id: 'L', label: 'Lands' },
];
export const RARITIES = ['common', 'uncommon', 'rare', 'mythic'] as const;
type Rarity = (typeof RARITIES)[number];

const flip = <T,>(set: ReadonlySet<T>, v: T): ReadonlySet<T> => {
  const next = new Set(set);
  if (!next.delete(v)) next.add(v);
  return next;
};

/**
 * A search box with colour and (optionally) rarity filters, for lists of card names. `test` says
 * whether a card passes; `bar` is the controls to render; `extra` adds chips of the caller's own.
 */
export function useCardFilters(opts: { rarity?: boolean } = {}) {
  const [query, setQuery] = useState('');
  const [colours, setColours] = useState<ReadonlySet<Colour>>(new Set());
  const [rarities, setRarities] = useState<ReadonlySet<Rarity>>(new Set());
  const q = query.trim().toLowerCase();
  const narrowed = !!q || colours.size > 0 || rarities.size > 0;

  const test = (name: string): boolean => {
    const c = scryfallById.get(slug(name));
    if (!c) return !narrowed;
    if (rarities.size && !rarities.has(c.rarity as Rarity)) return false;
    if (colours.size) {
      const land = c.typeLine.includes('Land');
      const hit =
        (land && colours.has('L')) ||
        (!land && !c.colors.length && colours.has('C')) ||
        c.colors.some((x) => colours.has(x as Colour));
      if (!hit) return false;
    }
    return !q || `${c.name}\n${c.typeLine}\n${c.oracleText ?? ''}`.toLowerCase().includes(q);
  };

  const bar = (extra?: ReactNode) => (
    <div className="xfilters">
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
        {COLOURS.map((f) => (
          <button
            key={f.id}
            className={`dbk__filter dbk__filter--${f.id} ${colours.has(f.id) ? 'is-on' : ''}`}
            aria-pressed={colours.has(f.id)}
            title={f.label}
            onClick={() => setColours(flip(colours, f.id))}
          />
        ))}
      </div>
      {opts.rarity && (
        <div className="dbk__chips" role="group" aria-label="Filter by rarity">
          {RARITIES.map((r) => (
            <button
              key={r}
              className={`dbk__chip ${rarities.has(r) ? 'is-on' : ''}`}
              aria-pressed={rarities.has(r)}
              onClick={() => setRarities(flip(rarities, r))}
            >
              {r[0]!.toUpperCase() + r.slice(1)}
            </button>
          ))}
        </div>
      )}
      {extra}
      {narrowed && (
        <button
          className="dbk__clear"
          onClick={() => {
            setQuery('');
            setColours(new Set());
            setRarities(new Set());
          }}
        >
          Clear filters
        </button>
      )}
    </div>
  );

  return { test, bar, narrowed };
}
