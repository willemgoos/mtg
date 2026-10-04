import { getCharacteristics } from '@mtg/engine';
import { describe, expect, it } from 'vitest';
import { cardDb, slug } from '../src/index.ts';
import { all, cast, game, handSize, n, pt, settle } from './blb-helpers.ts';

// Marvel Super Heroes Jumpstart packet: Wild.

const PACKET = [
  'Hellcat, Undying Vigilante',
  'White Tiger, Amulet Keeper',
  'The Fabulous Frog-Man',
  'Gert and Old Lace, Runaways',
  'Mole Man, Moloid Master',
  'Hit-Monkey',
  'Ka-Zar of the Savage Land',
  'Claim the Kingdom',
  'Accelerated Evolution',
  'Restorative Technique',
  'Colossal Collision',
  'Terramorphic Expanse',
  'Thriving Grove',
  'Forest',
];

type G = ReturnType<typeof game>;

const keywords = (g: G, id: string) => [...getCharacteristics(g.state, cardDb, id).keywords];

describe('Wild packet', () => {
  it('has every card implemented', () => {
    expect(PACKET.filter((name) => !cardDb.has(slug(name)))).toEqual([]);
  });
});

describe('White Tiger, Amulet Keeper', () => {
  it('exiles itself from the graveyard to draw and put a land from hand onto the battlefield', () => {
    const g = game({
      p1: {
        battlefield: n('forest', 4),
        graveyard: ['white-tiger-amulet-keeper'],
        hand: ['mountain'],
        library: ['island', 'plains'],
      },
    });
    const tiger = g.id('p1', 'white-tiger-amulet-keeper', 'graveyard');
    g.do({ type: 'activateAbility', player: 'p1', source: tiger, abilityIndex: 0, targets: [] });
    settle(g);
    expect(g.decision.kind).toBe('searchLibrary');
    const legal = g.legal();
    // Declining is allowed ("you may").
    expect(legal.some((a) => a.type === 'chooseCard' && a.card === null)).toBe(true);
    const mountain = g.id('p1', 'mountain', 'hand');
    g.do({ type: 'chooseCard', player: 'p1', card: mountain });
    settle(g);
    expect(g.state.battlefield).toContain(mountain);
    expect(g.state.players.p1.exile).toEqual([tiger]);
    expect(handSize(g, 'p1')).toBe(1);
  });

  it('is not activatable from the battlefield', () => {
    const g = game({ p1: { battlefield: ['white-tiger-amulet-keeper', ...n('forest', 4)] } });
    const tiger = g.id('p1', 'white-tiger-amulet-keeper');
    expect(g.legal().some((a) => a.type === 'activateAbility' && a.source === tiger)).toBe(false);
  });
});

describe('The Fabulous Frog-Man', () => {
  it('is a 3/3 with reach', () => {
    const g = game({ p1: { battlefield: ['the-fabulous-frog-man'] } });
    const frog = g.id('p1', 'the-fabulous-frog-man');
    expect(pt(g, frog)).toEqual([3, 3]);
    expect(keywords(g, frog)).toContain('reach');
  });
});

