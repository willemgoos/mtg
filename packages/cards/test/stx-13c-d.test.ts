import { describe, expect, it } from 'vitest';
import { getCharacteristics, type Action } from '@mtg/engine';
import type { GameDriver } from '@mtg/engine/testing';
import { cardDb } from '../src/index.ts';
import { cast, game, n, pt, settle } from './blb-helpers.ts';

// Strixhaven 13c, group D: remaining red, colourless and land cards.

const NAMES = [
  'ardent-dustspeaker',
  'blood-age-general',
  'conspiracy-theorist',
  'crackle-with-power',
  'draconic-intervention',
  'dragons-approach',
  'explosive-welcome',
  'fervent-mastery',
  'first-day-of-class',
  'grinning-ignus',
  'illuminate-history',
  'access-tunnel',
  'archway-commons',
  'hall-of-oracles',
  'letter-of-acceptance',
  'mascot-exhibition',
  'reflective-golem',
  'spell-satchel',
  'strixhaven-stadium',
  'the-biblioplex',
  'wandering-archaic',
];

type Answer = (g: GameDriver, legal: Action[]) => Action | undefined;

/**
 * Plays the stack out. `answer` gets each non-priority decision (after the usual
 * trigger-target choices); with no answer the last legal action is taken (decline).
 */
function drive(g: GameDriver, answer?: Answer): GameDriver {
  for (let i = 0; i < 60; i++) {
    const d = g.decision;
    if (d.kind === 'priority' && g.state.stack.length) g.pass();
    else if (d.kind === 'chooseTriggerTargets') settle(g);
    else if (d.kind === 'priority' || d.kind === 'gameOver') break;
    else {
      const legal = g.legal();
      g.do(answer?.(g, legal) ?? legal[legal.length - 1]!);
    }
  }
  return g;
}

const activate = (g: GameDriver, source: string, index = 0, target?: string) =>
  g.do(
    g
      .legal()
      .find(
        (a) =>
          a.type === 'activateAbility' &&
          a.source === source &&
          a.abilityIndex === index &&
          (target === undefined ||
            JSON.stringify((a as { targets?: unknown }).targets).includes(target)),
      )!,
  );
/** Passes priority until the active player declares attackers. */
function toAttack(g: GameDriver): GameDriver {
  for (let i = 0; i < 20 && g.decision.kind !== 'declareAttackers'; i++) g.pass();
  return g;
}
const yes = (legal: Action[]) => legal.find((a) => a.type === 'chooseEffect' && a.accept);
const hand = (g: GameDriver, p: 'p1' | 'p2' = 'p1') => g.state.players[p].hand;
const named = (g: GameDriver, defId: string, p: 'p1' | 'p2' = 'p1') =>
  g.state.battlefield.filter((id) => g.obj(id).defId === defId && g.obj(id).controller === p);

describe('the group', () => {
  it('is all in the card pool', () => {
    for (const id of NAMES) expect(cardDb.get(id), id).toBeDefined();
  });
});

