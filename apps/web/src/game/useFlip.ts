import type { GameState, PlayerId } from '@mtg/engine';
import { useLayoutEffect, useRef } from 'react';

/*
 * Cards glide to where they end up instead of snapping (FLIP: remember where
 * each card was last render, then animate from there to its new spot).
 * Object ids survive zone changes, so one card can be followed from the hand
 * to the stack to the battlefield. Uses the individual `translate`/`scale`
 * properties so a tapped card's rotation is left alone.
 *
 * The board re-renders often mid-animation (bot thinking, log lines), so
 * positions are always measured without our own animation's offset: otherwise
 * every re-render would see the card "move" and restart the animation.
 */

type Zone = 'hand' | 'stack' | 'field';
interface Spot {
  /** Where it is on screen (centre), excluding our animation's offset. */
  x: number;
  y: number;
  /** Where layout puts it, ignoring every transform: only changes when the layout does. */
  lx: number;
  ly: number;
  w: number;
  zone: Zone;
}

const FLIGHT_MS = 480;
const SHIFT_MS = 280;
const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
const FLIP = 'flip';

/** Where a card's next flight starts when it isn't its last spot (the drag ghost it was dropped from). */
const origins = new Map<string, { spot: Spot; at: number }>();

export function flyFrom(id: string, el: Element | null): void {
  if (el) origins.set(id, { spot: spotOf(el, 'hand'), at: performance.now() });
}

/** Our animation's current offset on the element, e.g. "12px -4px" -> [12, -4]. */
function ownOffset(el: Element): [number, number] {
  if (!(el instanceof HTMLElement) || !el.getAnimations().some((a) => a.id === FLIP)) return [0, 0];
  const t = getComputedStyle(el).translate;
  if (!t || t === 'none') return [0, 0];
  const [x = '0', y = '0'] = t.split(' ');
  return [parseFloat(x) || 0, parseFloat(y) || 0];
}

function spotOf(el: Element, zone: Zone): Spot {
  const r = el.getBoundingClientRect();
  const [ox, oy] = ownOffset(el);
  let lx = 0;
  let ly = 0;
  let w = r.width;
  if (el instanceof HTMLElement) {
    // offsetWidth ignores transforms, so a tapped (rotated) card keeps its real width.
    w = el.offsetWidth || r.width;
    for (let n: HTMLElement | null = el; n; n = n.offsetParent as HTMLElement | null) {
      lx += n.offsetLeft;
      ly += n.offsetTop;
    }
  }
  return { x: r.left + r.width / 2 - ox, y: r.top + r.height / 2 - oy, lx, ly, w, zone };
}

function zoneOf(el: Element): Zone | null {
  if (el.closest('.hand, .hand-extra')) return 'hand';
  if (el.closest('.stack')) return 'stack';
  if (el.closest('.battlefield')) return 'field';
  return null;
}

/** Stops our running animation on `el`, returning where it had got to so the next one starts there. */
function takeOver(el: HTMLElement): [number, number] {
  const at = ownOffset(el);
  for (const a of el.getAnimations()) if (a.id === FLIP) a.cancel();
  return at;
}

function fly(el: HTMLElement, from: Spot, to: Spot): void {
  const [ox, oy] = takeOver(el);
  const dx = from.x - to.x + ox;
  const dy = from.y - to.y + oy;
  el.style.animation = 'none'; // the flight replaces the fade-in
  const a = el.animate(
    [
      {
        translate: `${dx}px ${dy}px`,
        scale: String(from.w / to.w),
        zIndex: 60,
        filter: 'drop-shadow(0 1.5rem 1.25rem rgba(0, 0, 0, 0.55))',
      },
      {
        translate: '0px 0px',
        scale: '1.07',
        offset: 0.75,
        zIndex: 60,
        filter: 'drop-shadow(0 0.5rem 0.5rem rgba(0, 0, 0, 0.5))',
      },
      { translate: '0px 0px', scale: '1', zIndex: 60, filter: 'none' },
    ],
    { duration: FLIGHT_MS, easing: EASE },
  );
  a.id = FLIP;
  if (to.zone === 'field') setTimeout(() => ring(el), FLIGHT_MS * 0.75);
}

