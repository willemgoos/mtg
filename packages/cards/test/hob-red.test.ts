import { describe, expect, it } from 'vitest';
import { getCharacteristics, redactFor } from '@mtg/engine';
import { cast, game, n, pt, settle } from './blb-helpers.ts';
import { activations, done, exile, gy, hand, passTo, tokens } from './ecl-red-helpers.ts';
import { cardDb } from '../src/index.ts';

// The Hobbit 20b: the red cards (part one: Balin to Gundabad Opportunist).

const bf = (g: ReturnType<typeof game>, def: string, p: 'p1' | 'p2' = 'p1') =>
  g.state.battlefield.filter((id) => g.obj(id).defId === def && g.obj(id).controller === p);
const kw = (g: ReturnType<typeof game>, id: string) => getCharacteristics(g.state, cardDb, id).keywords;

/** Moves to the declare attackers decision and attacks the opponent with these creatures. */
function attack(g: ReturnType<typeof game>, attackers: string[]): void {
  for (let i = 0; i < 10 && g.decision.kind !== 'declareAttackers'; i++) g.pass();
  for (const attacker of attackers)
    g.do({ type: 'addAttacker', player: 'p1', attacker, defender: 'p2' });
  g.do({ type: 'confirmAttackers', player: 'p1' });
}

describe('Balin, Loremaster', () => {
  const setup = (story: boolean) =>
    game({
      p1: {
        hand: ['dwarven-mauler', 'shock', 'shock'],
        battlefield: [
          'balin-loremaster',
          ...(story ? ['getaway-barrel', 'ragged-short-spear'] : []),
          'mountain',
        ],
      },
    });

  it('whenever another Dwarf enters, may discard the hand and draw that many', () => {
    const g = setup(false);
    cast(g, 'dwarven-mauler');
    settle(g);
    done(g, { accept: true });
    expect(hand(g)).toHaveLength(2);
    expect(gy(g)).toEqual(['shock', 'shock']);
    // No enduring story: no damage.
    expect(g.life('p2')).toBe(20);
  });

  it('with an enduring story, Balin deals X damage to each opponent', () => {
    const g = setup(true);
    cast(g, 'dwarven-mauler');
    settle(g);
    done(g, { accept: true });
    expect(hand(g)).toHaveLength(2);
    expect(g.life('p2')).toBe(18);
  });

  it('you may decline', () => {
    const g = setup(true);
    cast(g, 'dwarven-mauler');
    settle(g);
    done(g, { accept: false });
    expect(hand(g)).toEqual(['shock', 'shock']);
    expect(g.life('p2')).toBe(20);
  });
});

describe('Bombur, Gentle Dreamer', () => {
  it("doesn't untap unless you have an enduring story", () => {
    const g = game({
      p1: { battlefield: [{ card: 'bombur-gentle-dreamer', tapped: true }] },
    });
    passTo(g, 'main1', 'p1');
    expect(g.obj(g.id('p1', 'bombur-gentle-dreamer')).tapped).toBe(true);
  });

  it('untaps with an enduring story', () => {
    const g = game({
      p1: {
        battlefield: [
          { card: 'bombur-gentle-dreamer', tapped: true },
          'getaway-barrel',
          'ragged-short-spear',
        ],
      },
    });
    passTo(g, 'main1', 'p1');
    expect(g.obj(g.id('p1', 'bombur-gentle-dreamer')).tapped).toBe(false);
  });
});

describe('Bothersome Noisemaker', () => {
  it('amasses Goblins 1 whenever you cast a noncreature spell', () => {
    const g = game({ p1: { hand: ['shock'], battlefield: ['bothersome-noisemaker', 'mountain'] } });
    cast(g, 'shock', [{ player: 'p2' }]);
    settle(g);
    const army = tokens(g, 'hob-goblin-army-token');
    expect(army).toHaveLength(1);
    expect(pt(g, army[0]!)).toEqual([1, 1]);
  });
});

