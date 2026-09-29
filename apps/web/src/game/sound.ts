import { cardDb } from '@mtg/cards';
import type { GameEvent, PlayerId } from '@mtg/engine';

// Samples live in public/sounds as `<name>-<n>.ogg` (Kenney, CC0). Each play
// picks a random variant so repeated sounds don't feel mechanical.
const SAMPLES = {
  slide: { n: 8, vol: 0.5 },
  place: { n: 4, vol: 0.8 },
  shove: { n: 4, vol: 0.7 },
  fan: { n: 2, vol: 0.6 },
  shuffle: { n: 1, vol: 0.6 },
  attack: { n: 3, vol: 0.55 },
  block: { n: 5, vol: 0.6 },
  hit: { n: 5, vol: 0.6 },
  hitPlayer: { n: 5, vol: 0.75 },
  die: { n: 5, vol: 0.8 },
  chime: { n: 6, vol: 0.35 },
  pluck: { n: 2, vol: 0.45 },
  tick: { n: 3, vol: 0.4 },
  gain: { n: 2, vol: 0.5 },
  fizzle: { n: 2, vol: 0.4 },
  turn: { n: 1, vol: 0.45 },
  flip: { n: 3, vol: 0.5 },
  win: { n: 4, vol: 0.6 },
  lose: { n: 3, vol: 0.6 },
} as const;

export type SoundName = keyof typeof SAMPLES;

const KEY = 'mtg.sound';

export interface SoundPrefs {
  volume: number; // 0..1
  muted: boolean;
}

export function loadSoundPrefs(): SoundPrefs {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? '') as Partial<SoundPrefs>;
    const volume = typeof p.volume === 'number' ? Math.min(1, Math.max(0, p.volume)) : 0.7;
    return { volume, muted: p.muted === true };
  } catch {
    return { volume: 0.7, muted: false };
  }
}

let prefs = loadSoundPrefs();
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
const buffers = new Map<string, Promise<AudioBuffer | null>>();

function applyGain() {
  if (master) master.gain.value = prefs.muted ? 0 : prefs.volume;
}

export function setSoundPrefs(p: SoundPrefs): void {
  prefs = p;
  applyGain();
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // Storage can be unavailable (private mode); the setting still applies for this session.
  }
}

/**
 * Browsers only allow audio after a user gesture, so the context is created on
 * the first click or key press, and every sample is fetched then.
 */
export function initSound(): void {
  const unlock = () => {
    if (!ctx) {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.connect(ctx.destination);
      applyGain();
      for (const [name, s] of Object.entries(SAMPLES))
        for (let i = 1; i <= s.n; i++) load(`${name}-${i}`);
    }
    if (ctx.state === 'suspended') void ctx.resume();
  };
  window.addEventListener('pointerdown', unlock, { capture: true });
  window.addEventListener('keydown', unlock, { capture: true });
}

function load(file: string): Promise<AudioBuffer | null> {
  let b = buffers.get(file);
  if (!b) {
    b = fetch(`${import.meta.env.BASE_URL}sounds/${file}.ogg`)
      .then((r) => r.arrayBuffer())
      .then((data) => ctx!.decodeAudioData(data))
      .catch(() => null);
    buffers.set(file, b);
  }
  return b;
}

export function play(name: SoundName, opts: { gain?: number; delay?: number } = {}): void {
  if (!ctx || !master || prefs.muted || prefs.volume === 0) return;
  const s = SAMPLES[name];
  const file = `${name}-${1 + Math.floor(Math.random() * s.n)}`;
  const c = ctx;
  const out = master;
  void load(file).then((buf) => {
    if (!buf) return;
    const src = c.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = 0.95 + Math.random() * 0.1;
    const g = c.createGain();
    g.gain.value = s.vol * (opts.gain ?? 1);
    src.connect(g).connect(out);
    src.start(c.currentTime + (opts.delay ?? 0));
  });
}

// ---------------------------------------------------------------------------
// Hovering cards: a soft card slide, quieter on the battlefield than in hand
// ---------------------------------------------------------------------------

let lastHover = 0;

export function playHover(anchor: Element | null | undefined): void {
  const now = performance.now();
  if (now - lastHover < 60) return;
  lastHover = now;
  const inHand = !!anchor?.closest('.hand');
  play('slide', { gain: inHand ? 0.35 : 0.18 });
}

// ---------------------------------------------------------------------------
// Game events -> sounds
// ---------------------------------------------------------------------------

export interface SoundCue {
  name: SoundName;
  gain?: number;
}

const isCreature = (defId: string) => cardDb.get(defId)?.types.includes('Creature') ?? false;

/** The sounds one batch of engine events should make, at most once each, in order. */
export function soundsFor(events: GameEvent[], me: PlayerId): SoundCue[] {
  const cues: SoundCue[] = [];
  const add = (name: SoundName, gain?: number) => {
    if (!cues.some((c) => c.name === name)) cues.push({ name, gain });
  };
  const toBattlefield = new Set<string>();
  const spellsDone = new Set<string>();
  for (const e of events) {
    if (e.type !== 'objectMoved') continue;
    if (e.to === 'battlefield') toBattlefield.add(e.id);
    else if (e.from === 'stack') spellsDone.add(e.id);
  }

  for (const e of events) {
    switch (e.type) {
      case 'objectMoved':
        if (e.to === 'battlefield') add('place');
        else if (e.from === 'battlefield' && e.to === 'graveyard' && isCreature(e.defId))
          add('die');
        else if (e.from === 'hand' && e.to !== 'stack') add('shove', 0.6); // discard
        break;
      case 'cardDrawn':
        add('slide', e.player === me ? 1 : 0.5);
        break;
      case 'spellCast':
        add('shove');
        break;
      case 'abilityActivated':
        add('pluck');
        break;
      case 'triggerStacked':
        add('tick');
        break;
      case 'resolved':
        // Permanents make their sound landing on the battlefield; abilities stay quiet.
        if (spellsDone.has(e.id) && !toBattlefield.has(e.id)) add('chime');
        break;
      case 'fizzled':
        add('fizzle');
        break;
      case 'attackersDeclared':
        if (e.attackers.length) add('attack');
        break;
      case 'blockersDeclared':
        if (e.blocks.length) add('block');
        break;
      case 'damageDealt':
        add('player' in e.to ? 'hitPlayer' : 'hit');
        break;
      case 'lifeChanged':
        if (e.delta > 0) add('gain');
        break;
      case 'stepChanged':
        if (e.step === 'upkeep' && e.activePlayer === me) add('turn');
        break;
      case 'shuffled':
        add('shuffle');
        break;
      case 'mulligan':
        add('fan');
        break;
      case 'scried':
      case 'searched':
      case 'revealed':
        add('flip');
        break;
      case 'gameOver':
        add(e.winner === me ? 'win' : 'lose');
        break;
    }
  }
  return cues;
}

/** Plays a batch's cues, slightly staggered so they don't smear into one thud. */
export function playEvents(events: GameEvent[], me: PlayerId): void {
  soundsFor(events, me).forEach((c, i) => play(c.name, { gain: c.gain, delay: i * 0.07 }));
}