describe('red creatures', () => {
  it('Ardent Dustspeaker puts a spell on the library bottom, exiles two cards to play', () => {
    const g = game({
      p1: {
        battlefield: ['ardent-dustspeaker'],
        graveyard: ['lightning-strike'],
        library: ['mountain', 'shock', 'forest'],
      },
    });
    toAttack(g);
    g.attack(g.id('p1', 'ardent-dustspeaker'));
    drive(g, (_g, legal) => legal.find((a) => a.type === 'chooseCard' && a.card !== null));
    const p = g.state.players.p1;
    expect(g.state.objects[p.library[p.library.length - 1]!]!.defId).toBe('lightning-strike');
    expect(p.graveyard).toHaveLength(0);
    expect(g.state.objects[g.id('p1', 'mountain', 'exile')]).toBeDefined();
    expect(g.state.objects[g.id('p1', 'shock', 'exile')]).toBeDefined();
  });

  it('Ardent Dustspeaker does nothing without an instant or sorcery in the graveyard', () => {
    const g = game({ p1: { battlefield: ['ardent-dustspeaker'], library: ['mountain', 'shock'] } });
    toAttack(g);
    g.attack(g.id('p1', 'ardent-dustspeaker'));
    drive(g);
    expect(g.state.players.p1.library[0]).toBeDefined();
    expect(g.state.players.p1.library).toHaveLength(2);
  });

  it('Blood Age General gives attacking Spirits +1/+0', () => {
    const g = game({
      p1: { battlefield: ['blood-age-general', 'lorehold-spirit-token', 'bear-cub'] },
    });
    const spirit = g.id('p1', 'lorehold-spirit-token');
    const bears = g.id('p1', 'bear-cub');
    toAttack(g);
    g.attack(spirit, bears);
    drive(g);
    const [p0] = pt(g, spirit);
    activate(g, g.id('p1', 'blood-age-general'));
    drive(g);
    expect(pt(g, spirit)[0]).toBe(p0! + 1);
    expect(pt(g, bears)[0]).toBe(2);
  });

  it('Conspiracy Theorist rummages for {1} when it attacks', () => {
    const g = game({
      p1: { battlefield: ['conspiracy-theorist', 'mountain'], hand: ['bear-cub'] },
    });
    toAttack(g);
    g.attack(g.id('p1', 'conspiracy-theorist'));
    let paid = false;
    drive(g, (_g, legal) => {
      if (!paid && yes(legal)) {
        paid = true;
        return yes(legal);
      }
      return (
        legal.find((a) => a.type === 'discard') ??
        legal.find((a) => a.type === 'chooseEffect' && !a.accept)
      );
    });
    // Discarded the Bear Cub (declining to exile it), then drew the top Forest.
    expect(g.state.players.p1.graveyard.map((id) => g.obj(id).defId)).toEqual(['bear-cub']);
    expect(hand(g).map((id) => g.obj(id).defId)).toEqual(['forest']);
    expect(g.obj(g.id('p1', 'mountain')).tapped).toBe(true);
  });

  it('Conspiracy Theorist lets you cast a nonland card you discarded', () => {
    const g = game({
      p1: {
        battlefield: ['conspiracy-theorist', 'mountain'],
        hand: ['lightning-strike', 'forest'],
      },
    });
    toAttack(g);
    g.attack(g.id('p1', 'conspiracy-theorist'));
    // Pay {1}, discard Lightning Strike, accept the exile, then cast it from exile.
    drive(g, (_g, legal) => yes(legal) ?? legal.find((a) => a.type === 'discard'));
    const strike = g.id('p1', 'lightning-strike', 'exile');
    expect(g.zoneOf(strike)).toBe('exile');
    expect(g.state.players.p1.graveyard).toHaveLength(0);
  });

  it('Grinning Ignus returns to hand for {C}{C}{R}', () => {
    const g = game({ p1: { battlefield: ['grinning-ignus', 'mountain'] } });
    const id = g.id('p1', 'grinning-ignus');
    activate(g, id);
    drive(g);
    expect(g.zoneOf(id)).not.toBe('battlefield');
    expect(g.state.players.p1.hand.map((c) => g.obj(c).defId)).toContain('grinning-ignus');
    expect(g.state.players.p1.pool?.length).toBe(3);
  });

  it('Reflective Golem copies a spell that targets only it, for {2}', () => {
    const g = game({
      p1: {
        hand: ['giant-growth'],
        battlefield: ['reflective-golem', 'forest', 'forest', 'forest'],
      },
    });
    const golem = g.id('p1', 'reflective-golem');
    const [p] = pt(g, golem);
    cast(g, 'giant-growth', [g.ref(golem)]);
    drive(g, (_g, legal) => yes(legal));
    expect(pt(g, golem)[0]).toBe(p! + 6);
  });

  it('Wandering Archaic copies an opponent spell unless they pay {2}', () => {
    const mk = (lands: number) =>
      game({
        active: 'p2',
        p1: { battlefield: ['wandering-archaic', 'bear-cub'] },
        p2: { hand: ['shock'], battlefield: n('mountain', lands) },
      });
    // They can't pay: we copy Shock and aim it at their face (the copy keeps the original target).
    const g = mk(1);
    const bears = g.id('p1', 'bear-cub');
    cast(g, 'shock', [g.ref(bears)]);
    drive(g, (_g, legal) => yes(legal));
    expect(g.zoneOf(bears)).not.toBe('battlefield');
    // They can pay {2}: no copy, and a prompt to pay.
    const h = mk(3);
    cast(h, 'shock', [{ player: 'p1' }]);
    h.passBoth();
    expect(h.decision.kind).toBe('payOrCounter');
    h.do(yes(h.legal())!);
    drive(h);
    expect(h.life('p1')).toBe(18);
  });
});

