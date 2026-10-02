import type {
  AbilityDef,
  CardFilter,
  ConditionDef,
  EffectDef,
  ManaType,
  SpellDef,
  TargetSpec,
} from '@mtg/engine';
import { parseManaCost } from '../build.ts';

/** Shared shapes for the Marvel Super Heroes Commander (Brawl) cards. */

export const COLORS = ['W', 'U', 'B', 'R', 'G'] as const;

/** "{T}: Add {X}." */
export const tapFor = (produces: ManaType, extra: Partial<AbilityDef & { kind: 'mana' }> = {}) =>
  ({ kind: 'mana', cost: { tapSelf: true }, produces, ...extra }) as AbilityDef;

/** "{T}: Add {A} or {B}." (or three colours). */
export const tapForEither = (...colors: ManaType[]): AbilityDef[] => colors.map((c) => tapFor(c));

/** "{T}: Add one mana of any color in your commander's color identity." */
export const commanderMana = (extra: Partial<AbilityDef & { kind: 'mana' }> = {}): AbilityDef[] =>
  COLORS.map((c) => tapFor(c, { colorFrom: 'commander', ...extra }));

/** "Cycling {cost}" ({cost}, discard this card: draw a card). */
export const cycling = (cost: string): AbilityDef => ({
  kind: 'activated',
  cost: { mana: parseManaCost(cost), discardSelf: true },
  fromHand: true,
  targets: [],
  effects: [{ kind: 'draw', who: 'controller', amount: 1 }],
  label: `Cycling ${cost}`,
});

const BASIC_TYPE: Record<string, string> = {
  W: 'Plains',
  U: 'Island',
  B: 'Swamp',
  R: 'Mountain',
  G: 'Forest',
};
const landTypes = (colors: readonly ManaType[]): CardFilter => ({
  types: ['Land'],
  subtypes: colors.map((c) => BASIC_TYPE[c]!),
});

/** Check land: "enters tapped unless you control a Plains or an Island." */
export const unlessYouControlType = (...colors: ManaType[]): ConditionDef => ({
  kind: 'not',
  condition: { kind: 'controlsPermanents', filter: landTypes(colors), min: 1 },
});

/** Battle land: "enters tapped unless you control two or more basic lands." */
export const unlessTwoBasics: ConditionDef = {
  kind: 'not',
  condition: {
    kind: 'controlsPermanents',
    filter: { types: ['Land'], supertypes: ['Basic'] },
    min: 2,
  },
};

/** Fast land: "enters tapped unless you control two or fewer other lands." */
export const unlessTwoOrFewerLands: ConditionDef = {
  kind: 'controlsPermanents',
  filter: { types: ['Land'] },
  min: 3,
};

/** Snarl: "you may reveal a Plains or Island card from your hand. If you don't, it enters tapped." */
export const unlessReveal = (...colors: ManaType[]): ConditionDef => ({
  kind: 'not',
  condition: { kind: 'handHas', filter: landTypes(colors) },
});

/** "Equip {cost}" (or "Equip Hero {cost}": only onto a creature matching the filter). */
export const equip = (cost: string, filter?: CardFilter, label?: string): AbilityDef => ({
  kind: 'activated',
  cost: { mana: parseManaCost(cost) },
  sorcerySpeed: true,
  targets: [{ what: 'creature', controller: 'you', ...(filter ? { filter } : {}) }],
  effects: [{ kind: 'attach', to: { target: 0 } }],
  ...(label ? { label } : {}),
});

/** Every combination of the modes, in printed order ("choose two", "choose one or more"). */
export const combos = (modes: SpellDef[], sizes: number[]): SpellDef[] => {
  const out: SpellDef[] = [];
  for (let mask = 1; mask < 1 << modes.length; mask++) {
    const picked = modes.filter((_, i) => mask & (1 << i));
    if (!sizes.includes(picked.length)) continue;
    const targets: TargetSpec[] = [];
    const effects: EffectDef[] = [];
    for (const m of picked) {
      // Shift each mode's target references past the targets before it.
      const shift = targets.length;
      targets.push(...m.targets);
      effects.push(
        ...m.effects.map((e) =>
          JSON.parse(
            JSON.stringify(e).replace(/"target":(\d+)/g, (_, n) => `"target":${Number(n) + shift}`),
          ),
        ),
      );
    }
    out.push({ label: picked.map((m) => m.label).join(' + '), targets, effects });
  }
  return out;
};