describe('Gert and Old Lace, Runaways', () => {
  it('may discard a card to search for a basic land', () => {
    const g = game({
      p1: {
        hand: ['gert-and-old-lace-runaways', 'bear-cub'],
        battlefield: n('forest', 3),
        library: ['island', 'mountain', 'island'],
      },
    });
    settle(cast(g, 'gert-and-old-lace-runaways'));
    expect(g.decision.kind).toBe('optionalEffect');
    g.do({ type: 'chooseEffect', player: 'p1', accept: true });
    expect(g.decision.kind).toBe('discard');
    g.do({ type: 'discard', player: 'p1', card: g.id('p1', 'bear-cub', 'hand') });
    expect(g.decision.kind).toBe('searchLibrary');
    g.do({ type: 'chooseCard', player: 'p1', card: g.id('p1', 'mountain', 'library') });
    settle(g);
    expect(g.state.players.p1.graveyard).toEqual([g.id('p1', 'bear-cub', 'graveyard')]);
    expect(g.state.players.p1.hand.map((id) => g.obj(id).defId)).toEqual(['mountain']);
    expect(keywords(g, g.id('p1', 'gert-and-old-lace-runaways'))).toContain('trample');
  });

  it('does nothing when declined', () => {
    const g = game({
      p1: {
        hand: ['gert-and-old-lace-runaways', 'bear-cub'],
        battlefield: n('forest', 3),
        library: ['island'],
      },
    });
    settle(cast(g, 'gert-and-old-lace-runaways'));
    g.do({ type: 'chooseEffect', player: 'p1', accept: false });
    settle(g);
    expect(handSize(g, 'p1')).toBe(1);
    expect(g.state.players.p1.library).toHaveLength(1);
  });
});

describe('Hit-Monkey', () => {
  it("has its five keywords and can't be countered", () => {
    const g = game({ p1: { battlefield: ['hit-monkey'] } });
    expect(keywords(g, g.id('p1', 'hit-monkey'))).toEqual(
      expect.arrayContaining(['reach', 'vigilance', 'deathtouch', 'hexproof', 'haste']),
    );
    expect(cardDb.get('hit-monkey')!.uncounterable).toBe(true);
  });
});

describe('Ka-Zar of the Savage Land', () => {
  it('creates Zabu, which grows with landfall', () => {
    const g = game({
      p1: { hand: ['ka-zar-of-the-savage-land', 'forest'], battlefield: n('forest', 5) },
    });
    settle(cast(g, 'ka-zar-of-the-savage-land'));
    const [zabu] = all(g, 'zabu-token');
    expect(zabu).toBeDefined();
    expect(pt(g, zabu!)).toEqual([2, 2]);
    g.do({ type: 'playLand', player: 'p1', card: g.id('p1', 'forest', 'hand') });
    settle(g);
    expect(pt(g, zabu!)).toEqual([3, 3]);
  });

  it('plays lands from the top of the library, but not other cards', () => {
    const g = game({
      p1: { battlefield: ['ka-zar-of-the-savage-land', ...n('forest', 2)], library: ['forest'] },
    });
    const top = g.state.players.p1.library[0]!;
    expect(g.legal().some((a) => a.type === 'playLand' && a.card === top)).toBe(true);

    const g2 = game({
      p1: { battlefield: ['ka-zar-of-the-savage-land', ...n('forest', 2)], library: ['bear-cub'] },
    });
    const bear = g2.state.players.p1.library[0]!;
    expect(g2.legal().some((a) => a.type === 'castSpell' && a.card === bear)).toBe(false);
  });
});

describe('Accelerated Evolution', () => {
  it('gives +2/+2 and hexproof until end of turn, at instant speed', () => {
    const g = game({
      step: 'beginCombat',
      p1: { hand: ['accelerated-evolution'], battlefield: ['bear-cub', ...n('forest', 3)] },
    });
    const bear = g.id('p1', 'bear-cub');
    settle(cast(g, 'accelerated-evolution', [g.ref(bear)]));
    expect(pt(g, bear)).toEqual([4, 4]);
    expect(keywords(g, bear)).toContain('hexproof');
    g.passUntilStep('end');
    g.passUntilStep('main1');
    expect(pt(g, bear)).toEqual([4, 4]);
    expect(keywords(g, bear)).not.toContain('hexproof');
  });

  it("can't enchant an opponent's creature", () => {
    const g = game({
      p1: { hand: ['accelerated-evolution'], battlefield: n('forest', 3) },
      p2: { battlefield: ['bear-cub'] },
    });
    expect(
      g
        .legal()
        .some((a) => a.type === 'castSpell' && g.obj(a.card).defId === 'accelerated-evolution'),
    ).toBe(false);
  });
});
