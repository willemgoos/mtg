import { describe, expect, it } from 'vitest';
import { cardDb } from '../src/index.ts';
import { all, cast, game, n, pt, settle } from './blb-helpers.ts';
import {
  abilityIndex,
  activate,
  bf,
  casts,
  counters,
  done,
  exile,
  gy,
  hand,
  keywords,
  toStep,
} from './tdm-green-helpers.ts';

// Tarkir: Dragonstorm 19b: green cards, part 2.

describe("Dragonbroods' Relic", () => {
  it('taps with an untapped creature for one mana of any color', () => {
    const g = game({
      p1: { hand: ['serra-angel'], battlefield: ['dragonbroods-relic', 'bear-cub', ...n('plains', 3)] },
    });
    // {3}{W}{W} for Serra needs 5 mana: three Plains plus the Relic (tapping the Bear) is only four; check the Relic's mana alone.
    const relic = g.id('p1', 'dragonbroods-relic');
    const bear = g.id('p1', 'bear-cub');
    const idx = abilityIndex('dragonbroods-relic', 'activated', 0);
    activate(g, relic, idx, []);
    expect(g.obj(relic).tapped).toBe(true);
    expect(g.obj(bear).tapped).toBe(true);
    expect(g.state.stack).toHaveLength(0); // a mana ability: no stack
    expect(g.state.players.p1.pool?.length ?? 0).toBeGreaterThan(0);
  });
  it('cannot be activated without an untapped creature to tap', () => {
    const g = game({ p1: { battlefield: ['dragonbroods-relic', { card: 'bear-cub', tapped: true }] } });
    const relic = g.id('p1', 'dragonbroods-relic');
    expect(
      g.legal().some((a) => a.type === 'activateAbility' && a.source === relic && a.abilityIndex === 0),
    ).toBe(false);
  });
  it('makes a 4/4 flying lifelink Reliquary Dragon that deals 3 damage to any target', () => {
    const g = game({
      p1: {
        battlefield: [
          'dragonbroods-relic',
          'plains',
          'island',
          'swamp',
          'mountain',
          'forest',
          'forest',
          'forest',
          'forest',
        ],
      },
    });
    const relic = g.id('p1', 'dragonbroods-relic');
    activate(g, relic, abilityIndex('dragonbroods-relic', 'activated', 1));
    settle(g, (legal) =>
      legal.find((a) => a.type === 'chooseTargets' && JSON.stringify(a.targets).includes('"p2"')),
    );
    done(g);
    const dragons = all(g, 'tdm-green-reliquary-dragon-token');
    expect(dragons).toHaveLength(1);
    const d = dragons[0]!;
    expect(pt(g, d)).toEqual([4, 4]);
    expect(keywords(g, d)).toEqual(expect.arrayContaining(['flying', 'lifelink']));
    expect(g.life('p2')).toBe(17);
    expect(g.zoneOf(relic)).toBe('graveyard');
    expect(cardDb.get('tdm-green-reliquary-dragon-token')!.name).toBe('Reliquary Dragon');
    expect([...cardDb.get('tdm-green-reliquary-dragon-token')!.colors].sort()).toEqual(['B', 'G', 'R', 'U', 'W']);
  });
});

describe('Dusyut Earthcarver and Inspirited Vanguard (endure)', () => {
  it('endures 3 when it enters: three counters', () => {
    const g = game({ p1: { hand: ['dusyut-earthcarver'], battlefield: n('forest', 6) } });
    done(cast(g, 'dusyut-earthcarver'), { option: /counters/ });
    expect(pt(g, g.id('p1', 'dusyut-earthcarver'))).toEqual([7, 7]);
  });
  it('endures 3: or a 3/3 Spirit', () => {
    const g = game({ p1: { hand: ['dusyut-earthcarver'], battlefield: n('forest', 6) } });
    done(cast(g, 'dusyut-earthcarver'), { option: /Spirit/ });
    const spirits = all(g, 'tdm-spirit-token');
    expect(spirits).toHaveLength(1);
    expect(pt(g, spirits[0]!)).toEqual([3, 3]);
    expect(pt(g, g.id('p1', 'dusyut-earthcarver'))).toEqual([4, 4]);
  });
  it('Inspirited Vanguard endures 2 when it enters and when it attacks', () => {
    const g = game({ p1: { hand: ['inspirited-vanguard'], battlefield: n('forest', 5) } });
    done(cast(g, 'inspirited-vanguard'), { option: /counters/ });
    const v = g.id('p1', 'inspirited-vanguard');
    expect(pt(g, v)).toEqual([5, 4]);
    const h = game({ p1: { battlefield: ['inspirited-vanguard'] } });
    toStep(h, 'beginCombat');
    h.passBoth();
    h.attack(h.id('p1', 'inspirited-vanguard'));
    done(h, { option: /Spirit/ });
    expect(all(h, 'tdm-spirit-token')).toHaveLength(1);
  });
});

