import { useState } from 'react';
import { loadSoundPrefs, play, setSoundPrefs, type SoundPrefs } from '../game/sound.ts';

/** Mute toggle and volume slider; saved between sessions. */
export function SoundControl() {
  const [prefs, setPrefs] = useState(loadSoundPrefs);
  const update = (p: SoundPrefs) => {
    setPrefs(p);
    setSoundPrefs(p);
  };
  return (
    <div className="sound-control">
      Sound
      <button
        className={prefs.muted ? '' : 'is-on'}
        aria-pressed={!prefs.muted}
        onClick={() => update({ ...prefs, muted: !prefs.muted })}
      >
        {prefs.muted ? 'Off' : 'On'}
      </button>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={prefs.volume}
        disabled={prefs.muted}
        aria-label="Volume"
        onChange={(e) => update({ ...prefs, volume: Number(e.target.value) })}
        onPointerUp={() => play('place')}
      />
    </div>
  );
}
