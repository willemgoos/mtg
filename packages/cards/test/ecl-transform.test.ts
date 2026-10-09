import { describe, expect, it } from 'vitest';
import { cardDb } from '../src/index.ts';
import {
  abilityActions,
  board,
  casts,
  choose,
  chars,
  done,
  exile,
  game,
  gy,
  hand,
  labels,
  n,
  passTo,
  pt,
  stop,
} from './ecl-special-helpers.ts';

// Lorwyn Eclipsed 18b: the seven two-faced legends. "At the beginning of your first main phase, you may pay {X}. If you do,
// transform ..." is on both faces; each face has its own enters/transforms ability.

const FRONTS = [
  "Brigid, Clachan's Heart",
  'Eirdu, Carrier of Dawn',
  'Oko, Lorwyn Liege',
  'Sygg, Wanderwine Wisdom',
  'Grub, Storied Matriarch',
  'Ashling, Rekindled',
  'Trystan, Callous Cultivator',
];
const BACKS: [string, string][] = [
  ["Brigid, Clachan's Heart", "Brigid, Doun's Mind"],
  ['Eirdu, Carrier of Dawn', 'Isilu, Carrier of Twilight'],
  ['Oko, Lorwyn Liege', 'Oko, Shadowmoor Scion'],
  ['Sygg, Wanderwine Wisdom', 'Sygg, Wanderbrine Shield'],
  ['Grub, Storied Matriarch', 'Grub, Notorious Auntie'],
  ['Ashling, Rekindled', 'Ashling, Rimebound'],
  ['Trystan, Callous Cultivator', 'Trystan, Penitent Culler'],
];
const idOf = (name: string) =>
  name
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** From p1's upkeep to the beginning of the first main phase and its "you may pay" prompt (the payment is accepted). */
function toFirstMain(g: ReturnType<typeof game>, accept = true) {
  g.passUntilStep('main1');
  stop(g);
  if (g.decision.kind === 'optionalEffect')
    g.do({ type: 'chooseEffect', player: 'p1', accept });
  return done(g);
}
const upkeep = (battlefield: string[]) => game({ step: 'upkeep', p1: { battlefield } });

describe('the group is in the pool', () => {
  it('every front and back face exists, linked to its other side', () => {
    for (const [front, back] of BACKS) {
      expect(cardDb.get(idOf(front)), front).toBeDefined();
      expect(cardDb.get(idOf(back)), back).toBeDefined();
      expect(cardDb.get(idOf(front))!.back, front).toBe(idOf(back));
    }
    expect(FRONTS).toHaveLength(7);
  });
});

