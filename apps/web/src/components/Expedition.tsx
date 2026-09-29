import { slug } from '@mtg/cards';
import type { Color } from '@mtg/engine';
import { useMemo, useState } from 'react';
import { artFor } from '../game/deckArt.ts';
import { cardEntries, type DeckEntry, deckColumns, total } from '../game/deckView.ts';
import {
  BASICS,
  choosePack,
  deckColors,
  type ExpeditionRun,
  type ExpeditionState,
  MIN_DECK,
  moveCard,
  openPacks,
  runDeck,
  size,
} from '../game/expedition.ts';
import { wins } from '../game/gauntlet.ts';
import { ruleNotes } from '../game/notes.ts';
import { play } from '../game/sound.ts';
import { DeckList } from './DeckView.tsx';
import { Gauntlet } from './Gauntlet.tsx';
import { HoverPreview, type HoverState } from './Preview.tsx';
import { COLOR_NAMES, PackOpening, packArt, packName } from './PackOpening.tsx';
import { UiSize } from './UiSize.tsx';

type Update = (f: (s: ExpeditionState) => ExpeditionState) => void;

/**
 * Everything between expedition matches: choosing a pack after a win, opening
 * packs, the deck builder, and the ladder itself.
 */
export function Expedition({
  state,
  update,
  resumable,
  onPlay,
  onAbandon,
  onAgain,
  onMenu,
}: {
  state: ExpeditionState;
  update: Update;
  resumable: boolean;
  onPlay: () => void;
  onAbandon: () => void;
  onAgain: () => void;
  onMenu: () => void;
}) {
  const run = state.run!;
  const b = run.build;
  const [building, setBuilding] = useState(false);
  if (b.offer) return <PackOffer run={run} onChoose={(i) => update((s) => choosePack(s, i))} />;
  if (b.packs.length)
    return (
      <PackOpening
        run={run}
        onDone={() => {
          update(openPacks);
          setBuilding(true);
        }}
      />
    );
  if (!resumable && (building || size(b.main) < MIN_DECK))
    return <DeckBuilder run={run} update={update} onDone={() => setBuilding(false)} />;
  return (
    <Gauntlet
      name="Expedition"
      state={state}
      resumable={resumable}
      onPlay={onPlay}
      onDeck={() => setBuilding(true)}
      onAbandon={onAbandon}
      onAgain={onAgain}
      onMenu={onMenu}
    />
  );
}

// ---------------------------------------------------------------------------
// Packs
// ---------------------------------------------------------------------------

