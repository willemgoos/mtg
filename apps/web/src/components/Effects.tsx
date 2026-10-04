import type { GameState, PlayerId, TargetChoice } from '@mtg/engine';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { EventBatch } from '../game/useGame.ts';
import { Card } from './Card.tsx';

function elFor(t: TargetChoice | string): Element | null {
  if (typeof t === 'string') return document.querySelector(t);
  return 'player' in t
    ? document.querySelector(`[data-player="${t.player}"]`)
    : document.querySelector(`[data-oid="${t.object.id}"]`);
}

function center(el: Element) {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

// ---------------------------------------------------------------------------
// Arrows: blocks, stack targets, and targets being chosen
// ---------------------------------------------------------------------------

export interface ArrowSpec {
  from: string; // CSS selector
  to: TargetChoice | string;
  kind: 'block' | 'target' | 'aim';
}

export function Arrows({ specs, deps }: { specs: ArrowSpec[]; deps: unknown[] }) {
  const [paths, setPaths] = useState<{ d: string; kind: string; key: string }[]>([]);
  const specsRef = useRef(specs);
  specsRef.current = specs;

  useLayoutEffect(() => {
    let frame = 0;
    const started = performance.now();
    const measure = () => {
      const out: { d: string; kind: string; key: string }[] = [];
      specsRef.current.forEach((s, i) => {
        const a = document.querySelector(s.from);
        const b = elFor(s.to);
        if (!a || !b) return;
        const p = center(a);
        const q = center(b);
        const mx = (p.x + q.x) / 2;
        const my = (p.y + q.y) / 2 - Math.min(90, Math.hypot(q.x - p.x, q.y - p.y) * 0.25);
        out.push({ d: `M${p.x},${p.y} Q${mx},${my} ${q.x},${q.y}`, kind: s.kind, key: `${i}` });
      });
      setPaths(out);
      // Keep following cards while their CSS transitions settle.
      if (performance.now() - started < 600) frame = requestAnimationFrame(measure);
    };
    measure();
    const onResize = () => measure();
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', onResize);
    };
  }, deps);

  return (
    <svg className="arrows" aria-hidden>
      <defs>
        {['block', 'target', 'aim'].map((k) => (
          <marker
            key={k}
            id={`head-${k}`}
            viewBox="0 0 10 10"
            refX="7"
            refY="5"
            markerWidth="5"
            markerHeight="5"
            orient="auto"
          >
            <path d="M0,0 L10,5 L0,10 z" className={`arrowhead arrowhead--${k}`} />
          </marker>
        ))}
      </defs>
      {paths.map((p) => (
        <path
          key={p.key}
          d={p.d}
          className={`arrow arrow--${p.kind}`}
          markerEnd={`url(#head-${p.kind})`}
        />
      ))}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Floating numbers and hit shakes, driven by engine events
// ---------------------------------------------------------------------------

interface Floater {
  id: number;
  x: number;
  y: number;
  text: string;
  kind: 'dmg' | 'heal';
}

export function Floaters({ batch }: { batch: EventBatch }) {
  const [items, setItems] = useState<Floater[]>([]);
  const next = useRef(0);

  useEffect(() => {
    const add: Floater[] = [];
    for (const e of batch.events) {
      if (e.type === 'damageDealt') {
        const el = elFor(e.to);
        if (!el) continue;
        const c = center(el);
        add.push({ id: next.current++, x: c.x, y: c.y, text: `−${e.amount}`, kind: 'dmg' });
        el.animate(
          [
            { transform: 'translateX(0)' },
            { transform: 'translateX(-6px) rotate(-1deg)' },
            { transform: 'translateX(5px) rotate(1deg)' },
            { transform: 'translateX(0)' },
          ],
          { duration: 260, easing: 'ease-out' },
        );
      } else if (e.type === 'lifeChanged' && e.delta > 0) {
        const el = elFor({ player: e.player });
        if (!el) continue;
        const c = center(el);
        add.push({ id: next.current++, x: c.x, y: c.y, text: `+${e.delta}`, kind: 'heal' });
      }
    }
    if (!add.length) return;
    setItems((xs) => [...xs, ...add]);
    const ids = new Set(add.map((f) => f.id));
    const t = setTimeout(() => setItems((xs) => xs.filter((f) => !ids.has(f.id))), 1300);
    return () => clearTimeout(t);
  }, [batch]);

  return (
    <div className="floaters" aria-hidden>
      {items.map((f) => (
        <span key={f.id} className={`floater floater--${f.kind}`} style={{ left: f.x, top: f.y }}>
          {f.text}
        </span>
      ))}
    </div>
  );
}

export function TurnBanner({ batch, me }: { batch: EventBatch; me: PlayerId }) {
  const [banner, setBanner] = useState<{ key: number; mine: boolean } | null>(null);
  useEffect(() => {
    const e = batch.events.find((x) => x.type === 'stepChanged' && x.step === 'upkeep');
    if (!e || e.type !== 'stepChanged') return;
    setBanner({ key: batch.seq, mine: e.activePlayer === me });
    const t = setTimeout(() => setBanner(null), 1400);
    return () => clearTimeout(t);
  }, [batch, me]);
  if (!banner) return null;
  return (
    <div
      key={banner.key}
      className={`turn-banner ${banner.mine ? 'turn-banner--me' : 'turn-banner--opp'}`}
    >
      <span>{banner.mine ? 'Your turn' : "Opponent's turn"}</span>
    </div>
  );
}

/**
 * Reality Fracture (17a fixes): a card revealed to the table (Loyal Tutor's "reveal it"). As on Arena, it is shown
 * large in the middle of the board for a moment, named by who revealed it; a click puts it away.
 */
export function RevealBanner({ batch, me }: { batch: EventBatch; me: PlayerId }) {
  const [shown, setShown] = useState<{
    key: number;
    mine: boolean;
    defIds: string[];
  } | null>(null);
  useEffect(() => {
    const defIds: string[] = [];
    let mine = true;
    for (const e of batch.events)
      if (e.type === 'cardsRevealed') {
        mine = e.player === me;
        defIds.push(...e.cards.map((c) => c.defId));
      }
    if (!defIds.length) return;
    setShown({ key: batch.seq, mine, defIds });
    const t = setTimeout(() => setShown(null), 3200);
    return () => clearTimeout(t);
  }, [batch, me]);
  if (!shown) return null;
  return (
    <div key={shown.key} className="reveal" onClick={() => setShown(null)}>
      <div className="reveal__title">{shown.mine ? 'You reveal' : 'Opponent reveals'}</div>
      <div className="reveal__cards">
        {shown.defIds.map((defId, i) => (
          <Card key={i} defId={defId} size="mull" />
        ))}
      </div>
    </div>
  );
}

export function winnerText(s: GameState, me: PlayerId): string {
  if (s.winner === 'draw') return 'Draw';
  return s.winner === me ? 'Victory' : 'Defeat';
}
