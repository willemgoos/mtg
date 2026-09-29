import type { GameState, ObjectId, PlayerId, TargetChoice } from '@mtg/engine';
import { useEffect, useMemo, useRef } from 'react';
import {
  bolt,
  burst,
  flash,
  hitStop,
  fxOn,
  later,
  lunge,
  mountFx,
  type Point,
  ring,
  shake,
  squash,
} from '../game/fx.ts';
import { type Cue, type Hue, juiceFor } from '../game/juice.ts';
import type { EventBatch } from '../game/useGame.ts';

/*
 * The juice layer: one canvas over the whole table for particles, plus the
 * little DOM nudges that go with them. Borrowed feel:
 *  - Arena: click embers, cards slapping down with a dust ring, attackers
 *    lunging at their target, spells bursting off the stack.
 *  - Hearthstone: heavier creatures land harder (screen shake from 5 mana up),
 *    damage spells fly as bolts before they hit.
 *  - Slay the Spire / Balatro: a red vignette and shake scaled by the damage
 *    you take, so a big hit reads instantly.
 */

const FLIGHT_MS = 470; // just before useFlip's 480ms card flight lands
const BOLT_MS = 320;
const ATTACK_RED = '#ff7a3d';
const CLASH = '#d6ecff';
const DUST = '#b9a988';
const EMBER = '#ff9a4a';
const SMOKE = '#2e2a26';
const HEAL = '#8fe36a';
const GOLD = '#ffd36e';

export function FxLayer({ batch, view, me }: { batch: EventBatch; view: GameState; me: PlayerId }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => (ref.current ? mountFx(ref.current) : undefined), []);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 || !(e.target as Element).closest?.('.table')) return;
      ring(e.clientX, e.clientY, GOLD, { r0: 6, r1: 32, life: 22, width: 2 });
      burst(e.clientX, e.clientY, '#ffc861', {
        n: 14,
        speed: [1.5, 4.5],
        life: [24, 42],
        size: [3, 6],
        grav: -0.03,
        drag: 0.9,
      });
    };
    window.addEventListener('pointerdown', onDown, true);
    return () => window.removeEventListener('pointerdown', onDown, true);
  }, []);

  // Worked out while rendering, before this batch reaches the DOM: dying cards
  // and resolved spells are only still on screen now, so remember where.
  const plan = useMemo(() => {
    const cues = juiceFor(batch.events, view, me);
    return { cues, before: fxOn() ? measureLeaving(cues) : new Map<ObjectId, DOMRect>() };
    // Keyed on the batch alone: `view` changes with it, and replaying on other re-renders would double up.
  }, [batch]);

  useEffect(() => play(plan.cues, plan.before, me), [plan, me]);

  return <canvas ref={ref} className="fx-layer" aria-hidden />;
}

// ---------------------------------------------------------------------------

const cardEl = (id: ObjectId) => document.querySelector(`[data-oid="${id}"]`);
const stackEl = (id: ObjectId) => document.querySelector(`[data-stack="${id}"]`);
const playerEl = (p: PlayerId) => document.querySelector(`[data-player="${p}"]`);
const targetEl = (t: TargetChoice) => ('player' in t ? playerEl(t.player) : cardEl(t.object.id));
const mid = (r: DOMRect): Point => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });

function measureLeaving(cues: Cue[]): Map<ObjectId, DOMRect> {
  const at = new Map<ObjectId, DOMRect>();
  const note = (id: ObjectId) => {
    const el = stackEl(id) ?? cardEl(id);
    if (el) at.set(id, el.getBoundingClientRect());
  };
  for (const c of cues) {
    if (c.kind === 'die' || c.kind === 'resolve') note(c.id);
    else if (c.kind === 'hit' && !c.combat) note(c.source);
  }
  return at;
}

const hueColors = new Map<Hue, string>();
function colorOf(h: Hue): string {
  let c = hueColors.get(h);
  if (!c) {
    const css =
      h === 'C' ? '' : getComputedStyle(document.documentElement).getPropertyValue(`--mana-${h}`);
    c = css.trim() || '#f0d890';
    hueColors.set(h, c);
  }
  return c;
}

