/*
 * Game-feel effects on one full-screen canvas: particle bursts, shock rings,
 * spell bolts and screen flashes, plus small DOM nudges (lunges, squashes,
 * screen shake). Everything is fire-and-forget; the frame loop only runs while
 * something is still alive, and nothing runs under reduced motion.
 *
 * Particle lifetimes and speeds are in 60fps frames and are scaled by the real
 * frame time, so effects play at the same speed on 120Hz screens.
 */

type RGB = readonly [number, number, number];

export interface Point {
  x: number;
  y: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  drag: number;
  grav: number;
  age: number;
  life: number;
  size: number;
  rgb: RGB;
  /** Additive glow (sparks, embers) or plain soft blobs (dust, smoke). */
  glow: boolean;
}

interface Ring {
  x: number;
  y: number;
  r0: number;
  r1: number;
  age: number;
  life: number;
  width: number;
  rgb: RGB;
}

interface Bolt {
  from: Point;
  ctrl: Point;
  to: Point;
  age: number;
  life: number;
  rgb: RGB;
  onHit: () => void;
}

interface Flash {
  rgb: RGB;
  alpha: number;
  age: number;
  life: number;
}

const parts: Particle[] = [];
const rings: Ring[] = [];
const bolts: Bolt[] = [];
const flashes: Flash[] = [];
const timers = new Set<number>();
let ctx: CanvasRenderingContext2D | null = null;
let frame = 0;
let last = 0;
let reduced = false;
let vw = 0;
let vh = 0;
/** Hit-stop: particles hold still until this time (performance.now). */
let frozenUntil = 0;

export function mountFx(canvas: HTMLCanvasElement): () => void {
  ctx = canvas.getContext('2d');
  reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const resize = () => {
    const dpr = window.devicePixelRatio || 1;
    vw = innerWidth;
    vh = innerHeight;
    canvas.width = vw * dpr;
    canvas.height = vh * dpr;
    ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();
  window.addEventListener('resize', resize);
  return () => {
    window.removeEventListener('resize', resize);
    cancelAnimationFrame(frame);
    frame = 0;
    last = 0;
    for (const t of timers) clearTimeout(t);
    timers.clear();
    parts.length = rings.length = bolts.length = flashes.length = 0;
    ctx = null;
  };
}

export const fxOn = (): boolean => !!ctx && !reduced;

/** Runs `fn` after `ms`, cancelled if the layer unmounts first. */
export function later(ms: number, fn: () => void): void {
  if (ms <= 0) return fn();
  const t = window.setTimeout(() => {
    timers.delete(t);
    fn();
  }, ms);
  timers.add(t);
}

// ---------------------------------------------------------------------------
// Colours and sprites
// ---------------------------------------------------------------------------

const rgbs = new Map<string, RGB>();
function rgb(color: string): RGB {
  let c = rgbs.get(color);
  if (!c) {
    let h = color.trim().replace('#', '');
    if (h.length === 3) h = [...h].map((x) => x + x).join('');
    const n = parseInt(h, 16) || 0;
    c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    rgbs.set(color, c);
  }
  return c;
}

// Radial gradients are slow to build per particle, so each colour is drawn once
// into a small sprite and stamped with drawImage.
const sprites = new Map<string, HTMLCanvasElement>();
function sprite(c: RGB, glow: boolean): HTMLCanvasElement {
  const key = `${glow ? 'g' : 's'}${c.join(',')}`;
  let s = sprites.get(key);
  if (!s) {
    s = document.createElement('canvas');
    s.width = s.height = 64;
    const g = s.getContext('2d')!;
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    const [r, gr, b] = c;
    if (glow) {
      grad.addColorStop(0, 'rgba(255,255,255,1)');
      grad.addColorStop(0.18, `rgba(${r},${gr},${b},1)`);
      grad.addColorStop(0.45, `rgba(${r},${gr},${b},0.3)`);
      grad.addColorStop(1, `rgba(${r},${gr},${b},0)`);
    } else {
      grad.addColorStop(0, `rgba(${r},${gr},${b},0.55)`);
      grad.addColorStop(1, `rgba(${r},${gr},${b},0)`);
    }
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    sprites.set(key, s);
  }
  return s;
}

// ---------------------------------------------------------------------------
// Frame loop
// ---------------------------------------------------------------------------

function start(): void {
  if (ctx && !frame) frame = requestAnimationFrame(tick);
}

function tick(now: number): void {
  frame = 0;
  const g = ctx;
  if (!g) return;
  const k = now < frozenUntil ? 0 : last ? Math.min((now - last) / (1000 / 60), 3) : 1;
  last = now;
  g.clearRect(0, 0, vw, vh);

  g.globalCompositeOperation = 'source-over';
  g.globalAlpha = 1;
  for (let i = flashes.length - 1; i >= 0; i--) {
    const f = flashes[i]!;
    const a = f.alpha * (1 - f.age / f.life);
    const grad = g.createRadialGradient(
      vw / 2,
      vh / 2,
      Math.min(vw, vh) * 0.3,
      vw / 2,
      vh / 2,
      Math.hypot(vw, vh) / 2,
    );
    grad.addColorStop(0, `rgba(${f.rgb.join(',')},0)`);
    grad.addColorStop(1, `rgba(${f.rgb.join(',')},${a})`);
    g.fillStyle = grad;
    g.fillRect(0, 0, vw, vh);
    if ((f.age += k) >= f.life) flashes.splice(i, 1);
  }

  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i]!;
    const d = Math.pow(p.drag, k);
    p.vx *= d;
    p.vy = p.vy * d + p.grav * k;
    p.x += p.vx * k;
    p.y += p.vy * k;
    if ((p.age += k) >= p.life) parts.splice(i, 1);
  }
  drawParts(g, false);

  g.globalCompositeOperation = 'lighter';
  for (let i = rings.length - 1; i >= 0; i--) {
    const r = rings[i]!;
    const t = r.age / r.life;
    const e = 1 - (1 - t) * (1 - t);
    g.globalAlpha = 1 - t;
    g.strokeStyle = `rgb(${r.rgb.join(',')})`;
    g.lineWidth = r.width * (1 - t) + 0.5;
    g.beginPath();
    g.arc(r.x, r.y, r.r0 + (r.r1 - r.r0) * e, 0, Math.PI * 2);
    g.stroke();
    if ((r.age += k) >= r.life) rings.splice(i, 1);
  }

  for (let i = bolts.length - 1; i >= 0; i--) {
    const b = bolts[i]!;
    const t = Math.min(1, b.age / b.life);
    const e = t * t; // accelerates into the target
    const u = 1 - e;
    const x = u * u * b.from.x + 2 * u * e * b.ctrl.x + e * e * b.to.x;
    const y = u * u * b.from.y + 2 * u * e * b.ctrl.y + e * e * b.to.y;
    for (let n = 0; n < 3; n++) {
      spawn(x, y, b.rgb, {
        angle: Math.random() * Math.PI * 2,
        speed: rand(0.2, 1.2),
        life: rand(12, 22),
        size: rand(5, 9),
      });
    }
    g.globalAlpha = 1;
    g.drawImage(sprite(b.rgb, true), x - 16, y - 16, 32, 32);
    if ((b.age += k) >= b.life) {
      bolts.splice(i, 1);
      b.onHit();
    }
  }
  drawParts(g, true);

  if (parts.length || rings.length || bolts.length || flashes.length) start();
  else last = 0;
}

