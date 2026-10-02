import { jumpInId, type Packet, PACKETS, scryfallById, slug } from '@mtg/cards';
import { useState } from 'react';
import { ruleNotes } from '../game/notes.ts';
import { play } from '../game/sound.ts';
import { HoverPreview, type HoverState } from './Preview.tsx';
import { UiSize } from './UiSize.tsx';

type PacketSet = Packet['set'];

/** The sets with Jump In packets, in the order shown. */
const SETS: { set: PacketSet; name: string }[] = [
  { set: undefined, name: 'Foundations' },
  { set: 'blb', name: 'Bloomburrow' },
  { set: 'msh', name: 'Marvel Super Heroes' },
];

/** Three packets of a set at random, leaving out one already taken. */
function offer(set: PacketSet, taken?: Packet): Packet[] {
  const pool = PACKETS.filter((p) => p !== taken && p.set === set);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  return pool.slice(0, 3);
}

const artOf = (name: string) => scryfallById.get(slug(name))?.image?.artCrop ?? '';
const isRare = (name: string) =>
  ['rare', 'mythic'].includes(scryfallById.get(slug(name))?.rarity ?? '');

/**
 * Arena's Jump In! pick: three random themed packets, take one, then three
 * more, take another. The two become the expedition's 40-card deck.
 */
export function JumpIn({
  onPick,
  onBack,
}: {
  onPick: (deckId: string) => void;
  onBack: () => void;
}) {
  const [set, setSet] = useState<PacketSet>(undefined);
  const [first, setFirst] = useState<Packet | null>(null);
  const [options, setOptions] = useState(() => offer(undefined));
  const [hover, setHover] = useState<HoverState | null>(null);
  const choose = (p: Packet) => {
    play('place');
    setHover(null);
    if (!first) {
      setFirst(p);
      setOptions(offer(p.set, p));
    } else onPick(jumpInId(first.id, p.id));
  };
  // Packets pair within their set: pick the set before the first half.
  const pickSet = (s: PacketSet) => {
    setSet(s);
    setOptions(offer(s));
  };

  return (
    <div className="start jumpin">
      <UiSize />
      <div className="start__title">
        <span className="start__eyebrow">Expedition · Jump In!</span>
        <h1>{first ? 'Pick your second half' : 'Pick your first half'}</h1>
        <p>
          {first
            ? `${first.name} + ? Two halves make your 40-card deck.`
            : 'Two themed half-decks shuffle together into your 40-card deck.'}
        </p>
      </div>
      {!first && (
        <div className="start__opponent start__mode" role="radiogroup" aria-label="Set">
          {SETS.map((s) => (
            <button
              key={s.name}
              role="radio"
              aria-checked={set === s.set}
              className={`opp ${set === s.set ? 'is-on' : ''}`}
              onClick={() => pickSet(s.set)}
            >
              <span className="opp__name">{s.name}</span>
            </button>
          ))}
        </div>
      )}
      <div key={`${first?.id ?? 'first'}-${set ?? 'fdn'}`} className="jumpin__packets">
        {options.map((p, i) => (
          <div key={p.id} className="jumpin__packet">
            <button
              className="deck"
              style={
                {
                  '--art': `url("${artOf(p.face)}")`,
                  '--glow': `var(--mana-${p.color})`,
                  '--i': i,
                } as React.CSSProperties
              }
              onClick={() => choose(p)}
            >
              <span className="deck__art" />
              <span className="deck__pips">
                <span className={`pip pip--${p.color}`} />
              </span>
              <span className="deck__name">{p.name}</span>
              <span className="deck__blurb">{p.blurb}</span>
            </button>
            <ul className="jumpin__list" style={{ '--i': i } as React.CSSProperties}>
              {p.spells.map(([name, n]) => (
                <li
                  key={name}
                  className={isRare(name) ? 'is-rare' : ''}
                  onMouseEnter={(e) => setHover({ defId: slug(name), anchor: e.currentTarget })}
                  onMouseLeave={() => setHover(null)}
                >
                  <span>{n > 1 ? `${n}×` : ''}</span>
                  {name}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="gauntlet__actions">
        <button className="btn btn--ghost" onClick={onBack}>
          Back
        </button>
      </div>
      <HoverPreview hover={hover} notes={hover ? ruleNotes(hover.defId) : []} />
    </div>
  );
}
