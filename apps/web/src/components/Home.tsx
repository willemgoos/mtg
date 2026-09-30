import { deckById, type Decklist, scryfallById, slug } from '@mtg/cards';
import { useEffect, useState } from 'react';
import { artFor } from '../game/deckArt.ts';
import { ROUNDS, type RunSummary } from '../game/gauntlet.ts';
import { UiSize } from './UiSize.tsx';

export type Event = 'gauntlet' | 'expedition';
export type Mode = 'quick' | Event;
export type Tab = 'home' | 'decks';

const art = (card: string) => scryfallById.get(slug(card))?.image?.artCrop ?? '';
const image = (card: string) => scryfallById.get(slug(card))?.image?.normal ?? '';

/** Arena's top bar: brand, tabs, clears and the UI size. */
export function Nav({ tab, onTab, clears }: { tab: Tab; onTab: (t: Tab) => void; clears: number }) {
  return (
    <header className="nav">
      <div className="nav__brand">
        <small>A duel of</small>Foundations
      </div>
      <nav className="nav__tabs">
        {(['home', 'decks'] as const).map((t) => (
          <button
            key={t}
            className={`nav__tab ${tab === t ? 'is-on' : ''}`}
            onClick={() => onTab(t)}
          >
            {t === 'home' ? 'Home' : 'Decks'}
          </button>
        ))}
      </nav>
      <div className="nav__end">
        {clears > 0 && (
          <span className="nav__stat" title="Gauntlets and expeditions cleared">
            <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden>
              <path d="m8 1 2.2 4.5 4.8.7-3.5 3.4.8 4.9L8 12.2l-4.3 2.3.8-4.9L1 6.2l4.8-.7z" />
            </svg>
            {clears} {clears === 1 ? 'clear' : 'clears'}
          </span>
        )}
        <UiSize />
      </div>
    </header>
  );
}

interface Slide {
  id: string;
  badge: string;
  title: string;
  text: string;
  cta: string;
  art: string;
  cards: string[];
  go: () => void;
}

const SLIDE_MS = 8000;

/**
 * The home screen, after Arena's: a rotating banner of featured modes, a tile
 * per mode, and one big Play button that does whatever the selected mode needs
 * next (continue a run, rematch with your last deck, or pick a deck).
 */