function drawParts(g: CanvasRenderingContext2D, glow: boolean): void {
  for (const p of parts) {
    if (p.glow !== glow) continue;
    const t = p.age / p.life;
    const s = p.size * (glow ? 1 - t * 0.5 : 1 + t * 1.5);
    g.globalAlpha = Math.max(0, Math.min(1, (1 - t) * 1.6));
    g.drawImage(sprite(p.rgb, glow), p.x - s, p.y - s, s * 2, s * 2);
  }
}

// ---------------------------------------------------------------------------
// Emitters
// ---------------------------------------------------------------------------

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = ([a, b]: readonly [number, number]) => rand(a, b);

interface SpawnOpts {
  angle: number;
  speed: number;
  life: number;
  size: number;
  grav?: number;
  drag?: number;
  glow?: boolean;
}

function spawn(x: number, y: number, c: RGB, o: SpawnOpts): void {
  parts.push({
    x,
    y,
    vx: Math.cos(o.angle) * o.speed,
    vy: Math.sin(o.angle) * o.speed,
    drag: o.drag ?? 0.92,
    grav: o.grav ?? 0,
    age: 0,
    life: o.life,
    size: o.size,
    rgb: c,
    glow: o.glow ?? true,
  });
}

export interface BurstOpts {
  n?: number;
  speed?: [number, number];
  life?: [number, number];
  size?: [number, number];
  grav?: number;
  drag?: number;
  /** Direction of travel and how wide a cone around it (radians); default all round. */
  angle?: number;
  spread?: number;
  glow?: boolean;
  /**
   * Spawn over a w×h box instead of a point: on its edge moving outward
   * (`edge`), or anywhere inside it with random headings (`fill`).
   */
  box?: { w: number; h: number; mode: 'edge' | 'fill' };
}

export function burst(x: number, y: number, color: string, o: BurstOpts = {}): void {
  if (!fxOn()) return;
  const c = rgb(color);
  const spread = o.spread ?? Math.PI * 2;
  for (let i = 0; i < (o.n ?? 16); i++) {
    let px = x;
    let py = y;
    let angle = (o.angle ?? 0) + (Math.random() - 0.5) * spread;
    if (o.box) {
      const { w, h, mode } = o.box;
      if (mode === 'fill') {
        px += rand(-w / 2, w / 2);
        py += rand(-h / 2, h / 2);
      } else {
        // A random point on the perimeter, heading away from the centre.
        const along = Math.random() * 2 * (w + h);
        const onTop = along < w || (along >= w + h && along < 2 * w + h);
        if (onTop) {
          px += (along < w ? along : along - w - h) - w / 2;
          py += along < w ? -h / 2 : h / 2;
        } else {
          px += along < w + h ? w / 2 : -w / 2;
          py += (along < w + h ? along - w : along - 2 * w - h) - h / 2;
        }
        angle = Math.atan2(py - y, px - x) + (Math.random() - 0.5) * 0.6;
      }
    }
    spawn(px, py, c, {
      angle,
      speed: pick(o.speed ?? [1.5, 4.5]),
      life: pick(o.life ?? [24, 42]),
      size: pick(o.size ?? [4, 8]),
      grav: o.grav,
      drag: o.drag,
      glow: o.glow,
    });
  }
  start();
}

