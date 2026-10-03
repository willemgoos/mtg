import { cardDb, scryfallById } from '@mtg/cards';
import {
  type CardDefId,
  type GameState,
  getCharacteristics,
  type Keyword,
  type ObjectId,
} from '@mtg/engine';

/** An info box shown beside the hover preview (Arena-style keyword and status tooltips). */
export interface CardNote {
  title: string;
  text: string;
  kind: 'keyword' | 'mechanic' | 'effect' | 'status';
}

const KEYWORDS: Record<Keyword, { name: string; text: string }> = {
  flying: { name: 'Flying', text: "Can't be blocked except by creatures with flying or reach." },
  reach: { name: 'Reach', text: 'Can block creatures with flying.' },
  trample: {
    name: 'Trample',
    text: 'Can deal excess combat damage to the player or planeswalker it’s attacking.',
  },
  haste: {
    name: 'Haste',
    text: 'Can attack and use tap abilities as soon as it comes under your control.',
  },
  firstStrike: {
    name: 'First strike',
    text: 'Deals combat damage before creatures without first strike.',
  },
  doubleStrike: {
    name: 'Double strike',
    text: 'Deals both first-strike and regular combat damage.',
  },
  vigilance: { name: 'Vigilance', text: 'Attacking doesn’t cause this creature to tap.' },
  deathtouch: {
    name: 'Deathtouch',
    text: 'Any amount of damage this deals to a creature is enough to destroy it.',
  },
  lifelink: {
    name: 'Lifelink',
    text: 'Damage dealt by this also causes you to gain that much life.',
  },
  menace: { name: 'Menace', text: 'Can’t be blocked except by two or more creatures.' },
  hexproof: {
    name: 'Hexproof',
    text: 'Can’t be the target of spells or abilities your opponents control.',
  },
  defender: { name: 'Defender', text: 'This creature can’t attack.' },
  flash: { name: 'Flash', text: 'You may cast this spell any time you could cast an instant.' },
  indestructible: {
    name: 'Indestructible',
    text: 'Damage and effects that say “destroy” don’t destroy this.',
  },
  hexproofFromInstants: {
    name: 'Hexproof from instants',
    text: 'This can’t be the target of instants your opponents control.',
  },
  hexproofFromWhite: {
    name: 'Hexproof from white',
    text: 'This can’t be the target of white spells or abilities your opponents control.',
  },
  ward: {
    name: 'Ward {2}',
    text: 'Whenever this becomes the target of a spell or ability an opponent controls, counter it unless that player pays {2}.',
  },
  changeling: {
    name: 'Changeling',
    text: 'This is every creature type.',
  },
  wardOne: {
    name: 'Ward {1}',
    text: 'Whenever this becomes the target of a spell or ability an opponent controls, counter it unless that player pays {1}.',
  },
  shroud: {
    name: 'Shroud',
    text: 'This can’t be the target of spells or abilities.',
  },
};

const MECHANICS: Record<string, string> = {
  Prowess: 'Whenever you cast a noncreature spell, this creature gets +1/+1 until end of turn.',
  Landfall: 'Triggers whenever a land you control enters.',
  Raid: 'Checks whether you attacked with a creature this turn.',
  Fight: 'Each creature deals damage equal to its power to the other.',
  Scry: 'Look at the top cards of your library. Put any of them on the bottom and the rest on top in any order.',
  Kicker: 'You may pay an additional cost as you cast this spell for a bigger effect.',
  Flashback: 'You may cast this card from your graveyard for its flashback cost. Then exile it.',
  Equip: 'Attach to target creature you control. Equip only as a sorcery.',
  Treasure: 'A Treasure is an artifact with “{T}, Sacrifice this: Add one mana of any color.”',
  Food: 'A Food is an artifact with “{2}, {T}, Sacrifice this: You gain 3 life.”',
  Surveil:
    'Look at the top cards of your library. Put any of them into your graveyard and the rest on top in any order.',
  Enchant:
    'This Aura is attached to what it enchants. If that leaves, the Aura goes to the graveyard.',
  Morbid: 'Checks whether a creature died this turn.',
  Affinity: 'This spell costs {1} less to cast for each of the named permanents you control.',
};