describe('red spells', () => {
  it('Crackle with Power deals 5X damage to up to X targets', () => {
    const g = game({ p1: { hand: ['crackle-with-power'], battlefield: n('mountain', 8) } });
    const casts = g
      .legal()
      .filter((a) => a.type === 'castSpell' && a.card === g.id('p1', 'crackle-with-power', 'hand'));
    // X = 2 with two targets is allowed; X = 1 with two targets is not.
    expect(casts.some((a) => a.type === 'castSpell' && a.x === 2 && a.targets.length === 2)).toBe(
      true,
    );
    expect(casts.some((a) => a.type === 'castSpell' && a.x === 1 && a.targets.length === 2)).toBe(
      false,
    );
  });

  it('Crackle with Power with X = 2 hits two targets for 10', () => {
    const g = game({
      p1: { hand: ['crackle-with-power'], battlefield: n('mountain', 8) },
      p2: { battlefield: ['serra-angel'] },
    });
    const angel = g.id('p2', 'serra-angel');
    const a = g
      .legal()
      .find(
        (x) =>
          x.type === 'castSpell' &&
          x.x === 2 &&
          x.targets.length === 2 &&
          JSON.stringify(x.targets).includes(angel) &&
          JSON.stringify(x.targets).includes('"player":"p2"'),
      )!;
    g.do(a);
    drive(g);
    expect(g.life('p2')).toBe(10);
    expect(g.zoneOf(angel)).not.toBe('battlefield');
  });

  it('Draconic Intervention exiles a card, X is its mana value, exiles what dies', () => {
    const g = game({
      p1: {
        hand: ['draconic-intervention'],
        battlefield: [...n('mountain', 4), 'bear-cub'],
        graveyard: ['lightning-strike'],
      },
      p2: { battlefield: ['serra-angel', 'shivan-dragon'] },
    });
    const bears = g.id('p1', 'bear-cub');
    const angel = g.id('p2', 'serra-angel');
    const dragon = g.id('p2', 'shivan-dragon');
    const strike = g.id('p1', 'lightning-strike', 'graveyard');
    const a = g.legal().find((x) => x.type === 'castSpell' && x.discard === strike)!;
    g.do(a);
    drive(g);
    expect(g.zoneOf(strike)).toBe('exile');
    // 2 mana value: Grizzly Bears dies (exiled); Serra Angel (4 toughness) survives; the Dragon is untouched.
    expect(g.zoneOf(bears)).toBe('exile');
    expect(g.zoneOf(angel)).toBe('battlefield');
    expect(g.obj(dragon).damage).toBe(0);
    expect(g.zoneOf(g.id('p1', 'draconic-intervention', 'exile'))).toBe('exile');
  });

  it("Dragon's Approach deals 3 and, with four more in the graveyard, fetches a Dragon", () => {
    const g = game({
      p1: {
        hand: ['dragons-approach'],
        battlefield: n('mountain', 3),
        graveyard: n('dragons-approach', 4),
        library: ['shivan-dragon', 'forest'],
      },
    });
    cast(g, 'dragons-approach');
    drive(g, (_g, legal) => yes(legal) ?? legal.find((a) => a.type === 'chooseCard' && a.card));
    expect(g.life('p2')).toBe(17);
    expect(named(g, 'shivan-dragon')).toHaveLength(1);
    expect(g.state.players.p1.graveyard).toHaveLength(0);
    expect(g.state.objects[g.id('p1', 'dragons-approach', 'exile')]).toBeDefined();
  });

  it("Dragon's Approach doesn't offer the exile with fewer than four others", () => {
    const g = game({
      p1: {
        hand: ['dragons-approach'],
        battlefield: n('mountain', 3),
        graveyard: n('dragons-approach', 3),
      },
    });
    cast(g, 'dragons-approach');
    drive(g);
    expect(g.life('p2')).toBe(17);
    expect(g.state.players.p1.graveyard).toHaveLength(4);
  });

  it('Explosive Welcome deals 5 and 3 to different targets and adds {R}{R}{R}', () => {
    const g = game({
      p1: { hand: ['explosive-welcome'], battlefield: n('mountain', 8) },
    });
    const both = g
      .legal()
      .filter((a) => a.type === 'castSpell' && a.card === g.id('p1', 'explosive-welcome', 'hand'));
    // The same player can't be both targets.
    expect(
      both.some(
        (a) =>
          a.type === 'castSpell' &&
          a.targets.length === 2 &&
          JSON.stringify(a.targets[0]) === JSON.stringify(a.targets[1]),
      ),
    ).toBe(false);
    const a = both.find(
      (x) =>
        x.type === 'castSpell' &&
        JSON.stringify(x.targets) === JSON.stringify([{ player: 'p2' }, { player: 'p1' }]),
    )!;
    g.do(a);
    drive(g);
    expect(g.life('p2')).toBe(15);
    expect(g.life('p1')).toBe(17);
    expect(g.state.players.p1.pool?.length).toBe(3);
  });

  it('Fervent Mastery tutors three cards then discards three at random', () => {
    const g = game({
      p1: {
        hand: ['fervent-mastery'],
        battlefield: n('mountain', 5),
        library: ['shock', 'lightning-strike', 'bear-cub', 'forest'],
      },
    });
    cast(g, 'fervent-mastery');
    drive(g, (_g, legal) => legal.find((a) => a.type === 'chooseCard' && a.card));
    expect(hand(g)).toHaveLength(0);
    expect(g.state.players.p1.graveyard.length).toBe(4);
  });

  it('Fervent Mastery for {2}{R}{R} lets the opponent discard and redraw any number', () => {
    const g = game({
      p1: {
        hand: ['fervent-mastery'],
        battlefield: n('mountain', 4),
        library: ['shock', 'lightning-strike', 'bear-cub'],
      },
      p2: { hand: ['forest', 'forest', 'plains'], library: n('mountain', 5) },
    });
    const kicked = g
      .legal()
      .find(
        (a) =>
          a.type === 'castSpell' && a.kicked && a.card === g.id('p1', 'fervent-mastery', 'hand'),
      )!;
    g.do(kicked);
    let discards = 0;
    drive(g, (_g, legal) => {
      const d = g.decision;
      if (d.kind === 'discard' && d.player === 'p2') {
        const pick = legal.find((a) => a.type === 'discard');
        if (pick && discards < 2) {
          discards++;
          return pick;
        }
        return legal.find((a) => a.type === 'chooseEffect');
      }
      return legal.find((a) => a.type === 'chooseCard' && a.card);
    });
    expect(discards).toBe(2);
    // Two discarded, two drawn: three cards in hand again, two of them Mountains.
    expect(hand(g, 'p2')).toHaveLength(3);
    expect(hand(g, 'p2').filter((id) => g.obj(id).defId === 'mountain')).toHaveLength(2);
  });

  it('First Day of Class puts a +1/+1 counter and haste on creatures that enter this turn', () => {
    const g = game({
      p1: {
        hand: ['first-day-of-class', 'bear-cub'],
        battlefield: [...n('mountain', 2), ...n('forest', 2)],
      },
    });
    cast(g, 'first-day-of-class');
    drive(g);
    cast(g, 'bear-cub');
    drive(g);
    const bears = g.id('p1', 'bear-cub');
    expect(pt(g, bears)).toEqual([3, 3]);
    expect(getCharacteristics(g.state, cardDb, bears).keywords).toContain('haste');
  });

  it('First Day of Class stops affecting creatures next turn', () => {
    const g = game({
      p1: { hand: ['first-day-of-class'], battlefield: n('mountain', 2) },
    });
    cast(g, 'first-day-of-class');
    drive(g);
    expect(g.state.emblems ?? []).toHaveLength(1);
    g.passUntilStep('upkeep');
    expect(g.state.emblems ?? []).toHaveLength(0);
  });

  it('Illuminate History discards any number, draws that many, and makes a Spirit with 7 in the graveyard', () => {
    const g = game({
      p1: {
        hand: ['illuminate-history', 'shock', 'forest', 'plains'],
        battlefield: n('mountain', 4),
        graveyard: n('shock', 4),
      },
    });
    cast(g, 'illuminate-history');
    let n2 = 0;
    drive(g, (_g, legal) => {
      if (n2 < 2) {
        n2++;
        return legal.find((a) => a.type === 'discard');
      }
      return legal.find((a) => a.type === 'chooseEffect');
    });
    // 4 graveyard + 2 discarded + Illuminate History itself is still on the stack: 6; draws two.
    expect(hand(g)).toHaveLength(3);
    expect(named(g, 'lorehold-spirit-token')).toHaveLength(0);
  });

  it('Illuminate History makes a 3/2 Spirit when the graveyard has seven cards', () => {
    const g = game({
      p1: {
        hand: ['illuminate-history', 'shock'],
        battlefield: n('mountain', 4),
        graveyard: n('shock', 6),
      },
    });
    cast(g, 'illuminate-history');
    let done = false;
    drive(g, (_g, legal) => {
      if (!done) {
        done = true;
        return legal.find((a) => a.type === 'discard');
      }
      return legal.find((a) => a.type === 'chooseEffect');
    });
    expect(named(g, 'lorehold-spirit-token')).toHaveLength(1);
  });

  it('Mascot Exhibition makes an Inkling, a Spirit and an Elemental', () => {
    const g = game({ p1: { hand: ['mascot-exhibition'], battlefield: n('mountain', 7) } });
    cast(g, 'mascot-exhibition');
    drive(g);
    expect(named(g, 'stx-inkling-token')).toHaveLength(1);
    expect(named(g, 'lorehold-spirit-token')).toHaveLength(1);
    expect(named(g, 'stx-elemental-ur-token')).toHaveLength(1);
  });
});

