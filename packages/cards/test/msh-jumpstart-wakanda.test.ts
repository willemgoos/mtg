import { getCharacteristics } from '@mtg/engine';
import { describe, expect, it } from 'vitest';
import { cardDb, slug } from '../src/index.ts';
import { all, cast, game, handSize, n, pt, settle } from './blb-helpers.ts';

// Marvel Super Heroes Jumpstart packet: Wakanda.

const PACKET = [
  'Wakandan Shield Guard',
  'Wakandan Tusker',
  'Black Panther, Most Dangerous',
  'Shuri, Vibranium Technologist',
  'Okoye, Dora Milaje Leader',
  'Wakandan Drone Flock',
  'Borough Backup',
  'Vibranium Energy Daggers',
  'Ultimate Alliance',
  'Panther Pounce',
  'Heroic Teamwork',
  'Secure Detention',
  'Thriving Heath',
  'Plains',
];

const chars = (g: ReturnType<typeof game>, id: string) => getCharacteristics(g.state, cardDb, id);

describe('Wakanda packet', () => {
  it('has every card implemented', () => {
    expect(PACKET.filter((name) => !cardDb.has(slug(name)))).toEqual([]);
  });

  it('Wakandan Shield Guard makes a 1/1 Soldier', () => {
    const g = game({ p1: { hand: ['wakandan-shield-guard'], battlefield: n('plains', 2) } });
    settle(cast(g, 'wakandan-shield-guard'));
    expect(all(g, 'wakandan-shield-guard')).toHaveLength(1);
    expect(all(g, 'soldier-token')).toHaveLength(1);
  });

  it('Black Panther deals the damage he is dealt to another target', () => {
    const g = game({
      p1: {
        hand: ['shock'],
        battlefield: ['black-panther-most-dangerous', 'mountain'],
      },
    });
    const panther = g.id('p1', 'black-panther-most-dangerous');
    settle(cast(g, 'shock', [g.ref(panther)]), (legal) =>
      legal.find(
        (a) =>
          a.type === 'chooseTargets' && a.targets.some((t) => 'player' in t && t.player === 'p2'),
      ),
    );
    expect(g.life('p2')).toBe(18);
    expect(g.obj(panther).zone).toBe('battlefield');
  });

  it("Black Panther's power-up grows him and pumps the rest of the team", () => {
    const g = game({
      p1: { battlefield: ['black-panther-most-dangerous', 'bear-cub', ...n('plains', 7)] },
    });
    const panther = g.id('p1', 'black-panther-most-dangerous');
    const bear = g.id('p1', 'bear-cub');
    settle(
      g.do({
        type: 'activateAbility',
        player: 'p1',
        source: panther,
        abilityIndex: 1,
        targets: [],
      }),
    );
    expect(pt(g, panther)).toEqual([5, 5]);
    expect(pt(g, bear)).toEqual([4, 4]);
    expect(g.legal().some((a) => a.type === 'activateAbility' && a.source === panther)).toBe(false);
  });

  it('Shuri makes a flying Robot Hero or draws a card', () => {
    const g = game({
      p1: {
        hand: n('shuri-vibranium-technologist', 2),
        battlefield: n('plains', 6),
        library: n('plains', 3),
      },
    });
    cast(g, 'shuri-vibranium-technologist');
    settle(g, (legal) => legal.find((a) => a.type === 'chooseTargets' && a.mode === 0));
    const [robot] = all(g, 'robot-hero-flying-token');
    expect(robot).toBeDefined();
    expect(chars(g, robot!).keywords.has('flying')).toBe(true);
    expect(chars(g, robot!).subtypes).toEqual(expect.arrayContaining(['Robot', 'Hero']));
    const hand = handSize(g, 'p1');
    cast(g, 'shuri-vibranium-technologist');
    settle(g, (legal) => legal.find((a) => a.type === 'chooseTargets' && a.mode === 1));
    expect(handSize(g, 'p1')).toBe(hand);
    expect(all(g, 'robot-hero-flying-token')).toHaveLength(1);
    expect(chars(g, g.id('p1', 'shuri-vibranium-technologist')).keywords.has('vigilance')).toBe(
      true,
    );
  });

  it('Ultimate Alliance deals damage equal to the number of creatures you control', () => {
    const g = game({
      p1: {
        hand: n('ultimate-alliance', 2),
        battlefield: [...n('bear-cub', 3), ...n('plains', 2)],
      },
      p2: { battlefield: ['serra-angel'] },
    });
    const angel = g.id('p2', 'serra-angel');
    settle(cast(g, 'ultimate-alliance', [g.ref(angel)]));
    expect(g.obj(angel).damage).toBe(3);
    settle(cast(g, 'ultimate-alliance', [g.ref(angel)]));
    expect(g.obj(angel).zone).toBe('graveyard');
  });

  it('Heroic Teamwork pumps one or two creatures, and draws when cast using teamwork', () => {
    const g = game({
      p1: {
        hand: n('heroic-teamwork', 2),
        battlefield: [...n('bear-cub', 3), ...n('plains', 6)],
        library: n('plains', 3),
      },
    });
    const [a, b, c] = all(g, 'bear-cub');
    const hand = handSize(g, 'p1');
    settle(cast(g, 'heroic-teamwork', [g.ref(a!), g.ref(b!)]));
    expect(pt(g, a!)).toEqual([4, 3]);
    expect(pt(g, b!)).toEqual([4, 3]);
    expect(handSize(g, 'p1')).toBe(hand - 1);
    settle(cast(g, 'heroic-teamwork', [g.ref(c!)], { kicked: true, teamwork: [a!] }));
    expect(g.obj(a!).tapped).toBe(true);
    expect(pt(g, c!)).toEqual([4, 3]);
    expect(handSize(g, 'p1')).toBe(hand - 1);
  });

  it("Secure Detention: a Soldier, and the permanent can't attack, block or activate", () => {
    const g = game({
      p1: {
        hand: [...n('secure-detention', 2), 'bear-cub'],
        battlefield: ['black-panther-most-dangerous', 'llanowar-elves', ...n('plains', 11)],
      },
    });
    const panther = g.id('p1', 'black-panther-most-dangerous');
    const elves = g.id('p1', 'llanowar-elves');
    settle(cast(g, 'secure-detention', [g.ref(panther)]));
    expect(all(g, 'soldier-token')).toHaveLength(1);
    expect(chars(g, panther).cantAttack).toBe(true);
    expect(chars(g, panther).cantBlock).toBe(true);
    // Seven Plains are left: enough for the power-up, but it can't be activated.
    expect(g.legal().some((a) => a.type === 'activateAbility' && a.source === panther)).toBe(false);
    // Mana abilities are activated abilities too: no more green mana for the Bear Cub.
    const bearCastable = () =>
      g.legal().some((a) => a.type === 'castSpell' && g.obj(a.card).defId === 'bear-cub');
    expect(bearCastable()).toBe(true);
    settle(cast(g, 'secure-detention', [g.ref(elves)]));
    expect(all(g, 'soldier-token')).toHaveLength(2);
    expect(bearCastable()).toBe(false);
  });
});
