import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { applySavedUiScale } from './components/UiSize.tsx';
import { initSound } from './game/sound.ts';
import './styles.css';

applySavedUiScale();
initSound();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <div className="rotate-hint">Turn your device sideways to play</div>
  </StrictMode>,
);
