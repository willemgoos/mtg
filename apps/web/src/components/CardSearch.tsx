import { useEffect, useMemo, useRef, useState } from 'react';
import {
  allCards,
  allKeywords,
  type CardType,
  type ColorFilter,
  COSTS,
  type Filters,
  NO_FILTERS,
  OTHER_SET,
  RARITIES,
  type Rarity,
  type SearchCard,
  search,
  SETS,
  type Sort,
  TYPES,
} from '../game/cardSearch.ts';
import { costSymbols, symbolUrl } from '../game/deckView.ts';
import { Nav, type Tab } from './Home.tsx';
import './deckbuilder.css';
import './cardsearch.css';

const COLOR_FILTERS: { id: ColorFilter; label: string }[] = [
  { id: 'W', label: 'White' },
  { id: 'U', label: 'Blue' },
  { id: 'B', label: 'Black' },
  { id: 'R', label: 'Red' },
  { id: 'G', label: 'Green' },
  { id: 'M', label: 'Multicolour' },
  { id: 'C', label: 'Colourless' },
];

const SET_NAME = new Map(SETS.map((s) => [s.code, s.name]));
/** Cards rendered per step as you scroll. */
const PAGE = 120;

function toggled<T>(set: ReadonlySet<T>, v: T): Set<T> {
  const next = new Set(set);
  if (!next.delete(v)) next.add(v);
  return next;
}

function Cost({ cost }: { cost: string }) {
  return (
    <span className="csearch__cost">
      {costSymbols(cost).map((s, i) => (
        <img key={i} src={symbolUrl(s)} alt={`{${s}}`} />
      ))}
    </span>
  );
}