describe('Brigid', () => {
  it("enters: create a Kithkin token; at your first main phase pay {G}: Brigid, Doun's Mind", () => {
    const g = game({ p1: { hand: ["brigid-clachans-heart"], battlefield: n('plains', 3) } });
    g.do(casts(g, 'brigid-clachans-heart')[0]!);
    done(g);
    expect(board(g, 'ecl-kithkin-token')).toHaveLength(1);
    expect(pt(g, g.id('p1', 'brigid-clachans-heart'))).toEqual([3, 2]);
  });

  it('transforms for {G} and back for {W} (a new Kithkin when it becomes Clachan\'s Heart again)', () => {
    const g = upkeep(['brigid-clachans-heart', 'forest', 'plains']);
    const brigid = g.id('p1', 'brigid-clachans-heart');
    toFirstMain(g);
    expect(g.obj(brigid).defId).toBe('brigid-douns-mind');
    expect(board(g, 'ecl-kithkin-token')).toHaveLength(0);
    // Next turn: pay {W} to transform back, which makes another Kithkin.
    passTo(g, 'upkeep', 'p1');
    toFirstMain(g);
    expect(g.obj(brigid).defId).toBe('brigid-clachans-heart');
    expect(board(g, 'ecl-kithkin-token')).toHaveLength(1);
  });

  it("you may decline to pay; with no mana it isn't offered", () => {
    const g = upkeep(['brigid-clachans-heart', 'forest']);
    toFirstMain(g, false);
    expect(g.obj(g.id('p1', 'brigid-clachans-heart')).defId).toBe('brigid-clachans-heart');
    const g2 = upkeep(['brigid-clachans-heart']);
    g2.passUntilStep('main1');
    stop(g2);
    expect(g2.decision.kind).toBe('priority');
    expect(g2.obj(g2.id('p1', 'brigid-clachans-heart')).defId).toBe('brigid-clachans-heart');
  });

  it("Doun's Mind: {T}: add X {G} or X {W}, where X is the number of other creatures you control", () => {
    const g = game({
      p1: {
        hand: ['serra-angel', 'fleecemane-lion'],
        battlefield: [
          'brigid-douns-mind',
          ...n('savannah-lions', 4),
        ],
      },
    });
    // Four other creatures: {W}{W}{W}{W} pays most of Serra Angel's {3}{W}{W}; one Plains-less mana short.
    expect(casts(g, 'serra-angel')).toHaveLength(0);
    const g2 = game({
      p1: {
        hand: ['serra-angel', 'fleecemane-lion'],
        battlefield: ['brigid-douns-mind', 'plains', ...n('savannah-lions', 4)],
      },
    });
    // Four W from Brigid plus the Plains: Serra Angel ({3}{W}{W}).
    expect(casts(g2, 'serra-angel')).not.toHaveLength(0);
    // All one colour: {G}{W} (Fleecemane Lion) can't be paid by Brigid alone with X = 4.
    expect(casts(g, 'fleecemane-lion')).toHaveLength(0);
    // With another land of the other colour it can: {G} from the Forest, {W} from Brigid.
    const g3 = game({
      p1: {
        hand: ['fleecemane-lion'],
        battlefield: ['brigid-douns-mind', 'forest', 'savannah-lions'],
      },
    });
    expect(casts(g3, 'fleecemane-lion')).not.toHaveLength(0);
  });
});

describe('Eirdu / Isilu', () => {
  it('Eirdu: creature spells you cast have convoke', () => {
    const g = game({
      p1: {
        hand: ['serra-angel'],
        battlefield: ['eirdu-carrier-of-dawn', 'plains', 'plains', 'savannah-lions', 'savannah-lions'],
      },
    });
    // Serra Angel costs {3}{W}{W}; two Plains and three creatures tapped to convoke (Eirdu and two Cats).
    expect(casts(g, 'serra-angel')).not.toHaveLength(0);
    const g2 = game({
      p1: { hand: ['serra-angel'], battlefield: ['plains', 'plains', 'savannah-lions', 'savannah-lions'] },
    });
    expect(casts(g2, 'serra-angel')).toHaveLength(0);
    expect([...chars(g, g.id('p1', 'eirdu-carrier-of-dawn')).keywords]).toEqual(
      expect.arrayContaining(['flying', 'lifelink']),
    );
  });

  it('transforms for {B}; Isilu: each other nontoken creature you control has persist', () => {
    const g = upkeep(['eirdu-carrier-of-dawn', 'swamp', 'serra-angel', 'ecl-kithkin-token']);
    const eirdu = g.id('p1', 'eirdu-carrier-of-dawn');
    const lions = g.id('p1', 'serra-angel');
    const kithkin = g.id('p1', 'ecl-kithkin-token');
    g.obj(kithkin).isToken = true;
    toFirstMain(g);
    expect(g.obj(eirdu).defId).toBe('isilu-carrier-of-twilight');
    expect([...chars(g, lions).keywords]).toContain('persist');
    expect([...chars(g, kithkin).keywords]).not.toContain('persist');
    expect([...chars(g, eirdu).keywords]).not.toContain('persist');
    // The Angel dies and comes back with a -1/-1 counter.
    g.obj(lions).damage = 4;
    stop(g);
    g.passBoth();
    done(g);
    expect(board(g, 'serra-angel')).toHaveLength(1);
    const back = board(g, 'serra-angel')[0]!;
    expect(g.obj(back).counters?.['-1/-1']).toBe(1);
    expect(pt(g, back)).toEqual([3, 3]);
  });

  it('Isilu transforms back into Eirdu for {W} on a later turn', () => {
    const g = upkeep(['eirdu-carrier-of-dawn', 'swamp', 'plains']);
    const eirdu = g.id('p1', 'eirdu-carrier-of-dawn');
    toFirstMain(g);
    expect(g.obj(eirdu).defId).toBe('isilu-carrier-of-twilight');
    passTo(g, 'upkeep', 'p1');
    toFirstMain(g);
    expect(g.obj(eirdu).defId).toBe('eirdu-carrier-of-dawn');
  });
});

