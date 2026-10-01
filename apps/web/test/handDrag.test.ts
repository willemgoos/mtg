import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { effects } = vi.hoisted(() => ({ effects: [] as (() => void | (() => void))[] }));
vi.mock('react', () => ({
  useCallback: (callback: unknown) => callback,
  useRef: (current: unknown) => ({ current }),
  useState: (value: unknown) => [value, vi.fn()],
  useEffect: (effect: () => void | (() => void)) => effects.push(effect),
  useLayoutEffect: () => {},
}));
vi.mock('../src/game/useFlip.ts', () => ({ flyFrom: vi.fn() }));
import { useHandDrag } from '../src/game/useHandDrag.ts';

// Exercise the pointer lifecycle without a browser renderer. Slot geometry is
// fixed; these tests cover reorder versus play, cancellation, and click gating.
describe('hand drag gestures', () => {
  let listeners: Map<string, (event: unknown) => void>;
  let cleanup: (() => void) | void;
  const onReorder = vi.fn();
  const onDrop = vi.fn();
  let slots: { offsetLeft: number; offsetWidth: number; x: number; style: { animation: string } }[];

  beforeEach(() => {
    effects.length = 0;
    onReorder.mockClear();
    onDrop.mockClear();
    listeners = new Map();
    slots = [0, 1, 2].map((i) => ({
      offsetLeft: 100,
      offsetWidth: 100,
      x: -50 + i * 80,
      style: { animation: 'draw 0.45s' },
    }));
    vi.stubGlobal('window', {
      addEventListener: (name: string, fn: (event: unknown) => void) => listeners.set(name, fn),
      removeEventListener: (name: string) => listeners.delete(name),
    });
    const rect = { left: 0, right: 400, top: 700, height: 100 };
    vi.stubGlobal('document', {
      querySelector: (selector: string) =>
        selector === '.board'
          ? { classList: { toggle: vi.fn(), remove: vi.fn() } }
          : { getBoundingClientRect: () => rect },
      elementFromPoint: () => ({ closest: () => null }),
    });
    vi.stubGlobal('getComputedStyle', (slot: { x: number }) => ({ transform: String(slot.x) }));
    vi.stubGlobal(
      'DOMMatrixReadOnly',
      class {
        m41: number;
        constructor(transform: string) {
          this.m41 = Number(transform);
        }
      },
    );
    vi.stubGlobal('requestAnimationFrame', () => 1);
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup?.();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function start(canPlay = false, startY = 750) {
    const drag = useHandDrag({
      hand: ['a', 'b', 'c'],
      canReorder: () => true,
      canPlay: () => canPlay,
      onReorder,
      onDrop,
    });
    cleanup = effects[0]!();
    const hand = {
      getBoundingClientRect: () => ({ left: 0 }),
      querySelectorAll: () => slots,
    };
    drag.onHandPointerDown('a', {
      button: 0,
      pointerId: 1,
      clientX: 130,
      clientY: startY,
      currentTarget: { getBoundingClientRect: () => ({ left: 50, top: 700 }), closest: () => hand },
    } as unknown as React.PointerEvent);
    return drag;
  }

  function pointer(type: string, x: number, y = 750, pointerId = 1) {
    listeners.get(type)!({ type, clientX: x, clientY: y, pointerId });
  }

  it('reorders an unplayable card without casting it or clicking after release', () => {
    const drag = start();
    pointer('pointermove', 290);
    expect(onReorder).toHaveBeenLastCalledWith(['b', 'c', 'a']);
    pointer('pointerup', 290);
    expect(onDrop).not.toHaveBeenCalled();
    expect(drag.wasDrag()).toBe(true);
    vi.runAllTimers();
    expect(drag.wasDrag()).toBe(false);
  });

  it('preserves grab offset and leaves short movements as ordinary clicks', () => {
    const drag = start();
    pointer('pointermove', 135);
    pointer('pointerup', 135);
    expect(onReorder).not.toHaveBeenCalled();
    expect(drag.wasDrag()).toBe(false);
  });

  it('still plays a legal card when dropped above the hand', () => {
    start(true);
    pointer('pointermove', 150, 500);
    pointer('pointerup', 150, 500);
    expect(onDrop).toHaveBeenCalledExactlyOnceWith('a', 150, 500);
    expect(onReorder).not.toHaveBeenCalled();
  });

  it('reorders sideways from a raised card without accidentally playing it', () => {
    start(true, 650);
    pointer('pointermove', 290, 650);
    pointer('pointerup', 290, 650);
    expect(onReorder).toHaveBeenLastCalledWith(['b', 'c', 'a']);
    expect(onDrop).not.toHaveBeenCalled();
  });

  it('restores the original order on cancellation and never casts an illegal card', () => {
    start();
    pointer('pointermove', 290);
    pointer('pointercancel', 290);
    expect(onReorder).toHaveBeenLastCalledWith(['a', 'b', 'c']);
    expect(onDrop).not.toHaveBeenCalled();
    start();
    pointer('pointermove', 150, 500);
    pointer('pointerup', 150, 500);
    expect(onDrop).not.toHaveBeenCalled();
  });

  it('ignores another pointer while dragging', () => {
    start();
    pointer('pointermove', 290, 750, 2);
    pointer('pointerup', 290, 750, 2);
    expect(onReorder).not.toHaveBeenCalled();
    pointer('pointermove', 290);
    expect(onReorder).toHaveBeenLastCalledWith(['b', 'c', 'a']);
  });

  it('retires arrival animations before reordering and keeps them disabled on re-drag', () => {
    start();
    expect(slots.every((slot) => slot.style.animation === 'none')).toBe(true);
    pointer('pointermove', 290);
    pointer('pointerup', 290);
    start();
    expect(slots.every((slot) => slot.style.animation === 'none')).toBe(true);
    pointer('pointermove', 210);
    pointer('pointerup', 210);
    expect(onDrop).not.toHaveBeenCalled();
  });
});
