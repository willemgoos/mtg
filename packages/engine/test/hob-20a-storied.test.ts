import { describe, expect, it } from 'vitest';
import { getCharacteristics } from '../src/index.ts';
import { casts, DB, Game, getPower, scenario } from './hob-fixtures.ts';

const castFirst = (g: Game, player: 'p1' | 'p2', defId: string) =>
  g.do(casts(g, player, g.id(player, defId, 'hand'))[0]!);

const settle = (g: Game) => {
  for (let i = 0; i < 20 && g.state.stack.length > 0 && g.decision.kind === 'priority'; i++)
    g.passBoth();
};

const story = (g: Game, p: 'p1' | 'p2') => !!g.state.players[p].enduringStory;
const storyEvents = (g: Game) => g.events.filter((e) => e.type === 'enduringStory');
const keywords = (g: Game, id: string) => [...getCharacteristics(g.state, DB, id).keywords];

// Storied — If you control three or more artifacts, legendaries, and/or Sagas, you have an enduring story for the rest of the game.

describe('Storied: getting the enduring story', () => {
  it('a Storied permanent and three artifacts, legendaries and/or Sagas give it (the Storied one may be one of the three)', () => {
    // Ori is legendary: Ori + an artifact + a Saga.
    const g = new Game(
      scenario({
        p1: { hand: ['h-saga'], battlefield: ['h-ori', 'h-relic', 'plains'] },
      }),
    );
    expect(story(g, 'p1')).toBe(false);
    // Two of the three: not yet.
    castFirst(g, 'p1', 'h-saga');
    expect(story(g, 'p1')).toBe(false);
    g.passBoth();
    expect(story(g, 'p1')).toBe(true);
    expect(storyEvents(g)).toEqual([{ type: 'enduringStory', player: 'p1' }]);
    expect(story(g, 'p2')).toBe(false);
  });

  it('without a Storied permanent three artifacts earn nothing, and casting one later does not count them back', () => {
    // Three artifacts, then two leave, then a Storied legend arrives: that is two permanents of the kinds, not three.
    const g = new Game(
      scenario({
        p1: { hand: ['h-fili'], battlefield: ['h-relic', 'plains', 'plains', 'plains', 'plains'] },
      }),
    );
    castFirst(g, 'p1', 'h-fili');
    g.passBoth();
    expect(g.zoneOf(g.id('p1', 'h-fili'))).toBe('battlefield');
    expect(story(g, 'p1')).toBe(false);
    // Three artifacts and nothing Storied: nothing.
    const lonely = new Game(scenario({ p1: { battlefield: ['h-relic', 'h-relic-2', 'h-saga'] } }));
    lonely.passBoth();
    expect(story(lonely, 'p1')).toBe(false);
  });

  it('a Storied permanent that is not itself legendary: needs three others (ruling: three, not Storied plus two)', () => {
    // A Storied permanent that counts for nothing: the rule is three permanents of the kinds, wherever the Storied one is.
    const g = new Game(scenario({ p1: { battlefield: ['h-ori', 'h-relic', 'h-relic-2'] } }));
    g.passBoth();
    expect(story(g, 'p1')).toBe(true);
  });

  it('one permanent counts once: a legendary artifact creature is one of the three, not two', () => {
    const g = new Game(scenario({ p1: { battlefield: ['h-ori', 'h-legend-artifact'] } }));
    g.passBoth();
    expect(story(g, 'p1')).toBe(false);
    const g2 = new Game(
      scenario({ p1: { battlefield: ['h-ori', 'h-legend-artifact', 'h-saga'] } }),
    );
    g2.passBoth();
    expect(story(g2, 'p1')).toBe(true);
  });

  it('is gained the moment the third permanent is there, before it leaves to the legend rule or toughness 0', () => {
    const g = new Game(
      scenario({
        p1: { hand: ['h-doomed-legend'], battlefield: ['h-ori', 'h-relic', 'plains'] },
      }),
    );
    castFirst(g, 'p1', 'h-doomed-legend');
    g.passBoth();
    // The 1/0 legend is gone (state-based action) but the story stays.
    expect(g.zoneOf(g.id('p1', 'h-doomed-legend', 'graveyard'))).toBe('graveyard');
    expect(story(g, 'p1')).toBe(true);
  });

  it('is for the rest of the game: losing the permanents (and the Storied one) removes nothing', () => {
    const g = new Game(
      scenario({
        p1: { hand: ['shock'], battlefield: ['h-ori', 'h-relic', 'h-relic-2', 'mountain'] },
      }),
    );
    g.passBoth();
    expect(story(g, 'p1')).toBe(true);
    // Ori and a relic leave (one by one, state-based actions in between).
    for (const id of [g.id('p1', 'h-ori'), g.id('p1', 'h-relic')]) {
      g.state.battlefield.splice(g.state.battlefield.indexOf(id), 1);
      g.state.objects[id]!.zone = 'graveyard';
      g.pass();
    }
    expect(story(g, 'p1')).toBe(true);
  });

  it('is on the player: the opponent controlling the permanents gives it to them, not to you', () => {
    const g = new Game(
      scenario({
        p1: { battlefield: ['h-relic'] },
        p2: { battlefield: ['h-ori', 'h-relic', 'h-relic-2'] },
      }),
    );
    g.passBoth();
    expect(story(g, 'p2')).toBe(true);
    expect(story(g, 'p1')).toBe(false);
  });
});