describe('Oko', () => {
  const oko = (p1Extra: string[] = [], loyalty = 3, front = true) =>
    game({
      p1: {
        battlefield: [
          { card: front ? 'oko-lorwyn-liege' : 'oko-shadowmoor-scion', loyalty },
          ...p1Extra,
        ],
      },
      p2: { battlefield: ['savannah-lions'] },
    });

  it('is a planeswalker with 3 loyalty on both faces', () => {
    expect(cardDb.get('oko-lorwyn-liege')!.loyalty).toBe(3);
    expect(cardDb.get('oko-shadowmoor-scion')!.loyalty).toBe(3);
    expect(cardDb.get('oko-lorwyn-liege')!.types).toContain('Planeswalker');
    expect(cardDb.get('oko-shadowmoor-scion')!.types).toContain('Planeswalker');
  });

  it('+2: up to one target creature gains all creature types (for good)', () => {
    const g = oko(['llanowar-elves']);
    const o = g.id('p1', 'oko-lorwyn-liege');
    const elves = g.id('p1', 'llanowar-elves');
    const acts = abilityActions(g, o, 1);
    // One option per target, and none ("up to one").
    expect(acts.length).toBe(3);
    g.do(acts.find((a) => a.type === 'activateAbility' && a.targets.some((t) => 'object' in t && t.object.id === elves))!);
    done(g);
    expect(g.obj(o).counters?.loyalty).toBe(5);
    expect(chars(g, elves).subtypes).toEqual(expect.arrayContaining(['Elf']));
    // It's a Goblin now (a Goblin-matching ability sees it).
    g.obj(g.id('p1', 'oko-lorwyn-liege')).tapped = false;
    passTo(g, 'main1', 'p1');
  });

  it('+2 with no target', () => {
    const g = oko();
    const o = g.id('p1', 'oko-lorwyn-liege');
    const none = abilityActions(g, o, 1).find((a) => a.type === 'activateAbility' && a.targets.length === 0);
    expect(none).toBeDefined();
    g.do(none!);
    done(g);
    expect(g.obj(o).counters?.loyalty).toBe(5);
  });

  it('+1: target creature gets -2/-0 until your next turn', () => {
    const g = oko();
    const o = g.id('p1', 'oko-lorwyn-liege');
    const lions = g.id('p2', 'savannah-lions');
    g.do(abilityActions(g, o, 2).find((a) => a.type === 'activateAbility' && a.targets.some((t) => 'object' in t && t.object.id === lions))!);
    done(g);
    expect(pt(g, lions)).toEqual([0, 1]);
    expect(g.obj(o).counters?.loyalty).toBe(4);
    passTo(g, 'main1', 'p2');
    expect(pt(g, lions)).toEqual([0, 1]);
    passTo(g, 'main1', 'p1');
    expect(pt(g, lions)).toEqual([2, 1]);
  });

  it('transforms at the first main phase by paying {G} (loyalty stays), and back by paying {U}', () => {
    const g = game({
      step: 'upkeep',
      p1: { battlefield: [{ card: 'oko-lorwyn-liege', loyalty: 4 }, 'forest', 'island'] },
    });
    const o = g.id('p1', 'oko-lorwyn-liege');
    toFirstMain(g);
    expect(g.obj(o).defId).toBe('oko-shadowmoor-scion');
    expect(g.obj(o).counters?.loyalty).toBe(4);
    passTo(g, 'upkeep', 'p1');
    toFirstMain(g);
    expect(g.obj(o).defId).toBe('oko-lorwyn-liege');
  });

  it('Shadowmoor Scion -1: mill three, you may put a permanent card from among them into your hand', () => {
    const g = game({
      p1: {
        battlefield: [{ card: 'oko-shadowmoor-scion', loyalty: 3 }],
        library: ['savannah-lions', 'lightning-bolt', 'forest', 'forest', 'forest'],
      },
    });
    const o = g.id('p1', 'oko-shadowmoor-scion');
    g.do(abilityActions(g, o, 1)[0]!);
    stop(g);
    done(g, { card: (id) => g.obj(id).defId === 'savannah-lions' });
    expect(hand(g)).toEqual(['savannah-lions']);
    expect(gy(g).sort()).toEqual(['forest', 'lightning-bolt']);
    expect(g.obj(o).counters?.loyalty).toBe(2);
  });

  it('Shadowmoor Scion -3: create two 3/3 green Elk tokens', () => {
    const g = oko([], 3, false);
    const o = g.id('p1', 'oko-shadowmoor-scion');
    g.do(abilityActions(g, o, 2)[0]!);
    done(g);
    const elk = board(g, 'ecl-oko-elk-token');
    expect(elk).toHaveLength(2);
    expect(pt(g, elk[0]!)).toEqual([3, 3]);
    // Oko had 3 loyalty: it goes to the graveyard.
    expect(gy(g)).toContain('oko-shadowmoor-scion');
  });

  it('Shadowmoor Scion -6: choose a creature type; an emblem gives your creatures of that type +3/+3, vigilance and hexproof', () => {
    const g = game({
      p1: {
        battlefield: [
          { card: 'oko-shadowmoor-scion', loyalty: 6 },
          'llanowar-elves',
          'savannah-lions',
          'changeling-wayfinder',
        ],
      },
      p2: { battlefield: ['elvish-mystic'] },
    });
    const o = g.id('p1', 'oko-shadowmoor-scion');
    g.do(abilityActions(g, o, 3)[0]!);
    stop(g);
    expect(g.decision.kind).toBe('chooseOption');
    choose(g, /^Elf$/);
    done(g);
    const elves = g.id('p1', 'llanowar-elves');
    expect(pt(g, elves)).toEqual([4, 4]);
    expect([...chars(g, elves).keywords]).toEqual(expect.arrayContaining(['vigilance', 'hexproof']));
    // A changeling is an Elf too; a Cat and the opponent's Elf are not.
    expect(pt(g, g.id('p1', 'changeling-wayfinder'))).toEqual([4, 5]);
    expect(pt(g, g.id('p1', 'savannah-lions'))).toEqual([2, 1]);
    expect(pt(g, g.id('p2', 'elvish-mystic'))).toEqual([1, 1]);
    // Oko had exactly 6 loyalty: it died, the emblem stays.
    expect(gy(g)).toContain('oko-shadowmoor-scion');
    expect(g.state.emblems).toHaveLength(1);
  });
});