export function Home({
  mode,
  onMode,
  runs,
  clears,
  quick,
  onPlay,
  onDecks,
  onJumpIn,
  onTab,
  onSeason,
}: {
  mode: Mode;
  onMode: (m: Mode) => void;
  /** The run in progress (or just finished) in each mode. */
  runs: Record<Event, RunSummary | null>;
  clears: number;
  /** The last quick match's deck and opponent level, to play again in one click. */
  quick: { deck: Decklist; opponent: string } | null;
  onPlay: (m: Mode) => void;
  /** Opens the deck picker for a mode. */
  onDecks: (m: Mode) => void;
  onJumpIn: () => void;
  onTab: (t: Tab) => void;
  onSeason: () => void;
}) {
  const slides: Slide[] = [
    {
      id: 'expedition',
      badge: 'New mode',
      title: 'Expedition',
      text: 'Choose your path across seven floors. Win packs, keep the best cards, collect boons.',
      cta: runs.expedition ? 'Continue' : 'Set out',
      art: art('Shivan Dragon'),
      cards: ['Burst Lightning', 'Shivan Dragon', 'Giant Growth'],
      go: () => (runs.expedition ? onPlay('expedition') : onDecks('expedition')),
    },
    {
      id: 'jump-in',
      badge: 'Expedition',
      title: 'Jump In!',
      text: 'Pick two themed half-decks, shuffle them together, and take your new deck on an expedition.',
      cta: 'Pick your halves',
      art: art('Krenko, Mob Boss'),
      cards: ['Krenko, Mob Boss', 'Giada, Font of Hope'],
      go: onJumpIn,
    },
    {
      id: 'gauntlet',
      badge: 'Challenge',
      title: 'Gauntlet',
      text: `${ROUNDS.length} opponents, each tougher than the last. Three losses and you're out.`,
      cta: runs.gauntlet ? 'Continue' : 'Enter the gauntlet',
      art: art('Lyra Dawnbringer'),
      cards: [],
      go: () => (runs.gauntlet ? onPlay('gauntlet') : onDecks('gauntlet')),
    },
  ];
  const [slide, setSlide] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused) return;
    const t = window.setTimeout(() => setSlide((s) => (s + 1) % slides.length), SLIDE_MS);
    return () => window.clearTimeout(t);
  }, [slide, paused, slides.length]);

  const s = slides[slide]!;
  const run = mode === 'quick' ? null : runs[mode];

  return (
    <div className="home">
      <Nav tab="home" onTab={onTab} clears={clears} />
      <main className="home__main home__main--season">
        <section
          className="hero"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
        >
          <div key={s.id} className="hero__slide">
            <div className="hero__wash" style={{ backgroundImage: `url("${s.art}")` }} />
            <div className="hero__art" style={{ backgroundImage: `url("${s.art}")` }} />
            <div className="hero__copy">
              <span className="hero__badge">{s.badge}</span>
              <h1 className="hero__title">{s.title}</h1>
              <p className="hero__text">{s.text}</p>
              <div className="hero__actions">
                <button className="btn btn--primary btn--big" onClick={s.go}>
                  {s.cta}
                </button>
              </div>
            </div>
            {s.cards.length > 0 && (
              <div className="hero__cards">
                {s.cards.map((c) => (
                  <img key={c} src={image(c)} alt={c} draggable={false} />
                ))}
              </div>
            )}
          </div>
          <div className="hero__dots" role="tablist" aria-label="Featured">
            {slides.map((x, i) => (
              <button
                key={x.id}
                role="tab"
                aria-selected={i === slide}
                aria-label={x.title}
                className={`hero__dot ${i === slide ? 'is-on' : ''}`}
                onClick={() => setSlide(i)}
              />
            ))}
          </div>
        </section>

        <section className="season-entry">
          <div>
            <h2>Season</h2>
            <p>Build your collection and earn coins against bot opponents.</p>
          </div>
          <button className="btn btn--primary" onClick={onSeason}>
            Open Season
          </button>
        </section>
        <section className="home__row">
          <div className="modes" role="radiogroup" aria-label="Mode">
            <ModeTile
              name="Expedition"
              art={
                runs.expedition ? artFor(deckById(runs.expedition.deck)) : art('Rampaging Baloths')
              }
              blurb="Choose your path, keep the best cards, collect boons"
              run={runs.expedition}
              on={mode === 'expedition'}
              onClick={() => onMode('expedition')}
            />
            <ModeTile
              name="Gauntlet"
              art={
                runs.gauntlet ? artFor(deckById(runs.gauntlet.deck)) : art('Arahbo, the First Fang')
              }
              blurb={`${ROUNDS.length} opponents, each tougher`}
              run={runs.gauntlet}
              on={mode === 'gauntlet'}
              onClick={() => onMode('gauntlet')}
            />
            <ModeTile
              name="Quick match"
              art={quick ? artFor(quick.deck) : art('Gigantosaurus')}
              blurb="Any deck against any opponent"
              run={null}
              on={mode === 'quick'}
              onClick={() => onMode('quick')}
            />
          </div>

          <div className="play">
            <button className="play__deck" onClick={() => onDecks(mode)}>
              <span className="play__label">
                <small>
                  {mode === 'quick'
                    ? 'Quick match'
                    : mode === 'gauntlet'
                      ? 'Gauntlet'
                      : 'Expedition'}
                </small>
                {run
                  ? deckById(run.deck).name
                  : mode === 'quick' && quick
                    ? `${quick.deck.name} · vs ${quick.opponent}`
                    : 'Choose a deck'}
              </span>
              <span className="play__change">{run ? 'Decks' : 'Change'}</span>
            </button>
            <button className="play__button" onClick={() => onPlay(mode)}>
              {run ? (run.status === 'playing' ? 'Continue' : 'Results') : 'Play'}
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}

function ModeTile({
  name,
  art,
  blurb,
  run,
  on,
  onClick,
}: {
  name: string;
  art: string;
  blurb: string;
  run: RunSummary | null;
  on: boolean;
  onClick: () => void;
}) {
  const status = run?.status;
  return (
    <button
      role="radio"
      aria-checked={on}
      className={`mode ${on ? 'is-on' : ''}`}
      style={{ '--art': `url("${art}")` } as React.CSSProperties}
      onClick={onClick}
    >
      <span className="mode__art" />
      {status && (
        <span className="mode__tag">
          {status === 'playing' ? 'In progress' : status === 'cleared' ? 'Cleared!' : 'Run over'}
        </span>
      )}
      <span className="mode__name">{name}</span>
      <span className="mode__meta">
        {run && status === 'playing'
          ? `${run.unit} ${run.step} of ${run.steps} · ${deckById(run.deck).name}`
          : blurb}
      </span>
      {run && status === 'playing' && (
        <>
          <span className="mode__lives" aria-label={`${run.livesLeft} of ${run.lives} lives left`}>
            {Array.from({ length: run.lives }, (_, i) => (
              <svg
                key={i}
                viewBox="0 0 16 16"
                fill="currentColor"
                className={i < run.livesLeft ? '' : 'is-lost'}
              >
                <path d="M8 14 2 8a3.5 3.5 0 0 1 6-4 3.5 3.5 0 0 1 6 4z" />
              </svg>
            ))}
          </span>
          <span className="mode__ladder">
            {Array.from({ length: run.steps }, (_, i) => (
              <i key={i} className={i < run.done ? 'is-won' : ''} />
            ))}
          </span>
        </>
      )}
    </button>
  );
}