/**
 * Turns a card face up on its way in: it leaves the opponent's hand showing
 * its back and flips over mid-flight (as in Arena). The back is a temporary
 * overlay, hidden at the halfway point where the card is edge-on.
 */
function flipIn(el: HTMLElement): void {
  const body = el.querySelector<HTMLElement>('.card__body');
  if (!body) return;
  const back = document.createElement('div');
  back.className = 'back flip-back';
  body.appendChild(back);
  body.animate([{ rotate: 'y 180deg' }, { rotate: 'y 0deg' }], {
    duration: FLIGHT_MS,
    easing: 'cubic-bezier(0.45, 0, 0.25, 1)',
  });
  back
    .animate(
      [{ opacity: 1 }, { opacity: 1, offset: 0.5 }, { opacity: 0, offset: 0.5 }, { opacity: 0 }],
      {
        duration: FLIGHT_MS,
        easing: 'cubic-bezier(0.45, 0, 0.25, 1)',
      },
    )
    .finished.then(
      () => back.remove(),
      () => back.remove(),
    );
}

/** A brass ring spreading out where a card lands. */
function ring(el: HTMLElement): void {
  if (!el.isConnected) return;
  const r = el.getBoundingClientRect();
  const d = document.createElement('div');
  d.className = 'land-ring';
  Object.assign(d.style, {
    left: `${r.left + r.width / 2}px`,
    top: `${r.top + r.height / 2}px`,
    width: `${r.width * 1.3}px`,
    height: `${r.height * 1.1}px`,
  });
  d.addEventListener('animationend', () => d.remove());
  document.body.appendChild(d);
}

/** Slides a card that layout moved (others making room) from where it was shown. */
function shift(el: HTMLElement, from: Spot, to: Spot): void {
  const [ox, oy] = takeOver(el);
  const a = el.animate(
    [
      { translate: `${from.lx - to.lx + ox}px ${from.ly - to.ly + oy}px` },
      { translate: '0px 0px' },
    ],
    { duration: SHIFT_MS, easing: EASE },
  );
  a.id = FLIP;
}

/** Opponent cards come out of the fanned backs at the top. */
function opponentHandSpot(like: Spot): Spot {
  const el =
    document.querySelector('.opp-hand__slot:last-child') ?? document.querySelector('.opp-hand');
  if (!el) return { ...like, y: 0 };
  const s = spotOf(el, 'hand');
  return s.w ? s : { ...s, w: like.w * 0.6 };
}

export function useFlip(view: GameState, opponent: PlayerId): void {
  const spots = useRef(new Map<string, Spot>());
  const oppHand = useRef(new Set<string>());

  useLayoutEffect(() => {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const next = new Map<string, Spot>();
    const now = performance.now();
    for (const el of document.querySelectorAll<HTMLElement>(
      '.board [data-oid], .stack [data-stack]',
    )) {
      const id = el.dataset.oid ?? el.dataset.stack;
      const zone = zoneOf(el);
      if (!id || !zone) continue;
      const to = spotOf(el, zone);
      next.set(id, to);
      if (reduced) continue;

      const was = spots.current.get(id);
      const origin = origins.get(id);
      if (was && was.zone !== zone) {
        const dropped = origin && now - origin.at < 3000 ? origin.spot : null;
        fly(el, dropped ?? was, to);
        origins.delete(id);
      } else if (!was && zone !== 'hand' && oppHand.current.has(id)) {
        fly(el, opponentHandSpot(to), to);
        flipIn(el);
      } else if (was && zone === 'field' && Math.hypot(was.lx - to.lx, was.ly - to.ly) > 3) {
        shift(el, was, to);
      }
    }
    spots.current = next;
    oppHand.current = new Set(view.players[opponent].hand);
  });
}