export function ring(
  x: number,
  y: number,
  color: string,
  o: { r0?: number; r1?: number; life?: number; width?: number } = {},
): void {
  if (!fxOn()) return;
  rings.push({
    x,
    y,
    r0: o.r0 ?? 6,
    r1: o.r1 ?? 32,
    age: 0,
    life: o.life ?? 22,
    width: o.width ?? 2,
    rgb: rgb(color),
  });
  start();
}

/** A glowing projectile arcing from one point to another; `onHit` fires on arrival. */
export function bolt(from: Point, to: Point, color: string, onHit: () => void, ms = 320): void {
  if (!fxOn()) return onHit();
  const dist = Math.hypot(to.x - from.x, to.y - from.y);
  const ctrl = {
    x: (from.x + to.x) / 2 + rand(-0.25, 0.25) * dist,
    y: (from.y + to.y) / 2 - Math.min(120, dist * 0.3),
  };
  bolts.push({ from, ctrl, to, age: 0, life: (ms / 1000) * 60, rgb: rgb(color), onHit });
  start();
}

/** Tints the screen edges, e.g. red when you take damage. */
export function flash(color: string, alpha: number, ms = 450): void {
  if (!fxOn()) return;
  flashes.push({ rgb: rgb(color), alpha, age: 0, life: (ms / 1000) * 60 });
  start();
}

// ---------------------------------------------------------------------------
// DOM nudges. These move a card's inner body (never the [data-oid] element
// that useFlip measures) and use `translate`/`scale`, which the cards' CSS
// `transform` leaves free.
// ---------------------------------------------------------------------------

const bodyOf = (el: Element) => el.querySelector('.card__body') ?? el;

/** Wind back, strike towards `dir` (a unit vector) by `dist` px, and return. */
export function lunge(el: Element, dir: Point, dist: number, ms = 420): void {
  if (!fxOn()) return;
  const at = (f: number) => `${dir.x * dist * f}px ${dir.y * dist * f}px`;
  bodyOf(el).animate(
    [
      { translate: '0px 0px', scale: '1' },
      { translate: at(-0.18), scale: '1.03', offset: 0.3 },
      { translate: at(1), scale: '1.08', offset: 0.55 },
      { translate: '0px 0px', scale: '1' },
    ],
    { duration: ms, easing: 'cubic-bezier(0.3, 0, 0.3, 1)', composite: 'add' },
  );
}

/** A quick landing squash, like a card slapped onto the table. */
export function squash(el: Element): void {
  if (!fxOn()) return;
  bodyOf(el).animate(
    [
      { scale: '1' },
      { scale: '0.93', offset: 0.25 },
      { scale: '1.03', offset: 0.6 },
      { scale: '1' },
    ],
    {
      duration: 300,
      easing: 'ease-out',
    },
  );
}

/** Shakes the board and playmats by up to `px`, dying away over ~1/3 s. */
export function shake(px: number): void {
  if (!fxOn() || px <= 0) return;
  const frames: Keyframe[] = [];
  for (let i = 0; i < 7; i++) {
    const f = (1 - i / 7) * px;
    frames.push({ translate: `${rand(-1, 1) * f}px ${rand(-1, 1) * f}px` });
  }
  frames.push({ translate: '0px 0px' });
  for (const el of document.querySelectorAll('.board, .mat')) {
    el.animate(frames, { duration: 340, easing: 'linear', composite: 'add' });
  }
}

/**
 * Hit-stop: everything on the table holds for a beat so a big hit lands with
 * weight (fighting games, Hades). Running card animations and particles pause
 * for `ms`, the target flashes white, and `then` fires as time restarts.
 */
export function hitStop(ms: number, target: Element | null, then: () => void): void {
  if (!fxOn()) return then();
  const table = document.querySelector('.table');
  const held = document
    .getAnimations()
    .filter(
      (a) =>
        a.playState === 'running' &&
        a.effect instanceof KeyframeEffect &&
        a.effect.target instanceof Element &&
        !!table?.contains(a.effect.target),
    );
  for (const a of held) a.pause();
  frozenUntil = performance.now() + ms;
  start();
  target?.animate([{ filter: 'brightness(2.4) saturate(0.4)' }, { filter: 'none' }], {
    duration: ms + 140,
    easing: 'ease-in',
  });
  later(ms, () => {
    for (const a of held) if (a.playState === 'paused') a.play();
    then();
  });
}
