import { type Action, getCharacteristics } from '@mtg/engine';
import { describe, expect, it } from 'vitest';
import { cardDb, slug } from '../src/index.ts';
import { cast, game, n, pt, settle } from './blb-helpers.ts';
import packets from '../scripts/data/marvel-jumpstart-lists.json';

const CHASE = slug('Chase Stein, Runaway');
const ALEX = slug('Alex Wilder, Runaway');
const MOLLY = slug('Molly Hayes, Runaway');
const KAROLINA = slug('Karolina Dean, Runaway');
const NICO = slug('Nico Minoru, Runaway');
type G = ReturnType<typeof game>;
const casts = (g: G, name: string) =>
  g
    .legal()
    .filter(
      (a): a is Extract<Action, { type: 'castSpell' }> =>
        a.type === 'castSpell' && g.obj(a.card).defId === name,
    );
const activate = (g: G, name: string) => {
  const a = g.legal().find((a) => a.type === 'activateAbility' && g.obj(a.source).defId === name);
  expect(a).toBeDefined();
  g.do(a!);
  return settle(g);
};
const escape = (g: G) => {
  g.do(casts(g, ALEX)[0]!);
  for (let i = 0; i < 3 && g.decision.kind === 'forageExile'; i++)
    g.do(g.legal().find((a) => a.type === 'chooseCard')!);
  return settle(g);
};
const haste = (g: G, id: string) => getCharacteristics(g.state, cardDb, id).keywords.has('haste');

describe('Runaways packet', () => {
  it('implements the complete official packet', () => {
    expect(
      packets
        .find((p) => p.name === 'Runaways')!
        .cards.filter(([name]) => !cardDb.has(slug(name as string))),
    ).toEqual([]);
  });
});

describe('Chase Stein', () => {
  it('taps and discards the selected card as costs, then grants next-turn play permission, including lands', () => {
    const g = game({
      p1: { battlefield: [CHASE], hand: ['shock', 'bear-cub'], library: ['mountain', 'forest'] },
    });
    const discard = g.id('p1', 'bear-cub', 'hand');
    const a = g
      .legal()
      .find(
        (a) =>
          a.type === 'activateAbility' && a.source === g.id('p1', CHASE) && a.discard === discard,
      )!;
    g.do(a);
    expect(g.obj(discard).zone).toBe('graveyard');
    expect(g.obj(g.id('p1', CHASE)).tapped).toBe(true);
    settle(g);
    const card = g.state.players.p1.exile[0]!;
    expect(g.obj(card).playableUntilTurn).toBe(g.state.turn.number + 2);
    const land = g.legal().find((a) => a.type === 'playLand' && a.card === card);
    expect(land).toBeDefined();
    g.do(land!);
    expect(g.obj(card).zone).toBe('battlefield');
  });
  it('requires an untapped nonsick source and a card to discard', () => {
    for (const battlefield of [
      [CHASE],
      [{ card: CHASE, sick: true }],
      [{ card: CHASE, tapped: true }],
    ]) {
      const g = game({ p1: { battlefield, hand: battlefield[0] === CHASE ? [] : ['shock'] } });
      expect(g.legal().filter((a) => a.type === 'activateAbility')).toEqual([]);
    }
  });
});