describe('Burn, Burn, Tree and Fern', () => {
  it('I deals 6 damage, II destroys an artifact, III and IV add {R}', () => {
    const g = game({
      p1: { hand: ['burn-burn-tree-and-fern'], battlefield: n('mountain', 4) },
      p2: { battlefield: ['stone-giant-of-high-pass', 'getaway-barrel'] },
    });
    cast(g, 'burn-burn-tree-and-fern');
    settle(g);
    // 6 damage is not enough for a 7/7.
    expect(bf(g, 'stone-giant-of-high-pass', 'p2')).toHaveLength(1);
    expect(g.obj(bf(g, 'stone-giant-of-high-pass', 'p2')[0]!).damage).toBe(6);
    passTo(g, 'main1', 'p1');
    settle(g);
    expect(bf(g, 'getaway-barrel', 'p2')).toHaveLength(0);
    passTo(g, 'main1', 'p1');
    settle(g);
    expect(g.state.players.p1.pool?.length).toBe(1);
  });
});

describe('Dáin Ironfoot', () => {
  it('creates an Axe and attaches it; attacking gives equipped attackers double strike', () => {
    const g = game({ p1: { hand: ['d-in-ironfoot'], battlefield: n('mountain', 3) } });
    cast(g, 'd-in-ironfoot');
    settle(g);
    const dain = g.id('p1', 'd-in-ironfoot');
    const axe = tokens(g, 'hob-axe-token');
    expect(axe).toHaveLength(1);
    expect(g.obj(axe[0]!).attachedTo).toBe(dain);
    expect(pt(g, dain)).toEqual([2, 4]);
    // Next turn it attacks with double strike.
    passTo(g, 'main1', 'p1');
    attack(g, [dain]);
    settle(g);
    expect(kw(g, dain)).toContain('doubleStrike');
  });
});

describe('Desert Were-Worm', () => {
  it('gets +2/+0 for each Mountain you control', () => {
    const g = game({ p1: { battlefield: ['desert-were-worm', ...n('mountain', 3)] } });
    expect(pt(g, g.id('p1', 'desert-were-worm'))).toEqual([6, 5]);
  });

  it('total attacking power 12: untaps the attackers and adds a combat phase, once a turn', () => {
    const g = game({ p1: { battlefield: ['desert-were-worm', ...n('mountain', 6)] } });
    const worm = g.id('p1', 'desert-were-worm');
    attack(g, [worm]);
    settle(g);
    expect(g.obj(worm).tapped).toBe(false);
    expect(g.state.turn.extraCombats).toBeGreaterThan(0);
  });

  it('counts only the attacking creatures', () => {
    const g = game({
      p1: { battlefield: ['desert-were-worm', 'stone-giant-of-high-pass', ...n('mountain', 5)] },
    });
    const worm = g.id('p1', 'desert-were-worm');
    attack(g, [worm]);
    settle(g);
    expect(g.obj(worm).tapped).toBe(true);
    expect(g.state.turn.extraCombats).toBe(0);
  });

  it('less than 12 total power does nothing', () => {
    const g = game({ p1: { battlefield: ['desert-were-worm', ...n('mountain', 5)] } });
    const worm = g.id('p1', 'desert-were-worm');
    attack(g, [worm]);
    settle(g);
    expect(g.obj(worm).tapped).toBe(true);
    expect(g.state.turn.extraCombats).toBe(0);
  });
});

describe('Desolation of Smaug', () => {
  it('deals 3 to each non-Dragon creature and adds four mana for Dragon spells only', () => {
    const g = game({
      p1: {
        hand: ['desolation-of-smaug', 'smaug-the-magnificent', 'goblin-town-flunkies'],
        battlefield: [...n('mountain', 4), 'dwarven-mauler', 'smaug-the-great-calamity'],
      },
      p2: { battlefield: ['dwarven-mauler', 'iron-hills-stalwart'] },
    });
    cast(g, 'desolation-of-smaug');
    settle(g);
    done(g);
    expect(bf(g, 'dwarven-mauler', 'p1')).toHaveLength(0);
    expect(bf(g, 'dwarven-mauler', 'p2')).toHaveLength(0);
    expect(bf(g, 'iron-hills-stalwart', 'p2')).toHaveLength(1);
    expect(bf(g, 'smaug-the-great-calamity')).toHaveLength(1);
    expect(g.state.players.p1.pool?.length).toBe(4);
    // The mana pays for a Dragon spell, not for anything else.
    const castable = (def: string) =>
      g.legal().some((a) => a.type === 'castSpell' && g.obj(a.card).defId === def);
    expect(castable('goblin-town-flunkies')).toBe(false);
    expect(castable('smaug-the-magnificent')).toBe(true);
  });
});