describe('Encroaching Dragonstorm', () => {
  it('searches for up to two basic lands onto the battlefield tapped', () => {
    const g = game({
      p1: {
        hand: ['encroaching-dragonstorm'],
        battlefield: n('forest', 4),
        library: ['island', 'forest', 'bear-cub'],
      },
    });
    done(cast(g, 'encroaching-dragonstorm'), { pick: ['island', 'forest'] });
    expect(bf(g, 'island')).toHaveLength(1);
    expect(g.obj(bf(g, 'island')[0]!).tapped).toBe(true);
    expect(bf(g, 'forest')).toHaveLength(5);
  });
  it('returns to hand when a Dragon you control enters', () => {
    const g = game({
      p1: {
        hand: ['sagu-wildling'],
        battlefield: ['encroaching-dragonstorm', ...n('forest', 5)],
      },
    });
    done(cast(g, 'sagu-wildling'));
    expect(hand(g)).toEqual(['encroaching-dragonstorm']);
    expect(g.life('p1')).toBe(23);
  });
  it('does not return when a creature that is not a Dragon enters', () => {
    const g = game({
      p1: { hand: ['bear-cub'], battlefield: ['encroaching-dragonstorm', ...n('forest', 3)] },
    });
    done(cast(g, 'bear-cub'));
    expect(bf(g, 'encroaching-dragonstorm')).toHaveLength(1);
  });
});

describe('Formation Breaker', () => {
  it('is a 2/1 that gets +1/+2 while you control a creature with a counter on it', () => {
    const g = game({ p1: { battlefield: ['formation-breaker', 'bear-cub'] } });
    const fb = g.id('p1', 'formation-breaker');
    expect(pt(g, fb)).toEqual([2, 1]);
    const h = game({ p1: { battlefield: ['formation-breaker', 'sage-of-the-fang'] } });
    expect(pt(h, h.id('p1', 'formation-breaker'))).toEqual([2, 1]);
    // Sage of the Fang's counter lands on a creature: +1/+2.
    const k = game({
      p1: { hand: ['sage-of-the-fang'], battlefield: ['formation-breaker', 'bear-cub', ...n('forest', 3)] },
    });
    cast(k, 'sage-of-the-fang');
    settle(k, (legal) =>
      legal.find((a) => a.type === 'chooseTargets' && JSON.stringify(a.targets).includes(k.id('p1', 'bear-cub'))),
    );
    done(k);
    expect(pt(k, k.id('p1', 'formation-breaker'))).toEqual([3, 3]);
  });
  it("creatures with power less than its power can't block it", () => {
    const g = game({
      p1: { battlefield: ['formation-breaker'] },
      p2: { battlefield: ['bear-cub', 'dragon-sniper'] },
    });
    toStep(g, 'beginCombat');
    g.passBoth();
    g.attack(g.id('p1', 'formation-breaker'));
    g.passBoth();
    expect(g.decision.kind).toBe('declareBlockers');
    const blockers = g
      .legal('p2')
      .flatMap((a) => (a.type === 'addBlock' ? [a.blocker] : []));
    // Bear Cub (2/2) has power equal to Formation Breaker's: it can block; Dragon Sniper (1/1) can't.
    expect(blockers).toContain(g.id('p2', 'bear-cub'));
    expect(blockers).not.toContain(g.id('p2', 'dragon-sniper'));
  });
});