describe('Alex Wilder', () => {
  it('escapes for three mana and three freely selected OTHER graveyard cards, then buffs himself', () => {
    const g = game({
      p1: {
        battlefield: n('mountain', 3),
        graveyard: [ALEX, 'shock', 'bear-cub', 'forest', 'mountain'],
      },
    });
    const alex = g.id('p1', ALEX, 'graveyard');
    const keep = g.id('p1', 'shock', 'graveyard');
    g.do(casts(g, ALEX)[0]!);
    for (let i = 0; i < 3; i++) {
      expect(g.decision.kind).toBe('forageExile');
      expect(
        g
          .legal()
          .filter((a) => a.type === 'chooseCard')
          .some((a) => a.type === 'chooseCard' && a.card === alex),
      ).toBe(false);
      g.do(g.legal().find((a) => a.type === 'chooseCard' && a.card !== keep)!);
    }
    settle(g);
    expect(g.obj(keep).zone).toBe('graveyard');
    expect(pt(g, alex)).toEqual([3, 3]);
    expect(haste(g, alex)).toBe(true);
    g.passUntilStep('end');
    for (let i = 0; i < 20 && g.state.turn.activePlayer === 'p1'; i++) g.pass();
    expect(pt(g, alex)).toEqual([1, 3]);
    expect(haste(g, alex)).toBe(false);
  });
  it('cannot escape with too few cards and does not buff a hand cast', () => {
    const g = game({ p1: { battlefield: n('mountain', 3), graveyard: [ALEX, 'shock', 'forest'] } });
    expect(casts(g, ALEX)).toHaveLength(0);
    const h = game({ p1: { battlefield: n('mountain', 2), hand: [ALEX] } });
    settle(cast(h, ALEX));
    expect(pt(h, h.id('p1', ALEX))).toEqual([1, 3]);
    expect(haste(h, h.id('p1', ALEX))).toBe(false);
  });
  it('buffs another creature cast from exile; blink and reanimation do not qualify', () => {
    const g = game({
      p1: {
        battlefield: [ALEX, NICO, ...n('mountain', 3), 'island'],
        hand: ['shock', 'splash-portal'],
        library: ['bear-cub'],
      },
    });
    activate(g, NICO);
    g.do(casts(g, 'bear-cub')[0]!);
    settle(g);
    const bear = g.id('p1', 'bear-cub');
    expect(pt(g, bear)).toEqual([4, 2]);
    settle(cast(g, 'splash-portal', [g.ref(bear)]));
    expect(pt(g, bear)).toEqual([2, 2]);
    expect(haste(g, bear)).toBe(false);
    const h = game({
      p1: { battlefield: [ALEX, ...n('swamp', 5)], hand: ['zombify'], graveyard: ['bear-cub'] },
    });
    settle(cast(h, 'zombify', [h.ref(h.id('p1', 'bear-cub', 'graveyard'))]));
    expect(pt(h, h.id('p1', 'bear-cub'))).toEqual([2, 2]);
  });
  it('an escaped Alex countered by a spell goes to graveyard rather than exile', () => {
    const g = game({
      p1: { battlefield: n('mountain', 3), graveyard: [ALEX, 'shock', 'forest', 'mountain'] },
      p2: { battlefield: n('island', 3), hand: ['cancel'] },
    });
    const alex = g.id('p1', ALEX, 'graveyard');
    g.do(casts(g, ALEX)[0]!);
    for (let i = 0; i < 3 && g.decision.kind === 'forageExile'; i++)
      g.do(g.legal().find((a) => a.type === 'chooseCard')!);
    g.pass();
    settle(cast(g, 'cancel', [g.ref(alex)]));
    expect(g.obj(alex).zone).toBe('graveyard');
  });
});

describe('Molly Hayes', () => {
  it('power-up costs six, adds two counters, exiles a playable card and can only be activated once', () => {
    const g = game({ p1: { battlefield: [MOLLY, ...n('mountain', 12)], library: ['shock'] } });
    activate(g, MOLLY);
    expect(pt(g, g.id('p1', MOLLY))).toEqual([5, 5]);
    expect(g.obj(g.state.players.p1.exile[0]!).playableUntilTurn).toBe(g.state.turn.number + 2);
    expect(
      g.legal().some((a) => a.type === 'activateAbility' && a.source === g.id('p1', MOLLY)),
    ).toBe(false);
  });
  it('discounts the power-up by her mana cost when she entered this turn', () => {
    const g = game({ p1: { hand: [MOLLY], battlefield: n('mountain', 6), library: ['shock'] } });
    settle(cast(g, MOLLY));
    activate(g, MOLLY);
    expect(pt(g, g.id('p1', MOLLY))).toEqual([5, 5]);
  });
});

