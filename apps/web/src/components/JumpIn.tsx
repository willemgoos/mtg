import { jumpInId, type Packet, PACKETS, scryfallById, slug } from '@mtg/cards';
import { useState } from 'react';
import { ruleNotes } from '../game/notes.ts';
import { play } from '../game/sound.ts';
import { HoverPreview, type HoverState } from './Preview.tsx';
import { HumanMade } from './HumanMade.tsx';
import { UiSize } from './UiSize.tsx';
import './home.css';
import './expedition.css';

/** The groups of Jump In packets, in the order shown: a set's own packets, or Arena's. */
const GROUPS = [
  { key: 'fdn', name: 'Foundations', has: (p: Packet) => !p.set && !p.source },
  {
    key: 'fdn-arena',
    name: 'Foundations · Arena',
    has: (p: Packet) => !p.set && p.source === 'arena',
  },
  { key: 'blb', name: 'Bloomburrow', has: (p: Packet) => p.set === 'blb' && !p.source },
  {
    key: 'blb-arena',
    name: 'Bloomburrow · Arena',
    has: (p: Packet) => p.set === 'blb' && p.source === 'arena',
  },
  { key: 'msh', name: 'Marvel Super Heroes', has: (p: Packet) => p.set === 'msh' },
] as const;

type Group = (typeof GROUPS)[number]['key'];
const groupOf = (p: Packet) => GROUPS.find((g) => g.has(p))!;

/** Three packets at random, of one group or (`'any'`) all, leaving out one already taken. */
function offer(group: Group | 'any', taken?: Packet): Packet[] {
  const pool = PACKETS.filter((p) => p !== taken && (group === 'any' || groupOf(p).key === group));
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
 * more, take another. The two become a 40-card deck: for an expedition, or
 * (`versus`) for one game against a bot that jumped in too.
 */
export function JumpIn({
  versus = false,
  onPick,
  onBack,
}: {
  versus?: boolean;
  onPick: (deckId: string) => void;
  onBack: () => void;
}) {
  const [group, setGroup] = useState<Group>('fdn');
  const [first, setFirst] = useState<Packet | null>(null);
  const [options, setOptions] = useState(() => offer('fdn'));
  const [hover, setHover] = useState<HoverState | null>(null);
  const choose = (p: Packet) => {
    play('place');
    setHover(null);
    if (!first) {
      setFirst(p);
      setOptions(offer('any', p));
    } else onPick(jumpInId(first.id, p.id));
  };
  // The group picks where the first half comes from; the second can be from any group.
  const pickGroup = (g: Group) => {
    setGroup(g);
    setOptions(offer(g));
  };

  return (
    <div className="start shell jumpin">
      <UiSize />
      <div className="start__title">
        <span className="start__eyebrow">{versus ? 'Versus' : 'Expedition'} · Jump In!</span>
        <h1>{first ? 'Pick your second half' : 'Pick your first half'}</h1>
        <p>
          {first
            ? `${first.name} + ? Two halves make your 40-card deck.`
            : versus
              ? 'Two themed half-decks make your 40-card deck. The bot picks its own two.'
              : 'Two themed half-decks shuffle together into your 40-card deck.'}
        </p>
      </div>
      {!first && (
        <div className="start__opponent start__mode" role="radiogroup" aria-label="Set">
          {GROUPS.map((g) => (
            <button
              key={g.key}
              role="radio"
              aria-checked={group === g.key}
              className={`opp ${group === g.key ? 'is-on' : ''}`}
              onClick={() => pickGroup(g.key)}
            >
              <span className="opp__name">{g.name}</span>
            </button>
          ))}
        </div>
      )}
      <div key={`${first?.id ?? 'first'}-${group}`} className="jumpin__packets">
        {options.map((p, i) => (
          <div key={p.id} className="jumpin__packet">
            <button
              className="deck"
              style={
                {
                  '--art': `url("${artOf(p.face)}")`,
                  '--glow': `var(--mana-${p.colors[0]})`,
                  '--i': i,
                } as React.CSSProperties
              }
              onClick={() => choose(p)}
            >
              <span className="deck__art" />
              <HumanMade of={p} />
              <span className="deck__pips">
                {p.colors.map((c) => (
                  <span key={c} className={`pip pip--${c}`} />
                ))}
              </span>
              <span className="deck__name">{p.name}</span>
              <span className="deck__blurb">
                {first ? `${groupOf(p).name} · ` : ''}
                {p.blurb}
              </span>
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
