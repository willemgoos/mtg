import { SCRYFALL, scryfallById, slug } from '@mtg/cards';
import type { Color } from '@mtg/engine';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import {
  type ExpeditionRun,
  keepCount,
  type Pack,
  pendingPacks,
  runDeck,
} from '../game/expedition.ts';
import { burst, flash, fxOn, later, mountFx, ring } from '../game/fx.ts';
import { ruleNotes } from '../game/notes.ts';
import { play } from '../game/sound.ts';
import { HoverPreview, type HoverState } from './Preview.tsx';
import { UiSize } from './UiSize.tsx';

export const COLOR_NAMES: Record<Color, string> = {
  W: 'White',
  U: 'Blue',
  B: 'Black',
  R: 'Red',
  G: 'Green',
};

export function packName(p: Pack): string {
  if (p.kind === 'color') return `${COLOR_NAMES[p.color]} pack`;
  return p.kind === 'rare' ? 'Rare pack' : 'Foundations booster';
}

/** Art for a pack: the first Foundations rare of its colour, or a mythic. */
export function packArt(p: Pack): string {
  const card =
    p.kind === 'color'
      ? SCRYFALL.find((c) => c.set === 'fdn' && c.rarity === 'rare' && c.colors.join() === p.color)
      : SCRYFALL.find((c) => c.set === 'fdn' && c.rarity === 'mythic');
  return card?.image?.artCrop ?? '';
}

const packGlow = (p: Pack) => (p.kind === 'color' ? `var(--mana-${p.color})` : 'var(--brass)');

type Rarity = 'common' | 'uncommon' | 'rare' | 'mythic';
const RANK: Record<Rarity, number> = { common: 0, uncommon: 1, rare: 2, mythic: 3 };
/** Season packs can hold wildcards: they travel through the reveal as `Wildcard: <rarity>`. */
const WILDCARD = 'Wildcard: ';
export const wildcardName = (rarity: Rarity) => `${WILDCARD}${rarity}`;
const rarityOf = (name: string) =>
  (name.startsWith(WILDCARD)
    ? name.slice(WILDCARD.length)
    : (scryfallById.get(slug(name))?.rarity ?? 'common')) as Rarity;
const COLS = 6;
const GOLD = '#f3dca4';
const EMBER = '#ff8a4c';

/**
 * Opening packs the way Arena does it: a sealed booster you click to tear
 * open, cards dealt face down (rares glowing through their backs), and a flip
 * per card, with the big effects saved for rares and mythics. Several packs
 * open one after another.
 */
export function PackOpening({
  run,
  onDone,
}: {
  run: ExpeditionRun;
  /** The cards kept from each pack. */
  onDone: (kept: string[][]) => void;
}) {
  // Commons first, the rare last, like Arena's reveal.
  const packs = useMemo(
    () =>
      pendingPacks(run).map((cards) =>
        [...cards].sort((a, b) => RANK[rarityOf(a)] - RANK[rarityOf(b)]),
      ),
    [run],
  );
  const [index, setIndex] = useState(0);
  const [kept, setKept] = useState<string[][]>([]);
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => mountFx(canvas.current!), []);
  const last = index === packs.length - 1;
  return (
    <>
      <OnePack
        key={index}
        pack={run.build.packs[index]!}
        cards={packs[index]!}
        keep={Math.min(keepCount(run), packs[index]!.length)}
        eyebrow={`Expedition · ${runDeck(run).name}${packs.length > 1 ? ` · Pack ${index + 1} of ${packs.length}` : ''}`}
        onKeep={(names) => {
          const all = [...kept, names];
          if (last) onDone(all);
          else {
            setKept(all);
            setIndex(index + 1);
          }
        }}
      />
      <canvas ref={canvas} className="fx-layer" aria-hidden />
    </>
  );
}

