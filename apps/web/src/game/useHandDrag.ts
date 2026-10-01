import type { ObjectId } from '@mtg/engine';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { flyFrom } from './useFlip.ts';
import { handIndexAt, moveHandCard } from './handOrder.ts';

/** Pointer travel before a press on a hand card becomes a drag (below it, it's a click). */
const THRESHOLD = 8;
const PLAY_LIFT = 24;

interface Pending {
  id: ObjectId;
  x0: number;
  y0: number;
  /** Grab offset inside the card, so it doesn't jump to the pointer. */
  dx: number;
  dy: number;
  active: boolean;
  pointerId: number;
  order: ObjectId[];
  centres: number[];
  index: number;
}

function overHand(x: number, y: number, startY: number): boolean {
  const hand = document.querySelector('.hand')?.getBoundingClientRect();
  const me = document.querySelector('.side--me')?.getBoundingClientRect();
  if (!hand || !me || x < hand.left || x > hand.right) return false;
  // A raised card can begin above the hand band. Sideways travel at its grab
  // height still belongs to the hand; playing requires a deliberate upward pull.
  if (y < me.top + me.height * 0.2 && Math.abs(y - startY) >= PLAY_LIFT) return false;
  return !document.elementFromPoint(x, y)?.closest('.action, .drawer, .corner');
}

/** Is the point over the battlefield (above the hand, not on the action button or a drawer)? */
export function overBoard(x: number, y: number): boolean {
  const me = document.querySelector('.side--me')?.getBoundingClientRect();
  if (!me || y >= me.top + me.height * 0.2) return false;
  const hit = document.elementFromPoint(x, y);
  return !hit?.closest('.action, .drawer, .corner');
}

/**
 * Drag sideways to arrange the hand, or onto the board to play a legal card.
 * The ghost follows through direct DOM updates; the hand only re-renders when
 * the insertion point changes. Works with mouse, pen and touch.
 */
export function useHandDrag(opts: {
  hand: ObjectId[];
  canReorder: (id: ObjectId) => boolean;
  onReorder: (order: ObjectId[]) => void;
  canPlay: (id: ObjectId) => boolean;
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
  const [overBattlefield, setOverBattlefield] = useState(false);

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
    if (e.button !== 0 || pending.current) return;
    const reorder = latest.current.hand.includes(id) && latest.current.canReorder(id);
    if (!reorder && !latest.current.canPlay(id)) return;
    const r = e.currentTarget.getBoundingClientRect();
    const hand = e.currentTarget.closest('.hand');
    const left = hand?.getBoundingClientRect().left ?? 0;
    // Ignore hover shifts and rotation: the transform's translation gives each
    // fan slot's fixed centre, even while its neighbours are easing aside.
    const centres = reorder
      ? Array.from(hand?.querySelectorAll<HTMLElement>('.hand__slot') ?? []).map((slot) => {
          // Also retire unfinished arrivals before React starts moving slots.
          // An inline override survives DOM moves and subsequent re-drags.
          slot.style.animation = 'none';
          const transform = new DOMMatrixReadOnly(getComputedStyle(slot).transform);
          return left + slot.offsetLeft + slot.offsetWidth / 2 + transform.m41;
        })
      : [];
    pending.current = {
      id,
      x0: e.clientX,
      y0: e.clientY,
      dx: e.clientX - r.left,
      dy: e.clientY - r.top,
      active: false,
      pointerId: e.pointerId,
      order: [...latest.current.hand],
      centres,
      index: latest.current.hand.indexOf(id),
    };
  }, []);

  useEffect(() => {
    const board = () => document.querySelector('.board');
    const canDrop = (p: Pending, x: number, y: number) =>
      latest.current.canPlay(p.id) &&
      (!p.centres.length || y < p.y0 - PLAY_LIFT) &&
      overBoard(x, y);
    const reorder = (p: Pending, x: number, y: number) => {
      if (!p.centres.length || !latest.current.canReorder(p.id) || !overHand(x, y, p.y0)) return;
      // Keep the grab offset: grabbing an exposed edge must not jump a card
      // into its neighbour's slot before the user moves sideways.
      const start = p.centres[p.order.indexOf(p.id)]!;
      const index = handIndexAt(p.centres, start + x - p.x0);
      if (index === p.index) return;
      p.index = index;
      latest.current.onReorder(moveHandCard(p.order, p.id, index));
    };
    const move = (e: PointerEvent) => {
      const p = pending.current;
      if (!p || p.pointerId !== e.pointerId) return;
      if (
        (p.centres.length && !latest.current.hand.includes(p.id)) ||
        (!latest.current.canReorder(p.id) && !latest.current.canPlay(p.id))
      ) {
        end(e);
        return;
      }
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
      reorder(p, e.clientX, e.clientY);
      const over = canDrop(p, e.clientX, e.clientY);
      setOverBattlefield(over);
      board()?.classList.toggle('is-drop', over);
      ghostRef.current?.classList.toggle('is-over', over);
    };
    const end = (e: PointerEvent) => {
      const p = pending.current;
      if (!p || p.pointerId !== e.pointerId) return;
      pending.current = null;
      if (!p.active) return;
      board()?.classList.remove('is-drop');
      cancelAnimationFrame(lean.current.frame);
      lean.current.frame = 0;
      setDragging(null);
      setOverBattlefield(false);
      // The click that may follow this pointerup belongs to the drag, not a card click.
      justDropped.current = true;
      setTimeout(() => (justDropped.current = false));
      if (e.type === 'pointerup' && canDrop(p, e.clientX, e.clientY)) {
        // The card flies to the table from where it was let go, not from the hand.
        flyFrom(p.id, ghostRef.current);
        latest.current.onDrop(p.id, e.clientX, e.clientY);
      } else if (e.type === 'pointerup' && overHand(e.clientX, e.clientY, p.y0)) {
        reorder(p, e.clientX, e.clientY);
      } else if (p.centres.length) {
        latest.current.onReorder(p.order);
      }
    };
    const cancel = () => {
      const p = pending.current;
      if (p) end(new PointerEvent('pointercancel', { pointerId: p.pointerId }));
    };
    const keydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancel();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    window.addEventListener('blur', cancel);
    window.addEventListener('keydown', keydown);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      window.removeEventListener('blur', cancel);
      window.removeEventListener('keydown', keydown);
      cancelAnimationFrame(lean.current.frame);
      board()?.classList.remove('is-drop');
    };
  }, []);

  // Position the ghost before its first paint.
  useLayoutEffect(() => {
    if (dragging) place();
  }, [dragging]);

  return {
    dragging,
    overBattlefield,
    ghostRef,
    onHandPointerDown,
    wasDrag: () => justDropped.current,
  };
}