describe('Sygg', () => {
  it("Wanderwine Wisdom can't be blocked; entering, target creature gains a draw-on-combat-damage ability until end of turn", () => {
    const g = game({
      p1: { hand: ['sygg-wanderwine-wisdom'], battlefield: [...n('island', 2), 'savannah-lions'] },
    });
    g.do(casts(g, 'sygg-wanderwine-wisdom')[0]!);
    stop(g);
    const lions = g.id('p1', 'savannah-lions');
    g.do(
      g
        .legal()
        .find((a) => a.type === 'chooseTargets' && a.targets.some((t) => 'object' in t && t.object.id === lions))!,
    );
    done(g);
    // It's main phase 1: go to combat and attack with the Cat; the damage draws a card.
    g.obj(lions).summoningSick = false;
    g.passBoth();
    expect(g.state.turn.step).toBe('beginCombat');
    g.passBoth();
    expect(g.decision.kind).toBe('declareAttackers');
    g.attack(lions);
    done(g);
    g.passUntilStep('main2');
    done(g);
    expect(g.life('p2')).toBe(18);
    expect(hand(g)).toHaveLength(1);
  });

  it('the granted ability also draws on combat damage to a planeswalker, and only until end of turn', () => {
    const g = game({
      p1: { battlefield: ['savannah-lions'] },
      p2: { battlefield: [{ card: 'oko-lorwyn-liege', loyalty: 5 }] },
    });
    const lions = g.id('p1', 'savannah-lions');
    g.state.objects[lions]!.tempAbilities = [
      {
        kind: 'triggered',
        trigger: { on: 'combatDamageToPlayer', orPlaneswalker: true },
        targets: [],
        effects: [{ kind: 'draw', who: 'controller', amount: 1 }],
      },
    ];
    g.passBoth();
    g.passBoth();
    g.do({
      type: 'addAttacker',
      player: 'p1',
      attacker: lions,
      defender: 'p2',
      planeswalker: g.id('p2', 'oko-lorwyn-liege'),
    } as never);
    g.do({ type: 'confirmAttackers', player: 'p1' });
    g.passUntilStep('main2');
    done(g);
    expect(g.obj(g.id('p2', 'oko-lorwyn-liege')).counters?.loyalty).toBe(3);
    expect(hand(g)).toHaveLength(1);
  });

  it('transforms for {W}; Wanderbrine Shield: target creature you control gains protection from each color until your next turn', () => {
    const g = game({
      step: 'upkeep',
      p1: { battlefield: ['sygg-wanderwine-wisdom', 'plains', 'savannah-lions'] },
      p2: { battlefield: ['serra-angel'] },
    });
    const sygg = g.id('p1', 'sygg-wanderwine-wisdom');
    g.passUntilStep('main1');
    stop(g);
    g.do({ type: 'chooseEffect', player: 'p1', accept: true });
    // The transform trigger: target creature you control.
    stop(g);
    const lions = g.id('p1', 'savannah-lions');
    g.do(
      g
        .legal()
        .find((a) => a.type === 'chooseTargets' && a.targets.some((t) => 'object' in t && t.object.id === lions))!,
    );
    done(g);
    expect(g.obj(sygg).defId).toBe('sygg-wanderbrine-shield');
    const colors = g.state.effects.filter((e) => e.protectionFrom !== undefined).map((e) => e.protectionFrom);
    expect(colors.sort()).toEqual(['B', 'G', 'R', 'U', 'W']);
    // Until your next turn: they last through the opponent's turn.
    expect(g.state.effects.every((e) => e.protectionFrom === undefined || e.expires === 'untilYourNextTurn')).toBe(true);
  });

  it('a creature with protection from each color (as Wanderbrine Shield grants it) can only be blocked by colorless creatures', () => {
    const g = game({
      step: 'beginCombat',
      p1: { battlefield: ['savannah-lions'] },
      p2: { battlefield: ['serra-angel', 'ecl-shapeshifter-token'] },
    });
    const lions = g.id('p1', 'savannah-lions');
    for (const protectionFrom of ['W', 'U', 'B', 'R', 'G'] as const)
      g.state.effects.push({
        timestamp: 900,
        affected: { id: lions, zcc: g.obj(lions).zcc },
        power: 0,
        toughness: 0,
        keywords: [],
        protectionFrom,
        expires: 'untilYourNextTurn',
        player: 'p1',
      });
    g.passBoth();
    g.attack(lions);
    for (let i = 0; i < 4 && g.decision.kind === 'priority'; i++) g.pass();
    expect(g.decision.kind).toBe('declareBlockers');
    const blocks = g
      .legal()
      .filter((a) => a.type === 'addBlock')
      .map((a) => (a.type === 'addBlock' ? g.obj(a.blocker).defId : ''));
    // The white Angel can't block it; the colorless Shapeshifter can.
    expect(blocks).toEqual(['ecl-shapeshifter-token']);
  });

  it('Wanderbrine Shield can be blocked by nobody (it is unblockable too)', () => {
    expect(cardDb.get('sygg-wanderbrine-shield')!.abilities.some((a) => a.kind === 'static' && a.effect.kind === 'cantBeBlocked')).toBe(true);
    expect(cardDb.get('sygg-wanderwine-wisdom')!.abilities.some((a) => a.kind === 'static' && a.effect.kind === 'cantBeBlocked')).toBe(true);
  });
});

