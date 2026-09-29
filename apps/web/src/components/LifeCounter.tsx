import { useEffect, useRef, useState } from 'react';

/*
 * The life total ticks to its new value instead of jumping (Arena,
 * Hearthstone): red and shaken for a loss, green for a gain, with the old
 * number drifting off and a flash across the portrait.
 */

const TICK_MS = 520;
const HOLD_MS = 900;

interface Change {
  from: number;
  delta: number;
  key: number;
}

export function LifeCounter({ life }: { life: number }) {
  const [shown, setShown] = useState(life);
  const [change, setChange] = useState<Change | null>(null);
  const prev = useRef(life);
  const shownRef = useRef(life);
  const seq = useRef(0);

  useEffect(() => {
    const from = prev.current;
    prev.current = life;
    if (from === life) return;
    setChange({ from, delta: life - from, key: ++seq.current });
    const hold = setTimeout(() => setChange(null), HOLD_MS);

    const set = (v: number) => {
      shownRef.current = v;
      setShown(v);
    };
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      set(life);
      return () => clearTimeout(hold);
    }
    // Start from what's on screen, so a second hit mid-tick carries on smoothly.
    const start = shownRef.current;
    const t0 = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / TICK_MS);
      set(Math.round(start + (life - start) * (1 - Math.pow(1 - t, 3))));
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(hold);
    };
  }, [life]);

  const kind = change ? (change.delta < 0 ? 'hurt' : 'heal') : null;
  return (
    <>
      {change && (
        <div key={`flash${change.key}`} className={`badge__flash badge__flash--${kind}`} />
      )}
      <div key={seq.current} className={`badge__life ${kind ? `badge__life--${kind}` : ''}`}>
        {shown}
        {change && <span className="badge__ghost">{change.from}</span>}
      </div>
    </>
  );
}