function PackOffer({ run, onChoose }: { run: ExpeditionRun; onChoose: (i: number) => void }) {
  const mine = deckColors(run.build);
  return (
    <div className="start offer">
      <UiSize />
      <div className="start__title">
        <span className="start__eyebrow">Expedition · Round {wins(run)} won</span>
        <h1>Choose your reward</h1>
        <p>Deepen your colours or open something new.</p>
      </div>
      <div className="start__decks offer__packs">
        {run.build.offer!.map((p, i) => (
          <button
            key={i}
            className="deck"
            style={
              {
                '--art': `url("${packArt(p)}")`,
                '--glow': p.kind === 'color' ? `var(--mana-${p.color})` : 'var(--brass)',
                '--i': i,
              } as React.CSSProperties
            }
            onClick={() => onChoose(i)}
          >
            <span className="deck__art" />
            <span className="deck__pips">
              {p.kind === 'color' && <span className={`pip pip--${p.color}`} />}
            </span>
            <span className="deck__name">{packName(p)}</span>
            <span className="deck__blurb">
              {p.kind === 'color'
                ? `Mostly ${COLOR_NAMES[p.color].toLowerCase()} cards${mine.includes(p.color) ? ', a colour you play' : ', a new direction'}`
                : 'Two rares instead of one'}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Deck builder
// ---------------------------------------------------------------------------

/**
 * Arena's deck builder, Limited style: your collection in columns by mana
 * value on the left (click to add), the deck list on the right (click to take
 * out), and basic lands free for the taking.
 */
function DeckBuilder({
  run,
  update,
  onDone,
}: {
  run: ExpeditionRun;
  update: Update;
  onDone: () => void;
}) {
  const b = run.build;
  const main = useMemo(() => cardEntries(Object.entries(b.main)), [b.main]);
  const side = useMemo(() => cardEntries(Object.entries(b.side)), [b.side]);
  const fresh = useMemo(() => new Set(b.fresh), [b.fresh]);
  const [hover, setHoverState] = useState<HoverState | null>(null);
  const setHover = (e: DeckEntry | null, anchor?: Element) =>
    setHoverState(e ? { defId: e.defId ?? slug(e.name), anchor: anchor ?? null } : null);
  const move = (name: string, to: 'main' | 'side') => {
    update((s) => moveCard(s, name, to));
    play('place', { gain: 0.6 });
  };
  const deck = runDeck(run);
  const n = size(b.main);

  return (
    <div
      className="deckview builder"
      style={{ '--glow': `var(--mana-${deck.colors[0]})` } as React.CSSProperties}
    >
      <header className="deckview__head">
        <div
          className="deckview__banner"
          style={{ '--art': `url("${artFor(deck)}")` } as React.CSSProperties}
        >
          <span className="deck__pips">
            {deck.colors.map((c) => (
              <span key={c} className={`pip pip--${c}`} />
            ))}
          </span>
          <h1>Your deck</h1>
          <p>
            Click a card in your collection to add it, or a card in your deck to take it out. At
            least {MIN_DECK} cards.
          </p>
        </div>
        <button
          className="btn btn--primary deckview__play"
          disabled={n < MIN_DECK}
          onClick={onDone}
        >
          {n < MIN_DECK ? `${MIN_DECK - n} more to go` : 'Done'}
        </button>
      </header>
      <div className="deckview__body">
        <main className="builder__pool">
          <div className="builder__lands" aria-label="Basic lands">
            <span className="builder__label">Basic lands</span>
            {(Object.entries(BASICS) as [Color, string][]).map(([c, name]) => (
              <span key={c} className="builder__land">
                <button
                  className="btn btn--ghost builder__step"
                  aria-label={`Remove a ${name}`}
                  disabled={!b.main[name]}
                  onClick={() => move(name, 'side')}
                >
                  −
                </button>
                <span className={`pip pip--${c}`} title={name} />
                <span className="builder__count">{b.main[name] ?? 0}</span>
                <button
                  className="btn btn--ghost builder__step"
                  aria-label={`Add a ${name}`}
                  onClick={() => move(name, 'main')}
                >
                  +
                </button>
              </span>
            ))}
          </div>
          <div className="deckview__cols">
            {side.length === 0 && (
              <p className="builder__empty">Every card you own is in your deck.</p>
            )}
            {deckColumns(side).map((col) => (
              <section key={col.label} className="dcol">
                <div className="dcol__label">
                  {col.label}
                  <span>{total(col.cards)}</span>
                </div>
                <div className="dcol__stack">
                  {col.cards.map((e) => (
                    <div
                      key={e.name}
                      className="dcard is-pickable"
                      role="button"
                      tabIndex={0}
                      title="Add to the deck"
                      onMouseEnter={(ev) => setHover(e, ev.currentTarget)}
                      onMouseLeave={() => setHover(null)}
                      onClick={() => {
                        move(e.name, 'main');
                        if (e.count === 1) setHover(null);
                      }}
                      onKeyDown={(ev) => ev.key === 'Enter' && move(e.name, 'main')}
                    >
                      {e.image ? (
                        <img src={e.image} alt={e.name} draggable={false} />
                      ) : (
                        <div className="dcard__blank">{e.name}</div>
                      )}
                      {fresh.has(e.name) && <span className="dcard__new">New</span>}
                      {e.count > 1 && <span className="dcard__qty">×{e.count}</span>}
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </main>
        <DeckList
          entries={main}
          onHover={setHover}
          onPick={(e) => {
            move(e.name, 'side');
            setHover(null);
          }}
        />
      </div>
      <HoverPreview hover={hover} notes={hover ? ruleNotes(hover.defId) : []} />
    </div>
  );
}
