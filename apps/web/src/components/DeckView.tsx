import { type Decklist, isPlayable, slug } from '@mtg/cards';
import { useEffect, useState } from 'react';
import { artFor, BLURBS } from '../game/deckArt.ts';
import {
  costSymbols,
  type DeckEntry,
  deckColumns,
  deckSections,
  isCreature,
  isLand,
  symbolUrl,
  total,
  useDeckEntries,
} from '../game/deckView.ts';
import { ruleNotes } from '../game/notes.ts';
import { HoverPreview, type HoverState } from './Preview.tsx';

type Hover = (e: DeckEntry | null, anchor?: Element) => void;

/**
 * Read-only deck view in the style of Arena's deck builder: cards in columns
 * by mana value on the left, the deck list with curve and counts on the right,
 * and the large preview with keyword notes on hover.
 */
export function DeckView({
  deck,
  onBack,
  onPlay,
}: {
  deck: Decklist;
  onBack: () => void;
  onPlay: () => void;
}) {
  const entries = useDeckEntries(deck);
  const [hover, setHoverState] = useState<HoverState | null>(null);
  const setHover: Hover = (e, anchor) =>
    setHoverState(
      e ? { defId: e.defId ?? slug(e.name), anchor: anchor ?? null, image: e.image } : null,
    );
  const playable = isPlayable(deck);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onBack();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onBack]);

  return (
    <div
      className="deckview"
      style={{ '--glow': `var(--mana-${deck.colors[0]})` } as React.CSSProperties}
    >
      <header className="deckview__head">
        <button className="btn btn--ghost" onClick={onBack}>
          ← Decks
        </button>
        <div
          className="deckview__banner"
          style={{ '--art': `url("${artFor(deck)}")` } as React.CSSProperties}
        >
          <span className="deck__pips">
            {deck.colors.map((c) => (
              <span key={c} className={`pip pip--${c}`} />
            ))}
          </span>
          <h1>{deck.name}</h1>
          <p>{BLURBS[deck.id]}</p>
        </div>
        <button className="btn btn--primary deckview__play" disabled={!playable} onClick={onPlay}>
          {playable ? 'Play this deck' : 'Coming soon'}
        </button>
      </header>
      <div className="deckview__body">
        <main className="deckview__cols">
          {deckColumns(entries).map((col) => (
            <section key={col.label} className="dcol">
              <div className="dcol__label">
                {col.label}
                <span>{total(col.cards)}</span>
              </div>
              <div className="dcol__stack">
                {col.cards.map((e) => (
                  <div
                    key={e.name}
                    className="dcard"
                    onMouseEnter={(ev) => setHover(e, ev.currentTarget)}
                    onMouseLeave={() => setHover(null)}
                  >
                    {e.image ? (
                      <img src={e.image} alt={e.name} draggable={false} />
                    ) : (
                      <div className="dcard__blank">{e.name}</div>
                    )}
                    {e.count > 1 && <span className="dcard__qty">×{e.count}</span>}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </main>
        <DeckList entries={entries} onHover={setHover} />
      </div>
      <HoverPreview hover={hover} notes={hover ? ruleNotes(hover.defId) : []} />
    </div>
  );
}

/** Arena's deck list panel: curve, type counts and one row per card. `onPick` makes rows clickable. */
export function DeckList({
  entries,
  onHover,
  onPick,
}: {
  entries: DeckEntry[];
  onHover: Hover;
  onPick?: (e: DeckEntry) => void;
}) {
  const spells = entries.filter((e) => !isLand(e));
  const curve = ['0–1', '2', '3', '4', '5', '6+'].map((label, i) => {
    const at = spells.filter((e) => Math.min(Math.max(e.manaValue, 1), 6) - 1 === i);
    return {
      label,
      creatures: total(at.filter(isCreature)),
      others: total(at.filter((e) => !isCreature(e))),
    };
  });
  const peak = Math.max(1, ...curve.map((c) => c.creatures + c.others));
  return (
    <aside className="decklist">
      <div className="decklist__total">
        <span>{total(entries)}</span> cards
      </div>
      <div className="curve" aria-label="Mana curve">
        {curve.map((c) => (
          <div key={c.label} className="curve__col">
            <span className="curve__n">{c.creatures + c.others || ''}</span>
            <div className="curve__bar">
              <div className="curve__others" style={{ flexGrow: c.others / peak }} />
              <div className="curve__creatures" style={{ flexGrow: c.creatures / peak }} />
              <div style={{ flexGrow: 1 - (c.creatures + c.others) / peak }} />
            </div>
            <span className="curve__label">{c.label}</span>
          </div>
        ))}
      </div>
      <div className="curve__legend">
        <span className="curve__key curve__key--creatures">Creatures</span>
        <span className="curve__key curve__key--others">Other spells</span>
      </div>
      {deckSections(entries).map((s) => (
        <section key={s.title} className="decklist__section">
          <h2>
            {s.title}
            <span>{total(s.cards)}</span>
          </h2>
          {s.cards.map((e) => (
            <div
              key={e.name}
              className={`dl-row ${onPick ? 'is-pickable' : ''}`}
              style={e.art ? ({ '--art': `url("${e.art}")` } as React.CSSProperties) : undefined}
              onMouseEnter={(ev) => onHover(e, ev.currentTarget)}
              onMouseLeave={() => onHover(null)}
              {...(onPick && {
                role: 'button',
                tabIndex: 0,
                title: 'Take out of the deck',
                onClick: () => onPick(e),
                onKeyDown: (ev: React.KeyboardEvent) => ev.key === 'Enter' && onPick(e),
              })}
            >
              <span className="dl-row__qty">{e.count}</span>
              <span className="dl-row__name">{e.name}</span>
              <span className="dl-row__cost">
                {costSymbols(e.manaCost).map((sym, i) => (
                  <img key={i} src={symbolUrl(sym)} alt={`{${sym}}`} />
                ))}
              </span>
            </div>
          ))}
        </section>
      ))}
    </aside>
  );
}