describe('Karolina Dean', () => {
  const setup = () => {
    const g = game({
      step: 'upkeep',
      p1: {
        battlefield: [KAROLINA, CHASE],
        hand: ['shock', 'bear-cub'],
        library: ['forest', 'shock'],
      },
    });
    g.passUntilStep('main1');
    settle(g);
    return g;
  };
  it('flies and adds precisely WUBRG at only your first main; none can cast hand spells', () => {
    const g = setup();
    expect(getCharacteristics(g.state, cardDb, g.id('p1', KAROLINA)).keywords).toContain('flying');
    expect(g.state.players.p1.pool?.map((p) => p.produces)).toEqual([
      ['W'],
      ['U'],
      ['B'],
      ['R'],
      ['G'],
    ]);
    expect(casts(g, 'shock')).toEqual([]);
    expect(casts(g, 'bear-cub')).toEqual([]);
    g.passUntilStep('main2');
    settle(g);
    expect(g.state.players.p1.pool?.length ?? 0).toBe(0);
  });
  it('spends ordinary pool mana on hand spells and retains restricted mana for spells from exile', () => {
    const g = setup();
    g.state.players.p1.pool!.push({ produces: ['R'] });
    g.do(casts(g, 'shock').find((a) => a.targets.some((t) => 'player' in t && t.player === 'p2'))!);
    settle(g);
    expect(g.state.players.p1.pool).toHaveLength(5);
    activate(g, CHASE);
    const a = casts(g, 'shock')[0]!;
    expect(a).toBeDefined();
    g.do(a);
    settle(g);
    expect(g.state.players.p1.pool).toHaveLength(4);
  });
  it('can spend the mana on activated abilities', () => {
    const g = game({
      step: 'upkeep',
      p1: { battlefield: [KAROLINA, NICO], hand: ['shock'], library: ['forest', 'bear-cub'] },
    });
    g.passUntilStep('main1');
    settle(g);
    activate(g, NICO);
    expect(g.decision.kind).toBe('castFree');
    expect(g.state.players.p1.pool).toHaveLength(2);
  });
});

describe('Nico Minoru', () => {
  const setup = (library: string[], hand = ['shock']) =>
    game({
      p1: { battlefield: [NICO, ...n('mountain', 3)], hand, library },
      p2: { battlefield: ['bear-cub'] },
    });
  it('exiles all lands through the first nonland, optionally casts it free during resolution, and deals two', () => {
    const g = setup(['forest', 'mountain', 'bear-cub']);
    activate(g, NICO);
    expect(g.state.players.p1.exile).toHaveLength(3);
    expect(g.state.players.p1.hand).toHaveLength(0);
    const a = casts(g, 'bear-cub')[0]!;
    expect(a).toBeDefined();
    g.do(a);
    settle(g);
    expect(g.state.players.p2.life).toBe(18);
    expect(g.id('p1', 'bear-cub')).toBeDefined();
    expect(g.state.players.p1.exile).toHaveLength(2);
  });
  it('allows declining and leaves the nonland and preceding lands exiled', () => {
    const g = setup(['forest', 'bear-cub']);
    activate(g, NICO);
    g.do({ type: 'chooseEffect', player: 'p1', accept: false });
    settle(g);
    expect(g.state.players.p1.exile).toHaveLength(2);
    expect(g.state.players.p2.life).toBe(20);
    expect(casts(g, 'bear-cub')).toEqual([]);
  });
  it('handles an all-land or empty library without another discard or a cast decision', () => {
    for (const library of [[], ['forest', 'mountain']]) {
      const g = setup(library);
      activate(g, NICO);
      expect(g.decision.kind).toBe('priority');
      expect(g.state.players.p1.library).toHaveLength(0);
    }
  });
  it('does not trigger for spells from hand, but does for escape', () => {
    const g = game({
      p1: {
        battlefield: [NICO, ...n('mountain', 4)],
        hand: ['shock'],
        graveyard: [ALEX, 'forest', 'mountain', 'bear-cub'],
      },
    });
    settle(cast(g, 'shock', [{ player: 'p2' }]));
    expect(g.state.players.p2.life).toBe(18);
    escape(g);
    expect(g.state.players.p2.life).toBe(16);
  });
  it('casts X as zero and retains paid kicker choices', () => {
    const x = setup(['crackle-with-power']);
    activate(x, NICO);
    expect(casts(x, 'crackle-with-power').every((a) => (a.x ?? 0) === 0)).toBe(true);
    const g = setup(['burst-lightning']);
    activate(g, NICO);
    expect(casts(g, 'burst-lightning').some((a) => a.kicked)).toBe(false);
  });
  it('requires and pays additional sacrifice costs when casting free', () => {
    const g = setup(['eaten-alive']);
    activate(g, NICO);
    const a = casts(g, 'eaten-alive').find((a) => a.sacrifice === g.id('p1', NICO));
    expect(a).toBeDefined();
    g.do(a!);
    settle(g);
    expect(g.state.players.p1.graveyard.some((id) => g.obj(id).defId === NICO)).toBe(true);
  });
});

