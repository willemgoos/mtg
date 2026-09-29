import { useEffect, useState } from 'react';

const SIZES = [
  { label: 'S', scale: 0.9 },
  { label: 'M', scale: 1 },
  { label: 'L', scale: 1.15 },
  { label: 'XL', scale: 1.3 },
];
const KEY = 'mtg.uiScale';

function load(): number {
  try {
    const v = Number(localStorage.getItem(KEY));
    return SIZES.some((s) => s.scale === v) ? v : 1;
  } catch {
    return 1;
  }
}

/** Applies the saved UI size on startup (before first paint of the app). */
export function applySavedUiScale(): void {
  document.documentElement.style.setProperty('--ui-scale', String(load()));
}

/** UI size picker: scales every element, on top of the automatic resolution scaling. */
export function UiSize() {
  const [scale, setScale] = useState(load);
  useEffect(() => {
    document.documentElement.style.setProperty('--ui-scale', String(scale));
    try {
      localStorage.setItem(KEY, String(scale));
    } catch {
      // Storage can be unavailable (private mode); the size still applies for this session.
    }
  }, [scale]);
  return (
    <div className="ui-size" role="radiogroup" aria-label="UI size">
      UI size
      {SIZES.map((s) => (
        <button
          key={s.label}
          role="radio"
          aria-checked={scale === s.scale}
          className={scale === s.scale ? 'is-on' : ''}
          onClick={() => setScale(s.scale)}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}
