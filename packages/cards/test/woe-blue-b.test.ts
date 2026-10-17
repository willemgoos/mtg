import type { GameDriver } from '@mtg/engine/testing';
import { describe, expect, it } from 'vitest';
import { all, cast, game, handSize, n, pt } from './blb-helpers.ts';
import {
  done,
  exile,
  gy,
  hand,
  keywords,
  library,
  nextTurn,
  toAttackers,
} from './ecl-blue-helpers.ts';

// Wilds of Eldraine (23b): the blue cards, part 2 (auras, copies, combat).

const ISLANDS = (k: number) => n('island', k);
const tgt = (g: GameDriver, id: string) => ({ object: { id, zcc: g.obj(id).zcc } });
const idOf = (
  g: GameDriver,
  defId: string,
  zone: 'battlefield' | 'hand' | 'graveyard' = 'battlefield',
  p: 'p1' | 'p2' = 'p1',
) => g.id(p, defId, zone);
/** The Adventure cast of a card in hand that targets this object. */
const adventureAt = (g: GameDriver, id: string) =>
  g
    .legal()
    .find(
      (a) =>
        a.type === 'castSpell' &&
        a.back &&
        a.targets.some((t) => 'object' in t && t.object.id === id),
    )!;

describe('Bitter Chill', () => {
  const setup = () =>
    game({
      p1: {
        hand: ['bitter-chill', 'threadbind-clique'],
        battlefield: [...ISLANDS(3), ...n('plains', 3)],
        library: n('forest', 5),
      },
      p2: { battlefield: ['savannah-lions'] },
    });
  it('taps the enchanted creature when it enters, which then does not untap', () => {
    const g = setup();
    const lions = idOf(g, 'savannah-lions', 'battlefield', 'p2');
    cast(g, 'bitter-chill', [tgt(g, lions)]);
    done(g);
    expect(g.obj(lions).tapped).toBe(true);
    nextTurn(g);
    // p2's untap step has passed: still tapped.
    expect(g.state.turn.activePlayer).toBe('p2');
    expect(g.obj(lions).tapped).toBe(true);
  });
  it('when it is put into a graveyard you may pay {1}: scry 1, then draw a card', () => {
    const g = setup();
    const lions = idOf(g, 'savannah-lions', 'battlefield', 'p2');
    cast(g, 'bitter-chill', [tgt(g, lions)]);
    done(g);
    // Rip the Seams destroys the tapped creature; the Aura goes to the graveyard.
    g.do(adventureAt(g, lions));
    done(g, { accept: true });
    expect(gy(g)).toContain('bitter-chill');
    expect(hand(g)).toEqual(['forest']);
    expect(g.state.players.p1.library.length).toBe(4);
  });
  it('declining the payment draws nothing', () => {
    const g = setup();
    const lions = idOf(g, 'savannah-lions', 'battlefield', 'p2');
    cast(g, 'bitter-chill', [tgt(g, lions)]);
    done(g);
    g.do(adventureAt(g, lions));
    done(g, { accept: false });
    expect(gy(g)).toContain('bitter-chill');
    expect(hand(g)).toEqual([]);
  });
  it('with no mana left to pay {1}, nothing is drawn', () => {
    const g = game({
      p1: {
        hand: ['bitter-chill', 'threadbind-clique'],
        battlefield: [...ISLANDS(2), ...n('plains', 3)],
      },
      p2: { battlefield: ['savannah-lions'] },
    });
    const lions = idOf(g, 'savannah-lions', 'battlefield', 'p2');
    cast(g, 'bitter-chill', [tgt(g, lions)]);
    done(g);
    g.do(adventureAt(g, lions));
    done(g, { accept: true });
    expect(hand(g)).toEqual([]);
  });
});

