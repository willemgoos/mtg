import type { ObjectId } from '@mtg/engine';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { flyFrom } from './useFlip.ts';

/** Pointer travel before a press on a hand card becomes a drag (below it, it's a click). */
const THRESHOLD = 8;

interface Pending {
  id: ObjectId;
  x0: number;
  y0: number;
  /** Grab offset inside the card, so it doesn't jump to the pointer. */
  dx: number;
  dy: number;
  active: boolean;
}

/** Is the point over the battlefield (above the hand, not on the action button or a drawer)? */
export function overBoard(x: number, y: number): boolean {
  const me = document.querySelector('.side--me')?.getBoundingClientRect();
  if (!me || y >= me.top + me.height * 0.2) return false;
  const hit = document.elementFromPoint(x, y);
  return !hit?.closest('.action, .drawer, .corner');
}

/**
 * Drag a hand card onto the board. The ghost follows the pointer through
 * direct DOM updates (no re-render per move); React state only changes when a
 * drag starts or ends. Works with mouse, pen and touch.
 */
export function useHandDrag(opts: {
  canDrag: (id: ObjectId) => boolean;
  onDrop: (id: ObjectId, x: number, y: number) => void;
}) {
  const latest = useRef(opts);
  latest.current = opts;
  const pending = useRef<Pending | null>(null);
  const pos = useRef({ x: 0, y: 0 });
  /** Swing: the card leans against the way it's pulled, then settles (see swing()). */
  const lean = useRef({ now: 0, target: 0, lastX: 0, frame: 0 });
  const ghostRef = useRef<HTMLDivElement>(null);
  const justDropped = useRef(false);
  const [dragging, setDragging] = useState<ObjectId | null>(null);

  const place = () => {
    const g = ghostRef.current;
    if (g)
      g.style.transform = `translate(${pos.current.x}px, ${pos.current.y}px) rotate(${-3 + lean.current.now}deg) scale(1.06)`;
  };

  // Eases the lean toward its target every frame, and lets the target relax
  // back to upright, so the card swings like it has weight.
  const swing = () => {
    const l = lean.current;
    l.now += (l.target - l.now) * 0.2;
    l.target *= 0.86;
    place();
    l.frame = Math.abs(l.now) + Math.abs(l.target) > 0.05 ? requestAnimationFrame(swing) : 0;
  };

  const onHandPointerDown = useCallback((id: ObjectId, e: React.PointerEvent) => {
    if (e.button !== 0 || !latest.current.canDrag(id)) return;
    const r = e.currentTarget.getBoundingClientRect();
    pending.current = {
      id,
      x0: e.clientX,
      y0: e.clientY,
      dx: e.clientX - r.left,
      dy: e.clientY - r.top,
      active: false,
    };
  }, []);

  useEffect(() => {
    const board = () => document.querySelector('.board');
    const move = (e: PointerEvent) => {
      const p = pending.current;
      if (!p) return;
      if (!p.active) {
        if (Math.hypot(e.clientX - p.x0, e.clientY - p.y0) < THRESHOLD) return;
        p.active = true;
        lean.current = { now: 0, target: 0, lastX: e.clientX, frame: lean.current.frame };
        setDragging(p.id);
      }
      pos.current = { x: e.clientX - p.dx, y: e.clientY - p.dy };
      const l = lean.current;
      l.target = Math.max(-16, Math.min(16, l.target + (e.clientX - l.lastX) * 0.35));
      l.lastX = e.clientX;
      if (!l.frame) l.frame = requestAnimationFrame(swing);
      place();
      const over = overBoard(e.clientX, e.clientY);
      board()?.classList.toggle('is-drop', over);
      ghostRef.current?.classList.toggle('is-over', over);
    };
    const end = (e: PointerEvent) => {
      const p = pending.current;
      pending.current = null;
      if (!p?.active) return;
      board()?.classList.remove('is-drop');
      cancelAnimationFrame(lean.current.frame);
      lean.current.frame = 0;
      setDragging(null);
      // The click that may follow this pointerup belongs to the drag, not a card click.
      justDropped.current = true;
      setTimeout(() => (justDropped.current = false));
      if (e.type === 'pointerup' && overBoard(e.clientX, e.clientY)) {
        // The card flies to the table from where it was let go, not from the hand.
        flyFrom(p.id, ghostRef.current);
        latest.current.onDrop(p.id, e.clientX, e.clientY);
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
    };
  }, []);

  // Position the ghost before its first paint.
  useLayoutEffect(() => {
    if (dragging) place();
  }, [dragging]);

  return { dragging, ghostRef, onHandPointerDown, wasDrag: () => justDropped.current };
}