describe('Storied: "as long as you have an enduring story"', () => {
  it('a creature gets +P/+T and a keyword (Ori: +1/+0 and vigilance)', () => {
    const g = new Game(scenario({ p1: { battlefield: ['h-ori', 'h-relic'] } }));
    const ori = g.id('p1', 'h-ori');
    expect(getPower(g, ori)).toBe(2);
    expect(keywords(g, ori)).not.toContain('vigilance');
    g.state.players.p1.enduringStory = true;
    expect(getPower(g, ori)).toBe(3);
    expect(keywords(g, ori)).toContain('vigilance');
  });

  it('it also applies as soon as the situation exists, before the designation is recorded', () => {
    const g = new Game(scenario({ p1: { battlefield: ['h-ori', 'h-relic', 'h-relic-2'] } }));
    expect(getPower(g, g.id('p1', 'h-ori'))).toBe(3);
  });

  it('an anthem with the condition (Fíli: creatures you control get +1/+1)', () => {
    const g = new Game(
      scenario({
        p1: { battlefield: ['h-fili', 'bear', 'h-relic', 'h-relic-2'] },
        p2: { battlefield: ['ogre'] },
      }),
    );
    g.passBoth();
    expect(getPower(g, g.id('p1', 'bear'))).toBe(3);
    expect(getPower(g, g.id('p1', 'h-fili'))).toBe(4);
    // Only yours.
    expect(getPower(g, g.id('p2', 'ogre'))).toBe(3);
  });

  it('is not had without it: the same cards, no story', () => {
    const g = new Game(scenario({ p1: { battlefield: ['h-fili', 'bear'] } }));
    expect(getPower(g, g.id('p1', 'bear'))).toBe(2);
  });

  it('"if you have an enduring story" in an effect (Balin\'s damage) reads the player\'s story', () => {
    const withStory = new Game(
      scenario({
        p1: {
          hand: ['h-balin'],
          battlefield: [
            'h-relic',
            'h-relic-2',
            'mountain',
            'mountain',
            'mountain',
            'mountain',
            'mountain',
          ],
        },
        p2: {},
      }),
    );
    castFirst(withStory, 'p1', 'h-balin');
    settle(withStory);
    expect(withStory.life('p2')).toBe(17);
    const without = new Game(
      scenario({
        p1: {
          hand: ['h-balin'],
          battlefield: ['mountain', 'mountain', 'mountain', 'mountain', 'mountain'],
        },
        p2: {},
      }),
    );
    castFirst(without, 'p1', 'h-balin');
    settle(without);
    expect(without.life('p2')).toBe(20);
    expect(without.state.players.p1.hand).toHaveLength(1);
  });
});

