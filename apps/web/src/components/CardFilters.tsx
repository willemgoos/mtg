import { scryfallById, slug } from '@mtg/cards';
import { type ReactNode, useState } from 'react';
import { type CardRole, cardRoles, ROLES } from '../game/cardRoles.ts';
import { manaValue } from '../game/deckView.ts';
import { rateCard } from '../game/limitedRating.ts';
import './home.css';
import './deckbuilder.css';
import './cardsearch.css';

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

/** Card types to filter on (the Season collection's list). */
const TYPES = ['Creature', 'Instant', 'Sorcery', 'Artifact', 'Enchantment', 'Planeswalker', 'Land'];
type Sort = 'name' | 'cost' | 'best';
const SORTS: { id: Sort; label: string }[] = [
  { id: 'name', label: 'Name' },
  { id: 'cost', label: 'Mana value' },
  { id: 'best', label: 'Best first' },
];
const rolesByName = new Map<string, CardRole[]>();
const rolesOf = (name: string): CardRole[] => {
  let r = rolesByName.get(name);
  if (!r) {
    const c = scryfallById.get(slug(name));
    r = c ? cardRoles(c) : [];
    rolesByName.set(name, r);
  }
  return r;
};

const flip = <T,>(set: ReadonlySet<T>, v: T): ReadonlySet<T> => {
  const next = new Set(set);
  if (!next.delete(v)) next.add(v);
  return next;
};

/**
 * A search box with colour and (optionally) rarity filters, for lists of card names. `test` says
 * whether a card passes; `bar` is the controls to render; `extra` adds chips of the caller's own.
 * With `more`, a second row adds what the card does (removal, card draw, ... as in the Season
 * collection), its type, "fits my deck" (when `deckColours` is given) and a sort; `sort` orders a list.
 */
export function useCardFilters(
  opts: { rarity?: boolean; more?: boolean; deckColours?: ReadonlySet<string> } = {},
) {
  const [query, setQuery] = useState('');
  const [colours, setColours] = useState<ReadonlySet<Colour>>(new Set());
  const [rarities, setRarities] = useState<ReadonlySet<Rarity>>(new Set());
  const [roles, setRoles] = useState<ReadonlySet<CardRole>>(new Set());
  const [types, setTypes] = useState<ReadonlySet<string>>(new Set());
  const [fits, setFits] = useState(false);
  const [order, setOrder] = useState<Sort>('name');
  const q = query.trim().toLowerCase();
  const narrowed =
    !!q || colours.size > 0 || rarities.size > 0 || roles.size > 0 || types.size > 0 || fits;

  const test = (name: string): boolean => {
    const c = scryfallById.get(slug(name));
    if (!c) return !narrowed;
    if (rarities.size && !rarities.has(c.rarity as Rarity)) return false;
    if (roles.size && ![...roles].every((r) => rolesOf(name).includes(r))) return false;
    if (types.size && ![...types].some((t) => c.typeLine.includes(t))) return false;
    // Fits the deck: every colour of the card is one of the deck's (colourless cards always fit).
    if (fits && opts.deckColours && !c.colors.every((x) => opts.deckColours!.has(x))) return false;
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
            setRoles(new Set());
            setTypes(new Set());
            setFits(false);
          }}
        >
          Clear filters
        </button>
      )}
      {opts.more && (
        <div className="xfilters__more">
          <div className="dbk__chips" role="group" aria-label="What it does">
            {ROLES.map((r) => (
              <button
                key={r.id}
                className={`dbk__chip ${roles.has(r.id) ? 'is-on' : ''}`}
                aria-pressed={roles.has(r.id)}
                title={r.hint}
                onClick={() => setRoles(flip(roles, r.id))}
              >
                {r.label}
              </button>
            ))}
          </div>
          <div className="dbk__chips" role="group" aria-label="Card type">
            {TYPES.map((x) => (
              <button
                key={x}
                className={`dbk__chip ${types.has(x) ? 'is-on' : ''}`}
                aria-pressed={types.has(x)}
                onClick={() => setTypes(flip(types, x))}
              >
                {x}
              </button>
            ))}
          </div>
          {opts.deckColours && (
            <button
              className={`dbk__chip ${fits ? 'is-on' : ''}`}
              aria-pressed={fits}
              title="Only cards in your deck's colours"
              onClick={() => setFits(!fits)}
            >
              Fits my deck
            </button>
          )}
          <label className="csearch__select">
            <span>Sort</span>
            <select value={order} onChange={(e) => setOrder(e.target.value as Sort)}>
              {SORTS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
    </div>
  );

  /** The names in the chosen order: as given (by name), by mana value, or best first (the Limited rating). */
  const sort = (names: readonly string[]): string[] => {
    if (order === 'name') return [...names];
    const mv = (n: string) => manaValue(scryfallById.get(slug(n))?.manaCost ?? '');
    return [...names].sort((a, b) =>
      order === 'cost'
        ? mv(a) - mv(b) || a.localeCompare(b)
        : rateCard(b) - rateCard(a) || a.localeCompare(b),
    );
  };

  return { test, bar, narrowed, sort };
}