describe('Dori, Bearer of Friends', () => {
  it('creates a Treasure when it enters', () => {
    const g = game({ p1: { hand: ['dori-bearer-of-friends'], battlefield: n('mountain', 3) } });
    cast(g, 'dori-bearer-of-friends');
    settle(g);
    expect(tokens(g, 'treasure-token')).toHaveLength(1);
  });
});

describe('Dwarven Mauler', () => {
  it('equip abilities that target it cost {2} less', () => {
    const g = game({
      p1: { battlefield: ['ragged-short-spear', 'dwarven-mauler', 'dori-bearer-of-friends', 'mountain'] },
    });
    const spear = g.id('p1', 'ragged-short-spear');
    const mauler = g.id('p1', 'dwarven-mauler');
    const dori = g.id('p1', 'dori-bearer-of-friends');
    const equips = activations(g, spear).map((a) => a.targets[0]);
    expect(equips.some((t) => t && 'object' in t && t.object.id === mauler)).toBe(true);
    expect(equips.some((t) => t && 'object' in t && t.object.id === dori)).toBe(false);
  });
});

describe("Gandalf, Goblins' Bane // Flameshape", () => {
  it('a noncreature spell pumps Gandalf and pings each opponent', () => {
    const g = game({ p1: { hand: ['shock'], battlefield: ["gandalf-goblins-bane", 'mountain'] } });
    cast(g, 'shock', [{ player: 'p2' }]);
    settle(g);
    expect(g.life('p2')).toBe(17);
    expect(pt(g, g.id('p1', 'gandalf-goblins-bane'))).toEqual([3, 4]);
  });

  it('Flameshape: the exiled cards are face down and playable only while you control a Wizard', () => {
    const spec = (wizard: boolean) =>
      game({
        p1: {
          hand: ['gandalf-goblins-bane'],
          battlefield: [...n('mountain', 3), ...(wizard ? ['gandalf-spark-starter'] : [])],
          library: ['shock', 'mountain', 'forest'],
        },
      });
    const castFlameshape = (g: ReturnType<typeof game>) => {
      const adv = g.legal().find((a) => a.type === 'castSpell' && a.back === true)!;
      g.do(adv as never);
      settle(g);
    };
    const playable = (g: ReturnType<typeof game>) =>
      g
        .legal()
        .filter((a) => (a.type === 'castSpell' || a.type === 'playLand') && g.obj(a.card).zone === 'exile')
        .map((a) => (a as { card: string }).card);
    const none = spec(false);
    castFlameshape(none);
    expect(exile(none)).toEqual(expect.arrayContaining(['shock', 'mountain']));
    expect(playable(none)).toHaveLength(0);

    const g = spec(true);
    castFlameshape(g);
    const cards = playable(g).map((c) => g.obj(c).defId);
    expect(cards).toContain('mountain');
    expect(cards).toContain('shock');
    // The opponent doesn't see them.
    const seen = redactFor(g.state, 'p2');
    const faceDown = g.state.players.p1.exile.filter((id) => g.obj(id).playableIf);
    expect(faceDown).toHaveLength(2);
    for (const id of faceDown) expect(seen.objects[id]!.defId).toBe('?');
    // Playing the land from exile works.
    const land = g.legal().find((a) => a.type === 'playLand' && g.obj(a.card).zone === 'exile')!;
    g.do(land);
    expect(bf(g, 'mountain')).toHaveLength(4);
  });
});