describe('Runaways exact casting edge cases', () => {
  it('Nico retains affordable kicker payments and excludes alternative costs', () => {
    const g = game({
      p1: {
        battlefield: [NICO, ...n('mountain', 7)],
        hand: ['shock'],
        library: ['burst-lightning'],
      },
    });
    activate(g, NICO);
    const a = casts(g, 'burst-lightning').find(
      (a) => a.kicked && a.targets.some((t) => 'player' in t && t.player === 'p2'),
    );
    expect(a).toBeDefined();
    g.do(a!);
    settle(g);
    expect(g.state.players.p2.life).toBe(14);
    expect(
      g.state.battlefield.filter((id) => g.obj(id).defId === 'mountain' && g.obj(id).tapped),
    ).toHaveLength(7);
    const h = game({
      p1: {
        battlefield: [NICO, ...n('mountain', 6), 'island'],
        hand: ['shock'],
        library: ['ingenious-mastery'],
      },
    });
    activate(h, NICO);
    expect(casts(h, 'ingenious-mastery').some((a) => a.kicked)).toBe(false);
    expect(casts(h, 'ingenious-mastery').length).toBeGreaterThan(0);
  });
  it('requires forage resources or the extra black payment, then resumes after sequential payment', () => {
    const g = game({
      p1: {
        battlefield: [NICO, ...n('mountain', 3)],
        hand: ['shock'],
        library: ['feed-the-cycle'],
      },
      p2: { battlefield: ['bear-cub'] },
    });
    activate(g, NICO);
    expect(casts(g, 'feed-the-cycle')).toEqual([]);
    const h = game({
      p1: {
        battlefield: [NICO, ...n('mountain', 3)],
        hand: ['shock'],
        library: ['feed-the-cycle'],
        graveyard: ['forest', 'mountain', 'island', 'plains'],
      },
      p2: { battlefield: ['bear-cub'] },
    });
    activate(h, NICO);
    const bear = h.id('p2', 'bear-cub');
    const a = casts(h, 'feed-the-cycle').find(
      (a) =>
        a.forage === 'graveyard' && a.targets.some((t) => 'object' in t && t.object.id === bear),
    );
    expect(a).toBeDefined();
    h.do(a!);
    expect(h.decision.kind).toBe('forageExile');
    for (let i = 0; i < 3; i++) h.do(h.legal().find((a) => a.type === 'chooseCard')!);
    settle(h);
    expect(h.obj(bear).zone).toBe('graveyard');
    expect(h.state.players.p2.life).toBe(18);
  });
  it('keeps next-turn play permission through the end step and expires it afterwards', () => {
    const g = game({
      p1: {
        battlefield: [CHASE, ...n('mountain', 3)],
        hand: ['bear-cub'],
        library: ['shock', ...n('forest', 8)],
      },
    });
    activate(g, CHASE);
    const exiled = g.state.players.p1.exile[0]!;
    const expires = g.obj(exiled).playableUntilTurn!;
    for (
      let i = 0;
      i < 100 &&
      !(g.state.turn.number === expires && g.state.turn.step === 'end' && g.actor === 'p1');
      i++
    )
      if (g.decision.kind === 'declareAttackers')
        g.do({ type: 'confirmAttackers', player: g.actor });
      else if (g.decision.kind === 'declareBlockers')
        g.do({ type: 'confirmBlockers', player: g.actor });
      else g.pass();
    expect(g.state.turn.number).toBe(expires);
    expect(casts(g, 'shock').some((a) => a.card === exiled)).toBe(true);
    for (let i = 0; i < 20 && g.state.turn.number === expires; i++) g.pass();
    expect(casts(g, 'shock').some((a) => a.card === exiled)).toBe(false);
  });
  it('does not trigger either cast watcher for the opponent', () => {
    const g = game({
      active: 'p2',
      p1: { battlefield: [ALEX, NICO] },
      p2: { battlefield: n('mountain', 3), graveyard: [ALEX, 'forest', 'mountain', 'island'] },
    });
    escape(g);
    expect(g.state.players.p2.life).toBe(20);
    expect(g.state.players.p1.life).toBe(20);
    expect(g.state.stack).toHaveLength(0);
  });
});

