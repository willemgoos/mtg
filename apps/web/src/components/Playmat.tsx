import type { Color } from '@mtg/engine';

/*
 * One player's half of the table, dressed as a cloth playmat in their deck's
 * colours: a mana tint, woven texture, an engraved mana mark per colour and a
 * brass edge. Everything is CSS or vector, so it stays sharp at any size
 * (card art is too small to stretch over half the screen).
 */

/** Engraved line-art marks, drawn in a 100x100 box. */
const MARKS: Record<Color, React.ReactNode> = {
  W: (
    <>
      <circle cx="50" cy="50" r="15" strokeWidth="0.6" />
      <circle cx="50" cy="50" r="10" strokeWidth="0.3" />
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i * Math.PI) / 6;
        const [r1, r2] = i % 2 ? [20, 30] : [20, 37];
        return (
          <line
            key={i}
            x1={50 + r1 * Math.cos(a)}
            y1={50 + r1 * Math.sin(a)}
            x2={50 + r2 * Math.cos(a)}
            y2={50 + r2 * Math.sin(a)}
            strokeWidth="0.6"
          />
        );
      })}
    </>
  ),
  U: (
    <>
      <path
        strokeWidth="0.6"
        d="M50 12 C58 30 72 44 72 62 C72 76 62 86 50 86 C38 86 28 76 28 62 C28 44 42 30 50 12Z"
      />
      <path strokeWidth="0.3" d="M40 58 C38 66 42 74 50 76" />
    </>
  ),
  B: (
    <>
      <path
        strokeWidth="0.6"
        d="M50 14 C32 14 22 28 22 44 C22 56 29 62 34 65 L34 80 L66 80 L66 65 C71 62 78 56 78 44 C78 28 68 14 50 14Z"
      />
      <circle cx="39" cy="47" r="7" strokeWidth="0.5" />
      <circle cx="61" cy="47" r="7" strokeWidth="0.5" />
      <path strokeWidth="0.4" d="M50 56 L46 64 L54 64Z M42 72 L42 80 M50 72 L50 80 M58 72 L58 80" />
    </>
  ),
  R: (
    <>
      <path
        strokeWidth="0.6"
        d="M52 12 C57 28 73 36 71 58 C69 76 58 86 49 86 C36 86 28 76 30 62 C31 50 40 45 42 34 C47 41 47 48 50 52 C54 40 50 26 52 12Z"
      />
      <path
        strokeWidth="0.3"
        d="M50 50 C56 58 60 64 58 72 C56 79 50 81 46 79 C42 76 42 70 45 66 C47 62 50 58 50 50Z"
      />
    </>
  ),
  G: (
    <>
      <path
        strokeWidth="0.6"
        d="M50 12 C40 22 28 28 28 44 C28 56 37 62 45 60 L43 84 L57 84 L55 60 C63 62 72 56 72 44 C72 28 60 22 50 12Z"
      />
      <path strokeWidth="0.3" d="M50 22 L50 70 M50 36 L40 30 M50 44 L61 37 M50 52 L41 47" />
      <path strokeWidth="0.4" d="M30 84 L70 84" />
    </>
  ),
};

export function Playmat({ side, colors }: { side: 'opp' | 'me'; colors: Color[] }) {
  const [c1 = 'G', c2 = c1] = colors;
  return (
    <div
      className={`mat mat--${side}`}
      style={
        { '--mat-a': `var(--mat-${c1})`, '--mat-b': `var(--mat-${c2})` } as React.CSSProperties
      }
      aria-hidden
    >
      <div className="mat__cloth" />
      <div className={`mat__marks ${colors.length > 1 ? 'mat__marks--two' : ''}`}>
        {[...new Set([c1, c2])].map((c) => (
          <svg key={c} className="mat__mark" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="47" strokeWidth="0.4" />
            <circle cx="50" cy="50" r="44.5" strokeWidth="0.2" />
            {MARKS[c]}
          </svg>
        ))}
      </div>
      <div className="mat__edge" />
    </div>
  );
}