describe('Herd Heirloom', () => {
  it('taps for one mana of any color, only for creature spells', () => {
    const g = game({
      p1: { hand: ['bear-cub', 'shock'], battlefield: ['herd-heirloom', 'forest'] },
    });
    // Forest + Heirloom pay for a {1}{G} creature spell, but not for an instant.
    expect(casts(g, 'bear-cub').length).toBeGreaterThan(0);
    expect(casts(g, 'shock')).toHaveLength(0);
  });
  it('gives a creature with power 4 or more trample and a draw on combat damage until end of turn', () => {
    const g = game({
      p1: { battlefield: ['herd-heirloom', 'craterhoof-behemoth', 'bear-cub'], library: n('forest', 5) },
    });
    const bear = g.id('p1', 'bear-cub');
    const hoof = g.id('p1', 'craterhoof-behemoth');
    const idx = abilityIndex('herd-heirloom', 'activated', 0);
    const acts = g
      .legal()
      .filter((a) => a.type === 'activateAbility' && a.source === g.id('p1', 'herd-heirloom') && a.abilityIndex === idx);
    // Only the 5/5 (power 4 or greater) is a legal target.
    expect(JSON.stringify(acts)).toContain(hoof);
    expect(JSON.stringify(acts)).not.toContain(bear);
    activate(g, g.id('p1', 'herd-heirloom'), idx, [g.ref(hoof)]);
    done(g);
    expect(keywords(g, hoof)).toContain('trample');
    toStep(g, 'beginCombat');
    g.passBoth();
    g.attack(hoof);
    const before = hand(g).length;
    toStep(g, 'endCombat');
    expect(hand(g).length).toBe(before + 1);
  });
});

describe('Heritage Reclamation', () => {
  it('destroys an artifact', () => {
    const g = game({
      p1: { hand: ['heritage-reclamation'], battlefield: n('forest', 2) },
      p2: { battlefield: ['dragonbroods-relic', 'gardenize'] },
    });
    g.do(casts(g, 'heritage-reclamation').find((a) => a.mode === 0)!);
    done(g);
    expect(gy(g, 'p2')).toEqual(['dragonbroods-relic']);
  });
  it('destroys an enchantment', () => {
    const g = game({
      p1: { hand: ['heritage-reclamation'], battlefield: n('forest', 2) },
      p2: { battlefield: ['dragonbroods-relic', 'gardenize'] },
    });
    g.do(casts(g, 'heritage-reclamation').find((a) => a.mode === 1)!);
    done(g);
    expect(gy(g, 'p2')).toEqual(['gardenize']);
  });
  it('exiles up to one card from a graveyard and draws a card', () => {
    const g = game({
      p1: { hand: ['heritage-reclamation'], battlefield: n('forest', 2), library: n('forest', 3) },
      p2: { graveyard: ['serra-angel'] },
    });
    const acts = casts(g, 'heritage-reclamation').filter((a) => a.mode === 2);
    const withTarget = acts.find((a) => a.targets.length === 1)!;
    expect(acts.some((a) => a.targets.length === 0)).toBe(true);
    g.do(withTarget);
    done(g);
    expect(gy(g, 'p2')).toEqual([]);
    expect(exile(g, 'p2')).toEqual(['serra-angel']);
    expect(hand(g)).toEqual(['forest']);
  });
  it('draws even with no target chosen', () => {
    const g = game({
      p1: { hand: ['heritage-reclamation'], battlefield: n('forest', 2), library: n('forest', 3) },
      p2: { graveyard: ['serra-angel'] },
    });
    g.do(casts(g, 'heritage-reclamation').find((a) => a.mode === 2 && a.targets.length === 0)!);
    done(g);
    expect(gy(g, 'p2')).toEqual(['serra-angel']);
    expect(hand(g)).toEqual(['forest']);
  });
});