describe('Runaways casting provenance and completion', () => {
  it('emits the cast event and queues Nico only after every escape cost is paid', () => {
    const g = game({
      p1: {
        battlefield: [NICO, ...n('mountain', 3)],
        graveyard: [ALEX, 'forest', 'island', 'plains', 'swamp'],
      },
    });
    const alex = g.id('p1', ALEX, 'graveyard');
    g.do(casts(g, ALEX)[0]!);
    expect(g.events.some((e) => e.type === 'spellCast')).toBe(false);
    for (let i = 0; i < 2; i++) {
      g.do(g.legal().find((a) => a.type === 'chooseCard')!);
      expect(g.events.some((e) => e.type === 'spellCast')).toBe(false);
      expect(g.state.pendingTriggers.some((t) => t.sourceDefId === NICO)).toBe(false);
    }
    g.do(g.legal().find((a) => a.type === 'chooseCard')!);
    const castIndex = g.events.findIndex((e) => e.type === 'spellCast' && e.id === alex);
    const costEvents = g.events.filter(
      (e) => e.type === 'objectMoved' && e.from === 'graveyard' && e.to === 'exile',
    );
    expect(costEvents).toHaveLength(3);
    expect(costEvents.every((e) => g.events.indexOf(e) < castIndex)).toBe(true);
    settle(g);
    expect(g.state.players.p2.life).toBe(18);
  });
  it('does not credit you for a creature spell originally cast by another player', () => {
    const g = game({
      active: 'p2',
      p1: { battlefield: [ALEX] },
      p2: { battlefield: [NICO, ...n('mountain', 3)], hand: ['shock'], library: ['bear-cub'] },
    });
    activate(g, NICO);
    g.do(casts(g, 'bear-cub')[0]!);
    const spell = g.state.stack.find(
      (s) => s.kind === 'spell' && g.obj(s.id).defId === 'bear-cub',
    )!;
    expect(spell.kind === 'spell' && spell.castBy).toBe('p2');
    // Model a control-changing effect after casting; original cast provenance stays unchanged.
    spell.controller = 'p1';
    settle(g);
    expect(pt(g, g.id('p1', 'bear-cub'))).toEqual([2, 2]);
  });
});

describe('Nico alternative faces and additional X costs', () => {
  it('offers either castable modal face, but not a transforming back face', () => {
    const g = game({
      p1: {
        battlefield: [NICO, ...n('mountain', 3)],
        hand: ['shock'],
        library: ['shaile-dean-of-radiance'],
      },
    });
    activate(g, NICO);
    expect(casts(g, 'shaile-dean-of-radiance').some((a) => !a.back)).toBe(true);
    const back = casts(g, 'shaile-dean-of-radiance').find((a) => a.back)!;
    expect(back).toBeDefined();
    g.do(back);
    settle(g);
    expect(g.id('p1', 'embrose-dean-of-shadow')).toBeDefined();
    const h = game({
      p1: {
        battlefield: [NICO, ...n('mountain', 3)],
        hand: ['shock'],
        library: ['twinblade-geist'],
      },
    });
    activate(h, NICO);
    expect(casts(h, 'twinblade-geist').some((a) => a.back)).toBe(false);
  });
  it('can pay a non-mana X additional cost while the printed mana cost is waived', () => {
    const g = game({
      p1: { battlefield: [NICO, ...n('mountain', 3)], hand: ['shock'], library: ['toxic-deluge'] },
    });
    activate(g, NICO);
    const a = casts(g, 'toxic-deluge').find((a) => a.x === 2)!;
    expect(a).toBeDefined();
    g.do(a);
    settle(g);
    expect(g.state.players.p1.life).toBe(18);
    expect(g.state.players.p2.life).toBe(18);
  });
});