describe('Wandering Archaic // Explore the Vastlands', () => {
  it('is a 4/4 for {5} on the front and a sorcery for {3} on the back', () => {
    const front = cardDb.get('wandering-archaic')!;
    expect(front.back).toBeDefined();
    const back = cardDb.get(front.back!)!;
    expect(back.name).toBe('Explore the Vastlands');
    expect(back.types).toEqual(['Sorcery']);
  });

  it('lets each player take a land and an instant or sorcery from the top five, and gains 3 life', () => {
    const g = game({
      p1: {
        hand: ['wandering-archaic'],
        battlefield: n('mountain', 3),
        library: ['forest', 'shock', 'bear-cub', 'plains', 'savannah-lions', 'island'],
      },
      p2: {
        library: ['lightning-strike', 'mountain', 'bear-cub', 'bear-cub', 'bear-cub', 'island'],
      },
    });
    g.do({
      type: 'castSpell',
      player: 'p1',
      card: g.id('p1', 'wandering-archaic', 'hand'),
      targets: [],
      back: true,
    });
    const taken: string[] = [];
    drive(g, (_g, legal) => {
      const pick = legal.find((a) => a.type === 'chooseCard' && a.card);
      if (pick && pick.type === 'chooseCard') taken.push(g.state.objects[pick.card!]!.defId);
      return pick ?? legal.find((a) => a.type === 'chooseCard');
    });
    // The first decision offers lands, the second the instants and sorceries.
    expect(taken).toEqual(['forest', 'shock', 'mountain', 'lightning-strike']);
    expect(
      hand(g)
        .map((id) => g.obj(id).defId)
        .sort(),
    ).toEqual(['forest', 'shock']);
    expect(
      hand(g, 'p2')
        .map((id) => g.obj(id).defId)
        .sort(),
    ).toEqual(['lightning-strike', 'mountain']);
    expect(g.life('p1')).toBe(23);
    expect(g.life('p2')).toBe(23);
    // The other cards went to the bottom: the sixth card of each library is now on top.
    expect(g.state.objects[g.state.players.p1.library[0]!]!.defId).toBe('island');
    expect(g.state.players.p1.library).toHaveLength(4);
  });
});