describe('Krotiq Nestguard', () => {
  it('has defender, and {2}{G} lets it attack this turn', () => {
    const g = game({ p1: { battlefield: ['krotiq-nestguard', ...n('forest', 3)] } });
    const k = g.id('p1', 'krotiq-nestguard');
    expect(keywords(g, k)).toContain('defender');
    toStep(g, 'beginCombat');
    g.passBoth();
    // Nothing can attack, so there is no declare attackers decision at all.
    expect(g.decision.kind).not.toBe('declareAttackers');
    const h = game({ p1: { battlefield: ['krotiq-nestguard', ...n('forest', 3)] } });
    activate(h, h.id('p1', 'krotiq-nestguard'), abilityIndex('krotiq-nestguard', 'activated'));
    done(h);
    toStep(h, 'beginCombat');
    h.passBoth();
    h.attack(h.id('p1', 'krotiq-nestguard'));
    expect(h.state.combat!.attackers.map((a) => a.id)).toContain(h.id('p1', 'krotiq-nestguard'));
  });
});

describe('Lasyd Prowler', () => {
  it('may mill cards equal to the number of lands you control', () => {
    const g = game({
      p1: { hand: ['lasyd-prowler'], battlefield: n('forest', 4), library: n('forest', 8) },
    });
    done(cast(g, 'lasyd-prowler'), { accept: true });
    expect(gy(g)).toHaveLength(4);
  });
  it('does not mill when you decline', () => {
    const g = game({
      p1: { hand: ['lasyd-prowler'], battlefield: n('forest', 4), library: n('forest', 8) },
    });
    done(cast(g, 'lasyd-prowler'), { accept: false });
    expect(gy(g)).toHaveLength(0);
  });
  it('Renew: puts a +1/+1 counter for each land card in your graveyard', () => {
    const g = game({
      p1: {
        battlefield: ['bear-cub', 'forest', 'forest'],
        graveyard: ['lasyd-prowler', 'forest', 'forest', 'island', 'serra-angel'],
      },
    });
    const bear = g.id('p1', 'bear-cub');
    activate(g, g.id('p1', 'lasyd-prowler', 'graveyard'), abilityIndex('lasyd-prowler', 'activated'), [g.ref(bear)]);
    done(g);
    expect(pt(g, bear)).toEqual([5, 5]);
  });
});

describe("Nature's Rhythm", () => {
  it('searches for a creature with mana value X or less onto the battlefield', () => {
    const g = game({
      p1: {
        hand: ["natures-rhythm"],
        battlefield: n('forest', 6),
        library: ['serra-angel', 'bear-cub', 'craterhoof-behemoth'],
      },
    });
    const c = casts(g, "natures-rhythm").find((a) => a.x === 2)!;
    expect(c).toBeDefined();
    g.do(c);
    done(g, { pick: ['bear-cub'] });
    expect(bf(g, 'bear-cub')).toHaveLength(1);
    expect(bf(g, 'serra-angel')).toHaveLength(0);
  });
  it('cannot find a creature with a greater mana value', () => {
    const g = game({
      p1: {
        hand: ["natures-rhythm"],
        battlefield: n('forest', 6),
        library: ['serra-angel', 'bear-cub'],
      },
    });
    g.do(casts(g, "natures-rhythm").find((a) => a.x === 2)!);
    g.passBoth();
    expect(g.decision.kind).toBe('searchLibrary');
    const picks = g.legal().filter((a) => a.type === 'chooseCard' && a.card);
    expect(picks.map((a) => (a.type === 'chooseCard' ? g.obj(a.card!).defId : ''))).not.toContain('serra-angel');
  });
});

describe('Piercing Exhale', () => {
  const setup = (hand: string[]) =>
    game({
      p1: { hand, battlefield: ['serra-angel', 'bear-cub', ...n('forest', 3)], library: n('forest', 6) },
      p2: { battlefield: ['bear-cub'] },
    });
  it('has your creature deal damage equal to its power to a creature', () => {
    const g = setup(['piercing-exhale']);
    const angel = g.id('p1', 'serra-angel');
    const theirs = g.id('p2', 'bear-cub');
    const act = casts(g, 'piercing-exhale').find(
      (a) =>
        a.targets.length === 2 &&
        JSON.stringify(a.targets[0]).includes(angel) &&
        JSON.stringify(a.targets[1]).includes(theirs) &&
        !a.kicked,
    )!;
    g.do(act);
    done(g);
    expect(gy(g, 'p2')).toEqual(['bear-cub']);
  });
  it('surveils 2 if a Dragon was beheld, and not otherwise', () => {
    const g = setup(['piercing-exhale', 'sagu-wildling']);
    const act = casts(g, 'piercing-exhale').find((a) => a.kicked);
    expect(act).toBeDefined();
    g.do(act!);
    g.passBoth();
    expect(g.decision.kind).toBe('scry');
    expect('surveil' in g.decision && g.decision.surveil).toBe(true);
    expect('cards' in g.decision && g.decision.cards).toHaveLength(2);
    const h = setup(['piercing-exhale', 'sagu-wildling']);
    h.do(casts(h, 'piercing-exhale').find((a) => !a.kicked)!);
    h.passBoth();
    expect(h.decision.kind).toBe('priority');
  });
});