function play(cues: Cue[], before: Map<ObjectId, DOMRect>, me: PlayerId): void {
  if (!fxOn() || !cues.length) return;
  // Spell damage flies first; deaths wait for whatever killed them to land.
  const bolted = cues.some((c) => c.kind === 'hit' && !c.combat && before.has(c.source));
  const deathAt = (bolted ? BOLT_MS : 0) + 160;

  for (const c of cues) {
    switch (c.kind) {
      case 'land':
        later(c.flew ? FLIGHT_MS : 30, () => land(c.id, colorOf(c.hue), c.weight));
        break;
      case 'mana': {
        const el = cardEl(c.id);
        if (!el) break;
        const p = mid(el.getBoundingClientRect());
        burst(p.x, p.y, colorOf(c.hue), {
          n: 8,
          speed: [0.4, 1.8],
          life: [22, 36],
          size: [3, 6],
          grav: -0.07,
        });
        ring(p.x, p.y, colorOf(c.hue), { r0: 8, r1: 30, life: 18, width: 1.5 });
        break;
      }
      case 'cast':
        later(380, () => {
          const el = stackEl(c.id);
          if (!el) return;
          const r = el.getBoundingClientRect();
          const p = mid(r);
          ring(p.x, p.y, colorOf(c.hue), {
            r0: r.width * 0.3,
            r1: r.width * 0.85,
            life: 26,
            width: 3,
          });
          burst(p.x, p.y, colorOf(c.hue), {
            n: 14,
            speed: [0.6, 2],
            box: { w: r.width, h: r.height, mode: 'edge' },
          });
        });
        break;
      case 'resolve': {
        const r = before.get(c.id);
        if (!r) break;
        const p = mid(r);
        if (c.fizzled) {
          burst(p.x, p.y, SMOKE, {
            n: 16,
            speed: [0.3, 1.2],
            size: [12, 22],
            life: [40, 60],
            grav: -0.04,
            glow: false,
            box: { w: r.width, h: r.height, mode: 'fill' },
          });
        } else {
          ring(p.x, p.y, colorOf(c.hue), {
            r0: r.width * 0.3,
            r1: r.width * 1.1,
            life: 26,
            width: 3,
          });
          burst(p.x, p.y, colorOf(c.hue), { n: 26, speed: [2, 6], size: [4, 8] });
        }
        break;
      }
      case 'attack': {
        const el = cardEl(c.id);
        const foe = playerEl(c.defender);
        if (!el || !foe) break;
        const a = mid(el.getBoundingClientRect());
        const dir = unit(a, mid(foe.getBoundingClientRect()));
        lunge(el, dir, 30);
        later(200, () => {
          const p = mid(el.getBoundingClientRect());
          ring(p.x, p.y, ATTACK_RED, { r0: 20, r1: 60, life: 20, width: 3 });
          burst(p.x, p.y, ATTACK_RED, {
            n: 14,
            angle: Math.atan2(-dir.y, -dir.x),
            spread: 1.4,
            speed: [1.5, 4],
          });
        });
        break;
      }
      case 'block': {
        const b = cardEl(c.blocker);
        const a = cardEl(c.attacker);
        if (!b || !a) break;
        const pb = mid(b.getBoundingClientRect());
        const pa = mid(a.getBoundingClientRect());
        lunge(b, unit(pb, pa), 18, 360);
        later(190, () => {
          const x = pb.x + (pa.x - pb.x) * 0.5;
          const y = pb.y + (pa.y - pb.y) * 0.5;
          ring(x, y, CLASH, { r0: 4, r1: 38, life: 18, width: 2.5 });
          burst(x, y, CLASH, { n: 18, speed: [2, 6], size: [3, 6], life: [16, 30] });
        });
        break;
      }
      case 'hit': {
        const color = colorOf(c.hue);
        const from = before.get(c.source);
        const impact = () => hit(c.to, c.amount, color, me);
        const el = targetEl(c.to);
        if (!c.combat && from && el)
          bolt(mid(from), mid(el.getBoundingClientRect()), color, impact, BOLT_MS);
        else impact();
        break;
      }
      case 'die': {
        const r = before.get(c.id);
        if (r) later(deathAt, () => dissolve(r, colorOf(c.hue)));
        break;
      }
      case 'heal': {
        const el = playerEl(c.player);
        if (!el) break;
        const r = el.getBoundingClientRect();
        const p = mid(r);
        ring(p.x, p.y, HEAL, { r0: 10, r1: 50, life: 26, width: 2 });
        burst(p.x, p.y, HEAL, {
          n: 12 + c.amount * 2,
          speed: [0.2, 1],
          life: [36, 60],
          grav: -0.08,
          box: { w: r.width, h: r.height, mode: 'fill' },
        });
        break;
      }
      case 'win':
        fireworks();
        break;
    }
  }
}