describe('artifacts and lands', () => {
  it('Access Tunnel makes a creature with power 3 or less unblockable', () => {
    const g = game({
      p1: {
        battlefield: [
          'access-tunnel',
          'bear-cub',
          'serra-angel',
          'mountain',
          'mountain',
          'mountain',
        ],
      },
    });
    const bears = g.id('p1', 'bear-cub');
    const angel = g.id('p1', 'serra-angel');
    // Serra Angel has power 4: not a legal target.
    expect(
      g
        .legal()
        .some((a) => a.type === 'activateAbility' && JSON.stringify(a.targets).includes(angel)),
    ).toBe(false);
    activate(g, g.id('p1', 'access-tunnel'), 1, bears);
    drive(g);
    expect(getCharacteristics(g.state, cardDb, bears).cantBeBlocked).toBe(true);
  });

  it('Archway Commons enters tapped and is sacrificed unless you pay {1}', () => {
    const play = (pay: boolean) => {
      const g = game({ p1: { hand: ['archway-commons'], battlefield: ['mountain'] } });
      g.do(g.legal().find((a) => a.type === 'playLand')!);
      drive(g, (_g, legal) =>
        pay ? yes(legal) : legal.find((a) => a.type === 'chooseEffect' && !a.accept),
      );
      return g;
    };
    const paid = play(true);
    expect(named(paid, 'archway-commons')).toHaveLength(1);
    expect(paid.obj(paid.id('p1', 'archway-commons')).tapped).toBe(true);
    expect(paid.obj(paid.id('p1', 'mountain')).tapped).toBe(true);
    const unpaid = play(false);
    expect(named(unpaid, 'archway-commons')).toHaveLength(0);
  });

  it('Archway Commons is sacrificed when you cannot pay', () => {
    const g = game({ p1: { hand: ['archway-commons'] } });
    g.do(g.legal().find((a) => a.type === 'playLand')!);
    drive(g);
    expect(named(g, 'archway-commons')).toHaveLength(0);
  });

  it('Hall of Oracles puts a counter on a creature after you cast an instant or sorcery', () => {
    const g = game({
      p1: { hand: ['shock'], battlefield: ['hall-of-oracles', 'bear-cub', 'mountain'] },
    });
    const hall = g.id('p1', 'hall-of-oracles');
    const bears = g.id('p1', 'bear-cub');
    expect(
      g
        .legal()
        .some((a) => a.type === 'activateAbility' && a.source === hall && a.abilityIndex === 2),
    ).toBe(false);
    cast(g, 'shock', [{ player: 'p2' }]);
    drive(g);
    activate(g, hall, 2, bears);
    drive(g);
    expect(pt(g, bears)).toEqual([3, 3]);
  });

  it('Letter of Acceptance taps for any colour and cycles itself for {2}', () => {
    const g = game({
      p1: {
        battlefield: ['letter-of-acceptance', 'mountain', 'mountain'],
        library: ['shock', 'forest'],
      },
    });
    const letter = g.id('p1', 'letter-of-acceptance');
    activate(
      g,
      letter,
      g.legal().filter((a) => a.type === 'activateAbility' && a.source === letter).length ? 5 : 5,
    );
    drive(g);
    expect(hand(g)).toHaveLength(1);
    expect(g.zoneOf(letter)).toBe('graveyard');
  });

  it('Spell Satchel collects a book counter from magecraft', () => {
    const g = game({
      p1: { hand: ['shock'], battlefield: ['spell-satchel', 'mountain'] },
    });
    const satchel = g.id('p1', 'spell-satchel');
    cast(g, 'shock', [{ player: 'p2' }]);
    drive(g);
    expect(g.obj(satchel).counters?.book).toBe(1);
  });

  it('Spell Satchel taps for {C} by removing a book counter, and draws with three', () => {
    // {7}: six Mountains and the Satchel (with a counter) are exactly enough.
    const g = game({
      p1: { hand: ['mascot-exhibition'], battlefield: ['spell-satchel', ...n('mountain', 6)] },
    });
    const satchel = g.id('p1', 'spell-satchel');
    expect(g.legal().some((a) => a.type === 'castSpell')).toBe(false);
    (g.state.objects[satchel] as { counters?: Record<string, number> }).counters = { book: 1 };
    cast(g, 'mascot-exhibition');
    drive(g);
    expect(g.obj(satchel).counters?.book).toBe(1);
    expect(named(g, 'stx-inkling-token')).toHaveLength(1);
    // Three counters and {3}: draw a card.
    const h = game({
      p1: { battlefield: ['spell-satchel', ...n('mountain', 3)], library: ['shock', 'forest'] },
    });
    const s2 = h.id('p1', 'spell-satchel');
    (h.state.objects[s2] as { counters?: Record<string, number> }).counters = { book: 3 };
    activate(h, s2, 2);
    drive(h);
    expect(hand(h)).toHaveLength(1);
    expect(h.obj(s2).counters?.book).toBe(0);
  });

  it('Strixhaven Stadium counts points and wins the game at ten', () => {
    const g = game({
      p1: { battlefield: ['strixhaven-stadium', 'bear-cub'] },
    });
    const stadium = g.id('p1', 'strixhaven-stadium');
    (g.state.objects[stadium] as { counters?: Record<string, number> }).counters = { point: 9 };
    toAttack(g);
    g.attack(g.id('p1', 'bear-cub'));
    for (let i = 0; i < 20 && g.decision.kind !== 'gameOver'; i++) {
      if (g.decision.kind === 'declareBlockers')
        g.do({ type: 'confirmBlockers', player: g.decision.player });
      else g.pass();
    }
    expect(g.decision.kind).toBe('gameOver');
    expect(g.state.players.p2.lost).toBe(true);
  });

  it('Strixhaven Stadium gains a point from tapping for mana and loses one when you take combat damage', () => {
    const g = game({
      active: 'p2',
      p1: { battlefield: ['strixhaven-stadium'] },
      p2: { battlefield: ['bear-cub'] },
    });
    const stadium = g.id('p1', 'strixhaven-stadium');
    (g.state.objects[stadium] as { counters?: Record<string, number> }).counters = { point: 2 };
    toAttack(g);
    g.attack(g.id('p2', 'bear-cub'));
    g.passUntilStep('endCombat');
    drive(g);
    expect(g.obj(stadium).counters?.point).toBe(1);
  });

  it('The Biblioplex needs zero or seven cards in hand, and can take an instant or sorcery', () => {
    const mk = (cards: string[]) =>
      game({
        p1: {
          hand: cards,
          battlefield: ['the-biblioplex', 'mountain', 'mountain'],
          library: ['shock', 'forest'],
        },
      });
    const biblio = (g: GameDriver) => g.id('p1', 'the-biblioplex');
    const ok = (g: GameDriver) =>
      g
        .legal()
        .some(
          (a) => a.type === 'activateAbility' && a.source === biblio(g) && a.abilityIndex === 1,
        );
    expect(ok(mk(['forest']))).toBe(false);
    expect(ok(mk([]))).toBe(true);
    expect(ok(mk(n('forest', 7)))).toBe(true);
    expect(ok(mk(n('forest', 8)))).toBe(false);
    const g = mk([]);
    activate(g, biblio(g), 1);
    drive(g, (_g, legal) => legal.find((a) => a.type === 'chooseCard' && a.card));
    expect(hand(g).map((id) => g.obj(id).defId)).toEqual(['shock']);
  });

  it('The Biblioplex may put the card into the graveyard instead', () => {
    const g = game({
      p1: { battlefield: ['the-biblioplex', 'mountain', 'mountain'], library: ['forest', 'shock'] },
    });
    activate(g, g.id('p1', 'the-biblioplex'), 1);
    drive(g, (_g, legal) => yes(legal));
    expect(g.state.players.p1.graveyard.map((id) => g.obj(id).defId)).toEqual(['forest']);
    expect(hand(g)).toHaveLength(0);
  });
});