describe('Rainveil Rejuvenator', () => {
  it('may mill three cards when it enters', () => {
    const g = game({
      p1: { hand: ['rainveil-rejuvenator'], battlefield: n('forest', 4), library: n('forest', 6) },
    });
    done(cast(g, 'rainveil-rejuvenator'), { accept: true });
    expect(gy(g)).toHaveLength(3);
  });
  it('taps for {G} equal to its power', () => {
    const g = game({
      p1: { hand: ['craterhoof-behemoth'], battlefield: ['rainveil-rejuvenator', 'forest', 'forest'] },
    });
    // 2 power: two {G} plus two Forests make four; Craterhoof costs eight.
    expect(casts(g, 'craterhoof-behemoth')).toHaveLength(0);
    const h = game({
      p1: { hand: ['sagu-pummeler'], battlefield: ['rainveil-rejuvenator', 'forest', 'forest'] },
    });
    // {3}{G} = 4 mana: Rejuvenator (2) + two Forests.
    expect(casts(h, 'sagu-pummeler').length).toBeGreaterThan(0);
    const k = game({
      p1: { hand: ['sagu-pummeler'], battlefield: ['rainveil-rejuvenator', 'forest'] },
    });
    expect(casts(k, 'sagu-pummeler')).toHaveLength(0);
  });
});

describe("Roamer's Routine", () => {
  it('searches for a basic land onto the battlefield tapped', () => {
    const g = game({
      p1: { hand: ['roamers-routine'], battlefield: n('forest', 3), library: ['island', 'bear-cub'] },
    });
    done(cast(g, 'roamers-routine'), { pick: ['island'] });
    expect(bf(g, 'island')).toHaveLength(1);
    expect(g.obj(bf(g, 'island')[0]!).tapped).toBe(true);
  });
  it('can be cast from the graveyard with harmonize, tapping a creature to pay less, then is exiled', () => {
    const g = game({
      p1: {
        graveyard: ['roamers-routine'],
        battlefield: ['serra-angel', ...n('forest', 1)],
        library: ['island', 'bear-cub'],
      },
    });
    const card = g.id('p1', 'roamers-routine', 'graveyard');
    const options = g.legal().filter((a) => a.type === 'castSpell' && a.card === card);
    // {4}{G} costs five: one Forest plus Serra Angel's power 4 off the generic part.
    const tapping = options.find((a) => (a as { harmonizeTap?: string }).harmonizeTap);
    expect(tapping).toBeDefined();
    g.do(tapping!);
    done(g, { pick: ['island'] });
    expect(g.zoneOf(card)).toBe('exile');
    expect(bf(g, 'island')).toHaveLength(1);
  });
});

describe('Sage of the Fang', () => {
  it('puts a +1/+1 counter on target creature when it enters', () => {
    const g = game({ p1: { hand: ['sage-of-the-fang'], battlefield: [...n('forest', 3), 'bear-cub'] } });
    cast(g, 'sage-of-the-fang');
    settle(g, (legal) =>
      legal.find((a) => a.type === 'chooseTargets' && JSON.stringify(a.targets).includes(g.id('p1', 'bear-cub'))),
    );
    done(g);
    expect(pt(g, g.id('p1', 'bear-cub'))).toEqual([3, 3]);
  });
  it('Renew: a counter, then double the number of +1/+1 counters on it', () => {
    const g = game({
      p1: { battlefield: ['bear-cub', ...n('forest', 4)], graveyard: ['sage-of-the-fang'] },
    });
    const bear = g.id('p1', 'bear-cub');
    // The Bear has two +1/+1 counters: 2 + 1 = 3, doubled = 6.
    g.obj(bear).plusOneCounters = 2;
    activate(g, g.id('p1', 'sage-of-the-fang', 'graveyard'), abilityIndex('sage-of-the-fang', 'activated'), [
      g.ref(bear),
    ]);
    done(g);
    expect(counters(g, bear)).toBe(6);
    expect(pt(g, bear)).toEqual([8, 8]);
  });
  it('Renew on a creature without counters: one, doubled to two', () => {
    const g = game({
      p1: { battlefield: ['bear-cub', ...n('forest', 4)], graveyard: ['sage-of-the-fang'] },
    });
    const bear = g.id('p1', 'bear-cub');
    activate(g, g.id('p1', 'sage-of-the-fang', 'graveyard'), abilityIndex('sage-of-the-fang', 'activated'), [
      g.ref(bear),
    ]);
    done(g);
    expect(counters(g, bear)).toBe(2);
  });
});