describe('Grub', () => {
  it('Storied Matriarch: enters, return up to one target Goblin card from your graveyard to your hand', () => {
    const g = game({
      p1: {
        hand: ['grub-storied-matriarch'],
        battlefield: [...n('swamp', 3)],
        graveyard: ['goblin-boarders', 'savannah-lions'],
      },
    });
    g.do(casts(g, 'grub-storied-matriarch')[0]!);
    stop(g);
    expect(g.decision.kind).toBe('chooseTriggerTargets');
    const choices = g
      .legal()
      .filter((a) => a.type === 'chooseTargets')
      .map((a) => (a.type === 'chooseTargets' ? a.targets.length : -1));
    // The Goblin card, or no target.
    expect(choices.sort()).toEqual([0, 1]);
    done(g);
    expect(hand(g)).toEqual(['goblin-boarders']);
  });

  it('transforms for {R}: returns another Goblin when it becomes Storied Matriarch again', () => {
    const g = game({
      step: 'upkeep',
      p1: { battlefield: ['grub-storied-matriarch', 'mountain'], graveyard: ['goblin-boarders'] },
    });
    const grub = g.id('p1', 'grub-storied-matriarch');
    g.passUntilStep('main1');
    stop(g);
    g.do({ type: 'chooseEffect', player: 'p1', accept: true });
    done(g);
    expect(g.obj(grub).defId).toBe('grub-notorious-auntie');
    // "enters or transforms into Grub, Storied Matriarch" doesn't fire when it becomes the Notorious Auntie
    // (the Forest in hand is the draw step's).
    expect(hand(g)).toEqual(['forest']);
  });

  it("Notorious Auntie: when it attacks, you may blight 1; a tapped and attacking token copy of the blighted creature that's sacrificed at end step", () => {
    const g = game({
      step: 'beginCombat',
      p1: { battlefield: ['grub-notorious-auntie', 'serra-angel'] },
    });
    const grub = g.id('p1', 'grub-notorious-auntie');
    g.passBoth();
    expect(g.decision.kind).toBe('declareAttackers');
    g.attack(grub);
    stop(g);
    expect(g.decision.kind).toBe('chooseObject');
    // Choose the creature to blight: Serra Angel.
    const angel = g.id('p1', 'serra-angel');
    g.do(g.legal().find((a) => a.type === 'chooseCard' && a.card === angel)!);
    done(g);
    expect(g.obj(angel).counters?.['-1/-1']).toBe(1);
    const copies = board(g, 'serra-angel').filter((id) => g.obj(id).isToken);
    expect(copies).toHaveLength(1);
    expect(g.obj(copies[0]!).tapped).toBe(true);
    expect(g.state.combat?.attackers.some((a) => a.id === copies[0])).toBe(true);
    // At the beginning of the end step it's sacrificed.
    g.passUntilStep('end');
    done(g);
    expect(board(g, 'serra-angel').filter((id) => g.obj(id).isToken)).toHaveLength(0);
  });

  it('Notorious Auntie: declining the blight makes no token', () => {
    const g = game({ step: 'beginCombat', p1: { battlefield: ['grub-notorious-auntie'] } });
    g.passBoth();
    g.attack(g.id('p1', 'grub-notorious-auntie'));
    stop(g);
    g.do({ type: 'chooseCard', player: 'p1', card: null } as never);
    done(g);
    expect(board(g, 'grub-notorious-auntie')).toHaveLength(1);
    expect(g.state.battlefield.filter((id) => g.obj(id).isToken)).toHaveLength(0);
  });
});