function unit(a: Point, b: Point): Point {
  const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return { x: (b.x - a.x) / d, y: (b.y - a.y) / d };
}

function land(id: ObjectId, color: string, weight: number): void {
  const el = cardEl(id);
  if (!el) return;
  const r = el.getBoundingClientRect();
  const p = mid(r);
  const heavy = Math.min(weight, 8);
  squash(el);
  ring(p.x, p.y, color, {
    r0: r.width * 0.35,
    r1: r.width * (0.8 + heavy * 0.1),
    life: 24 + heavy * 2,
    width: 2 + heavy * 0.4,
  });
  burst(p.x, p.y, DUST, {
    n: 8 + heavy * 3,
    speed: [0.6, 1.8 + heavy * 0.25],
    life: [28, 48],
    size: [8, 14 + heavy],
    glow: false,
    box: { w: r.width, h: r.height, mode: 'edge' },
  });
  burst(p.x, p.y, color, {
    n: weight ? 8 + heavy * 2 : 5,
    speed: [0.8, 2.5 + heavy * 0.3],
    size: [3, 6],
    box: { w: r.width, h: r.height, mode: 'edge' },
  });
  if (weight >= 5) shake(4 + (heavy - 5) * 2);
  else if (weight >= 3) shake(2);
}

let lastStop = 0;

function hit(to: TargetChoice, amount: number, color: string, me: PlayerId): void {
  const el = targetEl(to);
  if (!el) return;
  const big = Math.min(amount, 10);
  const mine = 'player' in to && to.player === me;
  const impact = () => {
    const p = mid(el.getBoundingClientRect());
    ring(p.x, p.y, '#ffffff', { r0: 6, r1: 30 + big * 5, life: 18, width: 2 + big * 0.3 });
    burst(p.x, p.y, color, { n: 10 + big * 3, speed: [2, 5 + big * 0.4], size: [4, 8] });
    burst(p.x, p.y, '#fff4d6', { n: 6, speed: [4, 8], size: [2, 4], life: [10, 18] });
    if (mine) {
      flash('#ff1e1e', Math.min(0.2 + big * 0.05, 0.55));
      shake(Math.min(3 + big * 1.5, 14));
    } else if ('player' in to) {
      shake(Math.min(1 + big * 0.6, 6));
    }
  };
  // Big hits freeze the table for a beat first; one freeze covers a whole combat's worth of hits.
  const now = performance.now();
  if ((amount >= 3 || (mine && amount >= 2)) && now - lastStop > 250) {
    lastStop = now;
    hitStop(Math.min(60 + big * 8, 130), el, impact);
  } else {
    impact();
  }
}

/** A card burning away: embers rising off where it was, with a little smoke. */
function dissolve(r: DOMRect, color: string): void {
  const p = mid(r);
  const box = { w: r.width, h: r.height, mode: 'fill' as const };
  burst(p.x, p.y, SMOKE, {
    n: 12,
    speed: [0.2, 0.8],
    size: [14, 26],
    life: [50, 80],
    grav: -0.03,
    glow: false,
    box,
  });
  burst(p.x, p.y, EMBER, {
    n: 26,
    speed: [0.2, 1.2],
    size: [3, 6],
    life: [40, 80],
    grav: -0.05,
    box,
  });
  burst(p.x, p.y, color, {
    n: 12,
    speed: [0.2, 1],
    size: [3, 6],
    life: [30, 60],
    grav: -0.04,
    box,
  });
}

function fireworks(): void {
  const colors = [GOLD, '#ffffff', colorOf('R'), colorOf('U'), colorOf('G'), colorOf('W')];
  for (let i = 0; i < 7; i++) {
    later(i * 220, () => {
      const x = innerWidth * (0.2 + Math.random() * 0.6);
      const y = innerHeight * (0.15 + Math.random() * 0.4);
      const c = colors[i % colors.length]!;
      ring(x, y, c, { r0: 4, r1: 80, life: 30, width: 3 });
      burst(x, y, c, {
        n: 40,
        speed: [2, 7],
        life: [50, 80],
        size: [3, 6],
        grav: 0.05,
        drag: 0.95,
      });
    });
  }
}