describe('Storied: static abilities that read the story', () => {
  it('granted ward {1} for artifacts and creatures (Thorin Oakenshield)', () => {
    const wards = (g: Game, id: string) => [...getCharacteristics(g.state, DB, id).keywords];
    const g = new Game(
      scenario({
        p1: { battlefield: ['h-thorin', 'h-relic', 'h-relic-2', 'bear'] },
        p2: { battlefield: ['ogre'] },
      }),
    );
    expect(wards(g, g.id('p1', 'bear'))).toContain('wardOne');
    expect(wards(g, g.id('p1', 'h-relic'))).toContain('wardOne');
    expect(wards(g, g.id('p2', 'ogre'))).not.toContain('wardOne');
    const noStory = new Game(scenario({ p1: { battlefield: ['h-thorin', 'bear'] } }));
    expect(wards(noStory, noStory.id('p1', 'bear'))).not.toContain('wardOne');
  });

  it("attack tax (Dáin): creatures can't attack you unless their controller pays {1} for each", () => {
    const attackers = (g: Game) => {
      g.passBoth(); // to declare attackers
      return g
        .legal('p2')
        .filter((a) => a.type === 'addAttacker' && a.attacker === g.id('p2', 'ogre'));
    };
    const mk = (mine: string[]) =>
      new Game(
        scenario({
          active: 'p2',
          step: 'beginCombat',
          p1: { battlefield: mine },
          p2: { battlefield: ['ogre'] },
        }),
      );
    const taxed = mk(['h-dain', 'h-relic', 'h-relic-2']);
    expect(attackers(taxed)).toHaveLength(0);
    const free = mk(['h-dain']);
    expect(attackers(free)).toHaveLength(1);
    // With mana to pay it, the attack is allowed.
    const paid = new Game(
      scenario({
        active: 'p2',
        step: 'beginCombat',
        p1: { battlefield: ['h-dain', 'h-relic', 'h-relic-2'] },
        p2: { battlefield: ['ogre', 'plains'] },
      }),
    );
    expect(attackers(paid)).toHaveLength(1);
  });

  it("doesn't untap unless (Bombur): stays tapped without the story, untaps with it", () => {
    const stays = new Game(
      scenario({ p1: { battlefield: [{ card: 'h-bombur', tapped: true }] }, p2: {} }),
    );
    // The opponent's turn passes, then ours: run to our next turn.
    for (
      let i = 0;
      i < 80 &&
      !(
        stays.state.turn.number > 3 &&
        stays.state.turn.activePlayer === 'p1' &&
        stays.state.turn.step === 'upkeep'
      );
      i++
    )
      stays.passBoth();
    expect(stays.obj(stays.id('p1', 'h-bombur')).tapped).toBe(true);

    const untaps = new Game(
      scenario({
        p1: { battlefield: [{ card: 'h-bombur', tapped: true }, 'h-relic', 'h-relic-2'] },
        p2: {},
      }),
    );
    for (
      let i = 0;
      i < 80 &&
      !(
        untaps.state.turn.number > 3 &&
        untaps.state.turn.activePlayer === 'p1' &&
        untaps.state.turn.step === 'upkeep'
      );
      i++
    )
      untaps.passBoth();
    expect(untaps.obj(untaps.id('p1', 'h-bombur')).tapped).toBe(false);
  });

  it("a Dwarf's triggered abilities trigger an additional time (Bifur): with the story only, for Dwarves only", () => {
    const run = (battlefield: string[]) => {
      const g = new Game(
        scenario({
          p1: {
            hand: ['h-dwarf-drawer'],
            battlefield: ['plains', 'plains', ...battlefield],
            library: ['forest', 'forest', 'forest', 'forest'],
          },
          p2: {},
        }),
      );
      castFirst(g, 'p1', 'h-dwarf-drawer');
      settle(g);
      return g.events.filter((e) => e.type === 'cardDrawn').length;
    };
    // No story: once.
    expect(run(['h-bifur'])).toBe(1);
    // The story (Bifur is legendary; two more): twice.
    expect(run(['h-bifur', 'h-relic', 'h-relic-2'])).toBe(2);
    // No Bifur but a story from another Storied permanent: once.
    expect(run(['h-ori', 'h-relic', 'h-relic-2'])).toBe(1);
  });
});