describe('Ashling', () => {
  it('Rekindled: enters, you may discard a card; if you do, draw a card', () => {
    const g = game({
      p1: { hand: ['ashling-rekindled', 'savannah-lions'], battlefield: n('mountain', 2) },
    });
    g.do(casts(g, 'ashling-rekindled')[0]!);
    stop(g);
    done(g);
    expect(gy(g)).toEqual(['savannah-lions']);
    expect(hand(g)).toEqual(['forest']);
  });

  it('transforms for {U}; Rimebound: when it transforms into it, add two mana of any one color, only for spells with mana value 4 or greater', () => {
    const g = game({
      step: 'upkeep',
      p1: { hand: ['serra-angel', 'savannah-lions'], battlefield: ['ashling-rekindled', 'island'] },
    });
    const ashling = g.id('p1', 'ashling-rekindled');
    g.passUntilStep('main1');
    stop(g);
    g.do({ type: 'chooseEffect', player: 'p1', accept: true });
    stop(g);
    expect(g.obj(ashling).defId).toBe('ashling-rimebound');
    expect(g.decision.kind).toBe('chooseOption');
    choose(g, /^White$/);
    done(g);
    expect(g.state.players.p1.pool).toHaveLength(2);
    expect(g.state.players.p1.pool!.every((m) => m.onlyFor === 'MV4Plus')).toBe(true);
    // Serra Angel ({3}{W}{W}, MV 5) isn't affordable with the two restricted mana alone, but a Lions ({W}) can't use them.
    expect(casts(g, 'savannah-lions')).toHaveLength(0);
  });

  it('Rimebound also adds the mana at the beginning of your first main phase; transforms back for {R}', () => {
    const g = upkeep(['ashling-rekindled', 'island', 'mountain']);
    const ashling = g.id('p1', 'ashling-rekindled');
    // Turn 1: pay {U}; "transforms into Ashling, Rimebound" adds two mana.
    g.passUntilStep('main1');
    stop(g);
    g.do({ type: 'chooseEffect', player: 'p1', accept: true });
    stop(g);
    choose(g, /^Red$/);
    done(g);
    expect(g.obj(ashling).defId).toBe('ashling-rimebound');
    expect(g.state.players.p1.pool).toHaveLength(2);
    // Next turn: the first-main-phase trigger adds two more, and {R} transforms it back.
    passTo(g, 'upkeep', 'p1');
    g.passUntilStep('main1');
    stop(g);
    const prompts: string[] = [];
    for (let i = 0; i < 10 && g.decision.kind !== 'priority'; i++) {
      prompts.push(g.decision.kind);
      // The first prompt pays {R} to transform; after that, Rekindled's "you may discard" is declined.
      if (g.decision.kind === 'optionalEffect')
        g.do({ type: 'chooseEffect', player: 'p1', accept: prompts.length === 1 });
      else if (g.decision.kind === 'chooseOption') choose(g, /^Green$/);
      stop(g);
    }
    expect(prompts).toEqual(expect.arrayContaining(['optionalEffect', 'chooseOption']));
    expect(g.state.players.p1.pool!.filter((m) => m.produces.includes('G'))).toHaveLength(2);
    expect(g.obj(ashling).defId).toBe('ashling-rekindled');
  });
});