describe('Chancellor of Tales', () => {
  const setup = () =>
    game({
      p1: {
        hand: ['aquatic-alchemist'],
        graveyard: ['freeze-in-place', 'misleading-motes'],
        battlefield: [...ISLANDS(6), 'chancellor-of-tales'],
        library: n('forest', 5),
      },
    });
  it('flies, and you may copy an Adventure spell you cast, with a new target', () => {
    const g = setup();
    expect(keywords(g, idOf(g, 'chancellor-of-tales')).has('flying')).toBe(true);
    const freeze = idOf(g, 'freeze-in-place', 'graveyard');
    g.do(adventureAt(g, freeze));
    // The trigger: accept the copy, then choose a new target for it.
    done(g, { accept: true, option: /Misleading Motes/ });
    expect(library(g).slice(0, 2).sort()).toEqual(['freeze-in-place', 'misleading-motes']);
    expect(gy(g)).toEqual([]);
    expect(exile(g)).toEqual(['aquatic-alchemist']);
  });
  it('you may decline to copy', () => {
    const g = setup();
    const freeze = idOf(g, 'freeze-in-place', 'graveyard');
    g.do(adventureAt(g, freeze));
    done(g, { accept: false });
    expect(library(g)[0]).toBe('freeze-in-place');
    expect(gy(g)).toEqual(['misleading-motes']);
  });
  it('a spell that is not an Adventure is not copied', () => {
    const g = game({
      p1: { hand: ['freeze-in-place'], battlefield: [...ISLANDS(3), 'chancellor-of-tales'] },
      p2: { battlefield: ['savannah-lions'] },
    });
    cast(g, 'freeze-in-place', [tgt(g, idOf(g, 'savannah-lions', 'battlefield', 'p2'))]);
    expect(g.state.stack.length).toBe(1);
    expect(g.decision.kind).toBe('priority');
  });
});

describe('Storyteller Pixie', () => {
  it('draws a card whenever you cast an Adventure spell, and flies', () => {
    const g = game({
      p1: {
        hand: ['obyras-attendants', 'water-wings'],
        battlefield: [...ISLANDS(5), 'storyteller-pixie'],
        library: n('forest', 5),
      },
      p2: { battlefield: ['savannah-lions'] },
    });
    expect(keywords(g, idOf(g, 'storyteller-pixie')).has('flying')).toBe(true);
    expect(pt(g, idOf(g, 'storyteller-pixie'))).toEqual([3, 3]);
    const lions = idOf(g, 'savannah-lions', 'battlefield', 'p2');
    g.do(adventureAt(g, lions));
    done(g);
    expect(hand(g).sort()).toEqual(['forest', 'water-wings']);
    // A plain instant does not draw.
    cast(g, 'water-wings', [tgt(g, idOf(g, 'storyteller-pixie'))]);
    done(g);
    expect(hand(g)).toEqual(['forest']);
  });
});

describe('Elusive Otter', () => {
  const attackWith = (g: GameDriver, attacker: string) => {
    toAttackers(g);
    g.do({ type: 'addAttacker', player: 'p1', attacker, defender: 'p2' });
    g.do({ type: 'confirmAttackers', player: 'p1' });
    for (let i = 0; i < 10 && g.decision.kind !== 'declareBlockers'; i++) g.pass();
    // No creature able to block: the declare blockers step is skipped.
    if (g.decision.kind !== 'declareBlockers') return [];
    return g
      .legal()
      .flatMap((a) =>
        a.type === 'addBlock' && a.attacker === attacker ? [g.obj(a.blocker).defId] : [],
      )
      .sort();
  };
  it('has prowess', () => {
    const g = game({
      p1: { hand: ['water-wings'], battlefield: [...ISLANDS(2), 'elusive-otter'] },
    });
    const otter = idOf(g, 'elusive-otter');
    expect(pt(g, otter)).toEqual([1, 1]);
    cast(g, 'water-wings', [tgt(g, otter)]);
    done(g);
    // Water Wings makes it a 4/4, prowess adds +1/+1.
    expect(pt(g, otter)).toEqual([5, 5]);
  });
  it("creatures with power less than the Otter's power can't block it", () => {
    const g = game({
      p1: { battlefield: ['elusive-otter'] },
      p2: { battlefield: ['living-lectern', 'picklock-prankster', 'savannah-lions'] },
    });
    // Power 0 (Living Lectern) is less than 1; power 1 and 2 are not.
    expect(attackWith(g, idOf(g, 'elusive-otter'))).toEqual([
      'picklock-prankster',
      'savannah-lions',
    ]);
  });
  it('a bigger Otter cannot be blocked by anything smaller than it', () => {
    const g = game({
      p1: { hand: ['water-wings'], battlefield: [...ISLANDS(2), 'elusive-otter'] },
      p2: { battlefield: ['picklock-prankster', 'savannah-lions', 'serra-angel'] },
    });
    const otter = idOf(g, 'elusive-otter');
    cast(g, 'water-wings', [tgt(g, otter)]);
    done(g);
    // 5/5 now: Serra Angel's power 4 is less than 5.
    expect(attackWith(g, otter)).toEqual([]);
    for (let i = 0; i < 10 && g.state.players.p2.life === 20; i++) g.pass();
    expect(g.state.players.p2.life).toBe(15);
  });
});

void all;
void handSize;