describe('Sagu Pummeler', () => {
  it('Renew: two +1/+1 counters and a reach counter', () => {
    const g = game({
      p1: { battlefield: ['bear-cub', ...n('forest', 5)], graveyard: ['sagu-pummeler'] },
    });
    const bear = g.id('p1', 'bear-cub');
    activate(g, g.id('p1', 'sagu-pummeler', 'graveyard'), abilityIndex('sagu-pummeler', 'activated'), [
      g.ref(bear),
    ]);
    done(g);
    expect(pt(g, bear)).toEqual([4, 4]);
    expect(keywords(g, bear)).toContain('reach');
  });
});

describe('Sagu Wildling and Roost Seek', () => {
  it('gains 3 life when it enters', () => {
    const g = game({ p1: { hand: ['sagu-wildling'], battlefield: n('forest', 5) } });
    done(cast(g, 'sagu-wildling'));
    expect(g.life('p1')).toBe(23);
    expect(keywords(g, g.id('p1', 'sagu-wildling'))).toContain('flying');
  });
  it('Roost Seek: reveals a basic land card into your hand, then the card is shuffled into the library', () => {
    const g = game({
      p1: { hand: ['sagu-wildling'], battlefield: ['forest'], library: ['island', 'bear-cub'] },
    });
    const card = g.id('p1', 'sagu-wildling', 'hand');
    g.do(casts(g, 'sagu-wildling').find((a) => a.back)!);
    done(g, { pick: ['island'] });
    expect(hand(g)).toEqual(['island']);
    expect(g.zoneOf(card)).toBe('library');
  });
});

describe("Sarkhan's Resolve", () => {
  it('gives a creature +3/+3 until end of turn', () => {
    const g = game({ p1: { hand: ['sarkhans-resolve'], battlefield: ['bear-cub', ...n('forest', 2)] } });
    g.do(casts(g, 'sarkhans-resolve').find((a) => a.mode === 0)!);
    done(g);
    expect(pt(g, g.id('p1', 'bear-cub'))).toEqual([5, 5]);
  });
  it('destroys a creature with flying only', () => {
    const g = game({
      p1: { hand: ['sarkhans-resolve'], battlefield: n('forest', 2) },
      p2: { battlefield: ['serra-angel', 'bear-cub'] },
    });
    const acts = casts(g, 'sarkhans-resolve').filter((a) => a.mode === 1);
    expect(acts).toHaveLength(1);
    g.do(acts[0]!);
    done(g);
    expect(gy(g, 'p2')).toEqual(['serra-angel']);
  });
});

describe('Sultai Devotee', () => {
  it('{1}: adds {B}, {G} or {U}, once each turn', () => {
    const g = game({
      p1: { battlefield: ['sultai-devotee', 'forest', 'forest'] },
    });
    const dev = g.id('p1', 'sultai-devotee');
    const idx = abilityIndex('sultai-devotee', 'activated');
    expect(keywords(g, dev)).toContain('deathtouch');
    activate(g, dev, idx);
    expect(g.state.stack).toHaveLength(0);
    expect(g.state.players.p1.pool?.length).toBe(1);
    const again = g.legal().some((a) => a.type === 'activateAbility' && a.source === dev && a.abilityIndex === idx);
    expect(again).toBe(false);
  });
});