/** A Season booster: everything in it is yours, so the reveal ends with a single Done. */
export function BoosterReveal({
  cards,
  eyebrow,
  note,
  extra,
  onDone,
}: {
  /** Card names, or `wildcardName(rarity)`. */
  cards: string[];
  eyebrow: string;
  /** Shown under the title once every card is face up. */
  note?: ReactNode;
  /** More actions beside Done, once every card is face up. */
  extra?: ReactNode;
  onDone: () => void;
}) {
  const sorted = useMemo(
    () => [...cards].sort((a, b) => RANK[rarityOf(a)] - RANK[rarityOf(b)]),
    [cards],
  );
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => mountFx(canvas.current!), []);
  return (
    <>
      <OnePack
        pack={{ kind: 'booster' }}
        cards={sorted}
        keep={0}
        eyebrow={eyebrow}
        note={note}
        extra={extra}
        onKeep={onDone}
      />
      <canvas ref={canvas} className="fx-layer" aria-hidden />
    </>
  );
}

type Phase = 'sealed' | 'tearing' | 'open' | 'leaving';

function OnePack({
  pack,
  cards,
  keep,
  eyebrow,
  note,
  extra,
  onKeep,
}: {
  pack: Pack;
  cards: string[];
  /** How many cards to keep; 0 keeps them all. */
  keep: number;
  eyebrow: string;
  note?: ReactNode;
  extra?: ReactNode;
  onKeep: (names: string[]) => void;
}) {
  const [phase, setPhase] = useState<Phase>('sealed');
  const [up, setUp] = useState<ReadonlySet<number>>(new Set());
  const [chosen, setChosen] = useState<readonly number[]>([]);
  const choose = (i: number) => {
    if (phase !== 'open') return;
    if (chosen.includes(i)) {
      setChosen(chosen.filter((c) => c !== i));
      play('slide', { gain: 0.4 });
    } else if (chosen.length < keep) {
      setChosen([...chosen, i]);
      play('place', { gain: 0.7 });
      const el = els.current[i];
      if (el) {
        const r = el.getBoundingClientRect();
        ring(r.left + r.width / 2, r.top + r.height / 2, GOLD, { r0: 20, r1: 90, life: 18 });
      }
    }
  };
  const confirm = () => {
    setPhase('leaving');
    setHover(null);
    play('fan', { gain: 0.7 });
    later(fxOn() ? 650 : 0, () => onKeep(chosen.map((i) => cards[i]!)));
  };
  const [hover, setHover] = useState<HoverState | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const booster = useRef<HTMLButtonElement>(null);
  const els = useRef<(HTMLDivElement | null)[]>([]);
  /** Cards flipped or flipping (a rare's wind-up), so a click and "Reveal all" can't both flip one. */
  const busy = useRef(new Set<number>());
  const done = up.size === cards.length;

  useEffect(() => {
    play('fan', { gain: 0.6 });
  }, []);

  const shakeRoot = (px: number) => {
    if (!fxOn() || !root.current) return;
    const frames: Keyframe[] = [];
    for (let i = 0; i < 8; i++) {
      const f = (1 - i / 8) * px;
      frames.push({
        translate: `${(Math.random() * 2 - 1) * f}px ${(Math.random() * 2 - 1) * f}px`,
      });
    }
    frames.push({ translate: '0px 0px' });
    root.current.animate(frames, { duration: 420, easing: 'linear' });
  };

  const tear = () => {
    if (phase !== 'sealed') return;
    setPhase('tearing');
    play('shove', { gain: 0.8 });
    play('tick', { delay: 0.25 });
    play('tick', { delay: 0.45, gain: 1.2 });
    later(fxOn() ? 700 : 0, () => {
      const r = booster.current?.getBoundingClientRect();
      if (r) {
        const x = r.left + r.width / 2;
        const y = r.top + r.height / 2;
        flash('#fff3d6', 0.55, 520);
        burst(x, y, GOLD, { n: 80, speed: [3, 12], life: [30, 64], size: [3, 8], drag: 0.94 });
        burst(x, y, getComputedStyle(booster.current!).getPropertyValue('--glow') || EMBER, {
          n: 40,
          speed: [2, 8],
          life: [26, 50],
        });
        ring(x, y, GOLD, { r0: 20, r1: 320, life: 32, width: 5 });
      }
      shakeRoot(12);
      play('hit', { gain: 0.9 });
      play('shuffle', { delay: 0.05 });
      for (let i = 0; i < cards.length; i += 2)
        play('slide', { delay: 0.15 + i * 0.045, gain: 0.45 });
      setPhase('open');
    });
  };

  const flip = (i: number, fast = false) => {
    if (phase !== 'open' || busy.current.has(i)) return;
    busy.current.add(i);
    const el = els.current[i];
    const rarity = rarityOf(cards[i]!);
    const big = rarity === 'rare' || rarity === 'mythic';
    const turn = () => {
      setUp((s) => new Set(s).add(i));
      if (!el) return;
      const r = el.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      if (rarity === 'mythic') {
        flash(EMBER, 0.4, 700);
        burst(x, y, EMBER, { n: 90, speed: [3, 12], life: [34, 70], size: [3, 9], drag: 0.95 });
        burst(x, y, GOLD, { n: 50, speed: [1, 6], life: [40, 80], grav: -0.03 });
        ring(x, y, EMBER, { r0: 30, r1: 360, life: 36, width: 6 });
        ring(x, y, GOLD, { r0: 10, r1: 220, life: 28, width: 3 });
        shakeRoot(14);
        play('win', { gain: 0.8 });
        play('chime', { delay: 0.1 });
      } else if (rarity === 'rare') {
        flash(GOLD, 0.25, 500);
        burst(x, y, GOLD, { n: 60, speed: [2, 9], life: [30, 60], size: [3, 7], drag: 0.95 });
        ring(x, y, GOLD, { r0: 24, r1: 260, life: 30, width: 4 });
        shakeRoot(8);
        play('chime');
        play('gain', { delay: 0.08 });
      } else {
        burst(x, y, rarity === 'uncommon' ? '#cfe3f0' : '#b8ab8a', {
          n: rarity === 'uncommon' ? 18 : 8,
          speed: [1, 4],
          life: [16, 30],
          size: [2, 4],
          box: { w: r.width, h: r.height, mode: 'edge' },
        });
        play('flip', { gain: fast ? 0.5 : 0.8 });
        if (rarity === 'uncommon') play('pluck', { gain: 0.5 });
      }
    };
    if (!big || !el || !fxOn()) return turn();
    // A rare winds up first: it lifts and trembles, then bursts over.
    play('tick');
    el.animate(
      [
        { scale: '1', rotate: '0deg' },
        { scale: '1.08', rotate: '-2deg', offset: 0.25 },
        { scale: '1.1', rotate: '2.5deg', offset: 0.5 },
        { scale: '1.12', rotate: '-3deg', offset: 0.75 },
        { scale: '1', rotate: '0deg' },
      ],
      { duration: 520, easing: 'ease-in-out' },
    );
    later(480, turn);
  };

  /** Flips the rest in order, commons quickly, with a beat before each rare. */
  const revealAll = () => {
    let t = 0;
    cards.forEach((name, i) => {
      if (busy.current.has(i)) return;
      const big = RANK[rarityOf(name)] >= RANK.rare;
      t += big ? 450 : 110;
      later(t, () => flip(i, !big));
      if (big) t += 500;
    });
  };

  // A Season booster (eight cards) deals as two rows of four.
  const cols = cards.length === 8 ? 4 : COLS;
  const rows = Math.ceil(cards.length / cols);
  return (
    <div ref={root} className={`start opening opening--${phase}`}>
      <UiSize />
      <div className="start__title">
        <span className="start__eyebrow">{eyebrow}</span>
        <h1>{packName(pack)}</h1>
        <p>
          {phase === 'open' || phase === 'leaving'
            ? !keep
              ? done
                ? (note ?? 'Everything here is now in your collection.')
                : 'Flip the cards. Everything in the pack is yours.'
              : done
                ? `Choose ${keep} to keep. The rest go back.`
                : `Flip the cards, then choose ${keep} to keep.`
            : 'Click the pack to tear it open.'}
        </p>
      </div>

      <div className="opening__stage">
        {phase === 'sealed' || phase === 'tearing' ? (
          <div className="booster-wrap">
            <button
              ref={booster}
              className={`booster ${phase === 'tearing' ? 'is-tearing' : ''}`}
              style={
                {
                  '--art': `url("${packArt(pack)}")`,
                  '--glow': packGlow(pack),
                } as React.CSSProperties
              }
              onClick={tear}
              aria-label={`Open the ${packName(pack)}`}
            >
              <span className="booster__crimp booster__crimp--top" />
              <span className="booster__art" />
              <span className="booster__foil" />
              <span className="booster__label">
                <span className="booster__set">Foundations</span>
                <span className="booster__kind">{packName(pack)}</span>
              </span>
              <span className="booster__crimp booster__crimp--bottom" />
            </button>
            <span className="booster__hint">Click to open</span>
          </div>
        ) : (
          <div
            className="pack-cards"
            style={{ '--rows': rows, '--cols': cols } as React.CSSProperties}
          >
            {cards.map((name, i) => {
              const defId = slug(name);
              const wild = name.startsWith(WILDCARD);
              const img = wild ? undefined : scryfallById.get(defId)?.image?.normal;
              const isUp = up.has(i);
              return (
                <div
                  key={i}
                  ref={(el) => {
                    els.current[i] = el;
                  }}
                  className={`pcard pcard--${rarityOf(name)} ${isUp ? 'is-up' : ''} ${chosen.includes(i) ? 'is-kept' : phase === 'leaving' ? 'is-dropped' : ''}`}
                  style={
                    {
                      '--i': i,
                      '--col': i % cols,
                      '--row': Math.floor(i / cols),
                      '--spin': `${((i * 37) % 30) - 15}deg`,
                    } as React.CSSProperties
                  }
                  role="button"
                  tabIndex={0}
                  aria-label={isUp ? name : `Flip card ${i + 1}`}
                  aria-pressed={isUp ? chosen.includes(i) : undefined}
                  onClick={() => (isUp ? choose(i) : flip(i))}
                  onKeyDown={(e) => e.key === 'Enter' && (isUp ? choose(i) : flip(i))}
                  onMouseEnter={(e) =>
                    isUp && !wild && setHover({ defId, anchor: e.currentTarget })
                  }
                  onMouseLeave={() => setHover(null)}
                >
                  <div className="pcard__inner">
                    <div className="pcard__back">
                      <div className="back" />
                    </div>
                    <div className="pcard__face">
                      {wild ? (
                        <span className={`wildcard wildcard--${rarityOf(name)}`}>
                          <span className="wildcard__gem" />
                          <span className="wildcard__label">
                            {rarityOf(name)}
                            <small>Wildcard</small>
                          </span>
                        </span>
                      ) : img ? (
                        <img src={img} alt={name} draggable={false} />
                      ) : (
                        name
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="gauntlet__actions opening__actions">
        {phase === 'open' &&
          (done ? (
            <>
              {extra}
              <button
                className={`btn btn--primary btn--big ${chosen.length === keep ? 'btn--nudge' : ''}`}
                disabled={chosen.length < keep}
                onClick={confirm}
              >
                {!keep
                  ? 'Done'
                  : chosen.length < keep
                    ? `Choose ${keep - chosen.length} more`
                    : 'Keep these'}
              </button>
            </>
          ) : (
            <button className="btn btn--ghost" onClick={revealAll}>
              Reveal all
            </button>
          ))}
      </div>
      <HoverPreview hover={hover} notes={hover ? ruleNotes(hover.defId) : []} />
    </div>
  );
}