/** The Cards tab: search every card in the game by name, type, rules text and keyword. */
export function CardSearch({ onTab, clears }: { onTab: (t: Tab) => void; clears: number }) {
  const [f, setF] = useState<Filters>(NO_FILTERS);
  const [sort, setSort] = useState<Sort>('color');
  const [limit, setLimit] = useState(PAGE);
  const [open, setOpen] = useState<SearchCard | null>(null);
  const keywords = useMemo(allKeywords, []);
  const shown = useMemo(() => search(f, sort), [f, sort]);
  const total = allCards().length;
  const narrowed =
    !!f.query.trim() ||
    f.colors.size + f.costs.size + f.types.size + f.rarities.size > 0 ||
    !!f.set ||
    !!f.keyword;

  const update = (patch: Partial<Filters>) => {
    setF((x) => ({ ...x, ...patch }));
    setLimit(PAGE);
  };

  // Render more as the end of the grid scrolls into view.
  const more = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = more.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (es) => es.some((e) => e.isIntersecting) && setLimit((n) => n + PAGE),
      { rootMargin: '600px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [shown, limit]);

  return (
    <div className="dpick csearch">
      <Nav tab="cards" onTab={onTab} clears={clears} />
      <div className="dbk csearch__shell">
        <header className="dbk__bar csearch__bar">
          <label className="dbk__search csearch__search">
            <svg viewBox="0 0 16 16" aria-hidden>
              <circle cx="7" cy="7" r="4.5" />
              <path d="m10.5 10.5 3 3" />
            </svg>
            <input
              type="search"
              placeholder='Name, type or rules text — try t:goblin o:"draw a card" k:flying'
              aria-label="Search cards"
              autoFocus
              value={f.query}
              onChange={(e) => update({ query: e.target.value })}
              onKeyDown={(e) => e.key === 'Escape' && update({ query: '' })}
            />
          </label>
          <span className="dbk__shown">
            {shown.length === total
              ? `${total} cards`
              : `${shown.length} of ${total} ${total === 1 ? 'card' : 'cards'}`}
            {narrowed && (
              <button className="dbk__clear" onClick={() => update(NO_FILTERS)}>
                Clear filters
              </button>
            )}
          </span>

          <div className="csearch__row">
            <div className="dbk__filters" role="group" aria-label="Filter by colour">
              {COLOR_FILTERS.map((c) => (
                <button
                  key={c.id}
                  className={`dbk__filter dbk__filter--${c.id} ${f.colors.has(c.id) ? 'is-on' : ''}`}
                  aria-pressed={f.colors.has(c.id)}
                  title={c.label}
                  onClick={() => update({ colors: toggled(f.colors, c.id) })}
                />
              ))}
            </div>
            <div className="csearch__seg" role="group" aria-label="Colour match">
              {(['any', 'exact'] as const).map((m) => (
                <button
                  key={m}
                  className={f.colorMode === m ? 'is-on' : ''}
                  aria-pressed={f.colorMode === m}
                  title={
                    m === 'any'
                      ? 'Cards with any of the picked colours'
                      : 'Cards with exactly the picked colours'
                  }
                  onClick={() => update({ colorMode: m })}
                >
                  {m === 'any' ? 'Including' : 'Exactly'}
                </button>
              ))}
            </div>
            <div className="dbk__chips" role="group" aria-label="Filter by mana value">
              {COSTS.map((c) => (
                <button
                  key={c}
                  className={`dbk__chip dbk__chip--cost ${f.costs.has(c) ? 'is-on' : ''}`}
                  aria-pressed={f.costs.has(c)}
                  title={c === 7 ? 'Mana value 7 or more' : `Mana value ${c}`}
                  onClick={() => update({ costs: toggled(f.costs, c) })}
                >
                  {c === 7 ? '7+' : c}
                </button>
              ))}
            </div>
          </div>

          <div className="csearch__row">
            <div className="dbk__chips" role="group" aria-label="Filter by type">
              {TYPES.map((t) => (
                <button
                  key={t}
                  className={`dbk__chip ${f.types.has(t) ? 'is-on' : ''}`}
                  aria-pressed={f.types.has(t)}
                  onClick={() => update({ types: toggled(f.types, t as CardType) })}
                >
                  {t}
                </button>
              ))}
            </div>
            <div className="dbk__chips" role="group" aria-label="Filter by rarity">
              {RARITIES.map((r) => (
                <button
                  key={r}
                  className={`dbk__chip csearch__rarity csearch__rarity--${r} ${f.rarities.has(r) ? 'is-on' : ''}`}
                  aria-pressed={f.rarities.has(r)}
                  onClick={() => update({ rarities: toggled(f.rarities, r as Rarity) })}
                >
                  {r[0]!.toUpperCase() + r.slice(1)}
                </button>
              ))}
            </div>
            <label className="csearch__select">
              <span>Set</span>
              <select value={f.set} onChange={(e) => update({ set: e.target.value })}>
                <option value="">All sets</option>
                {SETS.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.name}
                  </option>
                ))}
                <option value={OTHER_SET}>Other reprints</option>
              </select>
            </label>
            <label className="csearch__select">
              <span>Keyword</span>
              <select value={f.keyword} onChange={(e) => update({ keyword: e.target.value })}>
                <option value="">Any</option>
                {keywords.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </label>
            <label className="csearch__select">
              <span>Sort</span>
              <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                <option value="color">Colour</option>
                <option value="cost">Mana value</option>
                <option value="name">Name</option>
                <option value="rarity">Rarity</option>
              </select>
            </label>
          </div>
        </header>

        <main className="dbk__pool">
          {shown.length === 0 && <p className="dbk__empty">No cards match.</p>}
          <div className="dbk__grid">
            {shown.slice(0, limit).map((c) => (
              <div key={c.card.name} className="dbk-card">
                <button
                  className="dbk-card__face csearch__face"
                  aria-label={c.name}
                  title={c.name}
                  onClick={() => setOpen(c)}
                >
                  {c.card.image ? (
                    <img src={c.card.image.normal} alt="" draggable={false} loading="lazy" />
                  ) : (
                    <div className="dcard__blank">{c.name}</div>
                  )}
                </button>
              </div>
            ))}
          </div>
          {limit < shown.length && <div ref={more} className="csearch__more" />}
        </main>
      </div>
      {open && <Detail card={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

/** A card up close: big image (flippable for double-faced cards) and its text. */
function Detail({ card, onClose }: { card: SearchCard; onClose: () => void }) {
  const [flipped, setFlipped] = useState(false);
  const face = flipped && card.back ? card.back : card.card;
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);
  const faces = card.back ? [card.card, card.back] : [card.card];
  return (
    <div className="csearch__modal" role="dialog" aria-modal aria-label={card.name} onClick={onClose}>
      <div className="csearch__detail" onClick={(e) => e.stopPropagation()}>
        <div className="csearch__big">
          {face.image ? <img src={face.image.large} alt={face.name} /> : null}
          {card.back && (
            <button className="hbtn csearch__flip" onClick={() => setFlipped(!flipped)}>
              Flip to {flipped ? card.card.name : card.back.name}
            </button>
          )}
        </div>
        <div className="csearch__info">
          {faces.map((x) => (
            <section key={x.name} className="csearch__faceinfo">
              <h2>
                {x.flavorName ?? x.name} {x.manaCost && <Cost cost={x.manaCost} />}
              </h2>
              {x.flavorName && <p className="csearch__dim">{x.name}</p>}
              <p className="csearch__type">{x.typeLine}</p>
              {x.oracleText && (
                <div className="csearch__oracle">
                  {x.oracleText.split('\n').map((line, i) => (
                    <p key={i}>{line}</p>
                  ))}
                </div>
              )}
              {x.power !== undefined && (
                <p className="csearch__pt">
                  {x.power}/{x.toughness}
                </p>
              )}
              {x.loyalty !== undefined && <p className="csearch__pt">Loyalty {x.loyalty}</p>}
            </section>
          ))}
          <dl className="csearch__meta">
            <dt>Set</dt>
            <dd>
              {SET_NAME.get(card.card.set) ?? card.card.set.toUpperCase()} #
              {card.card.collectorNumber}
            </dd>
            <dt>Rarity</dt>
            <dd className={`csearch__rarity--${card.card.rarity}`}>{card.card.rarity}</dd>
            <dt>Mana value</dt>
            <dd>{card.manaValue}</dd>
            {card.keywordText && (
              <>
                <dt>Keywords</dt>
                <dd>{[...new Set([...card.card.keywords, ...(card.back?.keywords ?? [])])].join(', ')}</dd>
              </>
            )}
          </dl>
          <button className="hbtn csearch__close" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
