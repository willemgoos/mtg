import { deckById, type Decklist, scryfallById, slug } from '@mtg/cards';
import { useEffect, useState } from 'react';
import { artFor } from '../game/deckArt.ts';
import { ROUNDS, type RunSummary } from '../game/gauntlet.ts';
import { UiSize } from './UiSize.tsx';
import './home.css';

export type Event = 'gauntlet' | 'expedition';
/** Quick matches and Brawl are single games; the events are runs. */
export type Mode = 'quick' | 'brawl' | Event;
export const isEvent = (m: Mode): m is Event => m === 'gauntlet' || m === 'expedition';
const MODE_NAMES: Record<Mode, string> = {
  quick: 'Quick match',
  brawl: 'Brawl',
  gauntlet: 'Gauntlet',
  expedition: 'Expedition',
};
export type Tab = 'home' | 'decks';

const art = (card: string) => scryfallById.get(slug(card))?.image?.artCrop ?? '';
const image = (card: string) => scryfallById.get(slug(card))?.image?.normal ?? '';

/** The top bar: wordmark, tabs, clears and the UI size. */
export function Nav({ tab, onTab, clears }: { tab: Tab; onTab: (t: Tab) => void; clears: number }) {
  return (
    <header className="nav">
      <div className="nav__brand">
        <svg viewBox="0 0 20 20" aria-hidden>
          <path d="M10 1.5 18.5 10 10 18.5 1.5 10z" />
          <path d="M10 6 14 10 10 14 6 10z" />
        </svg>
        Foundations
      </div>
      <nav className="nav__tabs">
        {(['home', 'decks'] as const).map((t) => (
          <button
            key={t}
            className={`nav__tab ${tab === t ? 'is-on' : ''}`}
            aria-current={tab === t ? 'page' : undefined}
            onClick={() => onTab(t)}
          >
            {t === 'home' ? 'Home' : 'Decks'}
          </button>
        ))}
      </nav>
      <div className="nav__end">
        {clears > 0 && (
          <span className="nav__stat" title="Gauntlets and expeditions cleared">
            <svg viewBox="0 0 16 16" aria-hidden>
              <path d="m8 1.8 1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.6l-3.8 2 .7-4.3-3.1-3 4.3-.6z" />
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
      text: 'Choose your path across ten floors. Win packs, keep the best cards, collect boons.',
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
  const run = isEvent(mode) ? runs[mode] : null;
  const modeName = MODE_NAMES[mode];
  // The last single game, if it was in this mode (Brawl decks only play Brawl).
  const last = quick && (mode === 'brawl') === (quick.deck.series === 'brawl') ? quick : null;

  return (
    <div className="home">
      <Nav tab="home" onTab={onTab} clears={clears} />
      <main className="home__main">
        <section
          className="feature"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
        >
          <div key={s.id} className="feature__slide">
            <div className="feature__glow" style={{ backgroundImage: `url("${s.art}")` }} />
            <div className="feature__art" style={{ backgroundImage: `url("${s.art}")` }} />
            <div className="feature__copy">
              <span className="feature__tag">{s.badge}</span>
              <h1 className="feature__title">{s.title}</h1>
              <p className="feature__text">{s.text}</p>
              <button className="hbtn hbtn--primary hbtn--lg" onClick={s.go}>
                {s.cta}
                <Arrow />
              </button>
            </div>
            {s.cards.length > 0 && (
              <div className="feature__cards">
                {s.cards.map((c) => (
                  <img key={c} src={image(c)} alt={c} draggable={false} />
                ))}
              </div>
            )}
          </div>
          <div className="feature__pager" role="tablist" aria-label="Featured">
            {slides.map((x, i) => (
              <button
                key={x.id}
                role="tab"
                aria-selected={i === slide}
                className={`feature__seg ${i === slide ? 'is-on' : ''} ${paused ? 'is-paused' : ''}`}
                style={{ '--ms': `${SLIDE_MS}ms` } as React.CSSProperties}
                onClick={() => setSlide(i)}
              >
                <span>{x.title}</span>
                <i />
              </button>
            ))}
          </div>
        </section>

        <section className="home__grid">
          <div className="tiles" role="radiogroup" aria-label="Mode">
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
              blurb={`${ROUNDS.length} opponents, each tougher than the last`}
              run={runs.gauntlet}
              on={mode === 'gauntlet'}
              onClick={() => onMode('gauntlet')}
            />
            <ModeTile
              name="Quick match"
              art={
                quick && quick.deck.series !== 'brawl' ? artFor(quick.deck) : art('Gigantosaurus')
              }
              blurb="Any deck against any opponent"
              run={null}
              on={mode === 'quick'}
              onClick={() => onMode('quick')}
            />
            <ModeTile
              name="Brawl"
              art={
                quick?.deck.series === 'brawl'
                  ? artFor(quick.deck)
                  : art('Captain America, Team Leader')
              }
              blurb="100-card decks led by a commander"
              run={null}
              on={mode === 'brawl'}
              onClick={() => onMode('brawl')}
            />
          </div>

          <aside className="launch">
            <div className="launch__panel">
              <span className="launch__mode">{modeName}</span>
              <button className="launch__deck" onClick={() => onDecks(mode)}>
                <span className="launch__name">
                  {run
                    ? deckById(run.deck).name
                    : !isEvent(mode) && last
                      ? `${last.deck.name} vs ${last.opponent}`
                      : 'Choose a deck'}
                </span>
                <span className="launch__change">{run ? 'Decks' : 'Change'}</span>
              </button>
              <button className="hbtn hbtn--primary launch__play" onClick={() => onPlay(mode)}>
                {run ? (run.status === 'playing' ? 'Continue' : 'Results') : 'Play'}
              </button>
            </div>
            <button className="launch__season" onClick={onSeason}>
              <span
                className="launch__thumb"
                style={{ backgroundImage: `url("${art('Ghalta, Primal Hunger')}")` }}
              />
              <span className="launch__copy">
                <strong>Season</strong>
                <small>Open packs, craft and build your own decks</small>
              </span>
              <Arrow />
            </button>
          </aside>
        </section>
      </main>
    </div>
  );
}

function Arrow() {
  return (
    <svg className="hico" viewBox="0 0 16 16" aria-hidden>
      <path d="M3 8h10M9 4l4 4-4 4" />
    </svg>
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
  const playing = run && status === 'playing';
  return (
    <button
      role="radio"
      aria-checked={on}
      className={`tile ${on ? 'is-on' : ''}`}
      onClick={onClick}
    >
      <span className="tile__media" style={{ backgroundImage: `url("${art}")` }}>
        {status && (
          <span className={`tile__status tile__status--${status}`}>
            {status === 'playing' ? 'In progress' : status === 'cleared' ? 'Cleared' : 'Run over'}
          </span>
        )}
      </span>
      <span className="tile__body">
        <span className="tile__name">{name}</span>
        <span className="tile__meta">
          {playing ? `${run.unit} ${run.step} of ${run.steps} · ${deckById(run.deck).name}` : blurb}
        </span>
        {playing && (
          <span className="tile__progress">
            <span className="tile__steps">
              {Array.from({ length: run.steps }, (_, i) => (
                <i key={i} className={i < run.done ? 'is-won' : ''} />
              ))}
            </span>
            <span
              className="tile__lives"
              aria-label={`${run.livesLeft} of ${run.lives} lives left`}
            >
              {Array.from({ length: run.lives }, (_, i) => (
                <svg key={i} viewBox="0 0 16 16" className={i < run.livesLeft ? '' : 'is-lost'}>
                  <path d="M8 14 2 8a3.5 3.5 0 0 1 6-4 3.5 3.5 0 0 1 6 4z" />
                </svg>
              ))}
            </span>
          </span>
        )}
      </span>
    </button>
  );
}