const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

/**
 * Keyword and mechanic notes for a card: the keywords it has (printed ones by
 * default), keywords its text mentions, and named mechanics.
 */
export function ruleNotes(
  defId: CardDefId,
  keywords: Iterable<Keyword> = cardDb.get(defId)?.keywords ?? [],
): CardNote[] {
  const sc = scryfallById.get(defId);
  const has = new Set(keywords);
  const text = (sc?.oracleText ?? '').replace(/\([^)]*\)/g, '');
  for (const [k, info] of Object.entries(KEYWORDS) as [Keyword, (typeof KEYWORDS)[Keyword]][]) {
    if (new RegExp(`\\b${info.name}\\b`, 'i').test(text)) has.add(k);
  }
  const notes: CardNote[] = [];
  for (const k of Object.keys(KEYWORDS) as Keyword[]) {
    if (has.has(k))
      notes.push({ kind: 'keyword', title: KEYWORDS[k].name, text: KEYWORDS[k].text });
  }
  for (const m of sc?.keywords ?? []) {
    const t = MECHANICS[m];
    if (t) notes.push({ kind: 'mechanic', title: m, text: t });
  }
  return notes;
}

/**
 * Notes for a card: keywords it has or mentions, mechanics, and, for a
 * permanent on the battlefield, what is currently modifying it.
 */
export function cardNotes(view: GameState, defId: CardDefId, oid?: ObjectId | null): CardNote[] {
  const def = cardDb.get(defId);
  if (!def) return [];
  const o = oid ? view.objects[oid] : undefined;
  const onBattlefield = o?.zone === 'battlefield';
  const c = onBattlefield ? getCharacteristics(view, cardDb, o.id) : null;
  // Keywords: what it has now (including granted ones).
  const notes = ruleNotes(defId, c ? c.keywords : def.keywords);
  if (!o || !onBattlefield || !c) return notes;

  // What is changing this permanent right now.
  const eot = view.effects.filter((e) => e.affected.id === o.id && e.affected.zcc === o.zcc);
  const eotP = eot.reduce((n, e) => n + e.power, 0);
  const eotT = eot.reduce((n, e) => n + e.toughness, 0);
  const eotK = [...new Set(eot.flatMap((e) => e.keywords))].map((k) =>
    KEYWORDS[k].name.toLowerCase(),
  );
  if (eotP || eotT || eotK.length) {
    const parts = [
      ...(eotP || eotT ? [`${signed(eotP)}/${signed(eotT)}`] : []),
      ...(eotK.length ? [`gains ${eotK.join(', ')}`] : []),
    ];
    notes.push({ kind: 'effect', title: 'Until end of turn', text: parts.join(' and ') + '.' });
  }
  if (o.plusOneCounters) {
    const n = o.plusOneCounters;
    notes.push({
      kind: 'effect',
      title: 'Counters',
      text: `${n} +1/+1 counter${n > 1 ? 's' : ''} (${signed(n)}/${signed(n)}).`,
    });
  }
  if (def.types.includes('Creature')) {
    const staticP = c.power - (def.power ?? 0) - o.plusOneCounters - eotP;
    const staticT = c.toughness - (def.toughness ?? 0) - o.plusOneCounters - eotT;
    if (staticP || staticT) {
      notes.push({
        kind: 'effect',
        title: 'Continuous effect',
        text: `${signed(staticP)}/${signed(staticT)} from another permanent’s ability.`,
      });
    }
    if (o.damage > 0) {
      notes.push({
        kind: 'status',
        title: 'Damaged',
        text: `${o.damage} damage marked. It's removed at end of turn.`,
      });
    }
    if (o.summoningSick && !c.keywords.has('haste')) {
      notes.push({
        kind: 'status',
        title: 'Summoning sickness',
        text: 'Can’t attack or use tap abilities until its controller’s next turn.',
      });
    }
  }
  return notes;
}