describe('Trystan', () => {
  it('Callous Cultivator: enters, mill three; then if there is an Elf card in your graveyard, gain 2 life', () => {
    const g = game({
      p1: {
        hand: ['trystan-callous-cultivator'],
        battlefield: [...n('forest', 3)],
        library: ['llanowar-elves', 'forest', 'forest', 'forest'],
      },
    });
    g.do(casts(g, 'trystan-callous-cultivator')[0]!);
    done(g);
    expect(gy(g)).toEqual(['llanowar-elves', 'forest', 'forest']);
    expect(g.life('p1')).toBe(22);
    expect([...chars(g, g.id('p1', 'trystan-callous-cultivator')).keywords]).toContain('deathtouch');
    expect(pt(g, g.id('p1', 'trystan-callous-cultivator'))).toEqual([3, 4]);
  });

  it('no Elf card milled and none in the graveyard: no life', () => {
    const g = game({
      p1: { hand: ['trystan-callous-cultivator'], battlefield: [...n('forest', 3)] },
    });
    g.do(casts(g, 'trystan-callous-cultivator')[0]!);
    done(g);
    expect(g.life('p1')).toBe(20);
  });

  it('an Elf card that was already in the graveyard counts', () => {
    const g = game({
      p1: {
        hand: ['trystan-callous-cultivator'],
        battlefield: [...n('forest', 3)],
        graveyard: ['elvish-mystic'],
      },
    });
    g.do(casts(g, 'trystan-callous-cultivator')[0]!);
    done(g);
    expect(g.life('p1')).toBe(22);
  });

  it('transforms for {B}; Penitent Culler: mill three, then you may exile an Elf card from your graveyard; if you do, each opponent loses 2 life', () => {
    const g = game({
      step: 'upkeep',
      p1: {
        battlefield: ['trystan-callous-cultivator', 'swamp'],
        library: ['llanowar-elves', 'forest', 'forest', 'forest', 'forest', 'forest'],
      },
    });
    const trystan = g.id('p1', 'trystan-callous-cultivator');
    g.passUntilStep('main1');
    stop(g);
    g.do({ type: 'chooseEffect', player: 'p1', accept: true });
    stop(g);
    expect(g.obj(trystan).defId).toBe('trystan-penitent-culler');
    // (the draw step took the Elf; the three milled are Forests: no Elf in the graveyard, so no prompt)
    done(g);
    expect(g.life('p2')).toBe(20);
  });

  it('Penitent Culler with an Elf card milled: exile it for 2 life from each opponent', () => {
    const g = game({
      step: 'upkeep',
      p1: {
        battlefield: ['trystan-callous-cultivator', 'swamp'],
        library: ['forest', 'llanowar-elves', 'forest', 'forest', 'forest', 'forest'],
      },
    });
    const trystan = g.id('p1', 'trystan-callous-cultivator');
    g.passUntilStep('main1');
    stop(g);
    g.do({ type: 'chooseEffect', player: 'p1', accept: true });
    stop(g);
    expect(g.obj(trystan).defId).toBe('trystan-penitent-culler');
    expect(g.decision.kind).toBe('chooseOption');
    expect(labels(g)).toEqual([
      'Exile Llanowar Elves: each opponent loses 2 life',
      "Don't exile a card",
    ]);
    choose(g, /^Exile Llanowar Elves/);
    done(g);
    expect(exile(g)).toEqual(['llanowar-elves']);
    expect(g.life('p2')).toBe(18);
  });

  it('Penitent Culler: you may decline to exile', () => {
    const g = game({
      step: 'upkeep',
      p1: {
        battlefield: ['trystan-callous-cultivator', 'swamp'],
        library: ['forest', 'llanowar-elves', 'forest', 'forest', 'forest', 'forest'],
      },
    });
    g.passUntilStep('main1');
    stop(g);
    g.do({ type: 'chooseEffect', player: 'p1', accept: true });
    stop(g);
    choose(g, /^Don't exile/);
    done(g);
    expect(exile(g)).toEqual([]);
    expect(g.life('p2')).toBe(20);
  });
});
